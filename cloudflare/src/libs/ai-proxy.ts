import { and, eq, like } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { aiCredentials, aiModelRates, aiProviders, modelCalls, usages } from '../db/schema';
import * as schema from '../db/schema';
import { buildGatewayUrl, type GatewayConfig } from './ai-gateway';
import { decryptCredential, isEncrypted } from './crypto';
import { logger } from './logger';
import { enqueueFailedWrite } from './retry-queue';

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

export interface ResolvedProvider {
  providerId: string;
  providerName: string;
  modelName: string;
  credentialId: string;
  apiKey: string;
  baseUrl: string;
  apiFormat: string; // 'openai' | 'anthropic' | 'gemini' | 'bedrock'
  providerType: string; // 'builtin' | 'custom'
  gatewaySlug?: string | null;
  providerConfig?: Record<string, unknown> | string | null;
  modelMetadata?: Record<string, unknown> | string | null;
}

/**
 * Resolve provider + credential for a given model name.
 * Model format: "provider/model" or just "model" (picks first available provider).
 */
export async function resolveProvider(db: DB, model: string, encryptionKey?: string): Promise<ResolvedProvider | null> {
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

  // Find matching rate (exact match first)
  const baseCondition = eq(aiModelRates.deprecated, false);

  let rates = await db
    .select({ rate: aiModelRates, provider: aiProviders })
    .from(aiModelRates)
    .innerJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
    .where(and(eq(aiModelRates.model, modelName), baseCondition, eq(aiProviders.enabled, true)));

  // Filter by provider name if specified
  let matchingRates = providerName ? rates.filter((r) => r.provider.name === providerName) : rates;

  // Fallback: if no exact match, try suffix match for vendor-prefixed models (e.g. "gpt-4o" → "openai/gpt-4o")
  if (matchingRates.length === 0 && !modelName.includes('/')) {
    const suffixPattern = `%/${modelName}`;
    const fallbackRates = await db
      .select({ rate: aiModelRates, provider: aiProviders })
      .from(aiModelRates)
      .innerJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
      .where(and(like(aiModelRates.model, suffixPattern), baseCondition, eq(aiProviders.enabled, true)));

    matchingRates = providerName ? fallbackRates.filter((r) => r.provider.name === providerName) : fallbackRates;
  }

  if (matchingRates.length === 0) return null;

  // Prefer builtin providers when no explicit provider name given (avoid custom shadowing builtin models)
  const sorted = providerName
    ? matchingRates
    : [...matchingRates].sort((a, b) => {
        const aBuiltin = (a.provider.providerType || 'builtin') === 'builtin' ? 0 : 1;
        const bBuiltin = (b.provider.providerType || 'builtin') === 'builtin' ? 0 : 1;
        return aBuiltin - bBuiltin;
      });

  const selected = sorted[0];

  // Get active credential for this provider (weighted random)
  const creds = await db
    .select()
    .from(aiCredentials)
    .where(and(eq(aiCredentials.providerId, selected.provider.id), eq(aiCredentials.active, true)));

  // No credentials — still return provider info (Gateway compat mode may not need credentials)
  if (creds.length === 0) {
    return {
      providerId: selected.provider.id,
      providerName: selected.provider.name,
      modelName,
      credentialId: '',
      apiKey: '',
      baseUrl: selected.provider.baseUrl || getDefaultBaseUrl(selected.provider.name),
      apiFormat: selected.provider.apiFormat || getDefaultApiFormat(selected.provider.name),
      providerType: selected.provider.providerType || 'builtin',
      gatewaySlug: selected.provider.gatewaySlug,
      providerConfig: selected.provider.config as Record<string, unknown> | string | null,
      modelMetadata: selected.rate.modelMetadata as Record<string, unknown> | string | null,
    };
  }

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

  // Decrypt credential
  let apiKey = '';
  const credValue = selectedCred.credentialValue as Record<string, string> | string;
  if (encryptionKey && typeof credValue === 'string' && isEncrypted(credValue)) {
    // Encrypted credential
    const decrypted = (await decryptCredential(credValue, encryptionKey)) as Record<string, string> | string;
    if (typeof decrypted === 'object' && decrypted !== null) {
      apiKey = decrypted.api_key || '';
    } else {
      apiKey = String(decrypted);
    }
  } else if (typeof credValue === 'object' && credValue !== null) {
    apiKey = credValue.api_key || '';
  } else {
    apiKey = String(credValue);
  }

  return {
    providerId: selected.provider.id,
    providerName: selected.provider.name,
    modelName,
    credentialId: selectedCred.id,
    apiKey,
    baseUrl: selected.provider.baseUrl || getDefaultBaseUrl(selected.provider.name),
    apiFormat: selected.provider.apiFormat || getDefaultApiFormat(selected.provider.name),
    providerType: selected.provider.providerType || 'builtin',
    gatewaySlug: selected.provider.gatewaySlug,
    providerConfig: selected.provider.config as Record<string, unknown> | string | null,
    modelMetadata: selected.rate.modelMetadata as Record<string, unknown> | string | null,
  };
}

function getDefaultBaseUrl(providerName: string): string {
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    deepseek: 'https://api.deepseek.com/v1',
    xai: 'https://api.x.ai/v1',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
    bedrock: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  };
  return defaults[providerName] || 'https://api.openai.com/v1';
}

function getDefaultApiFormat(providerName: string): string {
  const formats: Record<string, string> = {
    anthropic: 'anthropic',
    google: 'gemini',
    bedrock: 'bedrock',
  };
  return formats[providerName] || 'openai';
}

/**
 * Build provider-specific request headers.
 * When viaGateway is true, Gemini auth uses x-goog-api-key header instead of URL query.
 */
export function buildProviderHeaders(
  provider: ResolvedProvider,
  options?: { viaGateway?: boolean; gatewayAuthToken?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider.apiFormat === 'bedrock') {
    // Bedrock uses SigV4 signing — headers are set in the request builder
    // For now, return minimal headers
    return headers;
  } else if (provider.apiFormat === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider.apiFormat === 'gemini') {
    if (options?.viaGateway) {
      // Gateway mode: key in header (Gateway strips query params)
      headers['x-goog-api-key'] = provider.apiKey;
    }
    // Direct mode: key is in URL query, no auth header needed
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  // Gateway auth header (if gateway requires authentication)
  if (options?.viaGateway && options.gatewayAuthToken) {
    headers['cf-aig-authorization'] = `Bearer ${options.gatewayAuthToken}`;
  }

  return headers;
}

/**
 * Build the upstream API URL for a given call type.
 * When gateway config is provided, routes through CF AI Gateway for supported providers.
 * Unsupported providers (doubao, bedrock) automatically fall back to direct connection.
 */
export function buildUpstreamUrl(
  provider: ResolvedProvider,
  callType: string,
  options?: { stream?: boolean; gateway?: GatewayConfig }
): string {
  // Try Gateway route first
  if (options?.gateway) {
    const gwUrl = buildGatewayUrl(options.gateway, provider.providerName, provider.apiFormat, callType, {
      modelName: provider.modelName,
      stream: options.stream,
      dbGatewaySlug: provider.gatewaySlug,
    });
    if (gwUrl) return gwUrl;
    // Fall through to direct if provider not supported by Gateway
  }

  const { baseUrl } = provider;

  if (provider.apiFormat === 'bedrock') {
    // Bedrock URL format: https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke
    const region = provider.baseUrl.match(/bedrock-runtime\.([^.]+)\./)?.[1] || 'us-east-1';
    const base = `https://bedrock-runtime.${region}.amazonaws.com`;
    if (options?.stream) {
      return `${base}/model/${provider.modelName}/invoke-with-response-stream`;
    }
    return `${base}/model/${provider.modelName}/invoke`;
  }

  if (provider.apiFormat === 'anthropic') {
    return `${baseUrl}/messages`;
  }

  if (provider.apiFormat === 'gemini') {
    const base = baseUrl.replace(/\/+$/, '');
    const method = options?.stream ? 'streamGenerateContent' : 'generateContent';
    const params = options?.stream
      ? `alt=sse&key=${provider.apiKey}`
      : `key=${provider.apiKey}`;
    if (callType === 'embedding') {
      return `${base}/models/${provider.modelName}:embedContent?key=${provider.apiKey}`;
    }
    return `${base}/models/${provider.modelName}:${method}?${params}`;
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
 * Convert OpenAI-format messages to Google Gemini format.
 */
export function toGeminiRequestBody(
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; temperature?: number; topP?: number }
) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };
  const generationConfig: Record<string, unknown> = {};
  if (options.maxTokens) generationConfig.maxOutputTokens = options.maxTokens;
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  if (options.topP !== undefined) generationConfig.topP = options.topP;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  return body;
}

/**
 * Convert Google Gemini response to OpenAI-compatible format.
 */
export function fromGeminiResponse(geminiData: Record<string, unknown>, model: string) {
  const candidates = geminiData.candidates as Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }> | undefined;

  const text = candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const usage = geminiData.usageMetadata as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | undefined;

  return {
    id: (geminiData.responseId as string) || `gemini-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: usage?.promptTokenCount || 0,
      completion_tokens: usage?.candidatesTokenCount || 0,
      total_tokens: usage?.totalTokenCount || 0,
    },
  };
}

/**
 * Convert OpenAI-format messages to Anthropic Messages API format.
 * Key differences: system message must be a separate field, not in messages array.
 */
export function toAnthropicRequestBody(
  messages: Array<{ role: string; content: string }>,
  options: { model: string; maxTokens?: number; temperature?: number; topP?: number; stream?: boolean }
) {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  const body: Record<string, unknown> = {
    model: options.model,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens || 4096,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join('\n');
  }
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.topP !== undefined) body.top_p = options.topP;
  if (options.stream) body.stream = true;

  return body;
}

/**
 * Convert Anthropic Messages API response to OpenAI-compatible format.
 */
export function fromAnthropicResponse(anthropicData: Record<string, unknown>, model: string) {
  const content = anthropicData.content as Array<{ type: string; text?: string }> | undefined;
  const text =
    content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('') || '';
  const usage = anthropicData.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  return {
    id: (anthropicData.id as string) || `anthropic-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: anthropicData.stop_reason === 'max_tokens' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    },
  };
}

/**
 * Estimate maximum credits for a model call (for pre-deduction).
 * Uses inputRate * estimated input tokens + outputRate * max_tokens.
 */
export async function estimateMaxCredits(
  db: DB,
  providerId: string,
  modelName: string,
  params: { estimatedInputTokens?: number; maxOutputTokens?: number }
): Promise<number> {
  const [rate] = await db
    .select()
    .from(aiModelRates)
    .where(and(eq(aiModelRates.providerId, providerId), eq(aiModelRates.model, modelName)))
    .limit(1);

  if (!rate) return 0;

  const inputRate = parseFloat(rate.inputRate);
  const outputRate = parseFloat(rate.outputRate);

  // Estimate: input tokens from message length + max output tokens
  const inputTokens = params.estimatedInputTokens || 1000;
  const outputTokens = params.maxOutputTokens || 4096;

  return inputTokens * inputRate + outputTokens * outputRate;
}

/**
 * Record a model call in D1 (fire-and-forget pattern).
 * If kv is provided and the D1 write fails, the payload is stored in KV for later retry.
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
  },
  kv?: KVNamespace
) {
  try {
    await db.insert(modelCalls).values({
      ...data,
      type: data.type as 'chatCompletion' | 'embedding' | 'imageGeneration' | 'video',
      usageMetrics: data.usageMetrics ? JSON.stringify(data.usageMetrics) : null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    });
  } catch (err) {
    logger.error('Failed to record model call', { error: err instanceof Error ? err.message : String(err) });
    if (kv) {
      try {
        await enqueueFailedWrite(kv, {
          table: 'ModelCalls',
          operation: 'insert',
          values: {
            id: crypto.randomUUID(),
            providerId: data.providerId,
            model: data.model,
            credentialId: data.credentialId,
            type: data.type,
            status: data.status,
            totalUsage: data.totalUsage,
            usageMetrics: data.usageMetrics ? JSON.stringify(data.usageMetrics) : null,
            credits: data.credits,
            duration: data.duration,
            errorReason: data.errorReason || null,
            userDid: data.userDid || null,
            appDid: data.appDid || null,
            requestId: data.requestId || null,
            callTime: data.callTime,
            ttfb: data.ttfb || null,
            providerTtfb: data.providerTtfb || null,
            metadata: data.metadata ? JSON.stringify(data.metadata) : null,
            traceId: data.traceId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          lastError: err instanceof Error ? err.message : String(err),
        });
      } catch (kvErr) {
        logger.error('KV enqueue failed for model call', { error: kvErr instanceof Error ? kvErr.message : String(kvErr) });
      }
    }
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
 * If kv is provided and the D1 write fails, the payload is stored in KV for later retry.
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
  },
  kv?: KVNamespace
) {
  try {
    await db.insert(usages).values(data);
  } catch (err) {
    logger.error('Failed to record usage', { error: err instanceof Error ? err.message : String(err) });
    if (kv) {
      try {
        await enqueueFailedWrite(kv, {
          table: 'Usages',
          operation: 'insert',
          values: {
            id: crypto.randomUUID(),
            promptTokens: data.promptTokens,
            completionTokens: data.completionTokens,
            cacheCreationInputTokens: data.cacheCreationInputTokens || 0,
            cacheReadInputTokens: data.cacheReadInputTokens || 0,
            numberOfImageGeneration: data.numberOfImageGeneration || 0,
            type: data.type || null,
            model: data.model || null,
            userDid: data.userDid || null,
            appId: data.appId || null,
            usedCredits: data.usedCredits || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          lastError: err instanceof Error ? err.message : String(err),
        });
      } catch (kvErr) {
        logger.error('KV enqueue failed for usage', { error: kvErr instanceof Error ? kvErr.message : String(kvErr) });
      }
    }
  }
}
