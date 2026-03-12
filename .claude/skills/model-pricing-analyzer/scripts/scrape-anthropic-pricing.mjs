#!/usr/bin/env node
/**
 * Scrape Anthropic official pricing from platform.claude.com
 * Outputs structured JSON to stdout.
 *
 * Usage:
 *   node scrape-anthropic-pricing.mjs
 *   node scrape-anthropic-pricing.mjs --pretty
 *   node scrape-anthropic-pricing.mjs --validate   # compare key prices against known values
 *   node scrape-anthropic-pricing.mjs --no-llm     # disable LLM fallback, pure regex mode
 *   node scrape-anthropic-pricing.mjs --unified    # output in OfficialPricingResult format ($/token)
 *
 * LLM fallback: When regex parsing yields suspicious results (too few entries or
 * missing expected keys), the script automatically falls back to Claude Haiku for
 * extraction. Requires ANTHROPIC_API_KEY env var (or OPENAI_API_KEY as fallback).
 * Use --no-llm to disable.
 *
 * Data source:
 *   Primary:  https://docs.anthropic.com/en/docs/about-claude/pricing
 *   Fallback: https://platform.claude.com/docs/en/docs/about-claude/pricing
 *
 * Extracted sections:
 *   1. Model pricing      — Input / 5m Cache / 1h Cache / Cache Hit / Output ($/MTok)
 *   2. Batch processing    — 50% discount on input & output
 *   3. Long context        — Premium pricing for >200K input tokens
 *   4. Fast mode           — 6x premium for Opus 4.6
 *   5. Data residency      — 1.1x multiplier for US-only inference
 */

import { createHash } from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';

/** @typedef {import('./pricing-schema').OfficialPricingEntry} OfficialPricingEntry */
/** @typedef {import('./pricing-schema').OfficialPricingResult} OfficialPricingResult */

const UA = 'Mozilla/5.0 (compatible; AIGNE-Hub-Catalog/1.0)';
const LLM_CACHE_PATH = '/tmp/aigne-anthropic-llm-cache.json';
const LLM_CACHE_TTL = 3600_000; // 1 hour

const URLS = [
  'https://docs.anthropic.com/en/docs/about-claude/pricing',
  'https://platform.claude.com/docs/en/docs/about-claude/pricing',
];

// ──────────────────────────────────────────────────────────────────────────────
// HTTP fetch with redirect following
// ──────────────────────────────────────────────────────────────────────────────

function fetch(url, { maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const get = (u, remaining) => {
      const mod = u.startsWith('https') ? https : http;
      const req = mod.get(u, { headers: { 'User-Agent': UA }, timeout: 30000 }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && remaining > 0) {
          const next = new URL(res.headers.location, u).href;
          return get(next, remaining - 1);
        }
        if (res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${u}`));
      });
    };
    get(url, maxRedirects);
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

function strip(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#?[\w]+;/g, '')
    .replace(/\s+/g, ' ');
}

// ──────────────────────────────────────────────────────────────────────────────
// Model definitions — display name patterns → canonical DB IDs
// ──────────────────────────────────────────────────────────────────────────────

// Order matters: more specific patterns must come before less specific ones
// e.g. "Claude Opus 4.6" before "Claude Opus 4" to avoid partial matches
const MODEL_DEFS = [
  { regex: /Claude Opus 4\.6/i, name: 'Claude Opus 4.6', id: 'claude-opus-4-6' },
  { regex: /Claude Opus 4\.5/i, name: 'Claude Opus 4.5', id: 'claude-opus-4-5' },
  { regex: /Claude Opus 4\.1/i, name: 'Claude Opus 4.1', id: 'claude-opus-4-1' },
  { regex: /Claude Opus 4(?![.\d])/i, name: 'Claude Opus 4', id: 'claude-opus-4' },
  { regex: /Claude Sonnet 4\.6/i, name: 'Claude Sonnet 4.6', id: 'claude-sonnet-4-6' },
  { regex: /Claude Sonnet 4\.5/i, name: 'Claude Sonnet 4.5', id: 'claude-sonnet-4-5' },
  { regex: /Claude Sonnet 4(?![.\d])/i, name: 'Claude Sonnet 4', id: 'claude-sonnet-4' },
  { regex: /Claude Sonnet 3\.7/i, name: 'Claude Sonnet 3.7', id: 'claude-sonnet-3-7', deprecated: true },
  { regex: /Claude Haiku 4\.5/i, name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5' },
  { regex: /Claude Haiku 3\.5/i, name: 'Claude Haiku 3.5', id: 'claude-haiku-3-5' },
  { regex: /Claude Opus 3(?![.\d])/i, name: 'Claude Opus 3', id: 'claude-opus-3', deprecated: true },
  { regex: /Claude Haiku 3(?![.\d])/i, name: 'Claude Haiku 3', id: 'claude-haiku-3' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Section parsers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parse the main "Model pricing" table.
 * Format per model row: 5 "$X / MTok" values after model name
 *   [Input, 5m Cache Write, 1h Cache Write, Cache Hit, Output]
 */
function parseModelPricing(text) {
  const result = {};

  for (const { regex, name, id, deprecated } of MODEL_DEFS) {
    let searchFrom = 0;
    let found = false;

    while (!found) {
      const match = text.substring(searchFrom).match(regex);
      if (!match || match.index === undefined) break;

      const startIdx = searchFrom + match.index;
      const window = text.substring(startIdx, startIdx + 400);
      const priceRegex = /\$([\d]+(?:\.[\d]+)?)\s*\/\s*MTok/g;
      const prices = [];
      let pm;
      while ((pm = priceRegex.exec(window)) !== null && prices.length < 5) {
        prices.push(parseFloat(pm[1]));
      }

      if (prices.length === 5) {
        const entry = {
          name,
          inputPerMTok: prices[0],
          cacheWrite5m: prices[1],
          cacheWrite1h: prices[2],
          cacheRead: prices[3],
          outputPerMTok: prices[4],
        };
        if (deprecated) entry.deprecated = true;
        result[id] = entry;
        found = true;
      }

      searchFrom = startIdx + match[0].length;
    }
  }

  return result;
}

/**
 * Parse the "Batch processing" table.
 * The actual batch table is anchored by "Batch input Batch output" header,
 * NOT the "Batch processing" navigation link which appears earlier.
 * Format per model row: 2 "$X / MTok" values after model name
 *   [Batch Input, Batch Output]
 */
function parseBatchPricing(text) {
  // Find the actual batch pricing table by looking for the table header
  const headerIdx = text.search(/Batch input\s+Batch output/i);
  if (headerIdx === -1) return {};

  // Work with text from the table header onwards (skip nav links)
  const batchText = text.substring(headerIdx);
  const result = {};

  for (const { regex, id } of MODEL_DEFS) {
    const match = batchText.match(regex);
    if (!match || match.index === undefined) continue;

    const window = batchText.substring(match.index, match.index + 200);
    const priceRegex = /\$([\d]+(?:\.[\d]+)?)\s*\/\s*MTok/g;
    const prices = [];
    let pm;
    while ((pm = priceRegex.exec(window)) !== null && prices.length < 2) {
      prices.push(parseFloat(pm[1]));
    }

    if (prices.length === 2) {
      result[id] = { batchInput: prices[0], batchOutput: prices[1] };
    }
  }

  return result;
}

/**
 * Parse "Long context pricing" section.
 * Stripped text format (from actual page):
 *   Claude Opus 4.6 Input: $5 / MTok Input: $10 / MTok Output: $25 / MTok Output: $37.50 / MTok
 *   Claude Sonnet 4.6 / 4.5 / 4 Input: $3 / MTok Input: $6 / MTok Output: $15 / MTok Output: $22.50 / MTok
 * Pattern: 4 price values after each model name row
 *   [std_input, lc_input, std_output, lc_output]
 */
function parseLongContextPricing(text) {
  // Anchor on the section heading + table header to skip nav links
  const lcIdx = text.search(/Long context pricing\s+When using/i);
  if (lcIdx === -1) return {};

  const lcText = text.substring(lcIdx, lcIdx + 2000);
  const result = {};

  // Generic approach: find model name, then extract the next 4 "Input/Output: $X / MTok" values
  // Format in stripped text:
  //   Claude Opus 4.6 Input: $5 / MTok Input: $10 / MTok Output: $25 / MTok Output: $37.50 / MTok
  const priceRegex = /(?:Input|Output):\s*\$([\d.]+)\s*\/\s*MTok/g;

  // Opus 4.6 — skip intro paragraph occurrences, find the one followed by "Input:"
  let opusSearchFrom = 0;
  while (true) {
    const opusIdx = lcText.indexOf('Claude Opus 4.6', opusSearchFrom);
    if (opusIdx === -1) break;
    const opusWindow = lcText.substring(opusIdx, opusIdx + 400);
    // Only match if this occurrence has "Input:" pricing after the model name
    if (!/Input:\s*\$/.test(opusWindow)) {
      opusSearchFrom = opusIdx + 16;
      continue;
    }
    const prices = [];
    let pm;
    priceRegex.lastIndex = 0;
    while ((pm = priceRegex.exec(opusWindow)) !== null && prices.length < 4) {
      prices.push(parseFloat(pm[1]));
    }
    // [std_input, lc_input, std_output, lc_output]
    if (prices.length === 4) {
      result['claude-opus-4-6'] = {
        standardInput: prices[0],
        longContextInput: prices[1],
        standardOutput: prices[2],
        longContextOutput: prices[3],
      };
    }
    break;
  }

  // Sonnet 4.6 / 4.5 / 4
  const sonnetIdx = lcText.search(/Claude Sonnet 4\.6/i);
  if (sonnetIdx !== -1) {
    const sonnetWindow = lcText.substring(sonnetIdx, sonnetIdx + 400);
    const prices = [];
    let pm;
    priceRegex.lastIndex = 0;
    while ((pm = priceRegex.exec(sonnetWindow)) !== null && prices.length < 4) {
      prices.push(parseFloat(pm[1]));
    }
    if (prices.length === 4) {
      const lc = {
        standardInput: prices[0],
        longContextInput: prices[1],
        standardOutput: prices[2],
        longContextOutput: prices[3],
      };
      for (const sid of ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4']) {
        result[sid] = { ...lc };
      }
    }
  }

  return result;
}

/**
 * Parse "Fast mode pricing" section.
 * Stripped text format (from actual page):
 *   Fast mode pricing Fast mode for Claude Opus 4.6 ... Input Output $30 / MTok $150 / MTok
 * Anchor on "Fast mode pricing Fast mode for" to skip nav links.
 */
function parseFastModePricing(text) {
  // Anchor on section content, not just the heading (nav link has "Fast mode" too)
  const fmIdx = text.search(/Fast mode pricing\s+Fast mode for/i);
  if (fmIdx === -1) return {};

  const fmText = text.substring(fmIdx, fmIdx + 800);
  const result = {};

  // Look for the pricing table: $30 / MTok ... $150 / MTok
  const priceRegex = /\$([\d.]+)\s*\/\s*MTok/g;
  const prices = [];
  let pm;
  while ((pm = priceRegex.exec(fmText)) !== null && prices.length < 2) {
    prices.push(parseFloat(pm[1]));
  }

  if (prices.length === 2) {
    // Fast mode is currently for Opus 4.6 only
    result['claude-opus-4-6'] = {
      fastModeInput: prices[0],
      fastModeOutput: prices[1],
      multiplier: '6x standard rates',
    };
  }

  return result;
}

/**
 * Parse "Data residency pricing" section.
 * Extracts the multiplier for US-only inference.
 */
function parseDataResidencyPricing(text) {
  const drIdx = text.search(/Data residency pricing/i);
  if (drIdx === -1) return {};

  const drText = text.substring(drIdx, drIdx + 500);

  // Look for "1.1x multiplier" or similar
  const match = drText.match(/([\d.]+)x\s*multiplier/i);
  if (!match) return {};

  return {
    usOnlyMultiplier: parseFloat(match[1]),
    applies: 'Claude Opus 4.6 and newer models',
    note: 'US-only inference via inference_geo parameter',
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM fallback — suspicious detection & section extraction
// ──────────────────────────────────────────────────────────────────────────────

const SECTION_EXPECTATIONS = {
  modelPricing: { minEntries: 10, requiredKeys: ['claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'] },
  batchPricing: { minEntries: 10, requiredKeys: ['claude-opus-4-6', 'claude-sonnet-4-5'] },
  longContextPricing: { minEntries: 2, requiredKeys: ['claude-opus-4-6'] },
  fastModePricing: { minEntries: 1, requiredKeys: ['claude-opus-4-6'] },
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

// Section anchors for extracting text to feed to LLM
const SECTION_ANCHORS = {
  modelPricing: { start: 'Model pricing', end: ['Batch input', 'Batch processing', 'Long context'] },
  batchPricing: { start: 'Batch input Batch output', end: ['Long context pricing', 'Fast mode'] },
  longContextPricing: { start: 'Long context pricing', end: ['Fast mode pricing'] },
  fastModePricing: { start: 'Fast mode pricing', end: ['Batch processing', 'Data residency'] },
};

function extractSectionText(text, sectionName) {
  const anchors = SECTION_ANCHORS[sectionName];
  if (!anchors) return '';
  const startIdx = text.indexOf(anchors.start);
  if (startIdx === -1) return '';
  let endIdx = -1;
  for (const end of anchors.end) {
    const idx = text.indexOf(end, startIdx + anchors.start.length + 20);
    if (idx > startIdx && (endIdx === -1 || idx < endIdx)) endIdx = idx;
  }
  if (endIdx === -1) endIdx = startIdx + 3000;
  return text.substring(startIdx, endIdx);
}

// LLM prompt templates per section
const SECTION_PROMPTS = {
  modelPricing: {
    schema:
      '{ "model-id": { "name": string, "inputPerMTok": number, "cacheWrite5m": number, "cacheWrite1h": number, "cacheRead": number, "outputPerMTok": number } }',
    example:
      '{ "claude-opus-4-6": { "name": "Claude Opus 4.6", "inputPerMTok": 5, "cacheWrite5m": 6.25, "cacheWrite1h": 10, "cacheRead": 0.5, "outputPerMTok": 25 } }',
    instructions:
      'Extract ALL Claude model pricing. Each model has 5 prices in $/MTok: Input, 5-minute Cache Write, 1-hour Cache Write, Cache Hit (Read), Output. Use slug IDs like "claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-3-5" etc.',
  },
  batchPricing: {
    schema: '{ "model-id": { "batchInput": number, "batchOutput": number } }',
    example: '{ "claude-opus-4-6": { "batchInput": 2.5, "batchOutput": 12.5 } }',
    instructions:
      'Extract batch processing prices for ALL Claude models. Each has Batch Input and Batch Output in $/MTok (50% of standard). Use slug IDs like "claude-opus-4-6".',
  },
  longContextPricing: {
    schema:
      '{ "model-id": { "standardInput": number, "longContextInput": number, "standardOutput": number, "longContextOutput": number } }',
    example:
      '{ "claude-opus-4-6": { "standardInput": 5, "longContextInput": 10, "standardOutput": 25, "longContextOutput": 37.5 } }',
    instructions:
      'Extract long context pricing (>200K input tokens). Each model row has 4 values: standard input, long context input, standard output, long context output in $/MTok. For rows like "Sonnet 4.6 / 4.5 / 4", create separate entries for each model.',
  },
  fastModePricing: {
    schema: '{ "model-id": { "fastModeInput": number, "fastModeOutput": number, "multiplier": string } }',
    example: '{ "claude-opus-4-6": { "fastModeInput": 30, "fastModeOutput": 150, "multiplier": "6x standard rates" } }',
    instructions: 'Extract fast mode pricing. Currently only for Opus 4.6. Input and Output in $/MTok.',
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
function validateLLMResult(result) {
  if (!result || typeof result !== 'object') return false;
  const keys = Object.keys(result);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (typeof result[k] !== 'object' || result[k] === null) return false;
  }
  return true;
}

/**
 * Call Claude API (Haiku) for LLM extraction fallback.
 * Uses ANTHROPIC_API_KEY env var. Falls back to OPENAI_API_KEY with gpt-4o-mini.
 */
async function extractViaLLM(sectionName, sectionText) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    console.error('  [llm] No API key (ANTHROPIC_API_KEY or OPENAI_API_KEY), skipping LLM fallback');
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
    let parsed;

    if (anthropicKey) {
      // Use Claude Haiku via Anthropic Messages API
      console.error(`  [llm] Calling claude-haiku-4-5 for ${sectionName} (${sectionText.length} chars)...`);
      const resp = await postJSON(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: sectionText }],
        },
        {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        }
      );
      const content = resp.content?.[0]?.text;
      if (!content) {
        console.error(`  [llm] Empty response for ${sectionName}`);
        return null;
      }
      // Extract JSON from response (Claude may wrap in markdown code block)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`  [llm] No JSON found in response for ${sectionName}`);
        return null;
      }
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback to OpenAI gpt-4o-mini
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
        { Authorization: `Bearer ${openaiKey}` }
      );
      const content = resp.choices?.[0]?.message?.content;
      if (!content) {
        console.error(`  [llm] Empty response for ${sectionName}`);
        return null;
      }
      parsed = JSON.parse(content);
    }

    if (!validateLLMResult(parsed)) {
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
// Merge all sections into unified model entries
// ──────────────────────────────────────────────────────────────────────────────

function mergeAllSections(modelPricing, batchPricing, longContextPricing, fastModePricing) {
  const merged = {};

  // Start with the main model pricing as the base
  for (const [id, entry] of Object.entries(modelPricing)) {
    merged[id] = { ...entry };
  }

  // Merge batch pricing
  for (const [id, batch] of Object.entries(batchPricing)) {
    if (merged[id]) {
      merged[id].batchInput = batch.batchInput;
      merged[id].batchOutput = batch.batchOutput;
    }
  }

  // Merge long context pricing
  for (const [id, lc] of Object.entries(longContextPricing)) {
    if (merged[id]) {
      merged[id].longContextInput = lc.longContextInput;
      merged[id].longContextOutput = lc.longContextOutput;
    }
  }

  // Merge fast mode pricing
  for (const [id, fm] of Object.entries(fastModePricing)) {
    if (merged[id]) {
      merged[id].fastModeInput = fm.fastModeInput;
      merged[id].fastModeOutput = fm.fastModeOutput;
    }
  }

  return merged;
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation — compare key prices against known reference values
// ──────────────────────────────────────────────────────────────────────────────

function validate(models) {
  const checks = [
    // Model pricing
    ['claude-opus-4-6.inputPerMTok', models['claude-opus-4-6']?.inputPerMTok, 5],
    ['claude-opus-4-6.outputPerMTok', models['claude-opus-4-6']?.outputPerMTok, 25],
    ['claude-opus-4-6.cacheWrite5m', models['claude-opus-4-6']?.cacheWrite5m, 6.25],
    ['claude-opus-4-6.cacheWrite1h', models['claude-opus-4-6']?.cacheWrite1h, 10],
    ['claude-opus-4-6.cacheRead', models['claude-opus-4-6']?.cacheRead, 0.5],
    ['claude-opus-4-5.inputPerMTok', models['claude-opus-4-5']?.inputPerMTok, 5],
    ['claude-opus-4-5.outputPerMTok', models['claude-opus-4-5']?.outputPerMTok, 25],
    ['claude-opus-4-1.inputPerMTok', models['claude-opus-4-1']?.inputPerMTok, 15],
    ['claude-opus-4-1.outputPerMTok', models['claude-opus-4-1']?.outputPerMTok, 75],
    ['claude-sonnet-4-5.inputPerMTok', models['claude-sonnet-4-5']?.inputPerMTok, 3],
    ['claude-sonnet-4-5.outputPerMTok', models['claude-sonnet-4-5']?.outputPerMTok, 15],
    ['claude-haiku-4-5.inputPerMTok', models['claude-haiku-4-5']?.inputPerMTok, 1],
    ['claude-haiku-4-5.outputPerMTok', models['claude-haiku-4-5']?.outputPerMTok, 5],
    ['claude-haiku-3-5.inputPerMTok', models['claude-haiku-3-5']?.inputPerMTok, 0.8],
    ['claude-haiku-3-5.outputPerMTok', models['claude-haiku-3-5']?.outputPerMTok, 4],
    ['claude-haiku-3.inputPerMTok', models['claude-haiku-3']?.inputPerMTok, 0.25],
    ['claude-haiku-3.outputPerMTok', models['claude-haiku-3']?.outputPerMTok, 1.25],
    // Batch pricing
    ['claude-opus-4-6.batchInput', models['claude-opus-4-6']?.batchInput, 2.5],
    ['claude-opus-4-6.batchOutput', models['claude-opus-4-6']?.batchOutput, 12.5],
    ['claude-haiku-4-5.batchInput', models['claude-haiku-4-5']?.batchInput, 0.5],
    ['claude-haiku-4-5.batchOutput', models['claude-haiku-4-5']?.batchOutput, 2.5],
    // Long context pricing
    ['claude-opus-4-6.longContextInput', models['claude-opus-4-6']?.longContextInput, 10],
    ['claude-opus-4-6.longContextOutput', models['claude-opus-4-6']?.longContextOutput, 37.5],
    // Fast mode pricing
    ['claude-opus-4-6.fastModeInput', models['claude-opus-4-6']?.fastModeInput, 30],
    ['claude-opus-4-6.fastModeOutput', models['claude-opus-4-6']?.fastModeOutput, 150],
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
// Unified format conversion
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert the scraper's native output to the unified OfficialPricingResult format.
 * All $/MTok values are converted to $/token by dividing by 1e6.
 *
 * @param {object} output - The scraper's native output object
 * @returns {OfficialPricingResult}
 */
function toUnified(output) {
  const MTok = 1e6;
  const sourceUrl = output.source;
  /** @type {OfficialPricingEntry[]} */
  const entries = [];

  // Build a lookup from MODEL_DEFS for deprecated flag and display name
  const modelDefMap = {};
  for (const def of MODEL_DEFS) {
    modelDefMap[def.id] = def;
  }

  // Determine the extraction method for model pricing section (primary method for entries)
  const sectionMethod = output._meta?.extractionMethod || {};

  for (const [modelId, model] of Object.entries(output.models)) {
    /** @type {OfficialPricingEntry} */
    const entry = {
      provider: 'anthropic',
      modelId,
      displayName: model.name || modelDefMap[modelId]?.name,
      modelType: 'chatCompletion',
      pricingUnit: 'per-token',
      sourceUrl,
    };

    // Base token pricing
    if (model.inputPerMTok != null) {
      entry.inputCostPerToken = model.inputPerMTok / MTok;
    }
    if (model.outputPerMTok != null) {
      entry.outputCostPerToken = model.outputPerMTok / MTok;
    }

    // Cache tiers
    const cacheTiers = [];
    if (model.cacheWrite5m != null) {
      cacheTiers.push({ label: '5min-write', costPerToken: model.cacheWrite5m / MTok });
    }
    if (model.cacheWrite1h != null) {
      cacheTiers.push({ label: '1h-write', costPerToken: model.cacheWrite1h / MTok });
    }
    if (model.cacheRead != null) {
      cacheTiers.push({ label: 'read', costPerToken: model.cacheRead / MTok });
      entry.cachedInputCostPerToken = model.cacheRead / MTok;
    }
    if (cacheTiers.length > 0) {
      entry.cacheTiers = cacheTiers;
    }

    // Batch pricing
    if (model.batchInput != null && model.batchOutput != null) {
      entry.batchPricing = {
        inputCostPerToken: model.batchInput / MTok,
        outputCostPerToken: model.batchOutput / MTok,
        discountNote: '50% of standard',
      };
    }

    // Long context (context tiers)
    if (model.longContextInput != null || model.longContextOutput != null) {
      /** @type {import('./pricing-schema').ContextTier} */
      const tier = { threshold: '>200K' };
      if (model.longContextInput != null) {
        tier.inputCostPerToken = model.longContextInput / MTok;
      }
      if (model.longContextOutput != null) {
        tier.outputCostPerToken = model.longContextOutput / MTok;
      }
      entry.contextTiers = [tier];
    }

    // Fast mode (special modes)
    if (model.fastModeInput != null || model.fastModeOutput != null) {
      /** @type {import('./pricing-schema').SpecialModePricing} */
      const mode = { mode: 'fast-mode' };
      if (model.fastModeInput != null) {
        mode.inputCostPerToken = model.fastModeInput / MTok;
      }
      if (model.fastModeOutput != null) {
        mode.outputCostPerToken = model.fastModeOutput / MTok;
      }
      mode.multiplierNote = '6x standard rates';
      entry.specialModes = [mode];
    }

    // Extraction method — use the model pricing section's method as default
    if (sectionMethod.modelPricing) {
      entry.extractionMethod = sectionMethod.modelPricing;
    }

    // Deprecated flag
    if (model.deprecated || modelDefMap[modelId]?.deprecated) {
      entry.deprecated = true;
    }

    entries.push(entry);
  }

  /** @type {OfficialPricingResult} */
  const result = {
    provider: 'anthropic',
    sourceUrl,
    fetchedAt: output.fetchedAt,
    entries,
  };

  // Provider notes
  const providerNotes = {};
  if (output.dataResidency && Object.keys(output.dataResidency).length > 0) {
    providerNotes.dataResidency = output.dataResidency;
  }
  if (output.cacheMultipliers) {
    providerNotes.cacheMultipliers = output.cacheMultipliers;
  }
  if (Object.keys(providerNotes).length > 0) {
    result.providerNotes = providerNotes;
  }

  // Meta
  result.meta = {};
  if (output._meta?.extractionMethod) {
    result.meta.extractionMethod = output._meta.extractionMethod;
  }
  if (output._meta?.modelCount != null) {
    result.meta.modelCount = output._meta.modelCount;
  }
  if (output._meta?.sections) {
    result.meta.sectionCounts = output._meta.sections;
  }

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

  // Try fetching from URLs in order (first follows redirect, second is direct)
  let html;
  let sourceUrl;
  for (const url of URLS) {
    try {
      console.error(`Fetching ${url} ...`);
      html = await fetch(url);
      sourceUrl = url;
      console.error(`  Success (${Math.round(html.length / 1024)}KB)`);
      break;
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
    }
  }

  if (!html) {
    console.error('ERROR: Could not fetch Anthropic pricing page from any URL');
    process.exit(1);
  }

  const text = strip(html);
  console.error(`  Stripped text: ${text.length} chars`);

  const extractionMethod = {};

  // Helper: attempt LLM fallback for a section
  async function tryLLMFallback(name, regexResult) {
    extractionMethod[name] = 'regex';
    if (isSuspicious(name, regexResult) && !noLLM) {
      console.error(`  ${name} suspicious (${Object.keys(regexResult || {}).length} entries), trying LLM fallback...`);
      const llmResult = await extractViaLLM(name, extractSectionText(text, name));
      if (llmResult && !isSuspicious(name, llmResult)) {
        extractionMethod[name] = 'llm';
        return llmResult;
      }
      extractionMethod[name] = llmResult ? 'regex+llm-failed' : 'regex+llm-skipped';
    }
    return regexResult;
  }

  // Parse each section with LLM fallback
  const modelPricing = await tryLLMFallback('modelPricing', parseModelPricing(text));
  console.error(`  Model pricing: ${Object.keys(modelPricing).length} models [${extractionMethod.modelPricing}]`);

  const batchPricing = await tryLLMFallback('batchPricing', parseBatchPricing(text));
  console.error(`  Batch pricing: ${Object.keys(batchPricing).length} models [${extractionMethod.batchPricing}]`);

  const longContextPricing = await tryLLMFallback('longContextPricing', parseLongContextPricing(text));
  console.error(
    `  Long context pricing: ${Object.keys(longContextPricing).length} models [${extractionMethod.longContextPricing}]`
  );

  const fastModePricing = await tryLLMFallback('fastModePricing', parseFastModePricing(text));
  console.error(
    `  Fast mode pricing: ${Object.keys(fastModePricing).length} models [${extractionMethod.fastModePricing}]`
  );

  const dataResidency = parseDataResidencyPricing(text);
  console.error(`  Data residency: ${Object.keys(dataResidency).length > 0 ? 'found' : 'not found'}`);

  // Merge all sections
  const models = mergeAllSections(modelPricing, batchPricing, longContextPricing, fastModePricing);
  console.error(`  Total merged models: ${Object.keys(models).length}`);

  // Assemble output
  const output = {
    provider: 'anthropic',
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
    unit: '$/MTok',
    models,
    dataResidency,
    cacheMultipliers: {
      '5min_write': '1.25x base input price',
      '1hour_write': '2x base input price',
      cache_read: '0.1x base input price',
    },
    _meta: {
      notes: [
        'All token prices are $/MTok (per million tokens)',
        'Cache pricing is based on multipliers of base input price',
        'Batch pricing is 50% of standard pricing',
        'Long context pricing applies to requests >200K input tokens',
        'Fast mode pricing is 6x standard rates (Opus 4.6 only)',
        'Data residency (US-only) adds 1.1x multiplier (Opus 4.6+ only)',
      ],
      extractionMethod,
      modelCount: Object.keys(models).length,
      sections: {
        modelPricing: Object.keys(modelPricing).length,
        batchPricing: Object.keys(batchPricing).length,
        longContextPricing: Object.keys(longContextPricing).length,
        fastModePricing: Object.keys(fastModePricing).length,
      },
    },
  };

  // Validate if requested
  if (doValidate) {
    console.error('\n── Validation ──');
    validate(models);
  }

  // Output unified or native format
  const finalOutput = unified ? toUnified(output) : output;
  const json = pretty ? JSON.stringify(finalOutput, null, 2) : JSON.stringify(finalOutput);
  process.stdout.write(json + '\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
