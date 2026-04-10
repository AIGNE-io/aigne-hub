import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { modelCalls } from '../db/schema';
import * as schema from '../db/schema';
import { logger } from './logger';
import { PaymentClient, ensureMeter } from './payment';

type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

/**
 * D1-based meter event flush.
 *
 * Zero per-request overhead: piggybacks on the existing ModelCalls insert.
 * Cron queries unreported successful calls, aggregates by user,
 * sends one meter event per user to Payment Kit, then marks rows as reported.
 */
const BATCH_LIMIT = 1000;

export async function flushMeterEvents(
  db: DB,
  payment: PaymentClient
): Promise<{ flushed: number; users: number; errors: number }> {
  const meter = await ensureMeter(payment);
  if (!meter) return { flushed: 0, users: 0, errors: 0 };

  // Fetch unreported successful calls with positive credits
  const rows = await db
    .select({
      id: modelCalls.id,
      userDid: modelCalls.userDid,
      credits: modelCalls.credits,
      model: modelCalls.model,
    })
    .from(modelCalls)
    .where(
      and(
        eq(modelCalls.meterReported, false),
        eq(modelCalls.status, 'success'),
        sql`CAST(${modelCalls.credits} AS REAL) > 0`,
        isNotNull(modelCalls.userDid)
      )
    )
    .limit(BATCH_LIMIT);

  if (rows.length === 0) return { flushed: 0, users: 0, errors: 0 };

  // Aggregate by userDid
  const aggregated = new Map<string, { totalCredits: number; models: Set<string>; ids: string[] }>();
  for (const row of rows) {
    if (!row.userDid) continue;
    const credits = parseFloat(row.credits);
    if (!(credits > 0)) continue;
    const existing = aggregated.get(row.userDid);
    if (existing) {
      existing.totalCredits += credits;
      existing.models.add(row.model);
      existing.ids.push(row.id);
    } else {
      aggregated.set(row.userDid, {
        totalCredits: credits,
        models: new Set([row.model]),
        ids: [row.id],
      });
    }
  }

  let errors = 0;
  let flushed = 0;

  for (const [userDid, { totalCredits, models, ids }] of aggregated) {
    try {
      await payment.createMeterEvent({
        event_name: meter.event_name,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { customer_id: userDid, value: String(totalCredits) },
        identifier: `${userDid}-${meter.event_name}-batch-${Date.now()}`,
        metadata: { models: Array.from(models).join(','), batchSize: ids.length },
      });

      // Mark processed rows as reported
      await db.update(modelCalls).set({ meterReported: true }).where(inArray(modelCalls.id, ids));

      flushed += ids.length;
    } catch (err) {
      errors++;
      logger.error('Failed to flush meter events for user', {
        userDid,
        totalCredits,
        batchSize: ids.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Leave rows unreported — will retry on next cron
    }
  }

  const stats = { flushed, users: aggregated.size, errors };
  if (flushed > 0) {
    logger.info('Meter events flushed', stats as unknown as Record<string, unknown>);
  }
  return stats;
}

/** Count pending unreported rows (for debug endpoint). */
export async function countPendingMeters(db: DB): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(modelCalls)
    .where(
      and(
        eq(modelCalls.meterReported, false),
        eq(modelCalls.status, 'success'),
        sql`CAST(${modelCalls.credits} AS REAL) > 0`,
        isNotNull(modelCalls.userDid)
      )
    );
  return result?.count || 0;
}
