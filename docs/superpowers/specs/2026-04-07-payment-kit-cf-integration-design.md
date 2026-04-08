# Payment Kit Cloudflare Workers Integration Design

## Overview

Integrate Payment Kit into aigne-hub's Cloudflare Worker via Service Binding, adopting the official mount point gateway pattern. This covers two layers:

1. **Gateway layer** — proxy Payment Kit's frontend pages and API under `/payment/*` mount point
2. **Backend API layer** — aigne-hub's own code calls Payment Kit API via Service Binding for credit/metering operations

## Context

### Current State

- **aigne-hub CF Worker** uses a local D1-based credit system (`libs/credit.ts`) with `creditAccounts` and `creditTransactions` tables
- **Payment Kit CF Worker** (`feat/cf-workers-migration` branch) is a fully migrated Hono + D1 Worker with Express route compatibility shims
- Both services share the same `AUTH_SERVICE` (blocklet-service) for identity resolution via `resolveIdentity(jwt, authHeader, instanceDid)`
- Users authenticate once; the same JWT/cookie is valid across both services (unified login)

### Reference

- Official integration guide from Payment Kit team (叶小芳): `CF Workers: AIGNE Hub 集成 Payment Kit 指南`
- Payment Kit test environment: `payment-kit-migration-test.yexiaofang.workers.dev`

## Architecture

```
User Request (with login_token cookie)
    |
    v
aigne-hub Worker (Gateway)
    |
    |-- /.well-known/service/*  → AUTH_SERVICE (login/session/branding)
    |-- /payment/*              → PAYMENT_KIT (strip prefix, HTML rewrite)
    |-- /media-kit/*            → PAYMENT_KIT (passthrough, PK proxies to Media Kit internally)
    |-- /api/*                  → aigne-hub own routes (can call PAYMENT_KIT.fetch internally)
    |-- /*                      → aigne-hub frontend assets
```

Three Workers connected via Service Binding:

```
aigne-hub ──PAYMENT_KIT──> Payment Kit ──AUTH_SERVICE──> blocklet-service (DID)
           ──AUTH_SERVICE──> blocklet-service (DID)       ──MEDIA_KIT──> Media Kit
```

### Authentication Flow

No extra auth code needed. Cookie passthrough handles everything:

```
Browser cookie (login_token)
  → Gateway forwards (cookie on same domain, auto-attached)
  → Payment Kit caller middleware
  → AUTH_SERVICE.resolveIdentity(jwt)
  → returns { did, role, displayName }
  → injected into Express req.user
  → route-level permission checks
```

## Part 1: Gateway Layer (Mount Point Proxy)

### 1.1 wrangler.toml — Service Bindings

```toml
[[services]]
binding = "PAYMENT_KIT"
service = "payment-kit"

# AUTH_SERVICE already exists
```

Add to `Env` type in `worker.ts`:

```typescript
PAYMENT_KIT?: { fetch: (req: Request | string) => Promise<Response> };
```

### 1.2 Mount Point Configuration

```typescript
interface MountPoint { prefix: string; binding: keyof Env }
const MOUNT_POINTS: MountPoint[] = [
  { prefix: '/payment/', binding: 'PAYMENT_KIT' },
];

// Payment Kit known frontend route prefixes (for redirect fallback)
const PAYMENT_KIT_ROUTES = ['/admin', '/customer', '/integrations', '/checkout'];
```

### 1.3 Route Priority in worker.ts

Integrate into existing Hono app, before aigne-hub's own routes:

```
1. /.well-known/service/*  → AUTH_SERVICE (already exists)
2. /payment/*              → PAYMENT_KIT (strip prefix + HTML rewrite) [NEW]
3. /media-kit/*            → PAYMENT_KIT (passthrough) [NEW]
4. /api/*                  → aigne-hub own API routes (existing)
5. /*                      → aigne-hub frontend assets (existing)
6. fallback                → redirect lost-prefix requests to /payment/* [NEW]
```

### 1.4 Mount Point Proxy (core logic)

```typescript
// /payment/api/products → strip prefix → /api/products
// /payment/admin → strip prefix → /admin
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
      body: c.req.raw.body,
    })
  );

  // HTML response: rewrite asset paths and frontend prefix
  if (resp.headers.get('content-type')?.includes('text/html')) {
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
```

### 1.5 Media Kit Passthrough

```typescript
// /media-kit/* → PAYMENT_KIT (no prefix stripping, PK handles internally)
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

### 1.6 Lost-Prefix Redirect

Frontend frameworks sometimes navigate to `/customer` instead of `/payment/customer`:

```typescript
// After all other routes, before 404
app.all('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (PAYMENT_KIT_ROUTES.some(r => path.startsWith(r))) {
    const url = new URL(c.req.url);
    return c.redirect(`/payment${path}${url.search}`, 302);
  }
  // ... existing 404 handling
});
```

### 1.7 DID Admin Page Integration (optional)

Inject "Billing" tab into DID admin/user pages:

```typescript
// In existing AUTH_SERVICE proxy for /.well-known/service/*
if (path === '/.well-known/service/user' || path === '/.well-known/service/admin') {
  const locale = (c.req.header('Accept-Language') || '').startsWith('zh') ? 'zh' : 'en';
  headers.set('X-External-Tabs', JSON.stringify([
    { id: 'billing', label: locale === 'zh' ? '账单' : 'Billing', url: '/payment/customer?locale=' + locale },
  ]));
}
```

## Part 2: Backend API Layer (PaymentClient)

### 2.1 `cloudflare/src/libs/payment.ts` — PaymentClient

A lightweight HTTP client wrapping `PAYMENT_KIT.fetch()` for aigne-hub's own backend calls (credit check, meter events, etc.).

```typescript
type PaymentKitBinding = { fetch: (req: Request | string) => Promise<Response> };

export class PaymentClient {
  constructor(
    private service: PaymentKitBinding,
    private authHeaders: Headers
  ) {}

  private async fetch(path: string, init?: RequestInit) {
    const headers = new Headers(this.authHeaders);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const req = new Request(`https://internal${path}`, { ...init, headers });
    const resp = await this.service.fetch(req);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Payment Kit ${path}: ${resp.status} ${error}`);
    }
    return resp.json();
  }
}
```

Note: hostname in `new Request()` is ignored for Service Binding fetch — only path matters.

### 2.2 API Methods (only what aigne-hub uses)

| Method | HTTP | Route | Purpose |
|--------|------|-------|---------|
| `getMeter(eventName)` | GET | `/api/meters/{eventName}?livemode=true` | Get meter |
| `createMeter(data)` | POST | `/api/meters` | Create meter |
| `updateMeter(id, data)` | PUT | `/api/meters/{id}` | Update meter unit |
| `ensureCustomer(did)` | GET | `/api/customers/{did}?create=true` | Get/create customer |
| `createMeterEvent(payload)` | POST | `/api/meter-events` | Record usage (replaces deductCredits) |
| `getCreditSummary(customerId)` | GET | `/api/credit-grants/summary?customer_id={id}` | Credit balance |
| `getPendingAmount(customerId)` | GET | `/api/meter-events/pending-amount?customer_id={id}` | Pending deductions |
| `verifyAvailability(params)` | GET | `/api/credit-grants/verify-availability` | Auto-recharge check |
| `getCreditGrants(params)` | GET | `/api/credit-grants?customer_id={id}` | Grant list |
| `getCreditTransactions(params)` | GET | `/api/credit-transactions?customer_id={id}` | Transaction list |
| `getPaymentCurrency(id)` | GET | `/api/payment-currencies/{id}` | Currency info |
| `updatePaymentCurrency(id, data)` | PUT | `/api/payment-currencies/{id}` | Update currency |
| `getRechargeConfig(currencyId)` | GET | `/api/payment-currencies/{id}/recharge-config` | Recharge config |
| `updateRechargeConfig(currencyId, data)` | PUT | `/api/payment-currencies/{id}/recharge-config` | Update recharge |
| `createProduct(data)` | POST | `/api/products` | Credit product |
| `getPrice(lookupKey)` | GET | `/api/prices/{lookupKey}` | Price by key |
| `createPaymentLink(data)` | POST | `/api/payment-links` | Payment link |
| `getPaymentLink(lookupKey)` | GET | `/api/payment-links/{lookupKey}` | Get payment link |
| `getSettings(mountLocation)` | GET | `/api/settings/{mountLocation}` | Notification settings |
| `createSettings(data)` | POST | `/api/settings` | Create settings |
| `updateSettings(id, data)` | PUT | `/api/settings/{id}` | Update settings |

### 2.3 Hono Middleware — Inject PaymentClient

```typescript
app.use('/api/*', async (c, next) => {
  if (c.env.PAYMENT_KIT) {
    const headers = new Headers();
    const cookie = c.req.header('Cookie');
    if (cookie) headers.set('Cookie', cookie);
    const auth = c.req.header('Authorization');
    if (auth) headers.set('Authorization', auth);
    c.set('payment', new PaymentClient(c.env.PAYMENT_KIT, headers));
  }
  await next();
});
```

### 2.4 Migration: credit.ts → PaymentClient

| Current (credit.ts / D1 local) | New (PaymentClient) | Notes |
|---|---|---|
| `getCreditBalance(db, userDid)` | `payment.getCreditSummary(userDid)` + `payment.getPendingAmount(userDid)` | Combined for net balance |
| `preDeductCredits(db, userDid, amount)` | `payment.createMeterEvent({...})` | Atomic, no pre-deduct/settle needed |
| `settleCredits(db, ...)` | Removed | Payment Kit meter events are atomic |
| `refundHold(db, ...)` | Removed | No hold concept with meter events |
| `grantCredits(db, userDid, amount)` | Handled by Payment Kit checkout flow | Admin grants via PK API |
| `getTransactions(db, userDid)` | `payment.getCreditTransactions(userDid)` | Paginated |
| `getOrCreateAccount(db, userDid)` | `payment.ensureCustomer(userDid)` | Auto-create on first call |

### 2.5 Meter Initialization

```typescript
async function ensureMeter(payment: PaymentClient) {
  const METER_NAME = 'agent-hub-ai-meter';
  const METER_UNIT = 'AIGNE Hub Credits';
  try {
    const meter = await payment.getMeter(METER_NAME);
    if (meter && meter.unit !== METER_UNIT) {
      await payment.updateMeter(meter.id, { unit: METER_UNIT });
    }
    return meter;
  } catch {
    return payment.createMeter({
      name: 'AIGNE Hub AI Meter',
      event_name: METER_NAME,
      unit: METER_UNIT,
      aggregation_method: 'sum',
    });
  }
}
```

24h module-level cache (same as blocklet version).

### 2.6 Balance Check Flow

```typescript
async function checkUserCreditBalance(payment: PaymentClient, userDid: string) {
  const [creditBalance, pendingCredit] = await Promise.all([
    payment.getCreditSummary(userDid),
    payment.getPendingAmount(userDid),
  ]);
  // Calculate net balance (same logic as blocklet version)
  // If balance <= 0, call verifyAvailability for auto-recharge check
  // If still insufficient, throw CreditError with payment link
}
```

### 2.7 Local D1 Credit Tables

**Keep** `creditAccounts` and `creditTransactions` as **read cache**:

- Payment Kit is source of truth
- Local tables used for fast balance reads in non-critical paths
- Critical paths (pre-call credit check) always go through Payment Kit
- Graceful fallback: if `PAYMENT_KIT` not bound, use local D1 credit system

## Implementation Order

### Phase 1: Gateway Layer
1. Add `PAYMENT_KIT` Service Binding to `wrangler.toml` and `Env` type
2. Add `/payment/*` mount point proxy with prefix stripping + HTML rewrite
3. Add `/media-kit/*` passthrough
4. Add lost-prefix redirect for Payment Kit frontend routes
5. Add `X-External-Tabs` injection for DID admin pages (optional)

### Phase 2: Backend API Layer
6. Create `cloudflare/src/libs/payment.ts` with `PaymentClient` class
7. Add Hono middleware to inject `PaymentClient` per request
8. Port `ensureMeter()` + `ensureCustomer()` initialization
9. Replace `checkUserCreditBalance()` in AI call flow
10. Replace meter event creation (replaces preDeduct/settle pattern)
11. Update payment routes to use PaymentClient

### Phase 3: Cleanup
12. Remove frontend payment shims (replaced by real Payment Kit pages at `/payment/*`)
13. Deprecate local D1 credit write operations (keep as read cache)

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PAYMENT_KIT` | Service Binding to payment-kit Worker |
| `APP_PID` | Instance DID (already exists, used in X-Instance-Did header) |

No additional secrets needed — auth via transparent JWT passthrough.

## Verification Checklist

```bash
# 1. Health check
curl https://aigne-hub.workers.dev/payment/health

# 2. Login via DID Connect
# Browser: https://aigne-hub.workers.dev/.well-known/service/login

# 3. Payment Kit API (with login cookie)
curl https://aigne-hub.workers.dev/payment/api/products

# 4. Frontend pages
# Browser: /payment/admin (admin panel)
# Browser: /payment/customer (user billing)

# 5. Verify prefix in __blocklet__.js
curl https://aigne-hub.workers.dev/payment/__blocklet__.js | grep prefix
# Should return "prefix":"/payment/"

# 6. Backend API call (meter event)
# Triggered by AI model call → check Payment Kit logs
```

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Payment Kit Worker not deployed | Graceful fallback: if `PAYMENT_KIT` not bound, skip gateway routes + use local D1 credit |
| HTML rewrite misses some paths | Test with Payment Kit frontend; iterate on regex patterns |
| Lost-prefix redirects conflict with aigne-hub routes | `PAYMENT_KIT_ROUTES` list is explicit; only redirect known PK routes |
| JWT expiry between services | Same AUTH_SERVICE handles both; tokens validated consistently |
