/* eslint-disable no-console */
/**
 * Migration API routes
 * Provides manual migration endpoints for credit grants
 */
import { ENABLE_CREDIT_MIGRATION, NEW_METER_NAME, OLD_METER_NAME } from '@api/libs/env';
import { isPaymentRunning } from '@api/libs/payment';
import { ensureAdmin } from '@api/libs/security';
import { sequelize } from '@api/store/sequelize';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import BigNumber from 'bignumber.js';
import { Router } from 'express';

const router = Router();

interface GrantMigrationResult {
  grantId: string;
  customerId: string;
  oldAmount: string;
  newAmount: string;
  status: 'success' | 'skipped' | 'error';
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
  if (new BigNumber(remainingAmount).lte(0)) {
    return { grantId, customerId, oldAmount: remainingAmount, newAmount: '0', status: 'skipped' };
  }

  try {
    const oldDecimalPrecision = 10 ** oldDecimal;
    console.log(
      'grant-migration: conversionFactor',
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
    console.error(`grant-migration: Failed to migrate grant ${grantId}:`, error);
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'error', error: error.message };
  }
}

/**
 * POST /api/migration/grants
 * Migrate credit grants from old meter to new meter
 * Requires admin access and ENABLE_CREDIT_MIGRATION=true
 *
 * Query params:
 * - baseCreditPrice: string (optional, defaults to preferences.baseCreditPrice or '0.0000025')
 */
router.post('/grants', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    // Only run migration if explicitly enabled via environment variable
    if (!ENABLE_CREDIT_MIGRATION) {
      return res.status(400).json({
        error: 'Migration is not enabled (ENABLE_CREDIT_MIGRATION is not set to "true")',
      });
    }

    if (!isPaymentRunning()) {
      return res.status(400).json({ error: 'Payment is not running' });
    }

    // Get old meter
    let oldMeter = null;
    try {
      oldMeter = await payment.meters.retrieve(OLD_METER_NAME);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return res.status(400).json({ error: 'No old meter found (fresh install)' });
      }
      throw error;
    }

    if (!oldMeter) {
      return res.status(400).json({ error: 'No old meter found (fresh install)' });
    }

    // Get new meter (must exist)
    let newMeter = null;
    try {
      newMeter = await payment.meters.retrieve(NEW_METER_NAME);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return res.status(400).json({ error: 'New meter not found. Please run full migration first.' });
      }
      throw error;
    }

    if (!newMeter || newMeter.status !== 'active') {
      return res.status(400).json({ error: 'New meter is not active. Please run full migration first.' });
    }

    // Get baseCreditPrice from query or config
    const baseCreditPrice =
      (req.query.baseCreditPrice as string) || config.env.preferences.baseCreditPrice || '0.0000025';
    const conversionFactor = getConversionFactor(baseCreditPrice);

    console.log('grant-migration: Starting migration...');
    console.log('grant-migration: baseCreditPrice:', baseCreditPrice);
    console.log('grant-migration: conversionFactor:', conversionFactor.toString());

    const oldDecimal = (oldMeter as any).paymentCurrency?.decimal ?? 2;
    const newCurrencyId = newMeter.currency_id!;

    console.log('grant-migration: Old meter decimal:', oldDecimal);
    console.log('grant-migration: New currency ID:', newCurrencyId);

    const results: GrantMigrationResult[] = [];
    let page = 1;
    let totalGrants = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { list: grants = [], count = 0 } = await payment.creditGrants.list({
          currency_id: oldMeter.currency_id,
          page,
          pageSize: 100,
        });

        // Capture total from first page
        if (page === 1) {
          totalGrants = count;
          console.log('grant-migration: Total grants to process:', totalGrants);
        }

        for (const grant of grants) {
          // eslint-disable-next-line no-await-in-loop
          results.push(await migrateGrant(grant, newCurrencyId, oldDecimal, conversionFactor));
        }

        if (grants.length < 100) break;
        page++;

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
    const skipped = results.filter((r) => r.status === 'skipped');
    const errors = results.filter((r) => r.status === 'error');

    console.log(
      `✅ grant-migration: total ${totalGrants}, processed ${results.length}, migrated ${successful.length}, skipped ${skipped.length}, errors ${errors.length}`
    );

    return res.json({
      success: true,
      summary: {
        total: totalGrants,
        processed: results.length,
        migrated: successful.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      results,
    });
  } catch (error: any) {
    console.error('grant-migration: Failed:', error);
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

    let oldMeter = null;
    let newMeter = null;

    try {
      oldMeter = await payment.meters.retrieve(OLD_METER_NAME);
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error;
    }

    try {
      newMeter = await payment.meters.retrieve(NEW_METER_NAME);
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error;
    }

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
      migrationEnabled: ENABLE_CREDIT_MIGRATION,
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
    const { default: ModelCallStat } = await import('@api/store/models/model-call-stat');
    const records = Array.from(statsMap.values()).map((value) => ({
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

/**
 * POST /api/migration/rebuild-model-call-stats
 * Rebuild ModelCallStats cache
 * Requires admin access
 *
 * Query params:
 * - days: number (optional, defaults to 7)
 */
router.post('/rebuild-model-call-stats', sessionMiddleware(), ensureAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;

    await rebuildModelCallStats(days);

    return res.json({
      success: true,
      message: `Successfully rebuilt model call stats for the last ${days} days`,
    });
  } catch (error: any) {
    console.error('rebuild-model-call-stats: API call failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
