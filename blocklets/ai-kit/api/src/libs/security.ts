import { auth } from '@blocklet/sdk/lib/middlewares';
import { verify } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

export function ensureComponentCall(fallback?: (req: Request, res: Response, next: NextFunction) => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const sig = req.get('x-component-sig');
      if (!sig) throw new Error('Missing required header x-component-sig');

      const verified = verify(req.body ?? {}, sig);
      if (!verified) throw new Error('verify sig failed');
    } catch (error) {
      if (!fallback) throw error;

      fallback(req, res, next);
      return;
    }

    next();
  };
}
