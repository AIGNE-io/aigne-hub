/**
 * KV-based retry queue for failed D1 writes.
 * When a waitUntil DB write fails, the payload is stored in KV.
 * A cron job periodically retries these failed writes.
 */

import { logger } from './logger';

export interface FailedWrite {
  table: string;
  operation: 'insert';
  values: Record<string, unknown>;
  failedAt: string;
  retryCount: number;
  lastError: string;
}

const KV_PREFIX = 'failed:';
const MAX_RETRIES = 5;

/**
 * Store a failed write in KV for later retry.
 */
export async function enqueueFailedWrite(
  kv: KVNamespace,
  entry: Omit<FailedWrite, 'failedAt' | 'retryCount'>
): Promise<void> {
  const id = crypto.randomUUID();
  const record: FailedWrite = {
    ...entry,
    failedAt: new Date().toISOString(),
    retryCount: 0,
  };
  // TTL: 7 days
  await kv.put(`${KV_PREFIX}${id}`, JSON.stringify(record), { expirationTtl: 7 * 24 * 3600 });
}

/**
 * Process all failed writes in the retry queue.
 * Called by cron trigger.
 */
export async function processRetryQueue(
  kv: KVNamespace,
  d1: D1Database
): Promise<{ processed: number; succeeded: number; failed: number; abandoned: number }> {
  const stats = { processed: 0, succeeded: 0, failed: 0, abandoned: 0 };

  // List all failed writes
  const list = await kv.list({ prefix: KV_PREFIX });

  for (const key of list.keys) {
    stats.processed++;
    const raw = await kv.get(key.name);
    if (!raw) {
      await kv.delete(key.name);
      continue;
    }

    let entry: FailedWrite;
    try {
      entry = JSON.parse(raw);
    } catch {
      await kv.delete(key.name);
      continue;
    }

    if (entry.retryCount >= MAX_RETRIES) {
      logger.error(`Abandoning failed write after ${MAX_RETRIES} retries`, { table: entry.table, lastError: entry.lastError });
      await kv.delete(key.name);
      stats.abandoned++;
      continue;
    }

    try {
      await retryWrite(entry, d1);
      await kv.delete(key.name);
      stats.succeeded++;
    } catch (err) {
      entry.retryCount++;
      entry.lastError = err instanceof Error ? err.message : String(err);
      await kv.put(key.name, JSON.stringify(entry), { expirationTtl: 7 * 24 * 3600 });
      stats.failed++;
    }
  }

  return stats;
}

/**
 * Retry a single failed write using D1 directly.
 * Uses INSERT OR IGNORE to prevent duplicates on retry.
 */
async function retryWrite(entry: FailedWrite, d1: D1Database): Promise<void> {
  const columns = Object.keys(entry.values);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((col) => {
    const v = entry.values[col];
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
  });

  const sql = `INSERT OR IGNORE INTO "${entry.table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
  await d1.prepare(sql).bind(...values).run();
}
