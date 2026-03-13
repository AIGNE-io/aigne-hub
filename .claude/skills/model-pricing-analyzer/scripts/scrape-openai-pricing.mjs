#!/usr/bin/env node
/**
 * Scrape OpenAI official pricing (Standard tier only) from developers.openai.com
 * Outputs structured JSON to stdout.
 *
 * Usage:
 *   node scrape-openai-pricing.mjs
 *   node scrape-openai-pricing.mjs --pretty
 *   node scrape-openai-pricing.mjs --validate   # compare key prices against known values
 *   node scrape-openai-pricing.mjs --no-llm     # disable LLM fallback, pure regex mode
 *   node scrape-openai-pricing.mjs --unified    # output in OfficialPricingResult format
 *
 * LLM fallback: When regex parsing yields suspicious results (too few entries or
 * missing expected keys), the script automatically falls back to gpt-4o-mini for
 * extraction. Requires OPENAI_API_KEY env var. Use --no-llm to disable.
 */

import { createHash } from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

/** @typedef {import('./pricing-schema').OfficialPricingEntry} OfficialPricingEntry */
/** @typedef {import('./pricing-schema').OfficialPricingResult} OfficialPricingResult */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const UA = 'Mozilla/5.0 (compatible; AIGNE-Hub-Catalog/1.0)';
const PAGE_URL = 'https://developers.openai.com/api/docs/pricing?latest-pricing=standard';
const LLM_CACHE_PATH = path.join(OUTPUT_DIR, 'aigne-openai-llm-cache.json');
const LLM_CACHE_TTL = 3600_000; // 1 hour

// ──────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ──────────────────────────────────────────────────────────────────────────────

function fetch(url) {
  return new Promise((resolve, reject) => {
    const get = (u, remaining) => {
      https
        .get(u, { headers: { 'User-Agent': UA }, timeout: 30000 }, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && remaining > 0) {
            return get(new globalThis.URL(res.headers.location, u).href, remaining - 1);
          }
          if (res.statusCode >= 400) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          res.on('error', reject);
        })
        .on('error', reject);
    };
    get(url, 5);
  });
}

function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new globalThis.URL(url);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': UA,
          ...headers,
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`Invalid JSON response: ${text.slice(0, 200)}`));
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?[\w]+;/g, '')
    .replace(/\s+/g, ' ');
}

/** Strip HTML with aggressive JS removal — produces cleaner text for LLM consumption. */
function stripHtmlClean(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ') // remove <script> blocks
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ') // remove <style> blocks
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ') // remove <noscript>
    .replace(/<!--[\s\S]*?-->/g, ' ') // remove HTML comments
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?[\w]+;/g, '')
    .replace(/\s+/g, ' ');
}

/** Find earliest index from candidates that is > start, or fallback. */
function findSectionEnd(text, start, candidates, fallbackLen = 3000) {
  let best = -1;
  for (const c of candidates) {
    const idx = text.indexOf(c, start + 20);
    if (idx > start && (best === -1 || idx < best)) best = idx;
  }
  return best > start ? best : start + fallbackLen;
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM fallback — failure detection & section extraction
// ──────────────────────────────────────────────────────────────────────────────

const SECTION_EXPECTATIONS = {
  text: { minEntries: 30, requiredKeys: ['gpt-4.1', 'gpt-4o', 'o3'] },
  image: { minEntries: 2, requiredKeys: ['gpt-image-1.5'] },
  audio: { minEntries: 2, requiredKeys: ['gpt-realtime'] },
  video: { minEntries: 1, requiredKeys: ['sora-2'] },
  transcription: { minEntries: 3, requiredKeys: ['whisper'] },
  fineTuning: { minEntries: 3, requiredKeys: [] },
  imageGeneration: { minEntries: 3, requiredKeys: ['gpt-image-1.5'] },
  embedding: { minEntries: 2, requiredKeys: ['text-embedding-3-small'] },
  builtInTools: { minEntries: 3, requiredKeys: ['web-search'] },
  legacy: { minEntries: 5, requiredKeys: ['gpt-4-0613'] },
};

function isSuspicious(sectionName, result) {
  const expect = SECTION_EXPECTATIONS[sectionName];
  if (!expect) return false;

  const keys = Object.keys(result || {});
  if (keys.length === 0) return true;
  if (keys.length < expect.minEntries) return true;
  for (const k of expect.requiredKeys) {
    if (!keys.includes(k)) return true;
  }
  return false;
}

const SECTION_ANCHORS = {
  text: { start: 'Text tokens Prices per 1M tokens', end: ['Image tokens'] },
  image: { start: 'Image tokens Prices per 1M tokens', end: ['Audio tokens'] },
  audio: { start: 'Audio tokens Prices per 1M tokens', end: ['Video Prices per second', 'Fine-tuning'] },
  video: { start: 'Video Prices per second', end: ['Fine-tuning'] },
  transcription: { start: 'Transcription and speech generation', end: ['Image generation', 'Embeddings'] },
  fineTuning: { start: 'Fine-tuning Prices per 1M tokens', end: ['Built-in tools'] },
  imageGeneration: { start: 'Image generation Prices per image', end: ['Embeddings Prices per 1M tokens'] },
  embedding: { start: 'Embeddings Prices per 1M tokens', end: ['Built-in tools', 'Legacy models'] },
  builtInTools: { start: 'Built-in tools', end: ['Transcription', 'Legacy models', 'Data residency'] },
  legacy: { start: 'Legacy models Prices per 1M tokens', end: ['Data residency', 'AgentKit'] },
};

/**
 * Extract section text for LLM consumption.
 * Uses cleanText (script-stripped) if available, falls back to raw stripped text.
 */
let _cleanText = null;
function setCleanText(ct) {
  _cleanText = ct;
}

function extractSectionText(text, sectionName) {
  const anchors = SECTION_ANCHORS[sectionName];
  if (!anchors) return '';
  // Prefer clean text (no JS noise) for LLM; fall back to regex-stripped text
  const source = _cleanText || text;
  const startIdx = source.indexOf(anchors.start);
  if (startIdx === -1) {
    // Try original text if clean text doesn't have the anchor
    const fallbackIdx = text.indexOf(anchors.start);
    if (fallbackIdx === -1) return '';
    const endIdx = findSectionEnd(text, fallbackIdx, anchors.end, 5000);
    return text.substring(fallbackIdx, endIdx);
  }
  const endIdx = findSectionEnd(source, startIdx, anchors.end, 5000);
  return source.substring(startIdx, endIdx);
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM fallback — prompt templates & extraction
// ──────────────────────────────────────────────────────────────────────────────

const SECTION_PROMPTS = {
  text: {
    schema: '{ "model-id": { "input": number, "cachedInput": number|null, "output": number } }',
    example:
      '{ "gpt-4.1": { "input": 2, "cachedInput": 0.5, "output": 8 }, "gpt-4o-mini": { "input": 0.15, "cachedInput": 0.075, "output": 0.6 } }',
    instructions:
      'Extract ALL text token models with input/cachedInput/output prices in $/MTok. If a model has context tiers (e.g. <272K / >272K), include only the base tier as the main entry. Omit "Batch" tier entries.',
  },
  image: {
    schema: '{ "model-id": { "input": number, "cachedInput": number|null, "output": number|null } }',
    example: '{ "gpt-image-1.5": { "input": 8, "cachedInput": 2, "output": 32 } }',
    instructions: 'Extract image token models. Prices are in $/MTok. Only "Standard" tier.',
  },
  audio: {
    schema: '{ "model-id": { "input": number, "cachedInput": number|null, "output": number|null } }',
    example: '{ "gpt-realtime": { "input": 32, "cachedInput": 2.4, "output": 160 } }',
    instructions: 'Extract audio token models. Prices are in $/MTok. Only "Standard" tier.',
  },
  video: {
    schema: '{ "model-id": { "perSecond": number, "resolution": "WxH / WxH" } }',
    example: '{ "sora-2": { "perSecond": 0.1, "resolution": "480x848 / 848x480" } }',
    instructions:
      'Extract video models with per-second pricing. Resolution format: "Portrait / Landscape". If multiple resolution tiers, use resolutionTiers object.',
  },
  transcription: {
    schema:
      '{ "model-id": { "text"?: { "input": number, "output"?: number }, "audio"?: { "input"?: number, "output"?: number }, "estimatedPerMinute"?: number, "perMinute"?: number, "perMillionChars"?: number } }',
    example:
      '{ "whisper": { "perMinute": 0.006 }, "tts": { "perMillionChars": 15 }, "gpt-4o-transcribe": { "text": { "input": 2.5, "output": 10 }, "estimatedPerMinute": 0.006 } }',
    instructions:
      'Extract transcription & speech models. Include text token sub-table, audio token sub-table, and "Other" section (Whisper per-minute, TTS per-million-chars). Models with both text and audio pricing should have both sub-objects.',
  },
  fineTuning: {
    schema:
      '{ "model-id": { "trainingPerMTok"?: number, "trainingPerHour"?: number, "input": number, "cachedInput"?: number, "output": number } }',
    example: '{ "gpt-4.1-2025-04-14": { "trainingPerMTok": 25, "input": 4, "cachedInput": 1, "output": 16 } }',
    instructions:
      'Extract fine-tuning models from "Standard" tier only. Some have training price per MTok, some per hour. Models with "with data sharing" suffix should use "-data-sharing" in the ID.',
  },
  imageGeneration: {
    schema: '{ "model-id": { "variants": [{ "quality": string, "size": string, "perImage": number }] } }',
    example: '{ "gpt-image-1.5": { "variants": [{ "quality": "low", "size": "1024x1024", "perImage": 0.009 }] } }',
    instructions:
      'Extract image generation per-image pricing. Each model has quality levels (low/medium/high or standard/hd) and sizes. Normalize model names: "GPT Image 1.5" → "gpt-image-1.5", "DALL·E 3" → "dall-e-3", etc.',
  },
  embedding: {
    schema: '{ "model-id": { "input": number } }',
    example: '{ "text-embedding-3-small": { "input": 0.02 }, "text-embedding-3-large": { "input": 0.13 } }',
    instructions: 'Extract embedding model prices in $/MTok.',
  },
  builtInTools: {
    schema: '{ "tool-id": { ...pricing fields } }',
    example:
      '{ "web-search": { "per1kCalls": 10, "note": "+ content tokens at model input rate" }, "file-search-storage": { "perGBPerDay": 0.1, "freeGB": 1 } }',
    instructions:
      'Extract built-in tool pricing. Tools include: code interpreter containers (per20min by GB tier), file search (storage per GB-day + per 1k calls), web search variants (per 1k calls). Use IDs like "container-1gb", "file-search-storage", "file-search-call", "web-search", "web-search-reasoning-preview", "web-search-non-reasoning-preview".',
  },
  legacy: {
    schema: '{ "model-id": { "input": number, "output": number } }',
    example: '{ "gpt-4-0613": { "input": 30, "output": 60 }, "gpt-3.5-turbo-0125": { "input": 0.5, "output": 1.5 } }',
    instructions: 'Extract legacy model prices from "Standard" tier. Prices in $/MTok. No cached input column.',
  },
};

/** Load LLM cache from disk. */
function loadLLMCache() {
  try {
    const raw = fs.readFileSync(LLM_CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Save LLM cache to disk. */
function saveLLMCache(cache) {
  fs.writeFileSync(LLM_CACHE_PATH, JSON.stringify(cache, null, 2));
}

/** Validate LLM result has at least basic expected structure. */
function validateLLMResult(sectionName, result) {
  if (!result || typeof result !== 'object') return false;
  const keys = Object.keys(result);
  if (keys.length === 0) return false;
  // Each value should be an object (not a primitive)
  for (const k of keys) {
    if (typeof result[k] !== 'object' || result[k] === null) return false;
  }
  return true;
}

async function extractViaLLM(sectionName, sectionText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('  [llm] OPENAI_API_KEY not set, skipping LLM fallback');
    return null;
  }
  if (!sectionText || sectionText.length < 20) {
    console.error(`  [llm] Section text too short for ${sectionName}, skipping`);
    return null;
  }

  const prompt = SECTION_PROMPTS[sectionName];
  if (!prompt) {
    console.error(`  [llm] No prompt template for ${sectionName}`);
    return null;
  }

  // Check cache
  const hash = createHash('sha256').update(sectionText).digest('hex').slice(0, 16);
  const cacheKey = `${sectionName}:${hash}`;
  const cache = loadLLMCache();
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < LLM_CACHE_TTL) {
    console.error(`  [llm] Cache hit for ${sectionName}`);
    return cache[cacheKey].data;
  }

  const systemPrompt = [
    'You are a pricing data extractor. Extract structured pricing data from the given text.',
    `Output ONLY valid JSON matching this schema: ${prompt.schema}`,
    `Example output: ${prompt.example}`,
    prompt.instructions,
    'All prices must be numbers (not strings). Use null for missing values.',
    'Do NOT include any text outside the JSON object.',
  ].join('\n');

  try {
    console.error(`  [llm] Calling gpt-4o-mini for ${sectionName} (${sectionText.length} chars)...`);
    const resp = await postJSON(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sectionText },
        ],
      },
      { Authorization: `Bearer ${apiKey}` }
    );

    const content = resp.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`  [llm] Empty response for ${sectionName}`);
      return null;
    }

    const parsed = JSON.parse(content);
    if (!validateLLMResult(sectionName, parsed)) {
      console.error(`  [llm] Invalid structure for ${sectionName}`);
      return null;
    }

    // Save to cache
    cache[cacheKey] = { ts: Date.now(), data: parsed };
    saveLLMCache(cache);
    console.error(`  [llm] Extracted ${Object.keys(parsed).length} entries for ${sectionName}`);
    return parsed;
  } catch (err) {
    console.error(`  [llm] Error for ${sectionName}: ${err.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Text tokens — parsed from Astro island props (structured JSON)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract text token pricing from astro-island props.
 * The page embeds pricing data as serialized Astro component props:
 *   { "tier": [0, "standard"], "rows": [1, [[1, [[0,"model"],[0,input],[0,cached],[0,output]]], ...]] }
 * where [0, val] = scalar, [1, arr] = array.
 */
function parseTextFromAstroIslands(html) {
  const propsRegex = /props="([^"]+)"/g;
  let m;
  while ((m = propsRegex.exec(html)) !== null) {
    const decoded = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    let data;
    try {
      data = JSON.parse(decoded);
    } catch {
      continue;
    }
    // Look for the standard tier island with rows
    if (!data.tier || !data.rows) continue;
    const tier = data.tier[1];
    if (tier !== 'standard') continue;

    const rows = data.rows[1]; // unwrap [1, [...]]
    const entries = [];
    for (const row of rows) {
      if (row[0] !== 1) continue;
      const cells = row[1];
      if (!cells || cells.length < 4) continue;

      const rawName = String(cells[0][1]).trim();
      const input = cells[1][1];
      const cached = cells[2][1];
      const output = cells[3][1];

      // Parse model name and optional context note like "(<272K context length)"
      const nameMatch = rawName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      const id = nameMatch ? nameMatch[1].trim() : rawName;
      const contextNote = nameMatch ? nameMatch[2].trim() : null;

      entries.push({
        id,
        input: typeof input === 'number' ? input : null,
        cachedInput: typeof cached === 'number' ? cached : null,
        output: typeof output === 'number' ? output : null,
        contextNote,
      });
    }
    return entries;
  }
  return [];
}

/**
 * Group context-tiered models (e.g. gpt-5.4 <272K / >272K) into a single entry.
 *
 * Two modes:
 * 1. Explicit >272K rows (from HTML tables) — attach as contextTiers.
 * 2. <272K context note (from Astro islands) — treat as base price and compute
 *    >272K tier using the rule: 2x input, 1.5x output.
 */
function groupContextTiers(entries) {
  const result = {};

  for (const e of entries) {
    if (e.contextNote && e.contextNote.startsWith('>')) {
      // This is a "higher context" tier — attach to existing entry
      const base = e.id;
      if (result[base]) {
        if (!result[base].contextTiers) result[base].contextTiers = {};
        const label = e.contextNote.replace(/\s*context length\s*/i, '').trim();
        result[base].contextTiers[label] = {
          input: e.input,
          ...(e.cachedInput != null ? { cachedInput: e.cachedInput } : {}),
          ...(e.output != null ? { output: e.output } : {}),
        };
      }
      continue;
    }

    const entry = { input: e.input };
    if (e.cachedInput != null) entry.cachedInput = e.cachedInput;
    if (e.output != null) entry.output = e.output;

    // If model has a "<NNK context length" note, compute the higher tier
    if (e.contextNote && /^<\d+K/i.test(e.contextNote)) {
      const threshold = e.contextNote.replace(/\s*context length\s*/i, '').trim();
      const highLabel = threshold.replace('<', '>');
      entry.contextTiers = {};
      const highTier = { input: e.input * 2 };
      if (e.cachedInput != null) highTier.cachedInput = e.cachedInput * 2;
      if (e.output != null) highTier.output = e.output * 1.5;
      entry.contextTiers[highLabel] = highTier;
    }

    result[e.id] = entry;
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// HTML table parsers (for Image/Audio/Video and the 6 new sections)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parse rows from a Standard token-pricing table in stripped HTML.
 * Pattern: `model_name [$input] [$cached|-] [$output|-]`
 * Returns array of { id, input, cachedInput?, output, contextNote? }
 */
function parseStandardSection(text, sectionStart, sectionEnd) {
  const block = text.substring(sectionStart, sectionEnd);
  const models = [];
  const seen = new Set();

  // Pass 1: 3-field (input, cached-or-dash, output-or-dash)
  const regex3 =
    /([\w][\w./-]*(?:-[\w.]+)*)(?:\s+\(([^)]+)\))?\s+\$([\d.]+)\s+(?:\$([\d.]+)|[-/])\s+(?:\$([\d.]+)|[-/])/g;
  let m;
  while ((m = regex3.exec(block)) !== null) {
    const id = m[1];
    if (id.includes('window') || id.includes('function') || id.includes('var')) continue;
    const contextNote = m[2] || null;
    const key = `${id}|${contextNote || ''}`;
    seen.add(key);
    models.push({
      id,
      input: parseFloat(m[3]),
      cachedInput: m[4] ? parseFloat(m[4]) : null,
      output: m[5] ? parseFloat(m[5]) : null,
      contextNote,
    });
  }

  // Pass 2: 2-field (input, output — no cached column)
  const regex2 = /([\w][\w./-]*(?:-[\w.]+)*)(?:\s+\(([^)]+)\))?\s+\$([\d.]+)\s+\$([\d.]+)/g;
  while ((m = regex2.exec(block)) !== null) {
    const id = m[1];
    if (id.includes('window') || id.includes('function') || id.includes('var')) continue;
    const contextNote = m[2] || null;
    const key = `${id}|${contextNote || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    models.push({
      id,
      input: parseFloat(m[3]),
      cachedInput: null,
      output: parseFloat(m[4]),
      contextNote,
    });
  }

  return models;
}

// ─── Image tokens ─────────────────────────────────────────────────────────────

function parseImageTokens(text) {
  const sectionIdx = text.indexOf('Image tokens Prices per 1M tokens');
  if (sectionIdx === -1) return {};
  // Find "Standard" sub-table within image tokens section
  const stdIdx = text.indexOf('Standard', sectionIdx);
  if (stdIdx === -1 || stdIdx > sectionIdx + 2000) return {};
  const endIdx = findSectionEnd(text, stdIdx, ['Audio tokens', 'Video', 'if (!window.__contentSwitcherInit)']);
  const entries = parseStandardSection(text, stdIdx, endIdx);
  return groupContextTiers(entries);
}

// ─── Audio tokens ─────────────────────────────────────────────────────────────

function parseAudioTokens(text) {
  const sectionIdx = text.indexOf('Audio tokens Prices per 1M tokens');
  if (sectionIdx === -1) return {};
  const endIdx = findSectionEnd(text, sectionIdx, ['Video Prices per second', 'Fine-tuning']);
  const entries = parseStandardSection(text, sectionIdx, endIdx);
  return groupContextTiers(entries);
}

// ─── Video ────────────────────────────────────────────────────────────────────

function parseVideo(text) {
  const sectionIdx = text.indexOf('Video Prices per second');
  if (sectionIdx === -1) return {};
  const endIdx = findSectionEnd(text, sectionIdx, ['Fine-tuning'], 1000);
  const fullBlock = text.substring(sectionIdx, endIdx);

  // Only parse the "Standard" sub-table — skip "Batch" to avoid mixing tiers.
  // The stripped text looks like: "Standard Batch Standard Model ... $0.10 ... Batch Model ... $0.05"
  // Find "Batch Model" which marks the start of the Batch table and stop there.
  const batchModelIdx = fullBlock.indexOf('Batch Model');
  const videoBlock = batchModelIdx > 0 ? fullBlock.substring(0, batchModelIdx) : fullBlock;

  // Pattern: model Portrait: WxH Landscape: WxH $price
  const vRegex = /(sora[\w-]+)\s+Portrait:\s*(\d+x\d+)\s+Landscape:\s*(\d+x\d+)\s+\$([\d.]+)/g;
  let vm;
  const result = {};

  while ((vm = vRegex.exec(videoBlock)) !== null) {
    const id = vm[1];
    const portrait = vm[2];
    const landscape = vm[3];
    const price = parseFloat(vm[4]);
    const resolution = `${portrait} / ${landscape}`;

    if (!result[id]) {
      result[id] = { perSecond: price, resolution };
    } else {
      // Additional resolution tier (e.g. sora-2-pro at higher res)
      if (!result[id].resolutionTiers) result[id].resolutionTiers = {};
      result[id].resolutionTiers[resolution] = { perSecond: price };
    }
  }

  return result;
}

// ─── Transcription & Speech ──────────────────────────────────────────────────

function parseTranscription(text) {
  // Find section — anchor varies: "Transcription and speech generation" or similar
  let sectionIdx = text.indexOf('Transcription and speech generation');
  if (sectionIdx === -1) sectionIdx = text.indexOf('Transcription & Speech');
  if (sectionIdx === -1) sectionIdx = text.indexOf('Transcription');
  if (sectionIdx === -1) return {};

  const endIdx = findSectionEnd(text, sectionIdx, ['Image generation', 'Embeddings'], 3000);
  const block = text.substring(sectionIdx, endIdx);

  const result = {};

  // ── Sub-table 1: Text tokens ──
  // Pattern: model $input $output-or-dash $X.XXX / minute
  // gpt-4o-mini-tts has no output (text): $0.60 - $0.015 / minute
  // gpt-4o-transcribe has input + output: $2.50 $10.00 $0.006 / minute
  const textSection = block.indexOf('Text tokens');
  const audioSection = block.indexOf('Audio tokens');
  const otherSection = block.indexOf('Other');

  if (textSection !== -1 && audioSection !== -1) {
    const textBlock = block.substring(textSection, audioSection);
    // Match models with input + optional output + estimated cost/minute
    // gpt-4o-mini-tts: $0.60 - $0.015 / minute  (input only, dash for output)
    // gpt-4o-transcribe: $2.50 $10.00 $0.006 / minute (input + output)
    const re = /(gpt-[\w-]+)\s*\|?\s*\$([\d.]+)\s*\|?\s*(?:\$([\d.]+)|[-])\s*\|?\s*\$([\d.]+)\s*\/\s*minute/g;
    let m;
    while ((m = re.exec(textBlock)) !== null) {
      const id = m[1];
      if (!result[id]) result[id] = {};
      result[id].text = { input: parseFloat(m[2]) };
      if (m[3]) result[id].text.output = parseFloat(m[3]);
      result[id].estimatedPerMinute = parseFloat(m[4]);
    }

    // If regex above missed any model (e.g. gpt-4o-mini-tts with different whitespace),
    // try a more lenient pattern: model $price ... $price / minute
    const reFallback = /(gpt-[\w-]+)\s+\$([\d.]+)\s+(?:\$([\d.]+)\s+)?\$([\d.]+)\s*\/\s*minute/g;
    let mf;
    while ((mf = reFallback.exec(textBlock)) !== null) {
      const id = mf[1];
      if (result[id]) continue; // already matched by primary regex
      result[id] = {};
      // Determine if we have 2 or 3 dollar values before "/ minute"
      if (mf[3]) {
        // 3 values: input, output, perMinute
        result[id].text = { input: parseFloat(mf[2]), output: parseFloat(mf[3]) };
      } else {
        // 2 values: input, perMinute (no output)
        result[id].text = { input: parseFloat(mf[2]) };
      }
      result[id].estimatedPerMinute = parseFloat(mf[4]);
    }
  }

  // ── Sub-table 2: Audio tokens ──
  if (audioSection !== -1) {
    const audioEnd = otherSection > audioSection ? otherSection : audioSection + 1000;
    const audioBlock = block.substring(audioSection, audioEnd);
    // Match: model [- or $input] [- or $output] $cost / minute
    const re = /(gpt-[\w-]+)\s*\|?\s*(?:\$([\d.]+)|[-])\s*\|?\s*(?:\$([\d.]+)|[-])\s*\|?\s*\$([\d.]+)\s*\/\s*minute/g;
    let m;
    while ((m = re.exec(audioBlock)) !== null) {
      const id = m[1];
      if (!result[id]) result[id] = {};
      result[id].audio = {};
      if (m[2]) result[id].audio.input = parseFloat(m[2]);
      if (m[3]) result[id].audio.output = parseFloat(m[3]);
      if (!result[id].estimatedPerMinute) result[id].estimatedPerMinute = parseFloat(m[4]);
    }

    // Fallback for audio tokens: model $price $price / minute (without dash placeholders)
    // When dashes are stripped from HTML, we can't tell input from output by position alone.
    // Use model name heuristic: TTS models produce audio (output), transcribe models consume audio (input).
    const reFallback = /(gpt-[\w-]+)\s+(?:\$([\d.]+)\s+)?\$([\d.]+)\s*\/\s*minute/g;
    let mf;
    while ((mf = reFallback.exec(audioBlock)) !== null) {
      const id = mf[1];
      if (result[id]?.audio) continue; // already matched
      if (!result[id]) result[id] = {};
      result[id].audio = {};
      if (mf[2]) {
        // TTS models have audio output; transcribe models have audio input
        const isTTS = id.includes('tts');
        if (isTTS) {
          result[id].audio.output = parseFloat(mf[2]);
        } else {
          result[id].audio.input = parseFloat(mf[2]);
        }
      }
      if (!result[id].estimatedPerMinute) result[id].estimatedPerMinute = parseFloat(mf[3]);
    }
  }

  // ── Sub-table 3: Other / Legacy models ──
  // Whisper: $0.006 / minute
  // TTS: $15.00 / 1M characters
  // TTS HD: $30.00 / 1M characters
  if (otherSection !== -1) {
    const otherBlock = block.substring(otherSection);
    const whiskerMatch = otherBlock.match(/Whisper[^$]*\$([\d.]+)\s*\/\s*minute/i);
    if (whiskerMatch) {
      result['whisper'] = { perMinute: parseFloat(whiskerMatch[1]) };
    }
    // TTS HD must be matched before TTS to avoid partial match
    const ttsHdMatch = otherBlock.match(/TTS\s+HD[^$]*\$([\d.]+)\s*\/\s*1M\s*char/i);
    if (ttsHdMatch) {
      result['tts-hd'] = { perMillionChars: parseFloat(ttsHdMatch[1]) };
    }
    const ttsMatch = otherBlock.match(/(?<!\w)TTS(?!\s+HD)[^$]*\$([\d.]+)\s*\/\s*1M\s*char/i);
    if (ttsMatch) {
      result['tts'] = { perMillionChars: parseFloat(ttsMatch[1]) };
    }
  }

  return result;
}

// ─── Fine-tuning (Standard tier) ─────────────────────────────────────────────

function parseFineTuning(text) {
  const sectionIdx = text.indexOf('Fine-tuning Prices per 1M tokens');
  if (sectionIdx === -1) return {};

  const endIdx = findSectionEnd(text, sectionIdx, ['Built-in tools'], 5000);
  const fullBlock = text.substring(sectionIdx, endIdx);

  // Find the "Standard" sub-table (skip "Batch" which comes first)
  const stdIdx = fullBlock.lastIndexOf('Standard');
  if (stdIdx === -1) return {};

  const stdBlock = fullBlock.substring(stdIdx);
  const result = {};

  // Pattern: model [$training [/ hour]] $input [$cached|-] $output
  // o4-mini has "$100.00 / hour" training; others have "$25.00" per MTok
  // "with data sharing" suffix on some model names
  const re =
    /([\w][\w./-]+(?:-[\w.]+)*(?:\s+with\s+data\s+sharing)?)\s+\$([\d.]+)\s*(?:\/\s*hour\s+)?\$([\d.]+)\s+(?:\$([\d.]+)|[-])\s+\$([\d.]+)/g;
  let m;
  while ((m = re.exec(stdBlock)) !== null) {
    const rawId = m[1].trim();
    if (rawId.includes('window') || rawId.includes('function')) continue;

    // Normalize "with data sharing" to "-data-sharing" suffix
    const id = rawId.replace(/\s+with\s+data\s+sharing/, '-data-sharing');
    const trainingVal = parseFloat(m[2]);
    const input = parseFloat(m[3]);
    const cached = m[4] ? parseFloat(m[4]) : null;
    const output = parseFloat(m[5]);

    // Detect training unit: if original text has "/ hour", it's per-hour
    const trainingCtx = stdBlock.substring(m.index, m.index + m[0].length);
    const isPerHour = trainingCtx.includes('/ hour');

    const entry = {};
    if (isPerHour) {
      entry.trainingPerHour = trainingVal;
    } else {
      entry.trainingPerMTok = trainingVal;
    }
    entry.input = input;
    if (cached != null) entry.cachedInput = cached;
    entry.output = output;

    result[id] = entry;
  }

  return result;
}

// ─── Image Generation (per-image pricing) ────────────────────────────────────

function parseImageGeneration(text) {
  const sectionIdx = text.indexOf('Image generation Prices per image');
  if (sectionIdx === -1) return {};

  const endIdx = findSectionEnd(text, sectionIdx, ['Embeddings Prices per 1M tokens'], 4000);
  const block = text.substring(sectionIdx, endIdx);

  const result = {};

  // The stripped text has patterns like:
  //   GPT Image 1.5 Low $0.009 $0.013 $0.013  Medium $0.034 ...
  //   DALL E 3 Standard $0.04 $0.08 $0.08  HD $0.08 ...
  //   DALL E 2 Standard $0.016 $0.018 $0.02
  // We need to identify model boundaries, quality levels, and sizes.

  // Define known models in page order with their slug names and expected resolutions.
  // Page order: GPT Image 1.5, GPT Image Latest, GPT Image 1, GPT Image 1 Mini, DALL-E 3, DALL-E 2
  const modelDefs = [
    { search: 'GPT Image 1.5', id: 'gpt-image-1.5', sizes: ['1024x1024', '1024x1536', '1536x1024'] },
    {
      search: 'GPT Image Latest',
      altSearch: 'ChatGPT Image Latest',
      id: 'chatgpt-image-latest',
      sizes: ['1024x1024', '1024x1536', '1536x1024'],
    },
    {
      search: 'GPT Image 1 ',
      id: 'gpt-image-1',
      sizes: ['1024x1024', '1024x1536', '1536x1024'],
      skipIfFollowedBy: 'Mini',
    },
    { search: 'GPT Image 1 Mini', id: 'gpt-image-1-mini', sizes: ['1024x1024', '1024x1536', '1536x1024'] },
    { search: 'DALL', id: 'dall-e-3', sizes: ['1024x1024', '1024x1792', '1792x1024'] },
    { search: 'DALL', id: 'dall-e-2', sizes: ['256x256', '512x512', '1024x1024'] },
  ];

  // Find position of each model in the block sequentially.
  const modelPositions = [];
  let searchFrom = 0;
  for (const def of modelDefs) {
    let pos = searchFrom;
    // Search forward, skipping false positives
    while (true) {
      pos = block.indexOf(def.search, pos);
      if (pos === -1 && def.altSearch) pos = block.indexOf(def.altSearch, searchFrom);
      if (pos === -1) break;
      // Check skipIfFollowedBy (e.g. "GPT Image 1 " should skip "GPT Image 1 Mini")
      if (def.skipIfFollowedBy && block.substring(pos + def.search.length).startsWith(def.skipIfFollowedBy)) {
        pos += def.search.length;
        continue;
      }
      break;
    }
    if (pos === -1) continue;
    modelPositions.push({ ...def, pos });
    searchFrom = pos + def.search.length;
  }

  // Extract per quality row: Quality $p1 $p2 $p3
  const qualityRowRegex = /(Low|Medium|High|Standard|HD)\s+\$([\d.]+)\s+\$([\d.]+)\s+\$([\d.]+)/g;

  for (let i = 0; i < modelPositions.length; i++) {
    const def = modelPositions[i];
    const modelStart = def.pos;
    const modelEnd = i + 1 < modelPositions.length ? modelPositions[i + 1].pos : block.length;

    const modelBlock = block.substring(modelStart, modelEnd);
    const variants = [];

    qualityRowRegex.lastIndex = 0;
    let qm;
    while ((qm = qualityRowRegex.exec(modelBlock)) !== null) {
      const quality = qm[1].toLowerCase();
      const prices = [parseFloat(qm[2]), parseFloat(qm[3]), parseFloat(qm[4])];
      for (let j = 0; j < 3; j++) {
        variants.push({ quality, size: def.sizes[j], perImage: prices[j] });
      }
    }

    if (variants.length > 0) {
      result[def.id] = { variants };
    }
  }

  return result;
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

function parseEmbeddings(text) {
  const sectionIdx = text.indexOf('Embeddings Prices per 1M tokens');
  if (sectionIdx === -1) return {};

  const endIdx = findSectionEnd(text, sectionIdx, ['Built-in tools', 'Legacy models'], 1500);
  const block = text.substring(sectionIdx, endIdx);

  const result = {};

  // Pattern: text-embedding-X $price [$batch_price]
  const re = /(text-embedding[\w-]+)\s+\$([\d.]+)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    result[m[1]] = { input: parseFloat(m[2]) };
  }

  return result;
}

// ─── Built-in Tools ──────────────────────────────────────────────────────────

function parseBuiltInTools(text) {
  // The Built-in tools section uses a different format — not token pricing.
  // Find it reliably after the main pricing sections.
  let sectionIdx = text.indexOf('Built-in tools', text.indexOf('Fine-tuning Prices'));
  if (sectionIdx === -1) sectionIdx = text.indexOf('Built-in tools');
  if (sectionIdx === -1) return {};

  const endIdx = findSectionEnd(text, sectionIdx, ['Transcription', 'Legacy models', 'Data residency'], 3000);
  const block = text.substring(sectionIdx, endIdx);

  const result = {};

  // Container tiers: 1 GB: $0.03, 4 GB: $0.12, 16 GB: $0.48, 64 GB: $1.92
  const containerRegex = /(\d+)\s*GB[^$]*\$([\d.]+)\s*\/\s*(?:container|20\s*min)/g;
  let m;
  while ((m = containerRegex.exec(block)) !== null) {
    const gb = parseInt(m[1]);
    const price = parseFloat(m[2]);
    result[`container-${gb}gb`] = { per20min: price };
  }

  // File search storage: $0.10 / GB per day (1GB free)
  const fsStorageMatch = block.match(/File search storage[^$]*\$([\d.]+)\s*\/\s*GB\s*(?:per\s*)?day/i);
  if (fsStorageMatch) {
    result['file-search-storage'] = { perGBPerDay: parseFloat(fsStorageMatch[1]), freeGB: 1 };
  }

  // File search tool call: $2.50 / 1k calls
  const fsCallMatch = block.match(/File search tool call[^$]*\$([\d.]+)\s*\/\s*1k\s*calls/i);
  if (fsCallMatch) {
    result['file-search-call'] = { per1kCalls: parseFloat(fsCallMatch[1]) };
  }

  // Web search: multiple variants
  // "Web search (all models)" or just "Web search" with footnote: $10.00 / 1k calls
  const webSearchAllMatch = block.match(
    /Web search\s*(?:\(all models\))?\s*(?:\[\d+\])?\s*\|?\s*\$([\d.]+)\s*\/\s*1k\s*calls/i
  );
  if (webSearchAllMatch) {
    result['web-search'] = {
      per1kCalls: parseFloat(webSearchAllMatch[1]),
      note: '+ content tokens at model input rate',
    };
  }

  // Web search preview (reasoning): $10.00 / 1k calls
  const webReasoningMatch = block.match(
    /Web search preview\s*\(reasoning[^)]*\)\s*(?:\[\d+\])?\s*\|?\s*\$([\d.]+)\s*\/\s*1k\s*calls/i
  );
  if (webReasoningMatch) {
    result['web-search-reasoning-preview'] = {
      per1kCalls: parseFloat(webReasoningMatch[1]),
      note: '+ tokens at model rate',
    };
  }

  // Web search preview (non-reasoning): $25.00 / 1k calls
  const webNonReasoningMatch = block.match(
    /Web search preview\s*\(non-reasoning[^)]*\)\s*(?:\[\d+\])?\s*\|?\s*\$([\d.]+)\s*\/\s*1k\s*calls/i
  );
  if (webNonReasoningMatch) {
    result['web-search-non-reasoning-preview'] = {
      per1kCalls: parseFloat(webNonReasoningMatch[1]),
      note: 'search content tokens free',
    };
  }

  return result;
}

// ─── Legacy Models (Standard tier) ───────────────────────────────────────────

function parseLegacy(text) {
  const sectionIdx = text.indexOf('Legacy models Prices per 1M tokens');
  if (sectionIdx === -1) return {};

  const endIdx = findSectionEnd(text, sectionIdx, ['Data residency', 'AgentKit'], 4000);
  const fullBlock = text.substring(sectionIdx, endIdx);

  // Find the "Standard" sub-table (skip "Batch")
  const stdIdx = fullBlock.lastIndexOf('Standard');
  if (stdIdx === -1) return {};

  const stdBlock = fullBlock.substring(stdIdx);
  const result = {};

  // Pattern: model $input $output (no cached column in legacy)
  const re = /([\w][\w./-]*(?:-[\w.]+)*)\s+\$([\d.]+)\s+\$([\d.]+)/g;
  let m;
  while ((m = re.exec(stdBlock)) !== null) {
    const id = m[1];
    if (id.includes('window') || id.includes('function') || id.includes('var')) continue;
    // Skip if this is a "Standard" header false positive
    if (id === 'Standard' || id === 'Batch') continue;
    result[id] = {
      input: parseFloat(m[2]),
      output: parseFloat(m[3]),
    };
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation — compare key prices against known reference values
// ──────────────────────────────────────────────────────────────────────────────

function validate(output) {
  const checks = [
    ['text.gpt-4.1.input', output.text?.['gpt-4.1']?.input, 2],
    ['text.gpt-4.1.output', output.text?.['gpt-4.1']?.output, 8],
    ['text.gpt-4o.input', output.text?.['gpt-4o']?.input, 2.5],
    ['text.gpt-4o-mini.input', output.text?.['gpt-4o-mini']?.input, 0.15],
    ['text.o3.input', output.text?.['o3']?.input, 2],
    ['text.o4-mini.input', output.text?.['o4-mini']?.input, 1.1],
    ['image.gpt-image-1.5.input', output.image?.['gpt-image-1.5']?.input, 8],
    ['audio.gpt-realtime.input', output.audio?.['gpt-realtime']?.input, 32],
    ['video.sora-2.perSecond', output.video?.['sora-2']?.perSecond, 0.1],
    ['video.sora-2-pro.perSecond', output.video?.['sora-2-pro']?.perSecond, 0.3],
    ['transcription.whisper.perMinute', output.transcription?.['whisper']?.perMinute, 0.006],
    ['embedding.text-embedding-3-small.input', output.embedding?.['text-embedding-3-small']?.input, 0.02],
    ['legacy.gpt-4-0613.input', output.legacy?.['gpt-4-0613']?.input, 30],
    ['fineTuning.gpt-4.1-2025-04-14.trainingPerMTok', output.fineTuning?.['gpt-4.1-2025-04-14']?.trainingPerMTok, 25],
  ];

  let pass = 0;
  let fail = 0;
  for (const [path, actual, expected] of checks) {
    if (actual === expected) {
      console.error(`  PASS  ${path} = ${actual}`);
      pass++;
    } else {
      console.error(`  FAIL  ${path} = ${actual} (expected ${expected})`);
      fail++;
    }
  }
  console.error(`\nValidation: ${pass} passed, ${fail} failed`);
  return fail === 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Unified schema conversion
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert native scraper output to OfficialPricingResult format.
 * @param {object} output - The scraper's native output object
 * @returns {OfficialPricingResult}
 */
function toUnified(output) {
  const sourceUrl = output.source;
  const extractionMethods = output._meta?.extractionMethod || {};

  /** @type {OfficialPricingEntry[]} */
  const entries = [];

  /**
   * Create a base entry with common fields.
   * @param {string} modelId
   * @param {string} sectionName - section key for extractionMethod lookup
   * @returns {OfficialPricingEntry}
   */
  function baseEntry(modelId, sectionName) {
    return {
      provider: 'openai',
      modelId,
      sourceUrl,
      extractionMethod: extractionMethods[sectionName],
    };
  }

  // ─── text models → per-token, chatCompletion ──────────────────────────
  if (output.text) {
    for (const [modelId, data] of Object.entries(output.text)) {
      const entry = {
        ...baseEntry(modelId, 'text'),
        modelType: 'chatCompletion',
        pricingUnit: 'per-token',
      };
      if (data.input != null) entry.inputCostPerToken = data.input / 1e6;
      if (data.cachedInput != null) {
        entry.cachedInputCostPerToken = data.cachedInput / 1e6;
        entry.cacheTiers = [{ label: 'cached-input', costPerToken: data.cachedInput / 1e6 }];
      }
      if (data.output != null) entry.outputCostPerToken = data.output / 1e6;

      if (data.contextTiers) {
        entry.contextTiers = Object.entries(data.contextTiers).map(([threshold, tier]) => {
          const ct = { threshold };
          if (tier.input != null) ct.inputCostPerToken = tier.input / 1e6;
          if (tier.cachedInput != null) ct.cachedInputCostPerToken = tier.cachedInput / 1e6;
          if (tier.output != null) ct.outputCostPerToken = tier.output / 1e6;
          return ct;
        });
      }

      entries.push(entry);
    }
  }

  // ─── image token models → per-token, chatCompletion ───────────────────
  if (output.image) {
    for (const [modelId, data] of Object.entries(output.image)) {
      const entry = {
        ...baseEntry(modelId, 'image'),
        modelType: 'chatCompletion',
        pricingUnit: 'per-token',
      };
      if (data.input != null) entry.inputCostPerToken = data.input / 1e6;
      if (data.cachedInput != null) {
        entry.cachedInputCostPerToken = data.cachedInput / 1e6;
        entry.cacheTiers = [{ label: 'cached-input', costPerToken: data.cachedInput / 1e6 }];
      }
      if (data.output != null) entry.outputCostPerToken = data.output / 1e6;

      if (data.contextTiers) {
        entry.contextTiers = Object.entries(data.contextTiers).map(([threshold, tier]) => {
          const ct = { threshold };
          if (tier.input != null) ct.inputCostPerToken = tier.input / 1e6;
          if (tier.cachedInput != null) ct.cachedInputCostPerToken = tier.cachedInput / 1e6;
          if (tier.output != null) ct.outputCostPerToken = tier.output / 1e6;
          return ct;
        });
      }

      entries.push(entry);
    }
  }

  // ─── audio token models → per-token, audio ────────────────────────────
  if (output.audio) {
    for (const [modelId, data] of Object.entries(output.audio)) {
      const entry = {
        ...baseEntry(modelId, 'audio'),
        modelType: 'audio',
        pricingUnit: 'per-token',
      };
      if (data.input != null) entry.inputCostPerToken = data.input / 1e6;
      if (data.cachedInput != null) {
        entry.cachedInputCostPerToken = data.cachedInput / 1e6;
        entry.cacheTiers = [{ label: 'cached-input', costPerToken: data.cachedInput / 1e6 }];
      }
      if (data.output != null) entry.outputCostPerToken = data.output / 1e6;

      if (data.contextTiers) {
        entry.contextTiers = Object.entries(data.contextTiers).map(([threshold, tier]) => {
          const ct = { threshold };
          if (tier.input != null) ct.inputCostPerToken = tier.input / 1e6;
          if (tier.cachedInput != null) ct.cachedInputCostPerToken = tier.cachedInput / 1e6;
          if (tier.output != null) ct.outputCostPerToken = tier.output / 1e6;
          return ct;
        });
      }

      entries.push(entry);
    }
  }

  // ─── video models → per-second, video ─────────────────────────────────
  if (output.video) {
    for (const [modelId, data] of Object.entries(output.video)) {
      const entry = {
        ...baseEntry(modelId, 'video'),
        modelType: 'video',
        pricingUnit: 'per-second',
      };
      if (data.perSecond != null) entry.costPerSecond = data.perSecond;

      const variants = [];
      if (data.resolution) {
        variants.push({ resolution: data.resolution, costPerSecond: data.perSecond });
      }
      if (data.resolutionTiers) {
        for (const [resolution, tier] of Object.entries(data.resolutionTiers)) {
          variants.push({ resolution, costPerSecond: tier.perSecond });
        }
      }
      if (variants.length > 0) entry.videoVariants = variants;

      entries.push(entry);
    }
  }

  // ─── transcription models → mixed types ───────────────────────────────
  if (output.transcription) {
    for (const [modelId, data] of Object.entries(output.transcription)) {
      const entry = baseEntry(modelId, 'transcription');

      if (data.text || data.audio) {
        // Models with text/audio sub-objects → per-token, transcription
        entry.modelType = 'transcription';
        entry.pricingUnit = 'per-token';
        if (data.text?.input != null) entry.inputCostPerToken = data.text.input / 1e6;
        if (data.text?.output != null) entry.outputCostPerToken = data.text.output / 1e6;
        if (data.estimatedPerMinute != null) entry.costPerMinute = data.estimatedPerMinute;
      } else if (data.perMinute != null) {
        // Models with perMinute → per-minute, transcription
        entry.modelType = 'transcription';
        entry.pricingUnit = 'per-minute';
        entry.costPerMinute = data.perMinute;
      } else if (data.perMillionChars != null) {
        // Models with perMillionChars → per-token, audio (TTS)
        entry.modelType = 'audio';
        entry.pricingUnit = 'per-token';
        entry.costPerMillionChars = data.perMillionChars;
      }

      entries.push(entry);
    }
  }

  // ─── fineTuning models → per-token, fineTuning ────────────────────────
  if (output.fineTuning) {
    for (const [modelId, data] of Object.entries(output.fineTuning)) {
      const entry = {
        ...baseEntry(modelId, 'fineTuning'),
        modelType: 'fineTuning',
        pricingUnit: 'per-token',
      };
      if (data.trainingPerMTok != null) entry.trainingCostPerToken = data.trainingPerMTok / 1e6;
      if (data.trainingPerHour != null) entry.trainingCostPerHour = data.trainingPerHour;
      if (data.input != null) entry.inputCostPerToken = data.input / 1e6;
      if (data.cachedInput != null) entry.cachedInputCostPerToken = data.cachedInput / 1e6;
      if (data.output != null) entry.outputCostPerToken = data.output / 1e6;

      entries.push(entry);
    }
  }

  // ─── imageGeneration models → per-image, imageGeneration ──────────────
  if (output.imageGeneration) {
    for (const [modelId, data] of Object.entries(output.imageGeneration)) {
      const entry = {
        ...baseEntry(modelId, 'imageGeneration'),
        modelType: 'imageGeneration',
        pricingUnit: 'per-image',
      };

      if (data.variants && data.variants.length > 0) {
        // costPerImage = cheapest variant
        entry.costPerImage = Math.min(...data.variants.map((v) => v.perImage));
        entry.imageVariants = data.variants.map((v) => ({
          quality: v.quality,
          size: v.size,
          costPerImage: v.perImage,
        }));
      }

      entries.push(entry);
    }
  }

  // ─── embedding models → per-token, embedding ──────────────────────────
  if (output.embedding) {
    for (const [modelId, data] of Object.entries(output.embedding)) {
      const entry = {
        ...baseEntry(modelId, 'embedding'),
        modelType: 'embedding',
        pricingUnit: 'per-token',
      };
      if (data.input != null) entry.inputCostPerToken = data.input / 1e6;

      entries.push(entry);
    }
  }

  // ─── builtInTools: SKIPPED (doesn't map to unified schema) ────────────

  // ─── legacy models → per-token, chatCompletion, deprecated ────────────
  if (output.legacy) {
    for (const [modelId, data] of Object.entries(output.legacy)) {
      const entry = {
        ...baseEntry(modelId, 'legacy'),
        modelType: 'chatCompletion',
        pricingUnit: 'per-token',
        deprecated: true,
      };
      if (data.input != null) entry.inputCostPerToken = data.input / 1e6;
      if (data.output != null) entry.outputCostPerToken = data.output / 1e6;

      entries.push(entry);
    }
  }

  /** @type {OfficialPricingResult} */
  const result = {
    provider: 'openai',
    sourceUrl,
    fetchedAt: output.fetchedAt,
    entries,
    meta: {
      extractionMethod: extractionMethods,
      modelCount: entries.length,
      sectionCounts: output._meta?.sectionCounts,
    },
  };

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const pretty = process.argv.includes('--pretty');
  const doValidate = process.argv.includes('--validate');
  const noLLM = process.argv.includes('--no-llm');
  const unified = process.argv.includes('--unified');

  if (noLLM) console.error('LLM fallback disabled (--no-llm)');

  console.error(`Fetching ${PAGE_URL} ...`);
  const html = await fetch(PAGE_URL);
  const text = stripHtml(html);

  // Generate a clean version (scripts/styles removed) for LLM consumption
  const cleanText = stripHtmlClean(html);
  setCleanText(cleanText);
  console.error(
    `  Text lengths: regex=${text.length}, clean=${cleanText.length} (${Math.round((1 - cleanText.length / text.length) * 100)}% smaller)`
  );

  const extractionMethod = {};

  // Helper: attempt LLM fallback for a section
  async function tryLLMFallback(name, regexResult) {
    extractionMethod[name] = 'regex';
    if (isSuspicious(name, regexResult) && !noLLM) {
      console.error(
        `  ${name} section suspicious (${Object.keys(regexResult || {}).length} entries), trying LLM fallback...`
      );
      const llmResult = await extractViaLLM(name, extractSectionText(text, name));
      if (llmResult && !isSuspicious(name, llmResult)) {
        extractionMethod[name] = 'llm';
        return llmResult;
      }
      extractionMethod[name] = llmResult ? 'regex+llm-failed' : 'regex+llm-skipped';
    }
    return regexResult;
  }

  // ─── Text tokens (from Astro island structured data) ──────────────────
  const textEntries = parseTextFromAstroIslands(html);
  let textModels = textEntries.length > 0 ? groupContextTiers(textEntries) : {};
  extractionMethod.text = 'regex';
  if (isSuspicious('text', textModels) && !noLLM) {
    console.error(`  text section suspicious (${Object.keys(textModels).length} entries), trying LLM fallback...`);
    const llmResult = await extractViaLLM('text', extractSectionText(text, 'text'));
    if (llmResult && !isSuspicious('text', llmResult)) {
      textModels = llmResult;
      extractionMethod.text = 'llm';
    } else {
      extractionMethod.text = llmResult ? 'regex+llm-failed' : 'regex+llm-skipped';
    }
  }
  console.error(`  Text models: ${Object.keys(textModels).length} [${extractionMethod.text}]`);

  // ─── Image tokens ─────────────────────────────────────────────────────
  let imageModels = await tryLLMFallback('image', parseImageTokens(text));
  console.error(`  Image models: ${Object.keys(imageModels).length} [${extractionMethod.image}]`);

  // ─── Audio tokens ─────────────────────────────────────────────────────
  let audioModels = await tryLLMFallback('audio', parseAudioTokens(text));
  console.error(`  Audio models: ${Object.keys(audioModels).length} [${extractionMethod.audio}]`);

  // ─── Video ────────────────────────────────────────────────────────────
  let videoModels = await tryLLMFallback('video', parseVideo(text));
  console.error(`  Video models: ${Object.keys(videoModels).length} [${extractionMethod.video}]`);

  // ─── Transcription & Speech ───────────────────────────────────────────
  let transcriptionModels = await tryLLMFallback('transcription', parseTranscription(text));
  console.error(
    `  Transcription models: ${Object.keys(transcriptionModels).length} [${extractionMethod.transcription}]`
  );

  // ─── Fine-tuning ──────────────────────────────────────────────────────
  let fineTuningModels = await tryLLMFallback('fineTuning', parseFineTuning(text));
  console.error(`  Fine-tuning models: ${Object.keys(fineTuningModels).length} [${extractionMethod.fineTuning}]`);

  // ─── Image Generation ─────────────────────────────────────────────────
  let imageGenModels = await tryLLMFallback('imageGeneration', parseImageGeneration(text));
  console.error(
    `  Image generation models: ${Object.keys(imageGenModels).length} [${extractionMethod.imageGeneration}]`
  );

  // ─── Embeddings ───────────────────────────────────────────────────────
  let embeddingModels = await tryLLMFallback('embedding', parseEmbeddings(text));
  console.error(`  Embedding models: ${Object.keys(embeddingModels).length} [${extractionMethod.embedding}]`);

  // ─── Built-in Tools ───────────────────────────────────────────────────
  let builtInToolsModels = await tryLLMFallback('builtInTools', parseBuiltInTools(text));
  console.error(`  Built-in tools: ${Object.keys(builtInToolsModels).length} [${extractionMethod.builtInTools}]`);

  // ─── Legacy ───────────────────────────────────────────────────────────
  let legacyModels = await tryLLMFallback('legacy', parseLegacy(text));
  console.error(`  Legacy models: ${Object.keys(legacyModels).length} [${extractionMethod.legacy}]`);

  // ─── Assemble output ─────────────────────────────────────────────────
  const output = {
    provider: 'openai',
    source: 'https://developers.openai.com/api/docs/pricing',
    tier: 'standard',
    fetchedAt: new Date().toISOString(),
    unit: '$/MTok',
    text: textModels,
    image: imageModels,
    audio: audioModels,
    video: videoModels,
    transcription: transcriptionModels,
    fineTuning: fineTuningModels,
    imageGeneration: imageGenModels,
    embedding: embeddingModels,
    builtInTools: builtInToolsModels,
    legacy: legacyModels,
    _meta: {
      notes: [
        'All token prices are $/MTok (per million tokens) unless otherwise noted',
        'Video prices are $/second, image generation is $/image',
        'Transcription includes text tokens, audio tokens, and legacy models',
        'Built-in tools have varied pricing units (per container, per call, per GB-day)',
        'Reasoning tokens (o-series) are not visible via API, billed as output tokens',
      ],
      extractionMethod,
      sectionCounts: {
        text: Object.keys(textModels).length,
        image: Object.keys(imageModels).length,
        audio: Object.keys(audioModels).length,
        video: Object.keys(videoModels).length,
        transcription: Object.keys(transcriptionModels).length,
        fineTuning: Object.keys(fineTuningModels).length,
        imageGeneration: Object.keys(imageGenModels).length,
        embedding: Object.keys(embeddingModels).length,
        builtInTools: Object.keys(builtInToolsModels).length,
        legacy: Object.keys(legacyModels).length,
      },
    },
  };

  if (doValidate) {
    console.error('\n── Validation ──');
    validate(output);
  }

  const finalOutput = unified ? toUnified(output) : output;
  if (unified) {
    console.error(`  Unified entries: ${finalOutput.entries.length}`);
  }

  const json = pretty ? JSON.stringify(finalOutput, null, 2) : JSON.stringify(finalOutput);
  process.stdout.write(json + '\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
