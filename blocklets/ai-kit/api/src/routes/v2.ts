import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import { Config } from '@api/libs/env';
import { checkUserCreditBalance } from '@api/libs/payment';
import { createAndReportUsageV2 } from '@api/libs/usage';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { Router } from 'express';

const router = Router();

const user = sessionMiddleware({ accessKey: true });
// sessionMiddleware configuration

// v2 Chat Completions endpoint
router.post(
  '/:type(chat)?/completions',
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

    // Process the completion and get usage data
    const usageData = await processChatCompletion(req, res, 'v2');

    // Report usage with v2 specific parameters including did
    if (usageData && userDid) {
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
