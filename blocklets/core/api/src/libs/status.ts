import { Config } from '@api/libs/env';
import { handleModelCallError } from '@api/libs/usage';
import AiCredential from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiModelStatus, { ModelError, ModelErrorType } from '@api/store/models/ai-model-status';
import AiProvider from '@api/store/models/ai-provider';
import { CustomError } from '@blocklet/error';
import type { Request, Response } from 'express';

import { getImageModel, getModel } from '../providers/models';
import { getModelAndProviderId } from '../providers/util';
import wsServer from '../ws';
import { getOpenAIV2 } from './ai-provider';
import logger from './logger';
import { NotificationManager } from './notifications/manager';
import { CredentialInvalidNotificationTemplate } from './notifications/templates/credential';
import { getQueue } from './queue';

export const typeFilterMap: Record<string, string> = {
  chatCompletion: 'chatCompletion',
  imageGeneration: 'imageGeneration',
  embedding: 'embedding',
  chat: 'chatCompletion',
  image_generation: 'imageGeneration',
  image: 'imageGeneration',
};

export const typeMap = {
  chatCompletion: 'chat',
  imageGeneration: 'image_generation',
  embedding: 'embedding',
};

function classifyError(error: any): ModelError {
  const errorMessage = error.message || error.toString();
  const errorCode = error.status || error.code || error.statusCode;

  if (errorCode) {
    switch (errorCode) {
      case 400:
        return {
          code: ModelErrorType.INVALID_ARGUMENT,
          message: errorMessage,
        };
      case 401:
        return {
          code: ModelErrorType.INVALID_API_KEY,
          message: errorMessage,
        };
      case 402:
        return {
          code: ModelErrorType.NO_CREDITS_AVAILABLE,
          message: errorMessage,
        };
      case 403:
        return {
          code: ModelErrorType.EXPIRED_CREDENTIAL,
          message: errorMessage,
        };
      case 404:
        return {
          code: ModelErrorType.MODEL_NOT_FOUND,
          message: errorMessage,
        };
      case 429:
        return {
          code: ModelErrorType.RATE_LIMIT_EXCEEDED,
          message: errorMessage,
        };
      case 500:
      case 502:
      case 503:
        return {
          code: ModelErrorType.MODEL_UNAVAILABLE,
          message: errorMessage,
        };
      default:
        return {
          code: ModelErrorType.UNKNOWN_ERROR,
          message: errorMessage,
        };
    }
  }

  // 错误消息关键词分类
  const message = errorMessage.toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      code: ModelErrorType.NETWORK_TIMEOUT,
      message: errorMessage,
    };
  }

  if (message.includes('quota') || message.includes('billing') || message.includes('credit')) {
    return {
      code: ModelErrorType.QUOTA_EXCEEDED,
      message: errorMessage,
    };
  }

  if (message.includes('network') || message.includes('connection') || message.includes('dns')) {
    return {
      code: ModelErrorType.CONNECTION_ERROR,
      message: errorMessage,
    };
  }

  if (message.includes('no active credentials') || message.includes('no credentials')) {
    return {
      code: ModelErrorType.NO_CREDENTIALS,
      message: errorMessage,
    };
  }

  if (message.includes('model not found') || message.includes('model does not exist')) {
    return {
      code: ModelErrorType.MODEL_NOT_FOUND,
      message: errorMessage,
    };
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return {
      code: ModelErrorType.RATE_LIMIT_EXCEEDED,
      message: errorMessage,
    };
  }

  return {
    code: ModelErrorType.UNKNOWN_ERROR,
    message: errorMessage,
  };
}

const modelStatusCache = new Map<string, boolean>();

export async function updateModelStatus({
  model,
  success: available,
  duration,
  error,
}: {
  model: string;
  success: boolean;
  duration: number;
  error?: Error;
}) {
  const current = modelStatusCache.get(model);
  const { modelName, providerName } = await getModelAndProviderId(model);

  if (current !== available) {
    const provider = await AiProvider.findOne({ where: { name: providerName } });

    if (provider) {
      await AiModelStatus.upsertModelStatus({
        providerId: provider.id,
        model: modelName,
        available,
        responseTime: duration,
        error: error ? classifyError(error) : null,
      });
    }

    modelStatusCache.set(model, available);
  }

  wsServer.broadcast('model.status.updated', {
    provider: providerName,
    model: modelName,
    available,
    error: error ? classifyError(error) : null,
  });
}

export function withModelStatus(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const start = Date.now();

    if (!req.body.model && req.body.input?.modelOptions?.model) {
      req.body.model = req.body.input.modelOptions.model;
    }

    try {
      await handler(req, res);

      await updateModelStatus({
        model: req.body.model,
        success: true,
        duration: Date.now() - start,
      });
    } catch (error) {
      await updateModelStatus({
        model: req.body.model,
        success: false,
        duration: Date.now() - start,
        error,
      }).catch((error) => {
        console.error('Failed to update model status', error);
      });

      handleModelCallError(req, error);
      throw error;
    }
  };
}

export async function callWithModelStatus(
  { provider, model, credentialId }: { provider: string; model: string; credentialId?: string },
  handler: ({ provider, model }: { provider: string; model: string }) => Promise<void>
) {
  const start = Date.now();

  try {
    await handler({ provider, model });

    await updateModelStatus({
      model: `${provider}/${model}`,
      success: true,
      duration: Date.now() - start,
    });
  } catch (error) {
    console.error('Failed to call with model status', error.message);

    if (credentialId && [401, 402, 403].includes(Number(error.status))) {
      const credential = await AiCredential.findOne({ where: { id: credentialId } });
      const template = new CredentialInvalidNotificationTemplate({
        credential: {
          provider,
          model,
          credentialName: credential?.name,
          credentialValue: credential?.getDisplayText(),
          errorMessage: error.message,
        },
      });

      NotificationManager.sendCustomNotificationByRoles(['owner', 'admin'], await template.getTemplate());

      await AiCredential.update({ active: false, error: error.message }, { where: { id: credentialId } });
    }

    await updateModelStatus({
      model: `${provider}/${model}`,
      success: false,
      duration: Date.now() - start,
      error,
    }).catch((error) => {
      console.error('Failed to update model status', error);
    });

    throw error;
  }
}

const checkChatModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  const { modelInstance, credentialId } = await getModel({ model: `${provider}/${model}` });
  await callWithModelStatus({ provider, model, credentialId }, async () => {
    await modelInstance.invoke({ messages: [{ role: 'user', content: 'hi' }] });
  });
};

const checkImageModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  const { modelInstance, credentialId } = await getImageModel({ model: `${provider}/${model}` });
  await callWithModelStatus({ provider, model, credentialId }, async () => {
    try {
      await modelInstance.invoke({ prompt: 'A simple image of a cat', model });
    } catch (error) {
      const message = classifyError(error);
      if (message.code === ModelErrorType.INVALID_ARGUMENT) {
        await modelInstance.invoke({ prompt: 'A beautiful sunset over a calm ocean', model });
        return;
      }

      throw error;
    }
  });
};

const checkEmbeddingModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  await callWithModelStatus({ provider, model }, async ({ provider, model }) => {
    const openai = await getOpenAIV2({ body: { model: `${provider}/${model}` } });
    await openai.embeddings.create({ input: ['test'], model });
  });
};

export const checkModelStatus = async ({
  providerId,
  model,
  type,
}: {
  providerId: string;
  model: string;
  type: 'chat' | 'image_generation' | 'embedding';
}) => {
  const provider = await AiProvider.findOne({
    where: { id: providerId },
    include: [{ model: AiCredential, as: 'credentials', required: false }],
  });

  if (!provider) {
    throw new CustomError(500, 'AI provider not found');
  }

  if (!(provider as any).credentials || (provider as any).credentials.length === 0) {
    await updateModelStatus({
      model: `${provider.name}/${model}`,
      success: false,
      duration: 0,
      error: new CustomError(500, 'No active credentials found'),
    });
    return;
  }

  try {
    if (type === 'chat') {
      await checkChatModelStatus({ provider: provider.name, model });
    } else if (type === 'image_generation') {
      await checkImageModelStatus({ provider: provider.name, model });
    } else if (type === 'embedding') {
      await checkEmbeddingModelStatus({ provider: provider.name, model });
    } else {
      console.error('Invalid model type', type);
      throw new CustomError(500, 'Invalid model type');
    }
  } catch (error) {
    logger.error('check model status error', { provider: provider.name, model, type, error });

    await updateModelStatus({ model: `${provider.name}/${model}`, success: false, duration: 0, error });
    throw error;
  }
};

export const modelStatusQueue = getQueue({
  name: 'model-status',
  options: {
    concurrency: 2,
    maxRetries: 0,
  },
  onJob: async ({
    providerId,
    model,
    type,
  }: {
    providerId: string;
    model: string;
    type: 'chat' | 'image_generation' | 'embedding';
  }) => {
    logger.info('check model status', providerId, model, type);
    await checkModelStatus({ providerId, model, type });
  },
});

export const checkAllModelStatus = async () => {
  const providers = await AiProvider.getEnabledProviders();
  if (providers.length === 0) {
    return;
  }

  if (!Config.creditBasedBillingEnabled) {
    return;
  }

  const modelRates = await AiModelRate.findAll({ where: {} });

  modelRates.forEach((rate) => {
    modelStatusQueue.push({
      model: rate.model,
      type: typeMap[rate.type as keyof typeof typeMap] || 'chat',
      providerId: rate.providerId,
    });
  });
};
