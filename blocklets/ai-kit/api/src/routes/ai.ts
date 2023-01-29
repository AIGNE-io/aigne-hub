import { Router } from 'express';
import { Configuration, OpenAIApi } from 'openai';

import env from '../libs/env';

const router = Router();

router.get('/status', async (_, res) => {
  const { openaiApiKey } = env;
  res.json({ enabled: !!openaiApiKey });
});

router.post('/', async (req, res) => {
  const { prompt } = req.body;

  const { openaiApiKey } = env;
  if (!openaiApiKey) {
    res.status(500).json({ message: 'Missing required openai apiKey' });
    return;
  }

  const openai = new OpenAIApi(new Configuration({ apiKey: openaiApiKey }));

  const r = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt,
    temperature: 0.3,
    max_tokens: 100,
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
  });
  res.json(r.data);
});

export default router;
