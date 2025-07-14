import { AIGNE } from '@aigne/core';
import { AIGNEHTTPServer } from '@aigne/transport/http-server/index';
import App from '@api/store/models/app';
import { ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import compression from 'compression';
import { Router } from 'express';

import { ensureAdmin, ensureComponentCall } from '../libs/security';
import { getModel } from '../providers/models';

const router = Router();

router.post(
  '/:type(chat)?/completions',
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
