# AI Execution Spec: Payment Kit First, Then AIGNE Hub

> This document is written for coding agents and execution-oriented AI systems.
>
> It is not the human runbook. Do not replace or rewrite the human runbook with this file.

Primary references:

- `docs/migration/MIGRATION_RUNBOOK.md`
- `docs/migration/deployment-input.example.yaml`

---

## 1. Purpose

This spec defines how an AI agent should execute a full deployment and migration for:

1. `payment-kit`
2. `aigne-hub`

in that order.

The target environment may be:

- `staging`
- `production`
- another named environment

The AI must:

- read this document in full before acting
- read the execution input file in full before acting
- detect missing prerequisites before running mutation
- stop and report missing items explicitly
- only begin execution when all blocking inputs are present
- deploy Payment Kit before Hub
- validate each phase before moving to the next one

---

## 2. Scope

This spec covers:

- Payment Kit deployment
- Payment Kit data import
- Payment Kit billing object validation
- Payment Kit membership preparation
- AIGNE Hub deployment
- AIGNE Hub data migration
- AIGNE Hub integration with Payment Kit
- end-to-end validation

This spec does not authorize the AI to guess:

- target URLs
- Cloudflare account
- secrets
- source database paths
- migration scope
- membership subjects
- payment business parameters

If those values are not discoverable from supplied inputs or accessible repositories, they are blocking inputs.

---

## 3. Required Inputs

The AI must require a populated execution input file based on:

- `docs/migration/deployment-input.example.yaml`

The execution input file is authoritative for:

- target environment name
- service names
- base URLs
- D1/KV identifiers
- secrets
- source data locations
- migration policy
- membership targets
- payment configuration

The AI must not silently substitute example values from repository docs.

---

## 4. Operating Protocol

Before running any mutating action, the AI must perform this protocol exactly.

### 4.1 Full Read

The AI must read:

1. this file
2. the execution input file
3. the human runbook
4. repository-local deployment configuration relevant to the current target

At minimum that includes:

- `cloudflare/wrangler.toml`
- `cloudflare/wrangler.local.toml`
- `cloudflare/docs/DEPLOYMENT.md`
- `docs/cloudflare-payment-kit-integration-guide.md`

If the `payment-kit` repository is available, the AI must inspect its deployment configuration before executing.

### 4.2 Preflight Readiness Report

Before any deploy or migration command, the AI must produce a structured readiness report with these sections:

- `discovered_inputs`
- `provided_inputs`
- `missing_blockers`
- `non_blocking_unknowns`
- `planned_execution_order`
- `risk_warnings`

The AI must not proceed if `missing_blockers` is non-empty.

### 4.3 Stop Rule

The AI must stop before execution if any of the following are missing:

- Payment Kit repository or deployable source
- target service names
- target base URLs
- required D1/KV identifiers or permission to create them
- required secrets
- source database files or explicit instruction to skip migration
- migration policy
- membership policy

### 4.4 No Guessing Rule

The AI must not reuse historical example values unless the execution input file or active repository configuration confirms them as the intended target values.

Examples of historical values that are not automatically authoritative:

- sample service names from older environments
- sample `workers.dev` domains
- sample D1 database names

---

## 5. Discovery Rules

The AI may discover missing values only within these boundaries.

### 5.1 Allowed Discovery

The AI may infer or confirm values from:

- the execution input file
- local repository configuration
- environment-specific wrangler config
- checked-in docs and plans
- currently accessible local files
- accessible deployment config in the `payment-kit` repository

### 5.2 Conditionally Allowed Discovery

The AI may resolve these only if it has direct local or authenticated access:

- source SQLite file locations
- existing D1 identifiers
- existing KV namespace identifiers
- Payment Kit `APP_PID`
- membership target instance DIDs

If access is absent, the AI must report the missing item instead of guessing.

### 5.3 Forbidden Guessing

The AI must not invent:

- base URLs
- secrets
- service names
- D1 ids
- KV ids
- membership users
- source database paths
- `baseCreditPrice`
- final payment link

---

## 6. Stable Historical Context

These facts are supported by repository docs and commit history and may be used as implementation evidence, not as deployment input.

### 6.1 Historically Completed Work

Based on existing plans and docs:

- Payment Kit CF worker deployment was completed in a prior environment
- Payment Kit SQLite to D1 migration was completed
- Payment Kit meter `agent-hub-ai-meter-v2` was created and used
- Hub integration via Service Binding was completed
- `/payment/*` gateway proxy was completed
- `/api/did/payment/*` proxy was completed
- KV-based preferences were completed
- configured `creditPaymentLink` precedence was completed
- decimal conversion fixes were completed

### 6.2 Historically Observed Failure Modes

The following problems were encountered and fixed in prior work:

- wrong visible domain selection
- missing Payment Kit membership
- livemode passed incorrectly in request body instead of query string
- meter currency mismatch causing balance to stay zero after payment
- raw decimal amount returned without conversion
- auto-created payment link overriding configured link
- checkout DID auth route missing

The AI must re-check these conditions during validation.

### 6.3 Relevant Commit Evidence

Recent commit evidence from this repository includes:

- `ef32655` added `PAYMENT_KIT` service binding
- `a3faf07` added Payment Kit gateway proxy
- `4ae5d5f` added `/api/did/payment/*` proxy
- `1b6116e` made `PAYMENT_LIVEMODE` configurable
- `61bbd8e` centralized livemode in `PaymentClient`
- `af1f2a4` preferred configured `creditPaymentLink`
- `684a245` aligned meter usage to `agent-hub-ai-meter-v2`
- `6205cbf` and `1f25024` fixed decimal handling
- `a626fa2` documented Payment Kit integration lessons
- `c93b38b` recorded implementation status and lessons learned

These commits are evidence of what is stable enough to automate and what must be explicitly revalidated.

---

## 7. Execution Phases

The AI must execute phases in this exact order.

Each phase has:

- prerequisites
- actions
- validation gate
- stop conditions

The AI must not proceed to the next phase without passing the current validation gate.

### Phase 0: Preflight

Prerequisites:

- repository access
- execution input file

Actions:

- read required documents
- resolve provided and discoverable inputs
- identify missing blockers
- emit readiness report

Validation gate:

- `missing_blockers = []`

Stop conditions:

- any blocking input unresolved

### Phase 1: Deploy Payment Kit

Prerequisites:

- `payment-kit` repository available
- target Payment Kit service name known
- Payment Kit D1/KV configuration known or creation authorized
- required secrets available
- target base URL known

Actions:

- prepare Payment Kit deployment config
- create or confirm D1/KV resources
- set required secrets and vars
- deploy Payment Kit worker

Validation gate:

- Payment Kit health endpoint responds
- Payment Kit config endpoint responds

Stop conditions:

- deploy failure
- health/config failure

### Phase 2: Import Payment Data

Prerequisites:

- Payment Kit deployed
- source Payment database path known or migration explicitly skipped
- Payment migration policy known

Actions:

- import required Payment tables
- create any Worker-specific support tables if required by implementation

Validation gate:

- required tables contain expected data
- imported objects are queryable

Stop conditions:

- source DB missing
- import failure

### Phase 3: Validate Payment Billing Objects

Prerequisites:

- Payment import complete or explicit fresh-start policy

Actions:

- confirm meter exists
- confirm payment currency exists
- confirm product exists
- confirm price exists
- confirm payment link exists or is created if authorized
- confirm recharge config is consistent
- confirm currency alignment

Validation gate:

- meter exists and is active
- price exists
- payment link exists
- currency alignment is correct

Stop conditions:

- meter missing and creation not allowed
- price/link missing and creation not allowed
- currency mismatch unresolved

### Phase 4: Configure Payment Memberships

Prerequisites:

- Payment instance DID known or discoverable
- membership subjects provided
- permission to edit memberships or explicit manual-step policy

Actions:

- add required owner/admin memberships

Validation gate:

- expected users hold expected roles

Stop conditions:

- instance DID unavailable
- subjects missing
- permission missing

### Phase 5: Deploy AIGNE Hub

Prerequisites:

- Hub repository available
- target Hub service name known
- target Hub base URL known
- Hub D1/KV configuration known or creation authorized
- required Hub secrets available
- Payment Kit service name confirmed

Actions:

- prepare Hub deployment config
- initialize schema
- deploy Hub worker

Validation gate:

- Hub health endpoint responds
- Hub config endpoint responds

Stop conditions:

- deploy failure
- health/config failure

### Phase 6: Migrate Hub Data

Prerequisites:

- Hub deployed
- source Hub SQLite path known or migration explicitly skipped
- migration policy known

Actions:

- run L1 public sync if enabled
- run L2 sensitive-data migration if enabled
- run L3 historical migration if enabled
- run verification appropriate to chosen migration scope

Validation gate:

- enabled migration layers complete successfully

Stop conditions:

- source DB missing
- migration failure
- verification failure outside policy

### Phase 7: Wire Hub To Payment Kit

Prerequisites:

- Payment Kit deployed and validated
- Hub deployed and validated

Actions:

- confirm correct Service Binding target
- confirm `/payment/*` proxy behavior
- confirm `/api/did/payment/*` proxy behavior
- write configured `creditPaymentLink` if required and authorized
- confirm livemode behavior

Validation gate:

- Hub can open Payment customer page through gateway
- checkout auth path resolves
- Hub returns correct payment link

Stop conditions:

- binding mismatch
- proxy failure

### Phase 8: End-To-End Validation

Prerequisites:

- phases 1 through 7 passed

Actions:

- validate login
- validate billing page
- validate top-up
- validate balance
- validate AI usage
- validate deduction after AI usage

Validation gate:

- credits can be purchased
- credits appear correctly
- credits decrease after AI usage

Stop conditions:

- any business-critical path fails

---

## 8. Validation Requirements

The AI must explicitly validate these historically fragile conditions.

### 8.1 Livemode

The AI must verify that livemode is consistent across:

- env config
- API request behavior
- checkout behavior
- front-end config output if applicable

The AI must treat a request-body-only livemode implementation as invalid.

### 8.2 Currency Alignment

The AI must verify that:

- meter `currency_id`
- price `metadata.credit_config.currency_id`
- recharge config target

all refer to the same currency.

If not, the deployment is not valid.

### 8.3 Decimal Conversion

The AI must verify that displayed and returned balances are converted using `10^decimal` and not raw integer storage values.

### 8.4 Payment Link Precedence

If the policy requires a configured payment link, the AI must ensure that configured value is used instead of silent fallback auto-creation.

### 8.5 Membership Refresh Risk

If membership changes were made during execution, the AI must report that affected users may need to re-authenticate before JWT-derived permissions become visible.

---

## 9. Missing Input Reporting Contract

If the AI cannot continue, it must return missing items as a flat checklist.

Example:

```text
Missing blockers:
- Payment Kit repository path
- Payment Kit D1 database id
- Payment source SQLite path
- Hub target base URL
- Payment admin DID list
```

The AI must not bury blockers inside narrative prose.

---

## 10. Execution Summary Contract

At the end of execution, the AI must output:

- actual resolved target values
- actions performed
- migrations performed
- validation results by phase
- remaining risks
- manual follow-up items

Recommended structure:

- `resolved_targets`
- `executed_phases`
- `imported_data_sets`
- `validation_results`
- `manual_follow_ups`
- `residual_risks`
