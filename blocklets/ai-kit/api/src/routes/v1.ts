import { IncomingMessage } from 'http';

import Config from '@blocklet/sdk/lib/config';
import { auth, component } from '@blocklet/sdk/lib/middlewares';
import { AxiosResponse } from 'axios';
import { ParsedEvent, ReconnectInterval, createParser } from 'eventsource-parser';
import { Request, Response, Router } from 'express';
import proxy from 'express-http-proxy';
import { GPTTokens } from 'gpt-tokens';
import Joi from 'joi';
import {
  ChatCompletionRequestMessage,
  CreateEmbeddingRequest,
  CreateImageRequestResponseFormatEnum,
  CreateImageRequestSizeEnum,
} from 'openai';

import { getAIProvider } from '../libs/ai-provider';
import env from '../libs/env';
import logger from '../libs/logger';
import { ensureAdmin } from '../libs/security';
import Usage from '../store/models/usage';

const router = Router();

async function status(_: Request, res: Response) {
  const { openaiApiKey } = env;
  const arr = Array.isArray(openaiApiKey) ? openaiApiKey : [openaiApiKey];
  res.json({ available: !!arr.filter(Boolean).length });
}

router.get('/status', ensureAdmin, status);
router.get('/sdk/status', component.verifySig, status);

export const Models = [
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0301',
  'gpt-3.5-turbo-0613',
  'gpt-3.5-turbo-16k',
  'gpt-3.5-turbo-16k-0613',
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-0613',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-4-32k-0613',
] as const;

export type Model = (typeof Models)[number];

const completionsRequestSchema = Joi.object<
  {
    stream?: boolean;
    model: Model;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    maxTokens?: number;
  } & (
    | {
        prompt: string;
        messages: undefined;
      }
    | {
        prompt: undefined;
        messages: ChatCompletionRequestMessage[];
      }
  )
>({
  model: Joi.string()
    .valid(...Models)
    .default('gpt-3.5-turbo'),
  prompt: Joi.string(),
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('system', 'user', 'assistant').required(),
        content: Joi.string().required(),
        name: Joi.string().empty(''),
      })
    )
    .min(1),
  stream: Joi.boolean(),
  temperature: Joi.number().min(0).max(2),
  topP: Joi.number().min(0.1).max(1).empty(null),
  presencePenalty: Joi.number().min(-2).max(2).empty(null),
  frequencyPenalty: Joi.number().min(-2).max(2).empty(null),
  maxTokens: Joi.number().integer().min(1).empty(null),
}).xor('prompt', 'messages');

async function completions(req: Request, res: Response) {
  const { model, stream, ...input } = await completionsRequestSchema.validateAsync(req.body, {
    stripUnknown: true,
  });

  const openai = getAIProvider();

  const messages = input.messages ?? [{ role: 'user', content: input.prompt }];

  const request: Parameters<typeof openai.createChatCompletion>[0] = {
    model,
    messages,
    stream,
    temperature: input.temperature,
    top_p: input.topP,
    presence_penalty: input.presencePenalty,
    frequency_penalty: input.frequencyPenalty,
    max_tokens: input.maxTokens,
  };

  if (env.verbose) logger.log('AI Kit completions input:', request);

  let text = '';

  if (stream) {
    const r: AxiosResponse<IncomingMessage> = (await openai.createChatCompletion(request, {
      responseType: 'stream',
    })) as any;

    const decoder = new TextDecoder();

    const onParse = (event: ParsedEvent | ReconnectInterval) => {
      if (event.type === 'event') {
        const { data } = event;
        if (data === '[DONE]') {
          return;
        }

        const json = JSON.parse(data);

        let delta: string = json.choices[0].delta.content || '';
        if (!text) delta = delta.trimStart();

        text += delta;

        if (delta) res.write(delta);
      }
    };

    const parser = createParser(onParse);

    for await (const chunk of r.data) {
      parser.feed(decoder.decode(chunk));
    }

    res.end();
  } else {
    const result = await openai.createChatCompletion(request);
    text = result.data.choices[0]?.message?.content?.trim() ?? '';

    res.json({ text });
  }

  const tokens = new GPTTokens({
    model,
    messages: messages
      .concat({ role: 'assistant', content: text })
      .filter(
        (i): i is { role: GPTTokens['messages'][number]['role']; content: string } =>
          i.role !== 'function' && Boolean(i.content)
      ),
  });

  await Usage.create({
    promptTokens: tokens.promptUsedTokens,
    completionTokens: tokens.completionUsedTokens,
    apiKey: openai.apiKey,
  });

  if (env.verbose) logger.log('AI Kit completions output:', { text });
}

const retry = (callback: (req: Request, res: Response) => Promise<void>): any => {
  const { preferences } = Config.env;
  const options = { maxRetries: preferences.MAX_RETRIES, retryCodes: [429, 500, 502] };

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

router.post('/completions', ensureAdmin, retry(completions));
router.post('/sdk/completions', component.verifySig, retry(completions));

const embeddingsRequestSchema = Joi.object<CreateEmbeddingRequest>({
  model: Joi.string().required(),
  input: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).required(),
  user: Joi.string().empty(Joi.valid('', null)),
});

async function embeddings(req: Request, res: Response) {
  const input = await embeddingsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  const openai = getAIProvider();

  const { data } = await openai.createEmbedding(input);

  res.json(data);
}

router.post('/embeddings', ensureAdmin, retry(embeddings));
router.post('/sdk/embeddings', component.verifySig, retry(embeddings));

const imageGenerationRequestSchema = Joi.object<{
  prompt: string;
  size: CreateImageRequestSizeEnum;
  n: number;
  response_format: CreateImageRequestResponseFormatEnum;
}>({
  prompt: Joi.string().required(),
  size: Joi.string().valid('256x256', '512x512', '1024x1024').default('256x256'),
  n: Joi.number().min(1).max(10).default(1),
  response_format: Joi.string().valid('url', 'b64_json').default('url'),
});

async function imageGenerations(req: Request, res: Response) {
  const input = await imageGenerationRequestSchema.validateAsync(req.body, { stripUnknown: true });

  if (env.verbose) logger.log('AI Kit image generations input:', input);

  const openai = getAIProvider();

  const response = await openai.createImage(input);

  res.json({
    data: response.data.data,
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
    proxyReqOpts.headers!.Authorization = `Bearer ${getAIProvider().apiKey}`;
    return proxyReqOpts;
  },
});

router.post('/audio/transcriptions', auth(), audioTranscriptions);
router.post('/sdk/audio/transcriptions', component.verifySig, audioTranscriptions);

export default router;
