import { AIGNE } from '@aigne/core';
import { AIGNEObserver } from '@aigne/observability-api';
import { AIGNEHTTPServer } from '@aigne/transport/http-server/index';
import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import { Config } from '@api/libs/env';
import logger from '@api/libs/logger';
import { checkUserCreditBalance } from '@api/libs/payment';
import { createAndReportUsageV2 } from '@api/libs/usage';
import { call, getComponentMountPoint } from '@blocklet/sdk/lib/component';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import compression from 'compression';
import { Router } from 'express';

import { getModel } from '../providers/models';

const router = Router();

const user = sessionMiddleware({ accessKey: true });

// @ts-ignore
const OBSERVABILITY_BLOCKLET_DID = 'z2qa2GCqPJkufzqF98D8o7PWHrRRSHpYkNhEh';
const AIGNE_HUB_BLOCKLET_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';

AIGNEObserver.setExportFn(async (spans) => {
  if (!getComponentMountPoint(OBSERVABILITY_BLOCKLET_DID)) {
    logger.warn('Please install the Observability blocklet to enable tracing agents');
    return;
  }

  await call({
    name: OBSERVABILITY_BLOCKLET_DID,
    method: 'POST',
    path: '/api/trace/tree',
    data: (spans || []).map((x: any) => {
      return {
        ...x,
        componentId: AIGNE_HUB_BLOCKLET_DID,
      };
    }),
  }).catch((err) => {
    logger.error('Failed to send trace tree to Observability blocklet', err);
  });
});

router.post('/:type(chat)?/completions', compression(), user, async (req, res) => {
  const userDid = req.user?.did;
  if (!userDid) {
    throw new Error('User not authenticated');
  }
  if (userDid && Config.creditBasedBillingEnabled) {
    await checkUserCreditBalance({ userDid });
  }
  // Process the completion and get usage data
  const usageData = await processChatCompletion(req, res, 'v2');

  // Report usage with v1 specific parameters
  if (usageData) {
    await createAndReportUsageV2({
      type: 'chatCompletion',
      promptTokens: usageData.promptTokens,
      completionTokens: usageData.completionTokens,
      model: usageData.model,
      modelParams: usageData.modelParams,
      appId: req.appClient?.appId,
      userDid: userDid!,
    });
  }
});

// v2 Chat Completions endpoint
router.post(
  '/chat',
  user,
  createRetryHandler(async (req, res) => {
    // v2 specific checks
    const userDid = req.user?.did;
    if (!userDid) {
      throw new Error('User not authenticated');
    }
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }

    const model = getModel(req.body, {
      modelOptions: req.body?.options?.modelOptions,
    });
    const engine = new AIGNE({ model });
    const aigneServer = new AIGNEHTTPServer(engine);
    await aigneServer.invoke(req, res, { userContext: { userId: req.user?.did } });
    // const usageData = {
    //   promptTokens: output.,
    //   completionTokens: 0,
    //   model: model,
    //   modelParams: {},
    // };
    // if (usageData && userDid) {
    //   await createAndReportUsageV2({
    //     type: 'chatCompletion',
    //     promptTokens: usageData.promptTokens,
    //     completionTokens: usageData.completionTokens,
    //     model: usageData.model,
    //     modelParams: usageData.modelParams,
    //     userDid: userDid!,
    //   });
    // }
  })
);

// v2 Embeddings endpoint
router.post(
  '/embeddings',
  user,
  createRetryHandler(async (req, res) => {
    // v2 specific checks
    const userDid = req.user?.did;
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }

    // Process embeddings and get usage data
    const usageData = await processEmbeddings(req, res);

    // Report usage with v2 specific parameters including did
    if (usageData && userDid) {
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
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }

    // Process image generation and get usage data
    const usageData = await processImageGeneration(req, res, 'v2');

    // Report usage with v2 specific parameters including userDid
    if (usageData && userDid) {
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

export default router;
