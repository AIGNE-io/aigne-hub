import { ModelCallContext } from '@api/middlewares/model-call-tracker';
import { getProviderCredentials } from '@api/providers/models';
import AiCredential from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { SubscriptionError, SubscriptionErrorType } from '@blocklet/aigne-hub/api';
import { CustomError } from '@blocklet/error';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { OpenAI } from 'openai';
import { Op } from 'sequelize';

import { AIProviderType, AI_PROVIDER_VALUES, SUPPORTED_PROVIDERS_SET } from './constants';
import { Config } from './env';
import logger from './logger';

export const DEFAULT_MODEL = 'openai/gpt-5-mini';

class ProviderRotationManager {
  private static readonly PROVIDER_CACHE_TTL = 5 * 60 * 1000;

  private static readonly FAILED_PROVIDER_COOL_DOWN = 90 * 1000; // 90 seconds

  private static readonly MAX_FAILURES_THRESHOLD = 3;

  private static readonly EXTENDED_COOL_DOWN = 3 * 60 * 1000; // 3 minutes

  private rotationState = new Map<
    string,
    {
      providers: Array<{ providerId: string; providerName: string; modelName: string }>;
      currentIndex: number;
      lastUpdateTime: number;
    }
  >();

  private failedProviders = new Map<
    string,
    {
      failedAt: number;
      failureCount: number;
    }
  >();

  public markProviderAsFailed(providerId: string, providerName: string): void {
    const existing = this.failedProviders.get(providerId);
    const now = Date.now();

    if (existing) {
      this.failedProviders.set(providerId, {
        failedAt: now,
        failureCount: existing.failureCount + 1,
      });
      logger.warn(`Provider ${providerName} (${providerId}) marked as failed (count: ${existing.failureCount + 1})`);
    } else {
      this.failedProviders.set(providerId, {
        failedAt: now,
        failureCount: 1,
      });
      logger.warn(`Provider ${providerName} (${providerId}) marked as failed (first failure)`);
    }
  }

  private isProviderInCoolDown(providerId: string): boolean {
    const failed = this.failedProviders.get(providerId);
    if (!failed) {
      return false;
    }

    const now = Date.now();
    const coolDownTime =
      failed.failureCount >= ProviderRotationManager.MAX_FAILURES_THRESHOLD
        ? ProviderRotationManager.EXTENDED_COOL_DOWN
        : ProviderRotationManager.FAILED_PROVIDER_COOL_DOWN;

    if (now - failed.failedAt > coolDownTime) {
      this.failedProviders.delete(providerId);
      return false;
    }

    return true;
  }

  private filterAvailableProviders(
    providers: Array<{ providerId: string; providerName: string; modelName: string }>
  ): Array<{ providerId: string; providerName: string; modelName: string }> {
    return providers.filter((p) => !this.isProviderInCoolDown(p.providerId));
  }

  public async getNextProviderForModel(
    model: string,
    preferredProviderName?: string
  ): Promise<{ providerId: string; providerName: string; modelName: string } | null> {
    if (!Config.creditBasedBillingEnabled) {
      return null;
    }

    const { modelName } = getModelNameWithProvider(model);

    const matchModels = [model, modelName];

    for (const provider of AI_PROVIDER_VALUES) {
      const prefix = `${provider}/`;
      if (modelName.startsWith(prefix)) {
        const remaining = modelName.substring(prefix.length);
        if (remaining && !matchModels.includes(remaining)) {
          matchModels.push(remaining);
        }
        break;
      }
    }

    const now = Date.now();
    let rotationState = this.rotationState.get(modelName);
    const needsRefresh =
      !rotationState || now - rotationState.lastUpdateTime > ProviderRotationManager.PROVIDER_CACHE_TTL;

    if (needsRefresh) {
      const rates = await AiModelRate.findAll({
        where: {
          model: {
            [Op.in]: matchModels,
          },
        },
        include: [
          {
            model: AiProvider,
            as: 'provider',
            required: true,
            where: { enabled: true },
            include: [
              {
                model: AiCredential,
                as: 'credentials',
                where: { active: true },
                required: true,
              },
            ],
          },
        ],
      });

      if (rates.length === 0) {
        return null;
      }

      const providersMap = new Map<string, { providerId: string; providerName: string; modelName: string }>();
      for (const rate of rates) {
        const { provider } = rate as any;
        if (provider && provider.credentials?.length) {
          providersMap.set(provider.id, {
            providerId: provider.id,
            providerName: provider.name,
            modelName: rate.model,
          });
        }
      }

      const providerList = Array.from(providersMap.values());
      if (providerList.length === 0) {
        return null;
      }

      rotationState = {
        providers: providerList,
        currentIndex: 0,
        lastUpdateTime: now,
      };
      this.rotationState.set(modelName, rotationState);
    }

    if (!rotationState) {
      return null;
    }

    const availableProviders = this.filterAvailableProviders(rotationState.providers);
    if (availableProviders.length === 0) {
      logger.warn(`No available providers for model ${modelName}, all are in cool down`);
      return null;
    }

    if (preferredProviderName) {
      const preferred = availableProviders.find((p) => p.providerName === preferredProviderName);
      if (preferred) {
        return {
          providerId: preferred.providerId,
          providerName: preferred.providerName,
          modelName: preferred.modelName,
        };
      }
    }

    let attempts = 0;
    let selected = null;

    while (attempts < rotationState.providers.length) {
      const candidate = rotationState.providers[rotationState.currentIndex];
      rotationState.currentIndex = (rotationState.currentIndex + 1) % rotationState.providers.length;

      if (candidate && !this.isProviderInCoolDown(candidate.providerId)) {
        selected = candidate;
        break;
      }

      attempts++;
    }

    if (!selected) {
      logger.warn(`Could not find available provider for model ${modelName} after checking all providers`);
      return null;
    }

    return {
      providerId: selected.providerId,
      providerName: selected.providerName,
      modelName: selected.modelName,
    };
  }
}

const providerRotationManager = new ProviderRotationManager();

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

export async function getOpenAIV2(req: {
  body: { model: string };
  modelCallContext?: ModelCallContext;
  credentialId?: string;
}) {
  const { modelName } = getModelNameWithProvider(req?.body?.model || DEFAULT_MODEL);
  const params = await getProviderCredentials('openai', {
    modelCallContext: req?.modelCallContext,
    model: modelName,
  });

  req.credentialId = params.id;

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
    throw new CustomError(400, 'Model is required');
  }

  if (model.includes('/')) {
    const modelArray = model.split('/');
    const [providerName, name] = [modelArray[0], modelArray.slice(1).join('/')];

    if (providerName && !SUPPORTED_PROVIDERS_SET.has(providerName?.toLowerCase() as AIProviderType)) {
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

export function getReqModel(req: {
  body: { model?: string; input?: { model?: string; modelOptions?: { model?: string } } };
}): string {
  return req.body?.model || req.body?.input?.model || req.body?.input?.modelOptions?.model || '';
}

export function markProviderAsFailed(providerId: string, providerName: string): void {
  providerRotationManager.markProviderAsFailed(providerId, providerName);
}

export async function getNextProviderForModel(
  model: string,
  preferredProviderName?: string
): Promise<{ providerId: string; providerName: string; modelName: string } | null> {
  return providerRotationManager.getNextProviderForModel(model, preferredProviderName);
}

export async function ensureModelWithProvider(
  req: {
    body: { model?: string; input?: { modelOptions?: { model?: string } }; fixedProvider?: boolean };
  } & { provider?: string; model?: string }
): Promise<void> {
  const model = req.body?.model || req.body?.input?.modelOptions?.model || '';

  if (!model || req.body.fixedProvider === true || !Config.creditBasedBillingEnabled) {
    return;
  }

  try {
    const providerInfo = await getNextProviderForModel(model);
    if (providerInfo) {
      logger.info(`Selected provider ${providerInfo.providerName} for model ${model}`);

      if (req.body?.model) {
        req.body.model = `${providerInfo.providerName}/${providerInfo.modelName}`;
      }
      if (req.body?.input?.modelOptions?.model) {
        req.body.input.modelOptions.model = `${providerInfo.providerName}/${providerInfo.modelName}`;
      }
    }
  } catch (error) {
    logger.warn(`Failed to get provider for model ${model}:`, error);
  }
}
