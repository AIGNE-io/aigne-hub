import { Config } from '@api/libs/env';
import { getActiveSubscriptionOfApp } from '@api/libs/payment';
import App from '@api/store/models/app';
import { appIdFromPublicKey, ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import { Router } from 'express';
import Joi from 'joi';
import { withQuery } from 'ufo';

const router = Router();

router.get(
  '/status',
  async (req, res, next) => {
    const appId = req.get('x-app-id');
    const app = await App.findByPk(appId);
    if (!app?.publicKey) {
      res.json(null);
      return;
    }

    next();
  },
  ensureRemoteComponentCall(App.findPublicKeyById),
  async (req, res) => {
    const { appId } = req.appClient!;
    const app = await App.findByPk(appId, { rejectOnEmpty: new Error(`App ${appId} not found`) });

    const subscription = await getActiveSubscriptionOfApp({ appId });

    res.json({
      id: app.id,
      subscription,
    });
  }
);

export interface RegisterPayload {
  publicKey: string;
}

const registerBodySchema = Joi.object<RegisterPayload>({
  publicKey: Joi.string().required(),
});

router.post('/register', async (req, res) => {
  if (!Config.pricing) throw new Error('Missing pricing preference');

  const payload = await registerBodySchema.validateAsync(req.body, { stripUnknown: true });
  const appId = appIdFromPublicKey(payload.publicKey);

  await App.findOrCreate({
    where: { id: appId },
    defaults: {
      id: appId,
      publicKey: payload.publicKey,
    },
  });

  res.json({
    id: appId,
    paymentLink: withQuery(Config.pricing.subscriptionPaymentLink, { 'metadata.appId': appId }),
  });
});

export default router;
