import http from 'http';
import https from 'https';

import { getComponentWebEndpoint } from '@blocklet/sdk/lib/component';
import { sign } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';
import { isNil, pick } from 'lodash';
import { joinURL, parseURL, stringifyParsedURL, withQuery } from 'ufo';

import AIKitConfig from '../config';
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
    | '/api/app/register',
  {
    useAIKitService = AIKitConfig.useAIKitService,
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

    const proxyReq = (url.protocol === 'https:' ? https : http).request(
      stringifyParsedURL(url),
      {
        headers: {
          ...pick(req.headers, ...proxyReqHeaders),
          ...(useAIKitService
            ? getRemoteComponentCallHeaders(req.body || {})
            : { 'x-component-sig': sign(req.body || {}) }),
        },
        method: req.method,
      },
      (proxyRes) => {
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
