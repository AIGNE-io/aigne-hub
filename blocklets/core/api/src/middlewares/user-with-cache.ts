import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { NextFunction, Request, Response } from 'express';
import { LRUCache } from 'lru-cache';

const sessionCache = new LRUCache<string, NonNullable<Request['user']>>({ max: 1000, ttl: 60_000 });

// eslint-disable-next-line @typescript-eslint/naming-convention
const sessionHandler = sessionMiddleware({ accessKey: true });

// Match SDK: token with no dots and "blocklet-" prefix is an access key
function isAccessKey(token: string): boolean {
  return token.split('.').length === 1 && token.startsWith('blocklet-');
}

// Align with SDK's getTokenFromReq priority: header > cookie > body > query
function extractToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth) {
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0]!.toLowerCase() === 'bearer') return parts[1];
  }
  return req.cookies?.login_token || req.body?.access_token || (req.query?.access_token as string) || undefined;
}

export const userWithCache = (req: Request, res: Response, next: NextFunction) => {
  req.timings?.start('session');

  const token = extractToken(req);

  // Only cache access key tokens — login tokens are local JWT verification (<1ms), no need to cache
  if (token && isAccessKey(token)) {
    const cached = sessionCache.get(token);
    if (cached) {
      req.user = structuredClone(cached);
      req.timings?.end('session');
      return next();
    }
  }

  sessionHandler(req, res, (...args: any[]) => {
    if (token && isAccessKey(token) && req.user) {
      sessionCache.set(token, structuredClone(req.user));
    }
    req.timings?.end('session');
    next(...args);
  });
};
