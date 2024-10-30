import { SIG_VERSION } from '@blocklet/constant';
import { auth } from '@blocklet/sdk/lib/middlewares';
import { verify } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';
import semVer from 'semver';
import { parseURL } from 'ufo';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

export function ensureComponentCall(fallback?: (req: Request, res: Response, next: NextFunction) => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const sig = req.get('x-component-sig');
      if (!sig) throw new Error('Missing required header x-component-sig');

      const verified = verifySig(req);
      if (!verified) throw new Error('verify sig failed');
    } catch (error) {
      if (!fallback) throw error;

      fallback(req, res, next);
      return;
    }

    next();
  };
}

const legacyFn = (req: Request) => {
  const data = req?.body ?? {};
  const params = req?.query ?? {};
  return { data, params };
};
const latestFn = (req: Request) => {
  const now = Math.floor(Date.now() / 1000);
  const iat = Number(req.get('x-component-sig-iat'));
  const exp = Number(req.get('x-component-sig-exp'));
  if (Number.isNaN(iat) || Number.isNaN(exp)) {
    throw new Error('invalid sig');
  }
  if (exp < now) {
    throw new Error('expired sig');
  }
  const data: {
    body?: any;
    query?: any;
    method?: string;
    url?: string;
    iat: number;
    exp: number;
  } = {
    iat,
    exp,
    body: req.body ?? {},
    query: req.query ?? {},
    method: req.method.toLowerCase(),
    url: parseURL(req.originalUrl).pathname,
  };
  return data;
};

const verifySig = (req: Request) => {
  const sig = req.get('x-component-sig');
  const sigVersion = req.get('x-component-sig-version');
  if (!sig) {
    throw new Error('verify sig failed');
  }
  const getData = semVer.gt(semVer.coerce(sigVersion)!, semVer.coerce(SIG_VERSION!.V0)!) ? latestFn : legacyFn;
  const data = getData(req);
  const verified = verify(data, sig);
  if (!verified) {
    throw new Error('verify sig failed');
  }
  return true;
};
