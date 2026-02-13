import { Config } from '@api/libs/env';
import { handleModelCallError } from '@api/libs/usage';
import AiCredential, { clearCredentialListCache, getCredentialWithCache } from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiModelStatus, { ModelError, ModelErrorType } from '@api/store/models/ai-model-status';
import AiProvider from '@api/store/models/ai-provider';
import { CallType } from '@api/store/models/types';
import { CreditError, CreditErrorType } from '@blocklet/aigne-hub/api';
import { CustomError, formatError } from '@blocklet/error';
import type { Request, Response } from 'express';

import { getImageModel, getModel, getProviderWithCache } from '../providers/models';
import credentialsQueue from '../queue/credentials';
import { getQueue } from '../queue/queue';
import wsServer from '../ws';
import { getModelNameWithProvider, getOpenAIV2, getReqModel } from './ai-provider';
import { AIGNE_HUB_DEFAULT_WEIGHT } from './constants';
import logger from './logger';
import { NotificationManager } from './notifications/manager';
import { CredentialInvalidNotificationTemplate } from './notifications/templates/credential';
import { markProviderAsFailed } from './provider-rotation';

export const typeFilterMap: Record<string, string> = {
  chatCompletion: 'chatCompletion',
  imageGeneration: 'imageGeneration',
  embedding: 'embedding',
  chat: 'chatCompletion',
  image_generation: 'imageGeneration',
  image: 'imageGeneration',
  video: 'video',
};

const typeMap = {
  chatCompletion: 'chat',
  imageGeneration: 'image_generation',
  embedding: 'embedding',
  video: 'video',
};

export const getFormatModelType = (type: AiModelRate['type']) => {
  return typeMap[type as keyof typeof typeMap] || 'chat';
};

interface ProviderWithCredentials extends AiProvider {
  credentials: AiCredential[];
}

/**
 * 403 error classification for distinguishing credential issues from other errors.
 *
 * Known patterns (documented sources):
 * - x.ai/Grok: "Content violates usage guidelines", "SAFETY_CHECK", "Failed check"
 *   (Observed behavior, not explicitly documented at https://docs.x.ai/docs/key-information/debugging)
 *
 * Note: Most providers use different status codes for content violations:
 * - Azure OpenAI: Uses 400 with "ResponsibleAIPolicyViolation" (not 403)
 *   https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
 * - Anthropic: 403 is only for permission errors, not content safety
 *   https://platform.claude.com/docs/en/api/errors
 * - Google Gemini: Uses response fields (blockReason, finishReason) not HTTP errors
 *   https://ai.google.dev/gemini-api/docs/safety-settings
 */

// Content policy violations - user input triggers safety checks
const CONTENT_VIOLATION_KEYWORDS = [
  // x.ai / Grok specific (observed in actual API responses)
  'content violates',
  'usage guidelines',
  'safety_check',
  'failed check',
];

// Region/geographic restrictions - service availability issue
const REGION_RESTRICTION_KEYWORDS = [
  'not available in your region',
  'not supported in your country',
  'geographic restriction',
  'region restriction',
];

// Temporary blocks - recoverable, should retry
const TEMPORARY_BLOCK_KEYWORDS = ['temporarily blocked', 'temporary block', 'try again later'];

type NonCredential403Type = 'content_violation' | 'region_restriction' | 'temporary_block' | null;

/**
 * Classify a 403 error message to determine if it's NOT a credential issue.
 * Returns the specific type if matched, or null if it's a real credential error.
 */
const classifyNonCredential403 = (message: string): NonCredential403Type => {
  const lowerMessage = message.toLowerCase();

  if (CONTENT_VIOLATION_KEYWORDS.some((keyword) => lowerMessage.includes(keyword))) {
    return 'content_violation';
  }

  if (REGION_RESTRICTION_KEYWORDS.some((keyword) => lowerMessage.includes(keyword))) {
    return 'region_restriction';
  }

  if (TEMPORARY_BLOCK_KEYWORDS.some((keyword) => lowerMessage.includes(keyword))) {
    return 'temporary_block';
  }

  return null; // Real credential error
};

function classifyError(error: Error & { status?: number; code?: number; statusCode?: number }): ModelError {
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
      case 403: {
        // Classify 403 errors to distinguish credential issues from other errors
        const nonCredentialType = classifyNonCredential403(errorMessage);
        if (nonCredentialType === 'content_violation') {
          return { code: ModelErrorType.CONTENT_POLICY_VIOLATION, message: errorMessage };
        }
        if (nonCredentialType === 'region_restriction') {
          return { code: ModelErrorType.REGION_RESTRICTION, message: errorMessage };
        }
        if (nonCredentialType === 'temporary_block') {
          return { code: ModelErrorType.TEMPORARY_BLOCK, message: errorMessage };
        }
        // Default: real credential error
        return { code: ModelErrorType.EXPIRED_CREDENTIAL, message: errorMessage };
      }
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

/**
 * Check if a 403 error is NOT a credential issue.
 * These errors should not invalidate the credential.
 */
const is403NonCredentialError = (error: Error & { status?: number }): boolean => {
  if (Number(error.status) !== 403) {
    return false;
  }

  return classifyNonCredential403(error.message || '') !== null;
};

const sendCredentialInvalidNotification = async ({
  model,
  provider,
  credentialId,
  providerId,
  error,
}: {
  model?: string;
  provider?: string;
  credentialId?: string;
  providerId?: string;
  error: Error & { status: number };
}) => {
  // CreditError (402) should never invalidate a credential
  if (error instanceof CreditError) return;

  try {
    const errorMessage = formatError(error);
    const isProvider402 =
      Number(error.status) === 402 && errorMessage && errorMessage.indexOf(CreditErrorType.NOT_ENOUGH) !== -1;

    // 403 errors that are NOT credential issues should not invalidate the credential
    const is403CredentialError = Number(error.status) === 403 && !is403NonCredentialError(error);

    if (credentialId && ([401].includes(Number(error.status)) || is403CredentialError || isProvider402)) {
      logger.info('update credential status and send credential invalid notification', {
        credentialId,
        provider,
        model,
        error,
      });

      // Try cache first, fall back to direct DB query for notification display data
      const credential = providerId
        ? (await getCredentialWithCache(providerId, credentialId)) ||
          (await AiCredential.findOne({ where: { id: credentialId } }))
        : await AiCredential.findOne({ where: { id: credentialId } });

      const template = new CredentialInvalidNotificationTemplate({
        credential: {
          provider,
          model,
          credentialName: credential?.name,
          credentialValue: credential?.getDisplayText(),
          errorMessage: error.message,
        },
      });

      NotificationManager.sendCustomNotificationByRoles(['owner', 'admin'], await template.getTemplate()).catch(
        (error) => {
          logger.error('Failed to send credential invalid notification', error);
        }
      );

      await AiCredential.update({ active: false, error: error.message }, { where: { id: credentialId } });

      // Sync clear credential cache for this provider so next request re-fetches from DB
      if (providerId) {
        clearCredentialListCache(providerId);
      }

      const resolvedProviderId = providerId || credential?.providerId;
      if (resolvedProviderId) {
        credentialsQueue.push({ job: { credentialId, providerId: resolvedProviderId }, delay: 5 });
      }
    }

    if (credentialId && [429].includes(Number(error.status))) {
      await AiCredential.update({ weight: 10 }, { where: { id: credentialId } });
      logger.info('Credential weight reduced due to 429, will auto-recover in 3 minutes', {
        credentialId,
      });

      // Sync clear credential cache for this provider
      if (providerId) {
        clearCredentialListCache(providerId);
      }

      const resolvedProviderId =
        providerId || (await AiCredential.findOne({ where: { id: credentialId } }))?.providerId;
      if (resolvedProviderId) {
        credentialsQueue.push({
          job: { credentialId, providerId: resolvedProviderId, isWeightRecovery: true },
          delay: 3 * 60,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to send credential invalid notification', error);
  }
};

export async function updateModelStatus({
  model,
  success: available,
  duration,
  error,
  type,
  providerId: knownProviderId,
}: {
  model: string;
  success: boolean;
  duration: number;
  error?: Error;
  type?: Omit<CallType, 'custom' | 'audioGeneration'>;
  providerId?: string;
}) {
  let modelName: string;
  let providerName: string;
  let resolvedProviderId = knownProviderId;

  if (resolvedProviderId) {
    // Skip DB query when providerId is already known
    const parsed = getModelNameWithProvider(model);
    modelName = parsed.modelName;
    providerName = parsed.providerName;
  } else {
    const parsed = getModelNameWithProvider(model);
    modelName = parsed.modelName;
    providerName = parsed.providerName;
    const cachedProvider = await getProviderWithCache(providerName);
    resolvedProviderId = cachedProvider?.id;
  }

  if (resolvedProviderId) {
    const current = await AiModelStatus.findOne({ where: { model: modelName, providerId: resolvedProviderId, type } });

    if (current?.available !== available) {
      await AiModelStatus.upsertModelStatus({
        providerId: resolvedProviderId,
        model: modelName,
        available,
        responseTime: duration,
        error: error ? classifyError(error) : null,
        ...(type ? { type } : {}),
      });
    }
  }

  wsServer.broadcast('model.status.updated', {
    provider: providerName,
    model: modelName,
    available,
    error: error ? classifyError(error) : null,
    ...(type ? { type } : {}),
  });
}

export function withModelStatus({
  type,
  handler,
}: {
  type?: Omit<CallType, 'custom' | 'audioGeneration'>;
  handler: (req: Request, res: Response) => Promise<void>;
}) {
  return async (req: Request, res: Response) => {
    const start = Date.now();

    try {
      await handler(req, res);

      req.timings?.start('postProcess');
      // Fire-and-forget: model status update on success
      updateModelStatus({
        model: getReqModel(req),
        success: true,
        duration: Date.now() - start,
        type,
        providerId: req.resolvedProvider?.providerId,
      }).catch((err) => {
        logger.error('Failed to update model status (success)', err);
      });

      // Fire-and-forget: credential recovery + usage tracking (fully non-blocking)
      const credentialId = req.resolvedProvider?.credentialId;
      if (credentialId) {
        const providerId = req.resolvedProvider?.providerId || '';
        (async () => {
          const cred = providerId ? await getCredentialWithCache(providerId, credentialId) : undefined;
          const needsRecovery = !cred || !cred.active || (cred.weight || 0) < AIGNE_HUB_DEFAULT_WEIGHT;
          await AiCredential.updateCredentialAfterUse(credentialId, providerId, { recover: needsRecovery });
        })().catch((err) => {
          logger.error('Failed to update credential', { error: err, credentialId });
        });
      }
      req.timings?.end('postProcess');
    } catch (error) {
      logger.error('Failed to call with model status', error.message);

      const model = req.resolvedProvider?.modelName;
      const provider = req.resolvedProvider?.providerName;
      const credentialId = req.resolvedProvider?.credentialId;

      // Fire-and-forget: track usage even on failure (skip if provider was never called)
      if (credentialId && !(error instanceof CreditError)) {
        const providerId = req.resolvedProvider?.providerId || '';
        AiCredential.updateCredentialAfterUse(credentialId, providerId).catch((err) => {
          logger.error('Failed to update credential usage on failure', { error: err, credentialId });
        });
      }

      await sendCredentialInvalidNotification({
        model,
        provider,
        credentialId,
        providerId: req.resolvedProvider?.providerId,
        error,
      });

      if (error.status && [401, 403, 404, 500, 501, 503].includes(Number(error.status))) {
        // Fire-and-forget: model status update on failure
        updateModelStatus({
          model: getReqModel(req),
          success: false,
          duration: Date.now() - start,
          error,
          type,
          providerId: req.resolvedProvider?.providerId,
        }).catch((err) => {
          logger.error('Failed to update model status', err);
        });
      }

      if (error.status && [429].includes(Number(error.status))) {
        const provId = req.resolvedProvider?.providerId;
        const provName = req.resolvedProvider?.providerName || '';
        if (provId) {
          markProviderAsFailed(provId, provName);
        } else {
          const cachedProvider = await getProviderWithCache(provider || '').catch(() => undefined);
          if (cachedProvider) {
            markProviderAsFailed(cachedProvider.id, cachedProvider.name);
          }
        }
      }

      handleModelCallError(req, error);

      if (error.status && !(error instanceof CustomError)) {
        if (String(error.status).startsWith('50')) {
          throw new CustomError(
            Number(error.status),
            `${provider} service is temporarily unavailable. Please try again later`
          );
        }

        throw new CustomError(Number(error.status || '500'), error.message || 'Unknown error');
      }

      throw error;
    }
  };
}

export async function callWithModelStatus(
  { provider, model, credentialId, type }: { provider: string; model: string; credentialId?: string; type?: string },
  handler: ({ provider, model }: { provider: string; model: string }) => Promise<void>
) {
  const start = Date.now();

  try {
    await handler({ provider, model });

    await updateModelStatus({
      model: `${provider}/${model}`,
      success: true,
      duration: Date.now() - start,
      type,
    });
  } catch (error) {
    logger.error('Failed to call with model status', error.message);

    await sendCredentialInvalidNotification({ model, provider, credentialId, error });

    await updateModelStatus({
      model: `${provider}/${model}`,
      success: false,
      duration: Date.now() - start,
      error,
      type,
    }).catch((error) => {
      logger.error('Failed to update model status', error);
    });

    throw error;
  }
}

const checkChatModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  const { modelInstance, credentialId } = await getModel({ model: `${provider}/${model}` });
  await callWithModelStatus({ provider, model, credentialId, type: 'chatCompletion' }, async () => {
    await modelInstance.invoke({ messages: [{ role: 'user', content: 'hi' }] });
  });
};

const checkImageModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  const { modelInstance, credentialId } = await getImageModel({ model: `${provider}/${model}` });
  await callWithModelStatus({ provider, model, credentialId, type: 'imageGeneration' }, async () => {
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

// TODO
const checkVideoModelStatus = async () => {};

const checkEmbeddingModelStatus = async ({ provider, model }: { provider: string; model: string }) => {
  await callWithModelStatus({ provider, model, type: 'embedding' }, async ({ provider, model }) => {
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
  type: 'chat' | 'image_generation' | 'embedding' | 'video';
}) => {
  const provider = (await AiProvider.findOne({
    where: { id: providerId },
    include: [{ model: AiCredential, as: 'credentials', required: false }],
  })) as ProviderWithCredentials;

  if (!provider) {
    throw new CustomError(500, `AI provider with ID ${providerId} not found`);
  }

  if (!provider.credentials || provider.credentials.length === 0) {
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
    } else if (type === 'video') {
      await checkVideoModelStatus();
    } else {
      logger.error('Invalid model type', type);
      throw new CustomError(500, 'Invalid model type');
    }
  } catch (error) {
    logger.error('check model status error', { provider: provider.name, model, type, error });
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
    type: 'chat' | 'image_generation' | 'embedding' | 'video';
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
      type: getFormatModelType(rate.type),
      providerId: rate.providerId,
    });
  });
};
