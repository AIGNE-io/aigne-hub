import { AIGNE } from '@aigne/core';
import { AIGNEObserver } from '@aigne/observability-api';
import { AIGNEHTTPServer } from '@aigne/transport/http-server/index';
import App from '@api/store/models/app';
import { ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import { call, getComponentMountPoint } from '@blocklet/sdk/lib/component';
import compression from 'compression';
import { Router } from 'express';

import logger from '../libs/logger';
import { ensureAdmin, ensureComponentCall } from '../libs/security';
import { getModel } from '../providers/models';

const router = Router();

const OBSERVABILITY_BLOCKLET_NAME = 'z2qa2GCqPJkufzqF98D8o7PWHrRRSHpYkNhEh';
AIGNEObserver.setExportFn(async (spans) => {
  if (!getComponentMountPoint(OBSERVABILITY_BLOCKLET_NAME)) {
    logger.warn('Please install the Observability blocklet to enable tracing agents');
    return;
  }

  await call({
    name: OBSERVABILITY_BLOCKLET_NAME,
    method: 'POST',
    path: '/api/trace/tree',
    data: spans.map((x) => {
      return {
        ...x,
        componentId: 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ',
      };
    }),
  }).catch((err) => {
    logger.error('Failed to send trace tree to Observability blocklet', err);
  });
});

router.post(
  '/chat',
  compression(),
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  async (req, res) => {
    const model = getModel(req.body.input);
    const engine = new AIGNE({ model });
    const aigneServer = new AIGNEHTTPServer(engine);
    await aigneServer.invoke(req, res, { userContext: { userId: req.user?.did } });
  }
);

export default router;
