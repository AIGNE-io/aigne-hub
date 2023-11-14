import { HttpsProxyAgent } from 'https-proxy-agent';
import { OpenAI } from 'openai';

import env from './env';

let currentApiKeyIndex = 0;

export function getAIProvider() {
  const { openaiApiKey, proxyHost } = env;

  const apiKey = openaiApiKey[currentApiKeyIndex++ % openaiApiKey.length];

  if (!apiKey) throw new Error('Missing required openai apiKey');

  const params: {
    apiKey: string;
    httpAgent?: HttpsProxyAgent<string>;
  } = { apiKey };

  if (proxyHost) {
    params.httpAgent = new HttpsProxyAgent(proxyHost);
  }

  return new OpenAI(params);
}
