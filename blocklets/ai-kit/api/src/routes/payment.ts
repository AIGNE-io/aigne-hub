import logger from '@api/libs/logger';
import { verifySig } from '@blocklet/sdk/lib/middlewares/component';
import { Event } from '@did-pay/client';
import { Router } from 'express';
import Joi from 'joi';

const router = Router();

export interface CallbackPayload extends Event {}

const paymentBodySchema = Joi.any<CallbackPayload>();

router.post('/callback', verifySig, async (req, res) => {
  const payload = await paymentBodySchema.validateAsync(req.body, { stripUnknown: true });
  logger.log(payload);

  // TODO: 验证 event 并作出相应处理

  res.json({});
});

export default router;
