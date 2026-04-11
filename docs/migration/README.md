# Migration Docs

Standard migration documentation for deploying and migrating:

1. `payment-kit`
2. `aigne-hub`

in that order (never the other way around). These docs are
environment-agnostic and work for `staging`, `production`, or any named
environment.

---

## Files in this directory

| File                               | Audience        | Role                                                           |
|------------------------------------|-----------------|----------------------------------------------------------------|
| `MIGRATION_RUNBOOK.md`             | human operator  | narrative runbook: phases, rationale, safety, conflict rules   |
| `AI_EXECUTION_SPEC.md`             | AI agent        | execution contract: preflight, stop rules, safety, reporting   |
| `EXECUTION_PLAYBOOK.md`            | operator + AI   | concrete shell commands per phase, rollback snippets           |
| `deployment-input.example.yaml`    | operator        | input schema template — copy, fill, never commit the populated file |
| `scripts/generate-credentials.mjs` | operator        | generate DID + APP_SK pairs for hub and payment-kit            |

Related files outside this directory:

| File                                          | Role                                                    |
|-----------------------------------------------|----------------------------------------------------------|
| `cloudflare/wrangler.staging.toml`            | AIGNE Hub staging wrangler config TEMPLATE (tracked)    |
| `cloudflare/wrangler.local.toml`              | existing local/staging config (gitignored, legacy)      |

---

## Load-bearing assumption

`blocklet-service` is assumed to already exist in the target Cloudflare
account. None of these documents deploy or mutate it — they only verify
that it is present and reachable during Phase 0 preflight.

If `blocklet-service` does not exist, provision it out-of-band **before**
starting this migration.

---

## Recommended workflow

1. Human reads `MIGRATION_RUNBOOK.md` end-to-end.
2. Copy `deployment-input.example.yaml` to `docs/migration/.input.<env>.yaml`
   (gitignored) and fill every `<required>` placeholder with real values.
3. Resolve any `*_or_create` decisions: for each D1/KV resource, decide
   whether to reuse an existing id or let the playbook create it. If
   creating, also set `approvals.allow_ai_to_modify_wrangler_configs = true`
   so the new id can be written back to the wrangler config.
4. Review `safety.*` and `conflict_policy.*` — every flag defaults to the
   safest option. Explicitly enable any destructive capability you want.
5. Run Phase 0 preflight (from `EXECUTION_PLAYBOOK.md` Section 0 + Phase 0)
   and inspect the readiness report. Do **not** proceed if it reports any
   blocker or any unresolved conflict.
6. Execute phases 1-8 in order from `EXECUTION_PLAYBOOK.md`. Validate the
   gate of each phase before starting the next.
7. Keep the generated `./migration-backups/<timestamp>-<env>/` directory as
   the only rollback reference. It contains row exports, KV snapshots, and
   wrangler config backups.

---

## Safety guarantees at a glance

- The playbook never runs `wrangler delete`, `DROP`, `TRUNCATE`, or
  `DELETE FROM <table>` without an explicit `safety.allow_*` flag.
- Existing secrets are skipped by default, never overwritten or deleted.
- Existing D1 rows trigger an abort unless `conflict_policy.on_existing_d1_rows`
  is set to `append` or `overwrite`.
- Existing KV keys trigger a `diff_then_ask` flow by default.
- Existing payment meters, products, prices, and payment links are reused,
  never recreated.
- Every mutating phase snapshots the state it will touch before running.
- Every phase has a read-only conflict probe that runs before any mutation.

If any of these rules conflict with what you want to do, change the
`safety.*` or `conflict_policy.*` flags explicitly — never ask the AI to
bypass them silently.

---

## Common pitfalls on a first-time run

These were all discovered during real dry-runs of the playbook. If any of
them bite you, fix the root cause — don't work around them. See
`MIGRATION_RUNBOOK.md` Section 9 for the detailed postmortem of each.

| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| 1 | `wrangler d1 execute --remote` hangs for 5+ minutes then reports "request to Cloudflare's API timed out" on a D1 database you just created | `wrangler 4.75.0` has a known regression on new D1 databases | Pin `wrangler >= 4.81.1` in `cloudflare/package.json`; Phase 0 preflight verifies this |
| 2 | Second `0006_*.sql` migration fails with `duplicate column name: userDid` on a fresh D1 | Two migration files share the same `0006` prefix and both run `ALTER TABLE Apps ADD COLUMN userDid` | Only one migration file per numeric prefix. The second file should be idempotent (use `CREATE INDEX IF NOT EXISTS`, no duplicate ALTER). |
| 3 | `migrate-data.ts` reports "Inserted N/N rows" but D1 contains 0 rows | `execSync --command="<multi-line SQL>"` — shell treats the SQL newlines as command separators, all batches fail, catch block swallows the error but still pushes a fake "ok" entry to the summary | Use `--file=<temp.sql>` instead of `--command="..."` |
| 4 | `migrate-data.ts --command=` fails on `ArchiveExecutionLogs` (and only this table) with "command not found: tableName" | SQL uses backtick-quoted identifiers (`` `ArchiveExecutionLogs` ``); the outer shell `--command="..."` wrapper treats backticks as command substitution | Either switch to `--file=` (which avoids the shell entirely), or strip backticks from generated SQL since the table and column names are safe bare identifiers |
| 5 | `migrate-data.ts --target=<custom-env>` fails with `no environment "<custom-env>" in wrangler.toml` | The script hardcodes `--env <target>` + `aigne-hub-<target>` as the db name, which only works for `local/staging/production` | Pass `--config=<path>` and `--db-name=<name>` explicitly; the patched script short-circuits the `--env` path when `--config` is set |
| 6 | `docs/migration/.input.<env>.yaml` gets committed to git | The README says "gitignored" but the actual `.gitignore` has no matching rule | Add `docs/migration/.input.*.yaml` (and `cloudflare/wrangler.test.toml`, and `migration-backups/`) to the root `.gitignore` |
| 7 | Phase 1 validation reports `/api/health` failure on payment-kit | payment-kit does not implement `/api/health` — it returns HTTP 501 | Probe `/__blocklet__.js?type=json` and check that `appPid` is non-null |
| 8 | Phase 5 validation reports `.status == "ok"` failure on hub | Hub's `/api/health` returns `{"status": "healthy", "checks": {...}}`, not `"ok"` | Accept both: `jq -e '.status == "ok" or .status == "healthy"'` |
| 9 | `appPid` in `/__blocklet__.js?type=json` is null even after a successful deploy | `ensureRegistered()` has not run yet — it only triggers on the first inbound request that the hub processes | Make one warm-up request before checking (e.g. `curl /api/health` first, then `curl /__blocklet__.js`) |
| 10 | `yq` command not found, or its syntax doesn't match the playbook | Python-based `yq` (pip install) and Go-based `yq` (brew install, mikefarah/yq) are different tools with different syntax | The playbook expects `mikefarah/yq` (Go). Install via `brew install yq` or `sudo snap install yq`; Phase 0 preflight verifies the right flavour |
| 11 | Recovering the source hub's `APP_SK` from a local Blocklet Server's `BLOCKLET_APP_ASK` fails | `BLOCKLET_APP_ASK` is a 64-byte ED25519 expanded key (`0x` + 128 hex), but `@ocap/wallet.fromSecretKey` in CF Worker expects a 32-byte seed (64 hex, no `0x`) | Do not reuse `BLOCKLET_APP_ASK` directly. Generate a fresh `APP_SK` via `docs/migration/scripts/generate-credentials.mjs` — the new hub will register as a new blocklet-service instance, and migrated data (model rates, histories, etc.) is not tied to hub DID, so you lose nothing |
| 12 | `BLOCKLET_SESSION_SECRET` looks reusable but `wrangler secret put AUTH_SECRET` silently fails | `BLOCKLET_SESSION_SECRET` is `0x`-prefixed (66 chars total), and piping it directly includes the `0x` prefix in the CF secret | Strip the `0x` prefix before piping: `awk '{sub(/^0x/, ""); print}'` |
| 13 | AiCredentials migrate "successfully" but every provider call reports `密钥不对` / decryption failure | The `BLOCKLET_APP_EK` generated when you registered the new Cloudflare instance is **not** the `BLOCKLET_APP_EK` that encrypted the source rows — a fresh EK will never decrypt historical ciphertext. Brute-forcing KDF/salt combinations wastes time | Recover the **historical** EK from the source host: `sudo cat /data/.blocklet-server/tmp/docker/<APP_PID>/ai-kit/docker-env-blocklet-*-ai-kit`, then run `docs/migration/scripts/reencrypt-credentials.mjs` to decrypt with the historical EK and re-encrypt with the target `CREDENTIAL_ENCRYPTION_KEY` |
| 14 | Decryption fails even with a "matching" DID because someone tried the ai-kit component DID as the PBKDF2 salt | In Blocklet Server, `BLOCKLET_DID` is the **app instance DID** (same as `BLOCKLET_APP_PID`), not the component DID. The PBKDF2 salt must be the app DID like `zNKWm5HBg...`, not the component DID like `z8ia3xzq2...` | Use `BLOCKLET_APP_PID` as the salt (it is printed on the same docker-env file as the EK) |
| 15 | BS credential ciphertext is pasted directly into CF D1 expecting it to "just work" | The BS scheme is PBKDF2-SHA512/256 iter + crypto-js AES-256-CBC (OpenSSL salted). The CF scheme is PBKDF2-SHA256/100k iter + Web Crypto AES-256-GCM, salt `aigne-hub-credentials`. They are wire-incompatible | Always run the re-encryption script. Never skip Phase 6 L2's credential step — "reconfigure manually" is only safe if you are willing to lose every existing provider key |
| 16 | Playground chat answers are followed by a literal `event: server-timing data: ...` trailer that looks like part of the assistant message | The CF `/v2/chat/completions` handler serves streams as `text/plain` but was writing a SSE-framed `event: server-timing\ndata: ...\n\n` trailer for benchmark consumers. The frontend has no SSE parser on a `text/plain` stream, so the frame gets rendered verbatim | Never mix SSE frames into a `text/plain` stream. Move timing info to a response header or a dedicated endpoint if benchmarks need it; the production stream should match the legacy Blocklet Server behavior (pure token text, no trailer) |
| 17 | Every logged-in user — including confirmed admins — sees a member-only UI on the CF hub | `/api/user/info` was omitting the `role` field from the response user object even though `resolveIdentity()` had already classified the caller correctly. The frontend admin gate reads `user.role`, so without it everyone looks like a member | Add `role: user?.role \|\| 'member'` to the `/api/user/info` user object serialization — this is a serialization fix, not an auth fix |
| 18 | `blocklet-service` `settings` row for the hub instance keeps oscillating between two DIDs every minute under cron | Hub, payment-kit, and media-kit workers share one `BLOCKLET_APP_SK`. If any of them calls `registerApp({ instanceDid: 'auto' })`, the runtime derives a fresh DID from the SK and invokes `migrateInstanceDid`, which moves rows away from whichever sibling registered first. The next cron tick swings them back | Pass explicit `APP_PID` and `APP_PSK` env vars to every worker in a shared-identity deployment. `worker.ts` now honours `env.APP_PID \|\| 'auto'` — set `APP_PID` to the permanent BS-style DID and `APP_PSK` to the corresponding Provable Secret Key |
| 19 | `<blocklet-header>` renders but the Payment Kit entry point is missing, and Hub's `/payment/*` URLs resolve to an empty string | The `componentMountPoints` array injected by hub's `/__blocklet__.js` shim was missing `status: 'running'`. Multiple downstream consumers (`getPaymentBlocklet()`, `getObservabilityBlocklet()`, the `<blocklet-header>` web component) filter mount points by `point.status === 'running'` and silently drop anything without it | When injecting a synthetic Payment Kit mount point, always set `status: 'running'`. Same rule applies to any other component you inject (media-kit, observability, etc.) |
| 20 | Payment link configuration is nowhere to be found in `wrangler.*.toml`, env vars, or D1 | It lives in the hub KV namespace under the key `app:preferences`, field `creditPaymentLink`. The default preferences object does not include this field, so a new deploy requires an explicit `PUT` to merge it in | Write the payment link via CF API `PUT /storage/kv/namespaces/<id>/values/app:preferences` with the merged preferences object. The value should look like `/payment/checkout/pay/<plinkId>` and must match a payment link that is active in the Payment Kit D1 `payment_links` table |
| 21 | Large-table data imports (ModelCalls, Usages, ...) report success but D1 contains far fewer rows than expected | `wrangler d1 execute --remote` with many statements is unreliable — silent partial failures are common on large batches, and retries compound the problem. Unrelated to pitfall #3, which was a shell-quoting issue; this one persists even with `--file=` | For tables above a few thousand rows, bypass wrangler and POST statements directly to `https://api.cloudflare.com/client/v4/accounts/<acc>/d1/database/<id>/query` in batches of ~100, with explicit retry logic. One-shot `INSERT OR REPLACE` makes the import idempotent |
| 22 | `wrangler deploy` aborts with "You have exceeded the number of cron triggers allowed (5/5) for this account" | Cloudflare caps **total** cron triggers per account, not per worker. Hub, payment-kit, media-kit, and blocklet-service each want their own crons, and default configs ship with 2-3 apiece — so a 3-worker deploy blows the cap even on a clean account | Consolidate crons. Hub defaults to 3 (every-minute meter flush + hourly cleanup + daily reconciliation); collapse to just the every-minute one for staging, or move the heavier jobs into the every-minute handler with a branch check. Record the chosen layout in the playbook so the next env doesn't hit the same wall |

When you hit any of the above, fix it in the repo (not in your local
working copy), and open a PR so the next operator hits the patched version.
