import { wallet } from '@api/libs/auth';
import { Config } from '@api/libs/env';
import {
  cancelSubscription,
  getActiveSubscriptionOfApp,
  getSubscriptionDescription,
  recoverSubscription,
} from '@api/libs/payment';
import { ensureAdmin, ensureComponentCall } from '@api/libs/security';
import App from '@api/store/models/app';
import Usage from '@api/store/models/usage';
import { proxyToAIKit } from '@blocklet/ai-kit/api/call';
import AIKitConfig from '@blocklet/ai-kit/api/config';
import { appIdFromPublicKey, ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import { config, getComponentMountPoint } from '@blocklet/sdk';
import { Router } from 'express';
import Joi from 'joi';
import { joinURL, withQuery } from 'ufo';

const router = Router();

const statusQuerySchema = Joi.object<{ description?: string }>({
  description: Joi.string().empty([null, '']),
});

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
    const { description } = await statusQuerySchema.validateAsync(req.query, { stripUnknown: true });

    const { appId } = req.appClient!;
    const app = await App.findByPk(appId, { rejectOnEmpty: new Error(`App ${appId} not found`) });
    const subscription = await getActiveSubscriptionOfApp({ appId, description });

    res.json({ id: app.id, subscription });
  }
);

export interface SetAppConfigPayload {
  useAIKitService?: boolean;
}

router.get('/config', ensureAdmin, async (_, res) => {
  res.json(AIKitConfig.config);
});

const setConfigPayloadSchema = Joi.object<SetAppConfigPayload>({
  useAIKitService: Joi.boolean().empty([null]),
});

router.patch('/config', ensureAdmin, async (req, res) => {
  const payload = await setConfigPayloadSchema.validateAsync(req.body, { stripUnknown: true });
  AIKitConfig.config = { ...AIKitConfig.config, ...payload };
  AIKitConfig.save();

  res.json(AIKitConfig.config);
});

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
    paymentLink: withQuery(Config.pricing.subscriptionPaymentLink, {
      'metadata.appId': appId,
      'subscription_data.description': getSubscriptionDescription(),
    }),
  });
});

const subscriptionSuccessQuery = Joi.object<{
  redirect?: string;
  checkout_session_id: string;
}>({
  redirect: Joi.string().empty([null, '']),
  checkout_session_id: Joi.string().required(),
});

router.get('/client/subscription/success', async (req, res) => {
  const query = await subscriptionSuccessQuery.validateAsync(req.query, { stripUnknown: true });

  AIKitConfig.config = { ...AIKitConfig.config, useAIKitService: true };
  AIKitConfig.save();

  res.redirect(301, query.redirect || joinURL(config.env.appUrl, getComponentMountPoint('ai-kit')));
});

router.post('/subscription/cancel', ensureRemoteComponentCall(App.findPublicKeyById), async (req, res) => {
  const { appId } = req.appClient!;

  await cancelSubscription({ appId });

  res.json(null);
});

router.post('/subscription/recover', ensureRemoteComponentCall(App.findPublicKeyById), async (req, res) => {
  const { appId } = req.appClient!;

  await recoverSubscription({ appId });

  res.json(null);
});

router.get('/service/status', proxyToAIKit('/api/app/status', { useAIKitService: true }));

router.get('/service/usage', ensureAdmin, proxyToAIKit('/api/app/usage', { useAIKitService: true }));

router.post(
  '/service/register',
  proxyToAIKit('/api/app/register', {
    useAIKitService: true,
    proxyReqOptDecorator(proxyReqOpts) {
      proxyReqOpts.headers!['Content-Type'] = 'application/json';
      return proxyReqOpts;
    },
    proxyReqBodyDecorator() {
      return {
        publicKey: wallet.publicKey,
      };
    },
  })
);

export default router;
