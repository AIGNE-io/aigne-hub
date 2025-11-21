import { findImageModel, findVideoModel, parseModel } from '@aigne/aigne-hub';
import { AIGNE, ChatModelOutput, Message, imageModelInputSchema, videoModelInputSchema } from '@aigne/core';
import { checkArguments, pick } from '@aigne/core/utils/type-utils';
import { AIGNEHTTPServer, invokePayloadSchema } from '@aigne/transport/http-server/index';
import { getModelNameWithProvider, getOpenAIV2, getReqModel } from '@api/libs/ai-provider';
import {
  createRetryHandler,
  processChatCompletion,
  processEmbeddings,
  processImageGeneration,
} from '@api/libs/ai-routes';
import { Config } from '@api/libs/env';
import logger from '@api/libs/logger';
import { checkUserCreditBalance, isPaymentRunning } from '@api/libs/payment';
import { withModelStatus } from '@api/libs/status';
import { createUsageAndCompleteModelCall } from '@api/libs/usage';
import { createModelCallMiddleware, getMaxProviderRetriesMiddleware } from '@api/middlewares/model-call-tracker';
import { checkModelRateAvailable } from '@api/providers';
import AiCredential from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { CustomError } from '@blocklet/error';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import compression from 'compression';
import { NextFunction, Request, Response, Router } from 'express';
import proxy from 'express-http-proxy';
import Joi from 'joi';

import { DEFAULT_IMAGE_MODEL, DEFAULT_MODEL, DEFAULT_VIDEO_MODEL } from '../libs/constants';
import onError from '../libs/on-error';
import convertMediaToOnlineUrl from '../libs/upload-to-media-kit';
import { getModel, getProviderCredentials } from '../providers/models';

const router = Router();

const aigneHubModelCallSchema = Joi.object({
  input: Joi.object({
    modelOptions: Joi.object({ model: Joi.string().required() }).pattern(Joi.string(), Joi.any()).required(),
  })
    .pattern(Joi.string(), Joi.any())
    .required(),
  agent: Joi.string().optional(),
  options: Joi.object({
    returnProgressChunks: Joi.boolean().optional(),
    userContext: Joi.object().optional(),
    memories: Joi.array().items(Joi.any()).optional(),
    streaming: Joi.boolean().optional(),
  }).optional(),
});

const aigneHubModelBodyValidate = (body: Request['body']) => {
  if (!body) {
    throw new CustomError(400, 'Request body is required');
  }

  const { error, value } = aigneHubModelCallSchema.validate(
    {
      ...body,
      input: {
        ...body.input,
        modelOptions: {
          ...body.input?.modelOptions,
          model: body.input?.modelOptions?.model || body.model || DEFAULT_MODEL,
        },
      },
    },
    { stripUnknown: true }
  );

  if (error) {
    throw new CustomError(400, `Validation error: ${error.details.map((d) => d.message).join(', ')}`);
  }

  return value;
};

const user = sessionMiddleware({ accessKey: true });

const maxProviderRetriesMiddleware = getMaxProviderRetriesMiddleware();
const chatCallTracker = createModelCallMiddleware('chatCompletion');
const embeddingCallTracker = createModelCallMiddleware('embedding');
const imageCallTracker = createModelCallMiddleware('imageGeneration');
const videoCallTracker = createModelCallMiddleware('video');

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

const checkCreditBasedBillingMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const userDid = req.user?.did;
  if (!userDid) {
    throw new CustomError(401, 'User not authenticated');
  }

  if (Config.creditBasedBillingEnabled && !isPaymentRunning()) {
    throw new CustomError(502, 'Payment kit is not Running');
  }
  next();
};

router.post(
  '/:type(chat)?/completions',
  compression(),
  user,
  checkCreditBasedBillingMiddleware,
  maxProviderRetriesMiddleware,
  createRetryHandler([
    chatCallTracker,
    withModelStatus(async (req, res) => {
      const userDid = req.user?.did;

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
              promptTokens: usageData.usage?.inputTokens || 0,
              completionTokens: usageData.usage?.outputTokens || 0,
              model: getReqModel(req),
              modelParams: req.body?.options?.modelOptions,
              appId: req.headers['x-aigne-hub-client-did'] as string,
              userDid: userDid!,
              creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
              additionalMetrics: {
                totalTokens: (usageData.usage?.inputTokens || 0) + (usageData.usage?.outputTokens || 0),
              },
              metadata: {
                endpoint: req.path,
                responseId: data.output.id,
                model: data.output.model,
              },
              traceId: data.context?.id,
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

            if (data.output) {
              data.output.modelWithProvider = getReqModel(req) || DEFAULT_MODEL;
            }
          }
          return data;
        },
        onError: async (data) => {
          onError(data, req);
        },
      });
    }),
  ])
);

router.post(
  '/chat',
  user,
  checkCreditBasedBillingMiddleware,
  maxProviderRetriesMiddleware,
  createRetryHandler([
    chatCallTracker,
    withModelStatus(async (req, res) => {
      const value = aigneHubModelBodyValidate(req.body);

      const userDid = req.user?.did;

      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }

      const { modelOptions } = value.input;
      await checkModelRateAvailable(modelOptions.model);

      const { modelInstance: model } = await getModel(modelOptions, { modelOptions, req });
      if (modelOptions) {
        delete req.body.input.modelOptions;
      }

      const engine = new AIGNE({ model });
      const aigneServer = new AIGNEHTTPServer(engine);
      logger.info('chat completions model with provider', getReqModel(req));

      await new Promise((resolve, reject) => {
        aigneServer.invoke(req, res, {
          userContext: { userId: req.user?.did, ...value.options?.userContext },
          hooks: {
            onEnd: async (data) => {
              const usageData: ChatModelOutput = data.output;

              if (usageData) {
                const usage = await createUsageAndCompleteModelCall({
                  req,
                  type: 'chatCompletion',
                  promptTokens: usageData.usage?.inputTokens || 0,
                  completionTokens: usageData.usage?.outputTokens || 0,
                  model: modelOptions?.model,
                  modelParams: modelOptions,
                  userDid: userDid!,
                  appId: req.headers['x-aigne-hub-client-did'] as string,
                  creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
                  additionalMetrics: {
                    totalTokens: (usageData.usage?.inputTokens || 0) + (usageData.usage?.outputTokens || 0),
                    endpoint: req.path,
                  },
                  traceId: data.context?.id,
                }).catch((err) => {
                  logger.error('Create usage and complete model call error', { error: err });
                  return undefined;
                });

                logger.info('usage', data.output.usage, Config.creditBasedBillingEnabled, usage);

                if (data.output.usage && Config.creditBasedBillingEnabled && usage) {
                  data.output.usage = {
                    ...data.output.usage,
                    aigneHubCredits: usage,
                    modelCallId: req.modelCallContext?.id,
                  };
                }

                if (data.output) {
                  data.output.modelWithProvider = getReqModel(req);
                }
              }

              if (value.input?.outputFileType === 'url' && usageData?.files && usageData.files?.length > 0) {
                const list = await Promise.all(
                  usageData.files.map(async (file) => {
                    if (file.type === 'local' && file.path) {
                      try {
                        return await convertMediaToOnlineUrl(file.path, file?.mimeType || 'image/png');
                      } catch (err) {
                        logger.error('Failed to upload image to MediaKit', { error: err });
                        return file;
                      }
                    }

                    return file;
                  })
                );

                usageData.files = list;
              }

              resolve(data);

              return data;
            },
            onError: async (data) => {
              onError(data, req);
              reject(data.error);
            },
          },
        });
      });
    }),
  ])
);

router.post(
  '/image',
  user,
  checkCreditBasedBillingMiddleware,
  maxProviderRetriesMiddleware,
  createRetryHandler([
    imageCallTracker,
    withModelStatus(async (req, res) => {
      const body = checkArguments('Check image generation payload', invokePayloadSchema, req.body);
      const input = checkArguments('Check image model input', imageModelInputSchema.passthrough(), body.input);

      const userDid = req.user?.did;

      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }

      const m = getReqModel(req) || DEFAULT_IMAGE_MODEL;

      const { provider, model } = parseModel(m);
      if (!provider || !model) throw new CustomError(400, `Invalid model format: ${m}, should be {provider}/{model}`);

      await checkModelRateAvailable(m);

      const { match: M } = findImageModel(provider);
      if (!M) throw new CustomError(400, `Image model provider ${provider} not found`);
      const credential = await getProviderCredentials(provider, { modelCallContext: req.modelCallContext, model });
      req.credentialId = credential.id;
      const modelInstance = M.create(credential);

      let traceId;

      const aigne = new AIGNE();
      logger.info('image completions model with provider', getReqModel(req));

      const response = await aigne.invoke(
        modelInstance,
        {
          ...input,
          outputFileType: input.outputFileType === 'url' ? 'local' : input.outputFileType,
          modelOptions: { ...input.modelOptions, model },
        },
        {
          userContext: { ...body.options?.userContext, userId: req.user?.did },
          hooks: {
            onEnd: async (data) => {
              traceId = data?.context?.id;
              return data;
            },
            onError: async (data) => {
              onError(data, req);
            },
          },
        }
      );

      let aigneHubCredits: number | undefined;

      if (response.usage && userDid) {
        aigneHubCredits = await createUsageAndCompleteModelCall({
          req,
          type: 'imageGeneration',
          model: m,
          modelParams: pick(input as Message, 'size', 'responseFormat', 'style', 'quality'),
          promptTokens: response.usage.inputTokens,
          completionTokens: response.usage.outputTokens,
          numberOfImageGeneration: response.images.length,
          appId: req.headers['x-aigne-hub-client-did'] as string,
          userDid: userDid!,
          creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
          additionalMetrics: {
            imageSize: (input as Message).size,
            imageQuality: (input as Message).quality,
            imageStyle: (input as Message).style,
            totalTokens: (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0),
          },
          metadata: {
            endpoint: req.path,
            numberOfImages: response.images.length,
          },
          traceId,
        });
      }

      if (input?.outputFileType === 'url' && response.images.length > 0) {
        const list = await Promise.all(
          response.images.map(async (image) => {
            if (image.type === 'local' && image.path) {
              try {
                return await convertMediaToOnlineUrl(image.path, image?.mimeType || 'image/png');
              } catch (err) {
                logger.error('Failed to upload image to MediaKit', { error: err });
                return image;
              }
            }

            return image;
          })
        );

        response.images = list;
      }

      res.json({ ...response, usage: { ...response.usage, aigneHubCredits }, modelWithProvider: getReqModel(req) });
    }),
  ])
);

router.post(
  '/video',
  user,
  checkCreditBasedBillingMiddleware,
  maxProviderRetriesMiddleware,
  createRetryHandler([
    videoCallTracker,
    withModelStatus(async (req, res) => {
      const body = checkArguments('Check video generation payload', invokePayloadSchema, req.body);
      const input = checkArguments('Check video model input', videoModelInputSchema.passthrough(), body.input);
      const modelOptions = input.modelOptions as { model?: string };

      const userDid = req.user?.did;

      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }

      const m = getReqModel(req) || DEFAULT_VIDEO_MODEL;

      const { provider, model } = parseModel(m);
      if (!provider || !model) throw new CustomError(400, `Invalid model format: ${m}, should be {provider}/{model}`);

      await checkModelRateAvailable(m);

      const { match: M } = findVideoModel(provider);
      if (!M) throw new CustomError(400, `Video model provider ${provider} not found`);
      const credential = await getProviderCredentials(provider, { modelCallContext: req.modelCallContext, model });
      const modelInstance = M.create(credential);

      let traceId;

      const aigne = new AIGNE();
      logger.info('video completions model with provider', getReqModel(req));

      const response = await aigne.invoke(
        modelInstance,
        {
          ...input,
          model,
          outputFileType: input.outputFileType === 'url' ? 'local' : input.outputFileType,
          modelOptions: { ...modelOptions, model },
        },
        {
          userContext: { ...body.options?.userContext, userId: req.user?.did },
          hooks: {
            onEnd: async (data) => {
              traceId = data?.context?.id;
              return data;
            },
            onError: async (data) => {
              onError(data, req);
            },
          },
        }
      );

      let aigneHubCredits: number | undefined;

      if (response.usage && userDid) {
        aigneHubCredits = await createUsageAndCompleteModelCall({
          req,
          type: 'video',
          model: m,
          modelParams: input,
          promptTokens: response.usage.inputTokens,
          completionTokens: response.usage.outputTokens,
          numberOfImageGeneration: response.videos.length,
          mediaDuration: response.seconds,
          appId: req.headers['x-aigne-hub-client-did'] as string,
          userDid: userDid!,
          creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
          additionalMetrics: {
            totalTokens: (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0),
          },
          metadata: {
            endpoint: req.path,
            numberOfVideos: response.videos.length,
          },
          traceId,
        });
      }

      if (input?.outputFileType === 'url' && response.videos.length > 0) {
        const list = await Promise.all(
          response.videos.map(async (video) => {
            if (video.type === 'local' && video.path) {
              try {
                return await convertMediaToOnlineUrl(video.path, video?.mimeType || 'video/mp4');
              } catch (err) {
                logger.error('Failed to upload video to MediaKit', { error: err });
                return video;
              }
            }

            return video;
          })
        );

        response.videos = list;
      }

      res.json({ ...response, usage: { ...response.usage, aigneHubCredits }, modelWithProvider: getReqModel(req) });
    }),
  ])
);

router.post(
  '/embeddings',
  user,
  checkCreditBasedBillingMiddleware,
  maxProviderRetriesMiddleware,
  createRetryHandler([
    embeddingCallTracker,
    withModelStatus(async (req, res) => {
      const userDid = req.user?.did;

      if (userDid && Config.creditBasedBillingEnabled) {
        await checkUserCreditBalance({ userDid });
      }

      const usageData = await processEmbeddings(req, res);

      if (usageData && userDid) {
        await createUsageAndCompleteModelCall({
          req,
          type: 'embedding',
          promptTokens: usageData.promptTokens,
          completionTokens: 0,
          model: usageData.model,
          userDid: userDid!,
          appId: req.headers['x-aigne-hub-client-did'] as string,
          creditBasedBillingEnabled: Config.creditBasedBillingEnabled,
          additionalMetrics: {},
          metadata: {
            endpoint: req.path,
            inputText: Array.isArray(req.body?.input) ? req.body.input.length : 1,
          },
        }).catch((err) => {
          logger.error('Create usage and complete model call error', { error: err });
          return undefined;
        });
      }
    }),
  ])
);

router.post(
  '/image/generations',
  user,
  checkCreditBasedBillingMiddleware,
  maxProviderRetriesMiddleware,
  createRetryHandler([
    imageCallTracker,
    withModelStatus(async (req, res) => {
      const userDid = req.user?.did;

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
    }),
  ])
);

router.post(
  '/audio/transcriptions',
  user,
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
  user,
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
