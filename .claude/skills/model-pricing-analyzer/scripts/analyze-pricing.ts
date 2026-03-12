#!/usr/bin/env npx ts-node
/**
 * Model Pricing Analyzer
 *
 * Fetches current model rates from AIGNE Hub API and compares them
 * against LiteLLM and OpenRouter external pricing sources.
 *
 * Usage:
 *   npx ts-node scripts/analyze-pricing.ts [options]
 *
 * Options:
 *   --env <env>         Environment: local, staging, production
 *   --hub-url <url>     Hub API base URL (overrides env default)
 *   --threshold <n>     Drift threshold as decimal (default: 0.1 = 10%)
 *   --json              Output as JSON instead of table
 *   --token <token>     Auth token (only needed for write operations, read is public)
 *
 * Note: The model-rates API is publicly readable. Authentication is only
 *       required for write operations like bulk-rate-update.
 *
 * Examples:
 *   pnpm tsx scripts/analyze-pricing.ts --env staging
 *   pnpm tsx scripts/analyze-pricing.ts --env production
 *   pnpm tsx scripts/analyze-pricing.ts --hub-url https://staging-hub.aigne.io
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import axios from 'axios';

import { buildApiUrl } from './detect-mount-point.mjs';

const LITELLM_API_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

interface CliOptions {
  env?: string;
  hubUrl: string;
  threshold: number;
  json: boolean;
  token?: string;
}

const ENV_URLS: Record<string, string> = {
  local: '', // Must be provided via --hub-url (dynamic DID address)
  staging: 'https://staging-hub.aigne.io',
  production: 'https://hub.aigne.io',
};

async function loadStoredToken(env: string, hubUrl: string): Promise<string | null> {
  try {
    const storeFile = path.join(os.homedir(), '.aigne-hub', 'credentials.json');
    const data = await fs.readFile(storeFile, 'utf-8');
    const creds = JSON.parse(data);
    const envKey = `${env}:${hubUrl}`;
    return creds[envKey]?.token || null;
  } catch (error) {
    return null;
  }
}

interface DbRate {
  id: string;
  providerId: string;
  model: string;
  type: string;
  inputRate: string | number;
  outputRate: string | number;
  unitCosts?: { input: string | number; output: string | number };
  caching?: { readRate?: string | number; writeRate?: string | number } | null;
  provider?: { id: string; name: string; displayName: string };
}

interface ExternalRate {
  // Token (chatCompletion / embedding)
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  cacheWriteCostPerToken?: number;
  cacheReadCostPerToken?: number;
  // Image (imageGeneration)
  outputCostPerImage?: number;
  inputCostPerImage?: number;
  inputCostPerImageToken?: number;
  outputCostPerImageToken?: number;
  // Video
  outputCostPerVideoPerSecond?: number;
  // Tiered pricing (above N k tokens)
  tieredPricing?: { threshold: string; input?: number; output?: number }[];
  // Resolution variant tiers (e.g. dall-e quality/size combos)
  resolutionTiers?: { quality: string; size: string; costPerImage: number }[];
}

async function parseArgs(): Promise<CliOptions> {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    hubUrl: process.env.HUB_URL || 'http://localhost:8090',
    threshold: 0.1,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        opts.env = args[++i];
        break;
      case '--hub-url':
        opts.hubUrl = args[++i] || opts.hubUrl;
        break;
      case '--threshold':
        opts.threshold = parseFloat(args[++i] || '0.1');
        break;
      case '--json':
        opts.json = true;
        break;
      case '--token':
        opts.token = args[++i];
        break;
    }
  }

  // Apply environment defaults
  if (opts.env && ENV_URLS[opts.env] && !args.includes('--hub-url')) {
    opts.hubUrl = ENV_URLS[opts.env];
  }

  // Auto-load token from credentials store if env specified
  // Note: model-rates API is publicly readable, token only needed for write operations (bulk-rate-update)
  if (opts.env && !opts.token) {
    const storedToken = await loadStoredToken(opts.env, opts.hubUrl);
    if (storedToken) {
      opts.token = storedToken;
      console.error(`✅ Using stored credentials for ${opts.env}`);
    }
  }

  return opts;
}

function calcDrift(dbValue: number, sourceValue: number): number {
  const maxVal = Math.max(Math.abs(dbValue), Math.abs(sourceValue));
  if (maxVal === 0) return 0;
  return Math.abs(dbValue - sourceValue) / maxVal;
}

// Strip HTML tags for cleaner text extraction from provider pricing pages
function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

// Provider page cache: avoid re-fetching within TTL
const PROVIDER_PAGE_CACHE_FILE = '/tmp/aigne-provider-page-cache.json';
const PROVIDER_PAGE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface ProviderPageCache {
  timestamp: number;
  entries: Array<{
    provider: string;
    model: string;
    inputCostPerToken: number;
    outputCostPerToken: number;
    url: string;
  }>;
}

async function loadProviderPageCache(): Promise<Map<string, ProviderPagePricing> | null> {
  try {
    const data = await fs.readFile(PROVIDER_PAGE_CACHE_FILE, 'utf-8');
    const cache: ProviderPageCache = JSON.parse(data);
    if (Date.now() - cache.timestamp < PROVIDER_PAGE_CACHE_TTL) {
      const map = new Map<string, ProviderPagePricing>();
      for (const entry of cache.entries) {
        map.set(`${entry.provider}/${entry.model}`, entry as ProviderPagePricing);
      }
      return map;
    }
  } catch {
    /* no cache or expired */
  }
  return null;
}

async function saveProviderPageCache(map: Map<string, ProviderPagePricing>): Promise<void> {
  const entries = Array.from(map.values());
  await fs.writeFile(PROVIDER_PAGE_CACHE_FILE, JSON.stringify({ timestamp: Date.now(), entries }, null, 2));
}

async function fetchDbRates(hubUrl: string, token?: string): Promise<DbRate[]> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    // Use dynamic mount point detection to build correct API URL
    const apiUrl = await buildApiUrl(hubUrl, '/api/ai-providers/model-rates');
    const allRates: DbRate[] = [];
    let page = 1;
    const pageSize = 100; // API caps at 100
    let expectedTotal: number | undefined;

    // Paginate through all pages
    while (true) {
      const res = await axios.get(apiUrl, {
        headers,
        timeout: 15000,
        params: { pageSize, page },
      });

      // Extract total count from first page response for completeness validation
      if (page === 1) {
        expectedTotal = res.data?.count ?? res.data?.data?.count;
      }

      const list: DbRate[] = res.data?.list || res.data?.data?.list || [];
      allRates.push(...list);
      if (list.length < pageSize) break; // Last page
      page++;
    }

    // Validate completeness against API-reported total
    if (expectedTotal !== undefined && allRates.length !== expectedTotal) {
      console.error(
        `⚠️  DB rates completeness mismatch: fetched ${allRates.length}, API reports ${expectedTotal} total`
      );
    } else if (expectedTotal !== undefined) {
      console.error(`✅ DB rates complete: ${allRates.length}/${expectedTotal}`);
    }

    return allRates;
  } catch (err: any) {
    console.error(`Failed to fetch DB rates from ${hubUrl}: ${err.message}`);
    return [];
  }
}

// Normalize LiteLLM provider names to our DB provider names
function normalizeLiteLLMProvider(litellmProvider: string): string | undefined {
  const p = litellmProvider.toLowerCase();
  if (p === 'gemini' || p.startsWith('vertex_ai')) return 'google';
  if (p === 'anthropic') return 'anthropic';
  if (p === 'openai' || p === 'text-completion-openai' || p === 'chatgpt') return 'openai';
  if (p === 'deepseek') return 'deepseek';
  if (p === 'xai') return 'xai';
  if (p.startsWith('bedrock')) return 'bedrock';
  if (p === 'openrouter') return 'openrouter';
  if (p === 'volcengine') return 'doubao';
  return undefined;
}

async function fetchLiteLLM(): Promise<Map<string, ExternalRate>> {
  const map = new Map<string, ExternalRate>();
  // Collect resolution variant entries to merge into base models later
  const resolutionVariants = new Map<string, { quality: string; size: string; costPerImage: number }[]>();

  try {
    const res = await axios.get(LITELLM_API_URL, { timeout: 30000 });
    const data = res.data || {};
    for (const [key, val] of Object.entries(data) as [string, any][]) {
      if (key === 'sample_spec') continue;

      // 1. Resolution variant keys (e.g., "high/1024-x-1024/gpt-image-1", "hd/1024-x-1792/dall-e-3")
      const resMatch = key.match(/^(?:azure\/)?(\w+)\/([\dx-]+)\/(.+)$/);
      if (resMatch && val.mode === 'image_generation') {
        const [, quality, sizeRaw, baseModel] = resMatch;
        const size = sizeRaw.replace(/-/g, '');
        const cost =
          (val.input_cost_per_image ?? val.output_cost_per_image ?? val.input_cost_per_pixel)
            ? (val.input_cost_per_pixel || 0) *
              sizeRaw.split('-x-').reduce((a: number, b: string) => a * parseInt(b), 1)
            : undefined;
        if (cost !== undefined) {
          const litellmProvider = val.litellm_provider || '';
          const normalizedProvider = normalizeLiteLLMProvider(litellmProvider) || litellmProvider;
          const baseKey = `${normalizedProvider}/${baseModel}`;
          if (!resolutionVariants.has(baseKey)) resolutionVariants.set(baseKey, []);
          resolutionVariants.get(baseKey)!.push({ quality, size, costPerImage: cost });
        }
        continue;
      }

      // Build rate from all available pricing fields
      let hasAnyPricing = false;
      const rate: ExternalRate = {};

      // 2. Token pricing (chatCompletion / embedding)
      if (val.input_cost_per_token !== undefined) {
        rate.inputCostPerToken = val.input_cost_per_token;
        hasAnyPricing = true;
      }
      if (val.output_cost_per_token !== undefined) {
        rate.outputCostPerToken = val.output_cost_per_token;
        hasAnyPricing = true;
      }
      if (val.cache_creation_input_token_cost !== undefined) {
        rate.cacheWriteCostPerToken = val.cache_creation_input_token_cost;
      }
      if (val.cache_read_input_token_cost !== undefined) {
        rate.cacheReadCostPerToken = val.cache_read_input_token_cost;
      }

      // 3. Image pricing
      if (val.output_cost_per_image !== undefined) {
        rate.outputCostPerImage = val.output_cost_per_image;
        hasAnyPricing = true;
      }
      if (val.input_cost_per_image !== undefined) {
        rate.inputCostPerImage = val.input_cost_per_image;
        hasAnyPricing = true;
      }
      if (val.input_cost_per_image_token !== undefined) {
        rate.inputCostPerImageToken = val.input_cost_per_image_token;
        hasAnyPricing = true;
      }
      if (val.output_cost_per_image_token !== undefined) {
        rate.outputCostPerImageToken = val.output_cost_per_image_token;
        hasAnyPricing = true;
      }

      // 4. Video pricing
      if (val.output_cost_per_video_per_second !== undefined) {
        rate.outputCostPerVideoPerSecond = val.output_cost_per_video_per_second;
        hasAnyPricing = true;
      } else if (val.output_cost_per_second !== undefined && val.mode === 'video_generation') {
        rate.outputCostPerVideoPerSecond = val.output_cost_per_second;
        hasAnyPricing = true;
      }

      // 5. Tiered pricing (above N k tokens thresholds)
      const tiers: { threshold: string; input?: number; output?: number }[] = [];
      for (const tierKey of Object.keys(val)) {
        const tierMatch = tierKey.match(/^(input|output)_cost_per_token_above_(\d+k)_tokens$/);
        if (tierMatch) {
          const [, direction, threshold] = tierMatch;
          let existing = tiers.find((t) => t.threshold === threshold);
          if (!existing) {
            existing = { threshold };
            tiers.push(existing);
          }
          if (direction === 'input') existing.input = val[tierKey];
          else existing.output = val[tierKey];
        }
      }
      if (tiers.length > 0) {
        rate.tieredPricing = tiers;
      }

      if (!hasAnyPricing) continue;

      // Extract provider prefix and model name
      const litellmProvider = val.litellm_provider || '';
      const parts = key.split('/');
      const modelName = parts.length > 1 ? parts.slice(1).join('/') : key;

      // Store under original litellm_provider key
      map.set(`${litellmProvider}/${modelName}`, rate);

      // Also store under normalized DB provider name (e.g., gemini → google)
      const normalizedProvider = normalizeLiteLLMProvider(litellmProvider);
      if (normalizedProvider && normalizedProvider !== litellmProvider) {
        const normalizedKey = `${normalizedProvider}/${modelName}`;
        // Don't overwrite if already exists (prefer direct provider match)
        if (!map.has(normalizedKey)) {
          map.set(normalizedKey, rate);
        }
      }

      // For openrouter entries, also store the full key (openrouter/provider/model)
      if (litellmProvider === 'openrouter' && key.startsWith('openrouter/')) {
        map.set(key, rate);
      }
    }

    // Merge resolution variants into base model entries
    for (const [baseKey, variants] of resolutionVariants) {
      const existing = map.get(baseKey);
      if (existing) {
        existing.resolutionTiers = variants;
      }
      // Also try without provider prefix normalization
      for (const [k, v] of map) {
        if (k.endsWith(`/${baseKey.split('/').pop()}`) && !v.resolutionTiers) {
          v.resolutionTiers = variants;
        }
      }
    }

    console.error(`Fetched ${map.size} models from LiteLLM`);
  } catch (err: any) {
    console.error(`Failed to fetch LiteLLM data: ${err.message}`);
  }
  return map;
}

async function fetchOpenRouter(): Promise<Map<string, ExternalRate>> {
  const map = new Map<string, ExternalRate>();
  const providerMap: Record<string, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
    deepseek: 'deepseek',
    'x-ai': 'xai',
  };

  try {
    const res = await axios.get(OPENROUTER_API_URL, { timeout: 30000 });
    const models = res.data?.data || [];
    for (const model of models) {
      if (!model.pricing?.prompt || !model.pricing?.completion) continue;
      const slashIdx = model.id.indexOf('/');
      if (slashIdx === -1) continue;
      const prefix = model.id.substring(0, slashIdx);
      const modelName = model.id.substring(slashIdx + 1);
      const provider = providerMap[prefix] || prefix;
      const input = parseFloat(model.pricing.prompt);
      const output = parseFloat(model.pricing.completion);
      if (!isNaN(input) && !isNaN(output)) {
        map.set(`${provider}/${modelName}`, { inputCostPerToken: input, outputCostPerToken: output });
      }
    }
    console.error(`Fetched ${map.size} models from OpenRouter`);
  } catch (err: any) {
    console.error(`Failed to fetch OpenRouter data: ${err.message}`);
  }
  return map;
}

interface ProviderPagePricing {
  provider: string;
  model: string;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  url: string;
}

interface ProviderPageConfig {
  url: string;
  extractPricing: (html: string) => ProviderPagePricing[];
}

// OpenAI pricing cache (extracted via browser DOM since Cloudflare blocks direct fetch)
const OPENAI_PRICING_CACHE_FILE = '/tmp/aigne-openai-pricing-cache.json';
const OPENAI_PRICING_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface OpenAIPricingCache {
  timestamp: number;
  sourceUrl: string;
  textModels: Array<{
    id: string;
    name: string;
    inputPerMTok: number;
    cachedInputPerMTok?: number;
    outputPerMTok: number;
    tieredPricing?: { threshold: string; inputPerMTok: number; cachedInputPerMTok?: number; outputPerMTok: number };
  }>;
  fineTuningModels?: Array<{
    id: string;
    name: string;
    inputPerMTok: number;
    cachedInputPerMTok?: number;
    outputPerMTok: number;
  }>;
  legacyModels?: Array<{
    id: string;
    name: string;
    inputPerMTok: number;
    cachedInputPerMTok?: number;
    outputPerMTok: number;
  }>;
  embeddingModels?: Array<{
    id: string;
    name: string;
    inputPerMTok: number;
  }>;
  imageTokenModels?: Array<{
    id: string;
    name: string;
    inputPerMTok: number;
    cachedInputPerMTok?: number;
    outputPerMTok: number;
  }>;
  imageModels: Array<{
    id: string;
    name: string;
    variants: Array<{ quality: string; size: string; costPerImage: number }>;
  }>;
  videoModels: Array<{
    id: string;
    name: string;
    variants: Array<{ resolution: string; costPerSecond: number }>;
  }>;
}

async function loadOpenAIPricingCache(): Promise<ProviderPagePricing[]> {
  try {
    const data = await fs.readFile(OPENAI_PRICING_CACHE_FILE, 'utf-8');
    const cache: OpenAIPricingCache = JSON.parse(data);

    // Check TTL
    if (Date.now() - cache.timestamp > OPENAI_PRICING_CACHE_TTL) {
      console.error(
        `⚠️  OpenAI pricing cache expired (age: ${Math.round((Date.now() - cache.timestamp) / 60000)}min). Run browser extraction to refresh.`
      );
      return [];
    }

    const results: ProviderPagePricing[] = [];
    const url = cache.sourceUrl || 'https://platform.openai.com/docs/pricing';

    // Text models: convert $/1M tokens to per-token
    for (const m of cache.textModels || []) {
      // For tiered models, use the base (standard) tier prices
      results.push({
        provider: 'openai',
        model: m.id,
        inputCostPerToken: m.inputPerMTok / 1e6,
        outputCostPerToken: m.outputPerMTok / 1e6,
        url,
      });
    }

    // Fine-tuning and legacy models: only if not already covered by a previous section
    const seenIds = new Set((cache.textModels || []).map((m) => m.id));
    for (const m of cache.fineTuningModels || []) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      results.push({
        provider: 'openai',
        model: m.id,
        inputCostPerToken: m.inputPerMTok / 1e6,
        outputCostPerToken: m.outputPerMTok / 1e6,
        url,
      });
    }
    for (const m of cache.legacyModels || []) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      results.push({
        provider: 'openai',
        model: m.id,
        inputCostPerToken: m.inputPerMTok / 1e6,
        outputCostPerToken: m.outputPerMTok / 1e6,
        url,
      });
    }
    // Embedding models (input-only pricing, output = 0)
    for (const m of cache.embeddingModels || []) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      results.push({
        provider: 'openai',
        model: m.id,
        inputCostPerToken: m.inputPerMTok / 1e6,
        outputCostPerToken: 0,
        url,
      });
    }
    // Image token models (input/output per MTok — vision/multimodal pricing)
    for (const m of cache.imageTokenModels || []) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      results.push({
        provider: 'openai',
        model: m.id,
        inputCostPerToken: m.inputPerMTok / 1e6,
        outputCostPerToken: m.outputPerMTok / 1e6,
        url,
      });
    }

    // Image models: use medium-quality 1024x1024 as representative per-image price
    // Store in outputCostPerToken field (compare() handles per-image vs per-token distinction via DB type)
    for (const m of cache.imageModels || []) {
      // Find medium/standard quality at 1024x1024 as representative price
      const representative =
        m.variants.find((v) => (v.quality === 'medium' || v.quality === 'standard') && v.size === '1024x1024') ||
        m.variants.find((v) => v.size === '1024x1024') ||
        m.variants[0];
      if (representative) {
        results.push({
          provider: 'openai',
          model: m.id,
          inputCostPerToken: 0, // image models don't have meaningful input token cost
          outputCostPerToken: representative.costPerImage, // per-image cost stored here
          url,
        });
      }
    }

    // Video models: use first variant as representative per-second price
    for (const m of cache.videoModels || []) {
      const representative = m.variants[0];
      if (representative) {
        results.push({
          provider: 'openai',
          model: m.id,
          inputCostPerToken: 0,
          outputCostPerToken: representative.costPerSecond, // per-second cost stored here
          url,
        });
      }
    }

    console.error(`Loaded ${results.length} OpenAI models from browser-extracted cache (${OPENAI_PRICING_CACHE_FILE})`);
    return results;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(
        `⚠️  OpenAI pricing cache not found (${OPENAI_PRICING_CACHE_FILE}). Run browser DOM extraction to create it.`
      );
    } else {
      console.error(`⚠️  Failed to read OpenAI pricing cache: ${err.message}`);
    }
    return [];
  }
}

// NOTE: OpenAI is excluded from PROVIDER_PAGES (Cloudflare 403) — uses separate browser-extracted cache above
const PROVIDER_PAGES: Record<string, ProviderPageConfig> = {
  anthropic: {
    url: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
    extractPricing: (html: string): ProviderPagePricing[] => {
      const results: ProviderPagePricing[] = [];
      const text = stripHtmlTags(html);
      const url = 'https://docs.anthropic.com/en/docs/about-claude/pricing';

      // Display name → DB model names mapping
      // Anthropic pricing table format: Model | Input $/MTok | Cache prices... | Output $/MTok
      // So first $ amount = input, last $ amount = output
      // Order matters: more specific patterns must come before less specific ones
      const models: Array<{ pattern: RegExp; dbNames: string[] }> = [
        { pattern: /Claude Opus 4\.6/i, dbNames: ['claude-opus-4-6'] },
        { pattern: /Claude Opus 4\.5/i, dbNames: ['claude-opus-4-5'] },
        { pattern: /Claude Opus 4\.1/i, dbNames: ['claude-opus-4-1'] },
        { pattern: /Claude Opus 4(?![.\d])/i, dbNames: ['claude-opus-4'] },
        { pattern: /Claude Sonnet 4\.6/i, dbNames: ['claude-sonnet-4-6'] },
        { pattern: /Claude Sonnet 4\.5/i, dbNames: ['claude-sonnet-4-5'] },
        { pattern: /Claude Sonnet 4(?![.\d])/i, dbNames: ['claude-sonnet-4'] },
        { pattern: /Claude Sonnet 3\.7/i, dbNames: ['claude-sonnet-3-7'] },
        { pattern: /Claude Haiku 4\.5/i, dbNames: ['claude-haiku-4-5'] },
        { pattern: /Claude Haiku 3\.5/i, dbNames: ['claude-haiku-3-5'] },
        { pattern: /Claude Opus 3(?![.\d])/i, dbNames: ['claude-opus-3'] },
        { pattern: /Claude Haiku 3(?![.\d])/i, dbNames: ['claude-haiku-3'] },
      ];

      for (const { pattern, dbNames } of models) {
        let searchFrom = 0;
        let found = false;
        while (!found) {
          const match = text.substring(searchFrom).match(pattern);
          if (!match || match.index === undefined) break;
          const startIdx = searchFrom + match.index;
          // Anthropic table: 5 columns per row (Input | 5m Cache | 1h Cache | Cache Hit | Output)
          // Extract exactly the first 5 "$X / MTok" prices after the model name
          const window = text.substring(startIdx, startIdx + 400);
          const priceRegex = /\$([\d]+(?:\.[\d]+)?)\s*\/\s*MTok/g;
          const prices: number[] = [];
          let priceMatch;
          while ((priceMatch = priceRegex.exec(window)) !== null && prices.length < 5) {
            const val = parseFloat(priceMatch[1]);
            if (!isNaN(val)) prices.push(val);
          }
          if (prices.length === 5) {
            // [input, 5m_cache_write, 1h_cache_write, cache_hit, output]
            const inputPerMTok = prices[0];
            const outputPerMTok = prices[4];
            for (const dbName of dbNames) {
              results.push({
                provider: 'anthropic',
                model: dbName,
                inputCostPerToken: inputPerMTok / 1e6,
                outputCostPerToken: outputPerMTok / 1e6,
                url,
              });
            }
            found = true;
          }
          searchFrom = startIdx + match[0].length;
        }
      }
      return results;
    },
  },
  google: {
    url: 'https://ai.google.dev/gemini-api/docs/pricing',
    extractPricing: (html: string): ProviderPagePricing[] => {
      const results: ProviderPagePricing[] = [];
      const text = stripHtmlTags(html);
      const url = 'https://ai.google.dev/gemini-api/docs/pricing';

      // Google pricing format: "Model ... Input price ... $X.XX ... Output price ... $Y.YY"
      // Some models have tiered pricing (<=200K / >200K context)
      const models: Array<{ pattern: RegExp; dbNames: string[] }> = [
        { pattern: /\bgemini-2\.5-flash\b(?!-)/i, dbNames: ['gemini-2.5-flash', 'gemini-2.5-flash-image'] },
        { pattern: /\bgemini-2\.5-pro\b/i, dbNames: ['gemini-2.5-pro-preview-05-06'] },
        { pattern: /\bgemini-3-flash-preview\b/i, dbNames: ['gemini-3-flash-preview'] },
        { pattern: /\bgemini-3-pro-image-preview\b/i, dbNames: ['gemini-3-pro-image-preview', 'gemini-3-pro-preview'] },
      ];

      for (const { pattern, dbNames } of models) {
        let searchFrom = 0;
        let found = false;
        while (!found) {
          const match = text.substring(searchFrom).match(pattern);
          if (!match || match.index === undefined) break;
          const startIdx = searchFrom + match.index;
          const window = text.substring(startIdx, startIdx + 800);

          // Look for "Input price" and "Output price" sections
          const inputSection = window.match(/Input price[^$]*\$([\d]+(?:\.[\d]+)?)/i);
          const outputSection = window.match(/Output price[^$]*\$([\d]+(?:\.[\d]+)?)/i);

          if (inputSection && outputSection) {
            const inputPerM = parseFloat(inputSection[1]);
            const outputPerM = parseFloat(outputSection[1]);
            if (!isNaN(inputPerM) && !isNaN(outputPerM)) {
              for (const dbName of dbNames) {
                results.push({
                  provider: 'google',
                  model: dbName,
                  inputCostPerToken: inputPerM / 1e6,
                  outputCostPerToken: outputPerM / 1e6,
                  url,
                });
              }
              found = true;
            }
          }
          searchFrom = startIdx + match[0].length;
        }
      }
      return results;
    },
  },
  deepseek: {
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    extractPricing: (html: string): ProviderPagePricing[] => {
      const results: ProviderPagePricing[] = [];
      const url = 'https://api-docs.deepseek.com/quick_start/pricing';
      // Both deepseek-chat and deepseek-reasoner now use DeepSeek-V3.2 with identical pricing

      // Extract pricing from HTML table
      // DeepSeek page has: "1M INPUT TOKENS (CACHE MISS)" and "1M OUTPUT TOKENS" rows
      let inputPerM: number | undefined;
      let outputPerM: number | undefined;

      // Try raw HTML: specifically match CACHE MISS row for input price
      const inputMatch = html.match(/CACHE MISS\)<\/td><td[^>]*>\$?([\d.]+)/i);
      const outputMatch = html.match(/1M OUTPUT TOKENS<\/td><td[^>]*>\$?([\d.]+)/i);
      if (inputMatch && outputMatch) {
        inputPerM = parseFloat(inputMatch[1]);
        outputPerM = parseFloat(outputMatch[1]);
      }

      // Fallback: try stripped text
      if (!inputPerM || !outputPerM) {
        const text = stripHtmlTags(html);
        const inputMatch2 = text.match(/CACHE MISS\)\s*\$?([\d.]+)/i);
        const outputMatch2 = text.match(/1M OUTPUT TOKENS\s*\$?([\d.]+)/i);
        if (inputMatch2) inputPerM = parseFloat(inputMatch2[1]);
        if (outputMatch2) outputPerM = parseFloat(outputMatch2[1]);
      }

      if (inputPerM && outputPerM && !isNaN(inputPerM) && !isNaN(outputPerM)) {
        for (const model of ['deepseek-chat', 'deepseek-reasoner']) {
          results.push({
            provider: 'deepseek',
            model,
            inputCostPerToken: inputPerM / 1e6,
            outputCostPerToken: outputPerM / 1e6,
            url,
          });
        }
      }
      return results;
    },
  },
  xai: {
    url: 'https://docs.x.ai/docs/models',
    extractPricing: (html: string): ProviderPagePricing[] => {
      const results: ProviderPagePricing[] = [];
      const url = 'https://docs.x.ai/docs/models';

      // xAI pricing is embedded in Next.js RSC JSON data as LanguageModel entries
      // Format: "name":"grok-3","promptTextTokenPrice":"$n3000","completionTextTokenPrice":"$n15000"
      // Values are in units of $0.0001 per 1M tokens (divide by 10000 for $/1M)
      // The HTML has double-escaped quotes: \\\" → unescape first
      const unescaped = html
        .replace(/\\\\"/g, '\x00DQUOTE\x00')
        .replace(/\\"/g, '"')
        .replace(/\x00DQUOTE\x00/g, '\\"');

      // Map xAI model names to DB model names
      const modelAliases: Record<string, string[]> = {
        'grok-4-0709': ['grok-4-latest'],
        'grok-3': ['grok-3-latest'],
        'grok-3-mini': ['grok-3-mini-fast'],
      };

      // Extract all LanguageModel entries from JSON data
      const modelRegex =
        /"name":"(grok-[^"]+)"[^}]*?"promptTextTokenPrice":"\$n(\d+)"[^}]*?"completionTextTokenPrice":"\$n(\d+)"/g;
      const seen = new Set<string>();

      for (const match of unescaped.matchAll(modelRegex)) {
        const pageName = match[1];
        if (seen.has(pageName)) continue; // Skip duplicates (RSC data often has 2 copies)
        seen.add(pageName);

        const inputRaw = parseInt(match[2], 10);
        const outputRaw = parseInt(match[3], 10);
        const inputPerM = inputRaw / 10000;
        const outputPerM = outputRaw / 10000;

        const dbNames = modelAliases[pageName];
        if (!dbNames) continue; // Only emit for models we track

        for (const dbName of dbNames) {
          results.push({
            provider: 'xai',
            model: dbName,
            inputCostPerToken: inputPerM / 1e6,
            outputCostPerToken: outputPerM / 1e6,
            url,
          });
        }
      }
      return results;
    },
  },
};

async function fetchProviderPages(): Promise<Map<string, ProviderPagePricing>> {
  // Check cache first
  const cached = await loadProviderPageCache();
  if (cached) {
    console.error(`Using cached provider page data (${cached.size} models, TTL: 1h)`);
    return cached;
  }

  const map = new Map<string, ProviderPagePricing>();
  let totalCount = 0;

  await Promise.allSettled(
    Object.entries(PROVIDER_PAGES).map(async ([provider, config]) => {
      try {
        const res = await axios.get(config.url, {
          timeout: 30000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIGNE-Hub-Pricing/1.0)' },
        });
        const results = config.extractPricing(res.data);
        for (const r of results) {
          map.set(`${r.provider}/${r.model}`, r);
          totalCount++;
        }
        if (results.length === 0) {
          console.error(
            `⚠️  ${provider}: page fetched OK (${Math.round(res.data.length / 1024)}KB) but no pricing extracted`
          );
        }
      } catch (err: any) {
        console.error(`⚠️  Failed to fetch ${provider} pricing page: ${err.message}`);
      }
    })
  );

  // Load OpenAI pricing from browser-extracted cache (separate from provider page scraping)
  const openaiModels = await loadOpenAIPricingCache();
  for (const r of openaiModels) {
    map.set(`${r.provider}/${r.model}`, r);
    totalCount++;
  }

  const providerCount = Object.keys(PROVIDER_PAGES).length + (openaiModels.length > 0 ? 1 : 0);
  console.error(`Fetched ${totalCount} models from Provider Pages (${providerCount} providers)`);

  // Save cache if we got any results
  if (totalCount > 0) {
    await saveProviderPageCache(map);
  }

  return map;
}

// Pricing unit types for display
type PricingUnit = 'per-token' | 'per-image' | 'per-second';

interface ComparisonResult {
  provider: string;
  model: string;
  type: string;
  pricingUnit: PricingUnit; // How output is priced
  dbInput: number;
  dbOutput: number;
  litellmInput?: number;
  litellmOutput?: number;
  litellmDrift?: number;
  openrouterInput?: number;
  openrouterOutput?: number;
  openrouterDrift?: number;
  providerPageInput?: number;
  providerPageOutput?: number;
  providerPageDrift?: number;
  providerPageUrl?: string;
  maxDrift: number;
  exceedsThreshold: boolean;
  // Cache token pricing (DB stores as credit rates; in margin=0 setups these equal USD costs)
  dbCacheWrite?: number;
  dbCacheRead?: number;
  litellmCacheWrite?: number;
  litellmCacheRead?: number;
  cacheDrift?: number; // max drift between DB cache rates and LiteLLM cache costs
  // Pricing sanity check: inputRate/outputRate vs unitCosts
  inputRate?: number;
  outputRate?: number;
  inputRateIssue?: number; // Negative = loss (rate < cost)
  outputRateIssue?: number; // Negative = loss (rate < cost)
  hasPricingIssue: boolean;
  // Image/video pricing from LiteLLM (same-unit as DB)
  litellmInputPerImage?: number;
  litellmOutputPerImage?: number;
  litellmOutputPerSecond?: number;
  // Tiered / resolution variant details
  resolutionTiers?: { quality: string; size: string; costPerImage: number }[];
  tieredPricing?: { threshold: string; input?: number; output?: number }[];
  // Best cost source (for simplified report)
  bestCostInput?: number;
  bestCostOutput?: number;
  bestCostSource?: 'provider-page' | 'openrouter' | 'litellm';
  bestCostSourceLabel?: string; // "官方" / "OpenRouter" / "LiteLLM"
  bestCostUrl?: string;
  inputMargin?: number; // (售价 - 成本) / 成本 × 100
  outputMargin?: number;
}

function pickBestCost(result: ComparisonResult): void {
  if (result.pricingUnit === 'per-image' || result.pricingUnit === 'per-second') {
    // Image/video models: output MUST be in per-image/per-second unit (not per-token).
    // Provider page & OpenRouter only provide per-token output prices, which are
    // incompatible with DB sell prices (per-image / per-second). Use LiteLLM for output.
    if (result.pricingUnit === 'per-image' && result.resolutionTiers?.length) {
      // Resolution tiers contain complete tiered info — use highest tier as best cost
      result.bestCostOutput = Math.max(...result.resolutionTiers.map((t) => t.costPerImage));
    } else if (result.pricingUnit === 'per-image' && result.litellmOutputPerImage !== undefined) {
      // Fallback: flat per-image cost from LiteLLM
      result.bestCostOutput = result.litellmOutputPerImage;
    } else if (result.pricingUnit === 'per-second' && result.litellmOutputPerSecond !== undefined) {
      result.bestCostOutput = result.litellmOutputPerSecond;
    }
    // Input: for per-image models, prefer per-image input cost from LiteLLM;
    // otherwise fall back to per-token (provider-page > openrouter > litellm)
    if (result.pricingUnit === 'per-image' && result.litellmInputPerImage !== undefined) {
      result.bestCostInput = result.litellmInputPerImage;
      if (!result.bestCostSource) {
        result.bestCostSource = 'litellm';
        result.bestCostSourceLabel = 'LiteLLM';
      }
    } else if (result.providerPageInput !== undefined) {
      result.bestCostInput = result.providerPageInput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (result.openrouterInput !== undefined) {
      result.bestCostInput = result.openrouterInput;
      result.bestCostSource = 'openrouter';
      result.bestCostSourceLabel = 'OpenRouter';
    } else if (result.litellmInput !== undefined) {
      result.bestCostInput = result.litellmInput;
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
    // If output came from LiteLLM but source wasn't set yet, mark it
    if (result.bestCostOutput !== undefined && !result.bestCostSource) {
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
  } else {
    // Per-token models: priority provider-page > openrouter > litellm
    if (result.providerPageInput !== undefined && result.providerPageOutput !== undefined) {
      result.bestCostInput = result.providerPageInput;
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (result.openrouterInput !== undefined && result.openrouterOutput !== undefined) {
      result.bestCostInput = result.openrouterInput;
      result.bestCostOutput = result.openrouterOutput;
      result.bestCostSource = 'openrouter';
      result.bestCostSourceLabel = 'OpenRouter';
    } else if (result.litellmInput !== undefined && result.litellmOutput !== undefined) {
      result.bestCostInput = result.litellmInput;
      result.bestCostOutput = result.litellmOutput;
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
  }

  // Calculate margin: (售价 - 成本) / 成本 × 100
  if (result.bestCostInput !== undefined && result.inputRate !== undefined && result.bestCostInput > 0) {
    result.inputMargin = ((result.inputRate - result.bestCostInput) / result.bestCostInput) * 100;
  }
  if (result.bestCostOutput !== undefined && result.outputRate !== undefined && result.bestCostOutput > 0) {
    result.outputMargin = ((result.outputRate - result.bestCostOutput) / result.bestCostOutput) * 100;
  }
}

function compare(
  dbRates: DbRate[],
  litellm: Map<string, ExternalRate>,
  openrouter: Map<string, ExternalRate>,
  providerPages: Map<string, ProviderPagePricing>,
  threshold: number
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  for (const rate of dbRates) {
    const providerName = rate.provider?.name || '';
    // For OpenRouter provider, the model name already contains provider prefix (e.g., "anthropic/claude-opus-4")
    // For other providers, use "provider/model" format
    const lookupKey = providerName === 'openrouter' ? rate.model : `${providerName}/${rate.model}`;
    const dbInput = Number(rate.unitCosts?.input ?? rate.inputRate ?? 0);
    const dbOutput = Number(rate.unitCosts?.output ?? rate.outputRate ?? 0);

    // LiteLLM lookup with fallbacks for provider name mismatches
    let ll = litellm.get(lookupKey);
    if (!ll && providerName === 'openrouter') {
      // For openrouter DB entries like "anthropic/claude-opus-4.6", also try "openrouter/anthropic/claude-opus-4.6"
      ll = litellm.get(`openrouter/${rate.model}`);
    }
    if (!ll) {
      // Try model-name-only lookup (without provider prefix) against all known keys
      // This handles cases where LiteLLM has e.g. "deepseek/deepseek-coder" but DB has "deepseek/deepseek-coder"
      // which should already match, but also "poe/gpt-4o" where LiteLLM has "openai/gpt-4o"
      const modelOnly = rate.model;
      // Try common direct-provider mappings for the model name
      for (const tryProvider of ['openai', 'anthropic', 'google', 'gemini', 'deepseek', 'xai']) {
        const tryKey = `${tryProvider}/${modelOnly}`;
        const found = litellm.get(tryKey);
        if (found) {
          ll = found;
          break;
        }
      }
    }
    const or = openrouter.get(lookupKey);
    const pp = providerPages.get(lookupKey);

    // Determine pricing unit based on model type
    const pricingUnit: PricingUnit =
      rate.type === 'imageGeneration' ? 'per-image' : rate.type === 'video' ? 'per-second' : 'per-token';

    // Initialize result - we'll still check pricing even without external sources
    let maxDrift = 0;
    const result: ComparisonResult = {
      provider: providerName,
      model: rate.model,
      type: rate.type,
      pricingUnit,
      dbInput,
      dbOutput,
      maxDrift: 0,
      exceedsThreshold: false,
      hasPricingIssue: false,
    };

    // Image/video models use per-image/per-video pricing in DB output field,
    // while LiteLLM/OpenRouter report per-token prices. Skip output drift comparison
    // for these types to avoid false 20000x drift alerts.
    const isPerUnitPricing = pricingUnit !== 'per-token';

    if (ll) {
      result.litellmInput = ll.inputCostPerToken;
      result.litellmOutput = ll.outputCostPerToken;

      // Attach tiered/resolution data
      if (ll.tieredPricing) result.tieredPricing = ll.tieredPricing;
      if (ll.resolutionTiers) result.resolutionTiers = ll.resolutionTiers;

      // Derive resolution tiers for image models that have outputCostPerImageToken
      // but no explicit resolutionTiers (e.g. Google gemini image models)
      if (
        pricingUnit === 'per-image' &&
        !result.resolutionTiers &&
        ll.outputCostPerImage != null &&
        ll.outputCostPerImageToken != null
      ) {
        const stdCost = ll.outputCostPerImage;
        const hiResCost = ll.outputCostPerImageToken * 2000; // 4K images ≈ 2000 tokens (Google docs)
        if (Math.abs(hiResCost - stdCost) / stdCost > 0.05) {
          // Only add tiers when 4K price materially differs from standard
          result.resolutionTiers = [
            { quality: '1K-2K', size: '', costPerImage: stdCost },
            { quality: '4K', size: '', costPerImage: hiResCost },
          ];
        }
      }

      if (pricingUnit === 'per-image') {
        // Image models: compare output per-image if available
        // LiteLLM uses output_cost_per_image (imagen) or input_cost_per_image (dall-e)
        const llOutputPerImage = ll.outputCostPerImage ?? ll.inputCostPerImage;
        if (ll.inputCostPerImage !== undefined) result.litellmInputPerImage = ll.inputCostPerImage;
        if (llOutputPerImage !== undefined) {
          result.litellmOutputPerImage = llOutputPerImage;
          const outputDrift = calcDrift(dbOutput, llOutputPerImage);
          // Also compare input tokens if both sides have data
          const inputDrift =
            ll.inputCostPerToken !== undefined && dbInput > 0 ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
          result.litellmDrift = Math.max(inputDrift, outputDrift);
        } else {
          // Fallback: only compare input tokens
          const inputDrift = ll.inputCostPerToken !== undefined ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
          result.litellmDrift = inputDrift;
        }
        // Derive resolution tiers for models with output_cost_per_image_token but no explicit resolutionTiers
        // (e.g., Google image models with 1K-2K and 4K pricing tiers)
        if (!result.resolutionTiers?.length && ll.outputCostPerImageToken && ll.outputCostPerImage) {
          const tokPerImg = ll.outputCostPerImageToken;
          // Google documents: 1K-2K images ≈ 1120 tokens, 4K images ≈ 2000 tokens
          const stdTokens = Math.round(ll.outputCostPerImage / tokPerImg);
          const hiTokens = Math.round(stdTokens * 1.786); // ~2000 for Google (1120 × 1.786)
          const stdCost = ll.outputCostPerImage;
          const hiCost = tokPerImg * hiTokens;
          if (Math.abs(stdCost - hiCost) > 0.001) {
            result.resolutionTiers = [
              { quality: '1K-2K', size: `~${stdTokens}tok`, costPerImage: stdCost },
              { quality: '4K', size: `~${hiTokens}tok`, costPerImage: hiCost },
            ];
          }
        }
      } else if (pricingUnit === 'per-second') {
        // Video models: compare output per-second if available
        const llOutputPerSecond = ll.outputCostPerVideoPerSecond;
        if (llOutputPerSecond !== undefined) {
          result.litellmOutputPerSecond = llOutputPerSecond;
          const outputDrift = calcDrift(dbOutput, llOutputPerSecond);
          result.litellmDrift = outputDrift;
        } else {
          result.litellmDrift = 0;
        }
      } else {
        // Token models: original logic
        const inputDrift = ll.inputCostPerToken !== undefined ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
        const outputDrift = ll.outputCostPerToken !== undefined ? calcDrift(dbOutput, ll.outputCostPerToken) : 0;
        result.litellmDrift = Math.max(inputDrift, outputDrift);
      }
      if (result.litellmDrift !== undefined) {
        maxDrift = Math.max(maxDrift, result.litellmDrift);
      }
    }

    if (or && or.inputCostPerToken !== undefined && or.outputCostPerToken !== undefined) {
      const inputDrift = calcDrift(dbInput, or.inputCostPerToken);
      result.openrouterInput = or.inputCostPerToken;
      result.openrouterOutput = or.outputCostPerToken;
      if (isPerUnitPricing) {
        result.openrouterDrift = inputDrift;
      } else {
        const outputDrift = calcDrift(dbOutput, or.outputCostPerToken);
        result.openrouterDrift = Math.max(inputDrift, outputDrift);
      }
      maxDrift = Math.max(maxDrift, result.openrouterDrift);
    }

    if (pp && pp.inputCostPerToken !== undefined && pp.outputCostPerToken !== undefined) {
      const inputDrift = calcDrift(dbInput, pp.inputCostPerToken);
      result.providerPageInput = pp.inputCostPerToken;
      result.providerPageOutput = pp.outputCostPerToken;
      if (isPerUnitPricing) {
        result.providerPageDrift = inputDrift;
      } else {
        const outputDrift = calcDrift(dbOutput, pp.outputCostPerToken);
        result.providerPageDrift = Math.max(inputDrift, outputDrift);
      }
      result.providerPageUrl = pp.url;
      maxDrift = Math.max(maxDrift, result.providerPageDrift);
    }

    // Cache token pricing comparison
    // DB stores caching.readRate/writeRate as credit rates; compare against LiteLLM cache costs
    const dbCacheWrite = rate.caching ? Number(rate.caching.writeRate ?? 0) : 0;
    const dbCacheRead = rate.caching ? Number(rate.caching.readRate ?? 0) : 0;
    if (dbCacheWrite > 0 || dbCacheRead > 0) {
      result.dbCacheWrite = dbCacheWrite;
      result.dbCacheRead = dbCacheRead;
    }
    if (ll && (ll.cacheWriteCostPerToken !== undefined || ll.cacheReadCostPerToken !== undefined)) {
      result.litellmCacheWrite = ll.cacheWriteCostPerToken;
      result.litellmCacheRead = ll.cacheReadCostPerToken;

      // Compare DB cache rates vs LiteLLM cache costs
      let cDrift = 0;
      if (dbCacheWrite > 0 && ll.cacheWriteCostPerToken !== undefined && ll.cacheWriteCostPerToken > 0) {
        cDrift = Math.max(cDrift, calcDrift(dbCacheWrite, ll.cacheWriteCostPerToken));
      }
      if (dbCacheRead > 0 && ll.cacheReadCostPerToken !== undefined && ll.cacheReadCostPerToken > 0) {
        cDrift = Math.max(cDrift, calcDrift(dbCacheRead, ll.cacheReadCostPerToken));
      }
      if (cDrift > 0) {
        result.cacheDrift = cDrift;
        maxDrift = Math.max(maxDrift, cDrift);
      }
    }

    result.maxDrift = maxDrift;
    result.exceedsThreshold = maxDrift > threshold;

    // Check pricing sanity: inputRate/outputRate vs unitCosts
    if (rate.unitCosts && (rate.inputRate || rate.outputRate)) {
      const unitInputCost = Number(rate.unitCosts.input);
      const unitOutputCost = Number(rate.unitCosts.output);
      const inputRate = Number(rate.inputRate ?? 0);
      const outputRate = Number(rate.outputRate ?? 0);

      result.inputRate = inputRate;
      result.outputRate = outputRate;

      // Calculate percentage: (rate - cost) / cost * 100
      // Negative = loss (rate < cost), Positive = profit
      if (unitInputCost > 0 && inputRate > 0) {
        result.inputRateIssue = ((inputRate - unitInputCost) / unitInputCost) * 100;
      }
      if (unitOutputCost > 0 && outputRate > 0) {
        result.outputRateIssue = ((outputRate - unitOutputCost) / unitOutputCost) * 100;
      }

      // Flag as issue if either rate deviates more than ±2% from cost
      const PRICING_TOLERANCE = 2; // ±2% tolerance
      result.hasPricingIssue =
        (result.inputRateIssue !== undefined && Math.abs(result.inputRateIssue) > PRICING_TOLERANCE) ||
        (result.outputRateIssue !== undefined && Math.abs(result.outputRateIssue) > PRICING_TOLERANCE);
    } else {
      result.hasPricingIssue = false;
    }

    pickBestCost(result);
    results.push(result);
  }

  results.sort((a, b) => b.maxDrift - a.maxDrift);
  return results;
}

function printTable(results: ComparisonResult[], threshold: number): void {
  // Categorize issues
  const costDriftErrors = results.filter((r) => r.exceedsThreshold);
  const pricingErrors = results.filter((r) => !r.exceedsThreshold && r.hasPricingIssue);
  const fullyCorrect = results.filter((r) => !r.exceedsThreshold && !r.hasPricingIssue);
  const totalErrors = costDriftErrors.length + pricingErrors.length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚨 AIGNE Hub 定价错误报告`);
  console.log(`${'='.repeat(80)}\n`);

  if (totalErrors > 0) {
    console.log(`⚠️  发现 ${totalErrors} 个模型存在定价问题：\n`);
  }

  // 1. Cost Setting Errors (unitCosts vs external sources)
  if (costDriftErrors.length > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`❌ 1. 成本设置错误（${costDriftErrors.length} 个）`);
    console.log(`   成本价格与外部数据源差异超过 ${(threshold * 100).toFixed(0)}%\n`);
    for (let i = 0; i < costDriftErrors.length; i++) {
      const r = costDriftErrors[i];
      const pu = r.pricingUnit;
      const unitLabel = pu === 'per-image' ? ' [按张计费]' : pu === 'per-second' ? ' [按秒计费]' : '';
      console.log(`${i + 1}. ${r.provider}/${r.model} (${r.type})${unitLabel}`);
      console.log(`   ❌ AIGNE Hub 当前设置：`);
      console.log(`      输入成本：${formatCost(r.dbInput)}`);
      console.log(`      输出成本：${formatCost(r.dbOutput, pu)}`);
      if (r.dbCacheWrite || r.dbCacheRead) {
        console.log(`      缓存写入：${formatCost(r.dbCacheWrite || 0)}`);
        console.log(`      缓存读取：${formatCost(r.dbCacheRead || 0)}`);
      }

      // Show recommended price from external sources
      const hasLiteLLM = r.litellmInput !== undefined;
      const hasOpenRouter = r.openrouterInput !== undefined;

      if (hasLiteLLM || hasOpenRouter) {
        const source = hasLiteLLM ? 'LiteLLM' : 'OpenRouter';
        const correctInput = hasLiteLLM ? r.litellmInput! : r.openrouterInput!;
        const correctOutput = hasLiteLLM ? r.litellmOutput! : r.openrouterOutput!;

        console.log(`   ✅ 建议更新为（基于 ${source}）：`);
        console.log(`      输入成本：${formatCost(correctInput)}`);
        if (pu === 'per-token') {
          console.log(`      输出成本：${formatCost(correctOutput)}`);
        } else {
          console.log(
            `      输出成本：${formatCost(r.dbOutput, pu)} (${pu === 'per-image' ? '按张' : '按秒'}计费，外部源为按token，不可直接对比)`
          );
        }

        // Calculate difference
        const inputDiff = correctInput !== 0 ? ((r.dbInput - correctInput) / correctInput) * 100 : 0;
        const outputDiff = correctOutput !== 0 ? ((r.dbOutput - correctOutput) / correctOutput) * 100 : 0;

        if (Math.abs(inputDiff) > threshold * 100) {
          console.log(`   📊 输入成本差异：${inputDiff > 0 ? '高出' : '低了'} ${Math.abs(inputDiff).toFixed(1)}%`);
        }
        if (pu === 'per-token' && Math.abs(outputDiff) > threshold * 100) {
          console.log(`   📊 输出成本差异：${outputDiff > 0 ? '高出' : '低了'} ${Math.abs(outputDiff).toFixed(1)}%`);
        }

        // Show cache drift if any
        if (hasLiteLLM && r.cacheDrift !== undefined && r.cacheDrift > threshold) {
          const ll = { write: r.litellmCacheWrite, read: r.litellmCacheRead };
          if (ll.write !== undefined && r.dbCacheWrite) {
            const writeDiff = ((r.dbCacheWrite - ll.write) / ll.write) * 100;
            if (Math.abs(writeDiff) > threshold * 100)
              console.log(
                `   📊 缓存写入差异：${writeDiff > 0 ? '高出' : '低了'} ${Math.abs(writeDiff).toFixed(1)}% (DB: ${formatCost(r.dbCacheWrite)} vs LiteLLM: ${formatCost(ll.write)})`
              );
          }
          if (ll.read !== undefined && r.dbCacheRead) {
            const readDiff = ((r.dbCacheRead - ll.read) / ll.read) * 100;
            if (Math.abs(readDiff) > threshold * 100)
              console.log(
                `   📊 缓存读取差异：${readDiff > 0 ? '高出' : '低了'} ${Math.abs(readDiff).toFixed(1)}% (DB: ${formatCost(r.dbCacheRead)} vs LiteLLM: ${formatCost(ll.read)})`
              );
          }
        }
      }

      // Show current applied rates and impact
      if (r.inputRate !== undefined || r.outputRate !== undefined) {
        console.log(`   💰 当前实际应用价格：`);
        if (r.inputRate) console.log(`      输入：${formatCost(r.inputRate)}`);
        if (r.outputRate) console.log(`      输出：${formatCost(r.outputRate, pu)}`);

        // Calculate what margin would be after fixing cost
        const correctInput = hasLiteLLM ? r.litellmInput! : hasOpenRouter ? r.openrouterInput! : r.dbInput;
        const correctOutput = hasLiteLLM ? r.litellmOutput! : hasOpenRouter ? r.openrouterOutput! : r.dbOutput;

        if (r.inputRate && correctInput) {
          const newMargin = ((r.inputRate - correctInput) / correctInput) * 100;
          const status = newMargin < -5 ? ' 🔴 过低' : newMargin < 0 ? ' ⚠️' : ' ✅';
          console.log(`   📈 更新成本后利润率（输入）：${newMargin.toFixed(1)}%${status}`);
        }
        if (r.outputRate && correctOutput && pu === 'per-token') {
          const newMargin = ((r.outputRate - correctOutput) / correctOutput) * 100;
          const status = newMargin < -5 ? ' 🔴 过低' : newMargin < 0 ? ' ⚠️' : ' ✅';
          console.log(`   📈 更新成本后利润率（输出）：${newMargin.toFixed(1)}%${status}`);
        }
      }

      console.log('');
    }
  }

  // 2. Pricing Deviation Errors (inputRate/outputRate deviation > ±2%)
  if (pricingErrors.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`❌ 2. 售价偏差错误（${pricingErrors.length} 个）`);
    console.log(`   售价与成本的偏差超过 ±2% 阈值\n`);
    console.log(
      padRight('Provider', 15) +
        padRight('Model', 30) +
        padRight('成本', 14) +
        padRight('售价', 14) +
        padRight('偏差', 12) +
        padRight('状态', 15)
    );
    console.log('-'.repeat(100));

    for (const r of pricingErrors) {
      if (r.inputRateIssue !== undefined && Math.abs(r.inputRateIssue) > 2) {
        const status = r.inputRateIssue < 0 ? '🔴 亏损' : '🟡 盈利过高';
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (input)`, 30) +
            padRight(formatCost(r.dbInput), 14) +
            padRight(formatCost(r.inputRate!), 14) +
            padRight(`${r.inputRateIssue.toFixed(1)}%`, 12) +
            padRight(status, 15)
        );
      }
      if (r.outputRateIssue !== undefined && Math.abs(r.outputRateIssue) > 2) {
        const status = r.outputRateIssue < 0 ? '🔴 亏损' : '🟡 盈利过高';
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (output)`, 30) +
            padRight(formatCost(r.dbOutput), 14) +
            padRight(formatCost(r.outputRate!), 14) +
            padRight(`${r.outputRateIssue.toFixed(1)}%`, 12) +
            padRight(status, 15)
        );
      }
    }
    console.log(`\nℹ️  偏差说明：负数=亏损（售价<成本），正数=盈利（售价>成本）\n`);
    console.log(`ℹ️  阈值：售价应控制在成本的 ±2% 范围内\n`);
  }

  // 3. Fully Correct Pricing
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ 定价完全正确（${fullyCorrect.length} 个）`);
  console.log(`   成本设置准确 + 售价偏差在 ±2% 内`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`总计检查：${results.length} 个模型\n`);

  // Generate bulk-rate-update suggestions for cost drift errors
  if (costDriftErrors.length > 0) {
    console.log(`${'='.repeat(80)}`);
    console.log('建议的批量更新 API 调用（成本设置错误）:');
    console.log(`${'='.repeat(80)}\n`);

    const updates = costDriftErrors
      .filter((r) => r.litellmInput !== undefined || r.openrouterInput !== undefined)
      .map((r) => {
        // Prefer LiteLLM as the update source, fallback to OpenRouter
        const source = r.litellmInput !== undefined ? 'litellm' : 'openrouter';
        const input = source === 'litellm' ? r.litellmInput! : r.openrouterInput!;
        const output = source === 'litellm' ? r.litellmOutput! : r.openrouterOutput!;
        return {
          provider: r.provider,
          model: r.model,
          type: r.type,
          unitCosts: { input, output },
          source,
        };
      });

    console.log('POST /api/ai-providers/bulk-rate-update');
    console.log(JSON.stringify({ rates: updates }, null, 2));
  }
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function formatCost(cost: number, unit: PricingUnit = 'per-token'): string {
  if (cost === 0) return '$0';
  if (unit === 'per-image') return `$${cost.toFixed(4)}/张`;
  if (unit === 'per-second') return `$${cost.toFixed(4)}/秒`;
  // Convert to per-1M-tokens format
  const perMillion = cost * 1000000;
  if (perMillion < 0.01) return `$${perMillion.toExponential(2)}/1M`;
  if (perMillion < 1) return `$${perMillion.toFixed(3)}/1M`;
  if (perMillion < 10) return `$${perMillion.toFixed(2)}/1M`;
  return `$${perMillion.toFixed(1)}/1M`;
}

async function askGenerateHtml(): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\n📊 Generate HTML report? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main(): Promise<void> {
  const opts = await parseArgs();
  // Use stderr for info logs so --json output stays clean on stdout
  const log = opts.json ? console.error.bind(console) : console.log.bind(console);
  log(`AIGNE Hub Pricing Analyzer`);
  log(`Hub URL: ${opts.hubUrl}`);
  log(`Threshold: ${(opts.threshold * 100).toFixed(0)}%\n`);

  // Fetch all sources in parallel
  const [dbRates, litellm, openrouter, providerPages] = await Promise.all([
    fetchDbRates(opts.hubUrl, opts.token),
    fetchLiteLLM(),
    fetchOpenRouter(),
    fetchProviderPages(),
  ]);

  if (dbRates.length === 0) {
    console.error('No DB rates found. Check Hub URL and authentication.');
    process.exit(1);
  }

  log(`Fetched ${dbRates.length} rates from DB\n`);

  const results = compare(dbRates, litellm, openrouter, providerPages, opts.threshold);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printTable(results, opts.threshold);

    // Ask if user wants to generate HTML report
    const shouldGenerateHtml = await askGenerateHtml();
    if (shouldGenerateHtml) {
      const { execSync } = await import('child_process');
      const tempFile = '/tmp/pricing-analysis.json';
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const outputFile = `pricing-analysis-${opts.env || 'local'}-${timestamp}.html`;

      // Write JSON to temp file
      await fs.writeFile(tempFile, JSON.stringify(results, null, 2));

      // Generate HTML report
      const scriptDir = new URL('.', import.meta.url).pathname;
      const reportScript = `${scriptDir}/generate-html-report.mjs`;

      try {
        console.log('\n📝 Generating HTML report...');
        execSync(`node "${reportScript}" "${tempFile}" "${outputFile}"`, { stdio: 'inherit' });

        // Open in browser
        console.log('\n🌐 Opening report in browser...');
        const openCommand =
          process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        execSync(`${openCommand} "${outputFile}"`);
      } catch (err) {
        console.error('Failed to generate HTML report:', err);
      }
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
