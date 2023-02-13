import { ReadStream } from 'fs';

import { middlewares } from '@blocklet/sdk';
import { ParsedEvent, ReconnectInterval, createParser } from 'eventsource-parser';
import { Request, Response, Router } from 'express';
import { Configuration, CreateImageRequestSizeEnum, OpenAIApi } from 'openai';

import env from '../libs/env';
import { ensureAdmin } from '../libs/security';

const router = Router();

async function status(_: Request<{}, {}, { prompt: string; stream: boolean | null }>, res: Response) {
  const { openaiApiKey } = env;
  res.json({ available: !!openaiApiKey });
}

router.get('/status', ensureAdmin, status);

router.get('/sdk/status', middlewares.component.verifySig, status);

async function completions(req: Request<{}, {}, { prompt: string; stream: boolean | null }>, res: Response) {
  const { prompt, stream } = req.body;

  const { openaiApiKey } = env;
  if (!openaiApiKey) {
    res.status(500).json({ message: 'Missing required openai apiKey' });
    return;
  }

  const openai = new OpenAIApi(new Configuration({ apiKey: openaiApiKey }));

  try {
    const r = await openai.createCompletion(
      {
        model: 'text-davinci-003',
        prompt,
        temperature: 0.3,
        max_tokens: 2048,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        stream,
      },
      { responseType: stream ? 'stream' : 'json' }
    );
    if (stream) {
      const decoder = new TextDecoder();
      let counter = 0;

      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const { data } = event;
          // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
          if (data === '[DONE]') {
            return;
          }
          const json = JSON.parse(data);
          const { text } = json.choices[0];
          if (counter < 2 && (text.match(/\n/) || []).length) {
            // this is a prefix character (i.e., "\n\n"), do nothing
            return;
          }
          res.write(text);
          counter++;
        }
      };

      const parser = createParser(onParse);
      for await (const chunk of r.data as any) {
        parser.feed(decoder.decode(chunk));
      }
      res.end();
    } else {
      res.json(r.data);
    }
  } catch (error) {
    if (stream) {
      res.status(500).send(error.message);
    } else {
      res.status(500).json({ message: error.message });
    }
  }
}

router.post('/completions', ensureAdmin, completions);

router.post('/sdk/completions', middlewares.component.verifySig, completions);

async function imageGenerations(
  req: Request<{}, {}, { prompt: string; size?: CreateImageRequestSizeEnum; n?: number }>,
  res: Response
) {
  const { prompt, size, n } = req.body;

  const { openaiApiKey } = env;
  if (!openaiApiKey) {
    res.status(500).json({ message: 'Missing required openai apiKey' });
    return;
  }

  const openai = new OpenAIApi(new Configuration({ apiKey: openaiApiKey }));
  const response = await openai.createImage({ prompt, size, n }, { responseType: 'stream' });
  (response.data as any as ReadStream).pipe(res);
}

router.post('/image/generations', ensureAdmin, imageGenerations);
router.post('/sdk/image/generations', middlewares.component.verifySig, imageGenerations);

export default router;
