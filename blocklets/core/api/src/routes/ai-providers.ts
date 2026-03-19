import checkCredentials from '@api/libs/ai-credentials';
import { getModelNameWithProvider } from '@api/libs/ai-provider';
import { AIProviderType, AI_PROVIDER_VALUES } from '@api/libs/constants';
import { Config } from '@api/libs/env';
import logger from '@api/libs/logger';
import modelRegistry from '@api/libs/model-registry';
import { ensureAdmin } from '@api/libs/security';
import { createListParamSchema, getWhereFromKvQuery } from '@api/libs/validate';
import { checkModelIsValid, getDefaultTestModels } from '@api/providers/models';
import AiCredential, { CredentialValue } from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiModelRateHistory from '@api/store/models/ai-model-rate-history';
import AiModelStatus from '@api/store/models/ai-model-status';
import AiProvider from '@api/store/models/ai-provider';
import { formatError } from '@blocklet/error';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import BigNumber from 'bignumber.js';
import { NextFunction, Request, Response, Router } from 'express';
import Joi from 'joi';
import pick from 'lodash/pick';
import pAll from 'p-all';
import { Op } from 'sequelize';

import {
  CreatedEntry,
  SyncUpdate,
  buildSyncResult,
  matchUpdateToDbRate,
  officialPricingToSyncUpdates,
  propagateToTier2,
  unitCostsChanged,
} from '../libs/bulk-rate-sync';
import { getFormatModelType, modelStatusQueue, typeFilterMap } from '../libs/status';

const testModelsRateLimit = new Map<string, { count: number; startTime: number }>();
const TEST_MODELS_RATE_LIMIT_TIME = 10 * 60 * 1000; // 10 minutes
const TEST_MODELS_RATE_LIMIT_COUNT = 5;

const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.did) {
    const now = Date.now();
    const userLimit = testModelsRateLimit.get(req.user.did);

    if (userLimit) {
      if (now - userLimit.startTime < TEST_MODELS_RATE_LIMIT_TIME) {
        if (userLimit.count >= TEST_MODELS_RATE_LIMIT_COUNT) {
          const remainingTime = Math.ceil((TEST_MODELS_RATE_LIMIT_TIME - (now - userLimit.startTime)) / 1000);

          res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. Please try again in ${remainingTime} seconds.`,
            retryAfter: remainingTime,
          });
          return;
        }

        userLimit.count++;
      } else {
        testModelsRateLimit.set(req.user.did, { count: 1, startTime: now });
      }
    } else {
      testModelsRateLimit.set(req.user.did, { count: 1, startTime: now });
    }
  }

  next();
};

function extractCredentialParams(
  rawValue: { value: any; credentialType: string },
  provider: { baseUrl?: string; region?: string }
): { apiKey?: string; baseURL?: string; accessKeyId?: string; secretAccessKey?: string; region?: string } {
  const params: { apiKey?: string; baseURL?: string; accessKeyId?: string; secretAccessKey?: string; region?: string } =
    {};

  if (rawValue.credentialType === 'api_key') {
    if (typeof rawValue.value === 'string') {
      params.apiKey = rawValue.value;
    } else if (typeof rawValue.value === 'object' && rawValue.value.api_key) {
      params.apiKey = rawValue.value.api_key;
    }
  } else if (rawValue.credentialType === 'access_key_pair' && typeof rawValue.value === 'object') {
    params.accessKeyId = rawValue.value.access_key_id;
    params.secretAccessKey = rawValue.value.secret_access_key;
  }

  if (provider.baseUrl) params.baseURL = provider.baseUrl;
  if (provider.region) params.region = provider.region;

  return params;
}

const router = Router();

const user = sessionMiddleware({ accessKey: true });

// 验证schemas
const createProviderSchema = Joi.object({
  name: Joi.string()
    .valid(...AI_PROVIDER_VALUES)
    .required(),
  displayName: Joi.string().min(1).max(100).required(),
  baseUrl: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().default('').allow('', null).optional(),
    otherwise: Joi.string().uri().required(),
  }),
  region: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().max(50).required(),
    otherwise: Joi.string().max(50).allow('', null).optional(),
  }),
  enabled: Joi.boolean().default(true),
  config: Joi.object().optional(),
});

const updateProviderSchema = Joi.object({
  name: Joi.string().valid(...AI_PROVIDER_VALUES),
  baseUrl: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().default('').allow('', null).optional(),
    otherwise: Joi.string().uri().required(),
  }),
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
  testModel: Joi.string().max(100).optional(),
});

const createModelRateSchema = Joi.object({
  model: Joi.string().min(1).max(100).required(),
  modelDisplay: Joi.string().min(1).max(100).allow('').optional(),
  type: Joi.string().valid('chatCompletion', 'imageGeneration', 'embedding', 'video').required(),
  description: Joi.string().allow('').optional(),
  inputRate: Joi.number().min(0).required(),
  outputRate: Joi.number().min(0).required(),
  unitCosts: Joi.object({
    input: Joi.number().min(0).required(),
    output: Joi.number().min(0).required(),
  }).optional(),
  caching: Joi.object({
    readRate: Joi.number().min(0).optional(),
    writeRate: Joi.number().min(0).optional(),
  }).optional(),
  modelMetadata: Joi.object({
    maxTokens: Joi.number().min(1).allow(null).optional(),
    features: Joi.array()
      .items(Joi.string().valid('tools', 'thinking', 'vision'))
      .optional(),
    imageGeneration: Joi.object({
      max: Joi.number().min(1).allow(null).optional(),
      quality: Joi.array().items(Joi.string()).optional(),
      size: Joi.array().items(Joi.string()).optional(),
      style: Joi.array().items(Joi.string()).optional(),
    }).optional(),
  }).optional(),
});

const updateModelRateSchema = Joi.object({
  inputRate: Joi.number().min(0).optional(),
  outputRate: Joi.number().min(0).optional(),
  modelDisplay: Joi.string().min(1).max(100).allow('').optional(),
  description: Joi.string().allow('').optional(),
  unitCosts: Joi.object({
    input: Joi.number().min(0).required(),
    output: Joi.number().min(0).required(),
  }).optional(),
  caching: Joi.object({
    readRate: Joi.number().min(0).optional(),
    writeRate: Joi.number().min(0).optional(),
  }).optional(),
  modelMetadata: Joi.object({
    maxTokens: Joi.number().min(1).allow(null).optional(),
    features: Joi.array()
      .items(Joi.string().valid('tools', 'thinking', 'vision'))
      .optional(),
    imageGeneration: Joi.object({
      max: Joi.number().min(1).allow(null).optional(),
      quality: Joi.array().items(Joi.string()).optional(),
      size: Joi.array().items(Joi.string()).optional(),
      style: Joi.array().items(Joi.string()).optional(),
    }).optional(),
  }).optional(),
});

const modelRatesListSchema = createListParamSchema<{
  providerId?: string;
  model?: string;
}>({
  providerId: Joi.string().empty(''),
  model: Joi.string().empty(''),
});

const bulkRateUpdateSchema = Joi.object({
  mode: Joi.string().valid('margin', 'sync').default('margin'),

  // margin mode fields (required when mode=margin)
  profitMargin: Joi.number()
    .min(0)
    .when('mode', {
      is: 'margin',
      then: Joi.required(),
      otherwise: Joi.when('applyRates', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    }),
  creditPrice: Joi.number()
    .positive()
    .when('mode', {
      is: 'margin',
      then: Joi.required(),
      otherwise: Joi.when('applyRates', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    }),

  // sync mode fields
  updates: Joi.array()
    .items(
      Joi.object({
        providerId: Joi.string().required(),
        model: Joi.string().required(),
        unitCosts: Joi.object({
          input: Joi.number().min(0).required(),
          output: Joi.number().min(0).required(),
        }).required(),
        caching: Joi.object({
          readRate: Joi.number().min(0),
          writeRate: Joi.number().min(0),
        }).optional(),
        source: Joi.string().optional(),
        isNew: Joi.boolean().optional(),
        modelType: Joi.string().optional(),
      })
    )
    .when('mode', { is: 'sync', then: Joi.optional() }),

  // sync mode: also accepts raw OfficialPricingEntry[] array (either updates or entries required)
  entries: Joi.array()
    .items(
      Joi.object({
        provider: Joi.string().required(),
        modelId: Joi.string().required(),
        inputCostPerToken: Joi.number().allow(null),
        outputCostPerToken: Joi.number().allow(null),
        cachedInputCostPerToken: Joi.number().allow(null),
        cacheTiers: Joi.array().items(Joi.object({ label: Joi.string(), costPerToken: Joi.number() })),
        modelType: Joi.string(),
        isNew: Joi.boolean(),
      }).unknown(true)
    )
    .when('mode', { is: 'sync', then: Joi.optional() }),

  applyRates: Joi.boolean().default(false),

  // sync mode: soft-delete tier1 models not found in official pricing data
  deprecateUnmatched: Joi.boolean().default(false),

  // sync mode: dry run — return preview without executing any changes
  dryRun: Joi.boolean().default(false),
});

interface BulkUpdateSummary {
  id: string;
  model: string;
  provider: string;
  oldInputRate: number;
  newInputRate: number;
  oldOutputRate: number;
  newOutputRate: number;
}

// toFixed(10): per-token costs can be as small as 1e-8 (e.g. $0.01/MTok);
// toFixed(6) truncates these to 0, causing free-model misclassification.
const calculateRate = (unitCost: number, profitMargin: number, creditPrice: number): number => {
  return Number(
    new BigNumber(unitCost)
      .multipliedBy(1 + profitMargin / 100)
      .dividedBy(creditPrice)
      .toFixed(10)
  );
};

// get default test models for credential validation
router.get('/test-models', ensureAdmin, (_req, res) => {
  return res.json(getDefaultTestModels());
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
      ...(req.query.includeModelRates
        ? {
            include: [
              {
                model: AiModelRate,
                as: 'modelRates',
                required: false,
              },
            ],
          }
        : {}),
    });

    const credentials = await AiCredential.findAll({
      where: {
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
    return res.status(500).json({ error: formatError(error) || 'Failed to get providers' });
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
    return res.status(500).json({ error: formatError(error) || 'Failed to create provider' });
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
    return res.status(500).json({ error: formatError(error) || 'Failed to update provider' });
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
    return res.status(500).json({ error: formatError(error) || 'Failed to delete provider' });
  }
});

// create credential
router.post('/:providerId/credentials', ensureAdmin, async (req, res) => {
  try {
    const { error, value: rawValue } = createCredentialSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({ error: error.details[0]?.message || 'Validation error' });
    }

    const provider = await AiProvider.findByPk(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const params = extractCredentialParams(rawValue, provider);
    await checkModelIsValid(provider.name, params, rawValue.testModel);

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
    return res.status(500).json({ error: formatError(error) || 'Failed to create credential' });
  }
});

// update credential
router.put('/:providerId/credentials/:credentialId', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = createCredentialSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0]?.message || 'Validation error' });
    }

    const credential = await AiCredential.findOne({
      where: {
        id: req.params.credentialId,
        providerId: req.params.providerId,
      },
    });

    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const provider = await AiProvider.findByPk(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const params = extractCredentialParams(value, provider);
    await checkModelIsValid(provider.name, params, value.testModel);

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
      active: true,
      error: null,
    });

    // 返回时包含显示文本
    const credentialJson = credential.toJSON() as any;
    credentialJson.displayText = credential.getDisplayText();
    credentialJson.maskedValue = credential.getMaskedValue();
    delete credentialJson.credentialValue;

    return res.json(credentialJson);
  } catch (error) {
    logger.error('Failed to update credential:', error);
    return res.status(500).json({ error: formatError(error) || 'Failed to update credential' });
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
    return res.status(500).json({ error: formatError(error) || 'Failed to delete credential' });
  }
});

// test raw credentials without saving (for pre-submit validation)
router.post('/:providerId/credentials/test', ensureAdmin, rateLimitMiddleware, async (req, res) => {
  try {
    const provider = await AiProvider.findByPk(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const { value, credentialType, testModel } = req.body;
    if (!value) {
      return res.status(400).json({ error: 'Credential value is required' });
    }

    const params = extractCredentialParams({ value, credentialType }, provider);
    await checkModelIsValid(provider.name, params, testModel);
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid credentials', detail: err.message });
  }
});

router.get('/:providerId/credentials/:credentialId/check', ensureAdmin, async (req, res) => {
  const { credentialId, providerId } = req.params;
  const { testModel } = req.query as { testModel?: string };

  try {
    if (!credentialId || !providerId) {
      throw new Error('Credential ID and provider ID are required');
    }

    const credential = await checkCredentials(credentialId, providerId, testModel);
    const credentialJson = {
      ...credential.toJSON(),
      displayText: credential.getDisplayText(),
      maskedValue: credential.getMaskedValue(),
      credentialValue: '',
    };

    return res.json(credentialJson);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid credentials', detail: err.message });
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

    const rateWhere: any = { providerId: req.params.providerId };
    if (req.query.includeDeprecated !== 'true') {
      rateWhere[Op.or] = [{ deprecated: false }, { deprecated: null }];
    }

    const modelRates = await AiModelRate.findAll({
      where: rateWhere,
      order: [
        ['model', 'ASC'],
        ['type', 'ASC'],
      ],
    });

    return res.json(modelRates);
  } catch (error) {
    logger.error('Failed to get model rates:', error);
    return res.status(500).json({ error: formatError(error) || 'Failed to get model rates' });
  }
});

// create model rate
router.post('/:providerId/model-rates', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = createModelRateSchema.validate(req.body, {
      stripUnknown: true,
    });
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
      modelMetadata: value.modelMetadata,
      unitCosts: value.unitCosts,
      caching: value.caching,
    });

    modelStatusQueue.push({
      model: modelRate.model,
      type: getFormatModelType(modelRate.type),
      providerId: modelRate.providerId,
    });

    return res.json(modelRate.toJSON());
  } catch (error) {
    logger.error('Failed to create model rate:', error);
    return res.status(500).json({ error: formatError(error) || 'Failed to create model rate' });
  }
});

// update model rate
router.put('/:providerId/model-rates/:rateId', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = updateModelRateSchema.validate(
      pick(req.body, [
        'modelDisplay',
        'inputRate',
        'outputRate',
        'description',
        'modelMetadata',
        'unitCosts',
        'caching',
      ])
    );
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
    return res.status(500).json({ error: formatError(error) || 'Failed to update model rate' });
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
    return res.status(500).json({ error: formatError(error) || 'Failed to delete model rate' });
  }
});

// Schema for batch create (with providers array)
const batchCreateSchema = Joi.object({
  model: Joi.string().min(1).max(100).required(),
  modelDisplay: Joi.string().min(1).max(100).allow('').optional(),
  type: Joi.string().valid('chatCompletion', 'imageGeneration', 'embedding', 'video').required(),
  description: Joi.string().allow('').optional(),
  inputRate: Joi.number().min(0).required(),
  outputRate: Joi.number().min(0).required(),
  providers: Joi.array().items(Joi.string()).min(1).required(),
  unitCosts: Joi.object({
    input: Joi.number().min(0).required(),
    output: Joi.number().min(0).required(),
  }).optional(),
  caching: Joi.object({
    readRate: Joi.number().min(0).allow(null).optional(),
    writeRate: Joi.number().min(0).allow(null).optional(),
  }).optional(),
  modelMetadata: Joi.object({
    maxTokens: Joi.number().min(1).allow(null).optional(),
    features: Joi.array()
      .items(Joi.string().valid('tools', 'thinking', 'vision'))
      .optional(),
    imageGeneration: Joi.object({
      max: Joi.number().min(1).allow(null).optional(),
      quality: Joi.array().items(Joi.string()).optional(),
      size: Joi.array().items(Joi.string()).optional(),
      style: Joi.array().items(Joi.string()).optional(),
    }).optional(),
  }).optional(),
});

// create model rate or batch create across providers
router.post('/model-rates', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = batchCreateSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details[0]?.message || 'Validation error' });
    }

    // Step 1: Validate all providers exist
    const providers = await AiProvider.findAll({ where: { id: { [Op.in]: value.providers } } });

    // Check for missing providers
    const foundProviderIds = providers.map((p) => p.id);
    const missingProviders = value.providers.filter((id: string) => !foundProviderIds.includes(id));

    if (missingProviders.length > 0) {
      return res.status(400).json({ error: `Providers not found: ${missingProviders.join(', ')}` });
    }

    // Step 2: Check for existing rates
    const existingRates = await AiModelRate.findAll({
      where: {
        providerId: { [Op.in]: value.providers },
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
          modelMetadata: value.modelMetadata,
          caching: value.caching,
        });

        return modelRate.toJSON();
      })
    );

    createdRates.forEach((rate) => {
      modelStatusQueue.push({
        model: rate.model,
        type: getFormatModelType(rate.type),
        providerId: rate.providerId,
      });
    });

    return res.json({
      message: `Successfully created ${createdRates.length} model rates`,
      data: createdRates,
      summary: {
        total: value.providers.length,
      },
    });
  } catch (error) {
    logger.error('Failed to batch create model rates:', error);
    return res.status(500).json({ error: formatError(error) || 'Failed to batch create model rates' });
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

            modelOption.name =
              providerJson.name === 'google'
                ? (modelOption.name.replace('gemini/', '') as AIProviderType)
                : modelOption.name;

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
    if (!Config.creditBasedBillingEnabled) {
      const defaultModels = await getDefaultModelsFromProviders(req.query.type as string);
      return res.json(defaultModels);
    }

    const where: any = {
      [Op.or]: [{ deprecated: false }, { deprecated: null }],
    };
    if (req.query.type) {
      const requestedType = req.query.type as string;
      const mappedType = typeFilterMap[requestedType] || requestedType;
      where.type = mappedType;
    }

    const modelRates = await AiModelRate.findAll({
      where,
      include: [
        {
          model: AiProvider,
          as: 'provider',
          where: { enabled: true },
          attributes: ['id', 'name', 'displayName', 'baseUrl', 'region', 'enabled'],
        },
      ],
      order: [
        ['model', 'ASC'],
        ['type', 'ASC'],
      ],
    });

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
    return res.status(500).json({ error: formatError(error) || 'Failed to get models' });
  }
});

router.get('/model-rates', user, async (req, res) => {
  try {
    const { page, pageSize, ...query } = await modelRatesListSchema.validateAsync(req.query, { stripUnknown: true });
    const where: any = getWhereFromKvQuery(query.q);

    // Filter deprecated models unless explicitly requested
    if (req.query.includeDeprecated !== 'true') {
      where[Op.and] = [...(where[Op.and] || []), { [Op.or]: [{ deprecated: false }, { deprecated: null }] }];
    }

    if (query.providerId) {
      where.providerId = {
        [Op.in]: Array.isArray(query.providerId) ? query.providerId : query.providerId.split(','),
      };
    }

    if (query.model) {
      where.model = {
        [Op.like]: `%${query.model}%`,
      };
    }

    const { rows: modelRates, count } = await AiModelRate.findAndCountAll({
      where,
      include: [
        {
          model: AiProvider,
          as: 'provider',
          attributes: ['id', 'name', 'displayName', 'baseUrl', 'region', 'enabled'],
        },
      ],
      order: [['createdAt', query.o === 'asc' ? 'ASC' : 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const list = await Promise.all(
      modelRates.map(async (rate) => {
        const modelStatus = await AiModelStatus.findOne({
          where: { providerId: rate.providerId, model: rate.model, type: rate.type },
        });
        return { ...rate.toJSON(), status: modelStatus };
      })
    );

    return res.json({
      count,
      list,
      paging: {
        page,
        pageSize,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch model rates:', error);
    return res.status(400).json({ error: formatError(error) });
  }
});

// get available models in LiteLLM format (public endpoint)
router.get('/models', async (req, res) => {
  try {
    const where: any = {
      [Op.or]: [{ deprecated: false }, { deprecated: null }],
    };

    if (req.query.type) {
      const requestedType = req.query.type as string;
      const mappedType = typeFilterMap[requestedType] || requestedType;
      where.type = mappedType;
    }

    const providers = await AiProvider.getEnabledProviders();
    if (providers.length === 0) {
      return res.json([]);
    }

    // If no configured rates and credit billing is disabled, return default models
    if (!Config.creditBasedBillingEnabled) {
      try {
        const result: any[] = [];
        const allModelsMap = await modelRegistry.getAllModels();
        const enabledProviders = await AiProvider.getEnabledProviders();

        enabledProviders.forEach((provider) => {
          const providerJson = provider.toJSON();
          const providerModels = allModelsMap[providerJson.name] || [];

          providerModels.forEach((modelOption) => {
            // Filter by type if specified
            if (req.query.type && typeFilterMap[req.query.type as string] !== modelOption.mode) {
              return;
            }

            const features: ('tools' | 'thinking' | 'vision')[] = [];
            if (modelOption.supportsVision) {
              features.push('vision');
            }
            if (modelOption.supportsToolChoice) {
              features.push('tools');
            }
            const modelMetadata = {
              maxTokens: modelOption.maxTokens,
              features,
            };
            result.push({
              key: `${providerJson.name}/${modelOption.name}`,
              model: modelOption.name,
              type: getFormatModelType(modelOption.mode),
              provider: providerJson.name,
              input_credits_per_token: 0,
              output_credits_per_token: 0,
              modelMetadata,
              status: 'active',
              providerDisplayName: providerJson.displayName,
            });
          });
        });
        return res.json(result);
      } catch (error) {
        logger.error('Failed to fetch models from registry:', error);
        return res.status(500).json({
          error: 'Failed to fetch models from registry',
        });
      }
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

    const result: any[] = [];

    modelRates.forEach((rate) => {
      const rateJson = rate.toJSON() as AiModelRate & { provider: AiProvider };
      const providerName = rateJson.provider.name;
      const modelName = rateJson.model;

      result.push({
        key: `${providerName}/${modelName}`,
        model: modelName,
        type: getFormatModelType(rate.type),
        provider: providerName,
        providerId: rateJson.provider.id,
        input_credits_per_token: rateJson.inputRate || 0,
        output_credits_per_token: rateJson.outputRate || 0,
        modelMetadata: rateJson.modelMetadata,
        status: 'active',
        providerDisplayName: rateJson.provider.displayName,
      });
    });

    const list = await Promise.all(
      result.map(async (item) => {
        const modelStatus = await AiModelStatus.findOne({
          where: { providerId: item.providerId, model: item.model, type: item.type },
        });
        return { ...item, status: modelStatus };
      })
    );

    return res.json(list);
  } catch (error) {
    logger.error('Failed to get available models:', error);
    return res.status(500).json({ error: formatError(error) });
  }
});

const inputSchema = createListParamSchema({
  page: Joi.number().integer().optional(),
  pageSize: Joi.number().integer().optional(),
});

router.get('/test-models', user, ensureAdmin, rateLimitMiddleware, async (req, res) => {
  try {
    const { page, pageSize, providerId, model, type } = req.query || {};

    const where: any = {};
    const params: any = {};

    const { value } = inputSchema.validate({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });

    if (value.page && value.pageSize) {
      params.offset = (value.page - 1) * value.pageSize;
      params.limit = value.pageSize;
    } else if (value.pageSize) {
      params.limit = value.pageSize;
    }

    if (providerId) {
      where.providerId = {
        [Op.in]: Array.isArray(providerId) ? providerId : String(providerId).split(','),
      };
    }

    if (model) {
      where.model = {
        [Op.like]: `%${model}%`,
      };
    }

    if (type) {
      const requestedType = req.query.type as string;
      const mappedType = typeFilterMap[requestedType] || requestedType;
      where.type = mappedType;
    }

    const providers = await AiProvider.getEnabledProviders();
    if (providers.length === 0) {
      return res.json({ error: 'No providers found' });
    }

    if (!Config.creditBasedBillingEnabled) {
      return res.json({ error: 'No credit billing enabled' });
    }

    const modelRates = await AiModelRate.findAll({
      where,
      order: [['createdAt', req.query.o === 'asc' ? 'ASC' : 'DESC']],
      ...params,
    });

    modelRates.forEach((rate) => {
      modelStatusQueue.push({
        model: rate.model,
        type: getFormatModelType(rate.type),
        providerId: rate.providerId,
      });
    });

    return res.json({
      message: 'syncing models...',
    });
  } catch (error) {
    logger.error('Failed to get available models:', error);
    return res.status(500).json({ error: formatError(error) });
  }
});

router.post('/bulk-rate-update', user, ensureAdmin, async (req, res) => {
  try {
    const { error, value } = bulkRateUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0]?.message || 'Validation error',
      });
    }

    if (value.mode === 'sync') {
      return await handleSyncMode(req, res, value);
    }

    // ── Existing margin mode ──
    const { profitMargin, creditPrice } = value;

    const modelRates = await AiModelRate.findAll({
      include: [
        {
          model: AiProvider,
          as: 'provider',
          attributes: ['id', 'name', 'displayName'],
        },
      ],
    });

    if (modelRates.length === 0) {
      return res.json({
        message: 'No model rates found to update',
        updated: 0,
        skipped: 0,
        summary: [],
      });
    }

    const validRates = modelRates.filter((rate) => {
      const unitCosts = rate.unitCosts || { input: 0, output: 0 };
      return unitCosts.input > 0 || unitCosts.output > 0;
    });

    const updatePromises = validRates.map((modelRate) => async (): Promise<BulkUpdateSummary | null> => {
      try {
        const unitCosts = modelRate.unitCosts || { input: 0, output: 0 };
        const newInputRate = calculateRate(unitCosts.input, profitMargin, creditPrice);
        const newOutputRate = calculateRate(unitCosts.output, profitMargin, creditPrice);

        const summary: BulkUpdateSummary = {
          id: modelRate.id,
          model: modelRate.model,
          provider: (modelRate as any).provider?.displayName || 'Unknown',
          oldInputRate: modelRate.inputRate,
          newInputRate,
          oldOutputRate: modelRate.outputRate,
          newOutputRate,
        };

        await modelRate.update({
          inputRate: newInputRate,
          outputRate: newOutputRate,
        });

        return summary;
      } catch (updateError) {
        logger.error(`Failed to update model rate ${modelRate.id}:`, updateError);
        return null;
      }
    });

    const results = await pAll(updatePromises, { concurrency: 10 });
    const successfulUpdates = results.filter((result): result is BulkUpdateSummary => result !== null);

    const stats = {
      updated: successfulUpdates.length,
      skipped: modelRates.length - validRates.length + (results.length - successfulUpdates.length),
    };

    return res.json({
      message: `Successfully updated ${stats.updated} model rates`,
      ...stats,
      parameters: { profitMargin, creditPrice },
      summary: successfulUpdates,
    });
  } catch (error) {
    logger.error('Failed to bulk update model rates:', error);
    return res.status(500).json({ error: formatError(error) || 'Failed to bulk update model rates' });
  }
});

/**
 * Sync mode handler for bulk-rate-update.
 * Accepts either pre-formatted `updates[]` (SyncUpdate) or raw `entries[]` (OfficialPricingEntry).
 * Matches to DB models, updates unitCosts, optionally recalculates rates, propagates to tier2.
 */
async function handleSyncMode(req: Request, res: Response, value: any) {
  const { applyRates, profitMargin, creditPrice, dryRun } = value;
  const operatedBy = req.user?.did || 'system';

  // Accept either pre-formatted updates or raw OfficialPricingEntry[]
  let syncUpdates: SyncUpdate[];
  if (value.updates) {
    syncUpdates = value.updates;
  } else if (value.entries) {
    syncUpdates = officialPricingToSyncUpdates(value.entries);
  } else {
    return res.status(400).json({ error: 'sync mode requires either "updates" or "entries" array' });
  }

  const rawDbRates = await AiModelRate.findAll({
    include: [{ model: AiProvider, as: 'provider', attributes: ['id', 'name', 'displayName'] }],
  });

  // Enrich DB rates with providerName for name-based matching.
  // Sync entries use provider names ("openai"), but DB stores FK IDs (snowflake).
  const dbRates = rawDbRates.map((r: any) => {
    r.providerName = r.provider?.name?.toLowerCase() || '';
    return r;
  });

  const updated: any[] = [];
  const unchanged: any[] = [];
  const unmatched: any[] = [];
  const created: CreatedEntry[] = [];
  const errors: any[] = [];
  const tier1Updates = new Map<string, { input: number; output: number }>();

  // Pre-fetch all AiProviders to build name→id map (avoid N+1 queries)
  const allProviders = await AiProvider.findAll();
  const providerNameToId = new Map<string, string>();
  for (const p of allProviders) {
    providerNameToId.set(p.name.toLowerCase(), p.id);
  }

  // DB ENUM: only these types can be created
  const SUPPORTED_TYPES = new Set(['chatCompletion', 'embedding', 'imageGeneration', 'video']);

  for (const update of syncUpdates) {
    const match = matchUpdateToDbRate(dbRates as any[], update.providerId, update.model);

    if (!match) {
      if (update.isNew) {
        // --- Create new model rate ---
        const dbProviderId = providerNameToId.get(update.providerId.toLowerCase());
        if (!dbProviderId) {
          unmatched.push({
            model: update.model,
            provider: update.providerId,
            source: update.source,
            reason: 'provider not configured',
          });
          continue;
        }

        const modelType = update.modelType || 'chatCompletion';
        if (!SUPPORTED_TYPES.has(modelType)) {
          unmatched.push({
            model: update.model,
            provider: update.providerId,
            source: update.source,
            reason: `unsupported type: ${modelType}`,
          });
          continue;
        }

        // Check for duplicates using in-memory data (avoid N+1 DB queries)
        const existing = dbRates.find(
          (r) => r.providerId === dbProviderId && r.model === update.model && r.type === modelType
        );
        if (existing) {
          unchanged.push({ id: existing.id, model: existing.model, provider: update.providerId });
          continue;
        }

        // Calculate rates if applyRates is enabled
        let newInputRate: number | undefined;
        let newOutputRate: number | undefined;
        if (applyRates && profitMargin != null && creditPrice != null) {
          newInputRate = calculateRate(Number(update.unitCosts.input), profitMargin, creditPrice);
          newOutputRate = calculateRate(Number(update.unitCosts.output), profitMargin, creditPrice);
        }

        try {
          const modelDisplay = update.modelDisplay || AiModelRate.getDefaultModelDisplay(update.model);
          const createData: any = {
            providerId: dbProviderId,
            model: update.model,
            modelDisplay,
            type: modelType,
            unitCosts: update.unitCosts,
            inputRate: newInputRate ?? 0,
            outputRate: newOutputRate ?? 0,
          };
          if (update.caching) createData.caching = update.caching;

          if (!dryRun) {
            const record = await AiModelRate.create(createData);
            created.push({
              id: record.id,
              model: update.model,
              provider: update.providerId,
              type: modelType,
              unitCosts: update.unitCosts,
              ...(applyRates ? { rates: { inputRate: newInputRate!, outputRate: newOutputRate! } } : {}),
              ...(update.caching ? { caching: update.caching } : {}),
            });
          } else {
            created.push({
              id: `new-${update.providerId}-${update.model}`,
              model: update.model,
              provider: update.providerId,
              type: modelType,
              unitCosts: update.unitCosts,
              ...(applyRates ? { rates: { inputRate: newInputRate!, outputRate: newOutputRate! } } : {}),
              ...(update.caching ? { caching: update.caching } : {}),
            });
          }
        } catch (err: any) {
          errors.push({ model: update.model, provider: update.providerId, error: `create failed: ${err.message}` });
        }
      } else {
        unmatched.push({ model: update.model, provider: update.providerId, source: update.source });
      }
      continue;
    }

    const providerName = (match as any).providerName || match.providerId;

    const costsChanged = unitCostsChanged(match.unitCosts, update.unitCosts);

    // Check if caching data changed
    const oldCaching = (match as any).caching || {};
    const cachingChanged =
      update.caching &&
      (Math.abs(Number(oldCaching.readRate || 0) - Number(update.caching.readRate || 0)) > 1e-15 ||
        Math.abs(Number(oldCaching.writeRate || 0) - Number(update.caching.writeRate || 0)) > 1e-15);

    // When applyRates is enabled, also check if rates need recalculation
    let ratesNeedUpdate = false;
    let newInputRate: number | undefined;
    let newOutputRate: number | undefined;
    if (applyRates && profitMargin != null && creditPrice != null) {
      newInputRate = calculateRate(Number(update.unitCosts.input), profitMargin, creditPrice);
      newOutputRate = calculateRate(Number(update.unitCosts.output), profitMargin, creditPrice);
      const tolerance = 1e-15;
      ratesNeedUpdate =
        Math.abs(Number(match.inputRate) - newInputRate) > tolerance ||
        Math.abs(Number(match.outputRate) - newOutputRate) > tolerance;
    }

    if (!costsChanged && !ratesNeedUpdate && !cachingChanged) {
      unchanged.push({ id: match.id, model: match.model, provider: providerName });
      continue;
    }

    try {
      const updateData: any = {};
      if (costsChanged) {
        updateData.unitCosts = update.unitCosts;
      }
      if (update.caching) updateData.caching = update.caching;

      // Clear deprecated flag if model reappears in official pricing
      if ((match as any).deprecated) {
        updateData.deprecated = false;
        updateData.deprecatedAt = null;
        updateData.deprecatedReason = null;
      }

      if (applyRates && newInputRate != null && newOutputRate != null) {
        updateData.inputRate = newInputRate;
        updateData.outputRate = newOutputRate;
      }

      const oldUnitCosts = match.unitCosts || null;
      const oldRates = { inputRate: Number(match.inputRate), outputRate: Number(match.outputRate) };

      if (!dryRun) {
        await (match as any).update(updateData, {
          changeType: 'bulk_sync',
          source: update.source || 'official-pricing-catalog',
        });
      }

      updated.push({
        id: match.id,
        model: match.model,
        provider: providerName,
        oldUnitCosts,
        newUnitCosts: update.unitCosts,
        oldRates,
        newRates: applyRates ? { inputRate: newInputRate, outputRate: newOutputRate } : oldRates,
        oldCaching: oldCaching.readRate != null || oldCaching.writeRate != null ? oldCaching : null,
        newCaching: update.caching || null,
      });

      // Track tier1 updates for propagation (keyed by provider NAME, not FK ID)
      tier1Updates.set(`${providerName}:${match.model}`, update.unitCosts);
    } catch (err: any) {
      errors.push({ model: match.model, provider: providerName, error: err.message });
    }
  }

  // Propagate to tier2 providers
  const tier2Updates = propagateToTier2(dbRates as any[], tier1Updates);
  for (const t2 of tier2Updates) {
    // propagateToTier2 returns the original providerId (FK ID) for DB matching
    const match = dbRates.find((r) => r.providerId === t2.providerId && r.model === t2.model);
    if (!match) continue;

    const t2CostsChanged = unitCostsChanged(match.unitCosts, t2.unitCosts);
    let t2RatesNeedUpdate = false;
    let t2NewInputRate: number | undefined;
    let t2NewOutputRate: number | undefined;
    if (applyRates && profitMargin != null && creditPrice != null) {
      t2NewInputRate = calculateRate(Number(t2.unitCosts.input), profitMargin, creditPrice);
      t2NewOutputRate = calculateRate(Number(t2.unitCosts.output), profitMargin, creditPrice);
      const tolerance = 1e-15;
      t2RatesNeedUpdate =
        Math.abs(Number(match.inputRate) - t2NewInputRate) > tolerance ||
        Math.abs(Number(match.outputRate) - t2NewOutputRate) > tolerance;
    }
    if (!t2CostsChanged && !t2RatesNeedUpdate) continue;

    const t2ProviderName = (match as any).providerName || match.providerId;
    try {
      const updateData: any = {};
      if (t2CostsChanged) updateData.unitCosts = t2.unitCosts;
      if (applyRates && t2NewInputRate != null && t2NewOutputRate != null) {
        updateData.inputRate = t2NewInputRate;
        updateData.outputRate = t2NewOutputRate;
      }
      if (!dryRun) {
        await (match as any).update(updateData);
      }
      const oldRates = { inputRate: Number(match.inputRate), outputRate: Number(match.outputRate) };
      const t2OldCaching = (match as any).caching || {};
      updated.push({
        id: match.id,
        model: match.model,
        provider: t2ProviderName,
        oldUnitCosts: match.unitCosts || null,
        newUnitCosts: t2.unitCosts,
        oldRates,
        newRates: applyRates ? { inputRate: t2NewInputRate, outputRate: t2NewOutputRate } : oldRates,
        oldCaching: t2OldCaching.readRate != null || t2OldCaching.writeRate != null ? t2OldCaching : null,
        source: t2.source,
      });
    } catch (err: any) {
      errors.push({ model: match.model, provider: t2ProviderName, error: err.message });
    }
  }

  // Soft-delete: mark tier1 DB models not found in official pricing as deprecated
  const deprecated: any[] = [];
  if (value.deprecateUnmatched) {
    const tier1Providers = new Set(['openai', 'anthropic', 'google', 'xai', 'deepseek', 'doubao']);
    const matchedKeys = new Set<string>();
    for (const u of [...updated, ...unchanged]) {
      matchedKeys.add(`${u.provider}:${u.model}`);
    }

    // Use providerName (not FK ID) for tier classification
    const tier1DbRates = dbRates.filter(
      (r) => tier1Providers.has((r as any).providerName || '') && !r.deprecated && r.type === 'chatCompletion'
    );

    for (const rate of tier1DbRates) {
      const rateName = (rate as any).providerName || rate.providerId;
      if (!matchedKeys.has(`${rateName}:${rate.model}`)) {
        if (!dryRun) {
          try {
            await rate.update({
              deprecated: true,
              deprecatedAt: new Date(),
              deprecatedReason: 'Model not found in official pricing data',
            });
          } catch (err: any) {
            errors.push({ model: rate.model, provider: rateName, error: `deprecate failed: ${err.message}` });
            continue;
          }
        }
        deprecated.push({ id: rate.id, model: rate.model, provider: rateName });
      }
    }
  }

  // Write history records (skip in dryRun)
  if (!dryRun) {
    if (updated.length > 0) {
      try {
        await AiModelRateHistory.create({
          providerId: 'system',
          model: '_bulk_sync',
          type: 'system',
          changeType: 'bulk_update',
          source: 'official-pricing-catalog',
          previousUnitCosts: null,
          currentUnitCosts: null,
          previousRates: null,
          currentRates: null,
          driftPercent: null,
          detectedAt: Math.floor(Date.now() / 1000),
          metadata: {
            operatedBy,
            totalUpdated: updated.length,
            totalUnchanged: unchanged.length,
            totalUnmatched: unmatched.length,
            totalCreated: created.length,
            totalErrors: errors.length,
            totalDeprecated: deprecated.length,
            updates: updated.map((u: any) => ({
              model: u.model,
              provider: u.provider,
              oldInput: u.oldUnitCosts?.input,
              newInput: u.newUnitCosts.input,
              oldOutput: u.oldUnitCosts?.output,
              newOutput: u.newUnitCosts.output,
            })),
          },
        });
      } catch (histErr) {
        logger.error('Failed to create bulk_update history record:', histErr);
      }
    }

    if (created.length > 0) {
      try {
        await AiModelRateHistory.create({
          providerId: 'system',
          model: '_bulk_create',
          type: 'system',
          changeType: 'bulk_create',
          source: 'official-pricing-catalog',
          previousUnitCosts: null,
          currentUnitCosts: null,
          previousRates: null,
          currentRates: null,
          driftPercent: null,
          detectedAt: Math.floor(Date.now() / 1000),
          metadata: {
            operatedBy,
            action: 'create',
            totalCreated: created.length,
            models: created.map((c) => ({ model: c.model, provider: c.provider, type: c.type })),
          },
        });
      } catch (histErr) {
        logger.error('Failed to create bulk_create history record:', histErr);
      }
    }

    if (deprecated.length > 0) {
      try {
        await AiModelRateHistory.create({
          providerId: 'system',
          model: '_bulk_deprecate',
          type: 'system',
          changeType: 'bulk_update',
          source: 'official-pricing-catalog',
          previousUnitCosts: null,
          currentUnitCosts: null,
          previousRates: null,
          currentRates: null,
          driftPercent: null,
          detectedAt: Math.floor(Date.now() / 1000),
          metadata: {
            operatedBy,
            action: 'deprecate',
            totalDeprecated: deprecated.length,
            models: deprecated.map((d: any) => ({ model: d.model, provider: d.provider })),
          },
        });
      } catch (histErr) {
        logger.error('Failed to create deprecation history record:', histErr);
      }
    }
  }

  const result = buildSyncResult({ updated, unchanged, unmatched, created, errors });

  return res.json({
    message: `${dryRun ? '[DRY RUN] ' : ''}Sync completed: ${result.summary.updated} updated, ${result.summary.created} created, ${result.summary.unchanged} unchanged, ${result.summary.unmatched} unmatched, ${deprecated.length} deprecated`,
    dryRun: !!dryRun,
    ...result,
    deprecated,
  });
}

router.get('/health', async (_req, res) => {
  const credentials = (await AiCredential.findAll({
    attributes: ['id', 'name', 'active', 'providerId'],
    include: [
      {
        model: AiProvider,
        as: 'provider',
        attributes: ['id', 'name', 'displayName'],
      },
    ],
  })) as (AiCredential & { provider: AiProvider })[];

  const providers = credentials.reduce<Record<string, Record<string, { running: boolean }>>>((acc, credential) => {
    const providerName = credential.provider.name;
    if (!acc[providerName]) acc[providerName] = {};
    acc[providerName][credential.name] = { running: credential.active };
    return acc;
  }, {});

  res.json({
    providers,
    timestamp: new Date().toISOString(),
  });
});

// ─── Manual Rate Check Trigger (admin only) ─────────────────────────────────
router.post('/trigger-rate-check', user, ensureAdmin, async (_req, res) => {
  const { executeRateCheck } = await import('@api/crons/model-rate-check');
  // Run in background, return immediately
  executeRateCheck().catch((err) => logger.error('Manual rate check failed', { error: err }));
  res.json({ message: 'Rate check triggered', timestamp: new Date().toISOString() });
});

export default router;
