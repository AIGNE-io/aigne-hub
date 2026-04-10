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

0. preflight: verify every precondition (including that `blocklet-service` already exists)
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

### Load-bearing assumption: `blocklet-service` already exists

`blocklet-service` is the shared DID authentication worker that both
`payment-kit` and `aigne-hub` reference through Service Bindings. **This runbook
never deploys or mutates `blocklet-service`.** It only verifies that:

- a worker with the configured name exists in the target Cloudflare account
- the worker responds to a public health probe (if a base URL is configured)
- the wrangler configs of payment-kit and aigne-hub can resolve its service binding target

If `blocklet-service` does not exist, Phase 0 stops the migration. The operator
must provision it out-of-band before re-running.

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

Secrets go through `wrangler secret put`. Env vars go into `[vars]` blocks
or via `--var`. Do not conflate the two.

At minimum you need:

- Hub `APP_SK`
- Hub `AUTH_SECRET`
- Hub `CREDENTIAL_ENCRYPTION_KEY` — encrypts `AiCredentials` at rest; the hub will not load stored credentials without it
- Hub OAuth secrets if used (`GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET`)
- Payment Kit `APP_SK`
- Payment Kit `APP_PID` or a reliable way to resolve it (it is an env var, not a secret)
- `PAYMENT_LIVEMODE` — env var (not secret) on both workers

Optional:

- `AI_GATEWAY_ACCOUNT_ID` / `AI_GATEWAY_ID` (env vars) to route provider calls through Cloudflare AI Gateway

Without these, deployment may succeed partially but not produce a usable environment.

#### 4.4.1 Reusing secrets from a running local Blocklet Server

If the source hub is currently running as a Blocklet inside a local Blocklet
Server (e.g. `ai-kit` under `~/.arcblock/abtnode`), its wallet identity and
session secret are injected into the PM2 process environment by the Blocklet
Server runtime and can be recovered without touching the hub source code.

```bash
# Find the ai-kit process id (the number in the first column)
PM2_HOME=~/.arcblock/abtnode pm2 list | grep ai-kit

# Inspect its injected environment (dumps ~170 env keys)
PM2_HOME=~/.arcblock/abtnode pm2 env <id> | grep -E 'BLOCKLET_APP_(ASK|PID)|BLOCKLET_SESSION_SECRET|BLOCKLET_DID|BLOCKLET_COMPONENT_DID|BLOCKLET_APP_URL'
```

Field mapping from Blocklet Server env to CF worker secrets:

| Blocklet Server env var        | CF worker secret             | Notes                                              |
|--------------------------------|------------------------------|----------------------------------------------------|
| `BLOCKLET_APP_ASK`             | `APP_SK`                     | **Format warning**: `BLOCKLET_APP_ASK` is `0x`+128 hex chars (64 bytes ED25519 expanded key); `@ocap/wallet.fromSecretKey` in CF Worker expects 64-char hex (32 bytes). These are not byte-compatible — reusing `BLOCKLET_APP_ASK` directly will fail in `registerApp`. Generate a fresh `APP_SK` via `docs/migration/scripts/generate-credentials.mjs` instead. |
| `BLOCKLET_SESSION_SECRET`      | `AUTH_SECRET`                | Safe to reuse: strip the `0x` prefix, the remaining 64 chars are valid. Reusing lets old JWTs remain valid; generating fresh just forces a relogin. |
| *(none)*                       | `CREDENTIAL_ENCRYPTION_KEY`  | Blocklet Server uses its own built-in encryption for stored provider keys (not this env var). There is no equivalent to recover — either generate a fresh one and re-add provider keys manually in the hub admin UI, or explicitly copy the CREDENTIAL_ENCRYPTION_KEY from an existing CF worker that already has `AiCredentials` data. |
| `BLOCKLET_DID` / `BLOCKLET_APP_PID` | *(informational)*         | This is the Blocklet Server **instance DID**, not the hub's app identity. It is not directly used as a CF worker secret, but it equals payment-kit's `APP_PID` env var for that environment. |

**Cloudflare secrets are write-only by design**: once a secret is set via
`wrangler secret put`, it cannot be read back via `wrangler secret list`,
`wrangler secret get` (the command does not exist), or the dashboard. If you
do not have a local `.dev.vars`, a password manager entry, or a running
Blocklet Server from which to recover the values, you cannot "continue" the
existing hub's identity — you must generate fresh credentials for the new
deployment. This is by design; treat it as a feature, not a bug.

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

Note: membership configuration is a **manual prerequisite**, not a migration
action. The migration never writes to `blocklet-service` (where membership
state lives). Configure memberships through the blocklet-service admin UI
before starting Phase 4; the playbook only verifies that the configured DIDs
can reach admin-scoped endpoints. See Phase 4 in Section 6 for the
verification rules.

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

Architectural background for Payment Kit's CF port — including the
`sequelize-d1` shim, Express→Hono adapter, and D1 CAS concurrency model — is
documented in `payment-kit/docs/cf-migration/MIGRATION-PROPOSAL-v2.md`. Read
that document for context when debugging Payment Kit behavior in CF; it is
not a deployment guide, and the 10-14 week implementation plan it describes
is already complete (the evidence is in `blocklets/core/cloudflare/shims/`).

---

## 6. Standard Migration Phases

Concrete shell commands for every phase live in
`docs/migration/EXECUTION_PLAYBOOK.md`. This section explains the intent and
the stop conditions; the playbook carries the commands.

### Phase 0: Preflight

Tasks:

- verify the input file has no unresolved placeholders
- verify both repositories are on the expected branch and clean (or `allow_dirty=true`)
- verify required CLI tools exist (`wrangler`, `sqlite3`, `jq`, `yq`, `node`, `npx`)
- verify `wrangler whoami` resolves to the expected Cloudflare account
- verify `blocklet-service` worker exists and, if a base URL is configured, is reachable
- verify payment-kit and aigne-hub wrangler configs resolve (via `wrangler deploy --dry-run`)
- verify source SQLite files exist if any migration layer is enabled
- emit a structured preflight report with discovered inputs, missing blockers, and conflict-policy warnings

Validation:

- zero missing blockers
- zero unresolved placeholders in the input file

Stop conditions:

- any of the above checks fail — Phase 0 never attempts remediation, it only reports

### Phase 1: Prepare and Deploy Payment Kit

Preflight (conflict detection):

- check the last deployment time of the target worker; if it is more recent than `conflict_policy.deployment_recency_hours`, either abort or require interactive confirmation (never silent overwrite)
- list existing secrets on the target worker; the playbook never deletes them and only writes when `conflict_policy.on_existing_secret` permits it
- if `payment_resources.d1_id = "create"` and `create_if_missing = false`, stop

Tasks:

- create D1 database and KV namespace if authorized; capture the returned ids and write them back into `blocklets/core/cloudflare/wrangler.staging.toml` (or the configured path) — only if `approvals.allow_ai_to_modify_wrangler_configs = true`
- apply all files under `blocklets/core/cloudflare/migrations/` in order (not only the first)
- set required secrets (skip-if-present by default; never delete existing secrets)
- deploy the Payment Kit worker. The deploy triggers the configured `[build]` command (`cd cloudflare && node run-build.js`) automatically; Phase 1 does not build manually

Note — schema drift risk: Payment Kit's D1 schema is derived from Sequelize
model definitions at build time via the `sequelize-d1` shim (see
`payment-kit/docs/cf-migration/MIGRATION-PROPOSAL-v2.md` Section 7). The
`migrations/*.sql` files may lag behind the live `api/src/store/models/*.ts`
definitions. Before running Phase 1 on a new environment, diff the model
definitions against the latest migration SQL — a column that was added to a
model but not to any migration will silently fail at runtime.

Validation:

- `/__blocklet__.js?type=json` returns a non-null `appPid` (use this as the
  liveness gate — **do not** probe `/api/health`, which payment-kit does not
  implement and which returns HTTP 501 on CF Worker builds)
- `/api/customers?page=1&pageSize=1` returns `200`, `401`, or `403` (any of
  these proves the admin routing layer is alive — anonymous requests may be
  rejected with 401/403 but still prove the handler exists)
- authenticated billing pages are reachable (manual)

### Phase 2: Import Payment Data

Preflight (conflict detection):

- snapshot every destination table that will be touched into `./migration-backups/<timestamp>/payment-kit-d1/<table>.json`
- for each target table, count existing rows; if any is non-zero, react per `conflict_policy.on_existing_d1_rows`:
  - `abort` — stop immediately (default)
  - `append` — proceed; imports use `INSERT OR IGNORE`, no data is overwritten
  - `overwrite` — permitted only when `safety.allow_destructive_d1_sql = true` and interactive confirmation is given

Tasks:

- run `node cloudflare/migrate-to-d1.js --db-path=<sqlite> --output-dir=<snapshot>/payment-migration-sql` inside the `payment-kit/blocklets/core/` directory. The generator exports **all tables present in the source database** except `customers_backup`, `payment_currencies_tmp`, and `SequelizeMeta`. It does **not** take a whitelist — if only a subset is desired, operators must drop files from the output directory before import.
- optionally pass `--skip-events` to exclude `events` (the largest and least-critical table)
- import the generated SQL files in filename order with `wrangler d1 execute --remote --file=<f>`. All statements are `INSERT OR IGNORE` — re-running is safe

Validation:

- for each critical table (`payment_customers`, `payment_currencies`, `payment_products`, `payment_prices`), row count is non-zero
- imported data is queryable through Payment APIs

### Phase 3: Validate Payment Billing Objects

Tasks:

- confirm meter exists (`payment_config.meter_name`); if missing, create only when `allow_playbook_to_create_meter = true`
- confirm payment currency exists
- confirm product exists
- confirm price exists
- confirm payment link exists; if `payment_config.expected_payment_link` is set, prefer it over auto-creation (see `on_existing_payment_link = prefer_configured`)
- confirm recharge config is consistent

Critical validation:

- meter `currency_id`
- price `metadata.credit_config.currency_id`
- recharge config target

must all align.

If they do not align, payment may succeed while Hub balance remains zero.

### Phase 4: Verify Payment Memberships

**This phase is verification-only.** Memberships are stored in
`blocklet-service`'s database, which the migration never mutates. Membership
configuration is a **manual prerequisite** that must be done by an operator
through the blocklet-service admin UI before Phase 4 runs.

Manual prerequisite (per environment, done once):

1. Open the blocklet-service admin UI for the target environment
2. For each user DID listed under `memberships.payment_admins` and
   `memberships.hub_admins` in the input yaml, grant the configured role on
   the corresponding instance (the payment-kit and hub instance DIDs)
3. Have each affected user sign out and back in so their JWT picks up the
   new role claim

Tasks (performed by the playbook):

- for each configured admin, probe a protected endpoint (e.g. `GET /api/customers` on payment-kit)
- report which DIDs are recognized as admins and which are not

Validation:

- every `memberships.payment_admins[].user_did` is recognized as an admin on payment-kit
- every `memberships.hub_admins[].user_did` is recognized as an admin on the hub

Stop conditions:

- any configured admin cannot access the corresponding protected endpoint — the
  playbook prints the manual fix steps and halts. It never writes to
  blocklet-service.

### Phase 5: Prepare and Deploy AIGNE Hub

Preflight (conflict detection):

- Payment Kit must be healthy — Phase 5 never proceeds if Phase 1 is broken
- the same deployment-recency check as Phase 1 applies to the Hub worker

Tasks:

- create Hub D1/KV if authorized and capture ids (same rule as Phase 1)
- apply **every** file in `cloudflare/migrations/` in order, not just `0001_initial.sql`. The repository already contains incremental migrations (`0002_credit_system.sql` through `0007_model_calls_meter_reported.sql`) — skipping any of them leaves the schema partial.
- set required Hub secrets. Minimum set: `APP_SK`, `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`. OAuth secrets and `ADMIN_EMAILS` are optional. Non-secret env vars (e.g. `PAYMENT_LIVEMODE`, `AI_GATEWAY_*`) go into `[vars]` or via `--var`, not `wrangler secret put`.
- deploy the Hub worker

Validation:

- Hub `/api/health` responds with `status == "healthy"` (or legacy `"ok"`) and
  the embedded `.checks.d1.ok` / `.checks.kv.ok` are both `true`
- `__blocklet__.js?type=json` returns `appPid` / `did` / `appPk` with non-null
  values (this proves `ensureRegistered()` has successfully registered the
  new hub instance with blocklet-service; the legacy `componentDid` field
  may still be `null` on CF worker builds and is not a reliable gate)
- `x-user-did` dev header auth returns 200 on `/api/user/profile` (baseline auth check)

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

Preflight (conflict detection):

- read the current value of `app:preferences` from the Hub KV namespace; if it
  exists, diff against the target value before writing. React per
  `conflict_policy.on_existing_kv_key` (`diff_then_ask` by default)

Tasks:

- confirm correct Service Binding target (implicit — validated by Phase 5 deploy dry-run)
- confirm `/payment/*` proxy behavior
- confirm `/api/did/payment/*` proxy behavior
- write configured `creditPaymentLink` into Hub KV if `payment_config.write_link_to_hub_preferences = true`; the write merges with existing preferences instead of replacing the whole key
- confirm livemode behavior

Validation:

- Hub can open Payment customer page through gateway
- checkout auth path resolves
- Hub returns correct payment link

### Phase 8: End-To-End Validation

Baseline smoke suite (no login required, executed automatically when
`validation.baseline_curl_suite = true`):

- `GET /api/health` returns `status=ok`
- `GET /api/ai-providers/model-rates` returns a non-empty list
- `GET /__blocklet__.js?type=json` returns non-null preferences
- `GET /payment/health` passes through the gateway
- `GET /api/ai-providers/models` returns a non-empty list

Manual flow (requires logged-in real user):

- validate login
- validate billing page
- validate top-up
- validate balance visibility
- validate AI usage
- validate credit deduction after AI usage

Environment is not ready until both the baseline suite and the manual flow pass.

---

## 7. Safety And Destructive Operations

The migration has exactly one job: **stand up a new environment or bring an
existing one to a known-good state without ever removing production data
accidentally**. Every destructive capability is therefore gated by an explicit
flag in `safety.*`, defaulting to false.

### 7.1 Absolute prohibitions

These actions are never performed by the playbook, regardless of flags:

- `wrangler delete` on an unqualified worker name (removing a deployed worker)
- `DROP TABLE` or `TRUNCATE` on any D1 database
- `DELETE FROM <table>` without a WHERE clause
- `wrangler kv namespace delete` on a namespace that contains keys
- force-pushing any branch in either source repository
- editing `blocklet-service` state (database, KV, deployment, or membership table directly)

### 7.2 Guarded operations

These are allowed only when the matching `safety.allow_*` flag is true AND
interactive confirmation is given (when `approvals.interactive_confirmation = true`):

| Operation                                    | Gate flag                              |
|-----------------------------------------------|----------------------------------------|
| DROP / DELETE / TRUNCATE on D1                | `safety.allow_destructive_d1_sql`      |
| `wrangler d1 delete`                          | `safety.allow_wrangler_d1_delete`      |
| `wrangler kv namespace delete`                | `safety.allow_wrangler_kv_namespace_delete` |
| `wrangler secret delete`                      | `safety.allow_wrangler_secret_delete`  |
| `wrangler delete` (remove worker)             | `safety.allow_worker_delete`           |
| Overwrite a production `[vars]` block         | `safety.allow_overwrite_production_vars` |

Enabling any flag causes the playbook to snapshot relevant state into
`./migration-backups/<timestamp>/` before running the command.

### 7.3 Skip-if-present defaults

By default, the playbook treats existing state as authoritative:

- existing secrets are **skipped**, never overwritten or deleted
- existing D1 rows trigger **abort** unless `conflict_policy` permits append / overwrite
- existing KV keys trigger a **diff-then-ask** flow
- existing payment meters / products / prices / links are **reused**, never recreated

### 7.4 Snapshots

Before every phase that touches state, the playbook writes a snapshot to
`./migration-backups/<ISO-timestamp>-<env>/`:

- full row exports (via `wrangler d1 execute --json`) of every table it plans to touch
- current value of every KV key it plans to write
- current list of secrets on each worker (names only, values are not readable by design)
- last-known-good wrangler config (copied to `*-wrangler-before.toml`)

Snapshots are the only rollback mechanism. Restoration is deliberately manual.

---

## 8. Conflict Detection

Every phase runs a read-only conflict check before any mutation. Conflicts
are surfaced as structured findings so that the operator (or an AI agent) can
decide what to do without the playbook making silent choices.

### 8.1 What counts as a conflict

| Class            | Detection rule                                                                          |
|------------------|-----------------------------------------------------------------------------------------|
| Duplicate deploy | target worker's last deploy is more recent than `conflict_policy.deployment_recency_hours` |
| Occupied D1      | destination table row count > 0                                                         |
| Occupied KV      | target key exists and its value differs from the target value                           |
| Existing secret  | `wrangler secret list` already contains the name                                        |
| Existing billing object | meter / product / price / link already exists with the configured name           |
| Resource drift   | `database_id` or `kv_namespace.id` in the wrangler config does not match the target yaml |

### 8.2 Reporting format

Conflicts are reported as a flat list per phase, each with a class, target,
current value, proposed value, and the `conflict_policy` key that governs it.
Example (emitted to stdout and to `$SNAPSHOT_DIR/conflicts.log`):

```text
Phase 2 — Import Payment Data
  [OCCUPIED_D1]      table=payment_customers rows=47 policy=on_existing_d1_rows(abort)
  [OCCUPIED_D1]      table=payment_prices    rows=3  policy=on_existing_d1_rows(abort)
Phase 7 — Wire Hub To Payment Kit
  [OCCUPIED_KV]      key=app:preferences     policy=on_existing_kv_key(diff_then_ask)
    diff:
      - creditPaymentLink: /payment/checkout/pay/plink_OLD
      + creditPaymentLink: /payment/checkout/pay/plink_NEW
```

### 8.3 Resolution matrix

| `conflict_policy` value       | Meaning                                                               |
|-------------------------------|-----------------------------------------------------------------------|
| `abort`                       | stop the phase; do not touch the conflicting resource                 |
| `use` / `skip`                | accept existing state as authoritative; proceed without mutating it   |
| `append`                      | write additively (`INSERT OR IGNORE`) — never overwrites existing rows |
| `overwrite`                   | destructive — requires a `safety.*` flag and explicit confirmation    |
| `diff_then_ask`               | show the diff to the operator and stop for a y/N decision              |
| `prefer_configured`           | (payment link only) use the value from the input file, not auto-created |

A phase with any unresolved conflict halts the migration when
`deployment.abort_on_conflict = true` (the default).

---

## 9. Known Failure Modes To Recheck Every Time

These are not theoretical risks. They were encountered in prior migration work.

### 9.1 Wrong Domain Assumption

The visible `workers.dev` domain may differ from an older example.

Rule:

- use actual target values from the execution input, not old docs

### 9.2 Missing Membership

Payment APIs may respond as unauthorized if the user is not a member of the correct instance.

Rule:

- verify instance membership explicitly

### 9.3 Livemode Passed Incorrectly

Payment livemode must be handled consistently.

Rule:

- verify livemode in env
- verify livemode in API request behavior
- do not assume request body livemode is sufficient

### 9.4 Currency Misalignment

If Payment billing objects do not use the same currency id, payment may complete but balance will appear as zero.

Rule:

- always validate meter currency alignment before E2E testing

### 9.5 Decimal Conversion Errors

Raw integer storage values may be returned without decimal conversion if validation is weak.

Rule:

- verify display and API return values are decimal-adjusted

### 9.6 Wrong Payment Link Source

Auto-created links may not match intended business policy.

Rule:

- prefer configured payment link when the policy requires it

### 9.7 Missing DID Payment Proxy

Checkout pages may fail if the Hub gateway does not forward the DID payment auth route.

Rule:

- verify `/api/did/payment/*` through Hub before declaring checkout healthy

### 9.8 Concurrency Assumptions From Architecture

Payment Kit's CF port intentionally relies on D1 CAS (compare-and-swap) for
concurrency control. It does not use in-process locks, Durable Objects, or
AsyncLock — see `payment-kit/docs/cf-migration/MIGRATION-PROPOSAL-v2.md`
Section 8 for the specific CAS patterns.

Two worker isolates may race on the same payment intent, credit grant, or
checkout quote. A single-threaded happy-path E2E test will not surface
concurrency bugs.

Rule:

- the E2E validation phase must include at least one concurrent-request
  check on the credit deduction path (e.g. fire two small AI calls in
  parallel and verify balance decreases by 2x, not 1x)
- never introduce code that assumes serialized execution within a worker

### 9.9 Wrangler Version Regression (4.75.0)

`wrangler 4.75.0`, which is the default version resolved by `npx wrangler`
against `cloudflare/package.json` if it is pinned to `^4.0.0`, has a
regression where `d1 execute --remote` silently times out on newly-created
D1 databases. Every subsequent `--file=` or `--command=` import looks like
a network failure, even though `wrangler deployments list` / `wrangler
deploy` still succeed.

Rule:

- pin wrangler to `^4.81.1` (or newer) in `cloudflare/package.json`
- Phase 0 preflight verifies the installed version

### 9.10 Migration File Numbering Collision

SQLite migrations are applied in filename order. Two files sharing the
same numeric prefix (e.g. `0006_apps_user_fields.sql` and
`0006_user_api_keys.sql`) will both run, but SQLite has no "ALTER TABLE
ADD COLUMN IF NOT EXISTS" — so if the two files contain overlapping
`ALTER TABLE ADD COLUMN` statements, the second one fails with
`duplicate column name` on every fresh environment.

Rule:

- migration filename prefixes must be unique (treat the prefix as a
  monotonically increasing migration id)
- before adding a new migration, grep `migrations/` for the proposed
  prefix
- if a collision is discovered after the fact, repair the later file to
  be idempotent (remove the duplicate ALTER, guard indexes with
  `IF NOT EXISTS`), and open a follow-up PR to rename the file

### 9.11 Payment Kit Staging Template Missing

Unlike `aigne-hub/cloudflare/wrangler.staging.toml`, which is a committed
template with `REPLACE_WITH_*` placeholders, `payment-kit/blocklets/core/cloudflare/wrangler.staging.toml`
is a committed file with **real staging values already substituted**
(account DID, database id, kv id). A new environment deploy therefore
cannot follow the "copy template, fill in placeholders" pattern for
payment-kit — the operator must either manually edit the staging file,
or add a new `wrangler.staging.toml.template` to the payment-kit repo.

Rule:

- before starting a new-environment migration, confirm which payment-kit
  config file will be used, and whether it is safe to edit in place
- if in doubt, open an issue in the payment-kit repo to request a
  proper template file (mirroring the aigne-hub structure)

---

## 10. Success Criteria

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

## 11. Recommended Companion Inputs

Use this runbook together with:

- `docs/migration/AI_EXECUTION_SPEC.md` — execution-oriented AI contract
- `docs/migration/EXECUTION_PLAYBOOK.md` — concrete shell commands per phase
- `docs/migration/deployment-input.example.yaml` — real-value input template

Recommended workflow:

1. human reads this runbook end-to-end
2. real environment values are populated into `docs/migration/.input.<env>.yaml` based on the example
3. the operator (or an AI agent following `AI_EXECUTION_SPEC.md`) runs Phase 0 and inspects the preflight report
4. if preflight is clean, the operator executes the phases via `EXECUTION_PLAYBOOK.md`, verifying the validation gate of each phase before moving to the next
