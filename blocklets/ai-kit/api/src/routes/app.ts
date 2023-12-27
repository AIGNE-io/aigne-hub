import { wallet } from '@api/libs/auth';
import { Config } from '@api/libs/env';
import { getActiveSubscriptionOfApp } from '@api/libs/payment';
import { ensureAdmin, ensureComponentCall } from '@api/libs/security';
import App from '@api/store/models/app';
import Usage from '@api/store/models/usage';
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

    res.json({ id: app.id, subscription });
  }
);

export interface UsageCreditsQuery {
  startTime: string;
  endTime: string;
}

const usageCreditsSchema = Joi.object<UsageCreditsQuery>({
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
});

router.get(
  '/usage',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  async (req, res) => {
    // 如果没有 appClient 的话，相当于 component.call，查询当前应用的 usage
    const appId = req.appClient?.appId ?? wallet.address;

    const { startTime, endTime } = await usageCreditsSchema.validateAsync(req.query, { stripUnknown: true });

    const result = await Usage.sumUsedCredits({ appId, startTime, endTime });

    res.json({ list: result });
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
