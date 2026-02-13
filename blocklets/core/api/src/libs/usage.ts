import { getCachedModelRates } from '@api/providers';
import { getProviderWithCache } from '@api/providers/models';
import AiModelRate from '@api/store/models/ai-model-rate';
import { CallType } from '@api/store/models/types';
import Usage from '@api/store/models/usage';
import { sequelize } from '@api/store/sequelize';
import { CustomError } from '@blocklet/error';
import payment from '@blocklet/payment-js';
import BigNumber from 'bignumber.js';
import { Request } from 'express';
import type { DebouncedFunc } from 'lodash';
import throttle from 'lodash/throttle';
import { Op } from 'sequelize';

import { getModelNameWithProvider } from './ai-provider';
import { wallet } from './auth';
import { CREDIT_DECIMAL_PLACES, Config } from './env';
import logger from './logger';
import { createMeterEvent, getActiveSubscriptionOfApp, isPaymentRunning } from './payment';

export async function createAndReportUsage({
  type,
  model,
  modelParams,
  promptTokens = 0,
  completionTokens = 0,
  numberOfImageGeneration = 0,
  appId = wallet.address,
}: Required<Pick<Usage, 'type' | 'model'>> &
  Partial<Pick<Usage, 'modelParams' | 'promptTokens' | 'completionTokens' | 'appId' | 'numberOfImageGeneration'>>) {
  try {
    let usedCredits: number | undefined;

    const { pricing } = Config;
    const price = Config.pricing?.list.find((i) => i.type === type && i.model === model);

    // TODO: record used credits of audio transcriptions/speech
    if (pricing && price) {
      if (type === 'imageGeneration') {
        usedCredits = new BigNumber(numberOfImageGeneration).multipliedBy(price.outputRate).toNumber();
      } else {
        const input = new BigNumber(promptTokens).multipliedBy(price.inputRate);
        const output = new BigNumber(completionTokens).multipliedBy(price.outputRate);
        usedCredits = input.plus(output).toNumber();
      }
    }

    const params = {
      type,
      model,
      modelParams,
      promptTokens,
      completionTokens,
      numberOfImageGeneration,
      appId,
      usedCredits,
    };

    await Usage.create(params).catch((error) => {
      logger.error('Failed to create usage record', { error, params });
      throw error;
    });

    await reportUsage({ appId });

    return usedCredits;
  } catch (error) {
    logger.error('Create token usage error', { error });
    return undefined;
  }
}

async function getModelRates(model: string, providerId?: string): Promise<AiModelRate[]> {
  if (!model) {
    throw new CustomError(400, 'Model is required');
  }
  const callback = (err: Error): AiModelRate[] => {
    if (Config.pricing?.list) {
      return Config.pricing?.list as AiModelRate[];
    }
    throw err;
  };
  const { providerName, modelName } = getModelNameWithProvider(model);

  let resolvedProviderId = providerId;
  if (!resolvedProviderId && providerName) {
    const cachedProvider = await getProviderWithCache(providerName);
    if (!cachedProvider) {
      return callback(new CustomError(404, `Provider ${providerName} not found`));
    }
    resolvedProviderId = cachedProvider.id;
  }

  const modelRates = await getCachedModelRates(modelName, resolvedProviderId);
  if (modelRates.length === 0) {
    return callback(
      new CustomError(400, `Unsupported model ${modelName}${providerName ? ` for provider ${providerName}` : ''}`)
    );
  }
  return modelRates;
}

async function getPrice(type: Usage['type'], model: string, providerId?: string): Promise<AiModelRate | undefined> {
  if (!model) {
    throw new CustomError(400, 'Model is required');
  }
  const modelRates = await getModelRates(model, providerId);
  const { modelName } = getModelNameWithProvider(model);
  const price = modelRates.find((i) => i.type === type && i.model === modelName);
  return price;
}

export function getTotalTokens(usageMetrics: {
  inputTokens?: number | string;
  outputTokens?: number | string;
  cacheCreationInputTokens?: number | string;
  cacheReadInputTokens?: number | string;
}) {
  if (!usageMetrics) {
    return 0;
  }
  return new BigNumber(usageMetrics.inputTokens || 0)
    .plus(new BigNumber(usageMetrics.outputTokens || 0))
    .plus(new BigNumber(usageMetrics.cacheCreationInputTokens || 0))
    .plus(new BigNumber(usageMetrics.cacheReadInputTokens || 0))
    .toNumber();
}

// v2 version with userDid support for proper credit tracking
export async function createAndReportUsageV2({
  type,
  model, // model is in the format of provider/model
  modelParams,
  promptTokens = 0,
  completionTokens = 0,
  cacheCreationInputTokens = 0,
  cacheReadInputTokens = 0,
  numberOfImageGeneration = 0,
  appId = wallet.address,
  userDid,
  mediaDuration,
  providerId,
}: Required<Pick<Usage, 'type' | 'model'>> &
  Partial<
    Pick<
      Usage,
      'modelParams' | 'promptTokens' | 'completionTokens' | 'appId' | 'numberOfImageGeneration' | 'mediaDuration'
    >
  > & {
    userDid: string;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    providerId?: string;
  }): Promise<number | undefined> {
  try {
    let usedCredits: number | undefined;

    const price = await getPrice(type, model, providerId);
    if (price) {
      let creditsTotalBN = new BigNumber(0);
      if (type === 'imageGeneration') {
        creditsTotalBN = creditsTotalBN.plus(new BigNumber(numberOfImageGeneration).multipliedBy(price.outputRate));
      } else if (type === 'video') {
        creditsTotalBN = creditsTotalBN.plus(new BigNumber(mediaDuration || 0).multipliedBy(price.outputRate));
      } else {
        const outputCredits = new BigNumber(completionTokens || 0).multipliedBy(price.outputRate);
        creditsTotalBN = creditsTotalBN.plus(outputCredits);
      }
      const inputCredits = new BigNumber(promptTokens || 0).multipliedBy(price.inputRate);
      creditsTotalBN = creditsTotalBN.plus(inputCredits);
      // Handle cache tokens
      if (cacheCreationInputTokens > 0 || cacheReadInputTokens > 0) {
        const caching = price.caching as { readRate?: number; writeRate?: number } | undefined;

        if (caching?.writeRate) {
          // Use configured cache write rate for cache creation tokens
          creditsTotalBN = creditsTotalBN.plus(
            new BigNumber(cacheCreationInputTokens || 0).multipliedBy(caching.writeRate || 0)
          );
        } else {
          // Fallback: add cache creation tokens to regular input tokens
          creditsTotalBN = creditsTotalBN.plus(
            new BigNumber(cacheCreationInputTokens || 0).multipliedBy(price.inputRate || 0)
          );
        }

        if (caching?.readRate) {
          // Use configured cache read rate for cache read tokens
          creditsTotalBN = creditsTotalBN.plus(new BigNumber(cacheReadInputTokens || 0).multipliedBy(caching.readRate));
        } else {
          // Fallback: add cache read tokens to regular input tokens
          creditsTotalBN = creditsTotalBN.plus(
            new BigNumber(cacheReadInputTokens || 0).multipliedBy(price.inputRate || 0)
          );
        }
      }

      usedCredits = creditsTotalBN.decimalPlaces(CREDIT_DECIMAL_PLACES).toNumber();
    }

    const params = {
      type,
      model,
      modelParams,
      promptTokens,
      completionTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      numberOfImageGeneration,
      appId,
      usedCredits,
      userDid,
      mediaDuration,
    };

    await Usage.create(params).catch((error) => {
      logger.error('Failed to create usage record', { error, params });
      throw error;
    });

    await reportUsageV2({ appId, userDid });
    return usedCredits;
  } catch (error) {
    logger.error('Create token usage v2 error', { error });
    return undefined;
  }
}

const tasks: { [key: string]: DebouncedFunc<(options: { appId: string }) => Promise<void>> } = {};

async function reportUsage({ appId }: { appId: string }) {
  tasks[appId] ??= throttle(
    async ({ appId }: { appId: string }) => {
      try {
        if (!isPaymentRunning()) {
          logger.info('Payment is not running, skipping usage report', { appId });
          return;
        }

        const { pricing } = Config;
        if (!pricing) throw new CustomError(400, 'Missing required preference `pricing`');

        const start = await Usage.findOne({
          where: { appId, usageReportStatus: { [Op.not]: null } },
          order: [['id', 'desc']],
          limit: 1,
        });
        const end = await Usage.findOne({
          where: { appId, id: { [Op.gt]: start?.id || '' } },
          order: [['id', 'desc']],
          limit: 1,
        });

        if (!end) return;

        const quantity = await Usage.sum('usedCredits', {
          where: { appId, id: { [Op.gt]: start?.id || '', [Op.lte]: end.id } },
        });

        const subscription = await getActiveSubscriptionOfApp({ appId });
        if (!subscription) throw new CustomError(400, 'Subscription not active');

        const subscriptionItem = subscription.items.find((i) => i.price.product_id === pricing.subscriptionProductId);
        if (!subscriptionItem)
          throw new CustomError(404, `Subscription item of product ${pricing.subscriptionProductId} not found`);

        await end.update({ usageReportStatus: 'counted' });

        await payment.subscriptionItems.createUsageRecord({
          subscription_item_id: subscriptionItem.id,
          quantity: quantity || 0,
        });

        await end.update({ usageReportStatus: 'reported' });
      } catch (error) {
        logger.error('report usage error', { error });
      }
    },
    Config.usageReportThrottleTime,
    { leading: false, trailing: true }
  );

  tasks[appId]!({ appId });
}

const tasksV2: { [key: string]: DebouncedFunc<(options: { appId: string; userDid: string }) => Promise<void>> } = {};

async function reportUsageV2({ appId, userDid }: { appId: string; userDid: string }) {
  const taskKey = `${appId}-${userDid}`;

  tasksV2[taskKey] ??= throttle(
    async ({ appId, userDid }: { appId: string; userDid: string }) => {
      await executeOriginalReportLogicWithProtection({ appId, userDid });
    },
    Config.usageReportThrottleTime,
    { leading: false, trailing: true }
  );

  tasksV2[taskKey]!({ appId, userDid });
}

async function executeOriginalReportLogicWithProtection({ appId, userDid }: { appId: string; userDid: string }) {
  try {
    if (!isPaymentRunning()) {
      logger.info('Payment is not running, skipping usage report', { appId, userDid });
      return;
    }

    const start = await Usage.findOne({
      where: { appId, userDid, usageReportStatus: { [Op.not]: null } },
      order: [['id', 'desc']],
      limit: 1,
    });
    const end = await Usage.findOne({
      where: { appId, userDid, id: { [Op.gt]: start?.id || '' } },
      order: [['id', 'desc']],
      limit: 1,
    });

    if (!end) return;

    const usageRangeConditions = {
      appId,
      userDid,
      id: { [Op.gt]: start?.id || '', [Op.lte]: end.id },
    };
    // Step 2: Atomic range claim - prevent concurrent processing of the same batch
    const [updatedRows] = await Usage.update(
      { usageReportStatus: 'counted' },
      {
        where: {
          ...usageRangeConditions,
          usageReportStatus: null, // Only claim unclaimed records
        },
      }
    );

    if (updatedRows === 0) {
      // No records were claimed - another process already processed this range
      logger.debug('Usage range already claimed by another process', {
        appId,
        userDid,
        startId: start?.id,
        endId: end.id,
        processId: process.pid,
      });
      return;
    }

    // Step 3: Process the claimed batch with one aggregate query
    const sums = (await Usage.findOne({
      attributes: [
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('usedCredits')), 0), 'usedCredits'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('promptTokens')), 0), 'promptTokens'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('completionTokens')), 0), 'completionTokens'],
        [
          sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('cacheCreationInputTokens')), 0),
          'cacheCreationInputTokens',
        ],
        [
          sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('cacheReadInputTokens')), 0),
          'cacheReadInputTokens',
        ],
        [
          sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('numberOfImageGeneration')), 0),
          'numberOfImageGeneration',
        ],
      ],
      where: {
        ...usageRangeConditions,
        usageReportStatus: 'counted',
      },
      raw: true,
    })) as unknown as {
      usedCredits: string | number | null;
      promptTokens: string | number | null;
      completionTokens: string | number | null;
      cacheCreationInputTokens: string | number | null;
      cacheReadInputTokens: string | number | null;
      numberOfImageGeneration: string | number | null;
    };
    const quantity = sums?.usedCredits ?? 0;
    const inputTokens = sums?.promptTokens ?? 0;
    const outputTokens = sums?.completionTokens ?? 0;
    const cacheCreationInputTokens = sums?.cacheCreationInputTokens ?? 0;
    const cacheReadInputTokens = sums?.cacheReadInputTokens ?? 0;
    const imagesGenerated = sums?.numberOfImageGeneration ?? 0;

    logger.info('create meter event', {
      quantity,
      processId: process.pid,
      userDid,
      startId: start?.id,
      endId: end.id,
      recordCount: updatedRows,
    });

    const reportQuantity = new BigNumber(quantity || 0).decimalPlaces(CREDIT_DECIMAL_PLACES).toNumber();
    const imagesGeneratedNum = Number(imagesGenerated) || 0;
    try {
      await createMeterEvent({
        userDid,
        amount: reportQuantity,
        metadata: {
          appId,
        },
        sourceData: [
          {
            key: 'source',
            label: { en: 'Source', zh: '来源' },
            value: 'AIGNE Hub',
          },
          {
            key: 'record_count',
            label: { en: 'API Calls', zh: 'API 调用数' },
            value: `${updatedRows}`,
          },
          {
            key: 'total_tokens',
            label: { en: 'Total Tokens', zh: 'Token数量' },
            value: `${getTotalTokens({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens })}`,
          },
          ...(imagesGeneratedNum > 0
            ? [
                {
                  key: 'images_generated',
                  label: { en: 'Images Generated', zh: '生成图片数' },
                  value: `${imagesGeneratedNum}`,
                },
              ]
            : []),
          {
            key: 'total_credits',
            label: { en: 'Total Credits', zh: 'Credits 用量' },
            value: `${reportQuantity}`,
          },
        ],
      });

      // Step 4: Mark the entire range as successfully reported
      await Usage.update(
        { usageReportStatus: 'reported' },
        {
          where: {
            appId,
            userDid,
            id: { [Op.gt]: start?.id || '', [Op.lte]: end.id },
            usageReportStatus: 'counted', // Only update records we claimed
          },
        }
      );
    } catch (apiError) {
      // Reset entire range to null if API call fails, allowing retry
      await Usage.update(
        { usageReportStatus: null },
        {
          where: {
            appId,
            userDid,
            id: { [Op.gt]: start?.id || '', [Op.lte]: end.id },
            usageReportStatus: 'counted', // Only reset records we claimed
          },
        }
      ).catch((resetError) => {
        logger.error('Failed to reset processing state for range', {
          resetError,
          appId,
          userDid,
          startId: start?.id,
          endId: end.id,
          processId: process.pid,
        });
      });
      throw apiError;
    }
  } catch (error) {
    logger.error('report usage v2 error', { error, processId: process.pid });
  }
}

export async function createUsageAndCompleteModelCall({
  req,
  type,
  model,
  modelParams,
  promptTokens = 0,
  completionTokens = 0,
  cacheCreationInputTokens = 0,
  cacheReadInputTokens = 0,
  numberOfImageGeneration = 0,
  appId,
  userDid,
  additionalMetrics = {},
  metadata = {},
  creditBasedBillingEnabled = true,
  traceId,
  mediaDuration,
  providerId,
}: {
  req: Request;
  type: CallType;
  model: string;
  modelParams?: Record<string, any>;
  promptTokens?: number;
  completionTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  numberOfImageGeneration?: number;
  appId?: string;
  userDid: string;
  additionalMetrics?: Record<string, any>;
  metadata?: Record<string, any>;
  creditBasedBillingEnabled?: boolean;
  traceId?: string;
  mediaDuration?: number;
  providerId?: string;
}): Promise<number | undefined> {
  let credits: number | undefined = 0;

  // Usage.create stays synchronous — need the ID ordering to be stable
  if (creditBasedBillingEnabled) {
    try {
      credits = await createAndReportUsageV2({
        // @ts-ignore
        type,
        model,
        modelParams,
        promptTokens,
        completionTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        numberOfImageGeneration,
        appId,
        userDid,
        mediaDuration,
        providerId,
      });
    } catch (err) {
      logger.error('Usage creation failed, ModelCall will still complete', { error: err });
    }
  }

  // ModelCall completion is fire-and-forget (already writes via ModelCall.create)
  if (req.modelCallContext) {
    const totalTokens = getTotalTokens({
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
    });
    req.modelCallContext
      .complete({
        promptTokens,
        completionTokens,
        numberOfImageGeneration,
        mediaDuration,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        credits: credits || 0,
        usageMetrics: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
          cacheCreationInputTokens,
          cacheReadInputTokens,
          numberOfImageGeneration,
          ...additionalMetrics,
        },
        metadata,
        traceId,
      })
      .catch((err) => {
        logger.error('Failed to complete model call record', { error: err });
      });
  }

  return credits;
}

export function handleModelCallError(req: Request, error: Error): void {
  if (req.modelCallContext) {
    req.modelCallContext.fail(error.message || 'Unknown error', {}).catch((err) => {
      logger.error('Failed to mark model call as failed', { error: err });
    });
  }
}
