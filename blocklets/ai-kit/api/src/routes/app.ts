import App from '@api/store/models/app';
import { fromPublicKey } from '@arcblock/did';
import { Router } from 'express';
import Joi from 'joi';

const router = Router();

export interface RegisterPayload {
  publicKey: string;
}

const registerBodySchema = Joi.object<RegisterPayload>({
  publicKey: Joi.string().required(),
});

router.post('/register', async (req, res) => {
  const payload = await registerBodySchema.validateAsync(req.body, { stripUnknown: true });
  const appId = fromPublicKey(payload.publicKey);

  await App.findOrCreate({
    where: { id: appId },
    defaults: {
      id: appId,
      publicKey: payload.publicKey,
    },
  });

  // TODO: 检查 payment 是否已存在订阅，存在的话不返回支付链接
  // TODO: 返回支付链接
  res.json({
    id: appId,
    paymentLink: '',
  });
});

export default router;
