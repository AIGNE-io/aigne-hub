import { isValidAIProvider } from '@blocklet/aigne-hub/api';
import { useCallback, useMemo, useState } from 'react';

import { CachedModelData, LiteLLMModelData, ModelOption, Provider } from './types';

const CACHE_KEY = 'ai-kit-model-data';
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const CACHE_VERSION = '1.0.0';
const LITELLM_API_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const TEST_PATTERN = /^ft:|^test-|^dev-|^beta-|^alpha-/i;

// supported modes
const SUPPORTED_MODES = new Set(['chat', 'image_generation', 'embedding']);

const processModelName = (modelName: string): { processedName: string; displayName: string } => {
  const parts = modelName.split('/');
  let processedName = modelName;
  let displayName = modelName;

  if (parts && parts.length > 1 && isValidAIProvider(parts[0]!)) {
    processedName = parts.slice(1).join('/');
    displayName = processedName;
  }

  const finalDisplayName =
    displayName
      .split('/')
      .pop()
      ?.replace(/-/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()) || displayName;

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
};

const shouldFilterModel = (modelName: string, options: any): boolean => {
  // filter test models
  if (TEST_PATTERN.test(modelName)) {
    return true;
  }

  // filter unsupported providers
  if (!isValidAIProvider(options.litellm_provider)) {
    return true;
  }

  // filter unsupported modes
  if (options.mode && !SUPPORTED_MODES.has(options.mode)) {
    return true;
  }

  return false;
};

const getModelOptionsFromCache = (): ModelOption[] => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return [];

    const parsedData: CachedModelData = JSON.parse(cached);

    if (parsedData.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return [];
    }

    if (Date.now() > parsedData.expiresAt) {
      localStorage.removeItem(CACHE_KEY);
      return [];
    }

    return parsedData.data || [];
  } catch (error) {
    console.error('Failed to parse cached model data:', error);
    localStorage.removeItem(CACHE_KEY);
    return [];
  }
};

export const filterModelsByProviders = (models: ModelOption[], availableProviders: Provider[]): ModelOption[] => {
  if (!availableProviders || availableProviders.length === 0) {
    return models;
  }

  const availableProviderNames = new Set(availableProviders.map((p) => p.name));
  return models.filter((model) => availableProviderNames.has(model.provider));
};

export const searchModels = (models: ModelOption[], query: string, limit: number = 100): ModelOption[] => {
  if (!query.trim()) {
    return models.slice(0, limit);
  }

  const lowerQuery = query.toLowerCase();
  const matches = models.filter(
    (option) => option.name.toLowerCase().includes(lowerQuery) || option.displayName.toLowerCase().includes(lowerQuery)
  );

  return matches.slice(0, limit);
};

export function useModelData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(() => getModelOptionsFromCache());

  const getCachedData = useCallback((): CachedModelData | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const parsedData: CachedModelData = JSON.parse(cached);

      if (parsedData.version !== CACHE_VERSION) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      if (Date.now() > parsedData.expiresAt) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      return parsedData;
    } catch (error) {
      console.error('Failed to parse cached model data:', error);
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  }, []);

  const cacheData = useCallback((data: ModelOption[], totalModels: number) => {
    try {
      const cachedData: CachedModelData = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + CACHE_DURATION,
        totalModels,
        filteredModels: data.length,
        version: CACHE_VERSION,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
      setModelOptions(data);
    } catch (error) {
      console.error('Failed to cache model data:', error);
    }
  }, []);

  const filterModelData = useCallback((data: LiteLLMModelData): ModelOption[] => {
    const filtered: ModelOption[] = [];

    Object.entries(data).forEach(([modelName, options]) => {
      if (shouldFilterModel(modelName, options)) {
        return;
      }

      const { processedName, displayName } = processModelName(modelName);

      const modeMap = {
        chat: 'chatCompletion',
        image_generation: 'imageGeneration',
        embedding: 'embedding',
      };

      filtered.push({
        name: processedName,
        displayName,
        mode: modeMap[options.mode as keyof typeof modeMap] || 'chatCompletion',
        provider: options.litellm_provider,
        inputCost: options.input_cost_per_token ?? 0,
        outputCost: options.output_cost_per_token ?? 0,
        maxTokens: options.max_tokens || options.max_input_tokens,
        supportsVision: options.supports_vision,
        supportsFunctionCalling: options.supports_function_calling,
        supportsToolChoice: options.supports_tool_choice,
      });
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const fetchModelData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const cachedData = getCachedData();
      if (cachedData) {
        setLoading(false);
        return cachedData.data;
      }

      const response = await fetch(LITELLM_API_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawData: LiteLLMModelData = await response.json();
      const totalModels = Object.keys(rawData).length;

      const filteredOptions = filterModelData(rawData);

      cacheData(filteredOptions, totalModels);

      return filteredOptions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch model data';
      setError(errorMessage);
      console.error('Failed to fetch model data:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [getCachedData, cacheData, filterModelData]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setModelOptions([]);
  }, []);

  const cacheStatus = useMemo(() => {
    const cached = getCachedData();
    return {
      hasCached: !!cached,
      cacheAge: cached ? Date.now() - cached.timestamp : 0,
      expiresIn: cached ? cached.expiresAt - Date.now() : 0,
    };
  }, [getCachedData]);

  return {
    modelOptions,
    loading,
    error,
    fetchModelData,
    clearCache,
    cacheStatus,
  };
}
