# Payment Kit -> AIGNE Hub Migration Runbook

> This is the standard human-oriented migration guide.
>
> It is environment-agnostic. Do not treat any service names, domains, database names, or IDs from examples as fixed values.

---

## 1. Goal

This runbook is for migrating and deploying a target environment for:

1. `payment-kit`
2. `aigne-hub`

The required order is always:

1. prepare and deploy `payment-kit`
2. migrate Payment data and validate billing objects
3. prepare and deploy `aigne-hub`
4. migrate Hub data
5. wire Hub to Payment Kit
6. run end-to-end validation

This order applies to:

- `staging`
- `production`
- any other target environment

---

## 2. Why Payment Kit Must Go First

`aigne-hub` depends on `payment-kit` for:

- credits and grants
- checkout and billing UI
- payment link resolution
- meter events
- balance verification

If Hub is deployed before Payment Kit is actually ready, the result is usually a half-working environment:

- Hub may start
- but `/payment/*` routing is incomplete
- billing pages do not work
- payment link generation is unstable
- balance and deduction checks fail or fall back incorrectly

So the standard migration rule is:

- **Payment Kit first**
- **Hub second**

---

## 3. Document Roles

This directory contains three separate document types:

- `MIGRATION_RUNBOOK.md`
  Human-oriented process and explanation.
- `AI_EXECUTION_SPEC.md`
  AI-oriented execution protocol.
- `deployment-input.example.yaml`
  Real-value input template.

Do not merge them into one document.

Reason:

- humans need explanation and context
- AI agents need constraints, gates, and explicit inputs

---

## 4. Inputs You Must Prepare Before Migration

To make migration executable, you must prepare real values for the target environment.

### 4.1 Repository Inputs

You need:

- local or accessible `payment-kit` repository
- local `aigne-hub` repository
- target branch for each repository

Why:

- this repository contains Hub-side integration
- Payment Kit deployment logic lives in the Payment Kit repository

### 4.2 Target Environment Inputs

You need:

- target environment name
- target Cloudflare account
- target `blocklet-service` service name
- target `payment-kit` service name
- target `aigne-hub` service name
- target base URL for Payment Kit
- target base URL for Hub

Important:

- examples from existing environments are reference only
- actual execution must use the target environment values

### 4.3 Cloudflare Resource Inputs

You need:

- Hub D1 database name and/or id
- Hub KV namespace id
- Payment Kit D1 database name and/or id
- Payment Kit KV namespace id
- clear instruction on whether the AI or operator should create missing resources

### 4.4 Secret Inputs

At minimum you need:

- Hub `APP_SK`
- Hub `AUTH_SECRET`
- Hub OAuth secrets if used
- Payment Kit `APP_SK`
- Payment Kit `APP_PID` or a reliable way to resolve it
- Payment Kit livemode policy

Without these, deployment may succeed partially but not produce a usable environment.

### 4.5 Source Data Inputs

You need:

- source Hub SQLite path, usually `aikit.db`
- source Payment SQLite path, usually `payment-kit.db`

If source data is remote, also provide:

- host
- access method
- file path
- permission for the AI or operator to fetch it

### 4.6 Migration Policy Inputs

You need to decide:

- whether Hub L1 public sync is enabled
- whether Hub L2 sensitive-data migration is enabled
- whether Hub L3 historical migration is enabled
- how much history should be migrated
- whether `AiCredentials` are reconfigured manually or imported
- whether Payment subscriptions, invoices, or meter events are migrated
- whether old credits require conversion migration
- which `baseCreditPrice` applies if conversion is required

### 4.7 Membership Inputs

You need:

- which user DIDs should become Payment Kit admins
- which user DIDs should become Hub admins
- which roles each subject should receive
- whether direct membership table modification is allowed

---

## 5. What Has Already Been Proven In This Repository

The following are established from existing docs and commit history:

- Payment Kit CF worker deployment has already been done successfully in a prior staging-like environment.
- Payment Kit SQLite to D1 migration has already been done.
- `agent-hub-ai-meter-v2` is the aligned meter used in the integrated flow.
- Hub-side Service Binding integration to Payment Kit has been implemented.
- `/payment/*` gateway proxy has been implemented.
- `/api/did/payment/*` proxy has been implemented.
- livemode handling has been fixed to use query strings.
- configured `creditPaymentLink` precedence has been implemented.
- decimal conversion has been fixed for returned balance data.

That means these are good candidates for AI-assisted execution and validation.

---

## 6. Standard Migration Phases

### Phase 1: Prepare and Deploy Payment Kit

Tasks:

- prepare Payment Kit target config
- create or confirm D1/KV resources
- set required secrets and env vars
- deploy Payment Kit worker

Validation:

- health endpoint responds
- config endpoint responds
- authenticated billing pages are reachable

### Phase 2: Import Payment Data

Tasks:

- import required Payment tables from SQLite if migration policy enables it
- create any Worker-specific support tables if required by the implementation

Minimum data sets usually include:

- customers
- payment currencies
- payment methods
- products
- prices
- credit grants

Optional data sets:

- meter events
- subscriptions
- invoices

Validation:

- required tables contain expected records
- imported data is queryable through Payment APIs

### Phase 3: Validate Payment Billing Objects

Tasks:

- confirm meter exists
- confirm payment currency exists
- confirm product exists
- confirm price exists
- confirm payment link exists
- confirm recharge config is consistent

Critical validation:

- meter `currency_id`
- price `metadata.credit_config.currency_id`
- recharge config target

must all align.

If they do not align, payment may succeed while Hub balance remains zero.

### Phase 4: Configure Payment Memberships

Tasks:

- add required owner/admin memberships for Payment Kit instance

Validation:

- expected users hold expected roles

Note:

- users may need to sign in again after role changes

### Phase 5: Prepare and Deploy AIGNE Hub

Tasks:

- prepare Hub target config
- initialize Hub schema
- deploy Hub worker

Validation:

- Hub health endpoint responds
- `__blocklet__.js` responds
- auth baseline works

### Phase 6: Migrate Hub Data

Hub migration is usually done in three layers.

#### L1: Public Data

Includes:

- providers
- model rates
- model statuses

Recommended default:

- enable this layer

#### L2: Managed / Sensitive Data

Includes:

- apps
- credentials
- projects

Recommended default:

- import only if policy allows it
- otherwise reconfigure credentials manually

#### L3: Historical Data

Includes:

- model calls
- model call stats
- usages
- model rate histories

Recommended default:

- migrate only if business value justifies it
- limit history window where possible

Validation:

- layer-specific migration scripts succeed
- row counts or policy-based checks pass

### Phase 7: Wire Hub To Payment Kit

Tasks:

- confirm correct Service Binding target
- confirm `/payment/*` proxy behavior
- confirm `/api/did/payment/*` proxy behavior
- write configured `creditPaymentLink` if policy requires it
- confirm livemode behavior

Validation:

- Hub can open Payment customer page through gateway
- checkout auth path resolves
- Hub returns correct payment link

### Phase 8: End-To-End Validation

Tasks:

- validate login
- validate billing page
- validate top-up
- validate balance visibility
- validate AI usage
- validate credit deduction after AI usage

Environment is not ready until this phase passes.

---

## 7. Known Failure Modes To Recheck Every Time

These are not theoretical risks. They were encountered in prior migration work.

### 7.1 Wrong Domain Assumption

The visible `workers.dev` domain may differ from an older example.

Rule:

- use actual target values from the execution input, not old docs

### 7.2 Missing Membership

Payment APIs may respond as unauthorized if the user is not a member of the correct instance.

Rule:

- verify instance membership explicitly

### 7.3 Livemode Passed Incorrectly

Payment livemode must be handled consistently.

Rule:

- verify livemode in env
- verify livemode in API request behavior
- do not assume request body livemode is sufficient

### 7.4 Currency Misalignment

If Payment billing objects do not use the same currency id, payment may complete but balance will appear as zero.

Rule:

- always validate meter currency alignment before E2E testing

### 7.5 Decimal Conversion Errors

Raw integer storage values may be returned without decimal conversion if validation is weak.

Rule:

- verify display and API return values are decimal-adjusted

### 7.6 Wrong Payment Link Source

Auto-created links may not match intended business policy.

Rule:

- prefer configured payment link when the policy requires it

### 7.7 Missing DID Payment Proxy

Checkout pages may fail if the Hub gateway does not forward the DID payment auth route.

Rule:

- verify `/api/did/payment/*` through Hub before declaring checkout healthy

---

## 8. Success Criteria

The migration is complete only when all of the following are true:

- Payment Kit is deployed and healthy
- Payment data has been migrated or intentionally initialized fresh
- billing objects are present and internally consistent
- required memberships are in place
- Hub is deployed and healthy
- Hub data has been migrated according to policy
- Hub can open Payment pages through the gateway
- payment link resolution is correct
- credits can be purchased
- credits appear correctly in Hub
- credits decrease after AI usage

---

## 9. Recommended Companion Inputs

Use this runbook together with:

- `docs/migration/AI_EXECUTION_SPEC.md`
- `docs/migration/deployment-input.example.yaml`

Recommended workflow:

1. humans read this runbook
2. real environment values are populated into a deployment input file
3. AI agents use the execution spec against that input
