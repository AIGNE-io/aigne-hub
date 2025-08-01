import { AIGNEObserver } from '@aigne/observability-api';
import { AIGNE_HUB_DID, OBSERVABILITY_DID } from '@api/libs/env';
import logger from '@api/libs/logger';
import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import AIKitConfig from '@blocklet/aigne-hub/api/config';
import { call, getComponentMountPoint } from '@blocklet/sdk/lib/component';
import { Router } from 'express';

import aiProviders from './ai-providers';
import app from './app';
import meilisearch from './meilisearch';
import payment from './payment';
import user from './user';
import v1 from './v1';
import v2 from './v2';

const router = Router();

AIGNEObserver.setExportFn(async (spans) => {
  if (!getComponentMountPoint(OBSERVABILITY_DID)) {
    logger.warn('Please install the Observability blocklet to enable tracing agents');
    return;
  }

  logger.info('Sending trace tree to Observability blocklet', { spans });

  await call({
    name: OBSERVABILITY_DID,
    method: 'POST',
    path: '/api/trace/tree',
    data: (spans || []).map((x: any) => {
      return {
        ...x,
        componentId: AIGNE_HUB_DID,
      };
    }),
  }).catch((err) => {
    logger.error('Failed to send trace tree to Observability blocklet', err);
  });
});

router.use('/v1', (req, res, next) => {
  const appId = req.get('x-app-id');
  if (
    AIKitConfig.useAIKitService &&
    // NOTE: avoid recursive self-calling
    !appId
  ) {
    proxyToAIKit(req.originalUrl as any, { useAIKitService: true })(req, res, next);
  } else {
    v1(req, res, next);
  }
});

router.use('/v2', v2);

router.use('/app', app);
router.use('/payment', payment);
router.use('/meilisearch', meilisearch);
router.use('/user', user);
router.use('/ai-providers', aiProviders);
router.use('/ai', aiProviders);

export default router;
