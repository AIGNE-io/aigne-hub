import { IncomingMessage } from 'http';

import { component } from '@blocklet/sdk/lib/middlewares';
import { AxiosResponse } from 'axios';
import { ParsedEvent, ReconnectInterval, createParser } from 'eventsource-parser';
import { Request, Response, Router } from 'express';
import Joi from 'joi';
import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateEmbeddingRequest,
  CreateImageRequestResponseFormatEnum,
  CreateImageRequestSizeEnum,
  OpenAIApi,
} from 'openai';

import env from '../libs/env';
import logger from '../libs/logger';
import { ensureAdmin } from '../libs/security';

function getAIProvider() {
  const { openaiApiKey } = env;
  if (!openaiApiKey) {
    throw new Error('Missing required openai apiKey');
  }
  return new OpenAIApi(new Configuration({ apiKey: openaiApiKey }));
}

const router = Router();

async function status(_: Request, res: Response) {
  const { openaiApiKey } = env;
  res.json({ available: !!openaiApiKey });
}

router.get('/status', ensureAdmin, status);
router.get('/sdk/status', component.verifySig, status);

const completionsRequestSchema = Joi.object<
  { stream?: boolean; model: string; temperature?: number } & (
    | { prompt: string; messages: undefined }
    | { prompt: undefined; messages: ChatCompletionRequestMessage[] }
  )
>({
  model: Joi.string().default('gpt-3.5-turbo'),
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
}).xor('prompt', 'messages');

async function completions(req: Request, res: Response) {
  const { model, prompt, messages, stream, temperature } = await completionsRequestSchema.validateAsync(req.body, {
    stripUnknown: true,
  });

  const openai = getAIProvider();

  const request: Parameters<typeof openai.createChatCompletion>[0] = {
    model,
    messages: messages ?? [{ role: 'user', content: prompt }],
    stream,
    temperature,
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
    text = (await openai.createChatCompletion(request)).data.choices[0]?.message?.content.trim() ?? '';

    res.json({ text });
  }

  if (env.verbose) logger.log('AI Kit completions output:', { text });
}

router.post('/completions', ensureAdmin, completions);
router.post('/sdk/completions', component.verifySig, completions);

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

router.post('/embeddings', ensureAdmin, embeddings);
router.post('/sdk/embeddings', component.verifySig, embeddings);

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

router.post('/image/generations', ensureAdmin, imageGenerations);
router.post('/sdk/image/generations', component.verifySig, imageGenerations);

export default router;
