import type { Context, Next } from 'hono';

import { getSession, getTokenFromRequest } from './session';
import type { AuthConfig, AuthUser } from './types';

/**
 * Hono middleware that requires authentication.
 * Sets c.set('user', authUser) on success, returns 401 on failure.
 */
export function requireAuth(config: AuthConfig) {
  return async (c: Context, next: Next) => {
    const token = getTokenFromRequest(c.req.raw);
    if (!token) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const user = await getSession(token, config);
    if (!user) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    c.set('user', user);
    return next();
  };
}

/**
 * Hono middleware that requires admin role.
 * Must be used after requireAuth.
 */
export function requireAdmin() {
  return async (c: Context, next: Next) => {
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

/**
 * Hono middleware that optionally loads user if token present.
 * Does NOT block unauthenticated requests.
 */
export function optionalAuth(config: AuthConfig) {
  return async (c: Context, next: Next) => {
    const token = getTokenFromRequest(c.req.raw);
    if (token) {
      const user = await getSession(token, config);
      if (user) {
        c.set('user', user);
      }
    }
    return next();
  };
}
