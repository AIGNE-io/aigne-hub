import { getProviderCredentials } from '@api/providers/models';
import { SubscriptionError, SubscriptionErrorType } from '@blocklet/aigne-hub/api';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { OpenAI } from 'openai';

import { Config } from './env';
import logger from './logger';
import { SUPPORTED_PROVIDERS } from './model-registry';

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

export async function getOpenAIV2() {
  const params: {
    apiKey?: string;
    baseURL?: string;
  } = await getProviderCredentials('openai');

  return new OpenAI({
    baseURL: params.baseURL || null,
    apiKey: params.apiKey,
    httpAgent: Config.httpsProxy ? new HttpsProxyAgent(Config.httpsProxy) : undefined,
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

export function getModelNameWithProvider(model: string, defaultProviderName: string = '') {
  if (!model) {
    throw new Error('Model is required');
  }
  if (model.includes('/')) {
    const modelArray = model.split('/');
    const [providerName, name] = [modelArray[0], modelArray.slice(1).join('/')];
    if (providerName && !SUPPORTED_PROVIDERS.has(providerName?.toLowerCase() || '')) {
      logger.info(`${providerName} is not supported, use default provider ${defaultProviderName}`);
      return {
        providerName: defaultProviderName,
        modelName: model,
      };
    }
    return {
      providerName: providerName?.toLowerCase() || defaultProviderName,
      modelName: name,
    };
  }
  return {
    modelName: model,
    providerName: defaultProviderName,
  };
}
