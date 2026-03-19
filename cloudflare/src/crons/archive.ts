import { lt, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { archiveExecutionLogs, modelCalls } from '../db/schema';
import * as schema from '../db/schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;

const RETENTION_DAYS = 90;

/**
 * Archive old model_calls records beyond retention period.
 * Deletes records older than RETENTION_DAYS days.
 */
export async function archiveOldRecords(db: DB) {
  const startTime = Date.now();
  const cutoffTime = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 24 * 60 * 60;

  try {
    // Count records to archive
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(modelCalls)
      .where(lt(modelCalls.callTime, cutoffTime));

    const count = countResult?.count || 0;

    if (count === 0) {
      return { archived: 0, message: 'No records to archive' };
    }

    // Delete in batches of 1000
    let totalDeleted = 0;
    const batchSize = 1000;

    while (totalDeleted < count) {
      const idsToDelete = await db
        .select({ id: modelCalls.id })
        .from(modelCalls)
        .where(lt(modelCalls.callTime, cutoffTime))
        .limit(batchSize);

      if (idsToDelete.length === 0) break;

      for (const { id } of idsToDelete) {
        await db.delete(modelCalls).where(sql`${modelCalls.id} = ${id}`);
      }
      totalDeleted += idsToDelete.length;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    // Log execution
    await db.insert(archiveExecutionLogs).values({
      tableName: 'ModelCalls',
      status: 'success',
      archivedCount: totalDeleted,
      dataRangeEnd: cutoffTime,
      duration,
    });

    return { archived: totalDeleted, cutoffTime, duration };
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(3);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await db.insert(archiveExecutionLogs).values({
      tableName: 'ModelCalls',
      status: 'failed',
      archivedCount: 0,
      duration,
      errorMessage,
    });

    throw err;
  }
}
