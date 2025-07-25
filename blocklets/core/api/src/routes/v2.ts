import { AIGNE } from '@aigne/core';
import { AIGNEHTTPServer } from '@aigne/transport/http-server/index';
import { getModelNameWithProvider, getOpenAIV2 } from '@api/libs/ai-provider';
import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import { Config } from '@api/libs/env';
import { checkUserCreditBalance, isPaymentRunning } from '@api/libs/payment';
import { createAndReportUsageV2 } from '@api/libs/usage';
import { checkModelRateAvailable } from '@api/providers';
import AiCredential from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { CustomError } from '@blocklet/error';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import compression from 'compression';
import { Router } from 'express';
import proxy from 'express-http-proxy';

import { getModel } from '../providers/models';

const router = Router();

const user = sessionMiddleware({ accessKey: true });

router.get('/status', user, async (req, res) => {
  const userDid = req.user?.did;
  if (userDid && Config.creditBasedBillingEnabled) {
    if (!isPaymentRunning()) {
      return res.json({ available: false, error: 'Payment kit is not Running' });
    }
    try {
      await checkUserCreditBalance({ userDid });
    } catch (err) {
      return res.json({ available: false, error: err.message });
    }
  }
  const where: any = {
    enabled: true,
  };
  let modelName = '';
  if (req.query.model) {
    const { modelName: modelNameQuery, providerName } = getModelNameWithProvider(req.query.model as string);
    where.name = providerName;
    modelName = modelNameQuery;
  }
  const providers = await AiProvider.findAll({
    where,
    include: [
      {
        model: AiCredential,
        as: 'credentials',
        where: { active: true },
        required: false,
      },
    ],
  });
  if (providers.length === 0) {
    return res.json({ available: false });
  }
  if (modelName && Config.creditBasedBillingEnabled) {
    const modelRate = await AiModelRate.findOne({ where: { model: modelName } });
    if (!modelRate) {
      return res.json({ available: false, error: 'Model rate not available' });
    }
  }
  return res.json({ available: true });
});

router.post('/:type(chat)?/completions', compression(), user, async (req, res) => {
  const userDid = req.user?.did;
  if (!userDid) {
    throw new CustomError(401, 'User not authenticated');
  }
  if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
    throw new CustomError(502, 'Payment kit is not Running');
  }
  if (userDid && Config.creditBasedBillingEnabled) {
    await checkUserCreditBalance({ userDid });
  }
  // Process the completion and get usage data
  const usageData = await processChatCompletion(req, res, 'v2');

  if (usageData && Config.creditBasedBillingEnabled) {
    await createAndReportUsageV2({
      type: 'chatCompletion',
      promptTokens: usageData.promptTokens,
      completionTokens: usageData.completionTokens,
      model: usageData.model,
      modelParams: usageData.modelParams,
      appId: req.body?.appId,
      userDid: userDid!,
    });
  }
});

router.post(
  '/chat',
  user,
  createRetryHandler(async (req, res) => {
    // v2 specific checks
    const userDid = req.user?.did;
    if (!userDid) {
      throw new CustomError(401, 'User not authenticated');
    }
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }

    await checkModelRateAvailable(req.body.model);
    const model = await getModel(req.body, {
      modelOptions: req.body?.options?.modelOptions,
    });

    const engine = new AIGNE({ model });
    const aigneServer = new AIGNEHTTPServer(engine);
    await aigneServer.invoke(req, res, {
      userContext: { userId: req.user?.did },
      // @ts-ignore
      callback: async (usageData: { usage: { inputTokens: number; outputTokens: number } }) => {
        if (usageData && Config.creditBasedBillingEnabled) {
          await createAndReportUsageV2({
            type: 'chatCompletion',
            promptTokens: (usageData.usage?.inputTokens as number) || 0,
            completionTokens: (usageData.usage?.outputTokens as number) || 0,
            model: req.body?.model as string,
            modelParams: req.body?.options?.modelOptions,
            userDid: userDid!,
          });
        }
      },
    });
  })
);

// v2 Embeddings endpoint
router.post(
  '/embeddings',
  user,
  createRetryHandler(async (req, res) => {
    // v2 specific checks
    const userDid = req.user?.did;
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }

    // Process embeddings and get usage data
    const usageData = await processEmbeddings(req, res);

    // Report usage with v2 specific parameters including did
    if (usageData && userDid && Config.creditBasedBillingEnabled) {
      await createAndReportUsageV2({
        type: 'embedding',
        promptTokens: usageData.promptTokens,
        model: usageData.model,
        appId: req.appClient?.appId,
        userDid: userDid!,
      });
    }
  })
);

// v2 Image Generation endpoint
router.post(
  '/image/generations',
  user,
  createRetryHandler(async (req, res) => {
    // v2 specific checks
    const userDid = req.user?.did;
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }

    // Process image generation and get usage data
    const usageData = await processImageGeneration(req, res, 'v2');

    // Report usage with v2 specific parameters including userDid
    if (usageData && userDid && Config.creditBasedBillingEnabled) {
      await createAndReportUsageV2({
        type: 'imageGeneration',
        model: usageData.model,
        modelParams: usageData.modelParams,
        numberOfImageGeneration: usageData.numberOfImageGeneration,
        appId: req.appClient?.appId,
        userDid: userDid!,
      });
    }
  })
);

// TODO: Need to add credit based billing
router.post(
  '/audio/transcriptions',
  user,
  proxy('api.openai.com', {
    https: true,
    limit: '10mb',
    proxyReqPathResolver() {
      return '/v2/audio/transcriptions';
    },
    parseReqBody: false,
    async proxyReqOptDecorator(proxyReqOpts) {
      const { apiKey } = await getOpenAIV2();
      proxyReqOpts.headers!.Authorization = `Bearer ${apiKey}`;
      return proxyReqOpts;
    },
  })
);

// TODO: Need to add credit based billing
router.post(
  '/audio/speech',
  user,
  proxy('api.openai.com', {
    https: true,
    limit: '10mb',
    proxyReqPathResolver() {
      return '/v2/audio/speech';
    },
    async proxyReqOptDecorator(proxyReqOpts) {
      const { apiKey } = await getOpenAIV2();
      proxyReqOpts.headers!.Authorization = `Bearer ${apiKey}`;
      return proxyReqOpts;
    },
  })
);
export default router;
