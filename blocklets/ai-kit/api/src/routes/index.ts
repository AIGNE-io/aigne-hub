import { proxyToAIKit } from '@blocklet/ai-kit/api/call';
import AIKitConfig from '@blocklet/ai-kit/api/config';
import { AI_KIT_BASE_URL } from '@blocklet/ai-kit/api/constants';
import { Router } from 'express';
import { parseURL } from 'ufo';

import app from './app';
import payment from './payment';
import v1 from './v1';

const router = Router();

const aiKitBaseUrlHostname = parseURL(AI_KIT_BASE_URL).host;

router.use('/v1', (req, res, next) => {
  if (
    AIKitConfig.useAIKitService &&
    // NOTE: avoid recursive self-calling
    req.hostname !== aiKitBaseUrlHostname
  ) {
    proxyToAIKit(req.originalUrl as any, { useAIKitService: true })(req, res, next);
  } else {
    v1(req, res, next);
  }
});

router.use('/app', app);
router.use('/payment', payment);

export default router;
