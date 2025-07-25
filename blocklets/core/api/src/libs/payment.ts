import { CreditError, CreditErrorType, SubscriptionError, SubscriptionErrorType } from '@blocklet/aigne-hub/api';
import { appStatus } from '@blocklet/aigne-hub/api/call/app';
import { BlockletStatus } from '@blocklet/constant';
import { CustomError } from '@blocklet/error';
import payment, { Subscription, TMeterEventExpanded } from '@blocklet/payment-js';
import { getComponentMountPoint } from '@blocklet/sdk';
import config from '@blocklet/sdk/lib/config';
import { joinURL, parseURL } from 'ufo';

import { Config, DEFAULT_CREDIT_PAYMENT_LINK_KEY, DEFAULT_CREDIT_PRICE_KEY, METER_NAME, METER_UNIT } from './env';
import logger from './logger';

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

export const isPaymentRunning = () =>
  !!config.components.find((i) => i.did === PAYMENT_DID && i.status === BlockletStatus.running);

export const paymentClient = payment;
export const getPaymentKitPrefix = () => {
  return joinURL(config.env.appUrl, getComponentMountPoint(PAYMENT_DID));
};
export const ensureMeter = async () => {
  if (!isPaymentRunning()) return null;
  try {
    const meter = await payment.meters.retrieve(METER_NAME);
    return meter;
  } catch (error) {
    if (error instanceof Error && error.message.includes('is not running')) {
      return null;
    }
    logger.error('failed to retrieve meter', { error });
    logger.info('start to create meter');
    const meter = await payment.meters.create({
      name: 'AIGNE Hub AI Meter',
      description: 'AIGNE Hub AI Meter',
      event_name: METER_NAME,
      unit: METER_UNIT,
      aggregation_method: 'sum',
    });
    return meter;
  }
};

export async function ensureCustomer(userDid: string) {
  // @ts-ignore
  const customer = await payment.customers.retrieve(userDid, {
    create: true,
  });
  return customer;
}

// get user credits
export async function getUserCredits({ userDid }: { userDid: string }) {
  if (!isPaymentRunning()) return { balance: 0, currency: null };
  const meter = await ensureMeter();
  if (!meter) {
    return {
      balance: 0,
      currency: null,
    };
  }
  const customer = await ensureCustomer(userDid);
  if (!customer) {
    return {
      balance: 0,
      currency: meter.paymentCurrency,
      total: 0,
      grantCount: 0,
    };
  }
  const creditBalance = await payment.creditGrants.summary({
    customer_id: customer.id,
  });

  return {
    balance: creditBalance?.[meter.currency_id!]?.remainingAmount ?? '0',
    currency: meter.paymentCurrency,
    total: creditBalance?.[meter.currency_id!]?.totalAmount ?? '0',
    grantCount: creditBalance?.[meter.currency_id!]?.grantCount ?? 0,
  };
}

// create meter event
export async function createMeterEvent({
  userDid,
  amount,
  metadata,
}: {
  userDid: string;
  amount: number;
  metadata?: Record<string, any>;
}): Promise<TMeterEventExpanded | undefined> {
  if (!isPaymentRunning()) throw new CustomError(502, 'Payment Kit is not running');
  const meter = await ensureMeter();
  if (!meter) throw new CustomError(404, 'Meter is not found');
  const now = Date.now();
  if (Number(amount) === 0) {
    return undefined;
  }
  const meterEvent = await payment.meterEvents.create({
    event_name: meter.event_name,
    timestamp: Math.floor(now / 1000),
    payload: {
      customer_id: userDid,
      value: String(amount),
    },
    identifier: `${userDid}-${meter.event_name}-${now}`,
    metadata,
  });
  return meterEvent;
}

export async function ensureDefaultCreditPrice() {
  try {
    const price = await payment.prices.retrieve(DEFAULT_CREDIT_PRICE_KEY);
    return price;
  } catch {
    try {
      const paymentCurrencies = await payment.paymentCurrencies.list({});
      if (paymentCurrencies.length === 0) {
        logger.error('No payment currencies found');
        return null;
      }
      const meter = await ensureMeter();
      if (!meter) {
        logger.error('No meter found');
        return null;
      }
      await payment.products.create({
        name: 'Basic AIGNE Hub Credit Packs',
        description: `It is a basic pack of ${METER_UNIT}, you can pay to get more ${METER_UNIT} credits.`,
        type: 'credit',
        prices: [
          {
            type: 'one_time',
            unit_amount: '0.0025',
            currency_id: paymentCurrencies[0]!.id,
            // @ts-ignore
            currency_options: paymentCurrencies.map((currency) => ({
              currency_id: currency.id,
              unit_amount: '0.0025',
            })),
            lookup_key: DEFAULT_CREDIT_PRICE_KEY,
            nickname: 'Per Unit Credit For AIGNE Hub',
            metadata: {
              credit_config: {
                priority: 50,
                valid_duration_value: 0,
                valid_duration_unit: 'days',
                currency_id: meter.currency_id,
                credit_amount: '1000',
              },
              meter_id: meter.id,
            },
          },
        ],
      });
      const price = await payment.prices.retrieve(DEFAULT_CREDIT_PRICE_KEY);
      return price;
    } catch (error) {
      logger.error('failed to ensure credit price', { error });
      return null;
    }
  }
}

export async function ensureDefaultCreditPaymentLink() {
  if (!isPaymentRunning()) return null;
  const price = await ensureDefaultCreditPrice();
  if (!price) {
    logger.error('failed to ensure default credit price');
    throw new CustomError(404, 'Default credit price not found');
  }
  try {
    const existingPaymentLink = await payment.paymentLinks.retrieve(DEFAULT_CREDIT_PAYMENT_LINK_KEY);
    if (!existingPaymentLink) {
      throw new CustomError(404, 'Default credit payment link not found');
    }
    return joinURL(getPaymentKitPrefix(), 'checkout/pay', existingPaymentLink.id);
  } catch (error) {
    logger.error('failed to retrieve default credit payment link, create a new one', { error });
    const paymentLink = await payment.paymentLinks.create({
      name: price.product.name,
      // @ts-ignore
      lookup_key: DEFAULT_CREDIT_PAYMENT_LINK_KEY,
      line_items: [
        {
          price_id: price.id,
          quantity: 1,
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
            maximum: 100000000,
          },
        },
      ],
    });
    const link = joinURL('/checkout/pay', paymentLink.id);
    Config.creditPaymentLink = link;
    return joinURL(getPaymentKitPrefix(), link);
  }
}

// default credit payment link
export async function getCreditPaymentLink() {
  if (!isPaymentRunning()) return null;
  if (Config?.creditPaymentLink) {
    if (Config.creditPaymentLink.startsWith('/')) {
      return joinURL(getPaymentKitPrefix(), Config.creditPaymentLink);
    }
    return Config.creditPaymentLink;
  }
  // fallback to default payment link
  const link = await ensureDefaultCreditPaymentLink();
  if (!link) {
    logger.error('failed to ensure default credit payment link');
    throw new CustomError(404, 'Credit payment link not found');
  }
  return link;
}

export async function checkUserCreditBalance({ userDid }: { userDid: string }) {
  const { balance } = await getUserCredits({ userDid });
  if (balance === '0') {
    let link: string | null = null;
    try {
      link = await getCreditPaymentLink();
    } catch (err) {
      logger.error('failed to get credit payment link', { err });
    }
    throw new CreditError(402, CreditErrorType.NOT_ENOUGH, link ?? '');
  }
}

export async function getCreditGrants(params: {
  customer_id: string;
  page?: number;
  pageSize?: number;
  start?: number;
  end?: number;
}) {
  const meter = await ensureMeter();
  if (!meter) {
    return {
      count: 0,
      list: [],
    };
  }
  let customerId = params.customer_id;
  if (!params.customer_id.startsWith('cus_')) {
    const customer = await ensureCustomer(params.customer_id);
    customerId = customer.id;
  }
  return payment.creditGrants.list({
    ...params,
    customer_id: customerId,
    currency_id: meter.currency_id,
  });
}

export async function getCreditTransactions(params: {
  customer_id: string;
  page?: number;
  pageSize?: number;
  start?: number;
  end?: number;
}) {
  const meter = await ensureMeter();
  if (!meter) {
    return {
      count: 0,
      list: [],
    };
  }
  let customerId = params.customer_id;
  if (!params.customer_id.startsWith('cus_')) {
    const customer = await ensureCustomer(params.customer_id);
    customerId = customer.id;
  }
  return payment.creditTransactions.list({
    ...params,
    meter_id: meter.id,
    customer_id: customerId,
  });
}

// get active subscription of app
export async function getActiveSubscriptionOfApp({
  appId,
  description,
  status = ['active', 'trialing'],
}: {
  appId: string;
  description?: string;
  status?: Subscription['status'][];
}) {
  if (!isPaymentRunning()) return undefined;

  // @ts-ignore TODO: remove ts-ignore after upgrade @did-pay/client
  const subscription = (await payment.subscriptions.list({ 'metadata.appId': appId })).list.find(
    (i) =>
      status.includes(i.status) && i.items.some((j) => j.price.product.id === Config.pricing?.subscriptionProductId)
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
