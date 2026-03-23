import { eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { aiModelStatuses, aiProviders } from '../db/schema';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

// GET /api/events - SSE stream for real-time model status updates
routes.get('/events', async (c) => {
  return streamSSE(c, async (stream) => {
    const db = c.get('db');

    // Send initial status snapshot
    const statuses = await db
      .select({
        providerId: aiModelStatuses.providerId,
        model: aiModelStatuses.model,
        type: aiModelStatuses.type,
        available: aiModelStatuses.available,
        error: aiModelStatuses.error,
        responseTime: aiModelStatuses.responseTime,
        lastChecked: aiModelStatuses.lastChecked,
        providerName: aiProviders.name,
      })
      .from(aiModelStatuses)
      .leftJoin(aiProviders, eq(aiModelStatuses.providerId, aiProviders.id));

    for (const status of statuses) {
      await stream.writeSSE({
        event: 'model.status.updated',
        data: JSON.stringify({
          provider: status.providerName,
          model: status.model,
          type: status.type,
          available: status.available,
          error: status.error,
        }),
      });
    }

    // Keep connection alive with periodic heartbeats + poll for DB changes
    let alive = true;
    stream.onAbort(() => {
      alive = false;
    });

    const POLL_INTERVAL = 3000; // 3s — check for new status updates
    const startTime = Date.now();
    const MAX_DURATION = 25000; // 25s (before 30s Worker limit)
    let lastPoll = new Date().toISOString();

    while (alive && Date.now() - startTime < MAX_DURATION) {
      await new Promise((resolve) => {
        setTimeout(resolve, POLL_INTERVAL);
      });
      if (!alive) break;

      // Poll for status changes since last check
      const updated = await db
        .select({
          model: aiModelStatuses.model,
          type: aiModelStatuses.type,
          available: aiModelStatuses.available,
          error: aiModelStatuses.error,
          updatedAt: aiModelStatuses.updatedAt,
          providerName: aiProviders.name,
        })
        .from(aiModelStatuses)
        .leftJoin(aiProviders, eq(aiModelStatuses.providerId, aiProviders.id))
        .where(gt(aiModelStatuses.updatedAt, lastPoll));

      for (const status of updated) {
        await stream.writeSSE({
          event: 'model.status.updated',
          data: JSON.stringify({
            provider: status.providerName,
            model: status.model,
            type: status.type,
            available: status.available,
            error: status.error,
          }),
        });
      }

      lastPoll = new Date().toISOString();

      // Send heartbeat
      await stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ time: Date.now() }) });
    }
  });
});

export default routes;
