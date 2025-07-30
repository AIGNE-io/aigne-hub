import { getAIApiKey, getModelNameWithProvider, getOpenAI } from '@api/libs/ai-provider';
import { Config } from '@api/libs/env';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
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
            throw new CustomError(400, `Unsupported model ${input.model}`);
          })();

  return result;
}

export function checkModelAvailable(model: string) {
  if (!model) {
    throw new CustomError(400, 'Model is required');
  }
  if (Config.pricing?.onlyEnableModelsInPricing) {
    const { modelName } = getModelNameWithProvider(model);
    if (!Config.pricing.list.some((i) => i.model === modelName)) {
      throw new CustomError(400, `Unsupported model ${model}`);
    }
  }
}

export async function checkModelRateAvailable(model: string, providerName?: string) {
  const { providerName: provider, modelName } = getModelNameWithProvider(model);
  const callback = (err: Error) => {
    try {
      checkModelAvailable(model);
    } catch {
      throw err;
    }
  };
  let providerId;
  if (provider) {
    const providerRecord = await AiProvider.findOne({
      where: {
        name: provider,
        enabled: true,
      },
    });
    if (!providerRecord) {
      callback(new CustomError(404, `Provider ${providerName} not found`));
      return;
    }
    providerId = providerRecord?.id;
  }
  const modelRateWhere: any = {
    model: modelName,
  };
  if (providerId) {
    modelRateWhere.providerId = providerId;
  }
  const modelRates = await AiModelRate.findAll({
    where: modelRateWhere,
  });
  if (modelRates.length === 0) {
    if (!Config.creditBasedBillingEnabled && !Config.pricing?.onlyEnableModelsInPricing) {
      return;
    }
    callback(
      new CustomError(400, `Unsupported model ${modelName}${providerName ? ` for provider ${providerName}` : ''}`)
    );
  }
}
