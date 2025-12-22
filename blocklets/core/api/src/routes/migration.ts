/* eslint-disable no-console */
/**
 * Migration API routes
 * Provides manual migration endpoints for credit grants
 * Each migration step is a separate route for easy execution
 */
import {
  METER_UNIT,
  NEW_CREDIT_PAYMENT_LINK_KEY,
  NEW_CREDIT_PRICE_KEY,
  NEW_METER_NAME,
  OLD_CREDIT_PAYMENT_LINK_KEY,
  OLD_CREDIT_PRICE_KEY,
  OLD_METER_NAME,
} from '@api/libs/env';
import { isPaymentRunning } from '@api/libs/payment';
import { ensureAdmin } from '@api/libs/security';
import { sequelize } from '@api/store/sequelize';
import payment from '@blocklet/payment-js';
import { getComponentMountPoint } from '@blocklet/sdk';
import config from '@blocklet/sdk/lib/config';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { BlockletService } from '@blocklet/sdk/lib/service/blocklet';
import BigNumber from 'bignumber.js';
import { Router } from 'express';
import { joinURL } from 'ufo';

const router = Router();

const blockletService = new BlockletService();

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

// Time threshold in hours for migration (only migrate records older than this)
const MIGRATION_TIME_THRESHOLD_HOURS = Number(process.env.MIGRATION_TIME_THRESHOLD_HOURS) || 24;

interface GrantMigrationResult {
  grantId: string;
  customerId: string;
  oldAmount: string;
  newAmount: string;
  status: string;
  error?: string;
}

interface CreateMeterResult {
  meter: any;
  currencyId: string;
  paymentLinkId: string | null;
  productId: string | null;
  skipped: boolean;
}

interface MigrateGrantsResult {
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  errors: number;
}

interface MigrateTableResult {
  rowsUpdated: number;
}

interface UpdatePreferencesResult {
  success: boolean;
  preferences?: Record<string, any>;
  error?: string;
}

/**
 * Calculate conversion factor from baseCreditPrice
 * e.g., baseCreditPrice = 0.0000025 -> CONVERSION_FACTOR = 400000
 * baseCreditPrice = 1 -> CONVERSION_FACTOR = 1 (new system, no conversion needed)
 */
function getConversionFactor(baseCreditPrice: string): BigNumber {
  const price = new BigNumber(baseCreditPrice);
  if (price.lte(0)) {
    return new BigNumber(1); // fallback to no conversion
  }
  return new BigNumber(1).dividedBy(price);
}

function getPaymentKitPrefix() {
  return joinURL(config.env.appUrl, getComponentMountPoint(PAYMENT_DID));
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getOldMeter() {
  try {
    return await payment.meters.retrieve(OLD_METER_NAME);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function getNewMeter() {
  try {
    return await payment.meters.retrieve(NEW_METER_NAME);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function getPaymentLinkId(): Promise<string | null> {
  try {
    const paymentLink = await payment.paymentLinks.retrieve(NEW_CREDIT_PAYMENT_LINK_KEY);
    return paymentLink?.id || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Core Migration Functions
// ============================================================================

/**
 * Step 1: Create new meter and payment link (or return existing if already created)
 */
async function doCreateMeter(oldMeter: any): Promise<CreateMeterResult> {
  // Check if new meter already exists
  const existingMeter = await getNewMeter();
  if (existingMeter?.status === 'active') {
    console.log('create-meter: New meter already exists, returning existing');
    const paymentLinkId = await getPaymentLinkId();
    return {
      meter: existingMeter,
      currencyId: existingMeter.currency_id!,
      paymentLinkId,
      productId: null,
      skipped: true,
    };
  }

  console.log('create-meter: Creating new meter...');

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
      console.log('create-meter: New payment link:', paymentLink);

      await payment.paymentCurrencies.updateRechargeConfig(meter.currency_id!, {
        base_price_id: price.id,
        payment_link_id: paymentLink.id,
      });
    }
  } catch (error) {
    console.error('create-meter: Failed to create product/price/payment-link:', error);
  }

  console.log('✅ create-meter: Complete');
  return {
    meter,
    currencyId: meter.currency_id!,
    paymentLinkId: newPaymentLinkId,
    productId: newProductId,
    skipped: false,
  };
}

/**
 * Migrate a single grant
 */
async function migrateGrant(
  grant: any,
  newCurrencyId: string,
  oldDecimal: number,
  conversionFactor: BigNumber
): Promise<GrantMigrationResult> {
  const { id: grantId, customer_id: customerId, amount = '0', status: grantStatus } = grant;
  const remainingAmount = grant.remaining_amount || amount;

  // Skip non-active, already migrated, or zero balance grants
  if (grantStatus !== 'granted' && grantStatus !== 'pending') {
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  if (grant.metadata?.migratedTo) {
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  if (grant.metadata?.migratedFromGrantId) {
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  if (new BigNumber(remainingAmount).lte(0)) {
    return { grantId, customerId, oldAmount: remainingAmount, newAmount: '0', status: 'skipped' };
  }

  try {
    const oldDecimalPrecision = 10 ** oldDecimal;

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
    console.error(`grant-migration: Failed to migrate grant ${grantId}:`, error);
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'error', error: error.message };
  }
}

/**
 * Step 2: Migrate all grants from old meter to new meter
 */
async function doMigrateGrants(oldMeter: any, newMeter: any, baseCreditPrice: string): Promise<MigrateGrantsResult> {
  const conversionFactor = getConversionFactor(baseCreditPrice);

  console.log('grant-migration: Starting migration...');
  console.log('grant-migration: baseCreditPrice:', baseCreditPrice);
  console.log('grant-migration: conversionFactor:', conversionFactor.toString());

  const oldDecimal = (oldMeter as any).paymentCurrency?.decimal ?? 2;
  const newCurrencyId = newMeter.currency_id!;

  console.log('grant-migration: Old meter decimal:', oldDecimal);
  console.log('grant-migration: New currency ID:', newCurrencyId);

  const results: GrantMigrationResult[] = [];
  let totalGrants = 0;

  // Always use page=1 because after migration, grants are marked as expired
  // and the API may filter/sort by status, causing offset-based pagination to skip records
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { list: grants = [], count = 0 } = await payment.creditGrants.list({
        currency_id: oldMeter.currency_id,
        page: 1, // Always use page 1 - migrated grants will be filtered out by status
        pageSize: 100,
      });

      // Capture total from first iteration
      if (totalGrants === 0) {
        totalGrants = count;
        console.log('grant-migration: Total grants to process:', totalGrants);
      }

      if (grants.length === 0) {
        console.log('grant-migration: No more grants to process');
        break;
      }

      let batchSuccessCount = 0;

      for (const grant of grants) {
        // eslint-disable-next-line no-await-in-loop
        const result = await migrateGrant(grant, newCurrencyId, oldDecimal, conversionFactor);
        results.push(result);
        if (result.status === 'success') {
          batchSuccessCount++;
        }
      }

      // If no successful migrations in this batch, all remaining grants are either
      // already migrated (skip) or failed (error), so we're done
      if (batchSuccessCount === 0) {
        console.log('grant-migration: No successful migrations in this batch, stopping');
        break;
      }

      console.log(`grant-migration: Batch complete - ${batchSuccessCount} migrated, continuing...`);

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    } catch (error) {
      console.error('grant-migration: Failed to fetch credit grants:', error);
      break;
    }
  }

  const successful = results.filter((r) => r.status === 'success');
  const skipped = results.filter((r) => r.status.startsWith('skipped'));
  const errors = results.filter((r) => r.status === 'error');

  console.log(
    `✅ grant-migration: total ${totalGrants}, processed ${results.length}, migrated ${successful.length}, skipped ${skipped.length}, errors ${errors.length}`
  );

  return {
    total: totalGrants,
    processed: results.length,
    migrated: successful.length,
    skipped: skipped.length,
    errors: errors.length,
  };
}

/**
 * Step 3: Migrate AiModelRates.inputRate and outputRate
 */
async function doMigrateAiModelRates(baseCreditPrice: string): Promise<MigrateTableResult> {
  console.log('ai-model-rates-migration: Starting migration...');
  const conversionFactor = getConversionFactor(baseCreditPrice).toNumber();
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
  return { rowsUpdated: rowCount };
}

/**
 * Step 4: Migrate ModelCalls.credits
 */
async function doMigrateModelCallsCredits(baseCreditPrice: string): Promise<MigrateTableResult> {
  console.log('model-calls-credit-migration: Starting migration...');
  const conversionFactor = getConversionFactor(baseCreditPrice).toNumber();
  // Use credits > 1 as threshold to identify old system data (new system values are << 1)
  const whereClause = '"credits" > 1';

  const [countResult] = (await sequelize.query(`SELECT COUNT(*) as count FROM "ModelCalls" WHERE ${whereClause}`)) as [
    { count: string }[],
    unknown,
  ];
  const rowCount = Number(countResult[0]?.count ?? 0);

  await sequelize.query(`UPDATE "ModelCalls" SET "credits" = "credits" / ${conversionFactor}.0 WHERE ${whereClause}`);

  console.log(`✅ model-calls-credit-migration: Complete (${rowCount} rows updated)`);
  return { rowsUpdated: rowCount };
}

/**
 * Step 5: Migrate Usages.usedCredits
 */
async function doMigrateUsageCredits(baseCreditPrice: string): Promise<MigrateTableResult> {
  console.log('usage-credit-migration: Starting migration...');
  const conversionFactor = getConversionFactor(baseCreditPrice).toNumber();
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
  return { rowsUpdated: rowCount };
}

/**
 * Step 6: Rebuild ModelCallStats cache for active users
 * Process data month by month to handle large datasets
 */
export async function rebuildModelCallStats(): Promise<{ totalRecords: number; monthsProcessed: number }> {
  console.log('rebuild-model-call-stats: Starting...');

  try {
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    // Get the earliest callTime from ModelCalls
    const [minResult] = (await sequelize.query('SELECT MIN("callTime") as "minTime" FROM "ModelCalls"')) as [
      { minTime: number | null }[],
      unknown,
    ];

    const minTime = minResult[0]?.minTime;
    if (!minTime) {
      console.log('✅ rebuild-model-call-stats: No data found');
      return { totalRecords: 0, monthsProcessed: 0 };
    }

    // Calculate month boundaries
    const startDate = new Date(minTime * 1000);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setDate(1);
    endDate.setHours(0, 0, 0, 0);

    const { default: ModelCallStat } = await import('@api/store/models/model-call-stat');

    let totalRecords = 0;
    let monthsProcessed = 0;
    let currentMonth = new Date(startDate);

    // Process month by month
    while (currentMonth <= endDate) {
      const monthStart = Math.floor(currentMonth.getTime() / 1000);
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthEnd = Math.min(Math.floor(nextMonth.getTime() / 1000), currentHour);

      const monthLabel = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      console.log(`rebuild-model-call-stats: Processing ${monthLabel}...`);

      // Query data for this month
      // eslint-disable-next-line no-await-in-loop
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
        WHERE "callTime" >= :monthStart AND "callTime" < :monthEnd
        GROUP BY "userDid", ("callTime" / 3600) * 3600, "type"
      `,
        { replacements: { monthStart, monthEnd } }
      )) as [any[], unknown];

      if (rows.length > 0) {
        // Aggregate data by userDid + hourTimestamp
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

        // Delete existing stats for this month
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          'DELETE FROM "ModelCallStats" WHERE "timestamp" >= :monthStart AND "timestamp" < :monthEnd',
          { replacements: { monthStart, monthEnd } }
        );

        // Bulk insert stats for this month
        const records = Array.from(statsMap.values()).map((value) => ({
          userDid: value.userDid,
          timestamp: value.timestamp,
          timeType: 'hour' as const,
          stats: value.stats,
        }));

        // eslint-disable-next-line no-await-in-loop
        await ModelCallStat.bulkCreate(records);

        totalRecords += records.length;
        console.log(`rebuild-model-call-stats: ${monthLabel} - ${records.length} stats created`);
      } else {
        console.log(`rebuild-model-call-stats: ${monthLabel} - no data`);
      }

      monthsProcessed++;
      currentMonth = nextMonth;
    }

    console.log(
      `✅ rebuild-model-call-stats: Complete (${totalRecords} hourly stats created across ${monthsProcessed} months)`
    );
    return { totalRecords, monthsProcessed };
  } catch (error: any) {
    console.error('rebuild-model-call-stats: Failed:', error);
    throw error;
  }
}

/**
 * Step 7: Update preferences after migration
 */
async function doUpdatePreferences(paymentLinkId: string | null): Promise<UpdatePreferencesResult> {
  const prefsToUpdate: Record<string, any> = {
    baseCreditPrice: 1, // 1 USD = 1 credit
    creditPrefix: '$', // Update currency prefix
    newUserCreditGrantAmount: 1, // Set grant amount to 1
    basePricePerUnit: 1000, // Update base price per unit
  };
  if (paymentLinkId) {
    prefsToUpdate.creditPaymentLink = `${getPaymentKitPrefix()}/checkout/pay/${paymentLinkId}`;
  }

  console.log('update-preferences: Preferences to update:', prefsToUpdate);

  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds

  /* eslint-disable no-await-in-loop */
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`update-preferences: Updating preferences (attempt ${attempt}/${maxRetries})...`);
      await blockletService.updatePreferences(prefsToUpdate);
      console.log('✅ update-preferences: Preferences updated successfully');
      return { success: true, preferences: prefsToUpdate };
    } catch (error: any) {
      const isComponentNotFound = error?.message?.includes('component not found');
      if (isComponentNotFound && attempt < maxRetries) {
        console.log(`update-preferences: Component not ready, retrying in ${retryDelay / 1000}s...`);
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelay);
        });
      } else if (attempt === maxRetries) {
        console.error('update-preferences: Failed after max retries:', error);
        return { success: false, error: error.message };
      }
    }
  }
  /* eslint-enable no-await-in-loop */

  return { success: false, error: 'Failed after max retries' };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/migration/create-meter
 * Create new meter and payment link (or return existing if already created)
 */
router.post('/create-meter', sessionMiddleware(), ensureAdmin, async (_req, res) => {
  try {
    if (!isPaymentRunning()) {
      return res.status(400).json({ error: 'Payment is not running' });
    }

    const oldMeter = await getOldMeter();
    if (!oldMeter) {
      return res.status(400).json({ error: 'No old meter found (fresh install)' });
    }

    const result = await doCreateMeter(oldMeter);

    return res.json({
      success: true,
      skipped: result.skipped,
      meterId: result.meter.id,
      currencyId: result.currencyId,
      paymentLinkId: result.paymentLinkId,
      productId: result.productId,
    });
  } catch (error: any) {
    console.error('create-meter: Failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/grants
 * Migrate credit grants from old meter to new meter
 *
 * Body params:
 * - baseCreditPrice: string (required)
 */
router.post('/grants', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    if (!isPaymentRunning()) {
      return res.status(400).json({ error: 'Payment is not running' });
    }

    const oldMeter = await getOldMeter();
    if (!oldMeter) {
      return res.status(400).json({ error: 'No old meter found (fresh install)' });
    }

    const newMeter = await getNewMeter();
    if (!newMeter || newMeter.status !== 'active') {
      return res.status(400).json({ error: 'New meter is not active. Please run create-meter first.' });
    }

    const baseCreditPrice = req.body.baseCreditPrice as string;
    if (!baseCreditPrice) {
      return res.status(400).json({ error: 'baseCreditPrice is required in request body' });
    }

    const result = await doMigrateGrants(oldMeter, newMeter, baseCreditPrice);

    return res.json({
      success: true,
      summary: result,
    });
  } catch (error: any) {
    console.error('grant-migration: Failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/ai-model-rates
 * Migrate AiModelRates.inputRate and outputRate
 *
 * Body params:
 * - baseCreditPrice: string (required)
 */
router.post('/ai-model-rates', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    const baseCreditPrice = req.body.baseCreditPrice as string;
    if (!baseCreditPrice) {
      return res.status(400).json({ error: 'baseCreditPrice is required in request body' });
    }

    const result = await doMigrateAiModelRates(baseCreditPrice);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('ai-model-rates-migration: Failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/model-calls-credits
 * Migrate ModelCalls.credits
 *
 * Body params:
 * - baseCreditPrice: string (required)
 */
router.post('/model-calls-credits', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    const baseCreditPrice = req.body.baseCreditPrice as string;
    if (!baseCreditPrice) {
      return res.status(400).json({ error: 'baseCreditPrice is required in request body' });
    }

    const result = await doMigrateModelCallsCredits(baseCreditPrice);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('model-calls-credit-migration: Failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/usage-credits
 * Migrate Usages.usedCredits
 *
 * Body params:
 * - baseCreditPrice: string (required)
 */
router.post('/usage-credits', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    const baseCreditPrice = req.body.baseCreditPrice as string;
    if (!baseCreditPrice) {
      return res.status(400).json({ error: 'baseCreditPrice is required in request body' });
    }

    const result = await doMigrateUsageCredits(baseCreditPrice);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('usage-credit-migration: Failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/rebuild-model-call-stats
 * Rebuild ModelCallStats cache (processes all data month by month)
 */
router.post('/rebuild-model-call-stats', sessionMiddleware(), ensureAdmin, async (_req, res) => {
  try {
    const result = await rebuildModelCallStats();

    return res.json({
      success: true,
      message: `Successfully rebuilt model call stats: ${result.totalRecords} records across ${result.monthsProcessed} months`,
      ...result,
    });
  } catch (error: any) {
    console.error('rebuild-model-call-stats: API call failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/update-preferences
 * Update preferences after migration
 *
 * Body params:
 * - paymentLinkId: string (required) - The payment link ID from create-meter step
 */
router.post('/update-preferences', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    const { paymentLinkId } = req.body;
    if (!paymentLinkId) {
      return res.status(400).json({ error: 'paymentLinkId is required in request body' });
    }

    const result = await doUpdatePreferences(paymentLinkId);

    if (result.success) {
      return res.json(result);
    }
    return res.status(500).json({ error: result.error });
  } catch (error: any) {
    console.error('update-preferences: Failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/migration/status
 * Get migration status (meters info)
 */
router.get('/status', sessionMiddleware(), ensureAdmin, async (_req, res) => {
  try {
    if (!isPaymentRunning()) {
      return res.json({ paymentRunning: false });
    }

    const oldMeter = await getOldMeter();
    const newMeter = await getNewMeter();

    // Count unmigrated grants from old meter
    let totalGrantCount = 0;
    let unmigratedGrantCount = 0;
    if (oldMeter) {
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { list: grants = [], count = 0 } = await payment.creditGrants.list({
          currency_id: oldMeter.currency_id,
          page,
          pageSize: 100,
        });

        // Capture total from first page
        if (page === 1) {
          totalGrantCount = count;
        }

        for (const grant of grants) {
          const { status: grantStatus } = grant;
          const remainingAmount = grant.remaining_amount || grant.amount || '0';

          // Count grants that would be migrated
          if (
            (grantStatus === 'granted' || grantStatus === 'pending') &&
            !grant.metadata?.migratedTo &&
            !grant.metadata?.migratedFromGrantId &&
            new BigNumber(remainingAmount).gt(0)
          ) {
            unmigratedGrantCount++;
          }
        }

        if (grants.length < 100) break;
        page++;
      }
    }

    return res.json({
      paymentRunning: true,
      oldMeter: oldMeter
        ? {
            id: oldMeter.id,
            name: oldMeter.event_name,
            status: oldMeter.status,
            currencyId: oldMeter.currency_id,
            decimal: (oldMeter as any).paymentCurrency?.decimal,
          }
        : null,
      newMeter: newMeter
        ? {
            id: newMeter.id,
            name: newMeter.event_name,
            status: newMeter.status,
            currencyId: newMeter.currency_id,
            decimal: (newMeter as any).paymentCurrency?.decimal,
          }
        : null,
      totalGrantCount,
      unmigratedGrantCount,
      baseCreditPrice: config.env.preferences.baseCreditPrice,
    });
  } catch (error: any) {
    console.error('grant-migration: Failed to get status:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/migration/full
 * Run complete migration (all steps in sequence)
 *
 * Body params:
 * - baseCreditPrice: string (optional, defaults to current preference)
 *
 * Steps:
 * 1. Create new meter
 * 2. Migrate grants
 * 3. Migrate AiModelRates
 * 4. Migrate ModelCalls credits
 * 5. Migrate Usage credits
 * 6. Update preferences
 * 7. Rebuild ModelCallStats
 */
router.post('/full', sessionMiddleware(), ensureAdmin, async (req, res) => {
  const results: Record<string, any> = {};

  try {
    if (!isPaymentRunning()) {
      return res.status(400).json({ error: 'Payment is not running' });
    }

    // Get baseCreditPrice from body or use current preference
    const baseCreditPrice =
      (req.body.baseCreditPrice as string) || config.env.preferences.baseCreditPrice || '0.0000025';

    console.log('full-migration: Starting complete migration...');
    console.log('full-migration: baseCreditPrice:', baseCreditPrice);

    // Check if old meter exists
    const oldMeter = await getOldMeter();
    if (!oldMeter) {
      return res.status(400).json({ error: 'No old meter found (fresh install)' });
    }

    // Step 1: Create new meter (or return existing if already created)
    console.log('full-migration: Step 1 - Creating/getting new meter...');
    const meterResult = await doCreateMeter(oldMeter);
    results.createMeter = {
      skipped: meterResult.skipped,
      meterId: meterResult.meter.id,
      paymentLinkId: meterResult.paymentLinkId,
    };

    // Step 2: Migrate grants
    console.log('full-migration: Step 2 - Migrating grants...');
    results.grants = await doMigrateGrants(oldMeter, meterResult.meter, baseCreditPrice);

    // Step 3: Migrate AiModelRates
    console.log('full-migration: Step 3 - Migrating AiModelRates...');
    results.aiModelRates = await doMigrateAiModelRates(baseCreditPrice);

    // Step 4: Migrate ModelCalls credits
    console.log('full-migration: Step 4 - Migrating ModelCalls credits...');
    results.modelCallsCredits = await doMigrateModelCallsCredits(baseCreditPrice);

    // Step 5: Update preferences (before migrateUsageCredits, matching original order)
    console.log('full-migration: Step 5 - Updating preferences...');
    results.updatePreferences = await doUpdatePreferences(meterResult.paymentLinkId);

    // Step 6: Migrate Usage credits
    console.log('full-migration: Step 6 - Migrating Usage credits...');
    results.usageCredits = await doMigrateUsageCredits(baseCreditPrice);

    // Step 7: Rebuild ModelCallStats
    console.log('full-migration: Step 7 - Rebuilding ModelCallStats...');
    results.rebuildModelCallStats = await rebuildModelCallStats();

    console.log('✅ full-migration: All steps complete');
    return res.json({
      success: true,
      baseCreditPrice,
      conversionFactor: getConversionFactor(baseCreditPrice).toString(),
      results,
    });
  } catch (error: any) {
    console.error('full-migration: Failed:', error);
    return res.status(500).json({
      error: error.message,
      partialResults: results,
    });
  }
});

export default router;
