import { OpenAI } from 'openai';

import env from './env';

let currentApiKeyIndex = 0;

export function getAIProvider() {
  const { openaiApiKey } = env;

  const apiKey = openaiApiKey[currentApiKeyIndex++ % openaiApiKey.length];

  if (!apiKey) throw new Error('Missing required openai apiKey');

  return new OpenAI({ apiKey });
}
