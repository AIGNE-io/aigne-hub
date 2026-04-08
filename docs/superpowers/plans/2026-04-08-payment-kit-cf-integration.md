# Payment Kit CF Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Payment Kit into aigne-hub's Cloudflare Worker via Service Binding — gateway proxy for frontend pages + backend API client for credit/metering operations.

**Architecture:** aigne-hub acts as gateway, proxying `/payment/*` to Payment Kit Worker (strip prefix + HTML rewrite), and calling Payment Kit API internally via `PaymentClient` for credit checks and meter events. Auth is transparent — same `login_token` cookie works across both Workers via shared AUTH_SERVICE.

**Tech Stack:** Hono (routing), Cloudflare Service Binding (inter-Worker communication), D1 (local credit cache fallback)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `cloudflare/wrangler.toml` | Modify | Add `PAYMENT_KIT` Service Binding |
| `cloudflare/src/worker.ts` | Modify | Add `PAYMENT_KIT` to Env type, mount gateway routes, inject PaymentClient middleware |
| `cloudflare/src/libs/payment.ts` | Create | PaymentClient class — HTTP wrapper for Payment Kit API |
| `cloudflare/src/routes/payment.ts` | Modify | Replace local grant with PaymentClient calls |
| `cloudflare/src/routes/v2.ts` | Modify | Replace preDeduct/settle/refund with PaymentClient meter events |
| `cloudflare/src/routes/user.ts` | Modify | Replace getCreditBalance/getTransactions with PaymentClient |
| `cloudflare/src/routes/usage.ts` | Modify | Replace getCreditBalance with PaymentClient |

---

### Task 1: Add PAYMENT_KIT Service Binding

**Files:**
- Modify: `cloudflare/wrangler.toml`
- Modify: `cloudflare/src/worker.ts:31-51` (Env type)

- [ ] **Step 1: Add Service Binding to wrangler.toml**

Add after the existing `[[services]]` block for BLOCKLET_SERVICE:

```toml
[[services]]
binding = "PAYMENT_KIT"
service = "payment-kit-staging"
```

Also add to `[env.production]` section (use production service name when ready):

```toml
[[env.production.services]]
binding = "PAYMENT_KIT"
service = "payment-kit"
```

- [ ] **Step 2: Add PAYMENT_KIT to Env type**

In `cloudflare/src/worker.ts`, add to the `Env` type (after `ASSETS`):

```typescript
PAYMENT_KIT?: { fetch: (req: Request | string) => Promise<Response> };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add cloudflare/wrangler.toml cloudflare/src/worker.ts
git commit -m "feat(cloudflare): add PAYMENT_KIT service binding"
```

---

### Task 2: Create PaymentClient

**Files:**
- Create: `cloudflare/src/libs/payment.ts`

- [ ] **Step 1: Create PaymentClient class**

Create `cloudflare/src/libs/payment.ts`:

```typescript
import { logger } from './logger';

type PaymentKitBinding = { fetch: (req: Request | string) => Promise<Response> };

export class PaymentClient {
  constructor(
    private service: PaymentKitBinding,
    private authHeaders: Headers
  ) {}

  private async request(path: string, init?: RequestInit): Promise<any> {
    const headers = new Headers(this.authHeaders);
    headers.set('Content-Type', 'application/json');
    const url = `https://internal${path}`;
    const resp = await this.service.fetch(
      new Request(url, { ...init, headers })
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.error('Payment Kit request failed', { path, status: resp.status, body: text.substring(0, 200) });
      throw new Error(`Payment Kit ${path}: ${resp.status} ${text.substring(0, 200)}`);
    }
    return resp.json();
  }

  private async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET' });
  }

  private async post(path: string, data: unknown): Promise<any> {
    return this.request(path, { method: 'POST', body: JSON.stringify(data) });
  }

  private async put(path: string, data: unknown): Promise<any> {
    return this.request(path, { method: 'PUT', body: JSON.stringify(data) });
  }

  // --- Meters ---

  async getMeter(eventName: string) {
    return this.get(`/api/meters/${encodeURIComponent(eventName)}?livemode=true`);
  }

  async createMeter(data: {
    name: string;
    event_name: string;
    unit: string;
    aggregation_method: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post('/api/meters', { ...data, livemode: true });
  }

  async updateMeter(id: string, data: Record<string, unknown>) {
    return this.put(`/api/meters/${encodeURIComponent(id)}`, { ...data, livemode: true });
  }

  // --- Customers ---

  async ensureCustomer(did: string) {
    return this.get(`/api/customers/${encodeURIComponent(did)}?create=true&livemode=true`);
  }

  // --- Meter Events ---

  async createMeterEvent(payload: {
    event_name: string;
    timestamp: number;
    payload: { customer_id: string; value: string };
    identifier: string;
    metadata?: Record<string, unknown>;
    source_data?: Record<string, unknown>;
  }) {
    return this.post('/api/meter-events', { ...payload, livemode: true });
  }

  async getPendingAmount(customerId: string) {
    return this.get(`/api/meter-events/pending-amount?customer_id=${encodeURIComponent(customerId)}&livemode=true`);
  }

  // --- Credit Grants ---

  async getCreditSummary(customerId: string) {
    return this.get(`/api/credit-grants/summary?customer_id=${encodeURIComponent(customerId)}&livemode=true`);
  }

  async verifyAvailability(params: {
    customer_id: string;
    currency_id: string;
    pending_amount?: string;
  }) {
    const qs = new URLSearchParams({ ...params, livemode: 'true' } as Record<string, string>).toString();
    return this.get(`/api/credit-grants/verify-availability?${qs}`);
  }

  async getCreditGrants(params: {
    customer_id: string;
    currency_id?: string;
    page?: number;
    pageSize?: number;
  }) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ ...params, livemode: true }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    ).toString();
    return this.get(`/api/credit-grants?${qs}`);
  }

  // --- Credit Transactions ---

  async getCreditTransactions(params: {
    customer_id: string;
    meter_id?: string;
    page?: number;
    pageSize?: number;
  }) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ ...params, livemode: true }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    ).toString();
    return this.get(`/api/credit-transactions?${qs}`);
  }

  // --- Payment Currencies ---

  async getPaymentCurrencies() {
    return this.get('/api/payment-currencies?livemode=true');
  }

  async updatePaymentCurrency(id: string, data: Record<string, unknown>) {
    return this.put(`/api/payment-currencies/${encodeURIComponent(id)}`, { ...data, livemode: true });
  }

  async getRechargeConfig(currencyId: string) {
    return this.get(`/api/payment-currencies/${encodeURIComponent(currencyId)}/recharge-config?livemode=true`);
  }

  async updateRechargeConfig(currencyId: string, data: Record<string, unknown>) {
    return this.put(`/api/payment-currencies/${encodeURIComponent(currencyId)}/recharge-config`, { ...data, livemode: true });
  }

  // --- Products & Prices ---

  async createProduct(data: Record<string, unknown>) {
    return this.post('/api/products', { ...data, livemode: true });
  }

  async getPrice(lookupKey: string) {
    return this.get(`/api/prices/${encodeURIComponent(lookupKey)}?livemode=true`);
  }

  // --- Payment Links ---

  async createPaymentLink(data: Record<string, unknown>) {
    return this.post('/api/payment-links', { ...data, livemode: true });
  }

  async getPaymentLink(lookupKey: string) {
    return this.get(`/api/payment-links/${encodeURIComponent(lookupKey)}?livemode=true`);
  }

  // --- Settings ---

  async getSettings(mountLocation: string) {
    return this.get(`/api/settings/${encodeURIComponent(mountLocation)}?livemode=true`);
  }

  async createSettings(data: Record<string, unknown>) {
    return this.post('/api/settings', { ...data, livemode: true });
  }

  async updateSettings(id: string, data: Record<string, unknown>) {
    return this.put(`/api/settings/${encodeURIComponent(id)}`, { ...data, livemode: true });
  }
}

// --- Meter cache (module-level, 24h TTL like blocklet version) ---

const METER_NAME = 'agent-hub-ai-meter';
const METER_UNIT = 'AIGNE Hub Credits';
const METER_CACHE_TTL = 24 * 60 * 60 * 1000;

let meterCache: { meter: any; timestamp: number } | null = null;

export function clearMeterCache() {
  meterCache = null;
}

export async function ensureMeter(payment: PaymentClient): Promise<any> {
  if (meterCache && Date.now() - meterCache.timestamp < METER_CACHE_TTL) {
    return meterCache.meter;
  }

  try {
    const meter = await payment.getMeter(METER_NAME);
    if (meter && meter.unit !== METER_UNIT) {
      await payment.updateMeter(meter.id, { unit: METER_UNIT });
    }
    meterCache = { meter, timestamp: Date.now() };
    return meter;
  } catch {
    // Meter doesn't exist, create it
    const meter = await payment.createMeter({
      name: 'AIGNE Hub AI Meter',
      event_name: METER_NAME,
      unit: METER_UNIT,
      aggregation_method: 'sum',
    });
    meterCache = { meter, timestamp: Date.now() };
    return meter;
  }
}

/**
 * Create a PaymentClient from request context.
 * Passes through the user's Cookie and Authorization headers.
 */
export function createPaymentClient(
  service: PaymentKitBinding,
  req: { header: (name: string) => string | undefined }
): PaymentClient {
  const headers = new Headers();
  const cookie = req.header('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  const auth = req.header('Authorization');
  if (auth) headers.set('Authorization', auth);
  return new PaymentClient(service, headers);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add cloudflare/src/libs/payment.ts
git commit -m "feat(cloudflare): add PaymentClient for Payment Kit Service Binding"
```

---

### Task 3: Add Gateway Routes (mount point proxy)

**Files:**
- Modify: `cloudflare/src/worker.ts:147-159` (after `/.well-known/service/*` routes, before D1 setup)

- [ ] **Step 1: Add gateway routes to worker.ts**

In `worker.ts`, add these routes AFTER the `/.well-known/service/*` and `/__blocklet__/*` blocks (line ~159) and BEFORE the D1 setup middleware (line ~162):

```typescript
// --- Payment Kit gateway: /payment/* → PAYMENT_KIT (strip prefix + HTML rewrite) ---
app.all('/payment/*', async (c) => {
  if (!c.env.PAYMENT_KIT) return c.json({ error: 'PAYMENT_KIT not configured' }, 503);

  const url = new URL(c.req.url);
  const path = url.pathname;

  // Strip prefix: /payment/api/products → /api/products
  const targetPath = path.slice('/payment'.length) || '/';
  const targetUrl = new URL(targetPath + url.search, url.origin);

  const headers = new Headers(c.req.raw.headers);
  headers.set('X-Mount-Prefix', '/payment/');

  const resp = await c.env.PAYMENT_KIT.fetch(
    new Request(targetUrl.href, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
    })
  );

  // HTML response: rewrite asset paths and frontend prefix
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    let html = await resp.text();
    html = html.replace(/(src=["'])\/assets\//g, '$1/payment/assets/');
    html = html.replace(/(href=["'])\/assets\//g, '$1/payment/assets/');
    html = html.replace('src="/__blocklet__.js"', 'src="/payment/__blocklet__.js"');
    html = html.replace(/prefix:\s*'\/'/g, "prefix: '/payment/'");
    return new Response(html, {
      status: resp.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  });
});
// Also handle /payment without trailing slash
app.get('/payment', (c) => c.redirect('/payment/', 302));

// --- Media Kit passthrough: /media-kit/* → PAYMENT_KIT ---
app.all('/media-kit/*', async (c) => {
  if (!c.env.PAYMENT_KIT) return c.json({ error: 'PAYMENT_KIT not configured' }, 503);
  const resp = await c.env.PAYMENT_KIT.fetch(c.req.raw);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  });
});
```

- [ ] **Step 2: Add lost-prefix redirect in notFound handler**

In `worker.ts`, modify the `app.notFound` handler (currently at line ~294). Add a redirect check BEFORE the existing logic:

```typescript
app.notFound(async (c) => {
  // Redirect lost Payment Kit prefixes (e.g. /customer → /payment/customer)
  const PAYMENT_KIT_ROUTES = ['/admin', '/customer', '/integrations', '/checkout'];
  const path = new URL(c.req.url).pathname;
  if (c.env.PAYMENT_KIT && PAYMENT_KIT_ROUTES.some((r) => path.startsWith(r))) {
    const url = new URL(c.req.url);
    return c.redirect(`/payment${path}${url.search}`, 302);
  }

  // API routes return JSON 404
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) {
    return c.json({ error: 'Not Found' }, 404);
  }
  // For non-API routes, serve SPA index.html via ASSETS binding
  if (c.env.ASSETS) {
    try {
      const asset = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
      return new Response(asset.body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    } catch {
      // ASSETS fetch failed
    }
  }
  return c.json({ error: 'Not Found' }, 404);
});
```

- [ ] **Step 3: Add X-External-Tabs for DID admin pages**

In `worker.ts`, modify the existing `/.well-known/service/*` handler (line ~148) to inject billing tab:

```typescript
app.all('/.well-known/service/*', async (c) => {
  if (!c.env.BLOCKLET_SERVICE || !cachedInstanceDid) {
    return c.json({ error: 'Blocklet service not configured' }, 503);
  }
  const req = withInstanceHeader(c.req.raw, cachedInstanceDid);

  // Inject billing tab into DID admin/user pages
  if (c.env.PAYMENT_KIT) {
    const path = new URL(c.req.url).pathname;
    if (path === '/.well-known/service/user' || path === '/.well-known/service/admin') {
      const locale = (c.req.header('Accept-Language') || '').startsWith('zh') ? 'zh' : 'en';
      const headers = new Headers(req.headers);
      headers.set('X-External-Tabs', JSON.stringify([
        { id: 'billing', label: locale === 'zh' ? '账单' : 'Billing', url: `/payment/customer?locale=${locale}` },
      ]));
      return c.env.BLOCKLET_SERVICE.fetch(new Request(req.url, {
        method: req.method,
        headers,
        body: req.body,
        redirect: 'manual',
      }));
    }
  }

  return c.env.BLOCKLET_SERVICE.fetch(req);
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add cloudflare/src/worker.ts
git commit -m "feat(cloudflare): add Payment Kit gateway proxy and media-kit passthrough"
```

---

### Task 4: Add PaymentClient Middleware

**Files:**
- Modify: `cloudflare/src/worker.ts:90-96` (Variables type + middleware)

- [ ] **Step 1: Import PaymentClient and update Variables type**

In `worker.ts`, add import at top:

```typescript
import { PaymentClient, createPaymentClient } from './libs/payment';
```

Update the `Variables` type:

```typescript
export type Variables = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  user?: AppUser;
  executionCtx?: ExecutionContext;
  payment?: PaymentClient;
};
```

- [ ] **Step 2: Add middleware to inject PaymentClient**

In `worker.ts`, add after the `loadUser` middleware (line ~172) and before the health check route:

```typescript
// Inject PaymentClient for API routes when PAYMENT_KIT binding is available
app.use('/api/*', async (c, next) => {
  if (c.env.PAYMENT_KIT) {
    c.set('payment', createPaymentClient(c.env.PAYMENT_KIT, c.req));
  }
  await next();
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add cloudflare/src/worker.ts
git commit -m "feat(cloudflare): inject PaymentClient middleware for API routes"
```

---

### Task 5: Replace Credit Operations in v2 Routes

**Files:**
- Modify: `cloudflare/src/routes/v2.ts`

This is the most critical change — replacing the local preDeduct/settle/refund pattern with Payment Kit meter events.

The key insight: Payment Kit's `createMeterEvent` is atomic. Instead of pre-deduct → call → settle/refund, we:
1. Check balance before the call (using PaymentClient)
2. Make the AI call
3. Record actual usage via `createMeterEvent` after the call

- [ ] **Step 1: Replace imports**

In `v2.ts`, replace line 18:

```typescript
// Old:
// import { deductCredits, preDeductCredits, refundHold, settleCredits } from '../libs/credit';

// New:
import { ensureMeter, type PaymentClient } from '../libs/payment';
import { getCreditBalance } from '../libs/credit';
```

We keep `getCreditBalance` from the local credit system as a fast-path fallback for when `PAYMENT_KIT` is not bound.

- [ ] **Step 2: Add helper to check balance and record usage**

Add after the imports, before the routes:

```typescript
/** Check if user has sufficient credits. Returns false if insufficient. */
async function checkCredits(
  c: Context<HonoEnv>,
  userDid: string
): Promise<{ ok: true } | { ok: false; balance: number }> {
  const payment = c.get('payment') as PaymentClient | undefined;
  if (payment) {
    try {
      const meter = await ensureMeter(payment);
      if (!meter) return { ok: true }; // No meter = no billing
      const customer = await payment.ensureCustomer(userDid);
      const [summary, pending] = await Promise.all([
        payment.getCreditSummary(customer.id),
        payment.getPendingAmount(customer.id),
      ]);
      const currencyId = meter.currency_id;
      const balance = parseFloat(summary?.[currencyId]?.remainingAmount ?? '0');
      const pendingAmount = parseFloat(pending?.[currencyId] ?? '0');
      const netBalance = Math.max(0, balance - pendingAmount);
      if (netBalance <= 0) {
        // Check auto-recharge availability
        try {
          const result = await payment.verifyAvailability({
            customer_id: customer.id,
            currency_id: currencyId,
            pending_amount: String(pendingAmount),
          });
          if (result.can_continue) return { ok: true };
        } catch { /* verification failed, treat as insufficient */ }
        return { ok: false, balance: netBalance };
      }
      return { ok: true };
    } catch (err) {
      logger.error('Payment Kit credit check failed, allowing request', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: true }; // Fail open
    }
  }
  // Fallback: local D1 credit check
  const db = c.get('db');
  const local = await getCreditBalance(db, userDid);
  if (local.balance <= 0) return { ok: false, balance: local.balance };
  return { ok: true };
}

/** Record usage via Payment Kit meter event (fire-and-forget). */
async function recordCreditUsage(
  payment: PaymentClient,
  userDid: string,
  credits: number,
  meta: { model: string; requestId?: string }
): Promise<void> {
  if (credits <= 0) return;
  try {
    const meter = await ensureMeter(payment);
    if (!meter) return;
    await payment.createMeterEvent({
      event_name: meter.event_name,
      timestamp: Math.floor(Date.now() / 1000),
      payload: { customer_id: userDid, value: String(credits) },
      identifier: `${userDid}-${meter.event_name}-${Date.now()}`,
      metadata: { model: meta.model, requestId: meta.requestId },
    });
  } catch (err) {
    logger.error('Failed to record meter event', {
      error: err instanceof Error ? err.message : String(err),
      userDid,
      credits,
    });
  }
}
```

- [ ] **Step 3: Replace pre-deduct logic in handleChatCompletion**

In `handleChatCompletion`, replace the pre-deduction block (lines ~91-108). Remove `holdAmount` variable and replace with a simple balance check:

Replace:
```typescript
  // Pre-deduct estimated credits
  let holdAmount = 0;
  if (userDid) {
    // Rough estimate: ~4 chars per token for input, use max_tokens for output
    const estimatedInputTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const maxOutputTokens = body.max_tokens || 4096;
    const estimatedCredits = await estimateMaxCredits(db, provider.providerId, provider.modelName, {
      estimatedInputTokens,
      maxOutputTokens,
    });

    if (estimatedCredits > 0) {
      const hold = await preDeductCredits(db, userDid, estimatedCredits, { model: provider.modelName }, c.env.AUTH_KV);
      if (!hold.success) {
        return c.json({ error: { message: 'Insufficient credits', balance: hold.balance } }, 402);
      }
      holdAmount = hold.holdAmount;
    }
  }
```

With:
```typescript
  // Check credits before making the call
  if (userDid) {
    const creditCheck = await checkCredits(c, userDid);
    if (!creditCheck.ok) {
      return c.json({ error: { message: 'Insufficient credits', balance: creditCheck.balance } }, 402);
    }
  }
```

- [ ] **Step 4: Replace settle/refund calls with meter events**

In `handleChatCompletion`, find all `settleCredits` and `refundHold` calls and replace them.

For streaming settle (around line ~391):
Replace:
```typescript
        if (userDid && holdAmount > 0) {
          const settlePromise = settleCredits(db, userDid, holdAmount, credits, {
            model: provider.modelName,
          }, c.env.AUTH_KV);
          if (waitUntil) waitUntil(settlePromise);
          else await settlePromise;
        }
```
With:
```typescript
        if (userDid && credits > 0) {
          const payment = c.get('payment') as PaymentClient | undefined;
          if (payment) {
            const meterPromise = recordCreditUsage(payment, userDid, credits, { model: provider.modelName, requestId });
            if (waitUntil) waitUntil(meterPromise);
            else await meterPromise;
          }
        }
```

For non-streaming settle (around line ~445):
Replace:
```typescript
    if (userDid && holdAmount > 0) {
      const settlePromise = settleCredits(db, userDid, holdAmount, credits, {
        model: provider.modelName,
      }, c.env.AUTH_KV);
      if (waitUntil) waitUntil(settlePromise);
      else await settlePromise;
    }
```
With:
```typescript
    if (userDid && credits > 0) {
      const payment = c.get('payment') as PaymentClient | undefined;
      if (payment) {
        const meterPromise = recordCreditUsage(payment, userDid, credits, { model: provider.modelName, requestId });
        if (waitUntil) waitUntil(meterPromise);
        else await meterPromise;
      }
    }
```

For error refund (around line ~480):
Replace:
```typescript
    if (userDid && holdAmount > 0) {
      const refundPromise = refundHold(db, userDid, holdAmount, c.env.AUTH_KV);
      if (waitUntil) waitUntil(refundPromise);
      else await refundPromise;
    }
```
With:
```typescript
    // No refund needed — meter event only created on success
```

For stream error refund (around line ~167):
Replace:
```typescript
      waitUntil?.(refundHold(db, userDid, holdAmount, c.env.AUTH_KV));
```
With:
```typescript
      // No refund needed — meter event only created on success
```

Also for the other refund around line ~226:
Replace:
```typescript
          const refundPromise = refundHold(db, userDid, holdAmount, c.env.AUTH_KV);
```
With:
```typescript
          // No refund needed — meter event only created on success
```

- [ ] **Step 5: Replace deductCredits in embeddings and image endpoints**

For embeddings (around line ~563):
Replace:
```typescript
    await deductCredits(db, userDid, credits, { model: provider.modelName });
```
With:
```typescript
    const payment = c.get('payment') as PaymentClient | undefined;
    if (payment) {
      await recordCreditUsage(payment, userDid, credits, { model: provider.modelName });
    }
```

For image generation (around line ~640):
Same replacement pattern as embeddings.

- [ ] **Step 6: Remove unused imports**

Remove `estimateMaxCredits` from the ai-proxy import if it's no longer used. Remove `preDeductCredits`, `refundHold`, `settleCredits`, `deductCredits` import (already replaced in Step 1). Keep `getCreditBalance` import for fallback.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 8: Commit**

```bash
git add cloudflare/src/routes/v2.ts
git commit -m "feat(cloudflare): replace local credit ops with Payment Kit meter events in v2 routes"
```

---

### Task 6: Replace Credit Operations in User and Usage Routes

**Files:**
- Modify: `cloudflare/src/routes/user.ts`
- Modify: `cloudflare/src/routes/usage.ts`

- [ ] **Step 1: Update user.ts credit balance endpoint**

In `user.ts`, add import:

```typescript
import { ensureMeter, type PaymentClient } from '../libs/payment';
```

Replace the `/credit/balance` handler. Find:
```typescript
const balance = await getCreditBalance(db, userDid);
```
Replace with:
```typescript
    const payment = c.get('payment') as PaymentClient | undefined;
    let balance;
    if (payment) {
      try {
        const meter = await ensureMeter(payment);
        const customer = await payment.ensureCustomer(userDid);
        const [summary, pending] = await Promise.all([
          payment.getCreditSummary(customer.id),
          payment.getPendingAmount(customer.id),
        ]);
        const currencyId = meter?.currency_id;
        const remainingAmount = parseFloat(summary?.[currencyId]?.remainingAmount ?? '0');
        const pendingAmount = parseFloat(pending?.[currencyId] ?? '0');
        balance = {
          balance: Math.max(0, remainingAmount - pendingAmount),
          total: parseFloat(summary?.[currencyId]?.totalAmount ?? '0'),
          used: 0,
          grantCount: summary?.[currencyId]?.grantCount ?? 0,
          pendingCredit: pendingAmount,
        };
      } catch {
        balance = await getCreditBalance(db, userDid);
      }
    } else {
      balance = await getCreditBalance(db, userDid);
    }
```

- [ ] **Step 2: Update user.ts credit grants and transactions endpoints**

Replace the `/credit/grants` handler body with:
```typescript
    const payment = c.get('payment') as PaymentClient | undefined;
    if (payment) {
      try {
        const customer = await payment.ensureCustomer(userDid);
        const meter = await ensureMeter(payment);
        const result = await payment.getCreditGrants({
          customer_id: customer.id,
          currency_id: meter?.currency_id,
          page,
          pageSize,
        });
        return c.json(result);
      } catch { /* fall through to local */ }
    }
    return c.json(await getTransactions(db, userDid, { page, pageSize, type: 'grant' }));
```

Replace the `/credit/transactions` handler body with:
```typescript
    const payment = c.get('payment') as PaymentClient | undefined;
    if (payment) {
      try {
        const customer = await payment.ensureCustomer(userDid);
        const meter = await ensureMeter(payment);
        const result = await payment.getCreditTransactions({
          customer_id: customer.id,
          meter_id: meter?.id,
          page,
          pageSize,
        });
        return c.json(result);
      } catch { /* fall through to local */ }
    }
    return c.json(await getTransactions(db, userDid, { page, pageSize }));
```

- [ ] **Step 3: Update user.ts /info endpoint balance**

Find the `getCreditBalance(db, did)` call in the `/info` endpoint and wrap with fallback:

```typescript
    const payment = c.get('payment') as PaymentClient | undefined;
    let creditBalance;
    if (payment) {
      try {
        const customer = await payment.ensureCustomer(did);
        const meter = await ensureMeter(payment);
        const summary = await payment.getCreditSummary(customer.id);
        const currencyId = meter?.currency_id;
        creditBalance = {
          balance: parseFloat(summary?.[currencyId]?.remainingAmount ?? '0'),
          total: parseFloat(summary?.[currencyId]?.totalAmount ?? '0'),
          used: 0,
          grantCount: summary?.[currencyId]?.grantCount ?? 0,
          pendingCredit: '0',
        };
      } catch {
        creditBalance = await getCreditBalance(db, did);
      }
    } else {
      creditBalance = await getCreditBalance(db, did);
    }
```

- [ ] **Step 4: Update usage.ts**

In `usage.ts`, add import:
```typescript
import { ensureMeter, type PaymentClient } from '../libs/payment';
```

Replace the `getCreditBalance` call with the same fallback pattern:
```typescript
    const payment = c.get('payment') as PaymentClient | undefined;
    let creditBalance;
    if (payment) {
      try {
        const customer = await payment.ensureCustomer(userDid || 'anonymous');
        const meter = await ensureMeter(payment);
        const summary = await payment.getCreditSummary(customer.id);
        const currencyId = meter?.currency_id;
        creditBalance = {
          balance: parseFloat(summary?.[currencyId]?.remainingAmount ?? '0'),
          total: 0,
          used: 0,
          grantCount: 0,
          pendingCredit: 0,
        };
      } catch {
        creditBalance = await getCreditBalance(db, userDid || 'anonymous');
      }
    } else {
      creditBalance = await getCreditBalance(db, userDid || 'anonymous');
    }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add cloudflare/src/routes/user.ts cloudflare/src/routes/usage.ts
git commit -m "feat(cloudflare): replace local credit queries with Payment Kit in user/usage routes"
```

---

### Task 7: Update Payment Routes

**Files:**
- Modify: `cloudflare/src/routes/payment.ts`

- [ ] **Step 1: Replace admin grant with PaymentClient**

Replace the entire `payment.ts` file:

```typescript
import type { Context } from 'hono';
import { Hono } from 'hono';

import { grantCredits } from '../libs/credit';
import { type PaymentClient } from '../libs/payment';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

function isAdminUser(c: Context<HonoEnv>): boolean {
  if (c.env.ENVIRONMENT !== 'production') return true;
  const user = c.get('user') as { role?: string } | undefined;
  const role = user?.role || c.req.header('x-user-role');
  return role === 'admin' || role === 'owner';
}

// POST /api/payment/grant - Admin grant credits to a user
routes.post('/grant', async (c) => {
  if (!isAdminUser(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json<{
    userDid: string;
    amount: number;
    description?: string;
  }>();

  if (!body.userDid || !body.amount || body.amount <= 0) {
    return c.json({ error: 'userDid and positive amount are required' }, 400);
  }

  // Use local D1 fallback — admin grants go through Payment Kit's own UI at /payment/admin
  const db = c.get('db');
  const result = await grantCredits(db, body.userDid, body.amount, {
    source: 'admin',
    description: body.description || `Admin grant: ${body.amount} credits`,
  });

  return c.json({ success: true, balance: result.balance });
});

// Proxy all other payment routes to Payment Kit
routes.all('/*', async (c) => {
  const payment = c.get('payment') as PaymentClient | undefined;
  if (!payment) {
    // Fallback: proxy to Blocklet Server if configured
    const origin = c.env.BLOCKLET_SERVER_ORIGIN;
    if (!origin) {
      return c.json({ error: 'Payment service not configured' }, 503);
    }
    const url = new URL(c.req.url);
    const targetUrl = `${origin}${url.pathname}${url.search}`;
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
        signal: AbortSignal.timeout(15000),
      });
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('transfer-encoding');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch {
      return c.json({ error: 'Payment service unavailable' }, 502);
    }
  }

  return c.json({ error: 'Use /payment/* gateway for Payment Kit operations' }, 404);
});

export default routes;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cloudflare && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add cloudflare/src/routes/payment.ts
git commit -m "feat(cloudflare): update payment routes to use PaymentClient with D1 fallback"
```

---

### Task 8: Deploy and Verify

**Files:**
- No file changes — deployment and manual verification

- [ ] **Step 1: Build and deploy**

```bash
cd cloudflare && npx wrangler deploy
```

Expected: Successful deployment with `PAYMENT_KIT` binding shown in output.

- [ ] **Step 2: Verify health**

```bash
curl https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/health
```

Expected: `{"status":"healthy",...}`

- [ ] **Step 3: Verify Payment Kit gateway**

```bash
curl https://aigne-hub-staging.zhuzhuyule-779.workers.dev/payment/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Verify Payment Kit admin page**

Open in browser: `https://aigne-hub-staging.zhuzhuyule-779.workers.dev/payment/admin`

Expected: Payment Kit admin UI loads (may require login)

- [ ] **Step 5: Verify lost-prefix redirect**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://aigne-hub-staging.zhuzhuyule-779.workers.dev/customer
```

Expected: `302` redirect to `/payment/customer`

- [ ] **Step 6: Commit deploy verification notes**

```bash
git add -A
git commit -m "chore(cloudflare): payment kit integration deployment verified"
```
