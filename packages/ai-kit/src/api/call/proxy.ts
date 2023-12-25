import { getComponentWebEndpoint } from '@blocklet/sdk/lib/component';
import { sign } from '@blocklet/sdk/lib/util/verify-sign';
import proxy from 'express-http-proxy';
import { joinURL, parseURL } from 'ufo';

import { AI_KIT_BASE_URL } from '../../constants';
import { getRemoteComponentCallHeaders } from '../utils/auth';

export function proxyToAIKit(
  path:
    | '/api/v1/status'
    | '/api/v1/chat/completions'
    | '/api/v1/image/generations'
    | '/api/v1/embeddings'
    | '/api/v1/audio/transcriptions'
    | '/api/v1/audio/speech',
  options?: { useAIKitService?: boolean }
) {
  const url = parseURL(joinURL(options?.useAIKitService ? AI_KIT_BASE_URL : getComponentWebEndpoint('ai-kit'), path));

  return proxy(url.host!, {
    https: url.protocol === 'https:',
    limit: '10mb',
    parseReqBody: path !== '/api/v1/audio/transcriptions',
    proxyReqPathResolver() {
      return url.pathname;
    },
    proxyReqOptDecorator(proxyReqOpts, srcReq) {
      proxyReqOpts.headers = {
        ...proxyReqOpts.headers,
        ...(options?.useAIKitService
          ? getRemoteComponentCallHeaders(srcReq.body || {})
          : { 'x-component-sig': sign(srcReq.body || {}) }),
      };
      return proxyReqOpts;
    },
  });
}
