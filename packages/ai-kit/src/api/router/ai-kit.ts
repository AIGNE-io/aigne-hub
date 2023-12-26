import { isAxiosError } from 'axios';
import { NextFunction, Request, Response, Router } from 'express';
import Joi from 'joi';

import Config, { AIKitServiceConfig } from '../../components/ai-kit-service/config';
import { proxyToAIKit } from '../call';
import { appRegister, appStatus } from '../call/app';
import { ensureAdmin, wallet } from '../utils/auth';

const router = Router();

router.get(
  '/status',
  ensureAdmin,
  catchAxiosError(async (_, res) => {
    res.json({
      ...(await appStatus()),
      aiKitServiceConfig: Config.config,
    });
  })
);

export interface SetAppConfigPayload extends AIKitServiceConfig {}

const setConfigPayloadSchema = Joi.object<SetAppConfigPayload>({
  useAIKitService: Joi.boolean().empty([null]),
});

router.patch(
  '/config',
  ensureAdmin,
  catchAxiosError(async (req, res) => {
    const payload = await setConfigPayloadSchema.validateAsync(req.body, { stripUnknown: true });
    Config.config = { ...Config.config, ...payload };
    Config.save();

    res.json({
      ...(await appStatus()),
      aiKitServiceConfig: Config.config,
    });
  })
);

router.post(
  '/register',
  ensureAdmin,
  catchAxiosError(async (_, res) => {
    res.json(await appRegister({ publicKey: wallet.publicKey }));
  })
);

router.get(
  '/usage/credits',
  ensureAdmin,
  proxyToAIKit('/api/app/usage/credits', { useAIKitService: Config.useAIKitService })
);

export default router;

function catchAxiosError(handler: (req: Request, res: Response, next: NextFunction) => any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        res.status(error.response.status).json(error.response.data);
        return;
      }
      throw error;
    }
  };
}
