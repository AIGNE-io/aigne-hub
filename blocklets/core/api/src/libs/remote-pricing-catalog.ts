/**
 * Remote Pricing Catalog — fetches pre-built official pricing data
 * from blocklet/model-pricing-data repository.
 *
 * This replaces fragile per-provider HTML scraping with a single reliable
 * JSON fetch. The remote data is maintained separately and updated via CI.
 */

import axios from 'axios';

import logger from './logger';

const REMOTE_CATALOG_URL = 'https://raw.githubusercontent.com/blocklet/model-pricing-data/main/data/pricing.json';

const OFFICIAL_PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];
const ALL_PROVIDERS = [...OFFICIAL_PROVIDERS, 'openrouter'];

// Cache: in-memory with TTL
// eslint-disable-next-line @typescript-eslint/naming-convention
let catalogCache: { data: Map<string, RemotePricingEntry>; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface RemotePricingEntry {
  provider: string;
  modelId: string;
  modelType: string;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  cachedInputCostPerToken?: number;
  contextTiers?: { threshold: string; inputCostPerToken?: number; outputCostPerToken?: number }[];
  caching?: Record<string, number>; // e.g. { "read": 5e-7, "write-5min": 6.25e-6, "write-1h": 1e-5 }
  sourceUrl: string;
}

/**
 * Fetch official pricing from the remote pre-built catalog.
 * Returns a Map keyed by "provider/modelId" → entry.
 * Results are cached in memory for 1 hour.
 */
export async function fetchRemoteCatalog(url: string = REMOTE_CATALOG_URL): Promise<Map<string, RemotePricingEntry>> {
  // Return cached data if fresh
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL) {
    return catalogCache.data;
  }

  const map = new Map<string, RemotePricingEntry>();

  try {
    const res = await axios.get(url, { timeout: 30000 });
    const json = res.data as {
      _meta?: { totalModels?: number };
      providers: Record<string, Record<string, any>>;
    };

    if (!json.providers) {
      logger.warn('Remote pricing catalog: missing "providers" key');
      return map;
    }

    for (const providerKey of ALL_PROVIDERS) {
      const providerData = json.providers[providerKey];
      if (!providerData) continue;

      for (const [key, val] of Object.entries(providerData) as [string, any][]) {
        const parts = key.split('::');
        const modelId = parts[0] ?? key;
        const modelType = val.modelType || parts[1] || 'chatCompletion';

        // OpenRouter keys are "provider/model" (e.g. "openai/gpt-4o") — use as-is for lookup
        // Official provider keys are just "modelId" — prefix with provider

        const entry: RemotePricingEntry = {
          provider: providerKey,
          modelId,
          modelType,
          sourceUrl: val.sourceUrl || '',
        };

        if (val.inputCostPerToken != null) entry.inputCostPerToken = val.inputCostPerToken;
        if (val.outputCostPerToken != null) entry.outputCostPerToken = val.outputCostPerToken;
        if (val.caching?.read != null) entry.cachedInputCostPerToken = val.caching.read;
        if (val.caching && typeof val.caching === 'object') entry.caching = val.caching;
        if (val.contextTiers?.length) entry.contextTiers = val.contextTiers;

        if (providerKey === 'openrouter') {
          // Store OpenRouter entries under "openrouter/provider/model" for direct lookup
          // AND under "provider/model" as a fallback (lower priority than official)
          const orKey = `openrouter/${modelId}`;
          map.set(orKey, entry);

          // Also store under the original provider key, but don't override official entries
          const crossKey = modelId; // already "provider/model"
          if (!map.has(crossKey)) {
            map.set(crossKey, entry);
          }
        } else {
          // Official provider: store under "provider/modelId"
          const baseKey = `${providerKey}/${modelId}`;
          const existing = map.get(baseKey);
          if (!existing || modelType === 'chatCompletion') {
            map.set(baseKey, entry);
          }
          map.set(`${baseKey}::${modelType}`, entry);
        }
      }
    }

    catalogCache = { data: map, fetchedAt: Date.now() };

    const uniqueModels = new Set([...map.keys()].filter((k) => !k.includes('::')));
    logger.info('Remote pricing catalog fetched', {
      url,
      totalEntries: map.size,
      uniqueModels: uniqueModels.size,
      providers: ALL_PROVIDERS,
    });
  } catch (err) {
    logger.warn('Failed to fetch remote pricing catalog', {
      error: err instanceof Error ? err.message : String(err),
      url,
    });
  }

  return map;
}

/** Clear the in-memory cache (useful for testing or force-refresh). */
export function clearRemoteCatalogCache(): void {
  catalogCache = null;
}
