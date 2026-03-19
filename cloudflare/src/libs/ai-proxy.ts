import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { aiCredentials, aiModelRates, aiProviders, modelCalls, usages } from '../db/schema';
import * as schema from '../db/schema';

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

export interface ResolvedProvider {
  providerId: string;
  providerName: string;
  modelName: string;
  credentialId: string;
  apiKey: string;
  baseUrl: string;
}

/**
 * Resolve provider + credential for a given model name.
 * Model format: "provider/model" or just "model" (picks first available provider).
 */
export async function resolveProvider(db: DB, model: string): Promise<ResolvedProvider | null> {
  // Try to parse provider/model format
  const parts = model.split('/');
  let providerName: string | undefined;
  let modelName: string;

  if (parts.length >= 2) {
    [providerName] = parts;
    modelName = parts.slice(1).join('/');
  } else {
    modelName = model;
  }

  // Find matching rate
  const rateConditions = providerName
    ? and(eq(aiModelRates.model, modelName), eq(aiModelRates.deprecated, false))
    : and(eq(aiModelRates.model, modelName), eq(aiModelRates.deprecated, false));

  const rates = await db
    .select({ rate: aiModelRates, provider: aiProviders })
    .from(aiModelRates)
    .innerJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
    .where(and(rateConditions, eq(aiProviders.enabled, true)));

  // Filter by provider name if specified
  const matchingRates = providerName ? rates.filter((r) => r.provider.name === providerName) : rates;

  if (matchingRates.length === 0) return null;

  const selected = matchingRates[0];

  // Get active credential for this provider (weighted random)
  const creds = await db
    .select()
    .from(aiCredentials)
    .where(and(eq(aiCredentials.providerId, selected.provider.id), eq(aiCredentials.active, true)));

  if (creds.length === 0) return null;

  // Simple weighted selection
  const totalWeight = creds.reduce((sum, c) => sum + c.weight, 0);
  let rand = Math.random() * totalWeight;
  let selectedCred = creds[0];
  for (const cred of creds) {
    rand -= cred.weight;
    if (rand <= 0) {
      selectedCred = cred;
      break;
    }
  }

  // Decrypt credential (TODO: proper encryption)
  let apiKey = '';
  try {
    const credValue =
      typeof selectedCred.credentialValue === 'string'
        ? JSON.parse(selectedCred.credentialValue)
        : selectedCred.credentialValue;
    apiKey = (credValue as { api_key?: string }).api_key || '';
  } catch {
    apiKey = String(selectedCred.credentialValue);
  }

  return {
    providerId: selected.provider.id,
    providerName: selected.provider.name,
    modelName,
    credentialId: selectedCred.id,
    apiKey,
    baseUrl: selected.provider.baseUrl || getDefaultBaseUrl(selected.provider.name),
  };
}

function getDefaultBaseUrl(providerName: string): string {
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    deepseek: 'https://api.deepseek.com/v1',
    xai: 'https://api.x.ai/v1',
  };
  return defaults[providerName] || 'https://api.openai.com/v1';
}

/**
 * Build provider-specific request headers.
 */
export function buildProviderHeaders(provider: ResolvedProvider): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider.providerName === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

/**
 * Build the upstream API URL for a given call type.
 */
export function buildUpstreamUrl(provider: ResolvedProvider, callType: string): string {
  const { baseUrl } = provider;

  if (provider.providerName === 'anthropic') {
    if (callType === 'chat') return `${baseUrl}/messages`;
    return `${baseUrl}/messages`;
  }

  switch (callType) {
    case 'chat':
      return `${baseUrl}/chat/completions`;
    case 'embedding':
      return `${baseUrl}/embeddings`;
    case 'image':
      return `${baseUrl}/images/generations`;
    default:
      return `${baseUrl}/chat/completions`;
  }
}

/**
 * Record a model call in D1 (fire-and-forget pattern).
 */
export async function recordModelCall(
  db: DB,
  data: {
    providerId: string;
    model: string;
    credentialId: string;
    type: string;
    status: 'success' | 'failed';
    totalUsage: number;
    usageMetrics?: unknown;
    credits: string;
    duration: string;
    errorReason?: string;
    userDid?: string;
    appDid?: string;
    requestId?: string;
    callTime: number;
    ttfb?: string;
    providerTtfb?: string;
    metadata?: unknown;
    traceId?: string;
  }
) {
  try {
    await db.insert(modelCalls).values({
      ...data,
      type: data.type as 'chatCompletion' | 'embedding' | 'imageGeneration' | 'video',
      usageMetrics: data.usageMetrics ? JSON.stringify(data.usageMetrics) : null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    });
  } catch (err) {
    // Fire-and-forget: log but don't throw
    console.error('Failed to record model call:', err);
  }
}

/**
 * Calculate credits from usage metrics and model rate.
 */
export async function calculateCredits(
  db: DB,
  providerId: string,
  modelName: string,
  metrics: {
    promptTokens?: number;
    completionTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    numberOfImageGeneration?: number;
  }
): Promise<{ credits: number; rate: typeof aiModelRates.$inferSelect | null }> {
  const [rate] = await db
    .select()
    .from(aiModelRates)
    .where(and(eq(aiModelRates.providerId, providerId), eq(aiModelRates.model, modelName)))
    .limit(1);

  if (!rate) return { credits: 0, rate: null };

  const inputRate = parseFloat(rate.inputRate);
  const outputRate = parseFloat(rate.outputRate);

  let credits = 0;
  credits += (metrics.promptTokens || 0) * inputRate;
  credits += (metrics.completionTokens || 0) * outputRate;

  // Cache pricing
  if (rate.caching) {
    const caching = typeof rate.caching === 'string' ? JSON.parse(rate.caching) : rate.caching;
    if (metrics.cacheCreationInputTokens) {
      credits += metrics.cacheCreationInputTokens * ((caching as { writeRate?: number }).writeRate || inputRate);
    }
    if (metrics.cacheReadInputTokens) {
      credits += metrics.cacheReadInputTokens * ((caching as { readRate?: number }).readRate || inputRate);
    }
  }

  // Image pricing
  if (metrics.numberOfImageGeneration) {
    credits = metrics.numberOfImageGeneration * outputRate;
  }

  return { credits, rate };
}

/**
 * Record usage in the legacy Usages table.
 */
export async function recordUsage(
  db: DB,
  data: {
    promptTokens: number;
    completionTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    numberOfImageGeneration?: number;
    type?: string;
    model?: string;
    userDid?: string;
    appId?: string;
    usedCredits?: string;
  }
) {
  try {
    await db.insert(usages).values(data);
  } catch (err) {
    console.error('Failed to record usage:', err);
  }
}
