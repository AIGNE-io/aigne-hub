export { createAuthRoutes } from './middleware';
export { requireAuth, requireAdmin, optionalAuth } from './guard';
export { createSession, getSession, destroySession, getTokenFromRequest } from './session';
export type { AuthConfig, AuthUser, SessionPayload } from './types';
