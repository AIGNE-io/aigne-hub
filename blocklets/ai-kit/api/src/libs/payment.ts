import payment from '@did-pay/client';

import { Config } from './env';

export async function getActiveSubscriptionOfApp({ appId }: { appId: string }) {
  const subscription = (await payment.subscriptions.list({ 'metadata.appId': appId })).list.find(
    (i) => i.status === 'active' && i.items.some((j) => j.price.product.id === Config.pricing?.subscriptionProductId)
  );

  return subscription;
}

export async function checkSubscription({ appId }: { appId: string }) {
  const subscription = await getActiveSubscriptionOfApp({ appId });
  if (!subscription) throw new Error('Your subscription is not available');
}
