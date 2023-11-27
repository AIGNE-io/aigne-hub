import { HttpsProxyAgent } from 'https-proxy-agent';
import { OpenAI } from 'openai';

import { Config } from './env';

let currentApiKeyIndex = 0;

export function getAIProvider() {
  const { openaiApiKey, httpsProxy } = Config;

  const apiKey = openaiApiKey[currentApiKeyIndex++ % openaiApiKey.length];

  if (!apiKey) throw new Error('Missing required openai apiKey');

  return new OpenAI({
    apiKey,
    httpAgent: httpsProxy ? new HttpsProxyAgent(httpsProxy) : undefined,
  });
}
