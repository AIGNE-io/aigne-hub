import { ConfigError, ConfigErrorType } from '@blocklet/aigne-hub/api';
import { getRemoteBaseUrl } from '@blocklet/aigne-hub/api/utils/util';
import { joinURL } from 'ufo';

import { AIProviderType as AIProvider } from '../libs/constants';
import { Config } from '../libs/env';

const currentApiKeyIndex: { [key in AIProvider]?: number } = {};
const apiKeys: { [key in AIProvider]: () => string[] } = {
  google: () => Config.geminiApiKey,
  openai: () => Config.openaiApiKey,
  openrouter: () => Config.openRouterApiKey,
  anthropic: () => Config.anthropicApiKey,
  deepseek: () => Config.deepseekApiKey,
  bedrock: () => Config.awsAccessKeyId,
  ollama: () => Config.ollamaApiKey,
  xai: () => Config.xaiApiKey,
  doubao: () => Config.doubaoApiKey,
  poe: () => Config.poeApiKey,
  ideogram: () => Config.ideogramApiKey,
};

export const aigneHubConfigProviderUrl = async () => {
  const url = await getRemoteBaseUrl(process.env?.BLOCKLET_AIGNE_API_URL || '').catch(
    () => process.env?.BLOCKLET_AIGNE_API_URL
  );
  const errorMessage = `Please configure the provider in ${joinURL(url || '', 'config/ai-config/providers')}`;
  return errorMessage;
};

export async function getAIApiKey(company: AIProvider) {
  currentApiKeyIndex[company] ??= 0;

  const index = currentApiKeyIndex[company]!++;
  const keys = apiKeys[company]?.();

  const key = keys?.[index % keys.length];

  if (!key) {
    const configUrl = await aigneHubConfigProviderUrl();
    throw new ConfigError(ConfigErrorType.MISSING_API_KEY, configUrl);
  }

  return { apiKey: key };
}

export async function getBedrockConfig() {
  currentApiKeyIndex.bedrock ??= 0;

  const index = currentApiKeyIndex.bedrock!++;
  const accessKeyIds = Config.awsAccessKeyId;
  const secretAccessKeys = Config.awsSecretAccessKey;
  const regions = Config.awsRegion;

  const accessKeyId = accessKeyIds?.[index % accessKeyIds.length];
  const secretAccessKey = secretAccessKeys?.[index % secretAccessKeys.length];
  const region = regions?.[index % regions.length];

  if (!accessKeyId || !secretAccessKey || !region) {
    const configUrl = await aigneHubConfigProviderUrl();
    throw new ConfigError(ConfigErrorType.MISSING_API_KEY, configUrl);
  }

  return { accessKeyId, secretAccessKey, region };
}

export const BASE_URL_CONFIG_MAP = {
  openai: () => Config.openaiBaseURL,
  anthropic: () => Config.anthropicBaseURL,
  ollama: () => Config.ollamaBaseURL,
} as const;
