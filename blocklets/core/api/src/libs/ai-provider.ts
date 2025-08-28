import { getModelStatusWithCache } from '@api/libs/model-status';
import { getProviderCredentials } from '@api/providers/models';
import AiCredential from '@api/store/models/ai-credential';
import { ModelError, ModelErrorType } from '@api/store/models/ai-model-status';
import AiProvider from '@api/store/models/ai-provider';
import { SubscriptionError, SubscriptionErrorType } from '@blocklet/aigne-hub/api';
import { CustomError } from '@blocklet/error';
import { NextFunction, Request, Response } from 'express';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { OpenAI } from 'openai';

import { Config } from './env';
import logger from './logger';
import { SUPPORTED_PROVIDERS } from './model-registry';

// 错误分类工具函数
export function classifyError(error: any): ModelError {
  const errorMessage = error.message || error.toString();
  const errorCode = error.code || error.status || error.statusCode;

  // HTTP 状态码分类
  if (errorCode) {
    switch (errorCode) {
      case 401:
        return {
          type: ModelErrorType.INVALID_API_KEY,
          message: errorMessage,
          code: errorCode.toString(),
          retryable: false,
        };
      case 403:
        return {
          type: ModelErrorType.EXPIRED_CREDENTIAL,
          message: errorMessage,
          code: errorCode.toString(),
          retryable: false,
        };
      case 404:
        return {
          type: ModelErrorType.MODEL_NOT_FOUND,
          message: errorMessage,
          code: errorCode.toString(),
          retryable: false,
        };
      case 429:
        return {
          type: ModelErrorType.RATE_LIMIT_EXCEEDED,
          message: errorMessage,
          code: errorCode.toString(),
          retryable: true,
          retryAfter: 60, // 1分钟后重试
        };
      case 500:
      case 502:
      case 503:
        return {
          type: ModelErrorType.MODEL_UNAVAILABLE,
          message: errorMessage,
          code: errorCode.toString(),
          retryable: true,
          retryAfter: 30, // 30秒后重试
        };
      default:
        // 其他 HTTP 状态码
        return {
          type: ModelErrorType.UNKNOWN_ERROR,
          message: errorMessage,
          code: errorCode.toString(),
          retryable: errorCode >= 500, // 5xx 错误可重试
          retryAfter: errorCode >= 500 ? 30 : undefined,
        };
    }
  }

  // 错误消息关键词分类
  const message = errorMessage.toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      type: ModelErrorType.NETWORK_TIMEOUT,
      message: errorMessage,
      retryable: true,
      retryAfter: 10,
    };
  }

  if (message.includes('quota') || message.includes('billing') || message.includes('credit')) {
    return {
      type: ModelErrorType.QUOTA_EXCEEDED,
      message: errorMessage,
      retryable: false,
    };
  }

  if (message.includes('network') || message.includes('connection') || message.includes('dns')) {
    return {
      type: ModelErrorType.CONNECTION_ERROR,
      message: errorMessage,
      retryable: true,
      retryAfter: 15,
    };
  }

  if (message.includes('no active credentials') || message.includes('no credentials')) {
    return {
      type: ModelErrorType.NO_CREDENTIALS,
      message: errorMessage,
      retryable: false,
    };
  }

  if (message.includes('model not found') || message.includes('model does not exist')) {
    return {
      type: ModelErrorType.MODEL_NOT_FOUND,
      message: errorMessage,
      retryable: false,
    };
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return {
      type: ModelErrorType.RATE_LIMIT_EXCEEDED,
      message: errorMessage,
      retryable: true,
      retryAfter: 60,
    };
  }

  // 默认分类
  return {
    type: ModelErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    retryable: true,
    retryAfter: 30,
  };
}

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
    throw new CustomError(400, 'Model is required');
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

// 检查模型状态的函数
export async function checkModelStatus(
  provider: any,
  modelName: string,
  modelType?: 'chatCompletion' | 'imageGeneration' | 'embedding'
): Promise<{
  available: boolean;
  error?: ModelError;
  responseTime?: number;
}> {
  try {
    const startTime = Date.now();

    // 根据模型类型选择测试方法
    if (modelType === 'imageGeneration') {
      return await testImageModel(provider, modelName);
    }
    if (modelType === 'embedding') {
      return await testEmbeddingModel(provider, modelName);
    }
    // 默认使用聊天模型测试
    const testModel = getTestModelForProvider(provider.name);
    if (!testModel) {
      return {
        available: false,
        error: {
          type: ModelErrorType.MODEL_NOT_FOUND,
          message: 'No test model available for this provider',
          retryable: false,
        },
      };
    }

    // 构建测试请求
    const testRequest = {
      model: testModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 3,
    };

    // 获取凭证
    const credentials = await provider.getCredentials();
    if (!credentials || credentials.length === 0) {
      return {
        available: false,
        error: {
          type: ModelErrorType.NO_CREDENTIALS,
          message: 'No active credentials found',
          retryable: false,
        },
      };
    }

    // 尝试每个凭证
    for (const credential of credentials) {
      try {
        await makeTestRequest(provider, credential, testRequest);
        const responseTime = Date.now() - startTime;

        return {
          available: true,
          responseTime,
        };
      } catch (error) {
        logger.warn(`Credential test failed for ${provider.name}:`, error);
        // 继续尝试下一个凭证
      }
    }

    return {
      available: false,
      error: {
        type: ModelErrorType.UNKNOWN_ERROR,
        message: 'All credentials failed',
        retryable: true,
        retryAfter: 30,
      },
    };
  } catch (error) {
    logger.error(`Model status check failed for ${provider.name}/${modelName}:`, error);
    return {
      available: false,
      error: classifyError(error),
    };
  }
}

// 测试凭证的函数
export async function testCredential(credential: any): Promise<{
  available: boolean;
  error?: ModelError;
  responseTime?: number;
}> {
  try {
    const startTime = Date.now();

    const { provider } = credential;
    const testModel = getTestModelForProvider(provider.name);

    if (!testModel) {
      return {
        available: false,
        error: {
          type: ModelErrorType.MODEL_NOT_FOUND,
          message: 'No test model available for this provider',
          retryable: false,
        },
      };
    }

    const testRequest = {
      model: testModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 3,
    };

    await makeTestRequest(provider, credential, testRequest);
    const responseTime = Date.now() - startTime;

    return {
      available: true,
      responseTime,
    };
  } catch (error) {
    logger.error(`Credential test failed for ${credential.provider.name}:`, error);
    return {
      available: false,
      error: classifyError(error),
    };
  }
}

// 测试图像模型
export async function testImageModel(
  provider: any,
  modelName: string
): Promise<{
  available: boolean;
  error?: ModelError;
  responseTime?: number;
}> {
  try {
    const startTime = Date.now();
    const testModel = getTestImageModelForProvider(provider.name);

    if (!testModel) {
      return {
        available: false,
        error: {
          type: ModelErrorType.MODEL_NOT_FOUND,
          message: 'No test image model available for this provider',
          retryable: false,
        },
      };
    }

    // 图像生成测试 - 最简单的提示
    const testRequest = {
      model: testModel,
      prompt: 'red dot',
      n: 1,
      size: '256x256', // 最小的图像尺寸
    };

    const credentials = await provider.getCredentials();
    if (!credentials || credentials.length === 0) {
      return {
        available: false,
        error: {
          type: ModelErrorType.NO_CREDENTIALS,
          message: 'No active credentials found',
          retryable: false,
        },
      };
    }

    for (const credential of credentials) {
      try {
        await makeImageTestRequest(provider, credential, testRequest);
        const responseTime = Date.now() - startTime;
        return {
          available: true,
          responseTime,
        };
      } catch (error) {
        logger.warn(`Image model test failed for ${provider.name}:`, error);
        // 继续尝试下一个凭证
      }
    }

    return {
      available: false,
      error: {
        type: ModelErrorType.UNKNOWN_ERROR,
        message: 'All credentials failed for image generation',
        retryable: true,
        retryAfter: 30,
      },
    };
  } catch (error) {
    logger.error(`Image model test failed for ${provider.name}/${modelName}:`, error);
    return {
      available: false,
      error: classifyError(error),
    };
  }
}

// 测试 embedding 模型
export async function testEmbeddingModel(
  provider: any,
  modelName: string
): Promise<{
  available: boolean;
  error?: ModelError;
  responseTime?: number;
}> {
  try {
    const startTime = Date.now();
    const testModel = getTestEmbeddingModelForProvider(provider.name);

    if (!testModel) {
      return {
        available: false,
        error: {
          type: ModelErrorType.MODEL_NOT_FOUND,
          message: 'No test embedding model available for this provider',
          retryable: false,
        },
      };
    }

    // Embedding 测试 - 最简单的文本
    const testRequest = {
      model: testModel,
      input: 'test',
    };

    const credentials = await provider.getCredentials();
    if (!credentials || credentials.length === 0) {
      return {
        available: false,
        error: {
          type: ModelErrorType.NO_CREDENTIALS,
          message: 'No active credentials found',
          retryable: false,
        },
      };
    }

    for (const credential of credentials) {
      try {
        await makeEmbeddingTestRequest(provider, credential, testRequest);
        const responseTime = Date.now() - startTime;
        return {
          available: true,
          responseTime,
        };
      } catch (error) {
        logger.warn(`Embedding model test failed for ${provider.name}:`, error);
        // 继续尝试下一个凭证
      }
    }

    return {
      available: false,
      error: {
        type: ModelErrorType.UNKNOWN_ERROR,
        message: 'All credentials failed for embedding',
        retryable: true,
        retryAfter: 30,
      },
    };
  } catch (error) {
    logger.error(`Embedding model test failed for ${provider.name}/${modelName}:`, error);
    return {
      available: false,
      error: classifyError(error),
    };
  }
}

// 获取提供商的测试模型
function getTestModelForProvider(providerName: string): string | null {
  const testModels: Record<string, string> = {
    openai: 'gpt-3.5-turbo',
    anthropic: 'claude-3-haiku-20240307',
    google: 'gemini-1.5-flash',
    gemini: 'gemini-1.5-flash',
    deepseek: 'deepseek-chat',
    openrouter: 'openai/gpt-3.5-turbo',
    xai: 'grok-beta',
    bedrock: 'anthropic.claude-3-haiku-20240307-v1:0',
    ollama: 'llama2',
  };

  return testModels[providerName] || null;
}

// 获取图像模型的测试模型
function getTestImageModelForProvider(providerName: string): string | null {
  const testImageModels: Record<string, string> = {
    openai: 'dall-e-2',
    google: 'gemini-1.5-flash', // Gemini 支持图像生成
    gemini: 'gemini-1.5-flash',
    // 其他提供商可能没有图像模型
  };

  return testImageModels[providerName] || null;
}

// 获取 embedding 模型的测试模型
function getTestEmbeddingModelForProvider(providerName: string): string | null {
  const testEmbeddingModels: Record<string, string> = {
    openai: 'text-embedding-ada-002',
    google: 'embedding-001',
    gemini: 'embedding-001',
    anthropic: 'text-embedding-v1',
    deepseek: 'deepseek-embedding',
    // 其他提供商可能没有 embedding 模型
  };

  return testEmbeddingModels[providerName] || null;
}

// 发送测试请求
async function makeTestRequest(provider: any, credential: any, testRequest: any): Promise<any> {
  const { name: providerName, baseUrl } = provider;
  const credentialValue = credential.getDecryptedValue();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 根据提供商设置认证头
  switch (providerName) {
    case 'openai':
    case 'openrouter':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'anthropic':
      headers['x-api-key'] = credentialValue.api_key;
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'google':
    case 'gemini':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'deepseek':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'xai':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'bedrock':
      // AWS Bedrock 需要特殊的认证处理
      break;
    case 'ollama':
      // Ollama 通常不需要认证
      break;
    default:
      // 默认使用 Bearer token
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
  }

  const url = baseUrl || getDefaultApiUrl(providerName);
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(testRequest),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// 发送图像测试请求
async function makeImageTestRequest(provider: any, credential: any, testRequest: any): Promise<any> {
  const { name: providerName, baseUrl } = provider;
  const credentialValue = credential.getDecryptedValue();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 根据提供商设置认证头
  switch (providerName) {
    case 'openai':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'google':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'gemini':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    default:
      // 默认使用 Bearer token
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
  }

  const url = baseUrl || getDefaultApiUrl(providerName);
  const response = await fetch(`${url}/v1/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(testRequest),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// 发送 embedding 测试请求
async function makeEmbeddingTestRequest(provider: any, credential: any, testRequest: any): Promise<any> {
  const { name: providerName, baseUrl } = provider;
  const credentialValue = credential.getDecryptedValue();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 根据提供商设置认证头
  switch (providerName) {
    case 'openai':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'google':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    case 'gemini':
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
    default:
      // 默认使用 Bearer token
      headers.Authorization = `Bearer ${credentialValue.api_key}`;
      break;
  }

  const url = baseUrl || getDefaultApiUrl(providerName);
  const response = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(testRequest),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// 获取默认 API URL
function getDefaultApiUrl(providerName: string): string {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com',
    anthropic: 'https://api.anthropic.com',
    google: 'https://generativelanguage.googleapis.com',
    gemini: 'https://generativelanguage.googleapis.com',
    deepseek: 'https://api.deepseek.com',
    openrouter: 'https://openrouter.ai/api',
    xai: 'https://api.x.ai',
    ollama: 'http://localhost:11434',
  };

  return urls[providerName] || 'https://api.openai.com';
}

// 模型可用性检查和 fallback 中间件
export async function ensureModalAvailable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { model } = req.body;
    if (!model) {
      next();
      return;
    }

    // 解析模型名称
    const { providerName, modelName } = getModelNameWithProvider(model);

    // 如果只提供了模型名（如 gpt-4o），需要找到可用的提供商
    if (!providerName) {
      const availableProvider = await findAvailableProviderForModel(modelName);
      if (availableProvider) {
        req.body.model = `${availableProvider.name}/${modelName}`;
        logger.info(`Auto-assigned provider for model ${modelName}: ${availableProvider.name}`);
      }
    } else {
      // 检查指定提供商的模型是否可用
      const isAvailable = await checkSpecificModelAvailability(providerName, modelName);
      if (!isAvailable) {
        // 尝试 fallback 到其他提供商
        const fallbackProvider = await findFallbackProviderForModel(modelName, providerName);
        if (fallbackProvider) {
          req.body.model = `${fallbackProvider.name}/${modelName}`;
          logger.info(`Fallback from ${providerName}/${modelName} to ${fallbackProvider.name}/${modelName}`);
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Model availability middleware error:', error);
    next(); // 继续处理，不阻塞请求
  }
}

// 查找模型的可用于提供商
async function findAvailableProviderForModel(modelName: string): Promise<any> {
  try {
    const providers = await AiProvider.findAll({
      where: { enabled: true },
      include: [
        {
          model: AiCredential,
          as: 'credentials',
          where: { active: true },
          required: false,
        },
      ],
    });

    // 按优先级排序提供商
    const providerPriority = ['openai', 'openrouter', 'anthropic', 'google', 'deepseek', 'xai'];

    for (const priorityProvider of providerPriority) {
      const provider = providers.find(
        (p: any) => p.name === priorityProvider && p.credentials && p.credentials.length > 0
      );
      if (provider) {
        const isAvailable = await checkSpecificModelAvailability(provider.name, modelName);
        if (isAvailable) {
          return provider;
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Error finding available provider for model:', error);
    return null;
  }
}

// 检查特定模型的可用性（使用缓存策略）
async function checkSpecificModelAvailability(providerName: string, modelName: string): Promise<boolean> {
  try {
    const provider = await AiProvider.findOne({
      where: { name: providerName, enabled: true },
      include: [
        {
          model: AiCredential,
          as: 'credentials',
          where: { active: true },
          required: false,
        },
      ],
    });

    if (!provider || !(provider as any).credentials || (provider as any).credentials.length === 0) {
      return false;
    }

    // 使用缓存策略检查模型状态
    const status = await getModelStatusWithCache(provider.id, modelName);
    return status?.available || false;
  } catch (error) {
    logger.error(`Error checking model availability for ${providerName}/${modelName}:`, error);
    return false;
  }
}

// 查找 fallback 提供商
async function findFallbackProviderForModel(modelName: string, excludeProvider: string): Promise<any> {
  try {
    const providers = await AiProvider.findAll({
      where: { enabled: true },
      include: [
        {
          model: AiCredential,
          as: 'credentials',
          where: { active: true },
          required: false,
        },
      ],
    });

    // 按优先级排序，排除当前提供商
    const providerPriority = ['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'xai'];

    for (const priorityProvider of providerPriority) {
      if (priorityProvider === excludeProvider) {
        // 跳过当前提供商
      } else {
        const provider = providers.find(
          (p: any) => p.name === priorityProvider && p.credentials && p.credentials.length > 0
        );
        if (provider) {
          const isAvailable = await checkSpecificModelAvailability(provider.name, modelName);
          if (isAvailable) {
            return provider;
          }
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Error finding fallback provider for model:', error);
    return null;
  }
}
