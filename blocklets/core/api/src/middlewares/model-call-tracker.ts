import { getReqModel } from '@api/libs/ai-provider';
import { BLOCKLET_APP_PID, CREDIT_DECIMAL_PLACES } from '@api/libs/env';
import logger from '@api/libs/logger';
import { ensureModelWithProvider, getProvidersForModel, modelHasProvider } from '@api/libs/provider-rotation';
import { getCurrentUnixTimestamp } from '@api/libs/timestamp';
import { getModelAndProviderId } from '@api/providers/util';
import { pushProjectFetchJob } from '@api/queue/projects';
import ModelCall from '@api/store/models/model-call';
import { CallType } from '@api/store/models/types';
import BigNumber from 'bignumber.js';
import { NextFunction, Request, Response } from 'express';
import pAll from 'p-all';
import { Op } from 'sequelize';

export interface ModelCallContext {
  id: string;
  startTime: number;
  complete: (result: ModelCallResult) => Promise<void>;
  fail: (error: string, partialUsage?: Partial<UsageData>) => Promise<void>;
  updateCredentials: (providerId: string, credentialId: string, actualModel?: string) => Promise<void>;
  update: (updateData: Partial<ModelCall>) => Promise<void>;
}

export interface UsageData {
  promptTokens: number;
  completionTokens: number;
  numberOfImageGeneration: number;
  credits: number;
  usageMetrics: Record<string, any>;
  metadata?: Record<string, any>;
  mediaDuration?: number;
}

export interface ModelCallResult {
  promptTokens?: number;
  completionTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  numberOfImageGeneration?: number;
  credits?: number;
  usageMetrics?: Record<string, any>;
  metadata?: Record<string, any>;
  traceId?: string;
  mediaDuration?: number;
}

declare global {
  namespace Express {
    interface Request {
      modelCallContext?: ModelCallContext;
      credentialId?: string;
      provider?: string;
      model?: string;
      maxProviderRetries?: number;
      originalModel?: string;
      availableModelsWithProvider?: string[];
    }
  }
}

export function getMaxProviderRetriesMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    req.timings?.start('maxProviderRetries');
    try {
      const model = getReqModel(req);

      if (!model) {
        req.timings?.end('maxProviderRetries');
        next();
        return;
      }

      const hasProvider = modelHasProvider(model);
      if (hasProvider) {
        req.timings?.end('maxProviderRetries');
        next();
        return;
      }

      const modelNameParts = model.includes('/') ? model.split('/').slice(1) : [model];
      const modelNameWithoutProvider = modelNameParts.join('/');
      const originalModel = modelNameWithoutProvider || model;
      req.originalModel = model;

      const providersInfo = await getProvidersForModel(originalModel);
      req.availableModelsWithProvider = (providersInfo?.availableProvidersList || [])
        .filter((p) => p.providerName && p.modelName)
        .map((p) => `${p.providerName}/${p.modelName}`);
      req.maxProviderRetries = providersInfo?.availableProviders || 1;

      logger.info('Provider rotation info for retry', {
        model: originalModel,
        availableProviders: providersInfo?.availableProviders,
        availableProvidersList: req.availableModelsWithProvider,
      });
    } catch (error) {
      logger.warn('Failed to get providers info for retry', { error, model: req.originalModel });
    }

    req.timings?.end('maxProviderRetries');
    next();
  };
}

export function createModelCallMiddleware(callType: CallType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userDid = req.user?.did;

    req.timings?.start('ensureProvider');
    await ensureModelWithProvider(req);
    req.timings?.end('ensureProvider');

    const model = getReqModel(req);

    if (!userDid || !model) {
      logger.error('Model call middleware error', { error: 'User did or model is required', userDid, model });
      next();
      return;
    }

    let usageMetrics: Record<string, any> = {};
    if (callType === 'imageGeneration') {
      usageMetrics = {
        imageSize: req.body?.size,
        imageQuality: req.body?.quality,
        imageStyle: req.body?.style,
      };
    }

    const rawAppDid = req.headers['x-aigne-hub-client-did'];
    let headerAppDid = '';
    if (typeof rawAppDid === 'string') {
      const trimmed = rawAppDid.trim();
      try {
        headerAppDid = decodeURIComponent(trimmed);
      } catch {
        // Fallback to raw header value if decoding fails.
        headerAppDid = trimmed;
      }
    }
    const accessKeyName =
      // @ts-ignore
      req.user?.method === 'accessKey' && typeof req.user.fullName === 'string' ? req.user.fullName.trim() : '';
    // @ts-ignore
    const appDid = headerAppDid || req.user?.accessKeyId || BLOCKLET_APP_PID || '';
    const appName = !headerAppDid && accessKeyName ? accessKeyName : undefined;
    req.appClient = {
      appId: appDid,
      userDid,
    };

    try {
      req.timings?.start('modelCallCreate');
      const context = await createModelCallContext({
        type: callType,
        model,
        userDid,
        appDid: appDid || undefined,
        requestId: req.headers['x-request-id'] as string,
        appName,
        usageMetrics,
        metadata: {
          endpoint: req.path,
          modelParams: req.body?.options?.modelOptions,
        },
      });
      req.timings?.end('modelCallCreate');

      if (context) {
        req.modelCallContext = context;

        const originalEnd = res.end.bind(res);
        let completed = false;

        res.end = (...args: any[]) => {
          if (!completed && req.modelCallContext) {
            req.modelCallContext.fail('Response ended without completion').catch((err) => {
              logger.error('Failed to mark incomplete model call as failed', { error: err });
            });
          }
          return originalEnd(...args);
        };

        const originalComplete = context.complete;
        const originalFail = context.fail;

        context.complete = async (result: ModelCallResult) => {
          if (completed) return;
          completed = true;
          await originalComplete(result);
        };

        context.fail = async (error: string, partialUsage?: Partial<UsageData>) => {
          if (completed) return;
          completed = true;
          await originalFail(error, partialUsage);
        };
      }
    } catch (error) {
      logger.error('Model call middleware error', { error, originalModel: model, userDid });
    }

    next();
  };
}

async function createModelCallContext({
  type,
  model,
  userDid,
  appDid,
  requestId,
  appName,
  metadata = {},
  usageMetrics = {},
}: {
  type: CallType;
  model: string;
  userDid: string;
  appDid?: string;
  requestId?: string;
  appName?: string;
  metadata?: Record<string, any>;
  usageMetrics?: Record<string, any>;
}): Promise<ModelCallContext | null> {
  const formatDurationSeconds = (ms: number) => Math.round((ms / 1000) * 10) / 10;
  let p = '';
  let m = '';
  const startTime = getCurrentUnixTimestamp();
  const startTimeMs = Date.now();
  try {
    const { providerId, modelName } = await getModelAndProviderId(model);
    p = providerId;
    m = modelName;

    const params = {
      providerId: providerId || '',
      model: modelName || model,
      credentialId: '',
      type,
      totalUsage: 0,
      credits: 0,
      status: 'processing',
      appDid,
      userDid,
      requestId,
      usageMetrics,
      metadata: {
        ...metadata,
        startTime,
        phase: 'started',
        originalModel: model,
      },
      callTime: startTime,
    } as const;

    const modelCall = await ModelCall.create(params).catch((error) => {
      logger.error('Failed to create model call record', { error, params });
      throw error;
    });

    // Push project info fetch job to queue (non-blocking, with deduplication)
    if (appDid) {
      pushProjectFetchJob(appDid, { appName });
    }

    logger.info('Created processing model call record', {
      id: modelCall.id,
      model,
      type,
      userDid,
    });

    return {
      id: modelCall.id,
      startTime,
      updateCredentials: async (providerId: string, credentialId: string, actualModel?: string) => {
        await ModelCall.update(
          {
            providerId,
            credentialId,
            model: actualModel || model,
            metadata: {
              ...metadata,
              phase: 'credentials_resolved',
              resolvedAt: getCurrentUnixTimestamp(),
            },
          },
          { where: { id: modelCall.id } }
        );

        logger.info('Updated model call with actual credentials', {
          id: modelCall.id,
          providerId,
          credentialId,
        });
      },
      complete: async (result: ModelCallResult) => {
        const duration = formatDurationSeconds(Date.now() - startTimeMs);
        let totalUsage = 0;
        if (modelCall.type === 'imageGeneration') {
          totalUsage = new BigNumber(result.numberOfImageGeneration || 0).toNumber();
        } else if (modelCall.type === 'video') {
          totalUsage = new BigNumber(result.mediaDuration || 0).toNumber();
        } else {
          totalUsage = new BigNumber(result.promptTokens || 0)
            .plus(result.completionTokens || 0)
            .plus(result.cacheCreationInputTokens || result.usageMetrics?.cacheCreationInputTokens || 0)
            .plus(result.cacheReadInputTokens || result.usageMetrics?.cacheReadInputTokens || 0)
            .decimalPlaces(CREDIT_DECIMAL_PLACES)
            .toNumber();
        }
        await ModelCall.update(
          {
            totalUsage,
            usageMetrics: {
              ...(modelCall.usageMetrics || {}),
              ...(result.usageMetrics || {}),
            },
            credits: result.credits || 0,
            status: 'success',
            duration,
            metadata: {
              ...metadata,
              phase: 'completed',
              completedAt: getCurrentUnixTimestamp(),
              ...(result.metadata || {}),
            },
            traceId: result.traceId,
          },
          { where: { id: modelCall.id } }
        );

        logger.info('Model call completed successfully', {
          id: modelCall.id,
          duration,
          totalUsage,
          credits: result.credits || 0,
        });
      },
      fail: async (errorReason: string, partialUsage?: Partial<UsageData>) => {
        const duration = formatDurationSeconds(Date.now() - startTimeMs);
        let totalUsage = 0;
        if (modelCall.type === 'imageGeneration') {
          totalUsage = new BigNumber(partialUsage?.numberOfImageGeneration || 0).toNumber();
        } else if (modelCall.type === 'video') {
          totalUsage = new BigNumber(partialUsage?.mediaDuration || 0).toNumber();
        } else {
          totalUsage = new BigNumber(partialUsage?.promptTokens || 0)
            .plus(partialUsage?.completionTokens || 0)
            .plus(partialUsage?.usageMetrics?.cacheCreationInputTokens || 0)
            .plus(partialUsage?.usageMetrics?.cacheReadInputTokens || 0)
            .decimalPlaces(CREDIT_DECIMAL_PLACES)
            .toNumber();
        }

        await ModelCall.update(
          {
            totalUsage,
            status: 'failed',
            errorReason: errorReason.substring(0, 1000),
            duration,
            usageMetrics: {
              ...(modelCall.usageMetrics || {}),
              ...(partialUsage?.usageMetrics || {}),
            },
            metadata: {
              ...metadata,
              phase: 'failed',
              failedAt: getCurrentUnixTimestamp(),
              ...(partialUsage?.metadata || {}),
            },
          },
          { where: { id: modelCall.id } }
        );

        logger.warn('Model call failed', {
          id: modelCall.id,
          duration,
          errorReason: errorReason.substring(0, 200),
        });
      },
      update: async (updateData: Partial<ModelCall>) => {
        await ModelCall.update(
          {
            traceId: updateData?.traceId,
          },
          { where: { id: modelCall.id } }
        );
      },
    };
  } catch (error) {
    logger.error('Failed to create model call context', {
      error,
      model,
      r: {
        providerId: p,
        model: m,
        userDid,
        requestId,
        metadata,
        usageMetrics,
        callTime: startTime,
      },
    });
    return null;
  }
}

export async function cleanupStaleProcessingCalls(timeoutMinutes: number = 30): Promise<number> {
  try {
    const cutoffTime = getCurrentUnixTimestamp() - timeoutMinutes * 60;

    const staleCalls = await ModelCall.findAll({
      where: {
        status: 'processing',
        callTime: { [Op.lt]: cutoffTime },
      },
    });

    const results = await pAll(
      staleCalls.map((call) => async () => {
        const durationSeconds = Math.round(((Date.now() - call.callTime * 1000) / 1000) * 10) / 10;
        await ModelCall.update(
          {
            status: 'failed',
            errorReason: `Timeout: Processing exceeded ${timeoutMinutes} minutes`,
            duration: durationSeconds,
          },
          { where: { id: call.id } }
        );
      }),
      { concurrency: 10, stopOnError: false }
    );

    return results.length;
  } catch (error) {
    logger.error('Failed to cleanup stale processing calls', { error });
    return 0;
  }
}
