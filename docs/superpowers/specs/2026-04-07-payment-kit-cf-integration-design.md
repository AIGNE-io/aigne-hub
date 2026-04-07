# Payment Kit Cloudflare Workers Integration Design

## Overview

Integrate Payment Kit into aigne-hub's Cloudflare Worker via Service Binding, replacing the local D1 credit system with Payment Kit as the source of truth for credit management, metering, and billing.

## Context

### Current State

- **aigne-hub CF Worker** uses a local D1-based credit system (`libs/credit.ts`) with `creditAccounts` and `creditTransactions` tables
- **Payment Kit CF Worker** (`feat/cf-workers-migration` branch) is a fully migrated Hono + D1 Worker with Express route compatibility shims
- Both services share the same `AUTH_SERVICE` (blocklet-service) for identity resolution via `resolveIdentity(jwt, authHeader, instanceDid)`
- Users authenticate once; the same JWT/cookie is valid across both services (unified login)

### Why Service Binding + fetch

- Payment Kit CF Worker exposes standard HTTP routes (`/api/meters`, `/api/meter-events`, `/api/credit-grants`, etc.)
- No RPC entrypoint (`WorkerEntrypoint`) exists yet in payment-kit
- Service Binding `.fetch()` provides zero-latency internal communication without extra auth
- This matches existing patterns: `MEDIA_KIT.fetch()` in payment-kit, `BLOCKLET_SERVICE.fetch()` in aigne-hub

## Architecture

```
User Request (with login_token cookie)
    |
    v
aigne-hub Worker
    |-- AUTH_SERVICE.resolveIdentity() -> caller.did
    |
    |-- PAYMENT_SERVICE.fetch(
    |     new Request('/api/...', {
    |       headers: { Cookie: original_cookie }  <- passthrough
    |     })
    |   )
    |
    v
payment-kit Worker
    |-- AUTH_SERVICE.resolveIdentity() -> same user, same JWT
    |-- Express routes -> normal processing
```

Key principle: aigne-hub passes through the user's original Cookie/Authorization headers. Payment Kit Worker resolves identity independently via the shared AUTH_SERVICE.

## Implementation Details

### 1. wrangler.toml — Add Service Binding

```toml
[[services]]
binding = "PAYMENT_SERVICE"
service = "payment-kit"
```

Add to `Env` type in `worker.ts`:

```typescript
PAYMENT_SERVICE?: { fetch: (req: Request) => Promise<Response> };
```

### 2. `cloudflare/src/libs/payment.ts` — PaymentClient

A lightweight HTTP client wrapping `PAYMENT_SERVICE.fetch()`. Each method maps to a Payment Kit Express route.

```typescript
type PaymentServiceBinding = { fetch: (req: Request) => Promise<Response> };

export class PaymentClient {
  constructor(
    private service: PaymentServiceBinding,
    private authHeaders: Headers
  ) {}
}
```

#### API Methods (only what aigne-hub actually uses)

| Method | HTTP | Payment Kit Route | Purpose |
|--------|------|-------------------|---------|
| `getMeter(eventName)` | GET | `/api/meters/{eventName}?livemode=true` | Get or verify meter exists |
| `createMeter(data)` | POST | `/api/meters` | Create meter if not exists |
| `updateMeter(id, data)` | PUT | `/api/meters/{id}` | Update meter unit/metadata |
| `ensureCustomer(did)` | GET | `/api/customers/{did}?create=true` | Get or create customer |
| `createMeterEvent(payload)` | POST | `/api/meter-events` | Record usage (replaces deductCredits) |
| `getCreditSummary(customerId)` | GET | `/api/credit-grants/summary?customer_id={id}` | Get credit balance |
| `getPendingAmount(customerId)` | GET | `/api/meter-events/pending-amount?customer_id={id}` | Get pending deductions |
| `verifyAvailability(params)` | GET | `/api/credit-grants/verify-availability` | Check if user can continue |
| `getCreditGrants(params)` | GET | `/api/credit-grants?customer_id={id}` | List credit grants |
| `getCreditTransactions(params)` | GET | `/api/credit-transactions?customer_id={id}` | List transactions |
| `getPaymentCurrency(id)` | GET | `/api/payment-currencies/{id}` | Get currency info |
| `updatePaymentCurrency(id, data)` | PUT | `/api/payment-currencies/{id}` | Update currency symbol |
| `getRechargeConfig(currencyId)` | GET | `/api/payment-currencies/{id}/recharge-config` | Get recharge config |
| `updateRechargeConfig(currencyId, data)` | PUT | `/api/payment-currencies/{id}/recharge-config` | Update recharge config |
| `createProduct(data)` | POST | `/api/products` | Create credit product |
| `getPrice(lookupKey)` | GET | `/api/prices/{lookupKey}` | Get price by lookup key |
| `createPaymentLink(data)` | POST | `/api/payment-links` | Create payment link |
| `getPaymentLink(lookupKey)` | GET | `/api/payment-links/{lookupKey}` | Get payment link |
| `getSettings(mountLocation)` | GET | `/api/settings/{mountLocation}` | Get notification settings |
| `createSettings(data)` | POST | `/api/settings` | Create notification settings |
| `updateSettings(id, data)` | PUT | `/api/settings/{id}` | Update notification settings |

Each method follows this pattern:

```typescript
async createMeterEvent(payload: {
  event_name: string;
  timestamp: number;
  payload: { customer_id: string; value: string };
  identifier: string;
  metadata?: Record<string, any>;
}) {
  const resp = await this.fetch('/api/meter-events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return resp;
}

private async fetch(path: string, init?: RequestInit) {
  const headers = new Headers(this.authHeaders);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const req = new Request(`https://payment-kit${path}`, { ...init, headers });
  const resp = await this.service.fetch(req);
  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Payment Kit ${path}: ${resp.status} ${error}`);
  }
  return resp.json();
}
```

Note: The hostname in `new Request()` is ignored for Service Binding fetch — only the path matters.

### 3. Hono Middleware — Inject PaymentClient

```typescript
// In worker.ts middleware chain, after auth
app.use('/api/*', async (c, next) => {
  if (c.env.PAYMENT_SERVICE) {
    const headers = new Headers();
    const cookie = c.req.header('Cookie');
    if (cookie) headers.set('Cookie', cookie);
    const auth = c.req.header('Authorization');
    if (auth) headers.set('Authorization', auth);
    c.set('payment', new PaymentClient(c.env.PAYMENT_SERVICE, headers));
  }
  await next();
});
```

### 4. Migration: credit.ts -> payment.ts Call Chain

| Current (credit.ts / D1 local) | New (PaymentClient) | Notes |
|---|---|---|
| `getCreditBalance(db, userDid)` | `payment.getCreditSummary(userDid)` + `payment.getPendingAmount(userDid)` | Combined for net balance |
| `preDeductCredits(db, userDid, amount)` | `payment.createMeterEvent({...})` | Atomic, no pre-deduct/settle pattern needed |
| `settleCredits(db, ...)` | Removed | Payment Kit meter events are atomic |
| `refundHold(db, ...)` | Removed | No hold concept with meter events |
| `grantCredits(db, userDid, amount)` | Handled by Payment Kit checkout flow | Admin grants via Payment Kit API directly |
| `getTransactions(db, userDid)` | `payment.getCreditTransactions(userDid)` | Paginated |
| `getOrCreateAccount(db, userDid)` | `payment.ensureCustomer(userDid)` | Auto-create on first call |

### 5. Meter Initialization

Port `ensureMeter()` logic from `blocklets/core/api/src/libs/payment.ts`:

```typescript
// On worker startup or first request
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
    // Create if not exists
    return payment.createMeter({
      name: 'AIGNE Hub AI Meter',
      event_name: METER_NAME,
      unit: METER_UNIT,
      aggregation_method: 'sum',
    });
  }
}
```

Cache the meter in a module-level variable with 24h TTL (same as blocklet version).

### 6. Balance Check Flow

Port `checkUserCreditBalance()` from blocklet version:

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

### 7. Local D1 Credit Tables

**Keep** `creditAccounts` and `creditTransactions` D1 tables as a **read cache**:

- Populated/synced via cron job that calls Payment Kit API
- Used for fast balance reads in non-critical paths (e.g., UI display)
- Critical paths (pre-call credit check) always go through Payment Kit
- Migration: existing D1 data remains valid during transition

### 8. Environment Variables

| Variable | Purpose |
|----------|---------|
| `PAYMENT_SERVICE` | Service Binding to payment-kit Worker |
| `PAYMENT_METER_NAME` | Optional override, default: `agent-hub-ai-meter` |

No additional secrets needed — auth is handled by transparent JWT passthrough.

## What Is NOT In Scope

- **Frontend `@blocklet/payment-react` integration** — the shim components stay as-is; real Payment Kit UI integration is a separate task requiring Payment Kit's public URL configuration
- **Payment Kit RPC entrypoint** — future optimization; current `.fetch()` approach is sufficient
- **Webhook enhancements** — existing webhook handler stays; Payment Kit handles events internally
- **Subscription management** — not used by aigne-hub currently

## Implementation Order

1. Add `PAYMENT_SERVICE` binding to `wrangler.toml` and `Env` type
2. Create `cloudflare/src/libs/payment.ts` with `PaymentClient` class
3. Add Hono middleware to inject `PaymentClient` per request
4. Port `ensureMeter()` + `ensureCustomer()` initialization logic
5. Replace `checkUserCreditBalance()` in AI call flow
6. Replace `createMeterEvent()` usage (replaces preDeduct/settle pattern)
7. Update payment routes to proxy through PaymentClient where needed
8. Add cron job for D1 cache sync (optional, can be deferred)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Payment Kit Worker not deployed yet | Graceful fallback: if `PAYMENT_SERVICE` not bound, use local D1 credit system |
| Service Binding latency under load | Zero-latency by design; monitor via `__dev__/benchmark` |
| JWT expiry between services | Same AUTH_SERVICE handles both; tokens are validated consistently |
| Payment Kit API changes | Pin to known routes; all routes are Express routes from payment-kit's stable API |
