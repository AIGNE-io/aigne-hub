import http from 'http';
import https from 'https';

import { getComponentWebEndpoint } from '@blocklet/sdk/lib/component';
import { getSignData } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';
import { isNil, pick } from 'lodash';
import { joinURL, parseURL, stringifyParsedURL, withQuery } from 'ufo';

import { AI_KIT_BASE_URL } from '../constants';
import { getRemoteComponentCallHeaders } from '../utils/auth';

export function proxyToAIKit(
  path:
    | '/api/v1/status'
    | '/api/v1/chat/completions'
    | '/api/v1/image/generations'
    | '/api/v1/embeddings'
    | '/api/v1/audio/transcriptions'
    | '/api/v1/audio/speech'
    | '/api/app/status'
    | '/api/app/usage'
    | '/api/app/register'
    | '/api/user/credit/grants'
    | '/api/user/credit/balance'
    | '/api/user/credit/transactions'
    | '/api/user/credit/payment-link',
  {
    useAIKitService,
    proxyReqHeaders = ['accept', 'content-type'],
    proxyResHeaders = ['content-type', 'cache-control'],
  }: {
    useAIKitService?: boolean;
    proxyReqHeaders?: string[];
    proxyResHeaders?: string[];
  } = {}
) {
  const parseReqBody = path !== '/api/v1/audio/transcriptions';

  return (req: Request, res: Response, next: NextFunction) => {
    const url = parseURL(
      withQuery(joinURL(useAIKitService ? AI_KIT_BASE_URL : getComponentWebEndpoint('ai-kit'), path), req.query)
    );

    const userDid = req.user?.did || req?.get('x-app-user-did');
    const proxyReq = (url.protocol === 'https:' ? https : http).request(
      stringifyParsedURL(url),
      {
        headers: {
          ...pick(req.headers, ...proxyReqHeaders),
          ...(useAIKitService
            ? getRemoteComponentCallHeaders(req.body || {}, userDid)
            : (() => {
                const { iat, exp, sig, version } = getSignData({
                  data: req.body,
                  params: req.query,
                  method: req.method,
                  url: stringifyParsedURL(url),
                });

                return {
                  'x-component-sig': sig,
                  'x-component-sig-iat': iat,
                  'x-component-sig-exp': exp,
                  'x-component-sig-version': version,
                };
              })()),
        },
        method: req.method,
      },
      (proxyRes) => {
        if (proxyRes.statusCode) res.status(proxyRes.statusCode);
        res.setHeader('X-Accel-Buffering', 'no');

        for (const [k, v] of Object.entries(pick(proxyRes.headers, ...proxyResHeaders))) {
          if (!isNil(v)) res.setHeader(k, v);
        }
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (e) => next(e));

    req.on('aborted', () => {
      proxyReq.destroy();
    });

    if (parseReqBody) {
      proxyReq.write(JSON.stringify(req.body));
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  };
}
