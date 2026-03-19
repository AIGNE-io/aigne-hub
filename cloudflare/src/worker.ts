import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import * as schema from './db/schema';

export type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  BLOCKLET_SERVER_ORIGIN?: string;
};

export type Variables = {
  db: ReturnType<typeof drizzle<typeof schema>>;
};

export type HonoEnv = { Bindings: Env; Variables: Variables };

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', cors());

// D1 + Drizzle setup per request
app.use('*', async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  await next();
});

// Health check
app.get('/api/health', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 as ok').first();
    if (!result) throw new Error('D1 query failed');
    return c.json({ status: 'ok', db: 'connected', env: c.env.ENVIRONMENT });
  } catch {
    return c.json({ status: 'error', db: 'not connected' }, 500);
  }
});

// SPA fallback (for frontend routing)
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.onError((_err, c) => c.json({ error: 'Internal Server Error' }, 500));

// Scheduled handler for cron triggers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const db = drizzle(env.DB, { schema });

  switch (event.cron) {
    case '0 * * * *':
      // TODO: model-call-stats aggregation (hourly)
      break;
    case '*/30 * * * *':
      // TODO: model-rate-check (every 30 min)
      break;
    case '0 2 * * *':
      // TODO: archive (daily at 2am)
      break;
    default:
      break;
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
