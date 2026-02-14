import { getDefaultProviderForModel } from '@aigne/aigne-hub';
import { getModelNameWithProvider, getReqModel } from '@api/libs/ai-provider';
import { BLOCKLET_APP_PID, CREDIT_DECIMAL_PLACES } from '@api/libs/env';
import logger from '@api/libs/logger';
import { ensureModelWithProvider, getProvidersForModel, modelHasProvider } from '@api/libs/provider-rotation';
import { getCurrentUnixTimestamp } from '@api/libs/timestamp';
import { hasEnvCredentials } from '@api/providers/keys';
import { getProviderWithCache } from '@api/providers/models';
import { pushProjectFetchJob } from '@api/queue/projects';
import ModelCall from '@api/store/models/model-call';
import { CallType } from '@api/store/models/types';
import { CustomError } from '@blocklet/error';
import BigNumber from 'bignumber.js';
import { NextFunction, Request, Response } from 'express';

import nextId from '../libs/next-id';

export interface ModelCallContext {
  id: string;
  startTime: number;
  credentialId: string;
  providerId: string;
  traceId?: string;
  complete: (result: ModelCallResult) => Promise<void>;
  fail: (error: string, partialUsage?: Partial<UsageData>) => Promise<void>;
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

export interface ResolvedProvider {
  providerId: string;
  providerName: string;
  modelName: string;
  credentialId: string;
  originalModel?: string;
  availableProviders: Array<{ providerId: string; providerName: string; modelName: string }>;
  maxRetries: number;
}

declare global {
  namespace Express {
    interface Request {
      modelCallContext?: ModelCallContext;
      resolvedProvider?: ResolvedProvider;
    }
  }
}

/**
 * Combined middleware: resolves provider via rotation + gathers retry info.
 * Replaces the old getMaxProviderRetriesMiddleware + ensureModelWithProvider call
 * inside createModelCallMiddleware.
 */
export function resolveProviderMiddleware(defaultModel?: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    req.timings?.start('resolveProvider');

    if (!getReqModel(req) && defaultModel) {
      req.body.model = defaultModel;
    }

    const model = getReqModel(req);
    if (!model) {
      req.timings?.end('resolveProvider');
      next(new CustomError(400, 'Model parameter is required'));
      return;
    }

    // Resolve model to provider — may throw if no provider is available at all.
    // Wrap in try/catch so env-only providers (no DB record) can still proceed.
    try {
      await ensureModelWithProvider(req);
    } catch (err) {
      // If env credentials exist for the raw model's provider, allow fallback.
      // For unprefixed models (e.g. "gpt-4"), getModelNameWithProvider returns empty provider,
      // so we infer the default provider from the model name pattern.
      const rawModel = getReqModel(req);
      let { providerName: rawProvider } = getModelNameWithProvider(rawModel);
      if (!rawProvider) {
        rawProvider = getDefaultProviderForModel(rawModel) || '';
      }
      if (rawProvider && hasEnvCredentials(rawProvider)) {
        logger.info('ensureModelWithProvider failed, falling back to env credentials', {
          model: rawModel,
          provider: rawProvider,
        });
        // Rewrite model to include provider prefix so downstream can resolve it
        req.body.model = `${rawProvider}/${rawModel}`;
      } else {
        req.timings?.end('resolveProvider');
        next(err);
        return;
      }
    }

    const resolvedModel = getReqModel(req);
    const { providerName, modelName } = getModelNameWithProvider(resolvedModel);

    // Provider resolution: DB (via cache) first, env-credentials fallback second.
    const cachedProvider = await getProviderWithCache(providerName);
    const providerId = cachedProvider?.id || '';
    if (!providerId && !hasEnvCredentials(providerName)) {
      req.timings?.end('resolveProvider');
      next(new CustomError(503, `Provider '${providerName}' is not available or not configured`));
      return;
    }

    // Non-critical: retry info gathering
    try {
      const hasProvider = modelHasProvider(model);
      if (!hasProvider) {
        const modelNameParts = model.includes('/') ? model.split('/').slice(1) : [model];
        const modelNameWithoutProvider = modelNameParts.join('/');
        const originalModel = modelNameWithoutProvider || model;

        const providersInfo = await getProvidersForModel(originalModel);
        const availableProvidersList = (providersInfo?.availableProvidersList || []).filter(
          (p) => p.providerName && p.modelName
        );

        req.resolvedProvider = {
          providerId,
          providerName,
          modelName,
          credentialId: '',
          originalModel: model,
          availableProviders: availableProvidersList,
          maxRetries: providersInfo?.availableProviders || 1,
        };

        logger.info('Provider rotation info for retry', {
          model: originalModel,
          availableProviders: providersInfo?.availableProviders,
          availableProvidersList: availableProvidersList.map((p) => `${p.providerName}/${p.modelName}`),
        });
      } else {
        req.resolvedProvider = {
          providerId,
          providerName,
          modelName,
          credentialId: '',
          availableProviders: [],
          maxRetries: 1,
        };
      }
    } catch (error) {
      logger.warn('Failed to gather retry info', { error, model });
      if (!req.resolvedProvider) {
        req.resolvedProvider = {
          providerId,
          providerName,
          modelName,
          credentialId: '',
          availableProviders: [],
          maxRetries: 1,
        };
      }
    }

    req.timings?.end('resolveProvider');
    next();
  };
}

export function createModelCallMiddleware(callType: CallType) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userDid = req.user?.did;
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
      const { providerName, modelName } = getModelNameWithProvider(model);
      const context = createModelCallContext({
        type: callType,
        model,
        providerName,
        modelName,
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

      req.modelCallContext = context;

      let completed = false;

      const originalComplete = context.complete;
      const originalFail = context.fail;

      context.complete = async (result: ModelCallResult) => {
        if (completed) return;
        completed = true;
        context.credentialId = req.resolvedProvider?.credentialId || '';
        context.providerId = req.resolvedProvider?.providerId || '';
        await originalComplete(result);
      };

      context.fail = async (error: string, partialUsage?: Partial<UsageData>) => {
        if (completed) return;
        completed = true;
        context.credentialId = req.resolvedProvider?.credentialId || '';
        context.providerId = req.resolvedProvider?.providerId || '';
        await originalFail(error, partialUsage);
      };

      // Safety net: warn if response finishes without complete() or fail() being called.
      // No DB write — just a log entry for observability.
      _res.on('finish', () => {
        if (!completed) {
          logger.warn('Response finished without model call completion', {
            id: context.id,
            model,
            callType,
          });
        }
      });
    } catch (error) {
      logger.error('Model call middleware error', { error, originalModel: model, userDid });
    }

    next();
  };
}

/**
 * Pure in-memory ModelCall context. No DB write on creation.
 * complete() and fail() perform a single fire-and-forget ModelCall.create().
 */
function createModelCallContext({
  type,
  model,
  modelName,
  userDid,
  appDid,
  requestId,
  appName,
  metadata = {},
  usageMetrics = {},
}: {
  type: CallType;
  model: string;
  providerName: string;
  modelName: string;
  userDid: string;
  appDid?: string;
  requestId?: string;
  appName?: string;
  metadata?: Record<string, any>;
  usageMetrics?: Record<string, any>;
}): ModelCallContext {
  const formatDurationSeconds = (ms: number) => Math.round((ms / 1000) * 10) / 10;
  const startTime = getCurrentUnixTimestamp();
  const startTimeMs = Date.now();
  const id = nextId();

  // Push project info fetch job to queue (non-blocking, with deduplication)
  if (appDid) {
    pushProjectFetchJob(appDid, { appName });
  }

  logger.info('Created model call context (in-memory)', { id, model, type, userDid });

  const context: ModelCallContext = {
    id,
    startTime,
    credentialId: '',
    providerId: '',
    complete: async (result: ModelCallResult) => {
      const duration = formatDurationSeconds(Date.now() - startTimeMs);
      let totalUsage = 0;
      if (type === 'imageGeneration') {
        totalUsage = new BigNumber(result.numberOfImageGeneration || 0).toNumber();
      } else if (type === 'video') {
        totalUsage = new BigNumber(result.mediaDuration || 0).toNumber();
      } else {
        totalUsage = new BigNumber(result.promptTokens || 0)
          .plus(result.completionTokens || 0)
          .plus(result.cacheCreationInputTokens || result.usageMetrics?.cacheCreationInputTokens || 0)
          .plus(result.cacheReadInputTokens || result.usageMetrics?.cacheReadInputTokens || 0)
          .decimalPlaces(CREDIT_DECIMAL_PLACES)
          .toNumber();
      }

      // Single fire-and-forget write of the complete record
      ModelCall.create({
        id,
        providerId: context.providerId || '',
        model: modelName || model,
        credentialId: context.credentialId || '',
        type,
        totalUsage,
        usageMetrics: {
          ...usageMetrics,
          ...(result.usageMetrics || {}),
        },
        credits: result.credits || 0,
        status: 'success',
        duration,
        appDid,
        userDid,
        requestId,
        metadata: {
          ...metadata,
          startTime,
          phase: 'completed',
          originalModel: model,
          completedAt: getCurrentUnixTimestamp(),
          ...(result.metadata || {}),
        },
        callTime: startTime,
        traceId: result.traceId || context.traceId,
      }).catch((error) => {
        logger.error('Failed to write completed model call record', { error, id });
      });

      logger.info('Model call completed successfully', {
        id,
        duration,
        totalUsage,
        credits: result.credits || 0,
      });
    },
    fail: async (errorReason: string, partialUsage?: Partial<UsageData>) => {
      const duration = formatDurationSeconds(Date.now() - startTimeMs);
      let totalUsage = 0;
      if (type === 'imageGeneration') {
        totalUsage = new BigNumber(partialUsage?.numberOfImageGeneration || 0).toNumber();
      } else if (type === 'video') {
        totalUsage = new BigNumber(partialUsage?.mediaDuration || 0).toNumber();
      } else {
        totalUsage = new BigNumber(partialUsage?.promptTokens || 0)
          .plus(partialUsage?.completionTokens || 0)
          .plus(partialUsage?.usageMetrics?.cacheCreationInputTokens || 0)
          .plus(partialUsage?.usageMetrics?.cacheReadInputTokens || 0)
          .decimalPlaces(CREDIT_DECIMAL_PLACES)
          .toNumber();
      }

      // Single fire-and-forget write of the failed record
      ModelCall.create({
        id,
        providerId: context.providerId || '',
        model: modelName || model,
        credentialId: context.credentialId || '',
        type,
        totalUsage,
        status: 'failed',
        errorReason: errorReason.substring(0, 1000),
        duration,
        credits: 0,
        appDid,
        userDid,
        requestId,
        usageMetrics: {
          ...usageMetrics,
          ...(partialUsage?.usageMetrics || {}),
        },
        metadata: {
          ...metadata,
          startTime,
          phase: 'failed',
          originalModel: model,
          failedAt: getCurrentUnixTimestamp(),
          ...(partialUsage?.metadata || {}),
        },
        callTime: startTime,
        traceId: context.traceId,
      }).catch((error) => {
        logger.error('Failed to write failed model call record', { error, id });
      });

      logger.warn('Model call failed', {
        id,
        duration,
        errorReason: errorReason.substring(0, 200),
      });
    },
    update: async (updateData: Partial<ModelCall>) => {
      if (updateData?.traceId) {
        context.traceId = updateData.traceId as string;
      }
    },
  };

  return context;
}
