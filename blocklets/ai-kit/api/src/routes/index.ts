import { proxyToAIKit } from '@blocklet/ai-kit/api/call';
import AIKitConfig from '@blocklet/ai-kit/api/config';
import middleware from '@blocklet/sdk/lib/middlewares';
import { Router } from 'express';

import app from './app';
import meilisearch from './meilisearch';
import payment from './payment';
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

router.use('/v2', middleware.session({ accessKey: true }), v2);

router.use('/app', app);
router.use('/payment', payment);
router.use('/meilisearch', meilisearch);

export default router;
