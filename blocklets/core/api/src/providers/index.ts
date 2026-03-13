import { getAIApiKey, getOpenAI } from '@api/libs/ai-provider';
import { Config } from '@api/libs/env';
import { ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
import OpenAI from 'openai';

import { geminiChatCompletion } from './gemini';
import { getCachedModelRates } from './model-rate-cache';
import { openaiChatCompletion } from './openai';

export { clearModelRateCache, getCachedModelRates } from './model-rate-cache';

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

export async function checkModelRateAvailable(modelName: string, providerId: string) {
  // Env-only providers may have no DB record (providerId = '').
  // Fall through to static pricing config check instead of throwing.
  if (!providerId) {
    if (!Config.creditBasedBillingEnabled && !Config.pricing?.onlyEnableModelsInPricing) {
      return;
    }
    if (Config.pricing?.onlyEnableModelsInPricing) {
      if (!Config.pricing.list.some((i) => i.model === modelName)) {
        throw new CustomError(400, `Unsupported model ${modelName}`);
      }
      return;
    }
    throw new CustomError(400, `Unsupported model ${modelName}`);
  }

  const modelRates = await getCachedModelRates(modelName, providerId);

  if (modelRates.length === 0) {
    if (!Config.creditBasedBillingEnabled && !Config.pricing?.onlyEnableModelsInPricing) {
      return;
    }
    if (Config.pricing?.onlyEnableModelsInPricing) {
      if (!Config.pricing.list.some((i) => i.model === modelName)) {
        throw new CustomError(400, `Unsupported model ${modelName}`);
      }
    } else {
      throw new CustomError(400, `Unsupported model ${modelName}`);
    }
  }
}
