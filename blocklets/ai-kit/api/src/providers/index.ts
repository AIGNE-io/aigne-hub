import { getAIApiKey, getOpenAI } from '@api/libs/ai-provider';
import { Config } from '@api/libs/env';
import { ChatCompletionInput, ChatCompletionResponse } from '@blocklet/ai-kit/api/types';
import OpenAI from 'openai';

import { geminiChatCompletion } from './gemini';
import { openaiChatCompletion } from './openai';

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
            throw new Error(`Unsupported model ${input.model}`);
          })();

  return result;
}

export function checkModelAvailable(model: string) {
  if (Config.pricing?.onlyEnableModelsInPricing) {
    if (!Config.pricing.list.some((i) => i.model === model)) {
      throw new Error(`Unsupported model ${model}`);
    }
  }
}
