import { availableModels as availableChatModels, findImageModel } from '@aigne/aigne-hub';
import type { ChatModelOptions, ImageModelOptions } from '@aigne/model-base';
import { onModelResponseStreamEnd } from '@aigne/model-base';
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

  const cached = await getProviderWithCache(provider);
  if (!cached) {
    return callback(new CustomError(404, `Provider ${provider} not found, ${errorMessage}`));
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
  _userDid?: string,
  options?: InvokeOptions & { req: Request }
): Promise<AsyncGenerator<ChatCompletionResponse>> {
  const { modelInstance } = await getModel(input, { req: options?.req });

  const convertedMessages = await convertToFrameworkMessages(input.messages);

  let stream = await modelInstance.invoke(
    {
      messages: convertedMessages,
      responseFormat: input.responseFormat?.type === 'json_schema' ? input.responseFormat : { type: 'text' },
      toolChoice: input.toolChoice,
      tools: input.tools,
      modelOptions: pick(input, ['temperature', 'topP', 'presencePenalty', 'frequencyPenalty', 'maxTokens']),
    },
    { streaming: true }
  );

  if (options?.onEnd || options?.onError) {
    stream = onModelResponseStreamEnd(stream, {
      onResult: async (result) => {
        if (options?.onEnd) {
          const r = await options.onEnd({ output: result as any });
          if (r?.output) return r.output as any;
        }
      },
      onError: async (error) => {
        if (options?.onError) options.onError({ context: {}, error });
        return error;
      },
    });
  }

  return adaptStreamToOldFormat(stream);
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
  // Normalize provider name to lowercase for matching
  const normalizedProvider = provider.toLowerCase().replace(/-/g, '');
  const models = availableChatModels();

  const m = models.find((m) => {
    if (typeof m.name === 'string') {
      return m.name.toLowerCase().includes(normalizedProvider);
    }

    return m.name.some((n) => n.toLowerCase().includes(normalizedProvider));
  });

  return m;
};

// Maintain test models for credential validation, independent of @aigne package defaults
// Use the latest and cheapest model for each provider to minimize test cost
const CREDENTIAL_TEST_MODELS: Record<string, string> = {
  openai: 'gpt-4.1-nano',
  anthropic: 'claude-haiku-4-5',
  bedrock: 'us.amazon.nova-lite-v1:0',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.5-flash',
  google: 'gemini-2.5-flash',
  ollama: 'llama3.2',
  openrouter: 'openai/gpt-4o-mini',
  xai: 'grok-3-mini-fast',
  doubao: 'doubao-seed-1-8-251228',
  poe: 'gpt-5-mini',
};

export const getDefaultTestModel = (providerName: string): string | undefined => {
  return CREDENTIAL_TEST_MODELS[providerName];
};

export const getDefaultTestModels = (): Record<string, string> => {
  return { ...CREDENTIAL_TEST_MODELS };
};

export const checkModelIsValid = async (
  providerName: string,
  params: {
    apiKey?: string;
    baseURL?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
  },
  customTestModel?: string
) => {
  logger.debug('=== checkModelIsValid START ===');
  logger.debug('Provider name:', providerName);
  logger.debug('Has API key:', !!params.apiKey);
  logger.debug('Has base URL:', !!params.baseURL);
  logger.debug('Custom test model:', customTestModel || '(using default)');
  logger.debug('Has access key pair:', !!(params.accessKeyId && params.secretAccessKey));
  logger.debug('Region:', params.region || '(not set)');

  const m = await getModelByProviderName(providerName);

  if (m) {
    const testModel = customTestModel || CREDENTIAL_TEST_MODELS[providerName];
    logger.debug('Matched model factory:', typeof m.name === 'string' ? m.name : m.name.join(', '));
    logger.debug('Test model to use:', testModel);

    const createParams = testModel ? { ...params, model: testModel } : params;
    logger.debug('Creating model with params:', {
      hasApiKey: !!createParams.apiKey,
      hasBaseURL: !!createParams.baseURL,
      model: (createParams as any).model || '(not set)',
    });

    const model = m.create(createParams);
    logger.debug('Created model instance:', model.name);

    // Verify model credential is accessible
    try {
      // eslint-disable-next-line prefer-destructuring
      const credential = (model as any).credential;
      if (credential) {
        logger.debug('Model credential config:', {
          hasUrl: !!credential.url,
          hasApiKey: !!credential.apiKey,
          model: credential.model || '(not set)',
        });
      }
    } catch (e) {
      logger.debug('Could not access model credential:', e);
    }

    logger.debug('Invoking model with test message...');
    await model.invoke({ messages: [{ role: 'user', content: 'Hello, world!' }] });
    logger.info('check chat model is valid model:', model.name);
    logger.debug('=== checkModelIsValid END ===');

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
