import { PaymentClient, ensureMeter } from './payment';
import { logger } from './logger';

/**
 * KV-based meter event buffer.
 *
 * Instead of calling Payment Kit on every AI request, we write a lightweight
 * KV entry and let a cron job flush them in batches — aggregated per user —
 * to reduce write pressure on Payment Kit.
 *
 * Key format:  meter-pending:{userDid}:{timestamp}-{random}
 * Value:       JSON { credits, model, requestId }
 */

const KV_PREFIX = 'meter-pending:';

interface PendingEvent {
  credits: number;
  model: string;
  requestId?: string;
}

/** Buffer a meter event into KV (called per AI request via waitUntil). */
export async function bufferMeterEvent(
  kv: KVNamespace,
  userDid: string,
  credits: number,
  meta: { model: string; requestId?: string }
): Promise<void> {
  if (credits <= 0) return;
  const key = `${KV_PREFIX}${userDid}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const value: PendingEvent = { credits, model: meta.model, requestId: meta.requestId };
  // TTL 1 hour — safety net so orphaned entries don't persist forever
  await kv.put(key, JSON.stringify(value), { expirationTtl: 3600 });
}

/** Flush all pending meter events, aggregated per user, to Payment Kit. */
export async function flushMeterEvents(
  kv: KVNamespace,
  payment: PaymentClient
): Promise<{ flushed: number; users: number; errors: number }> {
  const meter = await ensureMeter(payment);
  if (!meter) return { flushed: 0, users: 0, errors: 0 };

  // Collect all pending keys (paginate if > 1000)
  const entries: { key: string; userDid: string; event: PendingEvent }[] = [];
  let cursor: string | undefined;

  do {
    const list = await kv.list({ prefix: KV_PREFIX, cursor, limit: 1000 });
    for (const { name } of list.keys) {
      const raw = await kv.get(name);
      if (!raw) continue;
      try {
        const event = JSON.parse(raw) as PendingEvent;
        // Extract userDid from key: meter-pending:{userDid}:{ts}-{rand}
        const afterPrefix = name.slice(KV_PREFIX.length);
        const userDid = afterPrefix.slice(0, afterPrefix.lastIndexOf(':'));
        entries.push({ key: name, userDid, event });
      } catch {
        // Corrupted entry — delete it
        await kv.delete(name);
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  if (entries.length === 0) return { flushed: 0, users: 0, errors: 0 };

  // Aggregate by userDid
  const aggregated = new Map<string, { totalCredits: number; models: string[]; keys: string[] }>();
  for (const { key, userDid, event } of entries) {
    const existing = aggregated.get(userDid);
    if (existing) {
      existing.totalCredits += event.credits;
      if (!existing.models.includes(event.model)) existing.models.push(event.model);
      existing.keys.push(key);
    } else {
      aggregated.set(userDid, { totalCredits: event.credits, models: [event.model], keys: [key] });
    }
  }

  let errors = 0;

  // Send one meter event per user, then delete processed keys
  for (const [userDid, { totalCredits, models, keys }] of aggregated) {
    try {
      await payment.createMeterEvent({
        event_name: meter.event_name,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { customer_id: userDid, value: String(totalCredits) },
        identifier: `${userDid}-${meter.event_name}-batch-${Date.now()}`,
        metadata: { models: models.join(','), batchSize: keys.length },
      });
      // Delete processed keys
      await Promise.all(keys.map((k) => kv.delete(k)));
    } catch (err) {
      errors++;
      logger.error('Failed to flush meter events for user', {
        userDid,
        totalCredits,
        batchSize: keys.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Leave keys in KV for next cron retry (TTL is the safety net)
    }
  }

  const stats = { flushed: entries.length, users: aggregated.size, errors };
  if (entries.length > 0) {
    logger.info('Meter events flushed', stats as unknown as Record<string, unknown>);
  }
  return stats;
}
