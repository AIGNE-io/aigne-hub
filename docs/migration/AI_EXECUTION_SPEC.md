# AI Execution Spec: Payment Kit First, Then AIGNE Hub

> This document is written for coding agents and execution-oriented AI systems.
>
> It is not the human runbook. Do not replace or rewrite the human runbook with this file.

Primary references:

- `docs/migration/MIGRATION_RUNBOOK.md` — human-oriented rationale and stop conditions
- `docs/migration/EXECUTION_PLAYBOOK.md` — concrete shell command sequence per phase
- `docs/migration/deployment-input.example.yaml` — input schema template

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
3. the human runbook (`docs/migration/MIGRATION_RUNBOOK.md`)
4. the execution playbook (`docs/migration/EXECUTION_PLAYBOOK.md`)
5. repository-local deployment configuration relevant to the current target

At minimum that includes, in the **aigne-hub** repository:

- `cloudflare/wrangler.toml`
- `cloudflare/wrangler.local.toml`
- `cloudflare/docs/DEPLOYMENT.md`
- `cloudflare/migrations/` (all files — there are multiple incremental schemas, not just `0001_initial.sql`)
- `cloudflare/scripts/migrate-data.ts`
- `cloudflare/scripts/sync-from-hub.ts`
- `cloudflare/scripts/verify-migration.ts`
- `docs/cloudflare-payment-kit-integration-guide.md`
- `docs/cloudflare-feature-parity-todo.md`

And in the **payment-kit** repository (must be read before Phase 1 executes):

- `blocklets/core/cloudflare/wrangler.toml`
- `blocklets/core/cloudflare/wrangler.staging.toml` (or the env-specific variant)
- `blocklets/core/cloudflare/run-build.js`
- `blocklets/core/cloudflare/migrate-to-d1.js`
- `blocklets/core/cloudflare/migrations/` (all files)
- `blocklets/core/cloudflare/MIGRATION-CHALLENGES.md`
- `docs/cf-migration/MIGRATION-PROPOSAL-v2.md` — architectural background on the payment-kit CF port (sequelize-d1 shim, Express→Hono adapter, D1 CAS concurrency). Read for context; this document is not a deployment guide.

If the `payment-kit` repository is not accessible, Phase 1 is a blocking input
failure — the AI must not attempt to improvise a payment-kit deployment from
memory or from other documentation.

### 4.2 Preflight Readiness Report

Before any deploy or migration command, the AI must produce a structured readiness report with these sections:

- `discovered_inputs` — values resolved from the input file or from repo config
- `provided_inputs` — values the operator supplied directly
- `missing_blockers` — anything required that is absent or unresolved
- `non_blocking_unknowns` — values that can be resolved later without halting
- `preflight_probe_results` — results of the Phase 0 probes (see 4.5)
- `conflict_findings` — list of conflicts detected per phase (see Section 10)
- `planned_execution_order` — explicit phase list with expected command summaries
- `risk_warnings` — anything the operator should know about before approving

The AI must not proceed if `missing_blockers` is non-empty, if any
`preflight_probe_results` entry failed, or if `conflict_findings` contains an
entry whose `conflict_policy` setting is `abort` and no override was given.

### 4.3 Stop Rule

The AI must stop before execution if any of the following are missing or failing:

- Payment Kit repository or deployable source
- target service names
- target base URLs
- `blocklet-service` worker does not exist in the target Cloudflare account
- `blocklet-service` base URL configured but unreachable
- required D1/KV identifiers or permission to create them
- required secrets (including `CREDENTIAL_ENCRYPTION_KEY` for the Hub)
- source database files or explicit instruction to skip migration
- migration policy
- membership policy
- any `<required>` placeholder left unresolved in the input file
- `wrangler deploy --dry-run` fails for either payment-kit or aigne-hub wrangler config
- either repository has uncommitted changes and `repos.allow_dirty = false`

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

**Universal pre-action requirement.** For every mutating phase (1, 2, 3, 4,
5, 6, 7), the AI must, before executing the listed actions:

1. run the conflict probes for that phase (Section 10)
2. react per `conflict_policy.*` from the input file; never silently overwrite
3. write a snapshot of every piece of state the phase will touch to
   `./migration-backups/<timestamp>-<env>/`
4. check whether each intended command matches one of the guarded operations
   in Section 9.2 — if yes, require the corresponding `safety.*` flag to be true

These four steps are prerequisites of every phase's first Action. They are
not re-listed below; their absence from a phase does not mean they are
optional.

### Phase 0: Preflight

Prerequisites:

- both repositories accessible
- populated execution input file
- `wrangler` authenticated to the target Cloudflare account
- local `sqlite3` available if any migration layer is enabled

Actions:

- read all documents listed in 4.1
- resolve provided and discoverable inputs
- verify no `<required>` placeholders remain in the input file
- verify `wrangler whoami` returns the expected `deployment.cloudflare_account`
- verify `blocklet-service` worker exists in the target account (read-only, never mutated)
- if `services.blocklet_service_base_url` is set, curl `/__blocklet__.js?type=json` and assert 200
- run `wrangler deploy --dry-run` against the payment-kit and aigne-hub wrangler configs; assert both resolve their service bindings
- probe every destination resource for conflicts (see Section 10) and record findings
- create `./migration-backups/<timestamp>-<env>/` and write a preflight snapshot into it
- emit the readiness report specified in 4.2

Validation gate:

- `missing_blockers = []`
- `preflight_probe_results` contains zero failures
- all `conflict_findings` entries are either resolved by `conflict_policy` or explicitly overridden by the operator

Stop conditions:

- any blocking input unresolved
- `blocklet-service` not found in the target account
- `wrangler deploy --dry-run` fails for either repository
- repo is dirty and `repos.allow_dirty = false`
- unresolved conflict whose policy is `abort`

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

## 9. Safety Contract

### 9.1 Absolute prohibitions

The AI must never, regardless of any flag:

- run `wrangler delete` on an unqualified worker name
- issue `DROP TABLE` or `TRUNCATE` against a D1 database
- run `DELETE FROM <table>` without a WHERE clause
- delete a KV namespace that contains keys
- force-push any branch in either source repository
- mutate `blocklet-service` state (database, KV, deployment, or membership table); `blocklet-service` is read-only for this AI
- overwrite a production wrangler config (`env.production.*` blocks) without `safety.allow_overwrite_production_vars = true`

### 9.2 Guarded operations

The following actions are blocked by default. The AI may perform them only
when the corresponding flag in `safety.*` is true AND (if
`approvals.interactive_confirmation` is true) the operator has confirmed:

| Operation                                       | Required flag                               |
|--------------------------------------------------|---------------------------------------------|
| Any D1 SQL containing `DROP` / `DELETE` / `TRUNCATE` | `safety.allow_destructive_d1_sql`       |
| `wrangler d1 delete`                             | `safety.allow_wrangler_d1_delete`           |
| `wrangler kv namespace delete`                   | `safety.allow_wrangler_kv_namespace_delete` |
| `wrangler secret delete`                         | `safety.allow_wrangler_secret_delete`       |
| `wrangler delete` on a worker                    | `safety.allow_worker_delete`                |
| Overwriting a production `[vars]` block          | `safety.allow_overwrite_production_vars`    |

When a guarded operation runs, the AI must first write a snapshot of the
affected resource into `./migration-backups/<timestamp>-<env>/` and cite the
snapshot path in the execution summary.

### 9.3 Skip-if-present defaults

In the absence of explicit policy overrides, the AI must prefer existing
state over newly written state:

- existing `wrangler secret`: skip, never overwrite or delete
- existing D1 rows on a destination table: abort the phase
- existing KV key with a different value than the proposed one: enter the
  `diff_then_ask` flow and stop for operator decision
- existing payment meter / product / price / link with the configured name:
  reuse, never recreate

### 9.4 Snapshot contract

Before any mutating phase runs, the AI must produce a snapshot directory at
`./migration-backups/<ISO-timestamp>-<env>/` containing:

- row exports (`wrangler d1 execute --json`) of every table the phase will touch
- current values of every KV key the phase will write
- list of secret names (never values) for both workers
- backup copy of every wrangler config the phase may rewrite, suffixed `-before`

Snapshots are append-only. The AI must not delete or modify files inside a
prior snapshot directory.

---

## 10. Conflict Detection Contract

Before any phase mutates state, the AI must run that phase's conflict probes
and record findings in the readiness report under `conflict_findings`.

### 10.1 Probes per phase

| Phase | Probe                                                                                        |
|-------|----------------------------------------------------------------------------------------------|
| 0     | `wrangler whoami`; `wrangler deployments list --name <blocklet-service>`; `wrangler deploy --dry-run` for both repos; grep input file for unresolved `<required>` placeholders |
| 1     | `wrangler deployments list --name <payment-kit>` (check recency); `wrangler secret list` on payment-kit; existence of target D1 + KV |
| 2     | For every table in `payment-kit/blocklets/core/cloudflare/migrate-to-d1.js`'s output, `SELECT COUNT(*)` on the destination |
| 3     | `GET /api/meters`, `/api/products`, `/api/prices`, `/api/payment-links` on payment-kit (reused, not recreated if present) |
| 4     | read membership rows for the configured admins before inserting                              |
| 5     | same as Phase 1 but for aigne-hub                                                            |
| 6     | row count on `AiProviders`, `AiModelRates`, `AiModelStatuses` (L1), `Apps`, `AiCredentials`, `Projects` (L2), `ModelCalls`, `Usages` (L3) |
| 7     | `wrangler kv key get "app:preferences" --namespace-id <hub-kv-id>`                            |
| 8     | none — Phase 8 is read-only validation                                                        |

### 10.2 Finding schema

Each finding is a structured record with:

- `phase` — phase number
- `class` — one of `DUPLICATE_DEPLOY`, `OCCUPIED_D1`, `OCCUPIED_KV`, `EXISTING_SECRET`, `EXISTING_PAYMENT_OBJECT`, `RESOURCE_DRIFT`, `PLACEHOLDER_UNRESOLVED`
- `target` — the resource being probed (e.g. table name, KV key, service name)
- `current` — a summary of the current state (e.g. row count, value digest)
- `proposed` — a summary of the value the AI wants to write, if any
- `policy_key` — the `conflict_policy.*` key that governs this class
- `policy_value` — the effective setting from the input file
- `resolution` — one of `proceed`, `skip`, `abort`, `ask_operator`

### 10.3 Reporting format

Findings must be emitted both as part of the JSON readiness report AND in a
human-readable block in the AI's response, grouped by phase. Example:

```text
Phase 2 — Import Payment Data
  [OCCUPIED_D1]      table=payment_customers rows=47 policy=on_existing_d1_rows(abort)     -> abort
  [OCCUPIED_D1]      table=payment_prices    rows=3  policy=on_existing_d1_rows(abort)     -> abort
Phase 7 — Wire Hub To Payment Kit
  [OCCUPIED_KV]      key=app:preferences                  policy=on_existing_kv_key(diff_then_ask) -> ask_operator
    diff:
      - creditPaymentLink: /payment/checkout/pay/plink_OLD
      + creditPaymentLink: /payment/checkout/pay/plink_NEW
```

### 10.4 Abort semantics

If any finding has `resolution = abort` and the input file has
`deployment.abort_on_conflict = true` (the default), the AI must stop before
executing the affected phase and report the findings to the operator. The AI
must not carry partially-conflicted state into later phases.

---

## 11. Missing Input Reporting Contract

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

## 12. Execution Summary Contract

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
