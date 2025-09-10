import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { CallType } from '@api/store/models/types';
import Usage from '@api/store/models/usage';
import { CustomError } from '@blocklet/error';
import payment from '@blocklet/payment-js';
import BigNumber from 'bignumber.js';
import { Request } from 'express';
import type { DebouncedFunc } from 'lodash';
import throttle from 'lodash/throttle';
import { Op } from 'sequelize';

import { getModelNameWithProvider } from './ai-provider';
import { wallet } from './auth';
import { Config } from './env';
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

    await Usage.create({
      type,
      model,
      modelParams,
      promptTokens,
      completionTokens,
      numberOfImageGeneration,
      appId,
      usedCredits,
    });

    await reportUsage({ appId });

    return usedCredits;
  } catch (error) {
    logger.error('Create token usage error', { error });
    return undefined;
  }
}

async function getModelRates(model: string) {
  if (!model) {
    throw new CustomError(400, 'Model is required');
  }
  const callback = (err: Error) => {
    if (Config.pricing?.list) {
      return Config.pricing?.list;
    }
    throw err;
  };
  const { providerName, modelName } = getModelNameWithProvider(model);
  const where: { model?: string; providerId?: string } = {};
  if (modelName) {
    where.model = modelName;
  }
  if (providerName) {
    const provider = await AiProvider.findOne({
      where: {
        name: providerName,
      },
    });
    if (!provider) {
      return callback(new CustomError(404, `Provider ${providerName} not found`));
    }
    where.providerId = provider!.id;
  }
  const modelRates = await AiModelRate.findAll({
    where,
  });
  if (modelRates.length === 0) {
    return callback(
      new CustomError(400, `Unsupported model ${modelName}${providerName ? ` for provider ${providerName}` : ''}`)
    );
  }
  return modelRates;
}

async function getPrice(type: Usage['type'], model: string) {
  if (!model) {
    throw new CustomError(400, 'Model is required');
  }
  const modelRates = await getModelRates(model);
  const { modelName } = getModelNameWithProvider(model);
  const price = modelRates.find((i) => i.type === type && i.model === modelName);
  return price;
}

// v2 version with userDid support for proper credit tracking
export async function createAndReportUsageV2({
  type,
  model,
  modelParams,
  promptTokens = 0,
  completionTokens = 0,
  numberOfImageGeneration = 0,
  appId = wallet.address,
  userDid,
}: Required<Pick<Usage, 'type' | 'model'>> &
  Partial<Pick<Usage, 'modelParams' | 'promptTokens' | 'completionTokens' | 'appId' | 'numberOfImageGeneration'>> & {
    userDid: string;
  }): Promise<number | undefined> {
  try {
    let usedCredits: number | undefined;

    const price = await getPrice(type, model);
    if (price) {
      if (type === 'imageGeneration') {
        usedCredits = new BigNumber(numberOfImageGeneration).multipliedBy(price.outputRate).decimalPlaces(2).toNumber();
      } else {
        const input = new BigNumber(promptTokens).multipliedBy(price.inputRate);
        const output = new BigNumber(completionTokens).multipliedBy(price.outputRate);
        usedCredits = input.plus(output).decimalPlaces(2).toNumber();
      }
    }

    await Usage.create({
      type,
      model,
      modelParams,
      promptTokens,
      completionTokens,
      numberOfImageGeneration,
      appId,
      usedCredits,
      userDid,
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
        if (!isPaymentRunning()) return;

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
    if (!isPaymentRunning()) return;

    const { pricing } = Config;
    if (!pricing) throw new CustomError(400, 'Missing required preference `pricing`');

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

    // Step 2: Atomic range claim - prevent concurrent processing of the same batch
    const [updatedRows] = await Usage.update(
      { usageReportStatus: 'counted' },
      {
        where: {
          appId,
          userDid,
          id: { [Op.gt]: start?.id || '', [Op.lte]: end.id },
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

    // Step 3: Process the claimed batch
    const quantity = await Usage.sum('usedCredits', {
      where: { appId, userDid, id: { [Op.gt]: start?.id || '', [Op.lte]: end.id } },
    });

    logger.info('create meter event', { quantity, processId: process.pid, userDid, startId: start?.id, endId: end.id });

    try {
      await createMeterEvent({
        userDid,
        amount: new BigNumber(quantity).decimalPlaces(2).toNumber(),
        metadata: {
          appId,
        },
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
  numberOfImageGeneration = 0,
  appId,
  userDid,
  additionalMetrics = {},
  metadata = {},
  creditBasedBillingEnabled = true,
  traceId,
}: {
  req: Request;
  type: CallType;
  model: string;
  modelParams?: Record<string, any>;
  promptTokens?: number;
  completionTokens?: number;
  numberOfImageGeneration?: number;
  appId?: string;
  userDid: string;
  additionalMetrics?: Record<string, any>;
  metadata?: Record<string, any>;
  creditBasedBillingEnabled?: boolean;
  traceId?: string;
}): Promise<number | undefined> {
  try {
    let credits: number | undefined = 0;

    // Only create usage record if credit-based billing is enabled
    if (creditBasedBillingEnabled) {
      credits = await createAndReportUsageV2({
        // @ts-ignore
        type,
        model,
        modelParams,
        promptTokens,
        completionTokens,
        numberOfImageGeneration,
        appId,
        userDid,
      });
    }

    // Always complete ModelCall record regardless of billing mode
    if (req.modelCallContext) {
      await req.modelCallContext.complete({
        promptTokens,
        completionTokens,
        numberOfImageGeneration,
        credits: credits || 0,
        usageMetrics: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens: promptTokens + completionTokens,
          numberOfImageGeneration,
          ...additionalMetrics,
        },
        metadata,
        traceId,
      });
    }

    return credits;
  } catch (error) {
    logger.error('Error in createUsageAndCompleteModelCall', { error });

    // Always mark ModelCall as failed regardless of billing mode
    if (req.modelCallContext) {
      await req.modelCallContext.fail(error.message || 'Failed to create usage record', {
        promptTokens,
        completionTokens,
        numberOfImageGeneration,
        usageMetrics: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          numberOfImageGeneration,
          ...additionalMetrics,
        },
        metadata,
      });
    }

    throw error;
  }
}

export function handleModelCallError(req: Request, error: Error): void {
  if (req.modelCallContext) {
    req.modelCallContext.fail(error.message || 'Unknown error', {}).catch((err) => {
      logger.error('Failed to mark model call as failed', { error: err });
    });
  }
}
