import { CustomError } from '@blocklet/error';
import { auth } from '@blocklet/sdk/lib/middlewares';
import { getVerifyData, verify } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

export function ensureComponentCall(fallback?: (req: Request, res: Response, next: NextFunction) => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, sig } = getVerifyData(req);
      const verified = verify(data, sig);
      if (!verified) throw new CustomError(401, 'verify sig failed');
    } catch (error) {
      if (!fallback) throw error;

      fallback(req, res, next);
      return;
    }

    next();
  };
}
