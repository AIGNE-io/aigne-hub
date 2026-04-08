// [DEPRECATED] cf-auth — kept for legacy session fallback and dev-login. Remove after full DID auth migration.
import { createAuthRoutes, createSession, getSessionCookie } from '@aigne/cf-auth';
import type { BlockletServiceRPCInterface } from '@arcblock/did-connect-cloudflare/rpc-types';
import type { AppUser } from './types/user';
import { createBlockletServiceClient } from '@arcblock/did-connect-cloudflare/client';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Cron handlers
import { archiveOldRecords } from './crons/archive';
import { checkModelHealth } from './crons/model-health';
import { aggregateModelCallStats } from './crons/model-call-stats';
import { reconcileCredits } from './crons/reconcile';
import { logger } from './libs/logger';
import { processRetryQueue } from './libs/retry-queue';
import * as schema from './db/schema';
// Auth middleware
import { PaymentClient, createPaymentClient } from './libs/payment';
import { getPreferences, setPreferences } from './libs/preferences';
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
  BLOCKLET_SERVICE: Service & BlockletServiceRPCInterface;
  APP_SK: string;
  INSTANCE_NAME?: string;
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
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  PAYMENT_KIT?: { fetch: (req: Request | string) => Promise<Response> };
};

// Cached instanceDid after registerApp()
let cachedInstanceDid: string | null = null;

/** Get the cached instanceDid (set after ensureRegistered). */
export function getInstanceDid(): string | null {
  return cachedInstanceDid;
}

/** Register this app as an instance in blocklet-service (idempotent). */
async function ensureRegistered(env: Env): Promise<string> {
  if (cachedInstanceDid) return cachedInstanceDid;
  if (!env.APP_SK || !env.BLOCKLET_SERVICE) return '';

  const result = await env.BLOCKLET_SERVICE.registerApp({
    instanceDid: 'auto',
    appSk: env.APP_SK,
    appName: env.INSTANCE_NAME || 'AIGNE Hub',
    appDescription: 'AIGNE Hub — AI Agent marketplace',
  });

  cachedInstanceDid = result.instanceDid;
  console.log(`[aigne-hub] Registered as instance: ${cachedInstanceDid}`);
  return cachedInstanceDid;
}

/** Clone request with X-Instance-Did header injected. */
function withInstanceHeader(request: Request, instanceDid: string): Request {
  const headers = new Headers(request.headers);
  headers.set('X-Instance-Did', instanceDid);
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });
}

export type Variables = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  user?: AppUser;
  executionCtx?: ExecutionContext;
  payment?: PaymentClient;
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

// Strip trailing slash for API routes (Hono doesn't match "/api/foo/" against "/api/foo")
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (path !== '/' && path.endsWith('/')) {
    const url = new URL(c.req.url);
    url.pathname = path.replace(/\/+$/, '');
    const newReq = new Request(url.toString(), c.req.raw);
    return app.fetch(newReq, c.env, c.executionCtx);
  }
  return next();
});

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  // Only log API requests, not static assets
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) {
    logger.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      userAgent: c.req.header('user-agent')?.substring(0, 100),
    });
  }
});

// Register with blocklet-service on first request + forward auth pages
app.use('*', async (c, next) => {
  if (c.env.BLOCKLET_SERVICE && c.env.APP_SK) {
    await ensureRegistered(c.env);
  }
  return next();
});

// Forward /.well-known/service/* and /favicon.ico to blocklet-service
app.all('/.well-known/service/*', async (c) => {
  if (!c.env.BLOCKLET_SERVICE || !cachedInstanceDid) {
    return c.json({ error: 'Blocklet service not configured' }, 503);
  }
  const req = withInstanceHeader(c.req.raw, cachedInstanceDid);

  // Inject billing tab into DID admin/user pages when Payment Kit is available
  if (c.env.PAYMENT_KIT) {
    const path = new URL(c.req.url).pathname;
    if (path === '/.well-known/service/user' || path === '/.well-known/service/admin') {
      const locale = (c.req.header('Accept-Language') || '').startsWith('zh') ? 'zh' : 'en';
      const headers = new Headers(req.headers);
      headers.set(
        'X-External-Tabs',
        JSON.stringify([
          { id: 'billing', label: locale === 'zh' ? '账单' : 'Billing', url: `/payment/customer?locale=${locale}` },
        ])
      );
      return c.env.BLOCKLET_SERVICE.fetch(
        new Request(req.url, { method: req.method, headers, body: req.body, redirect: 'manual' })
      );
    }
  }

  return c.env.BLOCKLET_SERVICE.fetch(req);
});
app.get('/__blocklet__.js', async (c) => {
  const isJson = new URL(c.req.url).searchParams.get('type') === 'json';
  const preferences = await getPreferences(c.env.AUTH_KV);

  // Try to get base config from blocklet-service
  let baseConfig: Record<string, unknown> = {
    appName: c.env.INSTANCE_NAME || 'AIGNE Hub',
    appUrl: c.env.BASE_URL || new URL(c.req.url).origin,
    appPid: cachedInstanceDid || '',
    prefix: '/',
    groupPrefix: '/',
    theme: { prefer: 'light' },
  };

  if (c.env.BLOCKLET_SERVICE && cachedInstanceDid) {
    try {
      const url = new URL(c.req.url);
      url.searchParams.set('type', 'json');
      const req = withInstanceHeader(new Request(url.toString(), c.req.raw), cachedInstanceDid);
      const resp = await c.env.BLOCKLET_SERVICE.fetch(req);
      if (resp.ok) {
        baseConfig = { ...baseConfig, ...(await resp.json() as Record<string, unknown>) };
      }
    } catch { /* use defaults */ }
  }

  // Inject preferences and Payment Kit mount point
  baseConfig.preferences = preferences;
  if (c.env.PAYMENT_KIT) {
    const mounts = Array.isArray(baseConfig.componentMountPoints) ? baseConfig.componentMountPoints as any[] : [];
    if (!mounts.some((m: any) => m.did === 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk')) {
      mounts.push({
        did: 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk',
        title: 'Payment Kit',
        name: 'payment-kit',
        mountPoint: '/payment',
      });
    }
    baseConfig.componentMountPoints = mounts;
  }

  if (isJson) {
    return c.json(baseConfig, 200, { 'Cache-Control': 'private, no-store' });
  }
  return new Response(`window.blocklet = ${JSON.stringify(baseConfig)};`, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
});

// --- Payment Kit gateway: /payment/* -> PAYMENT_KIT (strip prefix + HTML rewrite) ---
app.all('/payment/*', async (c) => {
  if (!c.env.PAYMENT_KIT) return c.json({ error: 'PAYMENT_KIT not configured' }, 503);

  const url = new URL(c.req.url);
  const path = url.pathname;
  const targetPath = path.slice('/payment'.length) || '/';
  const targetUrl = new URL(targetPath + url.search, url.origin);

  const headers = new Headers(c.req.raw.headers);
  headers.set('X-Mount-Prefix', '/payment/');

  const resp = await c.env.PAYMENT_KIT.fetch(
    new Request(targetUrl.href, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
    })
  );

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    let html = await resp.text();
    html = html.replace(/(src=["'])\/assets\//g, '$1/payment/assets/');
    html = html.replace(/(href=["'])\/assets\//g, '$1/payment/assets/');
    html = html.replace('src="/__blocklet__.js"', 'src="/payment/__blocklet__.js"');
    html = html.replace(/prefix:\s*'\/'/g, "prefix: '/payment/'");
    return new Response(html, {
      status: resp.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  });
});
app.get('/payment', (c) => c.redirect('/payment/', 302));

// --- Media Kit passthrough: /media-kit/* -> PAYMENT_KIT ---
app.all('/media-kit/*', async (c) => {
  if (!c.env.PAYMENT_KIT) return c.json({ error: 'PAYMENT_KIT not configured' }, 503);
  const resp = await c.env.PAYMENT_KIT.fetch(c.req.raw);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  });
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

// Inject PaymentClient for API routes when PAYMENT_KIT binding is available
app.use('/api/*', async (c, next) => {
  if (c.env.PAYMENT_KIT) {
    c.set('payment', createPaymentClient(c.env.PAYMENT_KIT, c.req));
  }
  await next();
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

// [DEPRECATED] Dev-only mock login — prefer /.well-known/service/login (DID auth)
// Kept for local dev when blocklet-service is not running.
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

// --- Health check (public, for external monitoring) ---
app.get('/api/health', async (c) => {
  const checks: Record<string, { ok: boolean; latency?: number; error?: string }> = {};

  // D1 check
  try {
    const start = Date.now();
    const db = c.get('db');
    await db.run(sql`SELECT 1`);
    checks.d1 = { ok: true, latency: Date.now() - start };
  } catch (err) {
    checks.d1 = { ok: false, error: err instanceof Error ? err.message : 'D1 unreachable' };
  }

  // KV check
  try {
    const start = Date.now();
    await c.env.AUTH_KV.get('__health__');
    checks.kv = { ok: true, latency: Date.now() - start };
  } catch (err) {
    checks.kv = { ok: false, error: err instanceof Error ? err.message : 'KV unreachable' };
  }

  const allOk = Object.values(checks).every((ch) => ch.ok);
  return c.json({ status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() }, allOk ? 200 : 503);
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

// Bridge /auth/session to blocklet-service DID session (backward compat for frontend)
app.get('/auth/session', async (c) => {
  if (c.env.BLOCKLET_SERVICE) {
    const client = createBlockletServiceClient(c.env.BLOCKLET_SERVICE);
    const caller = await client.verifyFull(c.req.raw);
    if (caller) {
      const profile = await client.getUserProfile(caller.did);
      return c.json({
        user: {
          id: caller.did,
          email: profile?.email || '',
          name: caller.displayName || caller.did,
          role: caller.role === 'owner' || caller.role === 'admin' ? 'admin' : 'member',
          avatar: profile?.avatar || caller.avatar,
        },
      });
    }
    return c.json({ user: null }, 401);
  }
  // Fallback to cf-auth if no blocklet-service binding
  const authConfig = buildAuthConfig(c.env);
  const authApp = createAuthRoutes(authConfig);
  return authApp.fetch(c.req.raw, c.env);
});

// [DEPRECATED] Legacy cf-auth routes (Google/GitHub OAuth login/callback/logout)
// All new auth flows go through /.well-known/service/* (blocklet-service DID auth).
// Remove this block once all users have migrated to DID auth.
app.all('/auth/*', async (c) => {
  const authConfig = buildAuthConfig(c.env);
  const authApp = createAuthRoutes(authConfig);
  return authApp.fetch(c.req.raw, c.env);
});

// SPA fallback: serve index.html for non-API routes (client-side routing)
app.notFound(async (c) => {
  // Redirect lost Payment Kit prefixes (e.g. /customer -> /payment/customer)
  const PAYMENT_KIT_ROUTES = ['/admin', '/customer', '/integrations', '/checkout'];
  const path = new URL(c.req.url).pathname;
  if (c.env.PAYMENT_KIT && PAYMENT_KIT_ROUTES.some((r) => path.startsWith(r))) {
    const url = new URL(c.req.url);
    return c.redirect(`/payment${path}${url.search}`, 302);
  }

  // API routes return JSON 404
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) {
    return c.json({ error: 'Not Found' }, 404);
  }
  // Try serving the exact static asset first (run_worker_first mode)
  if (c.env.ASSETS) {
    try {
      const asset = await c.env.ASSETS.fetch(new Request(new URL(c.req.path, c.req.url)));
      if (asset.status !== 404) {
        return new Response(asset.body, {
          status: asset.status,
          headers: asset.headers,
        });
      }
    } catch {
      // ASSETS fetch failed, fall through to SPA
    }
    // No matching static file — serve SPA index.html
    try {
      const index = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
      return new Response(index.body, {
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
app.onError((err, c) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack?.substring(0, 500) });
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

// Scheduled handler for cron triggers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
  const db = drizzle(env.DB, { schema });

  switch (event.cron) {
    case '0 * * * *': {
      await aggregateModelCallStats(db);
      // Also process retry queue (merged for production cron limit)
      const retryStats = await processRetryQueue(env.AUTH_KV, env.DB);
      if (retryStats.processed > 0) {
        logger.info('Retry queue processed', retryStats as unknown as Record<string, unknown>);
      }
      break;
    }
    case '*/30 * * * *': {
      // Process retry queue for failed D1 writes (staging only, merged into hourly for production)
      const stats = await processRetryQueue(env.AUTH_KV, env.DB);
      if (stats.processed > 0) {
        logger.info('Retry queue processed', stats as unknown as Record<string, unknown>);
      }
      break;
    }
    case '0 2 * * *':
      await archiveOldRecords(db);
      await reconcileCredits(db);
      await checkModelHealth(db);
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
