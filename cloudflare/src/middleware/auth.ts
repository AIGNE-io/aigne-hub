import { getSession, getTokenFromRequest } from '@aigne/cf-auth';
import type { AuthConfig, AuthUser } from '@aigne/cf-auth';
import { drizzle } from 'drizzle-orm/d1';
import type { Context, Next } from 'hono';

import * as schema from '../db/schema';
import { validateApiKey } from '../routes/api-keys';
import type { Env, HonoEnv } from '../worker';

/**
 * Build AuthConfig from Worker env bindings.
 */
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
        const app = await validateApiKey(db, apiKey);
        if (app) {
          c.set('user', {
            id: app.id,
            email: '',
            name: app.id,
            provider: 'google',
            providerId: app.id,
            role: 'member',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as AuthUser);
          return await next();
        }
      } catch {
        // API key validation failed (e.g. table missing), fall through to other auth methods
      }
    }

    // 2. Try session cookie auth
    const token = getTokenFromRequest(c.req.raw);
    if (token) {
      const user = await getSession(token, config);
      if (user) {
        c.set('user', user);
        return next();
      }
    }

    // 3. Fallback: dev header-based auth (x-user-did + x-user-role)
    // SECURITY: only allow in non-production environments
    if (env.ENVIRONMENT !== 'production') {
      const did = c.req.header('x-user-did');
      if (did) {
        c.set('user', {
          id: did,
          email: '',
          name: did,
          provider: 'google',
          providerId: did,
          role: (c.req.header('x-user-role') as 'admin' | 'member') || 'member',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as AuthUser);
      }
    }

    // 4. Dev fallback: auto-inject mock admin when no auth is present
    if (!c.get('user') && env.ENVIRONMENT !== 'production') {
      c.set('user', {
        id: 'dev:admin',
        email: 'admin@dev.local',
        name: 'Dev Admin',
        provider: 'google',
        providerId: 'dev-admin',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as AuthUser);
    }

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
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (user.role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }
    return next();
  };
}
