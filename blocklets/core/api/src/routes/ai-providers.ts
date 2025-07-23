import { getModelNameWithProvider } from '@api/libs/ai-provider';
import { Config } from '@api/libs/env';
import logger from '@api/libs/logger';
import modelRegistry from '@api/libs/model-registry';
import { ensureAdmin } from '@api/libs/security';
import AiCredential, { CredentialValue } from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { Router } from 'express';
import Joi from 'joi';
import { pick } from 'lodash';
import { Op } from 'sequelize';

const router = Router();

const user = sessionMiddleware({ accessKey: true });

// 验证schemas
const createProviderSchema = Joi.object({
  name: Joi.string()
    .valid('openai', 'anthropic', 'bedrock', 'deepseek', 'google', 'ollama', 'openrouter', 'xai')
    .required(),
  displayName: Joi.string().min(1).max(100).required(),
  baseUrl: Joi.string().uri().optional(),
  region: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().max(50).required(),
    otherwise: Joi.string().max(50).allow('', null).optional(),
  }),
  enabled: Joi.boolean().default(true),
  config: Joi.object().optional(),
});

const updateProviderSchema = Joi.object({
  name: Joi.string().valid('openai', 'anthropic', 'bedrock', 'deepseek', 'google', 'ollama', 'openrouter', 'xai'),
  baseUrl: Joi.string().uri().optional(),
  region: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().max(50).required(),
    otherwise: Joi.string().max(50).default('').allow('', null).optional(),
  }),
  enabled: Joi.boolean(),
});

const createCredentialSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  value: Joi.alternatives()
    .try(
      Joi.string().min(1), // 单个值
      Joi.object({
        api_key: Joi.string().optional(),
        access_key_id: Joi.string().optional(),
        secret_access_key: Joi.string().optional(),
      }).unknown(true) // 允许其他字段
    )
    .required(),
  credentialType: Joi.string().valid('api_key', 'access_key_pair', 'custom').default('api_key'),
});

const createModelRateSchema = Joi.object({
  model: Joi.string().min(1).max(100).required(),
  modelDisplay: Joi.string().min(1).max(100).allow('').optional(),
  type: Joi.string().valid('chatCompletion', 'imageGeneration', 'embedding').required(),
  description: Joi.string().allow('').optional(),
  inputRate: Joi.number().min(0).required(),
  outputRate: Joi.number().min(0).required(),
});

const updateModelRateSchema = Joi.object({
  inputRate: Joi.number().min(0).optional(),
  outputRate: Joi.number().min(0).optional(),
  modelDisplay: Joi.string().min(1).max(100).allow('').optional(),
  description: Joi.string().allow('').optional(),
});

// get providers
router.get('/', user, async (req, res) => {
  try {
    const where: any = {};
    if (req.query.name) {
      where.name = req.query.name;
    }
    const providers = await AiProvider.findAll({
      where,
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: AiModelRate,
          as: 'modelRates',
          required: false,
        },
      ],
    });

    const credentials = await AiCredential.findAll({
      where: {
        active: true,
        providerId: {
          [Op.in]: providers.map((provider) => provider.id),
        },
      },
    });

    const providersWithMaskedCredentials = providers.map((provider) => {
      const providerJson = provider.toJSON() as any;
      providerJson.credentials = credentials.filter((cred) => cred.providerId === provider.id);
      providerJson.credentials = providerJson.credentials.map((cred: any) => {
        const credentialJson = cred.toJSON() as any;
        return {
          ...credentialJson,
          displayText: cred.getDisplayText(),
          maskedValue: cred.getMaskedValue(),
        };
      });
      return providerJson;
    });

    return res.json(providersWithMaskedCredentials);
  } catch (error) {
    logger.error('Failed to get providers:', error);
    return res.status(500).json({
      error: 'Failed to get providers',
    });
  }
});

// create provider
router.post('/', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = createProviderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    // 检查是否已存在同名provider
    const existingProvider = await AiProvider.findOne({
      where: { name: value.name },
    });

    if (existingProvider) {
      return res.status(409).json({
        error: 'Provider with this name already exists',
      });
    }

    const provider = await AiProvider.create(value);

    return res.json(provider.toJSON());
  } catch (error) {
    logger.error('Failed to create provider:', error);
    return res.status(500).json({
      error: 'Failed to create provider',
    });
  }
});

// update provider
router.put('/:id', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = updateProviderSchema.validate(pick(req.body, ['name', 'baseUrl', 'region', 'enabled']));

    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    const provider = await AiProvider.findByPk(req.params.id);
    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
      });
    }

    await provider.update(value);

    return res.json(provider.toJSON());
  } catch (error) {
    logger.error('Failed to update provider:', error);
    return res.status(500).json({
      error: 'Failed to update provider',
    });
  }
});

// delete provider
router.delete('/:id', ensureAdmin, async (req, res) => {
  try {
    const provider = await AiProvider.findByPk(req.params.id);
    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
      });
    }

    await provider.destroy();

    return res.json({
      message: 'Provider deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete provider:', error);
    return res.status(500).json({
      error: 'Failed to delete provider',
    });
  }
});

// create credential
router.post('/:providerId/credentials', ensureAdmin, async (req, res) => {
  try {
    const { error, value: rawValue } = createCredentialSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    // 验证provider是否存在
    const provider = await AiProvider.findByPk(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
      });
    }

    // 处理凭证值
    let credentialValue: CredentialValue;
    if (typeof rawValue.value === 'string') {
      // 单个值，根据类型处理
      if (rawValue.credentialType === 'api_key') {
        credentialValue = { api_key: rawValue.value };
      } else {
        credentialValue = { [rawValue.credentialType]: rawValue.value };
      }
    } else {
      // 已经是对象格式
      credentialValue = rawValue.value;
    }

    // 加密凭证值
    const encryptedCredentialValue = AiCredential.encryptCredentialValue(credentialValue);

    const credential = await AiCredential.create({
      providerId: req.params.providerId!,
      name: rawValue.name,
      credentialValue: encryptedCredentialValue,
      credentialType: rawValue.credentialType,
      active: true,
      usageCount: 0,
    });

    // 返回时包含显示文本
    const credentialJson = credential.toJSON() as any;
    credentialJson.displayText = credential.getDisplayText();
    credentialJson.maskedValue = credential.getMaskedValue();
    delete credentialJson.credentialValue;

    return res.json(credentialJson);
  } catch (error) {
    logger.error('Failed to create credential:', error);
    return res.status(500).json({
      error: 'Failed to create credential',
    });
  }
});

// update credential
router.put('/:providerId/credentials/:credentialId', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = createCredentialSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    const credential = await AiCredential.findOne({
      where: {
        id: req.params.credentialId,
        providerId: req.params.providerId,
      },
    });

    if (!credential) {
      return res.status(404).json({
        error: 'Credential not found',
      });
    }

    // 处理凭证值
    let credentialValue: CredentialValue;
    if (typeof value.value === 'string') {
      // 单个值，根据类型处理
      if (value.credentialType === 'api_key') {
        credentialValue = { api_key: value.value };
      } else {
        credentialValue = { [value.credentialType]: value.value };
      }
    } else {
      // 已经是对象格式
      credentialValue = value.value;
    }

    // 加密新的凭证值
    const encryptedCredentialValue = AiCredential.encryptCredentialValue(credentialValue);

    await credential.update({
      name: value.name,
      credentialValue: encryptedCredentialValue,
      credentialType: value.credentialType,
    });

    // 返回时包含显示文本
    const credentialJson = credential.toJSON() as any;
    credentialJson.displayText = credential.getDisplayText();
    credentialJson.maskedValue = credential.getMaskedValue();
    delete credentialJson.credentialValue;

    return res.json(credentialJson);
  } catch (error) {
    logger.error('Failed to update credential:', error);
    return res.status(500).json({
      error: 'Failed to update credential',
    });
  }
});

// remove credential
router.delete('/:providerId/credentials/:credentialId', ensureAdmin, async (req, res) => {
  try {
    const credential = await AiCredential.findOne({
      where: {
        id: req.params.credentialId,
        providerId: req.params.providerId,
      },
    });

    if (!credential) {
      return res.status(404).json({
        error: 'Credential not found',
      });
    }

    await credential.destroy();

    return res.json({
      message: 'Credential deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete credential:', error);
    return res.status(500).json({
      error: 'Failed to delete credential',
    });
  }
});

// get model rates for a provider
router.get('/:providerId/model-rates', user, async (req, res) => {
  try {
    const provider = await AiProvider.findByPk(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
      });
    }

    const modelRates = await AiModelRate.findAll({
      where: { providerId: req.params.providerId },
      order: [
        ['model', 'ASC'],
        ['type', 'ASC'],
      ],
    });

    return res.json(modelRates);
  } catch (error) {
    logger.error('Failed to get model rates:', error);
    return res.status(500).json({
      error: 'Failed to get model rates',
    });
  }
});

// create model rate
router.post('/:providerId/model-rates', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = createModelRateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    const provider = await AiProvider.findByPk(req.params.providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
      });
    }

    // Check if rate already exists for this provider-model-type combination
    const existingRate = await AiModelRate.findOne({
      where: {
        providerId: req.params.providerId,
        model: value.model,
        type: value.type,
      },
    });

    if (existingRate) {
      return res.status(409).json({
        error: 'Rate already exists for this provider-model-type combination',
      });
    }
    const modelDisplay = value.modelDisplay || AiModelRate.getDefaultModelDisplay(value.model);

    const modelRate = await AiModelRate.create({
      providerId: req.params.providerId!,
      model: value.model,
      type: value.type,
      inputRate: value.inputRate,
      outputRate: value.outputRate,
      modelDisplay,
      description: value.description,
    });

    return res.json(modelRate.toJSON());
  } catch (error) {
    logger.error('Failed to create model rate:', error);
    return res.status(500).json({
      error: 'Failed to create model rate',
    });
  }
});

// update model rate
router.put('/:providerId/model-rates/:rateId', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = updateModelRateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    const modelRate = await AiModelRate.findOne({
      where: {
        id: req.params.rateId,
        providerId: req.params.providerId,
      },
    });

    if (!modelRate) {
      return res.status(404).json({
        error: 'Model rate not found',
      });
    }

    await modelRate.update(value);

    return res.json(modelRate.toJSON());
  } catch (error) {
    logger.error('Failed to update model rate:', error);
    return res.status(500).json({
      error: 'Failed to update model rate',
    });
  }
});

// delete model rate
router.delete('/:providerId/model-rates/:rateId', ensureAdmin, async (req, res) => {
  try {
    const modelRate = await AiModelRate.findOne({
      where: {
        id: req.params.rateId,
        providerId: req.params.providerId,
      },
    });

    if (!modelRate) {
      return res.status(404).json({
        error: 'Model rate not found',
      });
    }

    await modelRate.destroy();

    return res.json({
      message: 'Model rate deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete model rate:', error);
    return res.status(500).json({
      error: 'Failed to delete model rate',
    });
  }
});

// create model rate or batch create across providers
router.post('/model-rates', ensureAdmin, async (req, res) => {
  try {
    // Schema for batch create (with providers array)
    const batchCreateSchema = Joi.object({
      model: Joi.string().min(1).max(100).required(),
      modelDisplay: Joi.string().min(1).max(100).allow('').optional(),
      type: Joi.string().valid('chatCompletion', 'imageGeneration', 'embedding').required(),
      description: Joi.string().allow('').optional(),
      inputRate: Joi.number().min(0).required(),
      outputRate: Joi.number().min(0).required(),
      providers: Joi.array().items(Joi.string()).min(1).required(),
      unitCosts: Joi.object({
        input: Joi.number().min(0).required(),
        output: Joi.number().min(0).required(),
      }).optional(),
    });

    const { error, value } = batchCreateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    // Step 1: Validate all providers exist
    const providers = await AiProvider.findAll({
      where: {
        id: {
          [Op.in]: value.providers,
        },
      },
    });

    // Check for missing providers
    const foundProviderIds = providers.map((p) => p.id);
    const missingProviders = value.providers.filter((id: string) => !foundProviderIds.includes(id));

    if (missingProviders.length > 0) {
      return res.status(400).json({
        error: `Providers not found: ${missingProviders.join(', ')}`,
      });
    }

    // Step 2: Check for existing rates
    const existingRates = await AiModelRate.findAll({
      where: {
        providerId: {
          [Op.in]: value.providers,
        },
        model: value.model,
        type: value.type,
      },
      include: [
        {
          model: AiProvider,
          as: 'provider',
          attributes: ['displayName'],
        },
      ],
    });

    if (existingRates.length > 0) {
      const conflictProviders = existingRates.map((rate: any) => rate.provider.displayName);
      return res.status(409).json({
        error: `Rate already exists for model "${value.model}" with type "${value.type}" in providers: ${conflictProviders.join(', ')}`,
      });
    }

    // Step 3: All validations passed, create model rates
    const modelDisplay = value.modelDisplay || AiModelRate.getDefaultModelDisplay(value.model);

    const createdRates = await Promise.all(
      value.providers.map(async (providerId: string) => {
        const modelRate = await AiModelRate.create({
          providerId,
          model: value.model,
          type: value.type,
          inputRate: value.inputRate,
          outputRate: value.outputRate,
          modelDisplay,
          description: value.description,
          unitCosts: value.unitCosts ?? {},
        });

        return modelRate.toJSON();
      })
    );

    return res.json({
      message: `Successfully created ${createdRates.length} model rates`,
      data: createdRates,
      summary: {
        total: value.providers.length,
      },
    });
  } catch (error) {
    logger.error('Failed to batch create model rates:', error);
    return res.status(500).json({
      error: 'Failed to batch create model rates',
    });
  }
});

/**
 * 获取配置中启用的提供商对应的默认模型
 */
async function getDefaultModelsFromProviders(typeFilter?: string) {
  try {
    const enabledProviders = await AiProvider.getEnabledProviders();

    if (enabledProviders.length === 0) {
      return [];
    }

    const models: any[] = [];

    if (Config.pricing?.onlyEnableModelsInPricing && Config.pricing.list) {
      Config.pricing.list.forEach((pricingModel) => {
        if (typeFilter && pricingModel.type !== typeFilter) {
          return;
        }

        const { providerName, modelName } = getModelNameWithProvider(pricingModel.model, 'openai');

        const provider = enabledProviders.find((p) => p.name === providerName.toLowerCase());

        if (!provider) {
          return;
        }

        models.push({
          model: modelName,
          modelDisplay: pricingModel.model,
          description: 'Model from pricing configuration',
          rates: [
            {
              id: `pricing-${provider.id}-${modelName}`,
              type: pricingModel.type,
              inputRate: pricingModel.inputRate,
              outputRate: pricingModel.outputRate,
              provider,
              description: 'Model from pricing configuration',
            },
          ],
          providers: [
            {
              name: provider.name,
              id: provider.id,
              displayName: provider.displayName,
            },
          ],
        });
      });
    } else {
      // Use model registry to get models from LiteLLM
      try {
        const allModelsMap = await modelRegistry.getAllModels();
        enabledProviders.forEach((provider) => {
          const providerJson = provider.toJSON();
          const providerModels = allModelsMap[providerJson.name] || [];

          providerModels.forEach((modelOption) => {
            // Filter by type if specified
            if (typeFilter && typeFilter !== modelOption.mode) {
              return;
            }
            models.push({
              model: modelOption.name,
              modelDisplay: modelOption.displayName,
              description: `Model from ${providerJson.displayName} via LiteLLM`,
              rates: [
                {
                  id: `litellm-${provider.id}-${modelOption.name}`,
                  type: modelOption.mode,
                  inputRate: 0,
                  outputRate: 0,
                  provider: providerJson,
                  description: `Model from ${providerJson.displayName} via LiteLLM`,
                },
              ],
              providers: [
                {
                  name: providerJson.name,
                  id: providerJson.id,
                  displayName: providerJson.displayName,
                },
              ],
            });
          });
        });
      } catch (error) {
        logger.error('Failed to fetch models from registry, falling back to empty list:', error);
      }
    }

    return models;
  } catch (error) {
    logger.error('Failed to get default models from providers:', error);
    return [];
  }
}

router.get('/chat/models', user, async (req, res) => {
  try {
    const where: any = {};
    if (req.query.type) {
      where.type = req.query.type;
    }
    const modelRates = await AiModelRate.findAll({
      where,
      include: [
        {
          model: AiProvider,
          as: 'provider',
          where: {
            enabled: true,
          },
          attributes: ['id', 'name', 'displayName', 'baseUrl', 'region', 'enabled'],
        },
      ],
      order: [
        ['model', 'ASC'],
        ['type', 'ASC'],
      ],
    });

    if (!Config.creditBasedBillingEnabled) {
      const defaultModels = await getDefaultModelsFromProviders(req.query.type as string);
      return res.json(defaultModels);
    }

    // Group by model name
    const modelsMap = new Map();

    modelRates.forEach((rate) => {
      const rateJson = rate.toJSON() as any;
      const modelName = rateJson.model;

      if (!modelsMap.has(modelName)) {
        modelsMap.set(modelName, {
          model: modelName,
          description: rateJson.description,
          rates: [],
          providers: new Set(),
        });
      }

      const modelData = modelsMap.get(modelName);
      modelData.rates.push({
        id: rateJson.id,
        type: rateJson.type,
        inputRate: rateJson.inputRate,
        outputRate: rateJson.outputRate,
        provider: rateJson.provider,
        description: rateJson.description,
      });
      modelData.providers.add({
        name: rateJson.provider.name,
        id: rateJson.provider.id,
        displayName: rateJson.provider.displayName,
      });
    });

    // Convert to array and format providers as array
    const models = Array.from(modelsMap.values()).map((model: any) => ({
      ...model,
      providers: Array.from(model.providers),
    }));

    return res.json(models);
  } catch (error) {
    logger.error('Failed to get models:', error);
    return res.status(500).json({
      error: 'Failed to get models',
    });
  }
});

router.get('/model-rates', user, async (req, res) => {
  const where: any = {};
  if (req.query.providerId) {
    where.providerId = {
      [Op.in]: Array.isArray(req.query.providerId) ? req.query.providerId : (req.query.providerId as string).split(','),
    };
  }
  const modelRates = await AiModelRate.findAll({
    where,
    include: [
      {
        model: AiProvider,
        as: 'provider',
        attributes: ['id', 'name', 'displayName', 'baseUrl', 'region', 'enabled'],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
  return res.json(modelRates);
});

// get available models in LiteLLM format (public endpoint)
router.get('/models', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.type) {
      where.type = req.query.type;
    }

    const providers = await AiProvider.getEnabledProviders();
    if (providers.length === 0) {
      return res.json({});
    }

    const modelRates = await AiModelRate.findAll({
      where,
      include: [
        {
          model: AiProvider,
          as: 'provider',
          where: {
            id: {
              [Op.in]: providers.map((p) => p.id),
            },
          },
          attributes: ['id', 'name', 'displayName'],
        },
      ],
      order: [
        ['model', 'ASC'],
        ['type', 'ASC'],
      ],
    });

    const result: Record<string, any> = {};

    // type mapping
    const typeMap = {
      chatCompletion: 'chat',
      imageGeneration: 'image_generation',
      embedding: 'embedding',
    };

    modelRates.forEach((rate) => {
      const rateJson = rate.toJSON() as any;
      const providerName = rateJson.provider.name;
      const modelName = rateJson.model;
      const key = `${providerName}/${modelName}`;

      result[key] = {
        mode: typeMap[rateJson.type as keyof typeof typeMap] || 'chat',
        litellm_provider: providerName,
        input_credits_per_token: rateJson.inputRate || 0,
        output_credits_per_token: rateJson.outputRate || 0,
      };
    });

    // If no configured rates and credit billing is disabled, return default models
    if (!Config.creditBasedBillingEnabled) {
      try {
        const allModelsMap = await modelRegistry.getAllModels();
        const enabledProviders = await AiProvider.getEnabledProviders();

        enabledProviders.forEach((provider) => {
          const providerJson = provider.toJSON();
          const providerModels = allModelsMap[providerJson.name] || [];

          providerModels.forEach((modelOption) => {
            // Filter by type if specified
            const typeFilterMap: Record<string, string> = {
              chatCompletion: 'chatCompletion',
              imageGeneration: 'imageGeneration',
              embedding: 'embedding',
            };

            if (req.query.type && typeFilterMap[req.query.type as string] !== modelOption.mode) {
              return;
            }

            const key = `${providerJson.name}/${modelOption.name}`;
            result[key] = {
              mode: typeMap[modelOption.mode as keyof typeof typeMap] || 'chat',
              litellm_provider: providerJson.name,
              input_credits_per_token: 0,
              output_credits_per_token: 0,
            };
          });
        });
      } catch (error) {
        logger.error('Failed to fetch models from registry:', error);
      }
    }

    return res.json(result);
  } catch (error) {
    logger.error('Failed to get available models:', error);
    return res.status(500).json({
      error: 'Failed to get available models',
    });
  }
});

export default router;
