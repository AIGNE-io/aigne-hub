import { auth, component } from '@blocklet/sdk/lib/middlewares';
import compression from 'compression';
import { Request, Response, Router } from 'express';
import proxy from 'express-http-proxy';
import { GPTTokens } from 'gpt-tokens';
import Joi from 'joi';
import omit from 'lodash/omit';
import pick from 'lodash/pick';
import OpenAI from 'openai';
import { EmbeddingCreateParams, ImageGenerateParams } from 'openai/resources';

import { getAIApiKey, getOpenAI } from '../libs/ai-provider';
import { Config } from '../libs/env';
import logger from '../libs/logger';
import { ensureAdmin } from '../libs/security';
import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '../providers';
import { geminiChatCompletion } from '../providers/gemini';
import { openaiChatCompletion } from '../providers/openai';
import Usage from '../store/models/usage';

const router = Router();

async function status(_: Request, res: Response) {
  const { openaiApiKey } = Config;
  const arr = Array.isArray(openaiApiKey) ? openaiApiKey : [openaiApiKey];
  res.json({ available: !!arr.filter(Boolean).length });
}

router.get('/status', ensureAdmin, status);
router.get('/sdk/status', component.verifySig, status);

const completionsRequestSchema = Joi.object<
  { stream?: boolean } & (
    | (ChatCompletionInput & { prompt: undefined })
    | (Omit<ChatCompletionInput, 'messages'> & { messages: undefined; prompt: string })
  )
>({
  model: Joi.string().default('gpt-3.5-turbo'),
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

async function completions(req: Request, res: Response) {
  const body = await completionsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  const isEventStream = req.accepts().some((i) => i.startsWith('text/event-stream'));

  const messages = body.messages ?? [{ role: 'user', content: body.prompt }];

  if (Config.verbose) logger.log('AI Kit completions input:', JSON.stringify(body, null, 2));

  const openai = getOpenAI();

  const input = {
    ...body,
    messages: typeof body.prompt === 'string' ? [{ role: 'user' as const, content: body.prompt }] : body.messages,
  };

  const result = body.model.startsWith('gemini')
    ? geminiChatCompletion(input, { apiKey: getAIApiKey('gemini') })
    : body.model.startsWith('gpt')
    ? openaiChatCompletion(input, getOpenAI())
    : body.model.startsWith('openRouter/')
    ? openaiChatCompletion(
        { ...input, model: body.model.replace('openRouter/', '') },
        new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: getAIApiKey('openRouter') })
      )
    : (() => {
        throw new Error(`Unsupported model ${body.model}`);
      })();

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
      }
    }
  } catch (error) {
    console.error('Run AI error', error);
    if (isEventStream) {
      emitEventStreamChunk({ error: { message: error.message } });
    } else if (input.stream) {
      res.write(`ERROR: ${error.message}`);
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

  // FIXME: GPTTokens 暂不支持计算 function 的 tokens
  const tokens = new GPTTokens({
    model: 'gpt-3.5-turbo',
    messages: messages
      .concat({ role: 'assistant', content })
      .filter(
        (i): i is ConstructorParameters<typeof GPTTokens>[0]['messages'][number] =>
          ['system', 'user', 'assistant'].includes(i.role) && typeof i.content === 'string'
      )
      .map((i) => pick(i, 'name', 'role', 'content')),
  });

  await Usage.create({
    promptTokens: tokens.promptUsedTokens,
    completionTokens: tokens.completionUsedTokens,
    apiKey: openai.apiKey,
  });

  if (Config.verbose) logger.log('AI Kit completions output:', { content });
}

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

router.post('/completions', compression(), ensureAdmin, retry(completions));
router.post('/sdk/completions', compression(), component.verifySig, retry(completions));

const embeddingsRequestSchema = Joi.object<EmbeddingCreateParams>({
  model: Joi.string().required(),
  input: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).required(),
  user: Joi.string().empty(Joi.valid('', null)),
});

async function embeddings(req: Request, res: Response) {
  const input = await embeddingsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  const openai = getOpenAI();

  const { data } = await openai.embeddings.create(input);

  res.json({ data });
}

router.post('/embeddings', ensureAdmin, retry(embeddings));
router.post('/sdk/embeddings', component.verifySig, retry(embeddings));

const imageGenerationRequestSchema = Joi.object<{
  model?: ImageGenerateParams['model'];
  prompt: string;
  size?: ImageGenerateParams['size'];
  n?: number;
  responseFormat?: ImageGenerateParams['response_format'];
  style?: ImageGenerateParams['style'];
  quality?: ImageGenerateParams['quality'];
}>({
  model: Joi.valid('dall-e-2', 'dall-e-3').empty(['', null]),
  prompt: Joi.string().required(),
  size: Joi.string().valid('256x256', '512x512', '1024x1024', '1024x1792', '1792x1024').empty(['', null]),
  n: Joi.number().min(1).max(10).empty([null]),
  responseFormat: Joi.string().valid('url', 'b64_json').empty([null]),
  style: Joi.string().valid('vivid', 'natural').empty([null]),
  quality: Joi.string().valid('standard', 'hd').empty([null]),
});

async function imageGenerations(req: Request, res: Response) {
  const input = await imageGenerationRequestSchema.validateAsync(
    {
      ...req.body,
      // Deprecated: 兼容 response_format 字段，一段时间以后删除
      responseFormat: req.body.response_format || req.body.responseFormat,
    },
    { stripUnknown: true }
  );

  if (Config.verbose) logger.log('AI Kit image generations input:', input);

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
}

router.post('/image/generations', ensureAdmin, retry(imageGenerations));
router.post('/sdk/image/generations', component.verifySig, retry(imageGenerations));

const audioTranscriptions = proxy('api.openai.com', {
  https: true,
  limit: '10mb',
  proxyReqPathResolver() {
    return '/v1/audio/transcriptions';
  },
  proxyReqOptDecorator(proxyReqOpts) {
    proxyReqOpts.headers!.Authorization = `Bearer ${getOpenAI().apiKey}`;
    return proxyReqOpts;
  },
});

router.post('/audio/transcriptions', auth(), audioTranscriptions);
router.post('/sdk/audio/transcriptions', component.verifySig, audioTranscriptions);

const audioSpeech = proxy('api.openai.com', {
  https: true,
  limit: '10mb',
  proxyReqPathResolver() {
    return '/v1/audio/speech';
  },
  proxyReqOptDecorator(proxyReqOpts) {
    proxyReqOpts.headers!.Authorization = `Bearer ${getOpenAI().apiKey}`;
    return proxyReqOpts;
  },
});

router.post('/audio/speech', auth(), audioSpeech);
router.post('/sdk/audio/speech', component.verifySig, audioSpeech);

export default router;
