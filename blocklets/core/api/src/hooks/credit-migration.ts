/* eslint-disable no-console */
/**
 * Credit System Migration
 * Migrates from old system (1 USD = 400,000 credits) to new system (1 USD = 1 credit)
 */
import { BlockletStatus } from '@blocklet/constant';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
import BigNumber from 'bignumber.js';

import {
  ENABLE_CREDIT_MIGRATION,
  METER_UNIT,
  NEW_CREDIT_PAYMENT_LINK_KEY,
  NEW_CREDIT_PRICE_KEY,
  NEW_METER_NAME,
  OLD_CREDIT_PAYMENT_LINK_KEY,
  OLD_CREDIT_PRICE_KEY,
  OLD_METER_NAME,
} from '../libs/env';
import { sequelize } from '../store/sequelize';

// Time threshold in hours for migration (only migrate records older than this)
const MIGRATION_TIME_THRESHOLD_HOURS = Number(process.env.MIGRATION_TIME_THRESHOLD_HOURS) || 24;

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

/**
 * Calculate conversion factor from baseCreditPrice
 * e.g., baseCreditPrice = 0.0000025 -> CONVERSION_FACTOR = 400000
 * baseCreditPrice = 1 -> CONVERSION_FACTOR = 1 (new system, no conversion needed)
 */
function getConversionFactor(): BigNumber {
  const baseCreditPrice = new BigNumber(config.env.preferences.baseCreditPrice || 1);
  if (baseCreditPrice.lte(0)) {
    return new BigNumber(1); // fallback to no conversion
  }
  return new BigNumber(1).dividedBy(baseCreditPrice);
}

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
    name: 'AIGNE Hub Credits',
    description: oldMeter.description || 'AIGNE Hub Credits',
    event_name: NEW_METER_NAME,
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
      name: 'AIGNE Hub Credits',
      description: 'Purchase credits to use AI services in AIGNE Hub',
      type: 'credit',
      prices: [
        {
          type: 'one_time',
          unit_amount: '1',
          lookup_key: NEW_CREDIT_PRICE_KEY,
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

    const price = await payment.prices.retrieve(NEW_CREDIT_PRICE_KEY);
    if (price) {
      const paymentLink = await payment.paymentLinks.create({
        name: oldPaymentLink?.name || price.product.name,
        // @ts-ignore
        lookup_key: NEW_CREDIT_PAYMENT_LINK_KEY,
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

async function migrateGrant(grant: any, newCurrencyId: string, oldDecimal: number): Promise<MigrationResult> {
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
    const conversionFactor = getConversionFactor();
    const oldDecimalPrecision = 10 ** oldDecimal;
    console.log(
      'conversionFactor',
      conversionFactor.toString(),
      'oldDecimal',
      oldDecimal,
      'oldDecimalPrecision',
      oldDecimalPrecision
    );
    const newAmount = new BigNumber(remainingAmount)
      .dividedBy(oldDecimalPrecision)
      .dividedBy(conversionFactor)
      .toFixed(10);

    const newGrant = await payment.creditGrants.create({
      customer_id: customerId,
      currency_id: newCurrencyId,
      amount: newAmount,
      name: `[Migrated] ${grant.name || 'Credit Grant'}`,
      expires_at: grant.expires_at || 0,
      effective_at: grant.effective_at || 0,
      category: grant.category || 'promotional',
      priority: grant.priority,
      applicability_config: grant.applicability_config,
      metadata: {
        ...grant.metadata,
        migratedFromGrantId: grantId,
        migratedAt: new Date().toISOString(),
        originalAmount: remainingAmount,
        conversionFactor: conversionFactor.toString(),
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
  // Only run migration if explicitly enabled via environment variable
  if (!ENABLE_CREDIT_MIGRATION) {
    console.log('credit-migration: Migration is not enabled (ENABLE_CREDIT_MIGRATION is not set to "true"), skipping');
    return [];
  }

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

  if (!oldMeter) {
    console.log('credit-migration: No old meter found, skipping (fresh install)');
    return [];
  }

  let newMeter = null;
  try {
    newMeter = await payment.meters.retrieve(NEW_METER_NAME);
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
  }

  if (newMeter?.status === 'active') {
    console.log('credit-migration: New meter already exists, skipping');
    return [];
  }

  console.log('credit-migration: Starting migration...');

  const { currencyId: newCurrencyId } = await createMeter(oldMeter);
  const oldDecimal = (oldMeter as any).paymentCurrency?.decimal ?? 2;
  console.log('credit-migration: Old meter decimal:', oldDecimal);
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
        results.push(await migrateGrant(grant, newCurrencyId, oldDecimal));
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
 * Migrate AiModelRates.inputRate and outputRate (idempotent via updatedAt + rate threshold)
 * Only migrates records updated > 1 day ago with non-zero rates.
 * Time condition ensures new data won't be re-processed even if migration runs multiple times.
 * Only runs if ENABLE_CREDIT_MIGRATION is set to "true".
 */
export async function migrateAiModelRates(): Promise<void> {
  if (!ENABLE_CREDIT_MIGRATION) {
    console.log('ai-model-rates-migration: Migration is not enabled, skipping');
    return;
  }

  try {
    console.log('ai-model-rates-migration: Starting migration...');
    const conversionFactor = getConversionFactor().toNumber();
    const timeThreshold = new Date(Date.now() - MIGRATION_TIME_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
    const whereClause = '"updatedAt" < :timeThreshold AND ("inputRate" > 0.001 OR "outputRate" > 0.001)';

    const [countResult] = (await sequelize.query(`SELECT COUNT(*) as count FROM "AiModelRates" WHERE ${whereClause}`, {
      replacements: { timeThreshold },
    })) as [{ count: string }[], unknown];
    const rowCount = Number(countResult[0]?.count ?? 0);

    await sequelize.query(
      `UPDATE "AiModelRates" SET "inputRate" = "inputRate" / ${conversionFactor}.0, "outputRate" = "outputRate" / ${conversionFactor}.0 WHERE ${whereClause}`,
      { replacements: { timeThreshold } }
    );
    console.log(`✅ ai-model-rates-migration: Complete (${rowCount} rows updated)`);
  } catch (error: any) {
    console.error('ai-model-rates-migration: Failed:', error);
    throw error;
  }
}

/**
 * Migrate ModelCalls.credits (idempotent via updatedAt + credits threshold)
 * Only migrates records updated > 1 day ago with non-zero credits.
 * Time condition ensures new data won't be re-processed even if migration runs multiple times.
 * Only runs if ENABLE_CREDIT_MIGRATION is set to "true".
 */
export async function migrateModelCallsCredits(): Promise<void> {
  if (!ENABLE_CREDIT_MIGRATION) {
    console.log('model-calls-credit-migration: Migration is not enabled, skipping');
    return;
  }

  try {
    console.log('model-calls-credit-migration: Starting migration...');
    const conversionFactor = getConversionFactor().toNumber();
    const timeThreshold = new Date(Date.now() - MIGRATION_TIME_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
    const whereClause = '"updatedAt" < :timeThreshold AND "credits" > 0.001';

    const [countResult] = (await sequelize.query(`SELECT COUNT(*) as count FROM "ModelCalls" WHERE ${whereClause}`, {
      replacements: { timeThreshold },
    })) as [{ count: string }[], unknown];
    const rowCount = Number(countResult[0]?.count ?? 0);

    await sequelize.query(
      `UPDATE "ModelCalls" SET "credits" = "credits" / ${conversionFactor}.0 WHERE ${whereClause}`,
      { replacements: { timeThreshold } }
    );
    console.log(`✅ model-calls-credit-migration: Complete (${rowCount} rows updated)`);
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
