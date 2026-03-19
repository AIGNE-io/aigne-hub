import { createAuthRoutes } from '@aigne/cf-auth';
import type { AuthConfig, AuthUser } from '@aigne/cf-auth';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import * as schema from './db/schema';
// API routes
import aiProviderRoutes from './routes/ai-providers';
import usageRoutes from './routes/usage';
import userRoutes from './routes/user';
import v1Routes from './routes/v1';
import v2Routes from './routes/v2';

export type Env = {
  DB: D1Database;
  AUTH_KV: KVNamespace;
  ENVIRONMENT: string;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ADMIN_EMAILS?: string;
  BASE_URL: string;
  BLOCKLET_SERVER_ORIGIN?: string;
};

export type Variables = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  user?: AuthUser;
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

app.route('/api/ai-providers', aiProviderRoutes);
app.route('/api/v1', v1Routes);
app.route('/api/v2', v2Routes);
app.route('/api/usage', usageRoutes);
app.route('/api/user', userRoutes);
app.route('/api', userRoutes); // /api/app/status

// Auth routes - mounted dynamically based on env
app.all('/auth/*', async (c) => {
  const authConfig = buildAuthConfig(c.env);
  const authApp = createAuthRoutes(authConfig);
  return authApp.fetch(c.req.raw, c.env);
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

function buildAuthConfig(env: Env): AuthConfig {
  const providers: AuthConfig['providers'] = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  return {
    providers,
    session: {
      kvBinding: env.AUTH_KV,
      secret: env.AUTH_SECRET,
      maxAge: 7 * 24 * 60 * 60,
    },
    d1Binding: env.DB,
    baseUrl: env.BASE_URL,
    adminEmails: env.ADMIN_EMAILS?.split(',').map((e) => e.trim()),
  };
}

export default {
  fetch: app.fetch,
  scheduled,
};
