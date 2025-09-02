import { availableModels as availableChatModels, availableImageModels } from '@aigne/aigne-hub';
import { AIGNE, ChatModelOptions, ChatModelOutput, ImageModelOptions } from '@aigne/core';
import type { OpenAIChatModelOptions, OpenAIImageModelOptions } from '@aigne/openai';
import logger from '@api/libs/logger';
import AiCredential from '@api/store/models/ai-credential';
import AiProvider from '@api/store/models/ai-provider';
import { ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
import { omit, omitBy, pick } from 'lodash';

import { AIProviderType as AIProvider } from '../libs/constants';
import { BASE_URL_CONFIG_MAP, aigneHubConfigProviderUrl, getAIApiKey, getBedrockConfig } from './keys';
import { adaptStreamToOldFormat, convertToFrameworkMessages, getModelAndProviderId } from './util';

export async function getProviderCredentials(
  provider: string,
  options?: {
    modelCallContext?: any; // ModelCallContext from middleware
    model?: string; // Actual model name to record
  }
): Promise<{
  id?: string;
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

  const providerRecord = await AiProvider.findOne({ where: { name: provider, enabled: true } });
  if (!providerRecord) {
    return callback(new CustomError(404, `Provider ${provider} not found, ${errorMessage}`));
  }

  const credentials = await AiCredential.findAll({
    where: { providerId: providerRecord.id, active: true },
  });

  if (credentials.length === 0) {
    return callback(new CustomError(404, `No credentials found for provider ${provider}, ${errorMessage}`));
  }

  const credential = await AiCredential.getNextAvailableCredential(providerRecord!.id);

  if (!credential) {
    return callback(new CustomError(404, `No active credentials found for provider ${provider}, ${errorMessage}`));
  }

  await credential.updateUsage();
  const value = AiCredential.decryptCredentialValue(credential!.credentialValue);

  // Update ModelCall context if provided
  if (options?.modelCallContext) {
    try {
      await options.modelCallContext.updateCredentials(providerRecord.id, credential.id, options.model);
    } catch (error) {
      // Log but don't fail the credential retrieval
      logger.error('Failed to update ModelCall context in getProviderCredentials', { error });
    }
  }

  return {
    id: credential.id,
    apiKey: value.api_key,
    baseURL: providerRecord?.baseUrl,
    accessKeyId: value.access_key_id,
    secretAccessKey: value.secret_access_key,
    region: providerRecord?.region,
  };
}

export async function chatCompletionByFrameworkModel(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  userDid?: string,
  options?: {
    onEnd?: (data?: { output?: ChatModelOutput }) => Promise<{ output?: ChatModelOutput } | undefined>;
    req?: any;
  }
): Promise<AsyncGenerator<ChatCompletionResponse>> {
  const { modelInstance } = await getModel(input, { req: options?.req });
  const engine = new AIGNE();

  const response = await engine.invoke(
    modelInstance,
    {
      messages: convertToFrameworkMessages(input.messages),
      responseFormat: input.responseFormat?.type === 'json_schema' ? input.responseFormat : { type: 'text' },
      toolChoice: input.toolChoice,
      tools: input.tools,
      modelOptions: pick(input, ['temperature', 'topP', 'presencePenalty', 'frequencyPenalty', 'maxTokens']),
    },
    { streaming: true, userContext: { userId: userDid }, hooks: { onEnd: options?.onEnd } }
  );

  return adaptStreamToOldFormat(response);
}

async function loadModel(
  model: string,
  {
    provider,
    modelOptions,
    clientOptions,
    req,
  }: {
    provider?: string;
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
    req?: any; // Express Request with modelCallContext
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
  } = await getProviderCredentials(providerName, {
    modelCallContext: req?.modelCallContext,
    model,
  });

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
    req?: any;
  }
) => {
  const { modelName: model, providerName: provider } = await getModelAndProviderId(input.model);
  const result = await loadModel(model, { provider, ...options });
  return result;
};

const loadImageModel = async (
  model: string,
  {
    provider,
    modelOptions,
    clientOptions,
    req,
  }: {
    provider?: string;
    modelOptions?: ImageModelOptions;
    clientOptions?: OpenAIImageModelOptions['clientOptions'];
    req?: any; // Express Request with modelCallContext
  } = {}
) => {
  const providerName = (provider || '').toLowerCase() === 'google' ? 'gemini' : provider?.toLowerCase() || '';
  const m = await getImageModelByProviderName(providerName);

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
  } = await getProviderCredentials(provider!, {
    modelCallContext: req?.modelCallContext,
    model,
  });

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
    req?: any;
  }
) => {
  const { modelName: model, providerName: provider } = await getModelAndProviderId(input.model);
  const result = await loadImageModel(model, { provider, ...options });
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

const getImageModelByProviderName = async (provider: string) => {
  const models = availableImageModels();
  const m = models.find((m) => m.name.toLowerCase().includes(provider.toLowerCase()));
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
    const model = await m.create(params);
    logger.info('check chat model is valid model:', model.name);
    const res = await model.invoke({ messages: [{ role: 'user', content: 'Hello, world!' }] });
    logger.info('check chat model is valid result:', res);

    return;
  }

  const imageModel = await getImageModelByProviderName(providerName);
  if (imageModel) {
    const model = await imageModel.create(params);
    logger.info('check image model is valid model:', model.name);
    const res = await model.invoke({ prompt: 'draw a picture of a cat' });
    logger.info('check image model is valid result:', res);
    return;
  }

  throw new CustomError(404, `Provider ${providerName} not found, Please check the model name and provider.`);
};
