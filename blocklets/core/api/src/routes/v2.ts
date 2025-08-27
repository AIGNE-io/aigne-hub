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
import logger from '@api/libs/logger';
import { checkUserCreditBalance, isPaymentRunning } from '@api/libs/payment';
import { createUsageAndCompleteModelCall, handleModelCallError } from '@api/libs/usage';
import { createModelCallMiddleware } from '@api/middlewares/model-call-tracker';
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

const chatCallTracker = createModelCallMiddleware('chatCompletion');
const embeddingCallTracker = createModelCallMiddleware('embedding');
const imageCallTracker = createModelCallMiddleware('imageGeneration');

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

router.post('/:type(chat)?/completions', compression(), user, chatCallTracker, async (req, res) => {
  const userDid = req.user?.did;
  if (!userDid) {
    throw new CustomError(401, 'User not authenticated');
  }
  if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
    throw new CustomError(502, 'Payment kit is not Running');
  }

  try {
    if (userDid && Config.creditBasedBillingEnabled) {
      await checkUserCreditBalance({ userDid });
    }
    await processChatCompletion(req, res, 'v2', {
      onEnd: async (data) => {
        if (data?.output) {
          const usageData = data.output;

          const usage = await createUsageAndCompleteModelCall({
            req,
            type: 'chatCompletion',
            promptTokens: (usageData.usage?.inputTokens as number) || 0,
            completionTokens: (usageData.usage?.outputTokens as number) || 0,
            model: req.body?.model as string,
            modelParams: req.body?.options?.modelOptions,
            appId: req.headers['x-aigne-hub-client-did'] as string,
            userDid: userDid!,
            creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
            additionalMetrics: {
              totalTokens: (usageData.usage as any)?.totalTokens, // Real usage metric
            },
            metadata: {
              endpoint: req.path, // Move to metadata
              responseId: data.output.id,
              model: data.output.model,
            },
          }).catch((err) => {
            logger.error('Create usage and complete model call error', { error: err });
            return undefined;
          });

          if (data.output.usage && Config.creditBasedBillingEnabled && usage) {
            data.output.usage = {
              ...data.output.usage,
              aigneHubCredits: usage,
              modelCallId: req.modelCallContext?.id,
            } as any;
          }
        }
        return data;
      },
    });
  } catch (error) {
    handleModelCallError(req, error);
    throw error;
  }
});

router.post(
  '/chat',
  user,
  chatCallTracker,
  createRetryHandler(async (req, res) => {
    const userDid = req.user?.did;
    if (!userDid) {
      throw new CustomError(401, 'User not authenticated');
    }
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }

    try {
      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }
      await checkModelRateAvailable(req.body.model);
      const model = await getModel(req.body, {
        modelOptions: req.body?.options?.modelOptions,
        req, // Pass request for ModelCall context updating
      });

      const engine = new AIGNE({ model });
      const aigneServer = new AIGNEHTTPServer(engine);

      await aigneServer.invoke(req, res, {
        userContext: { userId: req.user?.did },
        hooks: {
          onEnd: async (data) => {
            const usageData = data.output;
            if (usageData) {
              const usage = await createUsageAndCompleteModelCall({
                req,
                type: 'chatCompletion',
                promptTokens: (usageData.usage?.inputTokens as number) || 0,
                completionTokens: (usageData.usage?.outputTokens as number) || 0,
                model: req.body?.model as string,
                modelParams: req.body?.options?.modelOptions,
                userDid: userDid!,
                appId: req.headers['x-aigne-hub-client-did'] as string,
                creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
                additionalMetrics: {
                  totalTokens: (usageData.usage as any)?.totalTokens,
                  endpoint: req.path,
                },
              }).catch((err) => {
                logger.error('Create usage and complete model call error', { error: err });
                return undefined;
              });

              if (data.output.usage && Config.creditBasedBillingEnabled && usage) {
                data.output.usage = {
                  ...data.output.usage,
                  aigneHubCredits: usage,
                  modelCallId: req.modelCallContext?.id,
                };
              }
            }
            return data;
          },
        },
      });
    } catch (error) {
      handleModelCallError(req, error);
      throw error;
    }
  })
);

router.post(
  '/image',
  user,
  imageCallTracker,
  createRetryHandler(async (req, res) => {
    const userDid = req.user?.did;
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }

    try {
      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }

      const usageData = await processImageGeneration({
        req,
        res,
        version: 'v2',
        inputBody: {
          model: req.body.model,
          ...req.body.input,
          ...req.body.options?.modelOptions,
          responseFormat: req.body.input.response_format || req.body.input.responseFormat,
        },
      });

      let aigneHubCredits;
      if (usageData && userDid) {
        aigneHubCredits = await createUsageAndCompleteModelCall({
          req,
          type: 'imageGeneration',
          model: usageData.model,
          modelParams: usageData.modelParams,
          numberOfImageGeneration: usageData.numberOfImageGeneration,
          appId: req.headers['x-aigne-hub-client-did'] as string,
          userDid: userDid!,
          creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
          additionalMetrics: {
            imageSize: usageData.modelParams?.size,
            imageQuality: usageData.modelParams?.quality,
            imageStyle: usageData.modelParams?.style,
          },
          metadata: {
            endpoint: req.path,
            numberOfImages: usageData.numberOfImageGeneration,
          },
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
    } catch (error) {
      handleModelCallError(req, error);
      throw error;
    }
  })
);

// v2 Embeddings endpoint
router.post(
  '/embeddings',
  user,
  embeddingCallTracker,
  createRetryHandler(async (req, res) => {
    const userDid = req.user?.did;
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }

    try {
      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }
      const usageData = await processEmbeddings(req, res);

      if (usageData && userDid) {
        await createUsageAndCompleteModelCall({
          req,
          type: 'embedding',
          promptTokens: usageData.promptTokens,
          completionTokens: 0, // Embeddings don't have completion tokens
          model: usageData.model,
          userDid: userDid!,
          appId: req.headers['x-aigne-hub-client-did'] as string,
          creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
          additionalMetrics: {
            // No additional usage metrics for embeddings
          },
          metadata: {
            endpoint: req.path,
            inputText: Array.isArray(req.body?.input) ? req.body.input.length : 1,
          },
        }).catch((err) => {
          logger.error('Create usage and complete model call error', { error: err });
          return undefined;
        });
      }
    } catch (error) {
      handleModelCallError(req, error);
      throw error;
    }
  })
);

// v2 Image Generation endpoint
router.post(
  '/image/generations',
  user,
  imageCallTracker,
  createRetryHandler(async (req, res) => {
    const userDid = req.user?.did;
    if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
      throw new CustomError(502, 'Payment kit is not Running');
    }

    try {
      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }

      const usageData = await processImageGeneration({
        req,
        res,
        version: 'v2',
        inputBody: {
          ...req.body,
          responseFormat: req.body.response_format || req.body.responseFormat,
        },
      });

      let aigneHubCredits;
      if (usageData && userDid) {
        aigneHubCredits = await createUsageAndCompleteModelCall({
          req,
          type: 'imageGeneration',
          model: usageData.model,
          modelParams: usageData.modelParams,
          numberOfImageGeneration: usageData.numberOfImageGeneration,
          appId: req.headers['x-aigne-hub-client-did'] as string,
          userDid: userDid!,
          creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
          additionalMetrics: {
            imageSize: usageData.modelParams?.size,
            imageQuality: usageData.modelParams?.quality,
            imageStyle: usageData.modelParams?.style,
          },
          metadata: {
            endpoint: req.path,
            numberOfImages: usageData.numberOfImageGeneration,
          },
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
    } catch (error) {
      handleModelCallError(req, error);
      throw error;
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
