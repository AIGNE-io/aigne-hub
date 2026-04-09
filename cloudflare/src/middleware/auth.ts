// [DEPRECATED] cf-auth — kept for legacy session cookie fallback. Remove after full DID auth migration.
import { getSession, getTokenFromRequest } from '@aigne/cf-auth';
import type { AuthConfig } from '@aigne/cf-auth';
import { createBlockletServiceClient } from '@arcblock/did-connect-cloudflare/client';
import type { Context, Next } from 'hono';

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
    // 1. Try blocklet-service auth: resolveIdentity handles Access Key (Bearer), JWT cookie, and passkey
    if (env.BLOCKLET_SERVICE) {
      try {
        const client = createBlockletServiceClient(env.BLOCKLET_SERVICE);
        const caller = await client.resolveIdentity(c.req.raw, getInstanceDid() || undefined);
        if (caller) {
          // Check KV cache for resolved auth (30s TTL, avoids repeated profile RPCs)
          const authCacheKey = `auth-cache:${caller.did}`;
          const cached = await env.AUTH_KV.get(authCacheKey);
          if (cached) {
            c.set('user', JSON.parse(cached) as AppUser);
            return next();
          }

          const profile = await client.getUserProfile(caller.did);

          const user: AppUser = {
            id: caller.did,
            email: profile?.email || '',
            name: caller.displayName || caller.did,
            avatar: profile?.avatar || caller.avatar,
            provider: (caller as any).authMethod === 'accessKey' ? 'api-key' : 'did',
            providerId: caller.did,
            role: caller.role === 'owner' || caller.role === 'admin' ? 'admin' : 'member',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          c.set('user', user);

          // Cache for 30s — profile/role changes take effect after TTL expires
          env.AUTH_KV.put(authCacheKey, JSON.stringify(user), { expirationTtl: 30 })
            .catch(() => {}); // fire-and-forget
          return next();
        }
      } catch {
        // blocklet-service auth failed, try next method
      }
    }

    // 2. Try session cookie auth (legacy @aigne/cf-auth)
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
