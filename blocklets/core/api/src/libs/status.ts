import { handleModelCallError } from '@api/libs/usage';
import AiCredential from '@api/store/models/ai-credential';
import AiModelStatus, { ModelError, ModelErrorType } from '@api/store/models/ai-model-status';
import AiProvider from '@api/store/models/ai-provider';
import { CustomError } from '@blocklet/error';
import type { Request, Response } from 'express';

import { getImageModel, getModel } from '../providers/models';
import { getModelAndProviderId } from '../providers/util';
import wsServer from '../ws';
import { getOpenAIV2 } from './ai-provider';

function classifyError(error: any): ModelError {
  const errorMessage = error.message || error.toString();
  const errorCode = error.code || error.status || error.statusCode;

  if (errorCode) {
    switch (errorCode) {
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
        error: error ? classifyError(error) : undefined,
      });
    }

    modelStatusCache.set(model, available);
  }

  wsServer.broadcast('model.status.updated', { provider: providerName, model: modelName, available });
}

export function withModelStatus(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const start = Date.now();

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
  { provider, model }: { provider: string; model: string },
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
    // if (credentialId && [401, 402].includes(Number(error.code))) {
    //   await AiCredential.update({ active: false }, { where: { id: credentialId } });
    // }

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
  const { modelInstance } = await getModel({ model: `${provider}/${model}` });
  await callWithModelStatus({ provider, model }, async () => {
    await modelInstance.invoke({ messages: [{ role: 'user', content: 'hi' }] });
  });
};

const checkImageModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  const { modelInstance } = await getImageModel({ model: `${provider}/${model}` });
  await callWithModelStatus({ provider, model }, async () => {
    await modelInstance.invoke({ prompt: 'input number 1', n: 1, model });
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
    include: [
      {
        model: AiCredential,
        as: 'credentials',
        where: { active: true },
        required: false,
      },
    ],
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
};
