// [DEPRECATED] cf-auth — kept for legacy session cookie fallback. Remove after full DID auth migration.
import { getSession, getTokenFromRequest } from '@aigne/cf-auth';
import type { AuthConfig } from '@aigne/cf-auth';
import { createBlockletServiceClient } from '@arcblock/did-connect-cloudflare/client';
import { drizzle } from 'drizzle-orm/d1';
import type { Context, Next } from 'hono';

import * as schema from '../db/schema';
import { checkRateLimit } from '../libs/rate-limit';
import { validateApiKey } from '../routes/api-keys';
import type { AppUser } from '../types/user';
import type { Env, HonoEnv } from '../worker';

// Import cachedInstanceDid from worker — set after ensureRegistered()
import { getInstanceDid } from '../worker';

/**
 * Build AuthConfig from Worker env bindings.
 */
/** [DEPRECATED] Build cf-auth config — only used for legacy session validation. */
export function buildAuthConfig(env: Env): AuthConfig {
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
      secret: env.AUTH_SECRET || (env.ENVIRONMENT === 'production' ? (() => { throw new Error('AUTH_SECRET must be set in production'); })() : 'dev-secret-change-me'),
      maxAge: 7 * 24 * 60 * 60,
    },
    d1Binding: env.DB,
    baseUrl: env.BASE_URL || 'http://localhost:8787',
    adminEmails: env.ADMIN_EMAILS?.split(',').map((e) => e.trim()),
  };
}

/**
 * Middleware: load user from session if present (does not block).
 * Sets c.set('user', authUser) if valid session exists.
 * Falls back to x-user-did / x-user-role headers for dev mode.
 */
export function loadUser(env: Env) {
  const config = buildAuthConfig(env);

  return async (c: Context<HonoEnv>, next: Next) => {
    // 1. Try API Key auth (Authorization: Bearer aigne_xxx)
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer aigne_')) {
      try {
        const apiKey = authHeader.slice(7); // Remove "Bearer "
        const db = c.get('db') || drizzle(env.DB, { schema });
        const appRecord = await validateApiKey(db, apiKey);
        if (!appRecord) {
          return c.json({ error: { message: 'Invalid API key' } }, 401);
        }

        // Rate limit API key requests
        const rl = await checkRateLimit(env.AUTH_KV, appRecord.id);
        if (!rl.allowed) {
          return c.json(
            { error: { message: 'Rate limit exceeded', limit: rl.limit, remaining: 0, resetAt: rl.resetAt } },
            429
          );
        }
        c.header('X-RateLimit-Limit', String(rl.limit));
        c.header('X-RateLimit-Remaining', String(rl.remaining));
        c.header('X-RateLimit-Reset', String(rl.resetAt));

        if (appRecord.userDid) {
          // New key with userDid: enrich with blocklet-service profile if available
          let email = '';
          let name = appRecord.name || appRecord.id;
          if (env.BLOCKLET_SERVICE) {
            const bsClient = createBlockletServiceClient(env.BLOCKLET_SERVICE);
            const profile = await bsClient.getUserProfile(appRecord.userDid);
            if (profile) {
              email = profile.email || '';
              name = profile.fullName || name;
            }
          }
          c.set('user', {
            id: appRecord.userDid,
            email,
            name,
            provider: 'api-key',
            providerId: appRecord.id,
            role: 'member',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies AppUser);
          (c as any).set('apiKeyAppDid', appRecord.id);
        } else {
          // Legacy key without userDid
          c.set('user', {
            id: appRecord.id,
            email: '',
            name: appRecord.id,
            provider: 'api-key',
            providerId: appRecord.id,
            role: 'member',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies AppUser);
        }
        return await next();
      } catch {
        return c.json({ error: { message: 'API key validation failed' } }, 401);
      }
    }

    // 2. Try blocklet-service DID auth (login_token cookie from DID Connect)
    if (env.BLOCKLET_SERVICE) {
      try {
        const client = createBlockletServiceClient(env.BLOCKLET_SERVICE);
        const caller = await client.verifyFull(c.req.raw);
        if (caller) {
          // Fetch full profile for email/avatar (verifyFull returns DB-enriched identity)
          const profile = await client.getUserProfile(caller.did);

          // Auto-ensure membership for this instance (idempotent)
          const instanceDid = getInstanceDid();
          let effectiveRole = caller.role;
          if (instanceDid) {
            const membership = await env.BLOCKLET_SERVICE.getMembership(caller.did, instanceDid);
            if (!membership) {
              // Check if instance has any members — first global owner/admin becomes instance owner
              const existingMembers = await env.BLOCKLET_SERVICE.listMemberships(instanceDid);
              const hasOwner = existingMembers?.some((m: { role: string }) => m.role === 'owner');
              const isGlobalAdmin = caller.role === 'owner' || caller.role === 'admin';
              const role = !hasOwner && isGlobalAdmin ? 'owner' : isGlobalAdmin ? 'admin' : 'member';
              await env.BLOCKLET_SERVICE.createMembership(caller.did, instanceDid, role);
              effectiveRole = role;
            } else {
              effectiveRole = membership.role as typeof caller.role;
            }
          }

          c.set('user', {
            id: caller.did,
            email: profile?.email || '',
            name: caller.displayName || caller.did,
            avatar: profile?.avatar || caller.avatar,
            provider: 'did',
            providerId: caller.did,
            role: effectiveRole === 'owner' || effectiveRole === 'admin' ? 'admin' : 'member',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies AppUser);
          return next();
        }
      } catch {
        // blocklet-service auth failed, try next method
      }
    }

    // 3. Try session cookie auth (legacy @aigne/cf-auth)
    const token = getTokenFromRequest(c.req.raw);
    if (token) {
      const cfUser = await getSession(token, config);
      if (cfUser) {
        c.set('user', {
          id: cfUser.id,
          email: cfUser.email,
          name: cfUser.name,
          avatar: cfUser.avatar,
          provider: cfUser.provider as AppUser['provider'],
          providerId: cfUser.providerId,
          role: cfUser.role as AppUser['role'],
          createdAt: cfUser.createdAt,
          updatedAt: cfUser.updatedAt,
        } satisfies AppUser);
        return next();
      }
    }

    // 4. Fallback: dev header-based auth (x-user-did + x-user-role)
    // SECURITY: only allow in non-production environments
    if (env.ENVIRONMENT !== 'production') {
      const did = c.req.header('x-user-did');
      if (did) {
        c.set('user', {
          id: did,
          email: '',
          name: did,
          provider: 'dev',
          providerId: did,
          role: (c.req.header('x-user-role') as 'admin' | 'member') || 'member',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies AppUser);
      }
    }

    // 4. No auto-inject: unauthenticated requests stay unauthenticated
    // Users must login via /auth/dev-login (member) or /auth/dev-login?token=SECRET (admin)

    return next();
  };
}

/**
 * Middleware: require authenticated user. Returns 401 if not logged in.
 */
export function requireAuth() {
  return async (c: Context<HonoEnv>, next: Next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    return next();
  };
}

/**
 * Middleware: require admin role. Returns 403 if not admin.
 */
export function requireAdmin() {
  return async (c: Context<HonoEnv>, next: Next) => {
    const user = c.get('user') as AppUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (user.role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }
    return next();
  };
}
