# Payment Kit CF Integration Implementation Plan

**Status: Phase 1 & 2 COMPLETE. Phase 3 (production) pending.**

**Goal:** Integrate Payment Kit into aigne-hub's Cloudflare Worker via Service Binding — gateway proxy for frontend pages + backend API client for credit/metering operations.

**Architecture:** aigne-hub acts as gateway, proxying `/payment/*` to Payment Kit Worker (strip prefix + HTML rewrite), and calling Payment Kit API internally via `PaymentClient` for credit checks and meter events. Auth is transparent — same `login_token` cookie works across both Workers via shared AUTH_SERVICE.

**Tech Stack:** Hono (routing), Cloudflare Service Binding (inter-Worker communication), D1 (local credit cache fallback), KV (preferences)

---

## Completed Work

### Phase 1: Payment Kit Worker Deployment ✅

- [x] Create `wrangler.staging.toml` for Payment Kit CF Worker
- [x] Create D1 database `payment-kit-staging`
- [x] Create KV namespace `DID_CONNECT_KV`
- [x] Migrate data from Blocklet Server SQLite to D1 (40 tables, 5056 records)
- [x] Build frontend (`vite build`) and backend (`esbuild`)
- [x] Deploy Payment Kit Worker to `payment-kit-staging.zhuzhuyule-779.workers.dev`
- [x] Set `APP_SK` secret
- [x] Set `PAYMENT_LIVEMODE=false` for testmode
- [x] Sync `PAYMENT_LIVEMODE` to `process.env` in worker.ts (both HTTP and queue consumer paths)
- [x] Create meter `agent-hub-ai-meter-v2` in D1
- [x] Set owner memberships in blocklet-service-staging for Payment Kit instance

### Phase 2: AIGNE Hub Integration ✅

#### Gateway Layer
- [x] Add `PAYMENT_KIT` Service Binding to `wrangler.toml` and `wrangler.local.toml`
- [x] Add `PAYMENT_KIT` to `Env` type
- [x] `/payment/*` mount point proxy with prefix stripping + HTML rewrite
- [x] `/media-kit/*` passthrough to Payment Kit
- [x] `/api/did/payment/*` proxy for DID Connect payment auth
- [x] `/__blocklet__.js` — serve preferences, mount points, livemode injection
- [x] Lost-prefix redirect (`/customer` → `/payment/customer`)
- [x] `X-External-Tabs` billing tab injection in DID admin pages

#### PaymentClient
- [x] Create `libs/payment.ts` with `PaymentClient` class (20+ API methods)
- [x] `PAYMENT_LIVEMODE` env var → configurable livemode (default: true)
- [x] Centralize livemode in `request()` method via URL query string
- [x] Hono middleware to inject PaymentClient per request
- [x] `ensureMeter()` with 24h module-level cache
- [x] `ensureCustomer()` via Payment Kit API
- [x] `createMeterEvent()` for usage recording
- [x] `checkUserCreditBalance()` with auto-recharge verification
- [x] `getCreditPaymentLink()` with auto-create fallback
- [x] `CreditError` class with payment link in 402 response

#### Credit Operations Migration
- [x] v2 routes: replace preDeduct/settle/refund with check-before + meter-event-after
- [x] user routes: `/info`, `/credit/balance`, `/credit/grants`, `/credit/transactions`
- [x] usage routes: `/quota` balance query
- [x] payment routes: admin grant + fallback proxy
- [x] `/api/user/credit/payment-link` endpoint
- [x] Prefer configured `creditPaymentLink` from KV preferences over auto-creation
- [x] Convert raw amounts using `currency.decimal` (÷ 10^10)

#### Preferences System
- [x] Create `libs/preferences.ts` — KV read/write (`app:preferences` key)
- [x] `GET/PUT /api/user/admin/preferences` admin API
- [x] `/__blocklet__.js` serves preferences to frontend
- [x] `creditPaymentLink` configurable via KV (runtime, no redeploy)
- [x] `creditBasedBillingEnabled`, `creditPrefix` used in `/info` response

#### Frontend
- [x] `/credit-usage` page renders `CreditBoardPage` in CF mode (was redirecting to `/usage`)

### Issues Resolved During Implementation

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Workers return 1042 | Wrong workers.dev subdomain (two subdomains on same account) | Use `zhuzhuyule-779.workers.dev` |
| Payment Kit API returns "Not authorized" | User not in Payment Kit instance memberships | Add owner role in blocklet-service D1 |
| Checkout shows ABT instead of TBA | `PAYMENT_LIVEMODE` not propagated; livemode in body not query string | Centralize livemode in URL query string |
| Balance shows 0 after payment | Meter `currency_id` ≠ credit grant `currency_id` | Switch to `agent-hub-ai-meter-v2` |
| Balance shows 10,000,000,000 | Raw amount not divided by `10^decimal` | Add decimal conversion in API responses |
| Wrong payment link used | `getCreditPaymentLink()` auto-creates new link ignoring KV config | Check KV preferences first |
| `/api/did/payment/auth` 404 | Payment Kit frontend uses absolute path without mount prefix | Add explicit proxy route |
| `/credit-usage` page missing | CF mode redirected to `/usage` (admin page) | Add `CreditBoardPage` route |
| DID Wallet "split" error after payment | Payment Kit CF Worker callback handling bug | Known issue, payment still succeeds |

---

## Phase 3: Production Deployment (TODO)

- [ ] Deploy Payment Kit Worker to production (`payment-kit` service name)
- [ ] Set `PAYMENT_LIVEMODE=true` (or remove for default livemode)
- [ ] Create production meter and credit product/price with correct currency
- [ ] Configure production `creditPaymentLink` in KV preferences
- [ ] Add `PAYMENT_KIT` service binding to aigne-hub production wrangler config
- [ ] Set owner memberships in production blocklet-service
- [ ] Verify end-to-end: login → buy credits → use AI → check balance
- [ ] Fix DID Wallet callback error in Payment Kit CF Worker

## Reference

- Design spec: `docs/superpowers/specs/2026-04-07-payment-kit-cf-integration-design.md`
- Integration guide: `docs/cloudflare-payment-kit-integration-guide.md`
- Payment Kit official guide: `CF Workers: AIGNE Hub 集成 Payment Kit 指南` (叶小芳)
