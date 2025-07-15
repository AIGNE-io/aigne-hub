import { wallet } from '@api/libs/auth';
import { Config } from '@api/libs/env';
import {
  cancelSubscription,
  getActiveSubscriptionOfApp,
  getPaymentKitPrefix,
  getSubscriptionDescription,
  recoverSubscription,
} from '@api/libs/payment';
import { ensureAdmin, ensureComponentCall } from '@api/libs/security';
import App from '@api/store/models/app';
import Usage from '@api/store/models/usage';
import { proxyToAIKit } from '@blocklet/ai-kit/api/call';
import { appRegister } from '@blocklet/ai-kit/api/call/app';
import AIKitConfig from '@blocklet/ai-kit/api/config';
import { appIdFromPublicKey, ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import { config, getComponentMountPoint } from '@blocklet/sdk';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { Router } from 'express';
import Joi from 'joi';
import { joinURL, withQuery } from 'ufo';

const router = Router();

const user = sessionMiddleware({ accessKey: true });
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
    const subscription = await getActiveSubscriptionOfApp({
      appId,
      description,
      status: ['active', 'trialing', 'past_due'],
    });

    const subscriptionDetailUrl =
      subscription &&
      withQuery(joinURL(getPaymentKitPrefix(), 'customer/subscription', subscription.id), {
        '__did-connect__': Buffer.from(
          JSON.stringify({
            forceConnected: subscription.customer.did,
            switchBehavior: 'required',
          }),
          'utf8'
        ).toString('base64url'),
      });

    res.json({ id: app.id, subscription, subscriptionDetailUrl });
  }
);

export interface SetAppConfigPayload {
  useAIKitService?: boolean;
}

// support multi-tenant
router.get('/config', async (_, res) => {
  res.json(AIKitConfig.config);
});

const setConfigPayloadSchema = Joi.object<SetAppConfigPayload>({
  useAIKitService: Joi.boolean().empty([null]),
});

router.patch('/config', ensureComponentCall(ensureAdmin), async (req, res) => {
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

router.get('/service/status', user, proxyToAIKit('/api/app/status', { useAIKitService: true }));

router.get('/service/usage', user, ensureAdmin, proxyToAIKit('/api/app/usage', { useAIKitService: true }));

router.post('/service/register', user, async (_, res) => {
  const result = await appRegister({ publicKey: wallet.publicKey }, { useAIKitService: true });
  res.json({
    ...result,
    paymentLink:
      result.paymentLink &&
      withQuery(result.paymentLink, { 'subscription_data.description': getSubscriptionDescription() }),
  });
});

export default router;
