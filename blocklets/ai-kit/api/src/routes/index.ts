import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import AIKitConfig from '@blocklet/aigne-hub/api/config';
import { Router } from 'express';

import aiProviders from './ai-providers';
import app from './app';
import meilisearch from './meilisearch';
import payment from './payment';
import user from './user';
import v1 from './v1';
import v2 from './v2';

const router = Router();

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

export default router;
