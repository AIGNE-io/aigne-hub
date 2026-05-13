// Removed unused imports
import axios from 'axios';
import { LRUCache } from 'lru-cache';

import logger from './logger';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
  };
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

export interface NormalizedPricing {
  provider: string;
  model: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  source: 'openrouter';
}

/**
 * Map OpenRouter model id prefix to AIGNE Hub provider name.
 * OpenRouter uses "openai/gpt-4o" style ids.
 */
const OPENROUTER_PROVIDER_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  deepseek: 'deepseek',
  'x-ai': 'xai',
  mistralai: 'mistral',
  meta: 'meta',
};

function normalizeOpenRouterModel(id: string): { provider: string; model: string } | null {
  const slashIndex = id.indexOf('/');
  if (slashIndex === -1) return null;

  const prefix = id.substring(0, slashIndex);
  const model = id.substring(slashIndex + 1);
  const provider = OPENROUTER_PROVIDER_MAP[prefix] || prefix;

  return { provider, model };
}

class OpenRouterPricing {
  private cache = new LRUCache<string, NormalizedPricing[]>({ max: 1, ttl: CACHE_TTL });

  async getAllPricing(forceRefresh = false): Promise<NormalizedPricing[]> {
    const cacheKey = 'all';
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      logger.info('Fetching pricing data from OpenRouter...');
      const response = await axios.get<{ data: OpenRouterModel[] }>(OPENROUTER_API_URL, {
        timeout: 30000,
      });

      const models = response.data?.data || [];
      const normalized: NormalizedPricing[] = [];

      for (const model of models) {
        if (!model.pricing?.prompt || !model.pricing?.completion) continue;

        const parsed = normalizeOpenRouterModel(model.id);
        if (!parsed) continue;

        const inputCostPerToken = parseFloat(model.pricing.prompt);
        const outputCostPerToken = parseFloat(model.pricing.completion);

        if (Number.isNaN(inputCostPerToken) || Number.isNaN(outputCostPerToken)) continue;

        normalized.push({
          provider: parsed.provider,
          model: parsed.model,
          inputCostPerToken,
          outputCostPerToken,
          source: 'openrouter',
        });
      }

      this.cache.set(cacheKey, normalized);
      logger.info(`Cached ${normalized.length} models from OpenRouter`);
      return normalized;
    } catch (error) {
      logger.error('Failed to fetch pricing from OpenRouter', { error });
      return this.cache.get(cacheKey) || [];
    }
  }

  async refreshPricing(): Promise<NormalizedPricing[]> {
    return this.getAllPricing(true);
  }

  getCacheStatus(): { cached: boolean; size: number } {
    const cached = this.cache.get('all');
    return { cached: !!cached, size: cached?.length || 0 };
  }
}

export const openRouterPricing = new OpenRouterPricing();
export { normalizeOpenRouterModel };
