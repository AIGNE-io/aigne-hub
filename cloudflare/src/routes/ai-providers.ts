import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { aiCredentials, aiModelRateHistories, aiModelRates, aiModelStatuses, aiProviders } from '../db/schema';
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
  };
  return defaults[providerName] || 'https://api.openai.com/v1';
}

function getDefaultTestModel(providerName: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4.1-nano',
    anthropic: 'claude-haiku-4-5-20251001',
    google: 'gemini-2.0-flash',
    deepseek: 'deepseek-chat',
    xai: 'grok-3-mini-fast',
    openrouter: 'openai/gpt-4.1-nano',
  };
  return defaults[providerName] || 'gpt-4.1-nano';
}

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
  }>();

  if (!body.name || !body.displayName) {
    return c.json({ error: 'name and displayName are required' }, 400);
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

  if (provider.name === 'anthropic') {
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

  // TODO: encrypt credentialValue before storing
  const [credential] = await db
    .insert(aiCredentials)
    .values({
      providerId,
      name: body.name,
      credentialValue: JSON.stringify(body.value),
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
  if (body.value !== undefined) updates.credentialValue = JSON.stringify(body.value);
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
      unitCosts: body.unitCosts ? JSON.stringify(body.unitCosts) : null,
      caching: body.caching ? JSON.stringify(body.caching) : null,
      modelMetadata: body.modelMetadata ? JSON.stringify(body.modelMetadata) : null,
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
  // JSON fields
  if (body.unitCosts !== undefined) updates.unitCosts = JSON.stringify(body.unitCosts);
  if (body.caching !== undefined) updates.caching = JSON.stringify(body.caching);
  if (body.modelMetadata !== undefined) updates.modelMetadata = JSON.stringify(body.modelMetadata);

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
