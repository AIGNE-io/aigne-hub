import { checkSubscription } from '@api/libs/payment';
import { createAndReportUsage } from '@api/libs/usage';
import { chatCompletion, checkModelAvailable } from '@api/providers';
import App from '@api/store/models/app';
import {
  ChatCompletionChunk,
  ChatCompletionInput,
  ChatCompletionResponse,
  EmbeddingInput,
  ImageGenerationInput,
} from '@blocklet/ai-kit/api/types';
import { ensureRemoteComponentCall } from '@blocklet/ai-kit/api/utils/auth';
import compression from 'compression';
import { Request, Response, Router } from 'express';
import proxy from 'express-http-proxy';
import Joi from 'joi';
import { getEncoding } from 'js-tiktoken';
import omit from 'lodash/omit';
import pick from 'lodash/pick';

import { getOpenAI } from '../libs/ai-provider';
import { Config } from '../libs/env';
import logger from '../libs/logger';
import { ensureAdmin, ensureComponentCall } from '../libs/security';

const router = Router();

router.get('/status', ensureComponentCall(ensureAdmin), (_, res) => {
  const { openaiApiKey } = Config;
  const arr = Array.isArray(openaiApiKey) ? openaiApiKey : [openaiApiKey];
  res.json({ available: !!arr.filter(Boolean).length });
});

const completionsRequestSchema = Joi.object<
  { model: string } & (
    | (ChatCompletionInput & { prompt: undefined })
    | (Omit<ChatCompletionInput, 'messages'> & { messages: undefined; prompt: string })
  )
>({
  model: Joi.string().empty(['', null]).default('gpt-3.5-turbo'),
  prompt: Joi.string(),
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('system', 'user', 'assistant', 'tool').required(),
      })
        .when(Joi.object({ role: Joi.valid('system') }).unknown(), {
          then: Joi.object({
            content: Joi.string().allow(null, '').required(),
            name: Joi.string().empty([null, '']),
          }),
        })
        .when(Joi.object({ role: Joi.valid('user') }).unknown(), {
          then: Joi.object({
            content: Joi.alternatives(
              Joi.string().allow(null, ''),
              Joi.array().items(
                Joi.object({
                  type: Joi.string().valid('text', 'image_url').required(),
                })
                  .when(Joi.object({ type: Joi.valid('text') }).unknown(), {
                    then: Joi.object({
                      text: Joi.string().required(),
                    }),
                  })
                  .when(Joi.object({ type: Joi.valid('image_url') }).unknown(), {
                    then: Joi.object({
                      imageUrl: Joi.object({
                        url: Joi.string().required(),
                      }).required(),
                    }),
                  })
              )
            ).required(),
            name: Joi.string().empty([null, '']),
          }),
        })
        .when(Joi.object({ role: Joi.valid('assistant') }).unknown(), {
          then: Joi.object({
            content: Joi.string().allow(null, '').required(),
            name: Joi.string().empty([null, '']),
            toolCalls: Joi.array().items(
              Joi.object({
                id: Joi.string().required(),
                type: Joi.string().valid('function').required(),
                function: Joi.object({
                  name: Joi.string().required(),
                  arguments: Joi.string().required(),
                }).required(),
              })
            ),
          }),
        })
        .when(Joi.object({ role: Joi.valid('tool') }).unknown(), {
          then: Joi.object({
            content: Joi.string().allow('').required(),
            toolCallId: Joi.string().required(),
          }),
        })
    )
    .min(1),
  stream: Joi.boolean().empty([null, '']),
  temperature: Joi.number().min(0).max(2).empty([null, '']),
  topP: Joi.number().min(0.1).max(1).empty([null, '']),
  presencePenalty: Joi.number().min(-2).max(2).empty([null, '']),
  frequencyPenalty: Joi.number().min(-2).max(2).empty([null, '']),
  maxTokens: Joi.number().integer().min(1).empty([null, '']),
  tools: Joi.array()
    .items(
      Joi.object({
        type: Joi.string().valid('function').required(),
        function: Joi.object({
          name: Joi.string().required(),
          description: Joi.string().empty([null, '']),
          parameters: Joi.object().pattern(Joi.string(), Joi.any()).required(),
        }).required(),
      })
    )
    .empty(Joi.array().length(0)),
}).xor('prompt', 'messages');

const retry = (callback: (req: Request, res: Response) => Promise<void>): any => {
  const options = { maxRetries: Config.maxRetries, retryCodes: [429, 500, 502] };

  function canRetry(code: number, retries: number) {
    return options.retryCodes.includes(code) && retries < options.maxRetries;
  }

  const fn = async (req: Request, res: Response, count: number = 0): Promise<void> => {
    try {
      await callback(req, res);
    } catch (error) {
      if (canRetry(error.response?.status, count)) {
        logger.info('retry', count);
        await fn(req, res, count + 1);
        return;
      }

      throw error;
    }
  };

  return async (req: Request, res: Response): Promise<void> => {
    await fn(req, res, 0);
  };
};

// TODO: completions 接口的 retry 机制需要重新实现，之前只是简单地在 catch 之后重新调用接口，没考虑到 event stream 中途报错的情况
// 一旦开始写入返回数据之后的报错应该直接返回错误后关闭连接
router.post(
  '/:type(chat)?/completions',
  compression(),
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  async (req, res) => {
    const body = await completionsRequestSchema.validateAsync(req.body, { stripUnknown: true });

    const input = {
      ...body,
      messages: typeof body.prompt === 'string' ? [{ role: 'user' as const, content: body.prompt }] : body.messages,
    };

    checkModelAvailable(input.model);

    if (req.appClient?.appId) await checkSubscription({ appId: req.appClient.appId });

    if (Config.verbose) logger.info('AI Kit completions input:', JSON.stringify(body, null, 2));

    res.setHeader('X-Accel-Buffering', 'no');

    const isEventStream = req.accepts().some((i) => i.startsWith('text/event-stream'));

    const result = chatCompletion(input);

    let content = '';
    const toolCalls: NonNullable<ChatCompletionChunk['delta']['toolCalls']> = [];

    const emitEventStreamChunk = (chunk: ChatCompletionResponse) => {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.flushHeaders();
      }

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.flush();
    };

    try {
      for await (const chunk of result) {
        content += chunk.delta?.content || '';
        if (chunk.delta?.toolCalls?.length) toolCalls.push(...chunk.delta.toolCalls);

        if (isEventStream) {
          emitEventStreamChunk(chunk);
        } else if (input.stream && chunk.delta?.content) {
          res.write(chunk.delta.content);
          res.flush();
        }
      }
    } catch (error) {
      logger.error('Run AI error', error);
      if (isEventStream) {
        emitEventStreamChunk({ error: { message: error.message } });
      } else if (input.stream) {
        res.write(`ERROR: ${error.message}`);
        res.flush();
      }
    }

    if (!input.stream && !isEventStream) {
      res.json({
        role: 'assistant',
        // Deprecated: use `content` instead.
        text: content,
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      });
    }

    res.end();

    if (Config.verbose) logger.info('AI Kit completions output:', { content, toolCalls });

    // TODO: 更精确的 token 计算，暂时简单地 stringify 之后按照 gpt3/4 的 token 算法计算，尤其 function call 的计算偏差较大，需要改进
    const promptUsedTokens = getEncoding('cl100k_base').encode(JSON.stringify(input.messages)).length;
    const completionUsedTokens = getEncoding('cl100k_base').encode(JSON.stringify({ content, toolCalls })).length;

    createAndReportUsage({
      type: 'chatCompletion',
      promptTokens: promptUsedTokens,
      completionTokens: completionUsedTokens,
      model: input.model,
      modelParams: pick(input, 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty', 'maxTokens'),
      appId: req.appClient?.appId,
    });
  }
);

const embeddingsRequestSchema = Joi.object<EmbeddingInput>({
  model: Joi.string().required(),
  input: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number(), Joi.array().items(Joi.number())))
    )
    .required(),
});

router.post(
  '/embeddings',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  retry(async (req, res) => {
    const input = await embeddingsRequestSchema.validateAsync(req.body, { stripUnknown: true });

    checkModelAvailable(input.model);

    if (req.appClient?.appId) await checkSubscription({ appId: req.appClient.appId });

    const openai = getOpenAI();

    const { data, usage } = await openai.embeddings.create(input);

    res.json({ data });

    createAndReportUsage({
      type: 'embedding',
      promptTokens: usage.prompt_tokens,
      model: input.model,
      appId: req.appClient?.appId,
    });
  })
);

const imageGenerationRequestSchema = Joi.object<
  ImageGenerationInput & Required<Pick<ImageGenerationInput, 'model' | 'n'>>
>({
  model: Joi.valid('dall-e-2', 'dall-e-3').empty(['', null]).default('dall-e-2'),
  prompt: Joi.string().required(),
  size: Joi.string().valid('256x256', '512x512', '1024x1024', '1024x1792', '1792x1024').empty(['', null]),
  n: Joi.number().min(1).max(10).empty([null]).default(1),
  responseFormat: Joi.string().valid('url', 'b64_json').empty([null]),
  style: Joi.string().valid('vivid', 'natural').empty([null]),
  quality: Joi.string().valid('standard', 'hd').empty([null]),
});

router.post(
  '/image/generations',
  ensureRemoteComponentCall(App.findPublicKeyById, ensureComponentCall(ensureAdmin)),
  retry(async (req, res) => {
    const input = await imageGenerationRequestSchema.validateAsync(
      {
        ...req.body,
        // Deprecated: 兼容 response_format 字段，一段时间以后删除
        responseFormat: req.body.response_format || req.body.responseFormat,
      },
      { stripUnknown: true }
    );

    checkModelAvailable(input.model);

    if (req.appClient?.appId) await checkSubscription({ appId: req.appClient.appId });

    if (Config.verbose) logger.info('AI Kit image generations input:', input);

    const openai = getOpenAI();

    const response = await openai.images.generate({
      ...omit(input, 'responseFormat'),
      response_format: input.responseFormat,
    });

    res.json({
      data: response.data.map((i) => ({
        // Deprecated: use b64Json instead
        b64_json: i.b64_json,
        b64Json: i.b64_json,
        url: i.url,
      })),
    });

    createAndReportUsage({
      type: 'imageGeneration',
      model: input.model,
      modelParams: pick(input, 'size', 'responseFormat', 'style', 'quality'),
      numberOfImageGeneration: input.n,
      appId: req.appClient?.appId,
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
    proxyReqOptDecorator(proxyReqOpts) {
      proxyReqOpts.headers!.Authorization = `Bearer ${getOpenAI().apiKey}`;
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
    proxyReqOptDecorator(proxyReqOpts) {
      proxyReqOpts.headers!.Authorization = `Bearer ${getOpenAI().apiKey}`;
      return proxyReqOpts;
    },
  })
);

export default router;
