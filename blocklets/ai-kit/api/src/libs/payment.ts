import { SubscriptionError, SubscriptionErrorType } from '@blocklet/ai-kit/api';
import { appStatus } from '@blocklet/ai-kit/api/call/app';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
import { parseURL } from 'ufo';

import { Config } from './env';
import logger from './logger';

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

export const isPaymentInstalled = () => !!config.components.find((i) => i.did === PAYMENT_DID);

export async function getActiveSubscriptionOfApp({ appId, description }: { appId: string; description?: string }) {
  if (!isPaymentInstalled()) return undefined;

  // @ts-ignore TODO: remove ts-ignore after upgrade @did-pay/client
  const subscription = (await payment.subscriptions.list({ 'metadata.appId': appId })).list.find(
    (i) =>
      ['active', 'trialing'].includes(i.status) &&
      i.items.some((j) => j.price.product.id === Config.pricing?.subscriptionProductId)
  );

  if (description && subscription) {
    await payment.subscriptions.update(subscription.id, { description });
  }

  return subscription;
}

export async function checkSubscription({ appId }: { appId: string }) {
  const subscription = await getActiveSubscriptionOfApp({ appId });
  if (!subscription) throw new SubscriptionError(SubscriptionErrorType.UNSUBSCRIBED);
}

export async function cancelSubscription({ appId }: { appId: string }) {
  const subscription = await getActiveSubscriptionOfApp({ appId });
  if (!subscription) return undefined;

  return payment.subscriptions.cancel(subscription.id);
}

export async function recoverSubscription({ appId }: { appId: string }) {
  const subscription = await getActiveSubscriptionOfApp({ appId });
  if (!subscription) return undefined;

  return payment.subscriptions.recover(subscription.id);
}

export function getSubscriptionDescription() {
  return ['[AI Service]', config.env.appName, `<${parseURL(config.env.appUrl).host}>`].join(' ');
}

// 更新 payment 中订阅的描述
export function autoUpdateSubscriptionMeta() {
  function updateDescription() {
    const subscriptionDescription = getSubscriptionDescription();

    appStatus({ description: subscriptionDescription }, { useAIKitService: true })
      .then((res) => {
        if (res?.subscription) {
          logger.info('update description of billing success', { description: subscriptionDescription });
        } else {
          logger.info('update description of billing error: no subscription updated');
        }
      })
      .catch((error) => {
        logger.error('update description of billing error', { error });
      });
  }

  updateDescription();

  let old = config.env.appName;

  config.events.on(config.Events.envUpdate, () => {
    if (old !== config.env.appName) {
      old = config.env.appName;
      updateDescription();
    }
  });
}
