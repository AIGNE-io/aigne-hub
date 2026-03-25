import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { aiCredentials, aiModelRateHistories, aiModelRates, aiModelStatuses, aiProviders } from '../db/schema';
import {
  getGatewaySettings,
  getSupportedGatewaySlugs,
  getGatewaySlug,
  saveGatewaySettings,
  type GatewaySettings,
} from '../libs/ai-gateway';
import { decryptCredential, encryptCredential, isEncrypted } from '../libs/crypto';
import type { HonoEnv } from '../worker';

type ModelRateType = 'chatCompletion' | 'embedding' | 'imageGeneration' | 'video';
const VALID_TYPES: ModelRateType[] = ['chatCompletion', 'embedding', 'imageGeneration', 'video'];

const routes = new Hono<HonoEnv>();

// Helper: check if user is admin
function isAdmin(c: Context<HonoEnv>): boolean {
  // Dev fallback: skip admin check in non-production
  if (c.env.ENVIRONMENT !== 'production') return true;
  const user = c.get('user') as { role?: string } | undefined;
  const role = user?.role || c.req.header('x-user-role');
  return role === 'admin' || role === 'owner';
}

function ensureAdmin(c: Context<HonoEnv>) {
  if (!isAdmin(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return null;
}

function getDefaultBaseUrl(providerName: string): string {
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    deepseek: 'https://api.deepseek.com/v1',
    xai: 'https://api.x.ai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
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

function getDefaultTestModel(providerName: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4.1-nano',
    anthropic: 'claude-haiku-4-5-20251001',
    google: 'gemini-2.0-flash',
    deepseek: 'deepseek-chat',
    xai: 'grok-3-mini-fast',
    openrouter: 'openai/gpt-4.1-nano',
    doubao: 'doubao-1.5-pro-32k',
  };
  return defaults[providerName] || 'gpt-4.1-nano';
}

// ============================================================
// MODEL STATUS TESTING
// ============================================================

// GET /api/ai-providers/test-models - Test model availability
routes.get('/test-models', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const db = c.get('db');
  const filterProvider = c.req.query('providerId');
  const filterModel = c.req.query('model');
  const filterType = c.req.query('type');

  // Get all model rates (optionally filtered) to know which models to test
  let conditions = undefined as ReturnType<typeof and>;
  const condParts = [];
  if (filterProvider) condParts.push(eq(aiModelRates.providerId, filterProvider));
  if (filterModel) condParts.push(eq(aiModelRates.model, filterModel));
  if (filterType) condParts.push(eq(aiModelRates.type, filterType as ModelRateType));
  if (condParts.length > 0) conditions = condParts.length === 1 ? condParts[0] : and(...condParts);

  const rates = await db
    .select({
      providerId: aiModelRates.providerId,
      model: aiModelRates.model,
      type: aiModelRates.type,
      providerName: aiProviders.name,
      baseUrl: aiProviders.baseUrl,
      apiFormat: aiProviders.apiFormat,
    })
    .from(aiModelRates)
    .leftJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
    .where(conditions);

  if (rates.length === 0) {
    return c.json({ message: 'No models to test', tested: 0 });
  }

  // Get credentials for the providers we need to test
  const providerIds = [...new Set(rates.map((r) => r.providerId))];
  const allCreds = await db.select().from(aiCredentials).where(eq(aiCredentials.active, true));
  const credsByProvider = new Map<string, (typeof allCreds)[0]>();
  for (const cred of allCreds) {
    if (providerIds.includes(cred.providerId) && !credsByProvider.has(cred.providerId)) {
      credsByProvider.set(cred.providerId, cred);
    }
  }

  // Deduplicate: only test each provider+model combo once (prefer chatCompletion type)
  const seen = new Set<string>();
  const toTest = rates.filter((r) => {
    const key = `${r.providerId}:${r.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Test each model concurrently (with a concurrency limit)
  const CONCURRENCY = 5;
  const results: Array<{ provider: string; model: string; type: string | null; available: boolean; error: unknown }> =
    [];

  for (let i = 0; i < toTest.length; i += CONCURRENCY) {
    const batch = toTest.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (rate) => {
        const cred = credsByProvider.get(rate.providerId);
        if (!cred) {
          return { ...rate, available: false, error: { code: 'NO_CREDENTIAL', message: 'No active credential' } };
        }

        const credValue = cred.credentialValue as Record<string, string> | string;
        const encryptionKey = c.env.CREDENTIAL_ENCRYPTION_KEY;
        let apiKey: string;
        if (encryptionKey && typeof credValue === 'string' && isEncrypted(credValue)) {
          const decrypted = (await decryptCredential(credValue, encryptionKey)) as Record<string, string> | string;
          apiKey = typeof decrypted === 'object' && decrypted !== null ? decrypted.api_key || '' : String(decrypted);
        } else {
          apiKey = typeof credValue === 'object' && credValue !== null ? credValue.api_key || '' : String(credValue);
        }

        if (!apiKey) {
          return { ...rate, available: false, error: { code: 'NO_API_KEY', message: 'Credential has no api_key' } };
        }

        const providerName = rate.providerName || '';
        const baseUrl = rate.baseUrl || getDefaultBaseUrl(providerName);
        const testModel = rate.model;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        let testUrl: string;
        let testBody: string;

        const apiFormat = rate.apiFormat || getDefaultApiFormat(providerName);

        if (rate.type === 'embedding') {
          headers.Authorization = `Bearer ${apiKey}`;
          testUrl = `${baseUrl}/embeddings`;
          testBody = JSON.stringify({ model: testModel, input: 'test' });
        } else if (apiFormat === 'anthropic') {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          testUrl = `${baseUrl}/messages`;
          testBody = JSON.stringify({ model: testModel, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] });
        } else {
          headers.Authorization = `Bearer ${apiKey}`;
          testUrl = `${baseUrl}/chat/completions`;
          testBody = JSON.stringify({ model: testModel, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] });
        }

        const startTime = Date.now();
        try {
          const res = await fetch(testUrl, { method: 'POST', headers, body: testBody, signal: AbortSignal.timeout(15000) });
          const responseTime = Date.now() - startTime;

          if (!res.ok) {
            const text = await res.text();
            let detail = `Provider returned ${res.status}`;
            try {
              const err = JSON.parse(text);
              detail = err.error?.message || err.message || detail;
            } catch {
              /* use default */
            }
            return { ...rate, available: false, error: { code: 'API_ERROR', message: detail }, responseTime };
          }

          return { ...rate, available: true, error: null, responseTime };
        } catch (err) {
          const responseTime = Date.now() - startTime;
          const message = err instanceof Error ? err.message : 'Connection failed';
          return { ...rate, available: false, error: { code: 'CONNECTION_ERROR', message }, responseTime };
        }
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        results.push({
          provider: r.providerName || '',
          model: r.model,
          type: r.type,
          available: r.available,
          error: r.error,
        });

        // Upsert status into aiModelStatuses
        const now = new Date().toISOString();
        const existing = await db
          .select()
          .from(aiModelStatuses)
          .where(and(eq(aiModelStatuses.providerId, r.providerId), eq(aiModelStatuses.model, r.model)))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(aiModelStatuses)
            .set({
              available: r.available,
              error: r.error,
              responseTime: (r as { responseTime?: number }).responseTime || null,
              lastChecked: now,
              updatedAt: now,
            })
            .where(eq(aiModelStatuses.id, existing[0].id));
        } else {
          await db.insert(aiModelStatuses).values({
            providerId: r.providerId,
            model: r.model,
            type: r.type,
            available: r.available,
            error: r.error,
            responseTime: (r as { responseTime?: number }).responseTime || null,
            lastChecked: now,
          });
        }
      }
    }
  }

  return c.json({ tested: results.length, results });
});

// ============================================================
// PROVIDER CRUD
// ============================================================

// ============================================================
// AI GATEWAY SETTINGS (Admin) — must be before /:id routes
// ============================================================

// GET /api/ai-providers/gateway-settings
routes.get('/gateway-settings', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const settings = await getGatewaySettings(c.env.AUTH_KV);
  const envFallback = {
    accountId: c.env.AI_GATEWAY_ACCOUNT_ID || '',
    gatewayId: c.env.AI_GATEWAY_ID || '',
  };

  const slugs = getSupportedGatewaySlugs();
  const db = c.get('db');
  const providers = await db.select({
    name: aiProviders.name,
    config: aiProviders.config,
    providerType: aiProviders.providerType,
    gatewaySlug: aiProviders.gatewaySlug,
  }).from(aiProviders);

  const providerStatus = providers.map((p) => {
    const slug = getGatewaySlug(p.name, p.gatewaySlug);
    let optedOut = false;
    if (p.config) {
      try {
        const cfg = typeof p.config === 'string' ? JSON.parse(p.config) : p.config;
        if ((cfg as Record<string, unknown>).useGateway === false) optedOut = true;
      } catch { /* ignore */ }
    }
    return {
      name: p.name,
      providerType: p.providerType || 'builtin',
      gatewaySlug: slug,
      supported: !!slug,
      optedOut,
      route: slug && !optedOut ? 'gateway' : 'direct',
    };
  });

  return c.json({
    settings: settings || { enabled: false, accountId: '', gatewayId: '' },
    envFallback,
    activeSource: settings ? 'admin' : envFallback.accountId ? 'env' : 'none',
    supportedSlugs: slugs,
    providers: providerStatus,
  });
});

// PUT /api/ai-providers/gateway-settings
routes.put('/gateway-settings', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const body = await c.req.json<{
    enabled: boolean;
    accountId?: string;
    gatewayId?: string;
    authToken?: string;
  }>();

  if (body.enabled && (!body.accountId || !body.gatewayId)) {
    return c.json({ error: 'accountId and gatewayId are required when enabling gateway' }, 400);
  }

  const settings: GatewaySettings = {
    enabled: body.enabled,
    accountId: body.accountId || '',
    gatewayId: body.gatewayId || '',
    authToken: body.authToken,
  };

  await saveGatewaySettings(c.env.AUTH_KV, settings);
  return c.json({ message: 'Gateway settings updated', settings });
});

// ============================================================
// PROVIDER CRUD
// ============================================================

// GET /api/ai-providers - List all providers
routes.get('/', async (c) => {
  const db = c.get('db');
  const nameFilter = c.req.query('name');

  const conditions = nameFilter ? eq(aiProviders.name, nameFilter) : undefined;
  const providers = await db.select().from(aiProviders).where(conditions);

  // Fetch credentials for each provider (masked)
  const creds = await db.select().from(aiCredentials);
  const credsByProvider = new Map<string, typeof creds>();
  for (const cred of creds) {
    const list = credsByProvider.get(cred.providerId) || [];
    list.push(cred);
    credsByProvider.set(cred.providerId, list);
  }

  const result = providers.map((p) => ({
    ...p,
    credentials: (credsByProvider.get(p.id) || []).map((cred) => ({
      ...cred,
      credentialValue: undefined, // never expose raw value
      maskedValue: '••••••••',
    })),
  }));

  return c.json(result);
});

// POST /api/ai-providers - Create provider
routes.post('/', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const body = await c.req.json<{
    name: string;
    displayName: string;
    baseUrl?: string;
    region?: string;
    enabled?: boolean;
    config?: unknown;
    apiFormat?: 'openai' | 'anthropic' | 'gemini';
    providerType?: 'builtin' | 'custom';
    gatewaySlug?: string;
  }>();

  if (!body.name || !body.displayName) {
    return c.json({ error: 'name and displayName are required' }, 400);
  }

  // Custom provider requires gatewaySlug with "custom-" prefix
  if (body.providerType === 'custom') {
    if (!body.gatewaySlug) {
      return c.json({ error: 'gatewaySlug is required for custom providers' }, 400);
    }
    if (!body.gatewaySlug.startsWith('custom-')) {
      return c.json({ error: 'gatewaySlug must start with "custom-" for custom providers (e.g. custom-vps)' }, 400);
    }
  }

  const db = c.get('db');

  // Check duplicate
  const existing = await db.select().from(aiProviders).where(eq(aiProviders.name, body.name)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: `Provider "${body.name}" already exists` }, 409);
  }

  const [provider] = await db
    .insert(aiProviders)
    .values({
      name: body.name,
      displayName: body.displayName,
      baseUrl: body.baseUrl || null,
      region: body.region || null,
      enabled: body.enabled ?? true,
      config: body.config ? JSON.stringify(body.config) : null,
      apiFormat: body.apiFormat || 'openai',
      providerType: body.providerType || 'builtin',
      gatewaySlug: body.gatewaySlug || null,
    })
    .returning();

  return c.json(provider, 201);
});

// PUT /api/ai-providers/:id - Update provider
routes.put('/:id', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { id } = c.req.param();
  const body = await c.req.json<{
    name?: string;
    displayName?: string;
    baseUrl?: string;
    region?: string;
    enabled?: boolean;
    apiFormat?: 'openai' | 'anthropic' | 'gemini';
    providerType?: 'builtin' | 'custom';
    gatewaySlug?: string | null;
  }>();

  const db = c.get('db');
  const existing = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
  if (body.region !== undefined) updates.region = body.region;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.apiFormat !== undefined) updates.apiFormat = body.apiFormat;
  if (body.providerType !== undefined) updates.providerType = body.providerType;
  if (body.gatewaySlug !== undefined) updates.gatewaySlug = body.gatewaySlug;

  const [updated] = await db.update(aiProviders).set(updates).where(eq(aiProviders.id, id)).returning();
  return c.json(updated);
});

// DELETE /api/ai-providers/:id - Delete provider
routes.delete('/:id', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { id } = c.req.param();
  const db = c.get('db');

  const existing = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  await db.delete(aiProviders).where(eq(aiProviders.id, id));
  return c.json({ message: 'Provider deleted' });
});

// ============================================================
// CREDENTIAL MANAGEMENT
// ============================================================

// POST /api/ai-providers/:providerId/credentials/test - Test a credential before saving
routes.post('/:providerId/credentials/test', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId } = c.req.param();
  const body = await c.req.json<{
    value: string;
    credentialType?: string;
    testModel?: string;
  }>();

  if (!body.value) {
    return c.json({ error: 'value is required' }, 400);
  }

  const db = c.get('db');
  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1);
  if (!provider) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  // Extract API key
  let apiKey = body.value;
  try {
    const parsed = JSON.parse(body.value);
    if (parsed.api_key) apiKey = parsed.api_key;
  } catch {
    // value is the raw key string
  }

  const baseUrl = provider.baseUrl || getDefaultBaseUrl(provider.name);
  const testModel = body.testModel || getDefaultTestModel(provider.name);

  // Build test request based on provider type
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let testUrl: string;
  let testBody: string;

  const apiFormat = provider.apiFormat || getDefaultApiFormat(provider.name);

  if (apiFormat === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    testUrl = `${baseUrl}/messages`;
    testBody = JSON.stringify({
      model: testModel,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    });
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    testUrl = `${baseUrl}/chat/completions`;
    testBody = JSON.stringify({
      model: testModel,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    });
  }

  try {
    const res = await fetch(testUrl, {
      method: 'POST',
      headers,
      body: testBody,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      let detail = `Provider returned ${res.status}`;
      try {
        const err = JSON.parse(text);
        detail = err.error?.message || err.message || detail;
      } catch {
        /* use default */
      }
      return c.json({ error: 'Connection test failed', detail }, 400);
    }

    return c.json({ success: true, message: 'Connection successful' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    return c.json({ error: 'Connection test failed', detail: message }, 400);
  }
});

// POST /api/ai-providers/:providerId/credentials
routes.post('/:providerId/credentials', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId } = c.req.param();
  const body = await c.req.json<{
    name: string;
    value: unknown;
    credentialType?: string;
  }>();

  if (!body.name || !body.value) {
    return c.json({ error: 'name and value are required' }, 400);
  }

  const db = c.get('db');

  // Validate provider exists
  const provider = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1);
  if (provider.length === 0) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  // Encrypt credential before storing (required in production)
  const encryptionKey = c.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encryptionKey && c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'CREDENTIAL_ENCRYPTION_KEY must be configured in production' }, 500);
  }
  const valueToStore = encryptionKey ? await encryptCredential(body.value, encryptionKey) : body.value;

  const [credential] = await db
    .insert(aiCredentials)
    .values({
      providerId,
      name: body.name,
      credentialValue: valueToStore,
      credentialType: (body.credentialType as 'api_key' | 'access_key_pair' | 'custom') || 'api_key',
    })
    .returning();

  return c.json({ ...credential, credentialValue: undefined, maskedValue: '••••••••' }, 201);
});

// PUT /api/ai-providers/:providerId/credentials/:credentialId
routes.put('/:providerId/credentials/:credentialId', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId, credentialId } = c.req.param();
  const body = await c.req.json<{ name?: string; value?: unknown; active?: boolean; weight?: number }>();
  const db = c.get('db');

  const existing = await db
    .select()
    .from(aiCredentials)
    .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.providerId, providerId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Credential not found' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.value !== undefined) {
    const encryptionKey = c.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey && c.env.ENVIRONMENT === 'production') {
      return c.json({ error: 'CREDENTIAL_ENCRYPTION_KEY must be configured in production' }, 500);
    }
    updates.credentialValue = encryptionKey ? await encryptCredential(body.value, encryptionKey) : body.value;
  }
  if (body.active !== undefined) updates.active = body.active;
  if (body.weight !== undefined) updates.weight = body.weight;

  const [updated] = await db.update(aiCredentials).set(updates).where(eq(aiCredentials.id, credentialId)).returning();

  return c.json({ ...updated, credentialValue: undefined, maskedValue: '••••••••' });
});

// DELETE /api/ai-providers/:providerId/credentials/:credentialId
routes.delete('/:providerId/credentials/:credentialId', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId, credentialId } = c.req.param();
  const db = c.get('db');

  const existing = await db
    .select()
    .from(aiCredentials)
    .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.providerId, providerId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Credential not found' }, 404);
  }

  await db.delete(aiCredentials).where(eq(aiCredentials.id, credentialId));
  return c.json({ message: 'Credential deleted' });
});

// ============================================================
// MODEL RATES (per-provider)
// ============================================================

// GET /api/ai-providers/:providerId/model-rates
routes.get('/:providerId/model-rates', async (c) => {
  const { providerId } = c.req.param();
  const includeDeprecated = c.req.query('includeDeprecated') === 'true';
  const db = c.get('db');

  const conditions = includeDeprecated
    ? eq(aiModelRates.providerId, providerId)
    : and(eq(aiModelRates.providerId, providerId), eq(aiModelRates.deprecated, false));

  const rates = await db
    .select()
    .from(aiModelRates)
    .where(conditions)
    .orderBy(asc(aiModelRates.model), asc(aiModelRates.type));

  return c.json(rates);
});

// POST /api/ai-providers/:providerId/model-rates/validate - Validate a model before adding
routes.post('/:providerId/model-rates/validate', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId } = c.req.param();
  const body = await c.req.json<{ model: string; type?: string }>();
  if (!body.model) {
    return c.json({ error: 'model is required' }, 400);
  }

  const db = c.get('db');

  // Get provider and credential
  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1);
  if (!provider) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  const creds = await db
    .select()
    .from(aiCredentials)
    .where(and(eq(aiCredentials.providerId, providerId), eq(aiCredentials.active, true)))
    .limit(1);

  if (creds.length === 0) {
    return c.json({ valid: false, error: 'No active credential for this provider' });
  }

  const cred = creds[0];
  const encryptionKey = c.env.CREDENTIAL_ENCRYPTION_KEY;

  const credValue = cred.credentialValue as Record<string, string> | string;
  let apiKey: string;
  if (encryptionKey && typeof credValue === 'string' && isEncrypted(credValue)) {
    const decrypted = (await decryptCredential(credValue, encryptionKey)) as Record<string, string> | string;
    apiKey = typeof decrypted === 'object' && decrypted !== null ? decrypted.api_key || '' : String(decrypted);
  } else if (typeof credValue === 'object' && credValue !== null) {
    apiKey = credValue.api_key || '';
  } else {
    apiKey = String(credValue);
  }

  if (!apiKey) {
    return c.json({ valid: false, error: 'Credential has no api_key' });
  }

  // Try a minimal request to test the model
  const baseUrl = provider.baseUrl || getDefaultBaseUrl(provider.name);
  const providerName = provider.name.toLowerCase();

  try {
    let testUrl: string;
    const testHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    let testBody: string;

    if (providerName === 'google' || provider.apiFormat === 'gemini') {
      testUrl = `${baseUrl.replace(/\/+$/, '')}/models/${body.model}:generateContent?key=${apiKey}`;
      testBody = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 1 },
      });
    } else if (providerName === 'anthropic' || provider.apiFormat === 'anthropic') {
      testUrl = `${baseUrl.replace(/\/+$/, '')}/messages`;
      testHeaders['x-api-key'] = apiKey;
      testHeaders['anthropic-version'] = '2023-06-01';
      testBody = JSON.stringify({
        model: body.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      });
    } else {
      testUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      testHeaders['Authorization'] = `Bearer ${apiKey}`;
      testBody = JSON.stringify({
        model: body.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      });
    }

    const response = await fetch(testUrl, {
      method: 'POST',
      headers: testHeaders,
      body: testBody,
    });

    if (response.ok) {
      return c.json({ valid: true, model: body.model, status: response.status });
    }

    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.error?.message || parsed.message || errorMessage;
    } catch {
      errorMessage = errorText.substring(0, 200) || errorMessage;
    }

    return c.json({ valid: false, model: body.model, error: errorMessage, status: response.status });
  } catch (err) {
    return c.json({
      valid: false,
      model: body.model,
      error: err instanceof Error ? err.message : 'Connection failed',
    });
  }
});

// POST /api/ai-providers/:providerId/model-rates
routes.post('/:providerId/model-rates', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId } = c.req.param();
  const body = await c.req.json<{
    model: string;
    modelDisplay?: string;
    type: string;
    inputRate: string;
    outputRate: string;
    description?: string;
    unitCosts?: unknown;
    caching?: unknown;
    modelMetadata?: unknown;
  }>();

  if (!body.model || !body.type) {
    return c.json({ error: 'model and type are required' }, 400);
  }

  const db = c.get('db');

  // Check duplicate
  const existing = await db
    .select()
    .from(aiModelRates)
    .where(
      and(
        eq(aiModelRates.providerId, providerId),
        eq(aiModelRates.model, body.model),
        eq(aiModelRates.type, body.type as ModelRateType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: `Rate for ${body.model} (${body.type}) already exists` }, 409);
  }

  const [rate] = await db
    .insert(aiModelRates)
    .values({
      providerId,
      model: body.model,
      modelDisplay: body.modelDisplay || body.model,
      type: body.type as 'chatCompletion' | 'embedding' | 'imageGeneration' | 'video',
      inputRate: body.inputRate || '0',
      outputRate: body.outputRate || '0',
      description: body.description || null,
      unitCosts: body.unitCosts || null,
      caching: body.caching || null,
      modelMetadata: body.modelMetadata || null,
    })
    .returning();

  return c.json(rate, 201);
});

// PUT /api/ai-providers/:providerId/model-rates/:rateId
routes.put('/:providerId/model-rates/:rateId', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { providerId, rateId } = c.req.param();
  const body = await c.req.json<Record<string, unknown>>();
  const db = c.get('db');

  const existing = await db
    .select()
    .from(aiModelRates)
    .where(and(eq(aiModelRates.id, rateId), eq(aiModelRates.providerId, providerId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Model rate not found' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const allowedFields = ['modelDisplay', 'inputRate', 'outputRate', 'description', 'deprecated', 'deprecatedReason'];
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  // JSON fields (Drizzle handles stringify via mode: 'json')
  if (body.unitCosts !== undefined) updates.unitCosts = body.unitCosts;
  if (body.caching !== undefined) updates.caching = body.caching;
  if (body.modelMetadata !== undefined) updates.modelMetadata = body.modelMetadata;

  const [updated] = await db.update(aiModelRates).set(updates).where(eq(aiModelRates.id, rateId)).returning();
  return c.json(updated);
});

// DELETE /api/ai-providers/:providerId/model-rates/:rateId
routes.delete('/:providerId/model-rates/:rateId', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const { rateId, providerId } = c.req.param();
  const db = c.get('db');

  const existing = await db
    .select()
    .from(aiModelRates)
    .where(and(eq(aiModelRates.id, rateId), eq(aiModelRates.providerId, providerId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Model rate not found' }, 404);
  }

  await db.delete(aiModelRates).where(eq(aiModelRates.id, rateId));
  return c.json({ message: 'Model rate deleted' });
});

// ============================================================
// MODEL LISTING (Public)
// ============================================================

// GET /api/ai-providers/models (+ /chat/models alias) - List all available models
const modelsHandler = async (c: Context<HonoEnv>) => {
  const db = c.get('db');
  const typeFilter = c.req.query('type');

  const conditions = [eq(aiProviders.enabled, true), eq(aiModelRates.deprecated, false)];
  if (typeFilter) {
    if (VALID_TYPES.includes(typeFilter as ModelRateType)) {
      conditions.push(eq(aiModelRates.type, typeFilter as ModelRateType));
    }
  }

  const rates = await db
    .select({
      rate: aiModelRates,
      provider: {
        id: aiProviders.id,
        name: aiProviders.name,
        displayName: aiProviders.displayName,
        baseUrl: aiProviders.baseUrl,
        region: aiProviders.region,
      },
    })
    .from(aiModelRates)
    .innerJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
    .where(and(...conditions));

  // Aggregate by model name — frontend expects { model, providers[], rates[] }
  const modelMap = new Map<
    string,
    {
      model: string;
      modelDisplay: string;
      description: string;
      providers: Array<{ id: string; name: string; displayName: string }>;
      rates: Array<{
        id: string;
        type: string;
        inputRate: string;
        outputRate: string;
        provider: { id: string; name: string; displayName: string };
        description: string;
      }>;
    }
  >();

  for (const { rate, provider } of rates) {
    if (!provider) continue;
    let entry = modelMap.get(rate.model);
    if (!entry) {
      entry = {
        model: rate.model,
        modelDisplay: rate.modelDisplay || rate.model,
        description: rate.description || '',
        providers: [],
        rates: [],
      };
      modelMap.set(rate.model, entry);
    }
    const providerInfo = { id: provider.id, name: provider.name, displayName: provider.displayName || provider.name };
    if (!entry.providers.some((p) => p.id === provider.id)) {
      entry.providers.push(providerInfo);
    }
    entry.rates.push({
      id: rate.id,
      type: rate.type,
      inputRate: rate.inputRate,
      outputRate: rate.outputRate,
      provider: providerInfo,
      description: rate.description || '',
    });
  }

  return c.json(Array.from(modelMap.values()));
};
routes.get('/models', modelsHandler);
routes.get('/chat/models', modelsHandler);

// GET /api/ai-providers/model-rates - Paginated model rates list
routes.get('/model-rates', async (c) => {
  const db = c.get('db');
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '50', 10);
  const modelFilter = c.req.query('model');
  const providerIdFilter = c.req.query('providerId');
  const includeDeprecated = c.req.query('includeDeprecated') === 'true';
  const orderDir = c.req.query('o') === 'asc' ? asc : desc;

  const conditions = [];
  if (!includeDeprecated) conditions.push(eq(aiModelRates.deprecated, false));
  if (modelFilter) conditions.push(like(aiModelRates.model, `%${modelFilter}%`));
  if (providerIdFilter) conditions.push(eq(aiModelRates.providerId, providerIdFilter));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rates, countResult] = await Promise.all([
    db
      .select({
        rate: aiModelRates,
        provider: {
          id: aiProviders.id,
          name: aiProviders.name,
          displayName: aiProviders.displayName,
          baseUrl: aiProviders.baseUrl,
          region: aiProviders.region,
          enabled: aiProviders.enabled,
        },
      })
      .from(aiModelRates)
      .leftJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
      .where(whereClause)
      .orderBy(orderDir(aiModelRates.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)` })
      .from(aiModelRates)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count || 0;

  // Fetch statuses
  const statuses = await db.select().from(aiModelStatuses);
  const statusMap = new Map(statuses.map((s) => [`${s.providerId}:${s.model}`, s]));

  const items = rates.map(({ rate, provider }) => {
    const status = statusMap.get(`${rate.providerId}:${rate.model}`);
    return {
      ...rate,
      provider,
      status: status ? { available: status.available, error: status.error, lastChecked: status.lastChecked } : null,
    };
  });

  return c.json({
    list: items,
    count: total,
    data: items,
    paging: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// GET /api/ai-providers/model-status - Model availability status
routes.get('/model-status', async (c) => {
  const db = c.get('db');
  const statuses = await db
    .select({
      status: aiModelStatuses,
      provider: { name: aiProviders.name, displayName: aiProviders.displayName },
    })
    .from(aiModelStatuses)
    .leftJoin(aiProviders, eq(aiModelStatuses.providerId, aiProviders.id));

  return c.json(statuses);
});

// ============================================================
// MODEL CATALOG (Quick Import)
// ============================================================

import modelCatalog from '../data/model-catalog.json';

type CatalogEntry = {
  provider: string;
  model: string;
  displayName: string;
  type: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  cachedInputCostPerToken?: number;
};

// GET /api/ai-providers/model-catalog - Browse available models with auto-pricing
routes.get('/model-catalog', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const db = c.get('db');
  const providerFilter = c.req.query('provider');
  const search = c.req.query('q')?.toLowerCase();

  // Get existing model rates to mark already-added models
  const existingRates = await db
    .select({ model: aiModelRates.model, providerId: aiModelRates.providerId })
    .from(aiModelRates);
  const existingModels = new Set(existingRates.map((r) => r.model));

  // Get DB providers for matching
  const dbProviders = await db.select({ id: aiProviders.id, name: aiProviders.name }).from(aiProviders);
  const providerIdMap = new Map(dbProviders.map((p) => [p.name, p.id]));

  let entries = modelCatalog as CatalogEntry[];
  if (providerFilter) entries = entries.filter((e) => e.provider === providerFilter);
  if (search) entries = entries.filter((e) => e.model.toLowerCase().includes(search) || e.displayName.toLowerCase().includes(search));

  // Group by provider
  const grouped: Record<string, Array<CatalogEntry & { alreadyAdded: boolean; dbProviderId: string | null }>> = {};
  for (const entry of entries) {
    if (!grouped[entry.provider]) grouped[entry.provider] = [];
    grouped[entry.provider].push({
      ...entry,
      alreadyAdded: existingModels.has(entry.model),
      dbProviderId: providerIdMap.get(entry.provider) || null,
    });
  }

  return c.json({
    totalModels: entries.length,
    providers: Object.keys(grouped),
    groups: grouped,
  });
});

// POST /api/ai-providers/import-from-catalog - Batch import selected models
routes.post('/import-from-catalog', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const body = await c.req.json<{
    models: Array<{
      provider: string;
      model: string;
      type?: string;
    }>;
    useGateway?: boolean;
  }>();

  if (!body.models?.length) {
    return c.json({ error: 'models[] is required' }, 400);
  }

  const db = c.get('db');
  const catalog = modelCatalog as CatalogEntry[];
  const catalogMap = new Map(catalog.map((e) => [`${e.provider}/${e.model}`, e]));

  // Get DB providers
  const dbProviders = await db.select().from(aiProviders);
  const providerMap = new Map(dbProviders.map((p) => [p.name, p]));

  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (const req of body.models) {
    const catalogEntry = catalogMap.get(`${req.provider}/${req.model}`);
    if (!catalogEntry) {
      results.errors.push(`${req.provider}/${req.model}: not found in catalog`);
      continue;
    }

    let dbProvider = providerMap.get(req.provider);

    // Auto-create provider if it doesn't exist
    if (!dbProvider) {
      try {
        const [created] = await db
          .insert(aiProviders)
          .values({
            name: req.provider,
            displayName: req.provider.charAt(0).toUpperCase() + req.provider.slice(1),
            apiFormat: req.provider === 'anthropic' ? 'anthropic' : req.provider === 'google' ? 'gemini' : 'openai',
          })
          .returning();
        dbProvider = created;
        providerMap.set(req.provider, dbProvider);
      } catch {
        results.errors.push(`${req.provider}: failed to create provider`);
        continue;
      }
    }

    // Check if rate already exists
    const type = (req.type || catalogEntry.type || 'chatCompletion') as ModelRateType;
    const existing = await db
      .select()
      .from(aiModelRates)
      .where(and(eq(aiModelRates.providerId, dbProvider.id), eq(aiModelRates.model, req.model), eq(aiModelRates.type, type)))
      .limit(1);

    if (existing.length > 0) {
      results.skipped++;
      continue;
    }

    try {
      await db.insert(aiModelRates).values({
        providerId: dbProvider.id,
        model: req.model,
        modelDisplay: catalogEntry.displayName,
        type,
        inputRate: catalogEntry.inputCostPerToken.toPrecision(10),
        outputRate: catalogEntry.outputCostPerToken.toPrecision(10),
        unitCosts: { input: catalogEntry.inputCostPerToken * 1e6, output: catalogEntry.outputCostPerToken * 1e6 },
        caching: catalogEntry.cachedInputCostPerToken
          ? { readRate: catalogEntry.cachedInputCostPerToken.toPrecision(10) }
          : null,
        modelMetadata: { useGateway: body.useGateway ?? true },
      });
      results.created++;
    } catch (err) {
      results.errors.push(`${req.model}: ${err instanceof Error ? err.message : 'insert failed'}`);
    }
  }

  return c.json(results, 201);
});

// ============================================================
// BULK OPERATIONS
// ============================================================

// POST /api/ai-providers/model-rates (batch create)
routes.post('/model-rates', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const body = await c.req.json<{
    model: string;
    modelDisplay?: string;
    type: string;
    inputRate: string;
    outputRate: string;
    providers: string[];
    description?: string;
    unitCosts?: unknown;
    caching?: unknown;
    modelMetadata?: unknown;
  }>();

  if (!body.model || !body.type || !body.providers?.length) {
    return c.json({ error: 'model, type, and providers[] are required' }, 400);
  }

  const db = c.get('db');

  // Validate all providers exist
  const providers = await db
    .select()
    .from(aiProviders)
    .where(
      sql`${aiProviders.id} IN (${sql.join(
        body.providers.map((p) => sql`${p}`),
        sql`, `
      )})`
    );
  if (providers.length !== body.providers.length) {
    return c.json({ error: 'Some providers not found' }, 400);
  }

  // Check for existing rates
  const existingRates = await db
    .select()
    .from(aiModelRates)
    .where(and(eq(aiModelRates.model, body.model), eq(aiModelRates.type, body.type as ModelRateType)));
  const existingProviderIds = new Set(existingRates.map((r) => r.providerId));
  const conflicts = body.providers.filter((p) => existingProviderIds.has(p));
  if (conflicts.length > 0) {
    return c.json({ error: 'Rates already exist for some providers', conflicts }, 409);
  }

  const created = [];
  for (const providerId of body.providers) {
    const [rate] = await db
      .insert(aiModelRates)
      .values({
        providerId,
        model: body.model,
        modelDisplay: body.modelDisplay || body.model,
        type: body.type as 'chatCompletion' | 'embedding' | 'imageGeneration' | 'video',
        inputRate: body.inputRate || '0',
        outputRate: body.outputRate || '0',
        description: body.description || null,
        unitCosts: body.unitCosts ? JSON.stringify(body.unitCosts) : null,
        caching: body.caching ? JSON.stringify(body.caching) : null,
        modelMetadata: body.modelMetadata ? JSON.stringify(body.modelMetadata) : null,
      })
      .returning();
    created.push(rate);
  }

  return c.json({ count: created.length, rates: created }, 201);
});

// POST /api/ai-providers/bulk-rate-update
routes.post('/bulk-rate-update', async (c) => {
  const adminCheck = ensureAdmin(c);
  if (adminCheck) return adminCheck;

  const body = await c.req.json<{
    updates: Array<{
      rateId: string;
      unitCosts?: { input: number; output: number };
      inputRate?: string;
      outputRate?: string;
      caching?: unknown;
      deprecated?: boolean;
      deprecatedReason?: string;
    }>;
    dryRun?: boolean;
  }>();

  if (!body.updates?.length) {
    return c.json({ error: 'updates[] is required' }, 400);
  }

  const db = c.get('db');
  const results = { updated: 0, skipped: 0, errors: [] as string[] };

  for (const update of body.updates) {
    const existing = await db.select().from(aiModelRates).where(eq(aiModelRates.id, update.rateId)).limit(1);
    if (existing.length === 0) {
      results.errors.push(`Rate ${update.rateId} not found`);
      results.skipped++;
      continue;
    }

    if (!body.dryRun) {
      const sets: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (update.unitCosts) sets.unitCosts = JSON.stringify(update.unitCosts);
      if (update.inputRate) sets.inputRate = update.inputRate;
      if (update.outputRate) sets.outputRate = update.outputRate;
      if (update.caching !== undefined) sets.caching = JSON.stringify(update.caching);
      if (update.deprecated !== undefined) sets.deprecated = update.deprecated;
      if (update.deprecatedReason !== undefined) sets.deprecatedReason = update.deprecatedReason;

      await db.update(aiModelRates).set(sets).where(eq(aiModelRates.id, update.rateId));

      // Record history
      await db.insert(aiModelRateHistories).values({
        providerId: existing[0].providerId,
        model: existing[0].model,
        type: existing[0].type,
        changeType: 'bulk_update',
        source: 'admin',
        previousUnitCosts: existing[0].unitCosts,
        currentUnitCosts: update.unitCosts ? JSON.stringify(update.unitCosts) : existing[0].unitCosts,
        previousRates: JSON.stringify({ inputRate: existing[0].inputRate, outputRate: existing[0].outputRate }),
        currentRates: JSON.stringify({
          inputRate: update.inputRate || existing[0].inputRate,
          outputRate: update.outputRate || existing[0].outputRate,
        }),
        detectedAt: Math.floor(Date.now() / 1000),
      });
    }

    results.updated++;
  }

  return c.json({ ...results, dryRun: body.dryRun || false });
});

// GET /api/ai-providers/health - Provider health check
routes.get('/health', async (c) => {
  const db = c.get('db');

  const creds = await db
    .select({
      credential: aiCredentials,
      provider: { name: aiProviders.name },
    })
    .from(aiCredentials)
    .leftJoin(aiProviders, eq(aiCredentials.providerId, aiProviders.id));

  const health: Record<string, Record<string, { running: boolean }>> = {};
  for (const { credential, provider } of creds) {
    const providerName = provider?.name || 'unknown';
    if (!health[providerName]) health[providerName] = {};
    health[providerName][credential.name] = { running: credential.active };
  }

  return c.json({ providers: health, timestamp: new Date().toISOString() });
});

export default routes;
