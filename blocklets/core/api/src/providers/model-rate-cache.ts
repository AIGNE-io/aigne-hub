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

AiModelRate.afterUpdate(() => {
  clearModelRateCache();
});

AiModelRate.afterDestroy(() => {
  clearModelRateCache();
  clearAllRotationCache();
});
