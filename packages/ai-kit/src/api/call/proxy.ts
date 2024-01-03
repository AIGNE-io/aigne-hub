import { getComponentWebEndpoint } from '@blocklet/sdk/lib/component';
import { sign } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';
import proxy from 'express-http-proxy';
import { joinURL, parseURL, withQuery } from 'ufo';

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
  options: { useAIKitService?: boolean } & proxy.ProxyOptions = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { useAIKitService = AIKitConfig.useAIKitService } = options;

    const url = parseURL(joinURL(useAIKitService ? AI_KIT_BASE_URL : getComponentWebEndpoint('ai-kit'), path));

    proxy(url.host!, {
      https: url.protocol === 'https:',
      limit: '10mb',
      parseReqBody: path !== '/api/v1/audio/transcriptions',
      proxyReqPathResolver(req) {
        return withQuery(url.pathname, req.query);
      },
      ...options,
      proxyReqOptDecorator(proxyReqOpts, srcReq) {
        proxyReqOpts.headers = {
          ...proxyReqOpts.headers,
          ...(useAIKitService
            ? getRemoteComponentCallHeaders(srcReq.body || {})
            : { 'x-component-sig': sign(srcReq.body || {}) }),
        };

        if (options.proxyReqOptDecorator) {
          return options.proxyReqOptDecorator(proxyReqOpts, srcReq);
        }

        return proxyReqOpts;
      },
    })(req, res, next);
  };
}
