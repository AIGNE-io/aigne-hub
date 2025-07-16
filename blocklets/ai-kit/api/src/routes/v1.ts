import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import { checkSubscription } from '@api/libs/payment';
import { createAndReportUsage } from '@api/libs/usage';
import App from '@api/store/models/app';
import { ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import compression from 'compression';
import { Router } from 'express';

import { Config } from '../libs/env';
import { ensureAdmin, ensureComponentCall } from '../libs/security';

const router = Router();

router.get('/status', ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)), (_, res) => {
  const { openaiApiKey } = Config;
  const arr = Array.isArray(openaiApiKey) ? openaiApiKey : [openaiApiKey];
  res.json({ available: !!arr.filter(Boolean).length });
});

// v1 Chat Completions endpoint
router.post(
  '/:type(chat)?/completions',
  compression(),
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  createRetryHandler(async (req, res) => {
    // v1 specific checks
    if (req.appClient?.appId) {
      await checkSubscription({ appId: req.appClient!.appId });
    }

    // Process the completion and get usage data
    const usageData = await processChatCompletion(req, res, 'v1');

    // Report usage with v1 specific parameters
    if (usageData) {
      await createAndReportUsage({
        type: 'chatCompletion',
        promptTokens: usageData.promptTokens,
        completionTokens: usageData.completionTokens,
        model: usageData.model,
        modelParams: usageData.modelParams,
        appId: req.appClient!.appId,
      });
    }
  })
);

// v1 Embeddings endpoint
router.post(
  '/embeddings',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  createRetryHandler(async (req, res) => {
    // v1 specific checks
    if (req.appClient?.appId) {
      await checkSubscription({ appId: req.appClient!.appId });
    }

    // Process embeddings and get usage data
    const usageData = await processEmbeddings(req, res);

    // Report usage with v1 specific parameters
    if (usageData) {
      await createAndReportUsage({
        type: 'embedding',
        promptTokens: usageData.promptTokens,
        model: usageData.model,
        appId: req.appClient!.appId,
      });
    }
  })
);

// v1 Image Generation endpoint
router.post(
  '/image/generations',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  createRetryHandler(async (req, res) => {
    // v1 specific checks
    if (req.appClient?.appId) {
      await checkSubscription({ appId: req.appClient!.appId });
    }

    // Process image generation and get usage data
    const usageData = await processImageGeneration(req, res, 'v1');

    // Report usage with v1 specific parameters
    if (usageData) {
      await createAndReportUsage({
        type: 'imageGeneration',
        model: usageData.model,
        modelParams: usageData.modelParams,
        numberOfImageGeneration: usageData.numberOfImageGeneration,
        appId: req.appClient!.appId,
      });
    }
  })
);

export default router;
