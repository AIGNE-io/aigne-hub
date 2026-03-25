export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
  authToken?: string;
}

export interface GatewaySettings {
  id?: string; // unique ID for multi-gateway support (omitted = default/legacy)
  name?: string; // display name
  enabled: boolean;
  accountId: string;
  gatewayId: string;
  authToken?: string;
}

const KV_KEY = 'gateway-settings';
const KV_CONFIGS_KEY = 'gateway-configs'; // array of GatewaySettings for multi-gateway

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

/**
 * Resolve gateway slug for a provider.
 * Priority: DB gatewaySlug field > hardcoded GATEWAY_SLUG mapping.
 */
export function getGatewaySlug(providerName: string, dbGatewaySlug?: string | null): string | null {
  if (dbGatewaySlug) return dbGatewaySlug;
  return GATEWAY_SLUG[providerName] ?? null;
}

export function getSupportedGatewaySlugs(): Record<string, string> {
  return { ...GATEWAY_SLUG };
}

/**
 * Resolve gateway config from KV (admin-configured) or env vars (fallback).
 * Supports multi-gateway: if gatewayConfigId is provided, looks up from gateway-configs array.
 */
export async function resolveGatewayConfig(
  kv: KVNamespace,
  env: { AI_GATEWAY_ACCOUNT_ID?: string; AI_GATEWAY_ID?: string },
  gatewayConfigId?: string | null
): Promise<GatewayConfig | undefined> {
  try {
    // Multi-gateway: look up specific config by ID
    if (gatewayConfigId) {
      const configs = await getGatewayConfigs(kv);
      const match = configs.find((c) => c.id === gatewayConfigId && c.enabled);
      if (match) {
        return { accountId: match.accountId, gatewayId: match.gatewayId, authToken: match.authToken };
      }
      // Fall through to default if specific config not found
    }

    // Default: single gateway from legacy KV key
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
  providerConfig?: Record<string, unknown> | string | null,
  dbGatewaySlug?: string | null
): boolean {
  if (!getGatewaySlug(providerName, dbGatewaySlug)) return false;
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

// --- Multi-gateway configs ---

export async function getGatewayConfigs(kv: KVNamespace): Promise<GatewaySettings[]> {
  try {
    const raw = await kv.get(KV_CONFIGS_KEY);
    return raw ? (JSON.parse(raw) as GatewaySettings[]) : [];
  } catch {
    return [];
  }
}

export async function saveGatewayConfigs(kv: KVNamespace, configs: GatewaySettings[]): Promise<void> {
  await kv.put(KV_CONFIGS_KEY, JSON.stringify(configs));
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
  options: { modelName?: string; stream?: boolean; dbGatewaySlug?: string | null }
): string | null {
  const slug = getGatewaySlug(providerName, options.dbGatewaySlug);
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
