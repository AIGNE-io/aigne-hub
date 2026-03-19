/**
 * Data Source Fetchers
 *
 * Fetches pricing data from multiple sources:
 * - Hub DB rates (paginated API)
 * - LiteLLM (GitHub raw JSON)
 * - OpenRouter (API)
 * - Official Pricing Cache (local file written by official-pricing-catalog.mjs)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';

import { typePriority as _typePriority } from './core/pricing-core.mjs';
import { buildApiUrl } from './detect-mount-point.mjs';
import type { OfficialPricingCache, OfficialPricingEntry } from './pricing-schema';
import { normalizeProvider } from './provider-aliases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const LITELLM_API_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DbRate {
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

export interface ExternalRate {
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

// ─── Official Pricing Cache ──────────────────────────────────────────────────
// Reads the merged all-providers cache file written by official-pricing-catalog.mjs --cache.

const OFFICIAL_PRICING_ALL_PATH = path.join(OUTPUT_DIR, 'aigne-official-pricing-all.json');
const OFFICIAL_PRICING_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const REMOTE_PRICING_URL = 'https://raw.githubusercontent.com/blocklet/model-pricing-data/main/data/pricing.json';
const MAIN_PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'openrouter'];

function _buildOfficialMap(entries: OfficialPricingEntry[]): Map<string, OfficialPricingEntry> | null {
  const map = new Map<string, OfficialPricingEntry>();
  for (const entry of entries) {
    const id = entry.modelId || (entry as any).model;
    if (!id) continue;
    const baseKey = `${entry.provider}/${id}`;

    // Always store under type-qualified key for precise lookups
    if (entry.modelType) {
      map.set(`${baseKey}::${entry.modelType}`, entry);
    }

    // For the base key, prefer higher-priority types (chatCompletion > lexicon > ... > fineTuning).
    const existing = map.get(baseKey);
    if (!existing || _typePriority(entry.modelType) < _typePriority(existing.modelType)) {
      map.set(baseKey, entry);
    }
  }
  return map.size > 0 ? map : null;
}

export async function loadOfficialPricingCache(): Promise<Map<string, OfficialPricingEntry> | null> {
  try {
    const data = await fs.readFile(OFFICIAL_PRICING_ALL_PATH, 'utf-8');
    const cache = JSON.parse(data) as { timestamp: number; entries: OfficialPricingEntry[] };
    if (Date.now() - cache.timestamp > OFFICIAL_PRICING_CACHE_TTL) return null;
    return _buildOfficialMap(cache.entries);
  } catch {
    return null;
  }
}

/**
 * Fetch official pricing directly from the remote pre-built catalog.
 * This avoids running the catalog subprocess and is the fastest path.
 * The remote JSON uses { providers: { [provider]: { [modelId::type]: entry } } }
 * and we convert the `caching` object to `cacheTiers` array + `cachedInputCostPerToken`.
 */
export async function fetchRemoteOfficialPricing(
  url: string = REMOTE_PRICING_URL
): Promise<Map<string, OfficialPricingEntry> | null> {
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const json = res.data as {
      _meta?: any;
      providers: Record<string, Record<string, any>>;
    };
    if (!json.providers) return null;

    const entries: OfficialPricingEntry[] = [];

    for (const providerKey of MAIN_PROVIDERS) {
      const providerData = json.providers[providerKey];
      if (!providerData) continue;

      for (const [key, val] of Object.entries(providerData) as [string, any][]) {
        const parts = key.split('::');
        // Normalize version dots to hyphens: claude-opus-4.6 → claude-opus-4-6
        const modelId = parts[0].replace(/(\d+)\.(\d+)$/g, '$1-$2');
        const modelType = val.modelType || parts[1] || 'chatCompletion';

        const entry: OfficialPricingEntry = {
          provider: providerKey,
          modelId,
          displayName: val.displayName || modelId,
          pricingUnit: val.pricingUnit || 'per-token',
          modelType,
          sourceUrl: val.sourceUrl || '',
          extractionMethod: val.extractionMethod || 'remote-catalog',
        };

        if (val.inputCostPerToken != null) entry.inputCostPerToken = val.inputCostPerToken;
        if (val.outputCostPerToken != null) entry.outputCostPerToken = val.outputCostPerToken;

        // Convert caching object → cacheTiers + cachedInputCostPerToken
        if (val.caching && typeof val.caching === 'object') {
          const cacheTiers: { label: string; costPerToken: number }[] = [];
          for (const [label, costPerToken] of Object.entries(val.caching) as [string, number][]) {
            cacheTiers.push({ label, costPerToken });
          }
          if (cacheTiers.length > 0) entry.cacheTiers = cacheTiers;
          if (val.caching.read != null) entry.cachedInputCostPerToken = val.caching.read;
        }

        if (val.contextTiers?.length > 0) entry.contextTiers = val.contextTiers;
        if (val.batchPricing) entry.batchPricing = val.batchPricing;
        if (val.specialModes?.length > 0) entry.specialModes = val.specialModes;
        if (val.costPerImage != null) entry.costPerImage = val.costPerImage;
        if (val.imageVariants) entry.imageVariants = val.imageVariants;
        if (val.costPerSecond != null) entry.costPerSecond = val.costPerSecond;
        if (val.videoVariants) entry.videoVariants = val.videoVariants;
        if (val.deprecated) entry.deprecated = true;

        entries.push(entry);
      }
    }

    // Also write to local cache file so subsequent --no-scrape runs can use it
    const cacheData = { timestamp: Date.now(), providers: MAIN_PROVIDERS, totalModels: entries.length, entries };
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OFFICIAL_PRICING_ALL_PATH, JSON.stringify(cacheData, null, 2));

    return _buildOfficialMap(entries);
  } catch (err: any) {
    console.error(`Failed to fetch remote pricing: ${err.message}`);
    return null;
  }
}

// ─── Hub DB Rates ────────────────────────────────────────────────────────────

export async function fetchDbRates(hubUrl: string, token?: string): Promise<DbRate[]> {
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

// ─── LiteLLM ─────────────────────────────────────────────────────────────────

export async function fetchLiteLLM(): Promise<Map<string, ExternalRate>> {
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
          const normalizedProv = normalizeProvider(litellmProvider) || litellmProvider;
          const baseKey = `${normalizedProv}/${baseModel}`;
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
      const normalizedProv = normalizeProvider(litellmProvider);
      if (normalizedProv && normalizedProv !== litellmProvider) {
        const normalizedKey = `${normalizedProv}/${modelName}`;
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

// ─── OpenRouter ──────────────────────────────────────────────────────────────

export async function fetchOpenRouter(): Promise<Map<string, ExternalRate>> {
  const map = new Map<string, ExternalRate>();

  try {
    const res = await axios.get(OPENROUTER_API_URL, { timeout: 30000 });
    const models = res.data?.data || [];
    for (const model of models) {
      if (!model.pricing?.prompt || !model.pricing?.completion) continue;
      const slashIdx = model.id.indexOf('/');
      if (slashIdx === -1) continue;
      const prefix = model.id.substring(0, slashIdx);
      const modelName = model.id.substring(slashIdx + 1);
      const provider = normalizeProvider(prefix) || prefix;
      const input = parseFloat(model.pricing.prompt);
      const output = parseFloat(model.pricing.completion);
      if (!isNaN(input) && !isNaN(output)) {
        const rate = { inputCostPerToken: input, outputCostPerToken: output };
        map.set(`${provider}/${modelName}`, rate);
        // Also store under original prefix (e.g., "x-ai/grok-4") so DB entries using raw OpenRouter IDs can match
        if (provider !== prefix) {
          map.set(`${prefix}/${modelName}`, rate);
        }
      }
    }
    console.error(`Fetched ${map.size} models from OpenRouter`);
  } catch (err: any) {
    console.error(`Failed to fetch OpenRouter data: ${err.message}`);
  }
  return map;
}
