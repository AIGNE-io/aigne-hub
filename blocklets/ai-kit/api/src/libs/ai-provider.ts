import { SubscriptionError, SubscriptionErrorType } from '@blocklet/ai-kit/api';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { OpenAI } from 'openai';

import { Config } from './env';

export function getOpenAI() {
  const { httpsProxy, openaiBaseURL } = Config;

  return new OpenAI({
    // NOTE: if `baseURL` is undefined, the OpenAI constructor will
    // use the `OPENAI_BASE_URL` environment variable (this variable maybe a empty string).
    // Therefore, we pass `null` to OpenAI to make it use the default url of OpenAI.
    baseURL: openaiBaseURL || null,
    apiKey: getAIApiKey('openai'),
    httpAgent: httpsProxy ? new HttpsProxyAgent(httpsProxy) : undefined,
  });
}

export type AIProvider = 'gemini' | 'openai' | 'openRouter';

const currentApiKeyIndex: { [key in AIProvider]?: number } = {};
const apiKeys: { [key in AIProvider]: () => string[] } = {
  gemini: () => Config.geminiApiKey,
  openai: () => Config.openaiApiKey,
  openRouter: () => Config.openRouterApiKey,
};

export function getAIApiKey(company: AIProvider) {
  currentApiKeyIndex[company] ??= 0;

  const index = currentApiKeyIndex[company]!++;
  const keys = apiKeys[company]?.();

  const apiKey = keys?.[index % keys.length];

  if (!apiKey) throw new SubscriptionError(SubscriptionErrorType.UNSUBSCRIBED);

  return apiKey;
}
