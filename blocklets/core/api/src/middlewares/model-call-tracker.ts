import logger from '@api/libs/logger';
import { getCurrentUnixTimestamp } from '@api/libs/timestamp';
import { getModelAndProviderId } from '@api/providers/models';
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
}

interface UsageData {
  promptTokens: number;
  completionTokens: number;
  numberOfImageGeneration: number;
  credits: number;
  usageMetrics: Record<string, any>;
  metadata?: Record<string, any>;
}

interface ModelCallResult {
  promptTokens?: number;
  completionTokens?: number;
  numberOfImageGeneration?: number;
  credits?: number;
  usageMetrics?: Record<string, any>;
  metadata?: Record<string, any>;
}

declare global {
  namespace Express {
    interface Request {
      modelCallContext?: ModelCallContext;
    }
  }
}

export function createModelCallMiddleware(callType: CallType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userDid = req.user?.did;
    const model = req.body?.model;

    if (!userDid || !model) {
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
    try {
      const context = await createModelCallContext({
        type: callType,
        model,
        userDid,
        appDid: req.headers['x-aigne-hub-client-did'] as string,
        requestId: req.headers['x-request-id'] as string,
        usageMetrics,
        metadata: {
          endpoint: req.path,
          modelParams: req.body?.options?.modelOptions,
        },
      });

      if (context) {
        req.modelCallContext = context;

        // 监听响应结束事件，如果没有手动完成则标记为异常
        const originalEnd = res.end.bind(res);
        let completed = false;

        res.end = (...args: any[]) => {
          if (!completed && req.modelCallContext) {
            // 如果响应结束但没有手动完成ModelCall，标记为异常
            req.modelCallContext.fail('Response ended without completion').catch((err) => {
              logger.error('Failed to mark incomplete model call as failed', { error: err });
            });
          }
          return originalEnd(...args);
        };

        // 重写complete和fail方法以确保只能调用一次
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
  metadata = {},
  usageMetrics = {},
}: {
  type: CallType;
  model: string;
  userDid: string;
  appDid?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  usageMetrics?: Record<string, any>;
}): Promise<ModelCallContext | null> {
  try {
    const startTime = getCurrentUnixTimestamp();
    const { providerId, modelName } = await getModelAndProviderId(model);

    // Create ModelCall record without provider/credential info initially
    const modelCall = await ModelCall.create({
      providerId: providerId || '',
      model: modelName,
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
    });

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
        const duration = getCurrentUnixTimestamp() - startTime;
        let totalUsage = 0;
        if (modelCall.type === 'imageGeneration') {
          totalUsage = new BigNumber(result.numberOfImageGeneration || 0).toNumber();
        } else {
          totalUsage = new BigNumber(result.promptTokens || 0)
            .plus(result.completionTokens || 0)
            .decimalPlaces(2)
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
        const duration = getCurrentUnixTimestamp() - startTime;
        let totalUsage = 0;
        if (modelCall.type === 'imageGeneration') {
          totalUsage = new BigNumber(partialUsage?.numberOfImageGeneration || 0).toNumber();
        } else {
          totalUsage = new BigNumber(partialUsage?.promptTokens || 0)
            .plus(partialUsage?.completionTokens || 0)
            .decimalPlaces(2)
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
    };
  } catch (error) {
    logger.error('Failed to create model call context', { error, model, userDid });
    return null;
  }
}

// 清理长时间处于processing状态的记录
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
        await ModelCall.update(
          {
            status: 'failed',
            errorReason: `Timeout: Processing exceeded ${timeoutMinutes} minutes`,
            duration: getCurrentUnixTimestamp() - call.callTime,
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
