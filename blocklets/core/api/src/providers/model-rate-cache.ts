import { clearAllRotationCache } from '@api/libs/provider-rotation';
import AiModelRate from '@api/store/models/ai-model-rate';
import { LRUCache } from 'lru-cache';

// Cache model rates to avoid repeated DB queries per request
const modelRateCache = new LRUCache<string, AiModelRate[]>({ max: 200, ttl: 10 * 60 * 1000 });

export function clearModelRateCache() {
  modelRateCache.clear();
}

export async function getCachedModelRates(modelName: string, providerId?: string): Promise<AiModelRate[]> {
  const cacheKey = `${modelName}:${providerId || ''}`;
  let cached = modelRateCache.get(cacheKey);
  if (!cached) {
    const where: any = { model: modelName };
    if (providerId) {
      where.providerId = providerId;
    }
    cached = await AiModelRate.findAll({ where });
    if (cached.length > 0) {
      modelRateCache.set(cacheKey, cached);
    }
  }
  return cached;
}

// Register cache invalidation hooks on AiModelRate.
// Hooks live here (not in the model file) to keep the dependency one-way:
//   model-rate-cache → AiModelRate  (no reverse import)
AiModelRate.afterCreate(() => {
  clearModelRateCache();
  clearAllRotationCache();
});

AiModelRate.afterUpdate((instance) => {
  clearModelRateCache();

  // Record manual rate change in history
  try {
    const changed = instance.changed();
    if (changed && (changed.includes('inputRate') || changed.includes('outputRate') || changed.includes('unitCosts'))) {
      // eslint-disable-next-line global-require
      const AiModelRateHistory = require('@api/store/models/ai-model-rate-history').default;
      const previousInputRate = instance.previous('inputRate');
      const previousOutputRate = instance.previous('outputRate');
      const previousUnitCosts = instance.previous('unitCosts');

      AiModelRateHistory.create({
        providerId: instance.providerId,
        model: instance.model,
        type: instance.type as string,
        changeType: 'manual_update',
        source: 'admin',
        previousUnitCosts: previousUnitCosts || null,
        currentUnitCosts: instance.unitCosts || null,
        previousRates: {
          inputRate: Number(previousInputRate ?? 0),
          outputRate: Number(previousOutputRate ?? 0),
        },
        currentRates: {
          inputRate: Number(instance.inputRate),
          outputRate: Number(instance.outputRate),
        },
        driftPercent: null,
        detectedAt: Math.floor(Date.now() / 1000),
        metadata: null,
      }).catch((err: Error) => {
        // Lazy import logger to avoid circular deps
        // eslint-disable-next-line global-require
        const loggerMod = require('@api/libs/logger').default;
        loggerMod.error('Failed to record rate change history', { error: err });
      });
    }
  } catch {
    // Silently ignore errors in history recording — it's non-critical
  }
});

AiModelRate.afterDestroy(() => {
  clearModelRateCache();
  clearAllRotationCache();
});
