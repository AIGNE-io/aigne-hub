export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
  authToken?: string;
}

export interface GatewaySettings {
  enabled: boolean;
  accountId: string;
  gatewayId: string;
  authToken?: string;
}

const KV_KEY = 'gateway-settings';

const GATEWAY_SLUG: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google-ai-studio',
  deepseek: 'deepseek',
  xai: 'grok',
  groq: 'groq',
  mistral: 'mistral',
  openrouter: 'openrouter',
  perplexity: 'perplexity',
};

export function getGatewaySlug(providerName: string): string | null {
  return GATEWAY_SLUG[providerName] ?? null;
}

export function getSupportedGatewaySlugs(): Record<string, string> {
  return { ...GATEWAY_SLUG };
}

/**
 * Resolve gateway config from KV (admin-configured) or env vars (fallback).
 */
export async function resolveGatewayConfig(
  kv: KVNamespace,
  env: { AI_GATEWAY_ACCOUNT_ID?: string; AI_GATEWAY_ID?: string }
): Promise<GatewayConfig | undefined> {
  try {
    const raw = await kv.get(KV_KEY);
    if (raw) {
      const settings = JSON.parse(raw) as GatewaySettings;
      if (settings.enabled && settings.accountId && settings.gatewayId) {
        return { accountId: settings.accountId, gatewayId: settings.gatewayId, authToken: settings.authToken };
      }
      if (!settings.enabled) return undefined;
    }
  } catch {
    // KV read failed, fall through
  }

  if (env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ID) {
    return { accountId: env.AI_GATEWAY_ACCOUNT_ID, gatewayId: env.AI_GATEWAY_ID };
  }
  return undefined;
}

export function getGatewayConfig(env: {
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}): GatewayConfig | undefined {
  if (env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ID) {
    return { accountId: env.AI_GATEWAY_ACCOUNT_ID, gatewayId: env.AI_GATEWAY_ID };
  }
  return undefined;
}

export function shouldUseGateway(
  providerName: string,
  providerConfig?: Record<string, unknown> | string | null
): boolean {
  if (!getGatewaySlug(providerName)) return false;
  if (providerConfig) {
    const cfg = typeof providerConfig === 'string' ? JSON.parse(providerConfig) : providerConfig;
    if (cfg.useGateway === false) return false;
  }
  return true;
}

// --- KV read/write ---

export async function getGatewaySettings(kv: KVNamespace): Promise<GatewaySettings | null> {
  try {
    const raw = await kv.get(KV_KEY);
    return raw ? (JSON.parse(raw) as GatewaySettings) : null;
  } catch {
    return null;
  }
}

export async function saveGatewaySettings(kv: KVNamespace, settings: GatewaySettings): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(settings));
}

// --- URL builders ---

/**
 * Build Gateway compat (universal) endpoint URL.
 * Model field uses "provider/model" format, Gateway routes automatically.
 * Used as primary path when Gateway is enabled.
 */
export function buildGatewayCompatUrl(gw: GatewayConfig, callType: string): string {
  const base = `https://gateway.ai.cloudflare.com/v1/${gw.accountId}/${gw.gatewayId}`;
  switch (callType) {
    case 'chat':
      return `${base}/compat/chat/completions`;
    case 'embedding':
      return `${base}/compat/embeddings`;
    case 'image':
      return `${base}/compat/images/generations`;
    default:
      return `${base}/compat/chat/completions`;
  }
}

/**
 * Build Gateway provider-specific endpoint URL.
 * Used for pass-through mode (Hub provides credentials).
 */
export function buildGatewayUrl(
  gw: GatewayConfig,
  providerName: string,
  apiFormat: string,
  callType: string,
  options: { modelName?: string; stream?: boolean }
): string | null {
  const slug = getGatewaySlug(providerName);
  if (!slug) return null;

  const base = `https://gateway.ai.cloudflare.com/v1/${gw.accountId}/${gw.gatewayId}/${slug}`;

  if (apiFormat === 'anthropic') {
    return `${base}/v1/messages`;
  }

  if (apiFormat === 'gemini') {
    const apiVersion = options.modelName?.includes('preview') ? 'v1beta' : 'v1';
    if (callType === 'embedding') {
      return `${base}/${apiVersion}/models/${options.modelName}:embedContent`;
    }
    const method = options.stream ? 'streamGenerateContent' : 'generateContent';
    const qs = options.stream ? '?alt=sse' : '';
    return `${base}/${apiVersion}/models/${options.modelName}:${method}${qs}`;
  }

  switch (callType) {
    case 'chat':
      return `${base}/chat/completions`;
    case 'embedding':
      return `${base}/embeddings`;
    case 'image':
      return `${base}/images/generations`;
    default:
      return `${base}/chat/completions`;
  }
}

/**
 * Build headers for Gateway compat mode.
 * Only needs cf-aig-authorization — Gateway injects provider keys.
 */
export function buildGatewayCompatHeaders(gw: GatewayConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (gw.authToken) {
    headers['cf-aig-authorization'] = `Bearer ${gw.authToken}`;
  }
  return headers;
}
