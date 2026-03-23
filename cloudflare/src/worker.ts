import { createAuthRoutes, createSession, getSessionCookie } from '@aigne/cf-auth';
import type { AuthUser } from '@aigne/cf-auth';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Cron handlers
import { archiveOldRecords } from './crons/archive';
import { aggregateModelCallStats } from './crons/model-call-stats';
import * as schema from './db/schema';
// Auth middleware
import { buildAuthConfig, loadUser } from './middleware/auth';
// API routes
import aiProviderRoutes from './routes/ai-providers';
import apiKeyRoutes from './routes/api-keys';
import eventsRoutes from './routes/events';
import paymentRoutes from './routes/payment';
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
  PAYMENT_WEBHOOK_SECRET?: string;
  CREDENTIAL_ENCRYPTION_KEY?: string;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
};

export type Variables = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  user?: AuthUser;
  executionCtx?: ExecutionContext;
};

export type HonoEnv = { Bindings: Env; Variables: Variables };

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', async (c, next) => {
  const origin = c.env.BASE_URL || 'http://localhost:5173';
  const middleware = cors({
    origin: [origin, 'http://localhost:5173', 'http://localhost:8787'],
    credentials: true,
  });
  return middleware(c, next);
});

// D1 + Drizzle setup per request + expose executionCtx for waitUntil
app.use('*', async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  c.set('executionCtx', c.executionCtx);
  await next();
});

// Load user from session (cookie JWT or dev headers) for all requests
app.use('*', async (c, next) => {
  const middleware = loadUser(c.env);
  return middleware(c, next);
});

// Health check (public, no auth)
app.get('/api/health', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 as ok').first();
    if (!result) throw new Error('D1 query failed');
    return c.json({ status: 'ok', db: 'connected', env: c.env.ENVIRONMENT });
  } catch {
    return c.json({ status: 'error', db: 'not connected' }, 500);
  }
});

// Dev-only: mock login endpoint (creates a session cookie without OAuth)
// Admin requires ?token=AUTH_SECRET; without token defaults to member
app.get('/auth/dev-login', async (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Not available in production' }, 403);
  }
  const authConfig = buildAuthConfig(c.env);
  const adminToken = c.req.query('token');
  const isAdmin = adminToken && adminToken === c.env.AUTH_SECRET;
  const role = isAdmin ? 'admin' : 'member';
  const token = await createSession(
    {
      id: `dev:${role}`,
      email: `${role}@dev.local`,
      name: `Dev ${role}`,
      provider: 'google',
      providerId: `dev-${role}`,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    authConfig
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: c.req.query('redirect') || '/',
      'Set-Cookie': getSessionCookie(token, authConfig),
    },
  });
});

// --- Public routes (no auth required) ---
app.route('/api/ai-providers', aiProviderRoutes); // models/model-rates are public, admin routes check internally
app.route('/api', eventsRoutes); // /api/events
app.route('/api', userRoutes); // /api/app/status (public)

// --- API Key management ---
app.route('/api/api-keys', apiKeyRoutes);

// --- Authenticated routes ---
app.route('/api/v1', v1Routes);
app.route('/api/v2', v2Routes);
app.route('/api/usage', usageRoutes);
app.route('/api/user', userRoutes);
app.route('/api/payment', paymentRoutes);

// Auth routes (login/callback/logout/session)
app.all('/auth/*', async (c) => {
  const authConfig = buildAuthConfig(c.env);
  const authApp = createAuthRoutes(authConfig);
  return authApp.fetch(c.req.raw, c.env);
});

// SPA fallback: serve index.html for non-API routes (client-side routing)
app.notFound(async (c) => {
  // API routes return JSON 404
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) {
    return c.json({ error: 'Not Found' }, 404);
  }
  // For non-API routes, serve SPA index.html via ASSETS binding
  if (c.env.ASSETS) {
    try {
      const asset = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
      return new Response(asset.body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    } catch {
      // ASSETS fetch failed
    }
  }
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.onError((_err, c) => c.json({ error: 'Internal Server Error' }, 500));

// Scheduled handler for cron triggers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
  const db = drizzle(env.DB, { schema });

  switch (event.cron) {
    case '0 * * * *':
      await aggregateModelCallStats(db);
      break;
    case '*/30 * * * *':
      // TODO: model-rate-check (fetch pricing from provider sources)
      break;
    case '0 2 * * *':
      await archiveOldRecords(db);
      break;
    default:
      break;
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  scheduled,
};
