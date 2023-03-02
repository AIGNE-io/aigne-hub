import { IncomingMessage } from 'http';

import { middlewares } from '@blocklet/sdk';
import { AxiosResponse } from 'axios';
import { ParsedEvent, ReconnectInterval, createParser } from 'eventsource-parser';
import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { Configuration, CreateImageRequestResponseFormatEnum, CreateImageRequestSizeEnum, OpenAIApi } from 'openai';

import env from '../libs/env';
import { ensureAdmin } from '../libs/security';

function getAIProvider() {
  const { openaiApiKey } = env;
  if (!openaiApiKey) {
    throw new Error('Missing required openai apiKey');
  }
  return new OpenAIApi(new Configuration({ apiKey: openaiApiKey }));
}

async function runWithCatch(run: () => Promise<void>, res: Response) {
  try {
    await run();
  } catch (error) {
    if (error.response) {
      const { response }: { response: AxiosResponse } = error;
      res.status(response.status);
      const type = response.headers['content-type'];
      if (type) res.type(type);
      response.data.pipe(res);
      return;
    }

    res.status(500).json({ error: { message: error.message } });
  }
}

const router = Router();

async function status(_: Request, res: Response) {
  const { openaiApiKey } = env;
  res.json({ available: !!openaiApiKey });
}

router.get('/status', ensureAdmin, status);
router.get('/sdk/status', middlewares.component.verifySig, status);

const completionsRequestSchema = Joi.object<{ prompt: string; stream?: boolean }>({
  prompt: Joi.string().required(),
  stream: Joi.boolean(),
});

async function completions(req: Request, res: Response) {
  await runWithCatch(async () => {
    const { prompt, stream } = await completionsRequestSchema.validateAsync(req.body);

    const openai = getAIProvider();

    const r: AxiosResponse<IncomingMessage> = (await openai.createChatCompletion(
      {
        model: 'gpt-3.5-turbo-0301',
        messages: [{ role: 'user', content: prompt }],
        stream,
      },
      { responseType: 'stream' }
    )) as any;

    if (stream) {
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
      r.data.pipe(res);
    }
  }, res);
}

router.post('/completions', ensureAdmin, completions);
router.post('/sdk/completions', middlewares.component.verifySig, completions);

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
  await runWithCatch(async () => {
    const data = await imageGenerationRequestSchema.validateAsync(req.body);

    const openai = getAIProvider();

    const response: AxiosResponse<IncomingMessage> = (await openai.createImage(data, {
      responseType: 'stream',
    })) as any;
    response.data.pipe(res);
  }, res);
}

router.post('/image/generations', ensureAdmin, imageGenerations);
router.post('/sdk/image/generations', middlewares.component.verifySig, imageGenerations);

export default router;
