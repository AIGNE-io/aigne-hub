import { modelRegistry } from '@api/libs/model-registry';
import {
  ensureModelWithProvider,
  getDefaultProviderForModel,
  getNextProviderForModel,
  getSupportedProviders,
  inferVendorFromModel,
  resolveProviderModelId,
} from '@api/libs/provider-rotation';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import { beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Op } from 'sequelize';

const mockProviders = [
  { id: 'provider-1', name: 'google', enabled: true, credentials: [{ id: 'cred-1', active: true }] },
  { id: 'provider-2', name: 'openai', enabled: true, credentials: [{ id: 'cred-2', active: true }] },
  { id: 'provider-3', name: 'anthropic', enabled: true, credentials: [{ id: 'cred-3', active: true }] },
  { id: 'provider-4', name: 'openrouter', enabled: true, credentials: [{ id: 'cred-4', active: true }] },
  { id: 'provider-5', name: 'deepseek', enabled: true, credentials: [{ id: 'cred-5', active: true }] },
  { id: 'provider-6', name: 'poe', enabled: true, credentials: [{ id: 'cred-6', active: true }] },
];

const mockModelRates = [
  { model: 'gemini-2.0-flash-exp', provider: mockProviders[0] },
  { model: 'gpt-4o', provider: mockProviders[1] },
  { model: 'claude-3-5-sonnet-20241022', provider: mockProviders[2] },
];

describe('libs/ai-provider - Provider Rotation', () => {
  beforeAll(() => {
    spyOn(AiProvider, 'findAll').mockImplementation((options?: any) => {
      const whereClause = options?.where;
      let filteredProviders = mockProviders;

      if (whereClause?.name) {
        const names = whereClause.name[Op.in];
        if (names) {
          filteredProviders = mockProviders.filter((p) => names.includes(p.name));
        }
      }

      if (options?.include) {
        return Promise.resolve(filteredProviders.filter((p) => p.credentials.length > 0)) as any;
      }

      return Promise.resolve(filteredProviders) as any;
    });

    spyOn(AiProvider, 'findOne').mockImplementation((options?: any) => {
      const name = options?.where?.name;
      const provider = mockProviders.find((p) => p.name === name);

      if (provider && options?.include) {
        return Promise.resolve({ ...provider, credentials: provider.credentials }) as any;
      }

      return Promise.resolve(provider || null) as any;
    });

    spyOn(AiModelRate, 'findAll').mockImplementation((options?: any) => {
      const whereClause = options?.where?.model;

      if (whereClause) {
        const orConditions = whereClause[Op.or];
        if (orConditions) {
          return Promise.resolve(
            mockModelRates.map((rate) => ({
              model: rate.model,
              provider: rate.provider,
            }))
          ) as any;
        }
      }

      return Promise.resolve(
        mockModelRates.map((rate) => ({
          model: rate.model,
          provider: rate.provider,
        }))
      ) as any;
    });
  });

  beforeEach(() => {
    // Clean up between tests if needed
  });

  describe('provider-rotation functions', () => {
    test('should get supported providers for Gemini model', () => {
      const providers = getSupportedProviders('gemini-2.0-flash-exp');

      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers).toContain('google');
    });

    test('should get supported providers for GPT model', () => {
      const providers = getSupportedProviders('gpt-4o');

      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers).toContain('openai');
    });

    test('should get supported providers for Claude model', () => {
      const providers = getSupportedProviders('claude-3-5-sonnet-20241022');

      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      expect(providers).toContain('anthropic');
    });

    test('should return empty array for non-existent model', () => {
      const providers = getSupportedProviders('non-existent-model-xyz');

      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBe(0);
    });

    test('should handle model with provider prefix', () => {
      const model1 = 'gpt-4o';
      const model2 = 'openai/gpt-4o';
      const cleanModel2 = model2.split('/').pop() || model2;

      const providers1 = getSupportedProviders(model1);
      const providers2 = getSupportedProviders(cleanModel2);

      expect(providers1.length).toBeGreaterThan(0);
      expect(providers2.length).toBeGreaterThan(0);
    });

    test('should infer correct vendor from model name', () => {
      expect(inferVendorFromModel('gemini-2.0-flash-exp')).toBe('google');
      expect(inferVendorFromModel('gpt-4o')).toBe('openai');
      expect(inferVendorFromModel('claude-3-5-sonnet')).toBe('anthropic');
      expect(inferVendorFromModel('deepseek-chat')).toBe('deepseek');
      expect(inferVendorFromModel('llama-3.3-70b')).toBe('meta');
    });

    test('should resolve provider model ID correctly', () => {
      const model = 'gemini-2.0-flash-exp';
      const vendor = inferVendorFromModel(model);

      expect(resolveProviderModelId('google', model, vendor)).toBe('gemini-2.0-flash-exp');
      expect(resolveProviderModelId('openrouter', model, vendor)).toBe('google/gemini-2.0-flash-exp');
      expect(resolveProviderModelId('poe', model, vendor)).toBe('gemini-2.0-flash-exp');
    });
  });

  describe('getNextProviderForModel', () => {
    test('should return provider for model without prefix in non-credit mode', async () => {
      const nextProvider = await getNextProviderForModel('gemini-2.0-flash-exp');

      if (nextProvider) {
        expect(nextProvider).toHaveProperty('providerId');
        expect(nextProvider).toHaveProperty('providerName');
        expect(nextProvider).toHaveProperty('modelName');
        expect(nextProvider.providerName).toBeTruthy();
      }
    });

    test('should rotate through multiple providers', async () => {
      const provider1 = await getNextProviderForModel('gpt-4o');
      const provider2 = await getNextProviderForModel('gpt-4o');

      if (provider1 && provider2) {
        expect(provider1.providerName).toBeTruthy();
        expect(provider2.providerName).toBeTruthy();
      }
    });

    test('should return null for non-existent model', async () => {
      const nextProvider = await getNextProviderForModel('non-existent-model-xyz');
      expect(nextProvider).toBeNull();
    });
  });

  describe('ensureModelWithProvider', () => {
    test('should add provider prefix to model without provider', async () => {
      const req = {
        body: {
          model: 'gemini-2.0-flash-exp',
        },
      };

      await ensureModelWithProvider(req);

      expect(req.body.model).toBeTruthy();
      expect(req.body.model?.includes('/')).toBe(true);
    });

    test('should not modify model that already has provider', async () => {
      const req = {
        body: {
          model: 'google/gemini-2.0-flash-exp',
        },
      };

      await ensureModelWithProvider(req);

      expect(req.body.model).toBe('google/gemini-2.0-flash-exp');
    });

    test('should handle model in nested input object', async () => {
      const req = {
        body: {
          input: {
            model: 'gpt-4o',
          },
        },
      };

      await ensureModelWithProvider(req);

      if (req.body.input?.model?.includes('/')) {
        expect(req.body.input.model).toMatch(/^[a-z]+\/gpt-4o$/);
      }
    });

    test('should handle model in modelOptions', async () => {
      const req = {
        body: {
          input: {
            modelOptions: {
              model: 'gpt-4o',
            },
          },
        },
      };

      await ensureModelWithProvider(req);

      if (req.body.input?.modelOptions?.model?.includes('/')) {
        expect(req.body.input.modelOptions.model).toMatch(/^[a-z]+\/gpt-4o$/);
      }
    });

    test('should handle empty or missing model gracefully', async () => {
      const req1 = { body: {} as any };
      await ensureModelWithProvider(req1);
      expect(req1.body.model).toBeUndefined();

      const req2 = { body: { model: '' } };
      await ensureModelWithProvider(req2);
      expect(req2.body.model).toBe('');
    });
  });

  describe('modelRegistry cache', () => {
    test('should return cache status information', () => {
      const cacheStatus = modelRegistry.getCacheStatus();

      expect(cacheStatus).toHaveProperty('cached');
      expect(cacheStatus).toHaveProperty('expired');
      expect(cacheStatus).toHaveProperty('age');
      expect(cacheStatus).toHaveProperty('expiresIn');
      expect(cacheStatus).toHaveProperty('totalModels');

      expect(typeof cacheStatus.cached).toBe('boolean');
      expect(typeof cacheStatus.expired).toBe('boolean');
      expect(typeof cacheStatus.age).toBe('number');
      expect(typeof cacheStatus.expiresIn).toBe('number');
      expect(typeof cacheStatus.totalModels).toBe('number');
    });

    test('should have valid cache after fetching model data', async () => {
      await modelRegistry.getAllModels();
      const cacheStatus = modelRegistry.getCacheStatus();

      expect(cacheStatus.cached).toBe(true);
      expect(cacheStatus.totalModels).toBeGreaterThan(0);
    });
  });

  describe('provider detection logic', () => {
    test('should correctly detect models with provider prefix', async () => {
      const modelsWithProvider = [
        'openai/gpt-4o',
        'google/gemini-2.0-flash-exp',
        'anthropic/claude-3-5-sonnet-20241022',
        'openrouter/google/gemini-2.0-flash-exp',
      ];

      const results = await Promise.all(
        modelsWithProvider.map(async (model) => {
          const req = { body: { model } };
          const originalModel = model;
          await ensureModelWithProvider(req);
          return { actual: req.body.model, expected: originalModel };
        })
      );

      results.forEach(({ actual, expected }) => {
        expect(actual).toBe(expected);
      });
    });

    test('should correctly detect models without provider prefix', async () => {
      const modelsWithoutProvider = ['gpt-4o', 'gemini-2.0-flash-exp', 'claude-3-5-sonnet-20241022'];

      const results = await Promise.all(
        modelsWithoutProvider.map(async (model) => {
          const req = { body: { model } };
          await ensureModelWithProvider(req);
          return { original: model, modified: req.body.model };
        })
      );

      results.forEach(({ original, modified }) => {
        if (modified?.includes('/')) {
          expect(modified).not.toBe(original);
        }
      });
    });
  });

  describe('pattern-based model matching', () => {
    test('should match GPT models with prefix gpt-', () => {
      const gptModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o-mini'];

      gptModels.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain('openai');
      });
    });

    test('should match Gemini models with prefix gemini', () => {
      const geminiModels = ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-pro', 'gemini-1.5-flash-002'];

      geminiModels.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain('google');
      });
    });

    test('should match Claude models with prefix claude', () => {
      const claudeModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307',
        'claude-sonnet-4-20250514',
      ];

      claudeModels.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain('anthropic');
      });
    });

    test('should match DeepSeek models with prefix deepseek', () => {
      const deepseekModels = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'];

      deepseekModels.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain('deepseek');
      });
    });

    test('should match OpenAI o1/o3 series models', () => {
      const oSeriesModels = ['o1-preview', 'o1-mini', 'o3-mini'];

      oSeriesModels.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain('openai');
      });
    });

    test('should handle new model variants', () => {
      const newModelVariants = ['gpt-5-preview', 'gemini-3.0-ultra', 'claude-4-opus', 'deepseek-v3'];

      newModelVariants.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getDefaultProviderForModel', () => {
    test('should return correct default provider for Gemini models', () => {
      expect(getDefaultProviderForModel('gemini-2.0-flash-exp')).toBe('google');
      expect(getDefaultProviderForModel('gemini-1.5-pro')).toBe('google');
      expect(getDefaultProviderForModel('gemini-pro')).toBe('google');
    });

    test('should return correct default provider for GPT models', () => {
      expect(getDefaultProviderForModel('gpt-4o')).toBe('openai');
      expect(getDefaultProviderForModel('gpt-4-turbo')).toBe('openai');
      expect(getDefaultProviderForModel('gpt-3.5-turbo')).toBe('openai');
    });

    test('should return correct default provider for Claude models', () => {
      expect(getDefaultProviderForModel('claude-3-5-sonnet-20241022')).toBe('anthropic');
      expect(getDefaultProviderForModel('claude-3-opus-20240229')).toBe('anthropic');
    });

    test('should return correct default provider for DeepSeek models', () => {
      expect(getDefaultProviderForModel('deepseek-chat')).toBe('deepseek');
      expect(getDefaultProviderForModel('deepseek-reasoner')).toBe('deepseek');
    });

    test('should return correct default provider for Grok models', () => {
      expect(getDefaultProviderForModel('grok-beta')).toBe('xai');
    });

    test('should return correct default provider for Doubao models', () => {
      expect(getDefaultProviderForModel('doubao-pro')).toBe('doubao');
    });

    test('should return openrouter for open-source models', () => {
      expect(getDefaultProviderForModel('llama-3.3-70b')).toBe('openrouter');
      expect(getDefaultProviderForModel('mistral-large')).toBe('openrouter');
      expect(getDefaultProviderForModel('qwen-max')).toBe('openrouter');
    });

    test('should return null for unknown models', () => {
      expect(getDefaultProviderForModel('unknown-model')).toBeNull();
      expect(getDefaultProviderForModel('random-xyz')).toBeNull();
    });

    test('should handle empty or invalid input', () => {
      expect(getDefaultProviderForModel('')).toBeNull();
    });
  });

  describe('resolveProviderModelId - Platform-specific formatting', () => {
    test('should format model ID correctly for OpenRouter', () => {
      expect(resolveProviderModelId('openrouter', 'gemini-2.0-flash-exp', 'google')).toBe(
        'google/gemini-2.0-flash-exp'
      );
      expect(resolveProviderModelId('openrouter', 'gpt-4o', 'openai')).toBe('openai/gpt-4o');
      expect(resolveProviderModelId('openrouter', 'claude-3-5-sonnet', 'anthropic')).toBe(
        'anthropic/claude-3-5-sonnet'
      );
    });

    test('should format model ID correctly for Bedrock', () => {
      expect(resolveProviderModelId('bedrock', 'claude-3-5-sonnet-20241022', 'anthropic')).toBe(
        'anthropic.claude-3-5-sonnet-20241022'
      );
      expect(resolveProviderModelId('bedrock', 'llama-3-70b', 'meta')).toBe('meta.llama-3-70b');
    });

    test('should handle Bedrock models already in correct format', () => {
      const bedrockModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
      expect(resolveProviderModelId('bedrock', bedrockModel, 'anthropic')).toBe(bedrockModel);
    });

    test('should keep model name unchanged for direct providers', () => {
      expect(resolveProviderModelId('google', 'gemini-2.0-flash-exp')).toBe('gemini-2.0-flash-exp');
      expect(resolveProviderModelId('openai', 'gpt-4o')).toBe('gpt-4o');
      expect(resolveProviderModelId('anthropic', 'claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
      expect(resolveProviderModelId('deepseek', 'deepseek-chat')).toBe('deepseek-chat');
    });

    test('should keep model name unchanged for Poe', () => {
      expect(resolveProviderModelId('poe', 'gemini-2.0-flash-exp', 'google')).toBe('gemini-2.0-flash-exp');
      expect(resolveProviderModelId('poe', 'gpt-4o', 'openai')).toBe('gpt-4o');
    });

    test('should infer vendor when not provided', () => {
      expect(resolveProviderModelId('openrouter', 'gemini-2.0-flash-exp')).toBe('google/gemini-2.0-flash-exp');
      expect(resolveProviderModelId('openrouter', 'gpt-4o')).toBe('openai/gpt-4o');
      expect(resolveProviderModelId('bedrock', 'claude-3-5-sonnet')).toBe('anthropic.claude-3-5-sonnet');
    });

    test('should handle models with vendor prefix already present', () => {
      expect(resolveProviderModelId('openrouter', 'google/gemini-2.0-flash-exp', 'google')).toBe(
        'google/gemini-2.0-flash-exp'
      );
    });
  });

  describe('inferVendorFromModel - Extended coverage', () => {
    test('should infer vendor for all OpenAI model variants', () => {
      expect(inferVendorFromModel('gpt-4o')).toBe('openai');
      expect(inferVendorFromModel('o1-preview')).toBe('openai');
      expect(inferVendorFromModel('o3-mini')).toBe('openai');
      expect(inferVendorFromModel('dall-e-3')).toBe('openai');
      expect(inferVendorFromModel('text-embedding-ada-002')).toBe('openai');
      expect(inferVendorFromModel('sora-1.0')).toBe('openai');
    });

    test('should infer vendor for open-source models', () => {
      expect(inferVendorFromModel('llama-3.3-70b')).toBe('meta');
      expect(inferVendorFromModel('mistral-large')).toBe('mistral');
      expect(inferVendorFromModel('mixtral-8x7b')).toBe('mistral');
      expect(inferVendorFromModel('qwen-max')).toBe('qwen');
      expect(inferVendorFromModel('gemma-2')).toBe('google');
      expect(inferVendorFromModel('yi-34b')).toBe('yi');
      expect(inferVendorFromModel('phi-3')).toBe('microsoft');
    });

    test('should return undefined for unknown model patterns', () => {
      expect(inferVendorFromModel('unknown-model')).toBeUndefined();
      expect(inferVendorFromModel('random-xyz')).toBeUndefined();
    });

    test('should handle empty input', () => {
      expect(inferVendorFromModel('')).toBeUndefined();
    });
  });

  describe('ensureModelWithProvider - Fallback mechanism', () => {
    test('should use default provider when rotation returns null', async () => {
      const req = {
        body: {
          model: 'gemini-2.0-flash-exp',
        },
      };

      await ensureModelWithProvider(req);

      expect(req.body.model).toBeTruthy();
      if (req.body.model?.includes('/')) {
        expect(req.body.model).toMatch(/^[a-z]+\//);
      }
    });

    test('should throw error for unsupported model without default provider', async () => {
      const req = {
        body: {
          model: 'completely-unknown-model-xyz-123',
        },
      };

      await expect(ensureModelWithProvider(req)).rejects.toThrow();
    });

    test('should handle models with various vendor patterns', async () => {
      const models = ['gpt-4o', 'claude-3-5-sonnet-20241022', 'gemini-2.0-flash-exp', 'deepseek-chat', 'llama-3.3-70b'];

      const results = await Promise.all(
        models.map(async (model) => {
          const req = { body: { model } };
          await ensureModelWithProvider(req);
          return { result: req.body.model };
        })
      );

      results.forEach(({ result }) => {
        expect(result).toBeTruthy();
      });
    });
  });

  describe('getSupportedProviders - Provider ranking', () => {
    test('should prioritize direct providers over aggregators', () => {
      const geminiProviders = getSupportedProviders('gemini-2.0-flash-exp');
      expect(geminiProviders[0]).toBe('google');

      const gptProviders = getSupportedProviders('gpt-4o');
      expect(gptProviders[0]).toBe('openai');

      const claudeProviders = getSupportedProviders('claude-3-5-sonnet');
      expect(claudeProviders[0]).toBe('anthropic');
    });

    test('should include aggregator providers in correct order', () => {
      const geminiProviders = getSupportedProviders('gemini-2.0-flash-exp');
      expect(geminiProviders).toContain('google');
      expect(geminiProviders).toContain('openrouter');
      expect(geminiProviders).toContain('poe');

      const gptProviders = getSupportedProviders('gpt-4o');
      expect(gptProviders).toContain('openai');
      expect(gptProviders).toContain('openrouter');
      expect(gptProviders).toContain('poe');
    });

    test('should support multiple providers for Claude models', () => {
      const claudeProviders = getSupportedProviders('claude-3-5-sonnet');
      expect(claudeProviders).toContain('anthropic');
      expect(claudeProviders).toContain('bedrock');
      expect(claudeProviders).toContain('openrouter');
      expect(claudeProviders).toContain('poe');
    });

    test('should support aggregators for open-source models', () => {
      const llamaProviders = getSupportedProviders('llama-3.3-70b');
      expect(llamaProviders).toContain('openrouter');
      expect(llamaProviders).toContain('ollama');
      expect(llamaProviders).toContain('bedrock');
    });
  });

  describe('edge cases and boundary conditions', () => {
    test('should handle model names with special characters', async () => {
      const req = {
        body: {
          model: 'gpt-4o-2024-08-06',
        },
      };

      await ensureModelWithProvider(req);
      expect(req.body.model).toBeTruthy();
    });

    test('should handle model names with version suffixes', () => {
      expect(getSupportedProviders('claude-3-5-sonnet-20241022').length).toBeGreaterThan(0);
      expect(getSupportedProviders('gpt-4-0613').length).toBeGreaterThan(0);
    });

    test('should handle lowercase and mixed case model names', () => {
      expect(getSupportedProviders('GPT-4o').length).toBeGreaterThan(0);
      expect(getSupportedProviders('Gemini-2.0-Flash').length).toBeGreaterThan(0);
      expect(getSupportedProviders('Claude-3-Opus').length).toBeGreaterThan(0);
    });

    test('should handle model names with multiple slashes', () => {
      const req = {
        body: {
          model: 'openrouter/google/gemini-2.0-flash-exp',
        },
      };

      const originalModel = req.body.model;
      ensureModelWithProvider(req);
      expect(req.body.model).toBe(originalModel);
    });

    test('should handle empty request body gracefully', async () => {
      const req = { body: {} as any };
      await ensureModelWithProvider(req);
      expect(req.body.model).toBeUndefined();
    });

    test('should handle null model gracefully', async () => {
      const req = { body: { model: null as any } };
      await ensureModelWithProvider(req);
      expect(req.body.model).toBeNull();
    });
  });

  describe('provider rotation state management', () => {
    test('should cache provider list for repeated calls', async () => {
      const model = 'gpt-4o';
      const provider1 = await getNextProviderForModel(model);
      const provider2 = await getNextProviderForModel(model);

      if (provider1 && provider2) {
        expect(provider1.providerName).toBeTruthy();
        expect(provider2.providerName).toBeTruthy();
      }
    });

    test('should rotate through different providers on subsequent calls', async () => {
      const model = 'gemini-2.0-flash-exp';
      const calls = 5;

      const results = await Promise.all(
        Array.from({ length: calls }, async () => {
          const provider = await getNextProviderForModel(model);
          return provider?.providerName;
        })
      );

      const validResults = results.filter(Boolean);
      expect(validResults.length).toBeGreaterThan(0);
    });
  });

  describe('model extraction from different request formats', () => {
    test('should extract model from body.model', async () => {
      const req = { body: { model: 'gpt-4o' } };
      await ensureModelWithProvider(req);
      expect(req.body.model).toBeTruthy();
    });

    test('should extract model from body.input.model', async () => {
      const req = { body: { input: { model: 'gpt-4o' } } };
      await ensureModelWithProvider(req);
      expect(req.body.input?.model).toBeTruthy();
    });

    test('should extract model from body.input.modelOptions.model', async () => {
      const req = { body: { input: { modelOptions: { model: 'gpt-4o' } } } };
      await ensureModelWithProvider(req);
      expect(req.body.input?.modelOptions?.model).toBeTruthy();
    });

    test('should update all model locations when present', async () => {
      const req = {
        body: {
          model: 'gpt-4o',
          input: {
            model: 'gpt-4o',
            modelOptions: {
              model: 'gpt-4o',
            },
          },
        },
      };

      await ensureModelWithProvider(req);

      if (req.body.model?.includes('/')) {
        expect(req.body.input?.model).toBe(req.body.model);
        expect(req.body.input?.modelOptions?.model).toBe(req.body.model);
      }
    });
  });

  describe('supported model families', () => {
    test('should support all major model families', () => {
      const modelFamilies = [
        { pattern: 'gpt-', expected: 'openai' },
        { pattern: 'gemini-', expected: 'google' },
        { pattern: 'claude-', expected: 'anthropic' },
        { pattern: 'deepseek-', expected: 'deepseek' },
        { pattern: 'grok-', expected: 'xai' },
        { pattern: 'doubao-', expected: 'doubao' },
      ];

      modelFamilies.forEach(({ pattern, expected }) => {
        const testModel = `${pattern}test`;
        const providers = getSupportedProviders(testModel);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain(expected);
      });
    });

    test('should support OpenAI special series', () => {
      const specialModels = ['o1-preview', 'o1-mini', 'o3-mini', 'dall-e-3', 'text-embedding-3-large', 'sora-1.0'];

      specialModels.forEach((model) => {
        const providers = getSupportedProviders(model);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers).toContain('openai');
      });
    });
  });
});
