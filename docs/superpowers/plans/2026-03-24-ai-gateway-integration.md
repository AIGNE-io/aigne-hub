# AI Gateway Integration (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route AI provider calls through Cloudflare AI Gateway while preserving Hub's auth, credit billing, and format conversion — "Hub stays smart, Gateway handles transport."

**Architecture:** `buildUpstreamUrl()` and `buildProviderHeaders()` gain a Gateway mode toggled by env vars. When `AI_GATEWAY_ACCOUNT_ID` + `AI_GATEWAY_ID` are set, supported providers route through `gateway.ai.cloudflare.com`; unsupported providers (doubao, bedrock) fall back to direct connection automatically. No changes to credit, auth, or format conversion logic.

**Tech Stack:** Cloudflare Workers, Hono, Drizzle ORM, CF AI Gateway, Vitest

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `cloudflare/src/libs/ai-gateway.ts` | Gateway slug mapping, URL builder, header helper | **Create** |
| `cloudflare/src/libs/ai-proxy.ts` | Provider resolution, format conversion, recording | **Modify** (import gateway helpers) |
| `cloudflare/src/routes/v2.ts` | Chat/embed/image/video endpoints | **Modify** (pass gateway config) |
| `cloudflare/src/worker.ts` | Env type, gateway config on context | **Modify** (add env vars + middleware) |
| `cloudflare/wrangler.toml` | Environment configuration | **Modify** (add gateway vars) |
| `cloudflare/src/libs/__tests__/ai-gateway.test.ts` | Unit tests for gateway module | **Create** |
| `cloudflare/src/libs/__tests__/ai-proxy.test.ts` | Updated tests for proxy with gateway | **Create** |

---

### Task 1: Create AI Gateway Module

**Files:**
- Create: `cloudflare/src/libs/ai-gateway.ts`
- Create: `cloudflare/src/libs/__tests__/ai-gateway.test.ts`

- [ ] **Step 1: Write failing tests for gateway slug mapping**

```typescript
// cloudflare/src/libs/__tests__/ai-gateway.test.ts
import { describe, expect, it } from 'vitest';
import { getGatewaySlug, buildGatewayUrl, buildGatewayHeaders } from '../ai-gateway';

describe('getGatewaySlug', () => {
  it('maps openai to openai', () => {
    expect(getGatewaySlug('openai')).toBe('openai');
  });

  it('maps google to google-ai-studio', () => {
    expect(getGatewaySlug('google')).toBe('google-ai-studio');
  });

  it('maps xai to grok', () => {
    expect(getGatewaySlug('xai')).toBe('grok');
  });

  it('returns null for unsupported providers', () => {
    expect(getGatewaySlug('doubao')).toBeNull();
    expect(getGatewaySlug('bedrock')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloudflare && npx vitest run src/libs/__tests__/ai-gateway.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write failing tests for buildGatewayUrl**

```typescript
// append to ai-gateway.test.ts
describe('buildGatewayUrl', () => {
  const gw = { accountId: 'acc123', gatewayId: 'gw456' };

  it('builds OpenAI chat URL', () => {
    expect(buildGatewayUrl(gw, 'openai', 'openai', 'chat', {}))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/openai/chat/completions');
  });

  it('builds Anthropic messages URL', () => {
    expect(buildGatewayUrl(gw, 'anthropic', 'anthropic', 'chat', {}))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/anthropic/v1/messages');
  });

  it('builds Gemini generateContent URL', () => {
    expect(buildGatewayUrl(gw, 'google', 'gemini', 'chat', { modelName: 'gemini-2.5-flash' }))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/google-ai-studio/v1/models/gemini-2.5-flash:generateContent');
  });

  it('builds Gemini streaming URL', () => {
    expect(buildGatewayUrl(gw, 'google', 'gemini', 'chat', { modelName: 'gemini-2.5-flash', stream: true }))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/google-ai-studio/v1/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
  });

  it('builds DeepSeek chat URL via gateway slug', () => {
    expect(buildGatewayUrl(gw, 'deepseek', 'openai', 'chat', {}))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/deepseek/chat/completions');
  });

  it('builds xAI chat URL via grok slug', () => {
    expect(buildGatewayUrl(gw, 'xai', 'openai', 'chat', {}))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/grok/chat/completions');
  });

  it('builds embedding URL', () => {
    expect(buildGatewayUrl(gw, 'openai', 'openai', 'embedding', {}))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/openai/embeddings');
  });

  it('builds image URL', () => {
    expect(buildGatewayUrl(gw, 'openai', 'openai', 'image', {}))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/openai/images/generations');
  });

  it('builds Gemini embedding URL', () => {
    expect(buildGatewayUrl(gw, 'google', 'gemini', 'embedding', { modelName: 'text-embedding-004' }))
      .toBe('https://gateway.ai.cloudflare.com/v1/acc123/gw456/google-ai-studio/v1/models/text-embedding-004:embedContent');
  });

  it('returns null for unsupported provider', () => {
    expect(buildGatewayUrl(gw, 'doubao', 'openai', 'chat', {})).toBeNull();
  });
});
```

- [ ] **Step 4: Write failing tests for buildGatewayHeaders**

```typescript
// append to ai-gateway.test.ts
describe('buildGatewayHeaders', () => {
  it('passes through OpenAI Bearer auth unchanged', () => {
    const h = buildGatewayHeaders('openai', 'sk-xxx');
    expect(h.Authorization).toBe('Bearer sk-xxx');
    expect(h['Content-Type']).toBe('application/json');
  });

  it('uses x-api-key for Anthropic', () => {
    const h = buildGatewayHeaders('anthropic', 'sk-ant-xxx');
    expect(h['x-api-key']).toBe('sk-ant-xxx');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h.Authorization).toBeUndefined();
  });

  it('uses x-goog-api-key for Gemini via Gateway', () => {
    const h = buildGatewayHeaders('gemini', 'AIza-xxx');
    expect(h['x-goog-api-key']).toBe('AIza-xxx');
    expect(h.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 5: Implement ai-gateway.ts to pass all tests**

```typescript
// cloudflare/src/libs/ai-gateway.ts

export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
}

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
    if (callType === 'embedding') {
      return `${base}/v1/models/${options.modelName}:embedContent`;
    }
    const method = options.stream ? 'streamGenerateContent' : 'generateContent';
    const qs = options.stream ? '?alt=sse' : '';
    return `${base}/v1/models/${options.modelName}:${method}${qs}`;
  }

  // OpenAI-compatible (openai, deepseek, xai, groq, mistral, openrouter)
  switch (callType) {
    case 'chat':      return `${base}/chat/completions`;
    case 'embedding': return `${base}/embeddings`;
    case 'image':     return `${base}/images/generations`;
    default:          return `${base}/chat/completions`;
  }
}

export function buildGatewayHeaders(
  apiFormat: string,
  apiKey: string
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (apiFormat === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (apiFormat === 'gemini') {
    headers['x-goog-api-key'] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `cd cloudflare && npx vitest run src/libs/__tests__/ai-gateway.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add cloudflare/src/libs/ai-gateway.ts cloudflare/src/libs/__tests__/ai-gateway.test.ts
git commit -m "feat(gateway): add AI Gateway slug mapping and URL builder"
```

---

### Task 2: Add Gateway Env Vars and Config

**Files:**
- Modify: `cloudflare/src/worker.ts:27-42` (Env type)
- Modify: `cloudflare/wrangler.toml` (env vars)

- [ ] **Step 1: Add gateway fields to Env type**

In `cloudflare/src/worker.ts`, add to the `Env` type:

```typescript
export type Env = {
  // ... existing fields ...
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
};
```

- [ ] **Step 2: Add gateway vars to wrangler.toml**

Add commented-out vars to `[vars]` and actual values to staging/production:

```toml
# In [vars] (development):
# AI_GATEWAY_ACCOUNT_ID = ""
# AI_GATEWAY_ID = ""

# In [env.staging.vars]:
# AI_GATEWAY_ACCOUNT_ID = "your-cf-account-id"
# AI_GATEWAY_ID = "aigne-hub-staging"

# In [env.production.vars]:
# AI_GATEWAY_ACCOUNT_ID = "your-cf-account-id"
# AI_GATEWAY_ID = "aigne-hub-production"
```

- [ ] **Step 3: Commit**

```bash
git add cloudflare/src/worker.ts cloudflare/wrangler.toml
git commit -m "feat(gateway): add AI Gateway env vars to worker and wrangler config"
```

---

### Task 3: Wire Gateway into ai-proxy.ts

**Files:**
- Modify: `cloudflare/src/libs/ai-proxy.ts:155-198` (buildUpstreamUrl)
- Modify: `cloudflare/src/libs/ai-proxy.ts:131-150` (buildProviderHeaders)

- [ ] **Step 1: Write test for buildUpstreamUrl with gateway**

```typescript
// cloudflare/src/libs/__tests__/ai-proxy.test.ts
import { describe, expect, it } from 'vitest';
import { buildUpstreamUrl, buildProviderHeaders } from '../ai-proxy';
import type { ResolvedProvider } from '../ai-proxy';

const openaiProvider: ResolvedProvider = {
  providerId: 'p1', providerName: 'openai', modelName: 'gpt-4o',
  credentialId: 'c1', apiKey: 'sk-xxx', baseUrl: 'https://api.openai.com/v1', apiFormat: 'openai',
};

const anthropicProvider: ResolvedProvider = {
  providerId: 'p2', providerName: 'anthropic', modelName: 'claude-sonnet-4-20250514',
  credentialId: 'c2', apiKey: 'sk-ant-xxx', baseUrl: 'https://api.anthropic.com/v1', apiFormat: 'anthropic',
};

const geminiProvider: ResolvedProvider = {
  providerId: 'p3', providerName: 'google', modelName: 'gemini-2.5-flash',
  credentialId: 'c3', apiKey: 'AIza-xxx', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiFormat: 'gemini',
};

const doubaoProvider: ResolvedProvider = {
  providerId: 'p4', providerName: 'doubao', modelName: 'doubao-pro',
  credentialId: 'c4', apiKey: 'sk-dou', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiFormat: 'openai',
};

const gw = { accountId: 'acc', gatewayId: 'gw' };

describe('buildUpstreamUrl with gateway', () => {
  it('routes OpenAI through gateway', () => {
    const url = buildUpstreamUrl(openaiProvider, 'chat', { gateway: gw });
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/acc/gw/openai/chat/completions');
  });

  it('routes Anthropic through gateway', () => {
    const url = buildUpstreamUrl(anthropicProvider, 'chat', { gateway: gw });
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic/v1/messages');
  });

  it('routes Gemini streaming through gateway', () => {
    const url = buildUpstreamUrl(geminiProvider, 'chat', { stream: true, gateway: gw });
    expect(url).toContain('google-ai-studio/v1/models/gemini-2.5-flash:streamGenerateContent');
  });

  it('routes Gemini embedding through gateway', () => {
    const url = buildUpstreamUrl(geminiProvider, 'embedding', { gateway: gw });
    expect(url).toContain('google-ai-studio/v1/models/gemini-2.5-flash:embedContent');
  });

  it('falls back to direct for unsupported provider (doubao)', () => {
    const url = buildUpstreamUrl(doubaoProvider, 'chat', { gateway: gw });
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
  });

  it('falls back to direct when no gateway config', () => {
    const url = buildUpstreamUrl(openaiProvider, 'chat', {});
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('buildProviderHeaders with gateway', () => {
  it('uses x-goog-api-key for Gemini via gateway', () => {
    const h = buildProviderHeaders(geminiProvider, { viaGateway: true });
    expect(h['x-goog-api-key']).toBe('AIza-xxx');
  });

  it('keeps key in URL for Gemini direct (no header)', () => {
    const h = buildProviderHeaders(geminiProvider);
    expect(h['x-goog-api-key']).toBeUndefined();
    expect(h.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloudflare && npx vitest run src/libs/__tests__/ai-proxy.test.ts`
Expected: FAIL — signature mismatch (gateway param doesn't exist yet)

- [ ] **Step 3: Modify buildUpstreamUrl to support gateway**

In `cloudflare/src/libs/ai-proxy.ts`, change the signature and add gateway branch at the top:

```typescript
import { buildGatewayUrl, type GatewayConfig } from './ai-gateway';

export function buildUpstreamUrl(
  provider: ResolvedProvider,
  callType: string,
  options?: { stream?: boolean; gateway?: GatewayConfig }
): string {
  // Try Gateway route first
  if (options?.gateway) {
    const gwUrl = buildGatewayUrl(
      options.gateway,
      provider.providerName,
      provider.apiFormat,
      callType,
      { modelName: provider.modelName, stream: options.stream }
    );
    if (gwUrl) return gwUrl;
    // Fall through to direct if provider not supported by Gateway
  }

  // --- Direct connection (existing logic, unchanged) ---
  const { baseUrl } = provider;
  // ... rest of existing code ...
}
```

- [ ] **Step 4: Modify buildProviderHeaders to support gateway Gemini**

```typescript
export function buildProviderHeaders(
  provider: ResolvedProvider,
  options?: { viaGateway?: boolean }
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (provider.apiFormat === 'bedrock') {
    return headers;
  } else if (provider.apiFormat === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider.apiFormat === 'gemini') {
    if (options?.viaGateway) {
      headers['x-goog-api-key'] = provider.apiKey;
    }
    // Direct mode: key is in URL query, no auth header
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cloudflare && npx vitest run src/libs/__tests__/`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add cloudflare/src/libs/ai-proxy.ts cloudflare/src/libs/__tests__/ai-proxy.test.ts
git commit -m "feat(gateway): wire Gateway URL routing into ai-proxy with direct fallback"
```

---

### Task 4: Update v2.ts Routes to Pass Gateway Config

**Files:**
- Modify: `cloudflare/src/routes/v2.ts`

The key change: construct `gateway` config from env and pass it to `buildUpstreamUrl()` and `buildProviderHeaders()`.

- [ ] **Step 1: Add gateway config helper at top of v2.ts**

```typescript
import type { GatewayConfig } from '../libs/ai-gateway';
import { getGatewaySlug } from '../libs/ai-gateway';

function getGatewayConfig(env: { AI_GATEWAY_ACCOUNT_ID?: string; AI_GATEWAY_ID?: string }): GatewayConfig | undefined {
  if (env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ID) {
    return { accountId: env.AI_GATEWAY_ACCOUNT_ID, gatewayId: env.AI_GATEWAY_ID };
  }
  return undefined;
}
```

- [ ] **Step 2: Update handleChatCompletion — pass gateway to buildUpstreamUrl and buildProviderHeaders**

In `handleChatCompletion()`, around line 103-106, change:

```typescript
// Before:
const upstreamUrl = buildUpstreamUrl(provider, 'chat', { stream: body.stream });
const headers = buildProviderHeaders(provider);

// After:
const gateway = getGatewayConfig(c.env);
const viaGateway = !!gateway && !!getGatewaySlug(provider.providerName);
const upstreamUrl = buildUpstreamUrl(provider, 'chat', { stream: body.stream, gateway });
const headers = buildProviderHeaders(provider, { viaGateway });
```

- [ ] **Step 3: Update embeddings endpoint — pass gateway**

Around line 458-459:

```typescript
// Before:
const upstreamUrl = buildUpstreamUrl(provider, 'embedding');
const headers = buildProviderHeaders(provider);

// After:
const gateway = getGatewayConfig(c.env);
const viaGateway = !!gateway && !!getGatewaySlug(provider.providerName);
const upstreamUrl = buildUpstreamUrl(provider, 'embedding', { gateway });
const headers = buildProviderHeaders(provider, { viaGateway });
```

- [ ] **Step 4: Update images/generations endpoint — pass gateway**

Around line 518-519:

```typescript
const gateway = getGatewayConfig(c.env);
const viaGateway = !!gateway && !!getGatewaySlug(provider.providerName);
const upstreamUrl = buildUpstreamUrl(provider, 'image', { gateway });
const headers = buildProviderHeaders(provider, { viaGateway });
```

- [ ] **Step 5: Update Gemini native endpoint — pass gateway**

Around line 641-646, the Gemini native proxy currently builds its own URL. Add gateway support:

```typescript
// Before:
const baseUrl = provider.baseUrl.replace(/\/+$/, '');
const queryParams = isStream ? `alt=sse&key=${provider.apiKey}` : `key=${provider.apiKey}`;
const upstreamUrl = `${baseUrl}/models/${provider.modelName}:${method}?${queryParams}`;
// ...
const upstreamResponse = await fetch(upstreamUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});

// After:
const gateway = getGatewayConfig(c.env);
const viaGateway = !!gateway && !!getGatewaySlug(provider.providerName);
let upstreamUrl: string;
let fetchHeaders: Record<string, string>;
if (viaGateway && gateway) {
  const gwBase = `https://gateway.ai.cloudflare.com/v1/${gateway.accountId}/${gateway.gatewayId}/google-ai-studio`;
  const qs = isStream ? '?alt=sse' : '';
  upstreamUrl = `${gwBase}/v1/models/${provider.modelName}:${method}${qs}`;
  fetchHeaders = { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey };
} else {
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const queryParams = isStream ? `alt=sse&key=${provider.apiKey}` : `key=${provider.apiKey}`;
  upstreamUrl = `${baseUrl}/models/${provider.modelName}:${method}?${queryParams}`;
  fetchHeaders = { 'Content-Type': 'application/json' };
}
const upstreamResponse = await fetch(upstreamUrl, {
  method: 'POST',
  headers: fetchHeaders,
  body,
});
```

- [ ] **Step 6: Video endpoint — no gateway (direct only)**

Video endpoint (line 562-609) stays as-is. Gateway doesn't support video. No changes needed.

- [ ] **Step 7: Commit**

```bash
git add cloudflare/src/routes/v2.ts
git commit -m "feat(gateway): route v2 endpoints through AI Gateway when configured"
```

---

### Task 5: Add Gateway Response Metadata

**Files:**
- Modify: `cloudflare/src/routes/v2.ts` (response enrichment)

- [ ] **Step 1: Capture cf-aig-cache-status and cf-aig-step headers from upstream response**

In `handleChatCompletion()`, after `const upstreamResponse = await fetch(...)`, capture Gateway metadata:

```typescript
const gatewayMeta = viaGateway ? {
  cacheStatus: upstreamResponse.headers.get('cf-aig-cache-status'),
  step: upstreamResponse.headers.get('cf-aig-step'),
} : undefined;
```

- [ ] **Step 2: Include gateway metadata in recordModelCall**

Add to the metadata field in all `recordModelCall()` calls within handleChatCompletion:

```typescript
metadata: {
  ...(gatewayMeta && { gateway: gatewayMeta }),
},
```

- [ ] **Step 3: Include in non-streaming JSON response**

In the non-streaming response (around line 406), add:

```typescript
return c.json({
  ...responseData,
  modelWithProvider: `${provider.providerName}/${provider.modelName}`,
  ...(gatewayMeta?.cacheStatus && { _gateway: gatewayMeta }),
});
```

- [ ] **Step 4: Commit**

```bash
git add cloudflare/src/routes/v2.ts
git commit -m "feat(gateway): capture and record Gateway cache/step metadata"
```

---

### Task 6: Staging Verification

**Files:**
- Modify: `cloudflare/wrangler.toml` (set real gateway IDs)

**Prerequisite:** Create an AI Gateway in the Cloudflare Dashboard:
1. Go to AI > AI Gateway > Create Gateway
2. Name: `aigne-hub-staging`
3. Note the Account ID and Gateway ID

- [ ] **Step 1: Set gateway env vars in wrangler.toml staging**

```toml
[env.staging.vars]
ENVIRONMENT = "staging"
BASE_URL = "https://aigne-hub-staging.zhuzhuyule-779.workers.dev"
AI_GATEWAY_ACCOUNT_ID = "<your-cf-account-id>"
AI_GATEWAY_ID = "aigne-hub-staging"
```

- [ ] **Step 2: Deploy to staging**

Run: `cd cloudflare && npx wrangler deploy --env staging`

- [ ] **Step 3: Verify OpenAI chat (non-streaming)**

```bash
curl -X POST https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-gateway" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Say hello"}],"stream":false}'
```

Expected: 200 OK with response. Check for `_gateway.cacheStatus` in response.

- [ ] **Step 4: Verify OpenAI chat (streaming)**

```bash
curl -X POST https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-gateway" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Say hello"}],"stream":true}'
```

Expected: streaming text response, no errors.

- [ ] **Step 5: Verify Anthropic (non-streaming)**

```bash
curl -X POST https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-gateway" \
  -d '{"model":"anthropic/claude-haiku-4-5-20251001","messages":[{"role":"user","content":"Say hello"}],"stream":false}'
```

Expected: 200 OK, response converted to OpenAI format.

- [ ] **Step 6: Verify Gemini native (streaming)**

```bash
curl -X POST "https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/models/gemini-2.5-flash:streamGenerateContent" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say hello"}]}]}'
```

Expected: SSE stream with Gemini format.

- [ ] **Step 7: Verify doubao falls back to direct**

```bash
curl -X POST https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-gateway" \
  -d '{"model":"doubao/doubao-1-5-pro-256k","messages":[{"role":"user","content":"Say hello"}],"stream":false}'
```

Expected: 200 OK (direct connection, no gateway).

- [ ] **Step 8: Check Gateway Dashboard**

Go to CF Dashboard > AI > AI Gateway > aigne-hub-staging.
Expected: See the requests from steps 3-6 logged. Doubao should NOT appear (direct).

- [ ] **Step 9: Commit verified config**

```bash
git add cloudflare/wrangler.toml
git commit -m "feat(gateway): configure staging AI Gateway"
```

---

### Task 7: Embedding Cache Verification

**Files:** None (configuration only)

- [ ] **Step 1: Send identical embedding request twice**

```bash
# First request
curl -X POST https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/embeddings \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-cache" \
  -d '{"model":"openai/text-embedding-3-small","input":"Hello world"}'

# Second request (identical)
curl -X POST https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/embeddings \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-cache" \
  -d '{"model":"openai/text-embedding-3-small","input":"Hello world"}'
```

- [ ] **Step 2: Check Gateway Dashboard for cache HIT on second request**

Expected: First request = MISS, second request = HIT (if caching enabled on gateway).

- [ ] **Step 3: Document cache behavior in staging results**

Record: whether cache works for embeddings, observed latency difference, any issues.
