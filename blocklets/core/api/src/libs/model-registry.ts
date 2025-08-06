import axios from 'axios';

import logger from './logger';

interface LiteLLMModelData {
  [key: string]: {
    max_tokens?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    litellm_provider: string;
    mode?: string;
    supports_vision?: boolean;
    supports_function_calling?: boolean;
    supports_parallel_function_calling?: boolean;
    supports_system_messages?: boolean;
    supports_tool_choice?: boolean;
    [key: string]: any;
  };
}

interface ModelOption {
  name: string;
  displayName: string;
  mode: string;
  provider: string;
  inputCost?: number;
  outputCost?: number;
  maxTokens?: number;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
  supportsToolChoice?: boolean;
}

interface CachedModelData {
  data: Record<string, ModelOption[]>;
  timestamp: number;
  expiresAt: number;
  totalModels: number;
  version: string;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_VERSION = '1.0.0';
const LITELLM_API_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

export const SUPPORTED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'bedrock',
  'deepseek',
  'google',
  'ollama',
  'openrouter',
  'xai',
]);

// Filter patterns - consistent with frontend
const TEST_PATTERN = /^ft:|^test-|^dev-|^beta-|^alpha-/i;
const SUPPORTED_MODES = new Set(['chat', 'image_generation', 'embedding']);

class ModelRegistry {
  private cache: CachedModelData | null = null;

  private providerModelMap: Record<string, ModelOption[]> = {};

  /**
   * Process model name - consistent with frontend logic
   */
  private processModelName(modelName: string): { processedName: string; displayName: string } {
    const parts = modelName.split('/');
    let processedName = modelName;
    let displayName = modelName;

    if (parts && parts.length > 1 && SUPPORTED_PROVIDERS.has(parts[0]!)) {
      processedName = parts.slice(1).join('/');
      displayName = processedName;
    }

    const lastPart = displayName.split('/').pop();
    const finalDisplayName = lastPart
      ? lastPart.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
      : displayName;

    if (finalDisplayName.toLowerCase().includes('gpt')) {
      return {
        processedName,
        displayName: finalDisplayName.replace(/gpt/gi, 'GPT'),
      };
    }

    return {
      processedName,
      displayName: finalDisplayName,
    };
  }

  /**
   * Check if model should be filtered - consistent with frontend logic
   */
  private shouldFilterModel(modelName: string, options: any): boolean {
    // Filter models with time pattern

    // Filter test models
    if (TEST_PATTERN.test(modelName)) {
      return true;
    }

    // Filter unsupported providers
    if (!SUPPORTED_PROVIDERS.has(options.litellm_provider)) {
      return true;
    }

    // Filter unsupported modes
    if (options.mode && !SUPPORTED_MODES.has(options.mode)) {
      return true;
    }

    return false;
  }

  /**
   * Process raw LiteLLM data into organized model options
   */
  private processLiteLLMData(rawData: LiteLLMModelData): Record<string, ModelOption[]> {
    const providerMap: Record<string, ModelOption[]> = {};

    // Initialize provider arrays
    SUPPORTED_PROVIDERS.forEach((provider) => {
      providerMap[provider] = [];
    });

    const modeMap = {
      chat: 'chatCompletion',
      image_generation: 'imageGeneration',
      embedding: 'embedding',
    };

    Object.entries(rawData).forEach(([modelName, options]) => {
      // Skip sample spec and filtered models
      if (modelName === 'sample_spec' || this.shouldFilterModel(modelName, options)) {
        return;
      }

      const provider = options.litellm_provider;
      if (!SUPPORTED_PROVIDERS.has(provider)) {
        return;
      }

      const { processedName, displayName } = this.processModelName(modelName);

      const modelOption: ModelOption = {
        name: processedName,
        displayName,
        mode: modeMap[options.mode as keyof typeof modeMap] || 'chatCompletion',
        provider,
        inputCost: options.input_cost_per_token,
        outputCost: options.output_cost_per_token,
        maxTokens: options.max_tokens || options.max_input_tokens,
        supportsVision: options.supports_vision,
        supportsFunctionCalling: options.supports_function_calling,
        supportsToolChoice: options.supports_tool_choice,
      };

      providerMap[provider]!.push(modelOption);
    });

    // Sort models within each provider
    Object.keys(providerMap).forEach((provider) => {
      providerMap[provider]!.sort((a, b) => a.name.localeCompare(b.name));
    });

    return providerMap;
  }

  /**
   * Check if cache exists and has valid version
   */
  private hasCacheData(): boolean {
    if (!this.cache) return false;
    if (this.cache.version !== CACHE_VERSION) return false;
    return true;
  }

  /**
   * Check if cache is expired (but still usable)
   */
  private isCacheExpired(): boolean {
    if (!this.cache) return true;
    return Date.now() > this.cache.expiresAt;
  }

  /**
   * Fetch and cache model data from LiteLLM
   */
  private async fetchModelData(forceRefresh: boolean = false): Promise<void> {
    // Use existing cache unless force refresh is requested
    if (this.hasCacheData() && !forceRefresh) {
      if (this.isCacheExpired()) {
        logger.info('Using expired cached model data (normal mode)');
      } else {
        logger.info('Using cached model data');
      }
      return;
    }

    try {
      logger.info('Fetching model data from LiteLLM...');

      const response = await axios.get<LiteLLMModelData>(LITELLM_API_URL, {
        timeout: 30000, // 30 second timeout
      });

      const rawData: LiteLLMModelData = response.data;
      const totalModels = Object.keys(rawData).length;

      this.providerModelMap = this.processLiteLLMData(rawData);

      // Cache the processed data
      this.cache = {
        data: this.providerModelMap,
        timestamp: Date.now(),
        expiresAt: Date.now() + CACHE_DURATION,
        totalModels,
        version: CACHE_VERSION,
      };

      logger.info(`Cached ${totalModels} models from LiteLLM`);
    } catch (error) {
      logger.error('Failed to fetch model data from LiteLLM:', error);
      throw error;
    }
  }

  /**
   * Force refresh model data from LiteLLM
   */
  async refreshModelData(): Promise<void> {
    await this.fetchModelData(true);
  }

  /**
   * Get models by provider
   */
  async getModelsByProvider(provider: string): Promise<ModelOption[]> {
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return [];
    }

    await this.fetchModelData();
    return this.providerModelMap[provider] || [];
  }

  /**
   * Get models by provider and mode
   */
  async getModelsByProviderAndMode(provider: string, mode: string): Promise<ModelOption[]> {
    const models = await this.getModelsByProvider(provider);
    return models.filter((model) => model.mode === mode);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(SUPPORTED_PROVIDERS);
  }

  /**
   * Get all models across all providers
   */
  async getAllModels(): Promise<Record<string, ModelOption[]>> {
    await this.fetchModelData();
    return this.providerModelMap;
  }

  /**
   * Search models by name across all providers
   */
  async searchModels(query: string, limit: number = 100): Promise<ModelOption[]> {
    await this.fetchModelData();

    const lowerQuery = query.toLowerCase();
    const results: ModelOption[] = [];

    for (const models of Object.values(this.providerModelMap)) {
      for (const model of models) {
        if (results.length >= limit) break;

        if (model.name.toLowerCase().includes(lowerQuery) || model.displayName.toLowerCase().includes(lowerQuery)) {
          results.push(model);
        }
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Get cache status
   */
  getCacheStatus(): { cached: boolean; expired: boolean; age: number; expiresIn: number; totalModels: number } {
    if (!this.cache) {
      return { cached: false, expired: true, age: 0, expiresIn: 0, totalModels: 0 };
    }

    return {
      cached: this.hasCacheData(),
      expired: this.isCacheExpired(),
      age: Date.now() - this.cache.timestamp,
      expiresIn: this.cache.expiresAt - Date.now(),
      totalModels: this.cache.totalModels,
    };
  }

  /**
   * Clear cache and force refresh
   */
  clearCache(): void {
    this.cache = null;
    this.providerModelMap = {};
    logger.info('Model registry cache cleared');
  }
}

// Export singleton instance
export const modelRegistry = new ModelRegistry();
export default modelRegistry;

// Export types
export type { ModelOption, LiteLLMModelData };
