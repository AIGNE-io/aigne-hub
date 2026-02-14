import { availableModels as availableChatModels, findImageModel } from '@aigne/aigne-hub';
import { AIGNE, ChatModelOptions, ImageModelOptions } from '@aigne/core';
import type { OpenAIChatModelOptions, OpenAIImageModelOptions } from '@aigne/openai';
import logger from '@api/libs/logger';
import { InvokeOptions } from '@api/libs/on-error';
import AiCredential from '@api/store/models/ai-credential';
import AiProvider from '@api/store/models/ai-provider';
import { ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
import { Request } from 'express';
import { omit, omitBy, pick } from 'lodash';
import { LRUCache } from 'lru-cache';

import { getModelNameWithProvider } from '../libs/ai-provider';
import { AIProviderType as AIProvider } from '../libs/constants';
import { BASE_URL_CONFIG_MAP, aigneHubConfigProviderUrl, getAIApiKey, getBedrockConfig } from './keys';
import { adaptStreamToOldFormat, convertToFrameworkMessages } from './util';

// Cache provider records to avoid repeated AiProvider.findOne per request
interface CachedProvider {
  id: string;
  name: string;
  displayName?: string;
  baseUrl?: string;
  region?: string;
}
const providerCache = new LRUCache<string, CachedProvider>({ max: 50, ttl: 10 * 60 * 1000 });

export function clearProviderCache(providerName?: string) {
  if (providerName) {
    providerCache.delete(providerName);
  } else {
    providerCache.clear();
  }
}

export async function getProviderWithCache(providerName: string): Promise<CachedProvider | undefined> {
  const cached = providerCache.get(providerName);
  if (cached) return cached;

  const providerRecord = await AiProvider.findOne({ where: { name: providerName, enabled: true } });
  if (!providerRecord) return undefined;

  const entry: CachedProvider = {
    id: providerRecord.id,
    name: providerRecord.name,
    displayName: providerRecord.displayName,
    baseUrl: providerRecord.baseUrl,
    region: providerRecord.region,
  };
  providerCache.set(providerName, entry);
  return entry;
}

export async function getProviderCredentials(provider: string): Promise<{
  id?: string;
  providerId?: string;
  apiKey?: string;
  baseURL?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
}> {
  const callback = async (err: Error) => {
    try {
      let params: {
        apiKey?: string;
        baseURL?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        region?: string;
      };
      if (provider === 'bedrock') {
        params = await getBedrockConfig();
      } else {
        params = await getAIApiKey(provider as AIProvider);
      }
      const baseURLGetter = BASE_URL_CONFIG_MAP[provider as keyof typeof BASE_URL_CONFIG_MAP];
      if (baseURLGetter) {
        const baseURL = baseURLGetter();
        if (baseURL) {
          params.baseURL = baseURL;
        }
      }
      return params;
    } catch {
      throw err;
    }
  };

  const errorMessage = await aigneHubConfigProviderUrl();

  // Try cached provider first
  let cached = providerCache.get(provider);
  if (!cached) {
    const providerRecord = await AiProvider.findOne({ where: { name: provider, enabled: true } });
    if (!providerRecord) {
      return callback(new CustomError(404, `Provider ${provider} not found, ${errorMessage}`));
    }
    cached = {
      id: providerRecord.id,
      name: providerRecord.name,
      displayName: providerRecord.displayName,
      baseUrl: providerRecord.baseUrl,
      region: providerRecord.region,
    };
    providerCache.set(provider, cached);
  }

  const credential = await AiCredential.getNextAvailableCredential(cached.id);

  if (!credential) {
    return callback(new CustomError(404, `No active credentials found for provider ${provider}, ${errorMessage}`));
  }

  const value = AiCredential.decryptCredentialValue(credential!.credentialValue);

  return {
    id: credential.id,
    providerId: cached.id,
    apiKey: value.api_key,
    baseURL: cached.baseUrl,
    accessKeyId: value.access_key_id,
    secretAccessKey: value.secret_access_key,
    region: cached.region,
  };
}

export async function chatCompletionByFrameworkModel(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  userDid?: string,
  options?: InvokeOptions & { req: Request }
): Promise<AsyncGenerator<ChatCompletionResponse>> {
  const { modelInstance } = await getModel(input, { req: options?.req });
  const engine = new AIGNE();

  const convertedMessages = await convertToFrameworkMessages(input.messages);

  const response = await engine.invoke(
    modelInstance,
    {
      messages: convertedMessages,
      responseFormat: input.responseFormat?.type === 'json_schema' ? input.responseFormat : { type: 'text' },
      toolChoice: input.toolChoice,
      tools: input.tools,
      modelOptions: pick(input, ['temperature', 'topP', 'presencePenalty', 'frequencyPenalty', 'maxTokens']),
    },
    { streaming: true, userContext: { userId: userDid }, hooks: { onEnd: options?.onEnd, onError: options?.onError } }
  );

  return adaptStreamToOldFormat(response);
}

async function loadModel(
  model: string,
  {
    provider,
    modelOptions,
    clientOptions,
  }: {
    provider?: string;
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
    req?: Request;
  } = {}
) {
  const providerName = provider?.toLowerCase().replace(/-/g, '') || '';
  const m = await getModelByProviderName(providerName);

  if (!m)
    throw new CustomError(
      404,
      `Provider ${provider} model ${model} not found, Please check the model name and provider.`
    );

  const params: {
    id?: string;
    apiKey?: string;
    baseURL?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
  } = await getProviderCredentials(providerName);

  if (modelOptions) {
    params.modelOptions = modelOptions;
  }

  if (clientOptions) {
    params.clientOptions = clientOptions;
  }

  const filteredParams = omit(
    omitBy({ ...params, model }, (value) => !value),
    'id'
  );

  return {
    modelInstance: m.create(filteredParams),
    credentialId: params.id,
  };
}

export const getModel = async (
  input: Required<Pick<ChatCompletionInput, 'model'>>,
  options?: {
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
    req?: Request;
  }
) => {
  let model: string;
  let provider: string;
  const rp = options?.req?.resolvedProvider;
  if (rp) {
    model = rp.modelName;
    provider = rp.providerName;
  } else {
    // Non-V2 fallback: pure string parsing (no DB query)
    const parsed = getModelNameWithProvider(input.model);
    model = parsed.modelName;
    provider = parsed.providerName;
  }

  if (options?.modelOptions) {
    options.modelOptions.model = model;
  }

  const result = await loadModel(model, { provider, ...options });

  if (options?.req?.resolvedProvider) {
    options.req.resolvedProvider.credentialId = result.credentialId || '';
  }

  return result;
};

const loadImageModel = async (
  model: string,
  {
    provider,
    modelOptions,
    clientOptions,
  }: {
    provider?: string;
    modelOptions?: ImageModelOptions;
    clientOptions?: OpenAIImageModelOptions['clientOptions'];
    req?: Request;
  } = {}
) => {
  const providerName = (provider || '').toLowerCase() === 'google' ? 'gemini' : provider?.toLowerCase() || '';
  const m = findImageModel(providerName).match;

  if (!m) {
    throw new CustomError(
      404,
      `Provider ${provider} model ${model} not found, Please check the model name and provider.`
    );
  }

  const params: {
    id?: string;
    apiKey?: string;
    baseURL?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    modelOptions?: ImageModelOptions;
    clientOptions?: OpenAIImageModelOptions['clientOptions'];
  } = await getProviderCredentials(provider!);

  if (modelOptions) {
    params.modelOptions = modelOptions;
  }

  if (clientOptions) {
    params.clientOptions = clientOptions;
  }

  const filteredParams = omit(
    omitBy({ ...params, model }, (value) => !value),
    'id'
  );

  return {
    modelInstance: m.create(filteredParams),
    credentialId: params.id,
  };
};

export const getImageModel = async (
  input: { model: string },
  options?: {
    modelOptions?: ImageModelOptions;
    clientOptions?: OpenAIImageModelOptions['clientOptions'];
    req?: Request;
  }
) => {
  let model: string;
  let provider: string;
  const rp = options?.req?.resolvedProvider;
  if (rp) {
    model = rp.modelName;
    provider = rp.providerName;
  } else {
    const parsed = getModelNameWithProvider(input.model);
    model = parsed.modelName;
    provider = parsed.providerName;
  }

  const result = await loadImageModel(model, { provider, ...options });

  if (options?.req?.resolvedProvider) {
    options.req.resolvedProvider.credentialId = result.credentialId || '';
  }

  return result;
};

const getModelByProviderName = async (provider: string) => {
  const models = availableChatModels();

  const m = models.find((m) => {
    if (typeof m.name === 'string') {
      return m.name.toLowerCase().includes(provider);
    }

    return m.name.some((n) => n.toLowerCase().includes(provider));
  });

  return m;
};

export const checkModelIsValid = async (
  providerName: string,
  params: {
    apiKey?: string;
    baseURL?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
  }
) => {
  const m = await getModelByProviderName(providerName);

  if (m) {
    const model = m.create(params);
    logger.info('check chat model is valid model:', model.name);
    const res = await model.invoke({ messages: [{ role: 'user', content: 'Hello, world!' }] });
    logger.info('check chat model is valid result:', res);

    return;
  }

  const imageModel = findImageModel(providerName).match;
  if (imageModel) {
    const model = imageModel.create(params);
    logger.info('check image model is valid model:', model.name);
    const res = await model.invoke({ prompt: 'draw a picture of a cat' });
    logger.info('check image model is valid result:', res);
    return;
  }

  throw new CustomError(404, `Provider ${providerName} not found, Please check the model name and provider.`);
};
