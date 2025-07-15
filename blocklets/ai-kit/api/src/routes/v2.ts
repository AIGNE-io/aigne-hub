import { AIGNE } from '@aigne/core';
import { AIGNEObserver } from '@aigne/observability-api';
import { AIGNEHTTPServer } from '@aigne/transport/http-server/index';
import { call, getComponentMountPoint } from '@blocklet/sdk/lib/component';
import { Router } from 'express';

import logger from '../libs/logger';
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
      return { ...x, componentId: 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ' };
    }),
  }).catch((err) => {
    logger.error('Failed to send trace tree to Observability blocklet', err);
  });
});

router.post('/chat', async (req, res) => {
  const model = getModel(req.body);
  const engine = new AIGNE({ model });
  const aigneServer = new AIGNEHTTPServer(engine);
  await aigneServer.invoke(req, res, { userContext: { userId: req.user?.did } });
});

export default router;
