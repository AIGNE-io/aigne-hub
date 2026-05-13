/**
 * Pricing Comparison — thin wrapper around pricing-core.mjs.
 *
 * Uses the SAME compare() + classifyModel() logic as the HTML report skill.
 * No duplicate business logic — single source of truth.
 */

import { RATE_SOURCE_DRIFT_THRESHOLD } from '@api/libs/env';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import axios from 'axios';

import logger from './logger';
// @ts-ignore — pricing-core.mjs is a pure JS module shared with CLI and browser
// eslint-disable-next-line import/extensions
import { classifyModel, compare } from './pricing-core.mjs';
import { fetchRemoteCatalog } from './remote-pricing-catalog';

const LITELLM_RAW_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

// Re-export the core functions for consumers
export { classifyModel };

/** Result from compare() + classification. Untyped — mirrors pricing-core.mjs output. */
export type ComparisonResult = Record<string, any> & {
  provider: string;
  model: string;
  type: string;
  classification: 'below-cost' | 'drift' | 'no-match' | 'normal';
  maxDrift: number;
  dbInput: number;
  dbOutput: number;
};

/**
 * Fetch LiteLLM raw data and build the same Map format that pricing-core.mjs expects.
 * Includes tiered pricing (≥200K), cache costs, resolution tiers — everything.
 */
async function fetchLiteLLMMap(): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  try {
    const { data } = await axios.get(LITELLM_RAW_URL, { timeout: 30000 });
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      if (key === 'sample_spec' || !val.litellm_provider) continue;
      const provider = val.litellm_provider;
      const modelName = key.includes('/') ? key.split('/').slice(1).join('/') : key;

      const entry: Record<string, any> = {
        inputCostPerToken: val.input_cost_per_token,
        outputCostPerToken: val.output_cost_per_token,
        cacheWriteCostPerToken: val.cache_creation_input_token_cost,
        cacheReadCostPerToken: val.cache_read_input_token_cost,
        outputCostPerImage: val.output_cost_per_image,
        inputCostPerImage: val.input_cost_per_image,
        outputCostPerImageToken: val.output_cost_per_image_token,
        outputCostPerVideoPerSecond: val.output_cost_per_video_per_second,
      };

      // Tiered pricing (≥200K context)
      const above200kInput = val.input_cost_per_token_above_200k_tokens;
      const above200kOutput = val.output_cost_per_token_above_200k_tokens;
      if (above200kInput != null || above200kOutput != null) {
        entry.tieredPricing = [
          {
            threshold: '>200K',
            input: above200kInput ?? val.input_cost_per_token,
            output: above200kOutput ?? val.output_cost_per_token,
          },
        ];
      }

      // Context tier (above 128K for some models)
      const above128kInput = val.input_cost_per_token_above_128k_tokens;
      const above128kOutput = val.output_cost_per_token_above_128k_tokens;
      if (above128kInput != null || above128kOutput != null) {
        if (!entry.tieredPricing) entry.tieredPricing = [];
        entry.tieredPricing.push({
          threshold: '>128K',
          input: above128kInput ?? val.input_cost_per_token,
          output: above128kOutput ?? val.output_cost_per_token,
        });
      }

      map.set(`${provider}/${modelName}`, entry);
    }
    logger.info('LiteLLM fetched', { count: map.size });
  } catch (err) {
    logger.warn('Failed to fetch LiteLLM', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return map;
}

export async function compareAgainstDbRates(
  threshold: number = RATE_SOURCE_DRIFT_THRESHOLD,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: { forceRefresh?: boolean }
): Promise<ComparisonResult[]> {
  // Fetch all sources + DB in parallel
  const [litellmMap, officialCatalog, dbRates, providers] = await Promise.all([
    fetchLiteLLMMap(),
    fetchRemoteCatalog().catch((err) => {
      logger.warn('Failed to fetch remote catalog', { error: err });
      return new Map();
    }),
    AiModelRate.findAll(),
    AiProvider.findAll(),
  ]);

  const providerMap = new Map(providers.map((p) => [p.id, p.name]));

  // Convert DB rates to the format pricing-core.mjs expects
  const dbRatesForCore = dbRates.map((rate) => ({
    ...rate.toJSON(),
    provider: { name: providerMap.get(rate.providerId) || '' },
  }));

  // OpenRouter data is already in officialCatalog — pass empty map
  const openrouterMap = new Map();

  // Call the SAME compare() used by the HTML report
  const results: ComparisonResult[] = compare(dbRatesForCore, litellmMap, openrouterMap, officialCatalog, threshold);

  // Classify each model using the SAME classifyModel()
  for (const r of results) {
    r.classification = classifyModel(r);
  }

  const grouped = {
    belowCost: results.filter((r: any) => r.classification === 'below-cost').length,
    drift: results.filter((r: any) => r.classification === 'drift').length,
    noMatch: results.filter((r: any) => r.classification === 'no-match').length,
    normal: results.filter((r: any) => r.classification === 'normal').length,
  };

  logger.info('Rate comparison completed', {
    totalChecked: dbRates.length,
    ...grouped,
    threshold,
    sources: { litellm: litellmMap.size, officialCatalog: officialCatalog.size },
  });

  return results;
}
