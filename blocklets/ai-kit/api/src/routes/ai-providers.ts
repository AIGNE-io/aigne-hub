import logger from '@api/libs/logger';
import AiCredential, { CredentialValue } from '@api/store/models/ai-credential';
import AiProvider from '@api/store/models/ai-provider';
import { Router } from 'express';
import Joi from 'joi';
import { pick } from 'lodash';
import { Op } from 'sequelize';

const router = Router();

// 验证schemas
const createProviderSchema = Joi.object({
  name: Joi.string()
    .valid('openai', 'anthropic', 'bedrock', 'deepseek', 'google', 'ollama', 'openRouter', 'xai')
    .required(),
  displayName: Joi.string().min(1).max(100).required(),
  baseUrl: Joi.string().uri().optional(),
  region: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().max(50).required(),
    otherwise: Joi.string().max(50).allow('').optional(),
  }),
  enabled: Joi.boolean().default(true),
  config: Joi.object().optional(),
});

const updateProviderSchema = Joi.object({
  name: Joi.string().valid('openai', 'anthropic', 'bedrock', 'deepseek', 'google', 'ollama', 'openRouter', 'xai'),
  baseUrl: Joi.string().uri().optional(),
  region: Joi.when('name', {
    is: 'bedrock',
    then: Joi.string().max(50).required(),
    otherwise: Joi.string().max(50).allow('').optional(),
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

// get providers
router.get('/', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.name) {
      where.name = req.query.name;
    }
    const providers = await AiProvider.findAll({
      where,
      order: [['createdAt', 'ASC']],
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
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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
router.post('/:providerId/credentials', async (req, res) => {
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
      providerId: req.params.providerId,
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
router.put('/:providerId/credentials/:credentialId', async (req, res) => {
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
router.delete('/:providerId/credentials/:credentialId', async (req, res) => {
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

export default router;
