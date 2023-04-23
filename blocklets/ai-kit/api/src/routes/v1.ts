import { IncomingMessage } from 'http';

import { component } from '@blocklet/sdk/lib/middlewares';
import { AxiosResponse } from 'axios';
import { ParsedEvent, ReconnectInterval, createParser } from 'eventsource-parser';
import { Request, Response, Router } from 'express';
import Joi from 'joi';
import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateImageRequestResponseFormatEnum,
  CreateImageRequestSizeEnum,
  OpenAIApi,
} from 'openai';

import env from '../libs/env';
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
  temperature: Joi.number().min(0).max(1),
}).xor('prompt', 'messages');

async function completions(req: Request, res: Response) {
  const { model, prompt, messages, stream, temperature } = await completionsRequestSchema.validateAsync(req.body);

  const openai = getAIProvider();

  const request: Parameters<typeof openai.createChatCompletion>[0] = {
    model,
    messages: messages ?? [{ role: 'user', content: prompt }],
    stream,
    temperature,
  };

  if (stream) {
    const r: AxiosResponse<IncomingMessage> = (await openai.createChatCompletion(request, {
      responseType: 'stream',
    })) as any;

    const decoder = new TextDecoder();
    let hasText = false;

    const onParse = (event: ParsedEvent | ReconnectInterval) => {
      if (event.type === 'event') {
        const { data } = event;
        // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
        if (data === '[DONE]') {
          return;
        }
        const json = JSON.parse(data);
        let text: string = json.choices[0].delta.content || '';
        if (!hasText) {
          text = text.trimStart();
        }
        if (text) {
          hasText = true;
          res.write(text);
        }
      }
    };

    const parser = createParser(onParse);

    for await (const chunk of r.data) {
      parser.feed(decoder.decode(chunk));
    }
    res.end();
  } else {
    const r = await openai.createChatCompletion(request);

    res.json({ text: r.data.choices[0]?.message?.content.trim() });
  }
}

router.post('/completions', ensureAdmin, completions);
router.post('/sdk/completions', component.verifySig, completions);

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
  const data = await imageGenerationRequestSchema.validateAsync(req.body);

  const openai = getAIProvider();

  const response = await openai.createImage(data);
  res.json({
    data: response.data.data,
  });
}

router.post('/image/generations', ensureAdmin, imageGenerations);
router.post('/sdk/image/generations', component.verifySig, imageGenerations);

export default router;
