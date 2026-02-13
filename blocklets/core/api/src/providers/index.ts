import { getAIApiKey, getOpenAI } from '@api/libs/ai-provider';
import { Config } from '@api/libs/env';
import AiModelRate from '@api/store/models/ai-model-rate';
import { ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
import { LRUCache } from 'lru-cache';
import OpenAI from 'openai';

import { geminiChatCompletion } from './gemini';
import { openaiChatCompletion } from './openai';

// Cache model rates to avoid repeated DB queries per request
const modelRateCache = new LRUCache<string, AiModelRate[]>({ max: 200, ttl: 10 * 60 * 1000 });

export function chatCompletion(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>
): AsyncGenerator<ChatCompletionResponse> {
  const result = input.model.startsWith('gemini')
    ? geminiChatCompletion(input, { apiKey: getAIApiKey('gemini') })
    : input.model.startsWith('gpt')
      ? openaiChatCompletion(input, getOpenAI())
      : input.model.startsWith('openRouter/')
        ? openaiChatCompletion(
            { ...input, model: input.model.replace('openRouter/', '') },
            new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: getAIApiKey('openRouter') })
          )
        : (() => {
            throw new CustomError(400, `Unsupported model ${input.model}`);
          })();

  return result;
}

export async function getCachedModelRates(modelName: string, providerId?: string): Promise<AiModelRate[]> {
  const cacheKey = `${modelName}:${providerId || ''}`;
  let cached = modelRateCache.get(cacheKey);
  if (!cached) {
    const where: any = { model: modelName };
    if (providerId) {
      where.providerId = providerId;
    }
    cached = await AiModelRate.findAll({ where });
    if (cached.length > 0) {
      modelRateCache.set(cacheKey, cached);
    }
  }
  return cached;
}

export async function checkModelRateAvailable(modelName: string, providerId: string) {
  if (!providerId) {
    throw new CustomError(400, 'Provider ID is required for rate check');
  }

  const modelRates = await getCachedModelRates(modelName, providerId);

  if (modelRates.length === 0) {
    if (!Config.creditBasedBillingEnabled && !Config.pricing?.onlyEnableModelsInPricing) {
      return;
    }
    // Fallback: check static pricing config
    if (Config.pricing?.onlyEnableModelsInPricing) {
      if (!Config.pricing.list.some((i) => i.model === modelName)) {
        throw new CustomError(400, `Unsupported model ${modelName}`);
      }
    } else {
      throw new CustomError(400, `Unsupported model ${modelName}`);
    }
  }
}
