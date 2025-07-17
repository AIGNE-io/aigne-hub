import { AIGNE } from '@aigne/core';
import { AIGNEObserver } from '@aigne/observability-api';
import { AIGNEHTTPServer } from '@aigne/transport/http-server/index';
import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import { AIGNE_HUB_DID, Config, OBSERVABILITY_DID } from '@api/libs/env';
import logger from '@api/libs/logger';
import { checkUserCreditBalance } from '@api/libs/payment';
import { createAndReportUsageV2 } from '@api/libs/usage';
import { checkModelRateAvailable } from '@api/providers';
import { call, getComponentMountPoint } from '@blocklet/sdk/lib/component';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import compression from 'compression';
import { Router } from 'express';

import { getModel } from '../providers/models';

const router = Router();

const user = sessionMiddleware({ accessKey: true });

AIGNEObserver.setExportFn(async (spans) => {
  if (!getComponentMountPoint(OBSERVABILITY_DID)) {
    logger.warn('Please install the Observability blocklet to enable tracing agents');
    return;
  }

  logger.info('Sending trace tree to Observability blocklet', { spans });

  await call({
    name: OBSERVABILITY_DID,
    method: 'POST',
    path: '/api/trace/tree',
    data: (spans || []).map((x: any) => {
      return {
        ...x,
        componentId: AIGNE_HUB_DID,
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
      throw new Error('User not authenticated');
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

export default router;
