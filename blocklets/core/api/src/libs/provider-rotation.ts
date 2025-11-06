import AiCredential from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { CustomError } from '@blocklet/error';
import { Op } from 'sequelize';

import { AIProviderType, PROVIDER_RANK, SUPPORTED_PROVIDERS_SET } from './constants';
import { Config } from './env';
import logger from './logger';

function parseModelNameWithProvider(model: string): { providerName: string; modelName: string } {
  if (!model) {
    return { providerName: '', modelName: '' };
  }

  if (model.includes('/')) {
    const modelArray = model.split('/');
    const [providerName, ...rest] = modelArray;
    const name = rest.join('/');

    if (providerName && SUPPORTED_PROVIDERS_SET.has(providerName?.toLowerCase() as AIProviderType)) {
      return {
        providerName: providerName?.toLowerCase() || '',
        modelName: name,
      };
    }
    return {
      providerName: '',
      modelName: model,
    };
  }

  return {
    modelName: model,
    providerName: '',
  };
}

export function inferVendorFromModel(model: string): string | undefined {
  if (!model) {
    return undefined;
  }
  const id = model.toLowerCase();
  if (/^gemini/.test(id)) return 'google';
  if (/^claude/.test(id)) return 'anthropic';
  if (/^gpt-|^o[13]-|^dall-e-|^text-embedding|^sora-/.test(id)) return 'openai';
  if (/^deepseek/.test(id)) return 'deepseek';
  if (/^grok/.test(id)) return 'xai';
  if (/^doubao/.test(id)) return 'doubao';
  if (/^llama/.test(id)) return 'meta';
  if (/^mistral|^mixtral/.test(id)) return 'mistral';
  if (/^qwen/.test(id)) return 'qwen';
  if (/^gemma/.test(id)) return 'google';
  if (/^yi/.test(id)) return 'yi';
  if (/^phi/.test(id)) return 'microsoft';
  return undefined;
}

export function getDefaultProviderForModel(model: string): AIProviderType | null {
  if (!model) {
    return null;
  }
  const id = model.toLowerCase();

  if (/^gemini/.test(id)) return 'google';
  if (/^gpt-|^o[13]-|^dall-e-|^text-embedding|^sora-/.test(id)) return 'openai';
  if (/^claude/.test(id)) return 'anthropic';
  if (/^deepseek/.test(id)) return 'deepseek';
  if (/^grok/.test(id)) return 'xai';
  if (/^doubao/.test(id)) return 'doubao';

  if (/^(llama|mistral|mixtral|gemma|qwen|yi|phi)\b/i.test(id)) return 'openrouter';

  return null;
}

export function getSupportedProviders(model: string): AIProviderType[] {
  const id = model.toLowerCase();
  const set = new Set<AIProviderType>();

  if (/^gemini/.test(id)) {
    ['google', 'openrouter', 'poe'].forEach((p) => set.add(p as AIProviderType));
  }
  if (/^gpt-|^o[13]-|^dall-e-|^text-embedding|^sora-/.test(id)) {
    ['openai', 'openrouter', 'poe'].forEach((p) => set.add(p as AIProviderType));
  }
  if (/^claude/.test(id)) {
    ['anthropic', 'bedrock', 'openrouter', 'poe'].forEach((p) => set.add(p as AIProviderType));
  }
  if (/^deepseek/.test(id)) {
    ['deepseek', 'openrouter', 'ollama'].forEach((p) => set.add(p as AIProviderType));
  }
  if (/^grok/.test(id)) {
    ['xai', 'openrouter', 'poe'].forEach((p) => set.add(p as AIProviderType));
  }
  if (/^doubao/.test(id)) {
    ['doubao'].forEach((p) => set.add(p as AIProviderType));
  }
  if (/^(llama|mistral|mixtral|gemma|qwen|yi|phi)\b/i.test(id)) {
    ['openrouter', 'ollama', 'bedrock'].forEach((p) => set.add(p as AIProviderType));
  }

  return Array.from(set).sort((a, b) => PROVIDER_RANK[a] - PROVIDER_RANK[b]);
}

/**
 * Resolve provider-specific model ID based on platform conventions
 * @param provider - The provider name (e.g., 'openrouter', 'bedrock', 'google')
 * @param canonicalModel - The canonical model name (e.g., 'gemini-2.5-pro', 'claude-3-5-sonnet-20241022')
 * @param vendor - Optional vendor hint (e.g., 'google' for gemini models, 'anthropic' for claude)
 * @returns Provider-specific model ID
 *
 * Examples:
 * - OpenRouter: 'google/gemini-2.5-pro', 'openai/gpt-4o', 'anthropic/claude-3-5-sonnet'
 * - Bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0', 'meta.llama3-70b-instruct-v1:0'
 * - Direct providers (google, openai, etc.): 'gemini-2.5-pro', 'gpt-4o'
 */
export function resolveProviderModelId(provider: AIProviderType, canonicalModel: string, vendor?: string): string {
  const v = vendor || inferVendorFromModel(canonicalModel);

  if (provider === 'bedrock' && v) {
    if (canonicalModel.includes('.')) {
      return canonicalModel;
    }
    return `${v}.${canonicalModel}`;
  }

  if (provider === 'openrouter' && v && !canonicalModel.startsWith(`${v}/`)) {
    return `${v}/${canonicalModel}`;
  }

  return canonicalModel;
}

class ProviderRotationManager {
  private static readonly PROVIDER_CACHE_TTL = 5 * 60 * 1000;

  private static readonly FAILED_PROVIDER_COOL_DOWN = 90 * 1000;

  private static readonly MAX_FAILURES_THRESHOLD = 3;

  private static readonly EXTENDED_COOL_DOWN = 3 * 60 * 1000;

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

  public clearAllCache(): void {
    this.rotationState.clear();
    logger.info('Cleared all provider rotation cache');
  }

  public clearFailedProvider(providerId: string): void {
    this.failedProviders.delete(providerId);
    logger.info(`Cleared failed provider record for: ${providerId}`);
  }

  public markProviderAsFailed(providerId: string, providerName: string): void {
    const existing = this.failedProviders.get(providerId);
    const now = Date.now();

    if (existing) {
      this.failedProviders.set(providerId, {
        failedAt: now,
        failureCount: existing.failureCount + 1,
      });
      logger.warn(
        `AIProviderType ${providerName} (${providerId}) marked as failed (count: ${existing.failureCount + 1})`
      );
    } else {
      this.failedProviders.set(providerId, {
        failedAt: now,
        failureCount: 1,
      });
      logger.warn(`AIProviderType ${providerName} (${providerId}) marked as failed (first failure)`);
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
    const { excludedRotationProviders } = Config;
    return providers.filter((p) => {
      const isInCoolDown = this.isProviderInCoolDown(p.providerId);
      const isExcluded = excludedRotationProviders && excludedRotationProviders.includes(p.providerName);
      return !isInCoolDown && !isExcluded;
    });
  }

  private async fetchProvidersFromCreditSystem(
    modelName: string
  ): Promise<Array<{ providerId: string; providerName: string; modelName: string }> | null> {
    const rates = await AiModelRate.findAll({
      where: {
        model: {
          [Op.or]: [{ [Op.eq]: modelName }, { [Op.like]: `%/${modelName}` }],
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
    return providerList.length > 0 ? providerList : null;
  }

  private async generateProvidersByModelPattern(
    modelName: string
  ): Promise<Array<{ providerId: string; providerName: string; modelName: string }> | null> {
    try {
      const supportedProviders = getSupportedProviders(modelName);

      if (supportedProviders.length === 0) {
        return null;
      }

      const availableProviders = await AiProvider.findAll({
        where: {
          name: { [Op.in]: supportedProviders },
          enabled: true,
        },
        include: [
          {
            model: AiCredential,
            as: 'credentials',
            where: { active: true },
            required: true,
          },
        ],
      });

      if (availableProviders.length === 0) {
        logger.warn(
          `No providers with active credentials found for model ${modelName}. Supported providers: ${supportedProviders.join(', ')}`
        );
        return null;
      }

      const vendor = inferVendorFromModel(modelName);
      const results: Array<{ providerId: string; providerName: string; modelName: string }> = [];

      for (const provider of availableProviders) {
        const providerData = provider as any;
        if (providerData.credentials?.length) {
          const providerModelId = resolveProviderModelId(providerData.name, modelName, vendor);
          results.push({
            providerId: providerData.id,
            providerName: providerData.name,
            modelName: providerModelId,
          });
        }
      }

      return results.length > 0 ? results : null;
    } catch (error) {
      logger.error(`Failed to generate providers for model ${modelName}:`, error);
      return null;
    }
  }

  private async ensureProvidersForModel(model: string): Promise<{
    rotationState: {
      providers: Array<{ providerId: string; providerName: string; modelName: string }>;
      currentIndex: number;
      lastUpdateTime: number;
    };
    availableProviders: Array<{ providerId: string; providerName: string; modelName: string }>;
    modelName: string;
  } | null> {
    const { modelName } = parseModelNameWithProvider(model);

    const now = Date.now();
    let rotationState = this.rotationState.get(modelName);
    const needsRefresh =
      !rotationState || now - rotationState.lastUpdateTime > ProviderRotationManager.PROVIDER_CACHE_TTL;

    if (needsRefresh) {
      let providerList: Array<{ providerId: string; providerName: string; modelName: string }> | null = null;

      if (Config.creditBasedBillingEnabled) {
        providerList = await this.fetchProvidersFromCreditSystem(modelName);
      } else {
        providerList = await this.generateProvidersByModelPattern(modelName);
      }

      if (!providerList || providerList.length === 0) {
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

    return {
      rotationState,
      availableProviders,
      modelName,
    };
  }

  public async getNextProviderForModel(
    model: string,
    preferredProviderName?: string
  ): Promise<{ providerId: string; providerName: string; modelName: string } | null> {
    const result = await this.ensureProvidersForModel(model);
    if (!result) {
      return null;
    }

    const { rotationState, availableProviders, modelName } = result;

    if (availableProviders.length === 0) {
      logger.warn(`No available providers for model ${modelName}, all are in cool down or excluded`);
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

    const availableProviderIds = new Set(availableProviders.map((p) => p.providerId));
    let attempts = 0;
    let selected = null;

    while (attempts < rotationState.providers.length) {
      const candidate = rotationState.providers[rotationState.currentIndex];
      rotationState.currentIndex = (rotationState.currentIndex + 1) % rotationState.providers.length;

      if (candidate && availableProviderIds.has(candidate.providerId)) {
        selected = candidate;
        break;
      }

      attempts++;
    }

    if (!selected) {
      logger.error(`Could not find available provider for model ${modelName} after checking all providers`);
      return null;
    }

    logger.info('Provider rotation selection', {
      model: modelName,
      totalProviders: rotationState.providers.length,
      availableProviders: availableProviders.length,
      selected: selected.providerName,
      nextIndex: rotationState.currentIndex,
    });

    return {
      providerId: selected.providerId,
      providerName: selected.providerName,
      modelName: selected.modelName,
    };
  }

  public async getProvidersForModel(model: string): Promise<{
    totalProviders: number;
    availableProviders: number;
    providers: Array<{ providerId: string; providerName: string; modelName: string }>;
    availableProvidersList: Array<{ providerId: string; providerName: string; modelName: string }>;
  } | null> {
    const result = await this.ensureProvidersForModel(model);
    if (!result) {
      return null;
    }

    const { rotationState, availableProviders } = result;

    return {
      totalProviders: rotationState.providers.length,
      availableProviders: availableProviders.length,
      providers: rotationState.providers,
      availableProvidersList: availableProviders,
    };
  }
}

const providerRotationManager = new ProviderRotationManager();

export function markProviderAsFailed(providerId: string, providerName: string): void {
  providerRotationManager.markProviderAsFailed(providerId, providerName);
}

export async function getNextProviderForModel(
  model: string,
  preferredProviderName?: string
): Promise<{ providerId: string; providerName: string; modelName: string } | null> {
  return providerRotationManager.getNextProviderForModel(model, preferredProviderName);
}

export async function getProvidersForModel(model: string): Promise<{
  totalProviders: number;
  availableProviders: number;
  providers: Array<{ providerId: string; providerName: string; modelName: string }>;
  availableProvidersList: Array<{ providerId: string; providerName: string; modelName: string }>;
} | null> {
  return providerRotationManager.getProvidersForModel(model);
}

export function clearAllRotationCache(): void {
  providerRotationManager.clearAllCache();
}

export function clearFailedProvider(providerId: string): void {
  providerRotationManager.clearFailedProvider(providerId);
}

export function modelHasProvider(model: string): boolean {
  if (!model || !model.includes('/')) {
    return false;
  }

  const parts = model.split('/');
  if (parts.length < 2) {
    return false;
  }

  const possibleProvider = parts[0]?.toLowerCase();
  return SUPPORTED_PROVIDERS_SET.has(possibleProvider as AIProviderType);
}

function updateRequestModel(
  req: {
    body: { model?: string; input?: { model?: string; modelOptions?: { model?: string } } };
  },
  provider: string,
  modelId: string
): void {
  const modelWithProvider = `${provider}/${modelId}`;

  if (req.body?.model) req.body.model = modelWithProvider;
  if (req.body?.input?.model) req.body.input.model = modelWithProvider;
  if (req.body?.input?.modelOptions?.model) req.body.input.modelOptions.model = modelWithProvider;
}

async function hasActiveCredentials(providerName: string): Promise<boolean> {
  const provider = await AiProvider.findOne({
    where: { name: providerName, enabled: true },
    include: [
      {
        model: AiCredential,
        as: 'credentials',
        where: { active: true },
        required: true,
      },
    ],
  });

  return !!(provider && (provider as any).credentials?.length);
}

function getReqModel(req: {
  body: { model?: string; input?: { model?: string; modelOptions?: { model?: string } } };
}): string {
  return req.body?.model || req.body?.input?.model || req.body?.input?.modelOptions?.model || '';
}

/**
 * Ensure model has a provider, applying automatic rotation if needed
 * Modifies req.body.model to include provider prefix
 * Falls back to default provider if rotation fails
 */
export async function ensureModelWithProvider(
  req: {
    body: { model?: string; input?: { model?: string; modelOptions?: { model?: string } } };
  } & { provider?: string; model?: string }
): Promise<void> {
  const model = getReqModel(req);

  if (!model) {
    return;
  }

  if (modelHasProvider(model)) {
    logger.info(`Model ${model} already has provider, skipping rotation`);
    return;
  }

  let providerInfo: { providerId: string; providerName: string; modelName: string } | null = null;

  try {
    providerInfo = await getNextProviderForModel(model);
  } catch (error) {
    logger.warn(`Error during provider rotation for model ${model}:`, error);
  }

  if (providerInfo) {
    logger.info(`Selected provider ${providerInfo.providerName} for model ${model} via rotation`);
    updateRequestModel(req, providerInfo.providerName, providerInfo.modelName);
    return;
  }

  logger.warn(`Provider rotation failed for model ${model}, attempting fallback to default provider`);

  const defaultProvider = getDefaultProviderForModel(model);
  if (!defaultProvider) {
    throw new CustomError(
      400,
      `No available provider found for model "${model}". You can select a specific provider to try again, or wait until it becomes available.`
    );
  }

  const hasCredentials = await hasActiveCredentials(defaultProvider);
  if (!hasCredentials) {
    throw new CustomError(
      400,
      `No available provider found for model "${model}". You can select a specific provider to try again, or wait until it becomes available.`
    );
  }

  logger.info(`Using default provider ${defaultProvider} for model ${model}`);
  const vendor = inferVendorFromModel(model);
  const providerModelId = resolveProviderModelId(defaultProvider, model, vendor);
  updateRequestModel(req, defaultProvider, providerModelId);
}
