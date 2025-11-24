import { AIGNEObserver } from '@aigne/observability-api';
import { AIGNE_HUB_DID, OBSERVABILITY_DID } from '@api/libs/env';
import logger from '@api/libs/logger';
import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import AIKitConfig from '@blocklet/aigne-hub/api/config';
import { BlockletStatus } from '@blocklet/constant';
import { call } from '@blocklet/sdk/lib/component';
import config from '@blocklet/sdk/lib/config';
import { Router } from 'express';

import aiProviders from './ai-providers';
import app from './app';
import meilisearch from './meilisearch';
import payment from './payment';
import user from './user';
import v1 from './v1';
import v2 from './v2';

const router = Router();

export const isObservabilityRunning = () => {
  return !!config.components.find((i) => i.did === OBSERVABILITY_DID && i.status === BlockletStatus.running);
};

AIGNEObserver.setExportFn(async (spans) => {
  if (!isObservabilityRunning()) {
    return;
  }

  logger.info(
    'export trace tree',
    (spans || []).map((x: any) => ({ id: x.id, name: x.name }))
  );

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

AIGNEObserver.setUpdateFn(async (id, data) => {
  if (!isObservabilityRunning()) {
    return;
  }

  logger.info('update trace', id, Object.keys(data));

  await call({
    name: OBSERVABILITY_DID,
    method: 'PATCH',
    path: `/api/trace/tree/${id}`,
    data,
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
