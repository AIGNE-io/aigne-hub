import { and, gte, lt, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { modelCalls } from '../db/schema';
import * as schema from '../db/schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Hourly aggregation of model_calls → model_call_stats.
 * Groups by userDid + appDid for the previous hour bucket.
 * Uses INSERT ... ON CONFLICT upsert (requires unique index from 0003_add_indexes.sql).
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

  // Upsert each aggregation row using ON CONFLICT (single SQL per row, no SELECT needed)
  const nowIso = new Date().toISOString();
  for (const row of results) {
    const stats = JSON.stringify({
      totalUsage: row.totalUsage,
      totalCredits: parseFloat(row.totalCredits || '0'),
      totalCalls: row.totalCalls,
      successCalls: row.successCalls,
      totalDuration: parseFloat(row.totalDuration || '0'),
      avgDuration: row.totalCalls > 0 ? parseFloat(row.totalDuration || '0') / row.totalCalls : 0,
    });

    const userDid = row.userDid || '';
    const appDid = row.appDid || '';

    await db.run(sql`
      INSERT INTO ModelCallStats (id, userDid, appDid, timestamp, timeType, stats, createdAt, updatedAt)
      VALUES (${crypto.randomUUID()}, ${userDid}, ${appDid}, ${prevHourBucket}, 'hour', ${stats}, ${nowIso}, ${nowIso})
      ON CONFLICT (userDid, appDid, timestamp, timeType)
      DO UPDATE SET stats = excluded.stats, updatedAt = excluded.updatedAt
    `);
  }

  return { aggregated: results.length, bucket: prevHourBucket };
}
