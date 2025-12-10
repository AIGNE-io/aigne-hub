/* eslint-disable no-console */
/**
 * Credit System Migration
 * Migrates from old system (1 USD = 400,000 credits) to new system (1 USD = 1 credit)
 */
import { BlockletStatus } from '@blocklet/constant';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
import BigNumber from 'bignumber.js';

import { DEFAULT_CREDIT_PAYMENT_LINK_KEY, DEFAULT_CREDIT_PRICE_KEY, METER_NAME, METER_UNIT } from '../libs/env';
import { sequelize } from '../store/sequelize';

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';
const CONVERSION_FACTOR = 400000;
const OLD_SYSTEM_DECIMAL_PRECISION = 100;
const OLD_METER_NAME = 'agent-hub-ai-meter';
const OLD_CREDIT_PRICE_KEY = 'DEFAULT_CREDIT_UNIT_PRICE';
const OLD_CREDIT_PAYMENT_LINK_KEY = 'DEFAULT_CREDIT_PAYMENT_LINK';

interface MigrationResult {
  grantId: string;
  customerId: string;
  oldAmount: string;
  newAmount: string;
  status: 'success' | 'skipped' | 'error';
  error?: string;
}

function isPaymentRunning() {
  return !!config.components.find((i) => i.did === PAYMENT_DID && i.status === BlockletStatus.running);
}

async function createMeter(oldMeter: any): Promise<{ meter: any; currencyId: string }> {
  console.log('credit-migration: Creating new meter...');

  const meter = await payment.meters.create({
    name: oldMeter.name || 'AIGNE Hub AI Meter',
    description: oldMeter.description || 'AIGNE Hub AI Meter',
    event_name: METER_NAME,
    unit: METER_UNIT,
    aggregation_method: 'sum',
    decimal: 10,
    metadata: { ...oldMeter.metadata },
  } as any);

  let oldPrice = null;
  let oldPaymentLink = null;
  try {
    oldPrice = await payment.prices.retrieve(OLD_CREDIT_PRICE_KEY);
  } catch {
    // Old price doesn't exist
  }
  try {
    oldPaymentLink = await payment.paymentLinks.retrieve(OLD_CREDIT_PAYMENT_LINK_KEY);
  } catch {
    // Old payment link doesn't exist
  }

  try {
    const paymentCurrencies = await payment.paymentCurrencies.list({});
    await payment.products.create({
      name: oldPrice?.product?.name || 'Basic AIGNE Hub Credit Packs',
      description: oldPrice?.product?.description || `It is a basic pack of ${METER_UNIT}`,
      type: 'credit',
      prices: [
        {
          type: 'one_time',
          unit_amount: '1',
          lookup_key: DEFAULT_CREDIT_PRICE_KEY,
          nickname: oldPrice?.nickname || 'Per Unit Credit For AIGNE Hub',
          currency_id: paymentCurrencies[0]!.id,
          // @ts-ignore
          currency_options: paymentCurrencies.map((currency) => ({
            currency_id: currency.id,
            unit_amount: '1',
          })),
          metadata: {
            credit_config: {
              priority: oldPrice?.metadata?.credit_config?.priority ?? 50,
              valid_duration_value: oldPrice?.metadata?.credit_config?.valid_duration_value ?? 0,
              valid_duration_unit: oldPrice?.metadata?.credit_config?.valid_duration_unit || 'days',
              currency_id: meter.currency_id,
              credit_amount: '1',
            },
            meter_id: meter.id,
          },
        },
      ],
    });

    const price = await payment.prices.retrieve(DEFAULT_CREDIT_PRICE_KEY);
    if (price) {
      const paymentLink = await payment.paymentLinks.create({
        name: oldPaymentLink?.name || price.product.name,
        // @ts-ignore
        lookup_key: DEFAULT_CREDIT_PAYMENT_LINK_KEY,
        line_items: [
          {
            price_id: price.id,
            quantity: 1,
            adjustable_quantity: { enabled: true, minimum: 1, maximum: 100000000 },
          },
        ],
        metadata: { ...oldPaymentLink?.metadata },
      });

      await payment.paymentCurrencies.updateRechargeConfig(meter.currency_id!, {
        base_price_id: price.id,
        payment_link_id: paymentLink.id,
      });
    }
  } catch (error) {
    console.error('credit-migration: Failed to create product/price/payment-link:', error);
  }

  return { meter, currencyId: meter.currency_id! };
}

async function migrateGrant(grant: any, newCurrencyId: string): Promise<MigrationResult> {
  const { id: grantId, customer_id: customerId, amount = '0', status: grantStatus } = grant;
  const remainingAmount = grant.remaining_amount || amount;

  // Skip non-active, already migrated, or zero balance grants
  if (grantStatus !== 'granted' && grantStatus !== 'pending') {
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  if (grant.metadata?.migratedTo) {
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  if (new BigNumber(remainingAmount).lte(0)) {
    return { grantId, customerId, oldAmount: remainingAmount, newAmount: '0', status: 'skipped' };
  }

  try {
    const newAmount = new BigNumber(remainingAmount)
      .dividedBy(OLD_SYSTEM_DECIMAL_PRECISION)
      .dividedBy(CONVERSION_FACTOR)
      .toFixed(10);

    const newGrant = await payment.creditGrants.create({
      customer_id: customerId,
      currency_id: newCurrencyId,
      amount: newAmount,
      name: `[Migrated] ${grant.name || 'Credit Grant'}`,
      expires_at: grant.expires_at || 0,
      category: grant.category || 'promotional',
      metadata: {
        ...grant.metadata,
        migratedFromGrantId: grantId,
        migratedAt: new Date().toISOString(),
        originalAmount: remainingAmount,
        conversionFactor: CONVERSION_FACTOR,
      },
    });

    // @ts-ignore
    await payment.creditGrants.update(grantId, {
      metadata: { migratedTo: newGrant.id },
      // @ts-ignore
      expired: true,
    });

    return { grantId, customerId, oldAmount: remainingAmount, newAmount, status: 'success' };
  } catch (error: any) {
    console.error(`Failed to migrate grant ${grantId}:`, error);
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'error', error: error.message };
  }
}

/**
 * Main migration entry point
 * Flow: runCreditMigration -> migrateAiModelRates -> migrateModelCallsCredits -> rebuildModelCallStats
 */
export async function runCreditMigration(): Promise<MigrationResult[]> {
  if (!isPaymentRunning()) {
    console.log('credit-migration: Payment is not running, skipping');
    return [];
  }

  let oldMeter = null;
  try {
    oldMeter = await payment.meters.retrieve(OLD_METER_NAME);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      console.log('credit-migration: No old meter found, skipping (fresh install)');
      return [];
    }
    throw error;
  }

  let newMeter = null;
  try {
    newMeter = await payment.meters.retrieve(METER_NAME);
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
  }

  if (newMeter?.status === 'active') {
    console.log('credit-migration: New meter already exists, skipping');
    return [];
  }

  console.log('credit-migration: Starting migration...');

  const { currencyId: newCurrencyId } = await createMeter(oldMeter);
  const results: MigrationResult[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { list: grants = [] } = await payment.creditGrants.list({
        currency_id: oldMeter.currency_id,
        page,
        pageSize: 100,
      });

      for (const grant of grants) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await migrateGrant(grant, newCurrencyId));
      }

      if (grants.length < 100) break;
      page++;

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    } catch (error) {
      console.error('Failed to fetch credit grants:', error);
      break;
    }
  }

  const successful = results.filter((r) => r.status === 'success');
  const errors = results.filter((r) => r.status === 'error');
  console.log(`✅ credit-migration: ${successful.length} migrated, ${errors.length} errors`);

  await migrateAiModelRates();
  await migrateModelCallsCredits();
  await rebuildModelCallStats();

  return results;
}

/**
 * Migrate AiModelRates.inputRate and outputRate (idempotent: only updates rates > 0.01)
 * Old system rates are much larger (e.g., 1.2), new system rates are very small (e.g., 0.000003)
 */
export async function migrateAiModelRates(): Promise<void> {
  try {
    console.log('ai-model-rates-migration: Starting migration...');
    // Only update rates > 0.01 to ensure idempotency
    // New system rates are typically very small (< 0.001), old system rates are much larger
    await sequelize.query(
      `UPDATE "AiModelRates" SET "inputRate" = "inputRate" / ${CONVERSION_FACTOR}.0, "outputRate" = "outputRate" / ${CONVERSION_FACTOR}.0 WHERE "inputRate" > 0.01 OR "outputRate" > 0.01`
    );
    console.log('✅ ai-model-rates-migration: Complete');
  } catch (error: any) {
    console.error('ai-model-rates-migration: Failed:', error);
    throw error;
  }
}

/**
 * Migrate ModelCalls.credits (idempotent: only updates credits > 10)
 */
export async function migrateModelCallsCredits(): Promise<void> {
  try {
    await sequelize.query(
      `UPDATE "ModelCalls" SET "credits" = "credits" / ${CONVERSION_FACTOR}.0 WHERE "credits" > 10`
    );
    console.log('✅ model-calls-credit-migration: Complete');
  } catch (error: any) {
    console.error('model-calls-credit-migration: Failed:', error);
    throw error;
  }
}

/**
 * Rebuild ModelCallStats cache for active users
 */
export async function rebuildModelCallStats(days = 7): Promise<void> {
  console.log(`rebuild-model-call-stats: Rebuilding ${days} days...`);

  try {
    await sequelize.query('DELETE FROM "ModelCallStats"');

    const [activeUsers] = (await sequelize.query(
      `
      SELECT DISTINCT "userDid" FROM "ModelCalls" WHERE "callTime" >= :since
    `,
      { replacements: { since: Math.floor(Date.now() / 1000) - days * 24 * 60 * 60 } }
    )) as [any[], any];

    const now = Math.floor(Date.now() / 1000);
    const currentHour = Math.floor(now / 3600) * 3600;
    const hours: number[] = [];
    for (let h = currentHour - days * 24 * 3600; h < currentHour; h += 3600) {
      hours.push(h);
    }

    const { default: ModelCallStat } = await import('../store/models/model-call-stat');

    for (const user of activeUsers) {
      for (const hour of hours) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await ModelCallStat.getHourlyStats(user.userDid, hour);
        } catch {
          console.error(
            `rebuild-model-call-stats: Failed to get hourly stats for user ${user.userDid} at hour ${hour}`
          );
          // Ignore
        }
      }
    }

    console.log(`✅ rebuild-model-call-stats: Complete (${activeUsers.length} users)`);
  } catch (error: any) {
    console.error('rebuild-model-call-stats: Failed:', error);
    throw error;
  }
}
