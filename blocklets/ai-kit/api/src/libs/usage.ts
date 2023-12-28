import Usage from '@api/store/models/usage';
import payment from '@did-pay/client';
import BigNumber from 'bignumber.js';
import { throttle } from 'lodash';
import { Op } from 'sequelize';

import { wallet } from './auth';
import { Config } from './env';
import logger from './logger';
import { getActiveSubscriptionOfApp, isPaymentInstalled } from './payment';

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
    logger.error('Create token usage error', error);
  }
}

const reportUsage = throttle(
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
      if (!subscriptionItem) throw new Error(`Subscription item of product ${pricing.subscriptionProductId} not found`);

      await end.update({ usageReportStatus: 'counted' });

      await payment.subscriptionItems.createUsageRecord({
        subscription_item_id: subscriptionItem.id,
        quantity: quantity || 0,
      });

      await end.update({ usageReportStatus: 'reported' });
    } catch (error) {
      logger.error('report usage error', error);
    }
  },
  Config.usageReportThrottleTime,
  { leading: false }
);
