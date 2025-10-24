import { getOpenAIV2, getReqModel } from '@api/libs/ai-provider';
import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import logger from '@api/libs/logger';
import { checkSubscription } from '@api/libs/payment';
import { createAndReportUsage } from '@api/libs/usage';
import App from '@api/store/models/app';
import { ensureRemoteComponentCall } from '@blocklet/aigne-hub/api/utils/auth';
import compression from 'compression';
import { Router } from 'express';
import proxy from 'express-http-proxy';

import { Config } from '../libs/env';
import onError from '../libs/on-error';
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
      await checkSubscription({ appId: req.appClient?.appId });
    }

    // Process the completion and get usage data
    await processChatCompletion(req, res, 'v1', {
      onEnd: async (data) => {
        if (data?.output) {
          const usageData = data.output;
          const usage = await createAndReportUsage({
            type: 'chatCompletion',
            promptTokens: (usageData.usage?.inputTokens as number) || 0,
            completionTokens: (usageData.usage?.outputTokens as number) || 0,
            model: getReqModel(req),
            modelParams: req.body?.options?.modelOptions,
          }).catch((err) => {
            logger.error('Create token usage v2 error', { error: err });
          });

          if (data.output.usage && usage) {
            data.output.usage = { ...data.output.usage, aigneHubCredits: usage };
          }
        }

        return data;
      },
      onError: (data) => {
        onError(data, req);
      },
    });
  })
);

// v1 Embeddings endpoint
router.post(
  '/embeddings',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  createRetryHandler(async (req, res) => {
    // v1 specific checks
    if (req.appClient?.appId) {
      await checkSubscription({ appId: req.appClient?.appId });
    }

    // Process embeddings and get usage data
    const usageData = await processEmbeddings(req, res);

    // Report usage with v1 specific parameters
    if (usageData) {
      await createAndReportUsage({
        type: 'embedding',
        promptTokens: usageData.promptTokens,
        model: usageData.model,
        appId: req.appClient?.appId,
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
      await checkSubscription({ appId: req.appClient?.appId });
    }

    // Process image generation and get usage data
    const usageData = await processImageGeneration({
      req,
      res,
      version: 'v1',
      inputBody: {
        ...req.body,
        responseFormat: req.body.response_format || req.body.responseFormat,
      },
    });

    let aigneHubCredits;
    // Report usage with v1 specific parameters
    if (usageData) {
      aigneHubCredits = await createAndReportUsage({
        type: 'imageGeneration',
        model: usageData.model,
        modelParams: usageData.modelParams,
        numberOfImageGeneration: usageData.numberOfImageGeneration,
        appId: req.appClient?.appId,
      });
    }

    res.json({
      images: usageData?.images,
      data: usageData?.images,
      model: usageData?.modelName,
      usage: {
        aigneHubCredits: Number(aigneHubCredits),
      },
    });
  })
);

router.post(
  '/audio/transcriptions',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  proxy('api.openai.com', {
    https: true,
    limit: '10mb',
    proxyReqPathResolver() {
      return '/v1/audio/transcriptions';
    },
    parseReqBody: false,
    async proxyReqOptDecorator(proxyReqOpts, srcReq) {
      const { apiKey } = await getOpenAIV2(srcReq);
      proxyReqOpts.headers!.Authorization = `Bearer ${apiKey}`;
      return proxyReqOpts;
    },
  })
);

router.post(
  '/audio/speech',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  proxy('api.openai.com', {
    https: true,
    limit: '10mb',
    proxyReqPathResolver() {
      return '/v1/audio/speech';
    },
    async proxyReqOptDecorator(proxyReqOpts, srcReq) {
      const { apiKey } = await getOpenAIV2(srcReq);
      proxyReqOpts.headers!.Authorization = `Bearer ${apiKey}`;
      return proxyReqOpts;
    },
  })
);

export default router;
