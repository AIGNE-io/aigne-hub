import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import Usage from '@api/store/models/usage';
import payment from '@blocklet/payment-js';
import BigNumber from 'bignumber.js';
import { DebouncedFunc, throttle } from 'lodash';
import { Op } from 'sequelize';

import { wallet } from './auth';
import { Config } from './env';
import logger from './logger';
import { createMeterEvent, getActiveSubscriptionOfApp, isPaymentInstalled } from './payment';

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
  } catch (error) {
    logger.error('Create token usage error', { error });
  }
}

async function getModelRates(model: string) {
  if (!model) {
    throw new Error('Model is required');
  }
  const callback = (err: Error) => {
    if (Config.pricing?.list) {
      return Config.pricing?.list;
    }
    throw err;
  };
  let providerName;
  let modelName;
  if (model.includes(':')) {
    const [p, m] = model.split(':');
    providerName = p;
    modelName = m || model;
  }
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
      return callback(new Error(`Provider ${providerName} not found`));
    }
    where.providerId = provider!.id;
  }
  const modelRates = await AiModelRate.findAll({
    where,
  });
  if (modelRates.length === 0) {
    return callback(new Error(`Unsupported model ${modelName}${providerName ? ` for provider ${providerName}` : ''}`));
  }
  return modelRates;
}

async function getPrice(type: Usage['type'], model: string) {
  if (!model) {
    throw new Error('Model is required');
  }
  const modelRates = await getModelRates(model);
  const modelName = model.includes(':') ? model.split(':')[1] : model;
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
  }) {
  try {
    let usedCredits: number | undefined;

    const price = await getPrice(type, model);
    if (price) {
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
      userDid,
    });

    await reportUsageV2({ appId, userDid });
  } catch (error) {
    logger.error('Create token usage v2 error', { error });
  }
}

const tasks: { [key: string]: DebouncedFunc<(options: { appId: string }) => Promise<void>> } = {};

async function reportUsage({ appId }: { appId: string }) {
  tasks[appId] ??= throttle(
    async ({ appId }: { appId: string }) => {
      try {
        if (!isPaymentInstalled()) return;

        const { pricing } = Config;
        if (!pricing) throw new Error('Missing required preference `pricing`');

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
        if (!subscription) throw new Error('Subscription not active');

        const subscriptionItem = subscription.items.find((i) => i.price.product_id === pricing.subscriptionProductId);
        if (!subscriptionItem)
          throw new Error(`Subscription item of product ${pricing.subscriptionProductId} not found`);

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
      try {
        if (!isPaymentInstalled()) return;

        const { pricing } = Config;
        if (!pricing) throw new Error('Missing required preference `pricing`');

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

        const quantity = await Usage.sum('usedCredits', {
          where: { appId, userDid, id: { [Op.gt]: start?.id || '', [Op.lte]: end.id } },
        });

        await end.update({ usageReportStatus: 'counted' });

        logger.info('create meter event', { quantity });
        await createMeterEvent({
          userDid,
          amount: quantity || 0,
        });

        await end.update({ usageReportStatus: 'reported' });
      } catch (error) {
        logger.error('report usage v2 error', { error });
      }
    },
    Config.usageReportThrottleTime,
    { leading: false, trailing: true }
  );

  tasksV2[taskKey]!({ appId, userDid });
}
