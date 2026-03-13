#!/usr/bin/env node
/**
 * Official Pricing Catalog
 *
 * Scrapes official pricing pages from Anthropic, Google, and OpenAI,
 * then generates a standalone HTML report showing ALL models and their pricing,
 * optionally integrated with Hub DB rates for comparison.
 *
 * Usage:
 *   node official-pricing-catalog.mjs [output.html]
 *   node official-pricing-catalog.mjs --json
 *   node official-pricing-catalog.mjs --cache
 *   node official-pricing-catalog.mjs --env production [output.html]
 *   node official-pricing-catalog.mjs --hub-url https://hub.aigne.io [output.html]
 *
 * Data sources:
 *   - Anthropic: platform.claude.com/docs/en/docs/about-claude/pricing
 *   - Google:    ai.google.dev/gemini-api/docs/pricing
 *   - OpenAI:    platform.openai.com/docs/pricing (via LiteLLM proxy, official 403)
 *   - Hub:       GET /api/ai-providers/model-rates (optional)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UA = 'Mozilla/5.0 (compatible; AIGNE-Hub-Catalog/1.0)';

const ENV_URLS = {
  staging: 'https://staging-hub.aigne.io',
  production: 'https://hub.aigne.io',
};

// ─── CLI argument parsing ────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { json: false, hubUrl: null, env: null, outputFile: null, cache: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--json':
        opts.json = true;
        break;
      case '--env':
        opts.env = args[++i];
        if (ENV_URLS[opts.env]) opts.hubUrl = ENV_URLS[opts.env];
        else {
          console.error(`Unknown env: ${opts.env}. Use: staging, production`);
          process.exit(1);
        }
        break;
      case '--hub-url':
        opts.hubUrl = args[++i];
        break;
      case '--cache':
        opts.cache = true;
        break;
      default:
        if (!args[i].startsWith('--')) opts.outputFile = args[i];
    }
  }

  return opts;
}

// ─── HTTP helper ────────────────────────────────────────────────────────────
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

function strip(html) {
  return html
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

// ─── Hub API ─────────────────────────────────────────────────────────────────
async function fetchHubRates(hubUrl) {
  if (!hubUrl) return new Map();

  console.error(`Fetching Hub rates from ${hubUrl}...`);

  // Dynamic import of buildApiUrl (uses axios)
  let buildApiUrl;
  try {
    const mod = await import('./detect-mount-point.mjs');
    buildApiUrl = mod.buildApiUrl;
  } catch {
    console.error('  Warning: could not import detect-mount-point.mjs, trying direct URL');
    buildApiUrl = async (base, path) => {
      const { origin } = new URL(base);
      return `${origin}${path}`;
    };
  }

  const apiUrl = await buildApiUrl(hubUrl, '/api/ai-providers/model-rates');
  const hubMap = new Map(); // key: "provider/model" → { inputRate, outputRate, unitCosts, ... }

  let page = 1;
  const pageSize = 100;

  while (true) {
    const url = `${apiUrl}?pageSize=${pageSize}&page=${page}`;
    try {
      const raw = await fetch(url);
      const body = JSON.parse(raw);
      const list = body?.list || body?.data?.list || [];

      for (const rate of list) {
        const providerName = rate.provider?.name || '';
        const key = `${providerName}/${rate.model}`;
        hubMap.set(key, {
          provider: providerName,
          model: rate.model,
          type: rate.type,
          inputRate: Number(rate.inputRate ?? 0),
          outputRate: Number(rate.outputRate ?? 0),
          costInput: Number(rate.unitCosts?.input ?? 0),
          costOutput: Number(rate.unitCosts?.output ?? 0),
        });
      }

      if (list.length < pageSize) break;
      page++;
    } catch (err) {
      console.error(`  Failed to fetch Hub page ${page}: ${err.message}`);
      break;
    }
  }

  console.error(`  Hub: ${hubMap.size} models fetched`);
  return hubMap;
}

// ─── Model matching: official ID → Hub key ──────────────────────────────────
// Returns all matching Hub entries for a given official model ID + provider
function findHubMatch(hubMap, officialId, providerHint) {
  // Mapping of official catalog provider names to Hub DB provider names
  const providerMapping = {
    Anthropic: ['anthropic'],
    Google: ['google'],
    OpenAI: ['openai'],
  };
  const dbProviders = providerMapping[providerHint] || [providerHint.toLowerCase()];

  for (const dp of dbProviders) {
    const key = `${dp}/${officialId}`;
    if (hubMap.has(key)) return hubMap.get(key);
  }

  return null;
}

// ─── Anthropic ──────────────────────────────────────────────────────────────
async function scrapeAnthropic() {
  const url = 'https://docs.anthropic.com/en/docs/about-claude/pricing';
  console.error('Fetching Anthropic pricing...');
  let html;
  try {
    html = await fetch(url);
  } catch {
    html = await fetch('https://platform.claude.com/docs/en/docs/about-claude/pricing');
  }
  const text = strip(html);
  const models = [];

  const modelPatterns = [
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

  for (const { regex, name, id, deprecated } of modelPatterns) {
    let searchFrom = 0;
    while (true) {
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
        models.push({
          name,
          id,
          inputPerMTok: prices[0],
          cacheWrite5m: prices[1],
          cacheWrite1h: prices[2],
          cacheRead: prices[3],
          outputPerMTok: prices[4],
          deprecated: !!deprecated,
        });
        break;
      }
      searchFrom = startIdx + match[0].length;
    }
  }

  // Batch pricing — search from "Batch input" table header (not nav link "Batch")
  const batchTableIdx = text.indexOf('Batch input');
  if (batchTableIdx !== -1) {
    const batchText = text.substring(batchTableIdx);
    for (const { regex, name, id } of modelPatterns) {
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
        const m = models.find((x) => x.id === id);
        if (m) {
          m.batchInput = prices[0];
          m.batchOutput = prices[1];
        }
      }
    }
  }

  // Long context pricing
  // Page text format: "Model Input: $X Input: $Y Output: $Z Output: $W" (Input-Input-Output-Output)
  // Groups: 1=≤200K input, 2=>200K input, 3=≤200K output, 4=>200K output
  const longCtxIdx = text.indexOf('Long context pricing');
  if (longCtxIdx !== -1) {
    const lcText = text.substring(longCtxIdx, longCtxIdx + 1000);
    const opusLc = lcText.match(
      /Opus 4\.6.*?Input:\s*\$([\d.]+)\s*\/\s*MTok.*?Input:\s*\$([\d.]+)\s*\/\s*MTok.*?Output:\s*\$([\d.]+)\s*\/\s*MTok.*?Output:\s*\$([\d.]+)\s*\/\s*MTok/s
    );
    if (opusLc) {
      const m = models.find((x) => x.id === 'claude-opus-4-6');
      if (m) {
        m.longContextInput = parseFloat(opusLc[2]);
        m.longContextOutput = parseFloat(opusLc[4]);
      }
    }
    const sonnetLc = lcText.match(
      /Claude Sonnet 4\.6.*?Input:\s*\$([\d.]+)\s*\/\s*MTok.*?Input:\s*\$([\d.]+)\s*\/\s*MTok.*?Output:\s*\$([\d.]+)\s*\/\s*MTok.*?Output:\s*\$([\d.]+)\s*\/\s*MTok/s
    );
    if (sonnetLc) {
      for (const sid of ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4']) {
        const m = models.find((x) => x.id === sid);
        if (m) {
          m.longContextInput = parseFloat(sonnetLc[2]);
          m.longContextOutput = parseFloat(sonnetLc[4]);
        }
      }
    }
  }

  // Fast mode
  const fastIdx = text.indexOf('Fast mode pricing');
  if (fastIdx !== -1) {
    const fText = text.substring(fastIdx, fastIdx + 400);
    const fm = fText.match(/\$([\d.]+)\s*\/\s*MTok.*?\$([\d.]+)\s*\/\s*MTok/);
    if (fm) {
      const m = models.find((x) => x.id === 'claude-opus-4-6');
      if (m) {
        m.fastModeInput = parseFloat(fm[1]);
        m.fastModeOutput = parseFloat(fm[2]);
      }
    }
  }

  console.error(`  Anthropic: ${models.length} models extracted`);
  if (models.length === 0) {
    const rawPath = '/tmp/aigne-raw-anthropic.txt';
    fs.writeFileSync(rawPath, text);
    console.error(`  ⚠️  Regex extracted 0 models — raw text saved to ${rawPath}`);
    return { provider: 'Anthropic', url, models, rawTextPath: rawPath };
  }
  return { provider: 'Anthropic', url, models };
}

// ─── Google ─────────────────────────────────────────────────────────────────
// Fetches Markdown from .md.txt endpoint (cleaner than HTML scraping)
async function scrapeGoogle() {
  const url = 'https://ai.google.dev/gemini-api/docs/pricing.md.txt';
  console.error('Fetching Google pricing (Markdown)...');
  let md = await fetch(url);

  // Strip markdown links: [text](url) → text
  md = md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  const models = [];

  // ── Helpers ──
  function parseTableRows(text) {
    const rows = [];
    for (const line of text.split('\n')) {
      if (!line.startsWith('|') || line.includes('---')) continue;
      const cols = line.split('|').map((c) => c.trim());
      if (cols.length >= 4 && cols[1]) {
        rows.push({ label: cols[1], paid: cols[3] || '' });
      }
    }
    return rows;
  }

  function firstPrice(text) {
    if (!text || text === 'Not available') return null;
    const m = text.match(/\$([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  function allPrices(text) {
    if (!text || text === 'Not available') return [];
    const prices = [];
    const re = /\$([\d.]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) prices.push(parseFloat(m[1]));
    return prices;
  }

  function findRow(rows, pattern) {
    return rows.find((r) => pattern.test(r.label));
  }

  // ── Split into sections by ## headers ──
  const sections = md.split(/^## /m).slice(1);

  for (const rawSection of sections) {
    const lines = rawSection.split('\n');
    const title = lines[0].trim().replace(/\s*🍌\s*$/, '');

    // Extract model IDs from *`model-id`* pattern (first few lines only)
    const headerArea = lines.slice(0, 5).join('\n');
    const idLineMatch = headerArea.match(/\*`[^*]+`\*/);
    if (!idLineMatch) continue;
    const allIds = [];
    const idRegex = /`([^`]+)`/g;
    let idM;
    while ((idM = idRegex.exec(idLineMatch[0])) !== null) allIds.push(idM[1]);
    if (allIds.length === 0) continue;

    const primaryId = allIds[0];
    const deprecated = /deprecated/i.test(rawSection.substring(0, 500));
    const hasTable = /\|\s*(Input|Output|image|[Vv]ideo)\s*price/i.test(rawSection);
    if (deprecated && !hasTable) continue;

    // ── Imagen (per-image, multiple variants) ──
    if (primaryId.startsWith('imagen-')) {
      const rows = parseTableRows(rawSection);
      for (const row of rows) {
        if (!row.label.toLowerCase().includes('image price')) continue;
        const price = firstPrice(row.paid);
        if (!price) continue;
        const label = row.label.toLowerCase();
        let modelId, modelName;
        if (label.includes('fast')) {
          modelId = allIds.find((id) => id.includes('fast'));
          modelName = 'Imagen 4 Fast';
        } else if (label.includes('ultra')) {
          modelId = allIds.find((id) => id.includes('ultra'));
          modelName = 'Imagen 4 Ultra';
        } else {
          modelId = allIds.find((id) => !id.includes('fast') && !id.includes('ultra'));
          modelName = 'Imagen 4';
        }
        if (modelId) {
          models.push({ name: modelName, id: modelId, type: 'image', costPerImage: price, note: `$${price}/image` });
        }
      }
      continue;
    }

    // ── Veo (per-second, Standard/Fast variants) ──
    if (primaryId.startsWith('veo-')) {
      const rows = parseTableRows(rawSection);
      if (allIds.length === 1) {
        const row = rows.find((r) => /video|price/i.test(r.label) && !r.label.includes('Used'));
        if (row) {
          const price = firstPrice(row.paid);
          if (price)
            models.push({ name: title, id: allIds[0], type: 'video', costPerSecond: price, note: `$${price}/s` });
        }
      } else {
        const stdId = allIds.find((id) => !id.includes('fast'));
        const fastId = allIds.find((id) => id.includes('fast'));
        const stdRow = rows.find((r) => r.label.includes('Standard'));
        const fastRow = rows.find((r) => r.label.includes('Fast'));
        if (stdRow && stdId) {
          const p = firstPrice(stdRow.paid);
          if (p) models.push({ name: title, id: stdId, type: 'video', costPerSecond: p, note: `$${p}/s` });
        }
        if (fastRow && fastId) {
          const p = firstPrice(fastRow.paid);
          if (p) models.push({ name: `${title} Fast`, id: fastId, type: 'video', costPerSecond: p, note: `$${p}/s` });
        }
      }
      continue;
    }

    // ── Gemma (free only) — skip ──
    if (title.startsWith('Gemma')) continue;
    // ── Pricing sections (tools/agents) — skip ──
    if (title.startsWith('Pricing')) continue;

    // ── Parse Standard / Batch tables ──
    const standardIdx = rawSection.indexOf('### Standard');
    const batchIdx = rawSection.indexOf('### Batch');
    let standardText, batchText;
    if (standardIdx >= 0 && batchIdx >= 0) {
      standardText = rawSection.substring(standardIdx, batchIdx);
      batchText = rawSection.substring(batchIdx);
    } else if (standardIdx >= 0) {
      standardText = rawSection.substring(standardIdx);
      batchText = '';
    } else {
      standardText = rawSection;
      batchText = '';
    }

    const stdRows = parseTableRows(standardText);
    const batchRows = parseTableRows(batchText);
    const inputRow = findRow(stdRows, /^Input price/i) || findRow(stdRows, /^Text input price/i);
    const outputRow = findRow(stdRows, /^Output price/i);
    const cacheRow = findRow(stdRows, /[Cc]aching price/i);
    const batchInputRow = findRow(batchRows, /^Input price/i) || findRow(batchRows, /^Text input price/i);
    const batchOutputRow = findRow(batchRows, /^Output price/i);

    // ── Embedding models ──
    if (primaryId.includes('embedding')) {
      const price = inputRow ? firstPrice(inputRow.paid) : null;
      if (price) models.push({ name: title, id: primaryId, type: 'embedding', inputPerMTok: price });
      continue;
    }

    // ── Audio / TTS models ──
    if (primaryId.includes('audio') || primaryId.includes('tts')) {
      const inp = inputRow ? firstPrice(inputRow.paid) : null;
      const out = outputRow ? firstPrice(outputRow.paid) : null;
      if (inp || out) {
        const entry = { name: title, id: primaryId, type: 'audio' };
        if (inp) entry.inputPerMTok = inp;
        if (out) entry.outputPerMTok = out;
        models.push(entry);
      }
      continue;
    }

    // ── Image generation models (Gemini with image output) ──
    if (primaryId.includes('-image') && !primaryId.startsWith('imagen-')) {
      const entry = { name: title, id: primaryId, type: 'imageGeneration' };
      if (inputRow) {
        const inp = firstPrice(inputRow.paid);
        if (inp) entry.inputPerMTok = inp;
      }
      if (outputRow && outputRow.paid) {
        const paid = outputRow.paid;
        const textMatch = paid.match(/\$([\d.]+)\s*\(text/i);
        if (textMatch) entry.outputPerMTok = parseFloat(textMatch[1]);
        const perImageMatch = paid.match(/\$([\d.]+)\s*per\s+(?:[\d.]+K(?:\/[\d.]+K)?\s+)?image/i);
        if (perImageMatch) {
          entry.costPerImage = parseFloat(perImageMatch[1]);
          entry.note = `$${perImageMatch[1]}/image`;
        } else {
          const imgMTokMatch = paid.match(/\$([\d.]+)\s*\(images?\)/i);
          if (imgMTokMatch) {
            const perMTok = parseFloat(imgMTokMatch[1]);
            entry.costPerImage = Math.round(((perMTok * 1290) / 1e6) * 1000) / 1000;
            entry.note = `~$${entry.costPerImage}/image ($${perMTok}/MTok)`;
          }
        }
      }
      models.push(entry);
      continue;
    }

    // ── Text / ChatCompletion models (default) ──
    if (!inputRow || !outputRow) continue;
    const inputPrice = firstPrice(inputRow.paid);
    const outputPrice = firstPrice(outputRow.paid);
    if (!inputPrice || !outputPrice) continue;

    const entry = {
      name: title,
      id: primaryId,
      inputPerMTok: inputPrice,
      outputPerMTok: outputPrice,
      deprecated: !!deprecated,
    };

    // Cache pricing
    if (cacheRow) {
      const cp = firstPrice(cacheRow.paid);
      if (cp) entry.cacheRead = cp;
    }

    // Context tiers (>200K)
    if (inputRow.paid.includes('>')) {
      const prices = allPrices(inputRow.paid);
      if (prices.length >= 2) entry.longContextInput = prices[1];
    }
    if (outputRow.paid.includes('>')) {
      const prices = allPrices(outputRow.paid);
      if (prices.length >= 2) entry.longContextOutput = prices[1];
    }

    // Batch pricing
    if (batchInputRow) {
      const bp = firstPrice(batchInputRow.paid);
      if (bp) entry.batchInput = bp;
    }
    if (batchOutputRow) {
      const bp = firstPrice(batchOutputRow.paid);
      if (bp) entry.batchOutput = bp;
    }

    models.push(entry);
  }

  console.error(`  Google: ${models.length} models extracted`);
  if (models.length === 0) {
    const rawPath = '/tmp/aigne-raw-google.md';
    fs.writeFileSync(rawPath, md);
    console.error(`  ⚠️  Markdown parse extracted 0 models — raw saved to ${rawPath}`);
    return { provider: 'Google', url, models, rawTextPath: rawPath };
  }
  return { provider: 'Google', url, models };
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────
// Delegates to scrape-openai-pricing.mjs (the full, optimized scraper)

const OPENAI_URL = 'https://developers.openai.com/api/docs/pricing?latest-pricing=standard';

/**
 * Convert the native scraper output (section-based) to the models array format
 * expected by official-pricing-catalog.mjs downstream code (HTML + cache).
 */
function scraperOutputToModels(output) {
  const models = [];

  // ── text models → standard chatCompletion models ──
  if (output.text) {
    for (const [id, data] of Object.entries(output.text)) {
      const model = { name: id, id, inputPerMTok: data.input, outputPerMTok: data.output };
      if (data.cachedInput != null) model.cacheRead = data.cachedInput;
      if (data.contextTiers) {
        const tiers = Object.entries(data.contextTiers);
        if (tiers.length > 0) {
          const [threshold, tier] = tiers[0];
          model.longContextInput = tier.input;
          model.longContextOutput = tier.output;
          model.longContextThreshold = threshold;
          if (tier.cachedInput != null) model.longContextCachedInput = tier.cachedInput;
        }
      }
      models.push(model);
    }
  }

  // ── image token models ──
  if (output.image) {
    for (const [id, data] of Object.entries(output.image)) {
      const model = {
        name: `${id} (image tokens)`,
        id: `${id}/image`,
        inputPerMTok: data.input,
        outputPerMTok: data.output,
        type: 'image',
      };
      if (data.cachedInput != null) model.cacheRead = data.cachedInput;
      models.push(model);
    }
  }

  // ── audio token models ──
  if (output.audio) {
    for (const [id, data] of Object.entries(output.audio)) {
      const model = {
        name: `${id} (audio tokens)`,
        id: `${id}/audio`,
        inputPerMTok: data.input,
        outputPerMTok: data.output,
        type: 'audio',
      };
      if (data.cachedInput != null) model.cacheRead = data.cachedInput;
      models.push(model);
    }
  }

  // ── video models ──
  if (output.video) {
    for (const [id, data] of Object.entries(output.video)) {
      const model = { name: id, id, type: 'video', costPerSecond: data.perSecond, note: `$${data.perSecond}/s` };
      if (data.resolutionTiers) {
        for (const [res, tier] of Object.entries(data.resolutionTiers)) {
          model.note += `, $${tier.perSecond}/s (${res})`;
        }
      }
      models.push(model);
    }
  }

  // ── transcription & speech ──
  if (output.transcription) {
    for (const [id, data] of Object.entries(output.transcription)) {
      if (data.text || data.audio) {
        // Token-based transcription/TTS model
        const model = { name: id, id, type: 'transcription' };
        if (data.text?.input != null) model.inputPerMTok = data.text.input;
        if (data.text?.output != null) model.outputPerMTok = data.text.output;
        if (data.estimatedPerMinute != null) model.costPerMinute = data.estimatedPerMinute;
        models.push(model);
      } else if (data.perMinute != null) {
        models.push({
          name: id,
          id,
          type: 'transcription',
          costPerMinute: data.perMinute,
          note: `$${data.perMinute}/min`,
        });
      } else if (data.perMillionChars != null) {
        models.push({
          name: id,
          id,
          type: 'tts',
          costPerMillionChars: data.perMillionChars,
          note: `$${data.perMillionChars}/1M chars`,
        });
      }
    }
  }

  // ── fine-tuning ──
  if (output.fineTuning) {
    for (const [id, data] of Object.entries(output.fineTuning)) {
      const model = { name: id, id, inputPerMTok: data.input, outputPerMTok: data.output, type: 'fineTuning' };
      if (data.cachedInput != null) model.cacheRead = data.cachedInput;
      if (data.trainingPerMTok != null) model.trainingPerMTok = data.trainingPerMTok;
      if (data.trainingPerHour != null) model.trainingPerHour = data.trainingPerHour;
      models.push(model);
    }
  }

  // ── image generation (per-image) ──
  if (output.imageGeneration) {
    for (const [id, data] of Object.entries(output.imageGeneration)) {
      if (data.variants && data.variants.length > 0) {
        const cheapest = Math.min(...data.variants.map((v) => v.perImage));
        models.push({
          name: id,
          id,
          type: 'imageGeneration',
          costPerImage: cheapest,
          imageVariants: data.variants,
          note: `$${cheapest}–$${Math.max(...data.variants.map((v) => v.perImage))}/image`,
        });
      }
    }
  }

  // ── embeddings ──
  if (output.embedding) {
    for (const [id, data] of Object.entries(output.embedding)) {
      models.push({ name: id, id, inputPerMTok: data.input, type: 'embedding' });
    }
  }

  // ── built-in tools ──
  if (output.builtInTools) {
    for (const [id, data] of Object.entries(output.builtInTools)) {
      const model = { name: id, id, type: 'tool' };
      if (data.per1kCalls != null) model.note = `$${data.per1kCalls}/1k calls`;
      if (data.per20min != null) model.note = `$${data.per20min}/20min`;
      if (data.perGBPerDay != null) model.note = `$${data.perGBPerDay}/GB-day`;
      models.push(model);
    }
  }

  // ── legacy ──
  if (output.legacy) {
    for (const [id, data] of Object.entries(output.legacy)) {
      models.push({ name: id, id, inputPerMTok: data.input, outputPerMTok: data.output, deprecated: true });
    }
  }

  return models;
}

async function scrapeOpenAI() {
  const url = OPENAI_URL;
  const scraperPath = join(__dirname, 'scrape-openai-pricing.mjs');

  console.error('Fetching OpenAI pricing from developers.openai.com ...');

  try {
    const stdout = execSync(`node "${scraperPath}" --no-llm`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // The scraper writes JSON to stdout, logs to stderr
    const output = JSON.parse(stdout.trim());
    const models = scraperOutputToModels(output);

    console.error(`  OpenAI: ${models.length} models extracted (official, Standard tier)`);
    return { provider: 'OpenAI', url, models };
  } catch (err) {
    console.error(`  Failed to run scrape-openai-pricing.mjs: ${err.message}`);
    return { provider: 'OpenAI', url, models: [] };
  }
}

// ─── DeepSeek ─────────────────────────────────────────────────────────────────
async function scrapeDeepSeek() {
  const url = 'https://api-docs.deepseek.com/quick_start/pricing';
  console.error('Fetching DeepSeek pricing...');
  const html = await fetch(url);
  const text = strip(html);
  const models = [];

  // DeepSeek page has a single table with 2 models sharing the same pricing.
  // Format: "1M INPUT TOKENS (CACHE MISS) $X.XX" / "1M INPUT TOKENS (CACHE HIT) $X.XX" / "1M OUTPUT TOKENS $X.XX"
  const cacheMiss = text.match(/CACHE MISS[^$]*\$([\d.]+)/i);
  const cacheHit = text.match(/CACHE HIT[^$]*\$([\d.]+)/i);
  const outputMatch = text.match(/1M OUTPUT TOKENS[^$]*\$([\d.]+)/i);

  if (cacheMiss && outputMatch) {
    const inputPerMTok = parseFloat(cacheMiss[1]);
    const outputPerMTok = parseFloat(outputMatch[1]);
    const cacheReadPerMTok = cacheHit ? parseFloat(cacheHit[1]) : null;

    // Both models share identical pricing
    for (const { id, name } of [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3.2 Non-thinking)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (V3.2 Thinking)' },
    ]) {
      const entry = { id, name, inputPerMTok, outputPerMTok };
      if (cacheReadPerMTok != null) entry.cacheRead = cacheReadPerMTok;
      models.push(entry);
    }
  }

  console.error(`  DeepSeek: ${models.length} models extracted`);
  if (models.length === 0) {
    const rawPath = '/tmp/aigne-raw-deepseek.txt';
    fs.writeFileSync(rawPath, text);
    console.error(`  ⚠️  Regex extracted 0 models — raw text saved to ${rawPath}`);
    return { provider: 'DeepSeek', url, models, rawTextPath: rawPath };
  }
  return { provider: 'DeepSeek', url, models };
}

// ─── xAI ──────────────────────────────────────────────────────────────────────
async function scrapeXAI() {
  const url = 'https://docs.x.ai/developers/models';
  console.error('Fetching xAI pricing...');

  // xAI has intermittent TLS issues with Node https — use Python as fallback
  let html;
  try {
    html = await fetch(url);
  } catch {
    try {
      const { execFileSync } = await import('child_process');
      html = execFileSync(
        'python3',
        [
          '-c',
          `import urllib.request;r=urllib.request.urlopen(urllib.request.Request('${url}',headers={'User-Agent':'${UA}'}),timeout=20);print(r.read().decode())`,
        ],
        { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
      ).toString();
    } catch (e2) {
      console.error(`  xAI: TLS/fetch failed: ${e2.message}`);
      return { provider: 'xAI', url, models: [] };
    }
  }

  const models = [];
  const seen = new Set();

  // xAI uses Next.js RSC format with LanguageModel entries in escaped JSON.
  // Prices use "$nXXXXX" format where value = XXXXX / 10000 gives $/MTok.
  const marker = '\\"auth_mgmt.LanguageModel\\"';
  const parts = html.split(marker);

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const name = p.match(/\\"name\\":\\"([^\\]+)\\"/)?.[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const $n = (field) => {
      const m = p.match(new RegExp(`\\\\"${field}\\\\":\\\\"\\\$n(\\d+)\\\\"`));
      return m ? parseInt(m[1]) / 10000 : null;
    };

    const inputPerMTok = $n('promptTextTokenPrice');
    const outputPerMTok = $n('completionTextTokenPrice');
    if (inputPerMTok == null && outputPerMTok == null) continue;

    const cachedPerMTok = $n('cachedPromptTokenPrice');
    const longCtxIn = $n('promptTextTokenPriceLongContext');
    const longCtxOut = $n('completionTokenPriceLongContext');
    const maxPrompt = p.match(/\\"maxPromptLength\\":(\d+)/)?.[1];
    const aliasesRaw = p.match(/\\"aliases\\":\[([^\]]*)\]/)?.[1];
    const aliases = aliasesRaw ? aliasesRaw.replace(/\\"/g, '').split(',').filter(Boolean) : [];

    const entry = { id: name, name, inputPerMTok, outputPerMTok };
    if (cachedPerMTok) entry.cacheRead = cachedPerMTok;
    if (longCtxIn) {
      entry.longContextInput = longCtxIn;
      entry.longContextThreshold = '>128K';
    }
    if (longCtxOut) entry.longContextOutput = longCtxOut;
    if (maxPrompt) entry.maxContext = parseInt(maxPrompt);

    // Register alias models as separate entries (same pricing)
    models.push(entry);
    for (const alias of aliases) {
      if (!seen.has(alias)) {
        seen.add(alias);
        models.push({ ...entry, id: alias, name: alias });
      }
    }
  }

  // Image generation models
  const imgMarker = '\\"auth_mgmt.ImageGenerationModel\\"';
  const imgParts = html.split(imgMarker);
  for (let i = 1; i < imgParts.length; i++) {
    const p = imgParts[i];
    const name = p.match(/\\"name\\":\\"([^\\]+)\\"/)?.[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const priceRaw = p.match(/\\"pricePerImage\\":\\"\$n(\d+)\\"/)?.[1];
    if (priceRaw) {
      models.push({ id: name, name, type: 'imageGeneration', costPerImage: parseInt(priceRaw) / 10000 });
    }
  }

  // Video generation models
  const vidMarker = '\\"auth_mgmt.VideoGenerationModel\\"';
  const vidParts = html.split(vidMarker);
  for (let i = 1; i < vidParts.length; i++) {
    const p = vidParts[i];
    const name = p.match(/\\"name\\":\\"([^\\]+)\\"/)?.[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const priceRaw = p.match(/\\"pricePerSecond\\":\\"\$n(\d+)\\"/)?.[1];
    if (priceRaw) {
      models.push({ id: name, name, type: 'video', costPerSecond: parseInt(priceRaw) / 10000 });
    }
  }

  console.error(`  xAI: ${models.length} models extracted`);
  if (models.length === 0) {
    const rawPath = '/tmp/aigne-raw-xai.txt';
    fs.writeFileSync(rawPath, html.substring(0, 500000));
    console.error(`  ⚠️  Regex extracted 0 models — raw text saved to ${rawPath}`);
    return { provider: 'xAI', url, models, rawTextPath: rawPath };
  }
  return { provider: 'xAI', url, models };
}

// ─── HTML Generation ────────────────────────────────────────────────────────
function generateHTML(results, hubMap) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const hasHub = hubMap.size > 0;

  const providerColors = {
    Anthropic: { bg: '#fef3e2', border: '#f59e0b', header: '#92400e' },
    Google: { bg: '#e8f5e9', border: '#4caf50', header: '#1b5e20' },
    OpenAI: { bg: '#e3f2fd', border: '#2196f3', header: '#0d47a1' },
  };

  function fmtPrice(v) {
    if (v === undefined || v === null) return '<span class="na">-</span>';
    if (v === 0) return '$0';
    if (v < 0.01) return '$' + v.toExponential(2);
    if (v < 1) return '$' + v.toFixed(3);
    return '$' + v.toFixed(2);
  }

  // Format per-token cost as $/MTok
  function fmtTokenCost(perToken) {
    if (perToken === undefined || perToken === null || perToken === 0) return '<span class="na">-</span>';
    const perMTok = perToken * 1e6;
    return fmtPrice(perMTok);
  }

  function calcDrift(hubVal, officialVal) {
    if (hubVal == null || officialVal == null || officialVal === 0) return null;
    return ((hubVal - officialVal) / officialVal) * 100;
  }

  function driftBadge(pct) {
    if (pct == null) return '';
    if (Math.abs(pct) < 0.5) return '';
    const sign = pct >= 0 ? '+' : '';
    const label = sign + pct.toFixed(1) + '%';
    const cls = Math.abs(pct) <= 2 ? 'drift-even' : pct < 0 ? 'drift-loss' : 'drift-up';
    return `<span class="drift ${cls}">${label}</span>`;
  }

  function tierBadge(label, cls) {
    return `<span class="tier-badge ${cls}">${label}</span>`;
  }

  function matchBadge(status) {
    if (status === 'matched') return '<span class="match-badge matched">Hub</span>';
    if (status === 'unmatched') return '';
    if (status === 'hub-only') return '<span class="match-badge hub-only">Hub Only</span>';
    return '';
  }

  function renderProvider(result) {
    const colors = providerColors[result.provider] || providerColors.OpenAI;
    const models = result.models;

    if (!models.length) {
      return `<div class="provider-card" style="border-color:${colors.border}">
        <div class="provider-header" style="background:${colors.bg};color:${colors.header}">
          <h2>${result.provider}</h2>
          <span class="model-count">0 models</span>
        </div>
        <p class="empty-msg">No pricing data available</p>
      </div>`;
    }

    // Build provider-specific extra header columns
    let extraHeaders = '';
    if (result.provider === 'Anthropic') {
      extraHeaders = '<th>Cache 5m</th><th>Cache 1h</th><th>Cache Read</th>';
    } else if (result.provider === 'OpenAI') {
      extraHeaders = '<th>Cache Write</th><th>Cache Read</th>';
    }

    // Hub columns (conditional) — 2 columns: Hub In + Hub Out with drift badges
    const hubHeaders = hasHub ? '<th class="hub-col">Hub In</th><th class="hub-col">Hub Out</th>' : '';

    const na = '<span class="na">-</span>';

    function extraCols(m, isTier) {
      if (result.provider === 'Anthropic') {
        if (isTier) return `<td class="mono">${na}</td><td class="mono">${na}</td><td class="mono">${na}</td>`;
        return `<td class="mono">${fmtPrice(m.cacheWrite5m)}</td><td class="mono">${fmtPrice(m.cacheWrite1h)}</td><td class="mono">${fmtPrice(m.cacheRead)}</td>`;
      }
      if (result.provider === 'OpenAI') {
        if (isTier) return `<td class="mono">${na}</td><td class="mono">${na}</td>`;
        return `<td class="mono">${fmtPrice(m.cacheWrite)}</td><td class="mono">${fmtPrice(m.cacheRead)}</td>`;
      }
      return '';
    }

    // Hub columns: show hub sell price + drift vs official price for this tier
    function hubCols(hub, officialInput, officialOutput) {
      if (!hasHub) return '';
      if (!hub) return `<td class="mono hub-col">${na}</td><td class="mono hub-col">${na}</td>`;
      const hubIn = hub.inputRate ? hub.inputRate * 1e6 : null;
      const hubOut = hub.outputRate ? hub.outputRate * 1e6 : null;
      const dIn = calcDrift(hubIn, officialInput);
      const dOut = calcDrift(hubOut, officialOutput);
      return `<td class="mono hub-col">${fmtPrice(hubIn)} ${driftBadge(dIn)}</td><td class="mono hub-col">${fmtPrice(hubOut)} ${driftBadge(dOut)}</td>`;
    }

    // Count tiers per model for rowspan calculation
    function countTiers(m) {
      let n = 1; // standard
      if (m.longContextInput) n++;
      if (m.fastModeInput) n++;
      if (m.batchInput !== undefined || m.batchOutput !== undefined) n++;
      return n;
    }

    // Track matched Hub model IDs for this provider
    const matchedHubKeys = new Set();

    let rows = '';
    let lastFamily = '';

    // Count total columns for family-row colspan
    let totalCols = 4; // Model + Tier + Input + Output
    if (result.provider === 'Anthropic') totalCols += 3;
    else if (result.provider === 'OpenAI') totalCols += 2;
    if (hasHub) totalCols += 2;

    for (const m of models) {
      // Family group header (OpenAI only)
      if (m.family && m.family !== lastFamily) {
        lastFamily = m.family;
        rows += `<tr class="family-row"><td colspan="${totalCols}"><strong>${m.family}</strong></td></tr>`;
      }

      const hub = findHubMatch(hubMap, m.id, result.provider);
      if (hub) {
        const dbProviders =
          result.provider === 'Anthropic' ? ['anthropic'] : result.provider === 'Google' ? ['google'] : ['openai'];
        for (const dp of dbProviders) matchedHubKeys.add(`${dp}/${m.id}`);
      }

      const tierCount = countTiers(m);
      const cls = [];
      if (m.deprecated) cls.push('deprecated');
      if (m.type === 'image' || m.type === 'tts' || m.type === 'stt' || m.type === 'embedding') cls.push('special');

      const depBadge = m.deprecated ? '<span class="badge dep">deprecated</span>' : '';
      const typeBadge = m.type && m.type !== 'chatCompletion' ? `<span class="badge type">${m.type}</span>` : '';
      const hubBadge = hub ? matchBadge('matched') : '';
      const aliasInfo = m.aliases?.length ? `<div class="aliases">${m.aliases.join(', ')}</div>` : '';
      const noteInfo = m.note ? `<div class="aliases">${m.note}</div>` : '';

      // Standard tier row (first row with rowspan model cell)
      rows += `<tr class="model-row ${cls.join(' ')}" data-model="${m.id}">
        <td class="model-name" rowspan="${tierCount}">${m.name}${depBadge}${typeBadge}${hubBadge}${aliasInfo}${noteInfo}</td>
        <td class="tier-cell">${tierBadge('Standard', 'standard')}</td>
        <td class="mono">${fmtPrice(m.inputPerMTok)}</td>
        <td class="mono">${fmtPrice(m.outputPerMTok)}</td>
        ${extraCols(m, false)}
        ${hubCols(hub, m.inputPerMTok, m.outputPerMTok)}
      </tr>`;

      // Long context tier
      if (m.longContextInput) {
        rows += `<tr class="tier-row tier-context" data-model="${m.id}">
          <td class="tier-cell">${tierBadge('> 200K', 'context')}</td>
          <td class="mono">${fmtPrice(m.longContextInput)}</td>
          <td class="mono">${fmtPrice(m.longContextOutput)}</td>
          ${extraCols(m, true)}
          ${hubCols(hub, m.longContextInput, m.longContextOutput)}
        </tr>`;
      }

      // Fast mode tier
      if (m.fastModeInput) {
        rows += `<tr class="tier-row tier-fast" data-model="${m.id}">
          <td class="tier-cell">${tierBadge('Fast Mode', 'fast')}</td>
          <td class="mono">${fmtPrice(m.fastModeInput)}</td>
          <td class="mono">${fmtPrice(m.fastModeOutput)}</td>
          ${extraCols(m, true)}
          ${hubCols(hub, m.fastModeInput, m.fastModeOutput)}
        </tr>`;
      }

      // Batch tier
      if (m.batchInput !== undefined || m.batchOutput !== undefined) {
        rows += `<tr class="tier-row tier-batch" data-model="${m.id}">
          <td class="tier-cell">${tierBadge('Batch', 'batch')}</td>
          <td class="mono">${fmtPrice(m.batchInput)}</td>
          <td class="mono">${fmtPrice(m.batchOutput)}</td>
          ${extraCols(m, true)}
          ${hubCols(hub, m.batchInput, m.batchOutput)}
        </tr>`;
      }
    }

    // Hub-only models for this provider
    let hubOnlyRows = '';
    if (hasHub) {
      const dbProviderName =
        result.provider === 'Anthropic' ? 'anthropic' : result.provider === 'Google' ? 'google' : 'openai';
      const hubOnlyModels = [];
      for (const [key, hub] of hubMap) {
        if (hub.provider !== dbProviderName) continue;
        if (matchedHubKeys.has(key)) continue;
        hubOnlyModels.push(hub);
      }

      if (hubOnlyModels.length > 0) {
        hubOnlyRows += `<tr class="hub-only-divider"><td colspan="${totalCols}">Hub Only - Not in official pricing</td></tr>`;
        for (const hub of hubOnlyModels) {
          const extraNa =
            result.provider === 'Anthropic'
              ? `<td class="mono">${na}</td><td class="mono">${na}</td><td class="mono">${na}</td>`
              : result.provider === 'OpenAI'
                ? `<td class="mono">${na}</td><td class="mono">${na}</td>`
                : '';

          hubOnlyRows += `<tr class="hub-only-row" data-model="${hub.model}">
            <td class="model-name">${hub.model}${matchBadge('hub-only')}</td>
            <td class="tier-cell">${tierBadge('Standard', 'standard')}</td>
            <td class="mono">${na}</td>
            <td class="mono">${na}</td>
            ${extraNa}
            <td class="mono hub-col">${fmtTokenCost(hub.inputRate)}</td>
            <td class="mono hub-col">${fmtTokenCost(hub.outputRate)}</td>
          </tr>`;
        }
      }
    }

    const sourceNote = result.sourceNote
      ? `<div class="source-note">${result.sourceNote}</div>`
      : `<div class="source-note">Source: <a href="${result.url}" target="_blank">${result.url}</a></div>`;

    const modelCount = models.length;

    return `<div class="provider-card" style="border-color:${colors.border}">
      <div class="provider-header" style="background:${colors.bg};color:${colors.header}">
        <h2>${result.provider}</h2>
        <span class="model-count">${modelCount} models</span>
      </div>
      ${sourceNote}
      <div class="table-wrapper">
      <table>
        <thead><tr>
          <th class="col-model">Model</th>
          <th class="col-tier">Tier</th>
          <th>Input / MTok</th>
          <th>Output / MTok</th>
          ${extraHeaders}
          ${hubHeaders}
        </tr></thead>
        <tbody>${rows}${hubOnlyRows}</tbody>
      </table>
      </div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Official Pricing Catalog — ${ts}</title>
<style>
  :root {
    --bg: #f8fafc; --card: #fff; --border: #e2e8f0;
    --text: #1e293b; --muted: #64748b; --mono: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5; padding: 24px;
  }
  .header {
    max-width: 1400px; margin: 0 auto 32px; text-align: center;
  }
  .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .header .ts { color: var(--muted); font-size: 14px; }
  .header .hub-info { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .search-bar {
    max-width: 1400px; margin: 0 auto 24px; display: flex; gap: 12px; align-items: center;
  }
  .search-bar input {
    flex: 1; padding: 10px 16px; border: 1px solid var(--border); border-radius: 8px;
    font-size: 15px; outline: none; transition: border-color 0.2s;
  }
  .search-bar input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .provider-card {
    max-width: 1400px; margin: 0 auto 32px; background: var(--card);
    border-radius: 12px; border-left: 4px solid; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .provider-header {
    padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;
  }
  .provider-header h2 { font-size: 20px; font-weight: 700; }
  .model-count {
    font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 20px;
    background: rgba(0,0,0,0.08);
  }
  .source-note {
    padding: 8px 24px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--border);
  }
  .source-note a { color: inherit; }
  .table-wrapper { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th {
    text-align: left; padding: 10px 12px; background: #f1f5f9;
    font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--muted); white-space: nowrap; position: sticky; top: 0;
  }
  td { padding: 8px 12px; border-top: 1px solid var(--border); vertical-align: top; }
  .col-model { min-width: 200px; }
  .col-tier { min-width: 90px; }
  .mono { font-family: var(--mono); font-size: 13px; white-space: nowrap; }
  .na { color: #cbd5e1; }
  .model-name { font-weight: 500; }

  /* Badges */
  .badge {
    display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px;
    border-radius: 4px; margin-left: 6px; vertical-align: middle;
  }
  .badge.dep { background: #fee2e2; color: #991b1b; }
  .badge.type { background: #ede9fe; color: #5b21b6; }
  .aliases {
    font-size: 11px; color: var(--muted); margin-top: 2px; font-style: italic;
  }

  /* Tier badges */
  .tier-badge {
    display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
    border-radius: 4px; white-space: nowrap;
  }
  .tier-badge.standard { background: #f1f5f9; color: #475569; }
  .tier-badge.context { background: #ede9fe; color: #7c3aed; }
  .tier-badge.fast { background: #fff7ed; color: #ea580c; }
  .tier-badge.batch { background: #f0fdf4; color: #16a34a; }
  .tier-cell { white-space: nowrap; }

  /* Match status badges */
  .match-badge {
    display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px;
    border-radius: 3px; margin-left: 6px; vertical-align: middle; text-transform: uppercase;
  }
  .match-badge.matched { background: #dcfce7; color: #166534; }
  .match-badge.hub-only { background: #ffedd5; color: #9a3412; }

  /* Hub columns */
  .hub-col { background: #fefce8; }
  th.hub-col { background: #fef9c3; }

  /* Drift badges */
  .drift {
    display: inline-block; padding: 1px 5px; border-radius: 8px;
    font-size: 10px; font-weight: 600; white-space: nowrap; margin-left: 3px;
  }
  .drift-up { background: #fed7aa; color: #9a3412; }
  .drift-loss { background: #fed7d7; color: #c53030; }
  .drift-even { background: #fefcbf; color: #975a16; }

  /* Tier sub-rows */
  .tier-row td { background: #fafbfc; border-top: 1px dashed #e2e8f0; padding-top: 5px; padding-bottom: 5px; }
  .tier-fast td { background: #fffbeb; }
  .tier-batch td { background: #f0fdf4; }
  .tier-context td { background: #faf5ff; }

  /* Model row - border between different models */
  .model-row td { border-top: 1px solid var(--border); }
  .model-row td[rowspan] { border-right: 1px solid var(--border); vertical-align: middle; }

  /* Family row */
  .family-row td {
    background: #f8fafc; font-size: 12px; padding: 6px 12px;
    color: var(--muted); border-top: 2px solid var(--border);
  }
  .family-row strong { color: var(--text); }

  /* Hub-only section */
  .hub-only-divider td {
    background: #fff7ed; font-size: 12px; font-weight: 600; color: #9a3412;
    padding: 8px 12px; border-top: 2px solid #fed7aa;
  }
  .hub-only-row td { background: #fffbeb; }

  tr.deprecated td { opacity: 0.6; }
  tr.special td:first-child { font-style: italic; }
  tr.model-row:hover td, tr.model-row:hover + .tier-row td { background: #f8fafc; }
  .empty-msg { padding: 24px; text-align: center; color: var(--muted); }

  @media (max-width: 1100px) {
    body { padding: 12px; }
    th, td { padding: 6px 8px; font-size: 12px; }
    .col-model { min-width: 140px; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Official Pricing Catalog</h1>
  <div class="ts">Generated: ${ts}</div>
  ${hasHub ? '<div class="hub-info">Hub data integrated</div>' : ''}
</div>
<div class="search-bar">
  <input type="text" id="search" placeholder="Search models... (e.g. opus, gemini, gpt-4o)" autofocus>
</div>

${results.map(renderProvider).join('\n')}

<script>
document.getElementById('search').addEventListener('input', function(e) {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('tbody').forEach(tbody => {
    let currentModelVisible = false;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr.classList.contains('family-row') || tr.classList.contains('hub-only-divider')) {
        tr.style.display = !q ? '' : 'none';
        tr._show = false;
        return;
      }
      if (tr.classList.contains('tier-row')) {
        tr.style.display = currentModelVisible ? '' : 'none';
        return;
      }
      // Model row or hub-only-row
      const modelId = tr.getAttribute('data-model') || '';
      const text = tr.textContent.toLowerCase();
      currentModelVisible = !q || text.includes(q) || modelId.includes(q);
      tr.style.display = currentModelVisible ? '' : 'none';
      // Show family/divider header
      if (currentModelVisible && q) {
        let prev = tr.previousElementSibling;
        while (prev && !prev.classList.contains('family-row') && !prev.classList.contains('hub-only-divider')) {
          prev = prev.previousElementSibling;
        }
        if (prev) prev.style.display = '';
      }
    });
  });
});
</script>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  // Fetch official pricing + Hub rates in parallel
  const [scrapeResults, hubMap] = await Promise.all([
    Promise.allSettled([scrapeAnthropic(), scrapeGoogle(), scrapeOpenAI(), scrapeDeepSeek(), scrapeXAI()]),
    fetchHubRates(opts.hubUrl),
  ]);

  const data = scrapeResults.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const name = ['Anthropic', 'Google', 'OpenAI', 'DeepSeek', 'xAI'][i];
    console.error(`Failed to scrape ${name}: ${r.reason?.message}`);
    return { provider: name, url: '', models: [] };
  });

  if (opts.json) {
    // Include Hub data in JSON output
    const jsonOutput = data.map((d) => {
      const modelsWithHub = d.models.map((m) => {
        const hub = findHubMatch(hubMap, m.id, d.provider);
        return { ...m, hub: hub || null };
      });
      const out = { ...d, models: modelsWithHub };
      if (d.rawTextPath) out.rawTextPath = d.rawTextPath;
      return out;
    });
    process.stdout.write(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // ── Write per-provider OfficialPricingCache if --cache flag is set ──
  // Each provider gets its own cache file so failures don't affect other providers
  if (opts.cache) {
    const providerNameMap = {
      Anthropic: 'anthropic',
      Google: 'google',
      OpenAI: 'openai',
      DeepSeek: 'deepseek',
      xAI: 'xai',
    };

    // Determine modelType
    const modelTypeMap = {
      embedding: 'embedding',
      image: 'imageGeneration',
      imageGeneration: 'imageGeneration',
      video: 'video',
      fineTuning: 'fineTuning',
      audio: 'audio',
      transcription: 'transcription',
      tts: 'audio',
    };

    // Determine pricingUnit
    const pricingUnitMap = {
      imageGeneration: 'per-image',
      video: 'per-second',
    };

    let totalEntries = 0;

    for (const d of data) {
      const providerKey = providerNameMap[d.provider] || d.provider.toLowerCase();
      const sourceUrl = d.url || '';
      const entries = [];

      for (const m of d.models) {
        // Skip models with no pricing data (tools, notes-only)
        const hasTokenPricing = m.inputPerMTok || m.outputPerMTok;
        const hasUnitPricing = m.type === 'image' || m.type === 'video' || m.type === 'imageGeneration';
        const hasSpecialPricing =
          m.costPerImage != null || m.costPerSecond != null || m.costPerMinute != null || m.costPerMillionChars != null;
        if (!hasTokenPricing && !hasUnitPricing && !hasSpecialPricing) continue;

        const entry = {
          provider: providerKey,
          modelId: m.id,
          displayName: m.name,
          pricingUnit: pricingUnitMap[m.type] || 'per-token',
          modelType: modelTypeMap[m.type] || 'chatCompletion',
          sourceUrl,
          extractionMethod: 'catalog-scraper',
        };

        // Token pricing ($/MTok → $/token)
        if (m.inputPerMTok != null) entry.inputCostPerToken = m.inputPerMTok / 1e6;
        if (m.outputPerMTok != null) entry.outputCostPerToken = m.outputPerMTok / 1e6;

        // Cache tiers
        const cacheTiers = [];
        if (m.cacheWrite5m != null) cacheTiers.push({ label: '5min-write', costPerToken: m.cacheWrite5m / 1e6 });
        if (m.cacheWrite1h != null) cacheTiers.push({ label: '1h-write', costPerToken: m.cacheWrite1h / 1e6 });
        if (m.cacheRead != null) {
          cacheTiers.push({ label: 'read', costPerToken: m.cacheRead / 1e6 });
          entry.cachedInputCostPerToken = m.cacheRead / 1e6;
        }
        // OpenAI cache format
        if (m.cacheWrite != null) cacheTiers.push({ label: 'write', costPerToken: m.cacheWrite / 1e6 });
        if (cacheTiers.length > 0) entry.cacheTiers = cacheTiers;

        // Context tiers (long context pricing)
        if (m.longContextInput != null || m.longContextOutput != null) {
          entry.contextTiers = [
            {
              threshold: m.longContextThreshold || '>200K',
              inputCostPerToken: m.longContextInput != null ? m.longContextInput / 1e6 : undefined,
              outputCostPerToken: m.longContextOutput != null ? m.longContextOutput / 1e6 : undefined,
            },
          ];
        }

        // Batch pricing
        if (m.batchInput != null || m.batchOutput != null) {
          entry.batchPricing = {
            inputCostPerToken: m.batchInput != null ? m.batchInput / 1e6 : 0,
            outputCostPerToken: m.batchOutput != null ? m.batchOutput / 1e6 : 0,
          };
        }

        // Special modes (fast mode)
        if (m.fastModeInput != null || m.fastModeOutput != null) {
          entry.specialModes = [
            {
              mode: 'fast-mode',
              inputCostPerToken: m.fastModeInput != null ? m.fastModeInput / 1e6 : undefined,
              outputCostPerToken: m.fastModeOutput != null ? m.fastModeOutput / 1e6 : undefined,
            },
          ];
        }

        // Image generation (per-image pricing)
        if (m.costPerImage != null) entry.costPerImage = m.costPerImage;
        if (m.imageVariants) {
          entry.imageVariants = m.imageVariants.map((v) => ({
            quality: v.quality,
            size: v.size,
            costPerImage: v.perImage,
          }));
        }

        // Video (per-second pricing)
        if (m.costPerSecond != null) entry.costPerSecond = m.costPerSecond;

        // Fine-tuning training cost
        if (m.trainingPerMTok != null) entry.trainingCostPerToken = m.trainingPerMTok / 1e6;
        if (m.trainingPerHour != null) entry.trainingCostPerHour = m.trainingPerHour;

        // Transcription / TTS
        if (m.costPerMinute != null) {
          entry.costPerMinute = m.costPerMinute;
          entry.pricingUnit = 'per-minute';
        }
        if (m.costPerMillionChars != null) entry.costPerMillionChars = m.costPerMillionChars;

        if (m.deprecated) entry.deprecated = true;

        entries.push(entry);
      }

      // Write per-provider cache file (each provider independent, failures don't affect others)
      const cacheFile = join(__dirname, '..', 'output', `official-pricing-${providerKey}.json`);
      if (entries.length > 0) {
        const cache = { timestamp: Date.now(), entries };
        fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
        console.error(`  ${d.provider}: ${entries.length} entries → ${cacheFile}`);
      } else if (d.rawTextPath) {
        // Scrape failed — don't overwrite existing cache, report for manual analysis
        console.error(`  ⚠️  ${d.provider}: 0 entries (raw text saved to ${d.rawTextPath})`);
      } else {
        console.error(`  ${d.provider}: 0 entries (skipped)`);
      }
      totalEntries += entries.length;
    }

    console.error(`✅ Cache written: ${totalEntries} entries total (per-provider files)`);
  }

  const html = generateHTML(data, hubMap);
  const outPath = opts.outputFile || join(__dirname, '..', 'output', 'official-pricing-catalog.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.error(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
