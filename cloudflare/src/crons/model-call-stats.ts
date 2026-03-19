import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { modelCallStats, modelCalls } from '../db/schema';
import * as schema from '../db/schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Hourly aggregation of model_calls → model_call_stats.
 * Groups by userDid + appDid for the current hour bucket.
 */
export async function aggregateModelCallStats(db: DB) {
  const now = Math.floor(Date.now() / 1000);
  const hourBucket = now - (now % 3600); // Round down to hour
  const prevHourBucket = hourBucket - 3600;

  // Aggregate model_calls from the previous hour
  const results = await db
    .select({
      userDid: modelCalls.userDid,
      appDid: modelCalls.appDid,
      totalCalls: sql<number>`COUNT(*)`,
      successCalls: sql<number>`SUM(CASE WHEN ${modelCalls.status} = 'success' THEN 1 ELSE 0 END)`,
      totalUsage: sql<number>`COALESCE(SUM(${modelCalls.totalUsage}), 0)`,
      totalCredits: sql<string>`COALESCE(SUM(CAST(${modelCalls.credits} AS REAL)), 0)`,
      totalDuration: sql<string>`COALESCE(SUM(CAST(${modelCalls.duration} AS REAL)), 0)`,
    })
    .from(modelCalls)
    .where(and(gte(modelCalls.callTime, prevHourBucket), lt(modelCalls.callTime, hourBucket)))
    .groupBy(modelCalls.userDid, modelCalls.appDid);

  for (const row of results) {
    const stats = {
      totalUsage: row.totalUsage,
      totalCredits: parseFloat(row.totalCredits || '0'),
      totalCalls: row.totalCalls,
      successCalls: row.successCalls,
      totalDuration: parseFloat(row.totalDuration || '0'),
      avgDuration: row.totalCalls > 0 ? parseFloat(row.totalDuration || '0') / row.totalCalls : 0,
    };

    // Upsert: check if stat already exists for this bucket
    const existing = await db
      .select()
      .from(modelCallStats)
      .where(
        and(
          eq(modelCallStats.userDid, row.userDid || ''),
          eq(modelCallStats.appDid, row.appDid || ''),
          eq(modelCallStats.timestamp, prevHourBucket),
          eq(modelCallStats.timeType, 'hour')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(modelCallStats)
        .set({ stats: JSON.stringify(stats), updatedAt: new Date().toISOString() })
        .where(eq(modelCallStats.id, existing[0].id));
    } else {
      await db.insert(modelCallStats).values({
        userDid: row.userDid,
        appDid: row.appDid,
        timestamp: prevHourBucket,
        timeType: 'hour',
        stats: JSON.stringify(stats),
      });
    }
  }

  return { aggregated: results.length, bucket: prevHourBucket };
}
