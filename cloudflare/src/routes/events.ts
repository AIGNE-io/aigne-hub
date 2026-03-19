import { eq } from 'drizzle-orm';
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
        available: aiModelStatuses.available,
        error: aiModelStatuses.error,
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
          available: status.available,
          error: status.error,
        }),
      });
    }

    // Keep connection alive with periodic heartbeats
    // Workers SSE connections have a 30s limit, so client must reconnect
    let alive = true;
    stream.onAbort(() => {
      alive = false;
    });

    const HEARTBEAT_INTERVAL = 15000; // 15s
    const startTime = Date.now();
    const MAX_DURATION = 25000; // 25s (before 30s Worker limit)

    while (alive && Date.now() - startTime < MAX_DURATION) {
      await new Promise((resolve) => {
        setTimeout(resolve, HEARTBEAT_INTERVAL);
      });
      if (!alive) break;
      await stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ time: Date.now() }) });
    }
  });
});

export default routes;
