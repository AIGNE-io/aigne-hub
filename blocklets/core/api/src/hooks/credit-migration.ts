/* eslint-disable no-console */
/**
 * Credit System Migration
 * Migrates from old system (1 USD = 400,000 credits) to new system (1 USD = 1 credit)
 */
import { BlockletStatus } from '@blocklet/constant';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
import { BlockletService } from '@blocklet/sdk/lib/service/blocklet';
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

const blockletService = new BlockletService();

// Time threshold in hours for migration (only migrate records older than this)
const MIGRATION_TIME_THRESHOLD_HOURS = Number(process.env.MIGRATION_TIME_THRESHOLD_HOURS) || 24;

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

// Store baseCreditPrice before migration starts to ensure consistent conversion throughout the process
let baseCreditPriceBeforeMigration: string | null = null;

/**
 * Calculate conversion factor from baseCreditPrice
 * e.g., baseCreditPrice = 0.0000025 -> CONVERSION_FACTOR = 400000
 * baseCreditPrice = 1 -> CONVERSION_FACTOR = 1 (new system, no conversion needed)
 */
function getConversionFactor(): BigNumber {
  const baseCreditPrice = new BigNumber(baseCreditPriceBeforeMigration ?? config.env.preferences.baseCreditPrice ?? 1);
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

async function createMeter(oldMeter: any): Promise<{
  meter: any;
  currencyId: string;
  paymentLinkId: string | null;
  productId: string | null;
}> {
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

  let newPaymentLinkId: string | null = null;
  let newProductId: string | null = null;

  try {
    const paymentCurrencies = await payment.paymentCurrencies.list({});
    const product = await payment.products.create({
      name: 'AIGNE Hub Credits',
      description: 'Purchase credits to use AI services in AIGNE Hub',
      type: 'credit',
      prices: [
        {
          type: 'one_time',
          unit_amount: '0.5',
          lookup_key: NEW_CREDIT_PRICE_KEY,
          nickname: oldPrice?.nickname || 'Per Unit Credit For AIGNE Hub',
          currency_id: paymentCurrencies[0]!.id,
          // @ts-ignore
          currency_options: paymentCurrencies.map((currency) => ({
            currency_id: currency.id,
            unit_amount: '0.5',
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

    newProductId = product?.id || null;

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

      newPaymentLinkId = paymentLink?.id || null;
      console.log('credit-migration: New payment link:', paymentLink);

      await payment.paymentCurrencies.updateRechargeConfig(meter.currency_id!, {
        base_price_id: price.id,
        payment_link_id: paymentLink.id,
      });
    }
  } catch (error) {
    console.error('credit-migration: Failed to create product/price/payment-link:', error);
  }

  return { meter, currencyId: meter.currency_id!, paymentLinkId: newPaymentLinkId, productId: newProductId };
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
 * Flow: runCreditMigration -> migrateAiModelRates -> migrateModelCallsCredits -> migrateUsageCredits -> rebuildModelCallStats
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

  // Get current baseCreditPrice before migration and store it in module variable
  baseCreditPriceBeforeMigration = config.env.preferences.baseCreditPrice || '0.0000025';
  console.log('credit-migration: Current baseCreditPrice:', baseCreditPriceBeforeMigration);

  const { currencyId: newCurrencyId, paymentLinkId } = await createMeter(oldMeter);
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
  await migrateUsageCredits();
  await rebuildModelCallStats();

  // Update preferences after migration with retry
  const prefsToUpdate: Record<string, any> = {
    baseCreditPrice: 1, // 1 USD = 1 credit
    creditPrefix: '$', // Update currency prefix
    newUserCreditGrantAmount: 1, // Set grant amount to 1
    basePricePerUnit: 1000, // Update base price per unit
    creditPaymentLink: `${config.env.appUrl}/checkout/pay/${paymentLinkId}`,
  };

  console.log('credit-migration: Preferences to update:', prefsToUpdate);

  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds

  /* eslint-disable no-await-in-loop */
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`credit-migration: Updating preferences (attempt ${attempt}/${maxRetries})...`);
      const updateResult = await blockletService.updatePreferences(prefsToUpdate);
      console.log('credit-migration: Preferences updated successfully:', updateResult);
      break;
    } catch (error: any) {
      const isComponentNotFound = error?.message?.includes('component not found');
      if (isComponentNotFound && attempt < maxRetries) {
        console.log(`credit-migration: Component not ready, retrying in ${retryDelay / 1000}s...`);
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelay);
        });
      } else {
        console.error('credit-migration: Failed to update preferences:', error);
        // Don't throw - migration can still be considered successful
        break;
      }
    }
  }
  /* eslint-enable no-await-in-loop */

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
 * Migrate ModelCalls.credits (idempotent via credits value threshold)
 * Only migrates records with credits > 1 (old system values are much larger than new system).
 * Old system: 1 USD = 400,000 credits, so even small calls have credits >> 1
 * New system: 1 USD = 1 credit, so calls typically have credits < 0.1
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
    // Use credits > 1 as threshold to identify old system data (new system values are << 1)
    const whereClause = '"credits" > 1';

    const [countResult] = (await sequelize.query(
      `SELECT COUNT(*) as count FROM "ModelCalls" WHERE ${whereClause}`
    )) as [{ count: string }[], unknown];
    const rowCount = Number(countResult[0]?.count ?? 0);

    await sequelize.query(`UPDATE "ModelCalls" SET "credits" = "credits" / ${conversionFactor}.0 WHERE ${whereClause}`);
    console.log(`✅ model-calls-credit-migration: Complete (${rowCount} rows updated)`);
  } catch (error: any) {
    console.error('model-calls-credit-migration: Failed:', error);
    throw error;
  }
}

/**
 * Migrate Usage.usedCredits (idempotent via usedCredits value threshold)
 * Only migrates records with usedCredits > 1 (old system values are much larger than new system).
 * Old system: 1 USD = 400,000 credits, so even small calls have usedCredits >> 1
 * New system: 1 USD = 1 credit, so calls typically have usedCredits < 0.1
 * Only runs if ENABLE_CREDIT_MIGRATION is set to "true".
 */
export async function migrateUsageCredits(): Promise<void> {
  if (!ENABLE_CREDIT_MIGRATION) {
    console.log('usage-credit-migration: Migration is not enabled, skipping');
    return;
  }

  try {
    console.log('usage-credit-migration: Starting migration...');
    const conversionFactor = getConversionFactor().toNumber();
    // Use usedCredits > 1 as threshold to identify old system data (new system values are << 1)
    const whereClause = '"usedCredits" > 1';

    const [countResult] = (await sequelize.query(`SELECT COUNT(*) as count FROM "Usages" WHERE ${whereClause}`)) as [
      { count: string }[],
      unknown,
    ];
    const rowCount = Number(countResult[0]?.count ?? 0);

    await sequelize.query(
      `UPDATE "Usages" SET "usedCredits" = "usedCredits" / ${conversionFactor}.0 WHERE ${whereClause}`
    );
    console.log(`✅ usage-credit-migration: Complete (${rowCount} rows updated)`);
  } catch (error: any) {
    console.error('usage-credit-migration: Failed:', error);
    throw error;
  }
}

/**
 * Rebuild ModelCallStats cache for active users
 * Optimized version: single SQL aggregation query + bulk insert
 */
export async function rebuildModelCallStats(days = 7): Promise<void> {
  console.log(`rebuild-model-call-stats: Rebuilding ${days} days...`);

  try {
    const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    // Single query to aggregate all stats by userDid, hour, and type
    const [rows] = (await sequelize.query(
      `
      SELECT 
        "userDid",
        ("callTime" / 3600) * 3600 as "hourTimestamp",
        "type",
        COALESCE(SUM("totalUsage"), 0) as "totalUsage",
        COALESCE(SUM("credits"), 0) as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
      FROM "ModelCalls"
      WHERE "callTime" >= :since AND ("callTime" / 3600) * 3600 < :currentHour
      GROUP BY "userDid", ("callTime" / 3600) * 3600, "type"
    `,
      { replacements: { since, currentHour } }
    )) as [any[], unknown];

    if (rows.length === 0) {
      console.log('✅ rebuild-model-call-stats: Complete (0 hourly stats created)');
      return;
    }

    // Aggregate data by userDid + hourTimestamp to build stats objects
    const statsMap = new Map<string, { userDid: string; timestamp: number; stats: any }>();

    for (const row of rows) {
      const key = `${row.userDid}-${row.hourTimestamp}`;

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          userDid: row.userDid,
          timestamp: row.hourTimestamp,
          stats: { totalUsage: 0, totalCredits: 0, totalCalls: 0, successCalls: 0, byType: {} },
        });
      }

      const entry = statsMap.get(key)!;
      entry.stats.totalUsage += Number(row.totalUsage);
      entry.stats.totalCredits += Number(row.totalCredits);
      entry.stats.totalCalls += Number(row.totalCalls);
      entry.stats.successCalls += Number(row.successCalls);
      entry.stats.byType[row.type] = {
        totalUsage: Number(row.totalUsage),
        totalCredits: Number(row.totalCredits),
        totalCalls: Number(row.totalCalls),
        successCalls: Number(row.successCalls),
      };
    }

    // Only delete stats within the time range we're going to rebuild
    await sequelize.query('DELETE FROM "ModelCallStats" WHERE "timestamp" >= :since AND "timestamp" < :currentHour', {
      replacements: { since, currentHour },
    });

    // Bulk insert all stats records
    const { default: ModelCallStat } = await import('../store/models/model-call-stat');
    const records = Array.from(statsMap.entries()).map(([key, value]) => ({
      id: key,
      userDid: value.userDid,
      timestamp: value.timestamp,
      timeType: 'hour' as const,
      stats: value.stats,
    }));

    await ModelCallStat.bulkCreate(records);

    console.log(`✅ rebuild-model-call-stats: Complete (${records.length} hourly stats created)`);
  } catch (error: any) {
    console.error('rebuild-model-call-stats: Failed:', error);
    throw error;
  }
}
