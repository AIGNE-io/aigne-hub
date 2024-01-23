import { SubscriptionError, SubscriptionErrorType } from '@blocklet/ai-kit/api';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';

import { Config } from './env';

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

export const isPaymentInstalled = () => !!config.components.find((i) => i.did === PAYMENT_DID);

export async function getActiveSubscriptionOfApp({ appId }: { appId: string }) {
  if (!isPaymentInstalled()) return undefined;

  // @ts-ignore TODO: remove ts-ignore after upgrade @did-pay/client
  const subscription = (await payment.subscriptions.list({ 'metadata.appId': appId })).list.find(
    (i) =>
      ['active', 'trialing'].includes(i.status) &&
      i.items.some((j) => j.price.product.id === Config.pricing?.subscriptionProductId)
  );

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
