import { CallType } from './types';

export function generateCacheKey(userDid: string, date: string): string {
  return `daily_call_stats:${userDid}:${date}`;
}

export function parseCacheKey(cacheKey: string): { userDid: string; date: string } | null {
  const parts = cacheKey.split(':');

  if (parts.length !== 3 || parts[0] !== 'daily_call_stats') {
    return null;
  }

  return {
    userDid: parts[1]!,
    date: parts[2]!,
  };
}

export function isValidCacheKey(cacheKey: string): boolean {
  return parseCacheKey(cacheKey) !== null;
}

export function generateModelKey(providerId: string, model: string, type: CallType): string {
  return `${providerId}:${model}:${type}`;
}

export function parseModelKey(modelKey: string): { providerId: string; model: string; type: CallType } | null {
  const parts = modelKey.split(':');

  if (parts.length !== 3) {
    return null;
  }

  return {
    providerId: parts[0]!,
    model: parts[1]!,
    type: parts[2] as CallType,
  };
}
