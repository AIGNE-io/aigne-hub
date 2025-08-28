import { checkModelStatus } from '@api/libs/ai-provider';
import logger from '@api/libs/logger';
import AiCredential from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiModelStatus from '@api/store/models/ai-model-status';
import AiProvider from '@api/store/models/ai-provider';

export interface ModelStatusResult {
  providerId: string;
  providerName: string;
  model: string;
  available: boolean;
  error?: string;
  responseTime?: number;
  lastChecked: Date;
}

export interface ModelStatusSummary {
  total: number;
  available: number;
  unavailable: number;
  averageResponseTime?: number;
}

/**
 * 检查单个模型状态
 */
export async function checkSingleModelStatus(providerId: string, model: string): Promise<ModelStatusResult | null> {
  try {
    const provider = await AiProvider.findOne({
      where: { id: providerId, enabled: true },
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
      return {
        providerId,
        providerName: provider?.name || 'unknown',
        model,
        available: false,
        error: 'No active credentials found',
        lastChecked: new Date(),
      };
    }

    const status = await checkModelStatus(provider, model);

    return {
      providerId,
      providerName: provider.name,
      model,
      available: status.available,
      error: status.error,
      responseTime: status.responseTime,
      lastChecked: new Date(),
    };
  } catch (error) {
    logger.error(`Error checking model status for ${providerId}/${model}:`, error);
    return {
      providerId,
      providerName: 'unknown',
      model,
      available: false,
      error: error.message,
      lastChecked: new Date(),
    };
  }
}

/**
 * 获取模型状态（优先从缓存获取，必要时重新检查）
 */
export async function getModelStatusWithCache(
  providerId: string,
  model: string,
  trustWindowMs: number = 3600000 // 1小时
): Promise<ModelStatusResult | null> {
  try {
    // 首先尝试从缓存获取
    const cachedStatus = await AiModelStatus.getModelStatus(providerId, model, trustWindowMs);

    if (cachedStatus) {
      return {
        providerId: cachedStatus.providerId,
        providerName: 'unknown', // 可以从 provider 关联获取
        model: cachedStatus.model,
        available: cachedStatus.available,
        error: cachedStatus.error,
        responseTime: cachedStatus.responseTime,
        lastChecked: cachedStatus.lastChecked,
      };
    }

    // 缓存不存在或已过期，重新检查
    const freshStatus = await checkSingleModelStatus(providerId, model);

    if (freshStatus) {
      // 更新缓存
      await AiModelStatus.updateModelStatus(
        providerId,
        model,
        freshStatus.available,
        freshStatus.error,
        freshStatus.responseTime
      );
    }

    return freshStatus;
  } catch (error) {
    logger.error(`Error getting model status with cache for ${providerId}/${model}:`, error);
    return null;
  }
}

/**
 * 检查提供商的所有模型状态
 */
export async function checkProviderModelStatus(providerId: string): Promise<ModelStatusResult[]> {
  try {
    const modelRates = await AiModelRate.findAll({
      where: { providerId },
    });

    const results: ModelStatusResult[] = [];

    for (const modelRate of modelRates) {
      const result = await checkSingleModelStatus(providerId, modelRate.model);
      if (result) {
        results.push(result);
      }
    }

    return results;
  } catch (error) {
    logger.error(`Error checking provider model status for ${providerId}:`, error);
    return [];
  }
}

/**
 * 检查所有模型状态
 */
export async function checkAllModelStatus(): Promise<{
  results: ModelStatusResult[];
  summary: ModelStatusSummary;
}> {
  try {
    const modelRates = await AiModelRate.findAll({
      include: [
        {
          model: AiProvider,
          as: 'provider',
          where: { enabled: true },
        },
      ],
    });

    const results: ModelStatusResult[] = [];

    for (const modelRate of modelRates) {
      const result = await checkSingleModelStatus(modelRate.providerId, modelRate.model);
      if (result) {
        results.push(result);
      }
    }

    const availableResults = results.filter((r) => r.available);
    const averageResponseTime =
      availableResults.length > 0
        ? availableResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) / availableResults.length
        : undefined;

    const summary: ModelStatusSummary = {
      total: results.length,
      available: availableResults.length,
      unavailable: results.filter((r) => !r.available).length,
      averageResponseTime,
    };

    return { results, summary };
  } catch (error) {
    logger.error('Error checking all model status:', error);
    return {
      results: [],
      summary: {
        total: 0,
        available: 0,
        unavailable: 0,
      },
    };
  }
}

/**
 * 检查特定模型在所有提供商中的状态
 */
export async function checkModelAcrossProviders(modelName: string): Promise<ModelStatusResult[]> {
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

    const results: ModelStatusResult[] = [];

    for (const provider of providers) {
      if ((provider as any).credentials && (provider as any).credentials.length > 0) {
        const result = await checkSingleModelStatus(provider.id, modelName);
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  } catch (error) {
    logger.error(`Error checking model ${modelName} across providers:`, error);
    return [];
  }
}

/**
 * 批量更新模型状态到数据库
 */
export async function updateModelStatusInDatabase(results: ModelStatusResult[]): Promise<void> {
  try {
    const statusUpdates = results.map((result) => ({
      providerId: result.providerId,
      model: result.model,
      available: result.available,
      error: result.error,
      responseTime: result.responseTime,
    }));

    await AiModelStatus.batchUpdateModelStatus(statusUpdates);
    logger.info(`Updated ${results.length} model status records`);
  } catch (error) {
    logger.error('Error updating model status in database:', error);
  }
}

/**
 * 定时任务：检查所有模型状态并更新数据库
 */
export async function scheduledModelStatusCheck(): Promise<void> {
  try {
    logger.info('Starting scheduled model status check...');
    const { results, summary } = await checkAllModelStatus();

    // 更新数据库中的模型状态
    await updateModelStatusInDatabase(results);

    logger.info('Scheduled model status check completed:', summary);
  } catch (error) {
    logger.error('Error in scheduled model status check:', error);
  }
}

/**
 * 获取模型状态统计
 */
export async function getModelStatusStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  healthy: number;
  unhealthy: number;
}> {
  try {
    const total = await AiModelRate.count();

    // 检查所有模型的健康状态
    const allModels = await AiModelRate.findAll({
      include: [
        {
          model: AiProvider,
          as: 'provider',
          where: { enabled: true },
        },
      ],
    });

    let healthy = 0;
    let unhealthy = 0;

    for (const model of allModels) {
      const status = await checkSingleModelStatus(model.providerId, model.model);
      if (status?.available) {
        healthy++;
      } else {
        unhealthy++;
      }
    }

    return {
      total,
      active: total, // 所有模型费率都是活跃的
      inactive: 0, // 没有不活跃的模型费率
      healthy,
      unhealthy,
    };
  } catch (error) {
    logger.error('Error getting model status stats:', error);
    return {
      total: 0,
      active: 0,
      inactive: 0,
      healthy: 0,
      unhealthy: 0,
    };
  }
}
