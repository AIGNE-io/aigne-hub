# Execution Playbook — Payment Kit + AIGNE Hub

> Complete, copy-pasteable command sequence for deploying Payment Kit and
> AIGNE Hub to a Cloudflare Workers target environment.
>
> This document is the **only** place where concrete shell commands live.
> `MIGRATION_RUNBOOK.md` explains *why*, this file explains *how*.

---

## How to use this file

1. Populate a real input file based on `deployment-input.example.yaml`.
   Save it as `docs/migration/.input.<env>.yaml` (ignored by git).
2. Export every variable from that file into the shell. A minimal loader
   for a YAML-to-env conversion is shown in **Section 0.1**.
3. Work through the phases in order. **Do not skip phases**. Each phase has
   a `PREFLIGHT`, `EXECUTE`, `VALIDATE`, and `ROLLBACK` block.
4. Every destructive command is gated by a `safety.*` flag from the input.
   If the flag is false, the command must not run.

### Assumed state (not touched by this playbook)

- `blocklet-service` Worker already deployed in the target account — this
  playbook only verifies its reachability, it never deploys or mutates it.
- `wrangler login` already done in the current shell.
- `sqlite3` CLI available locally for SQLite export operations.
- `jq` and `yq` available for JSON/YAML parsing.
- A Payment Kit **instance DID** (`APP_PID`) is already registered inside
  `blocklet-service` for this environment. The playbook cannot create one
  because that would require writing to `blocklet-service` state, which is
  out of scope. See Section 0.4 below for how to obtain it.

### Preparing credentials (once per new environment)

Before you fill the input yaml, you need to generate two pairs of
`APP_SK` keys (one for hub, one for payment-kit) and obtain the Payment Kit
`APP_PID`. Do this in a terminal and paste the values into the yaml:

```bash
# 1. Generate both APP_SK private keys
cd /path/to/aigne-hub    # or payment-kit — either has @ocap/wallet
node docs/migration/scripts/generate-credentials.mjs --labels=hub,payment

# 2. Generate AUTH_SECRET and CREDENTIAL_ENCRYPTION_KEY
openssl rand -hex 32     # use for AUTH_SECRET
openssl rand -hex 32     # use for CREDENTIAL_ENCRYPTION_KEY

# 3. Obtain APP_PID for Payment Kit (instance DID in blocklet-service).
#    Option A — blocklet-service admin UI (preferred, human operator):
#      Open <blocklet-service-admin-url>, register a "payment-kit" instance
#      under the target component DID, copy the generated instance DID.
#    Option B — direct D1 read (if you have operator access):
#      wrangler d1 execute <blocklet-service-d1-name> --remote \
#        --command "SELECT instance_did FROM instances \
#                   WHERE component_did = '<payment-kit-component-did>'"
#    Option C — reuse existing staging APP_PID (if you are only rotating keys).
```

**Never paste the output of `generate-credentials.mjs` into chat, issues,
or git commits.** The DID field is safe to share; the `APP_SK` field is not.

---

## 0. Bootstrap

### 0.1 Load input file into environment variables

```bash
# Requires: yq (https://github.com/mikefarah/yq) for YAML parsing.
INPUT_FILE="${1:?usage: $0 <input.yaml>}"
test -f "$INPUT_FILE" || { echo "Input file not found: $INPUT_FILE"; exit 1; }

# Example loader (flatten nested keys into SHELL_STYLE_VARS).
# In practice the playbook runner script does this automatically — this
# snippet is only a reference.
eval "$(yq -r '
  paths(scalars) as $p | $p | join("_") | ascii_upcase as $k
  | [$k, "=", (getpath($p) | @sh)] | join("")
' "$INPUT_FILE")"

# Key variables referenced later (flat names derived from YAML paths):
: "${DEPLOYMENT_ENV:?}"
: "${REPOS_AIGNE_HUB_PATH:?}"
: "${REPOS_PAYMENT_KIT_PATH:?}"
: "${SERVICES_BLOCKLET_SERVICE_NAME:?}"
: "${SERVICES_PAYMENT_KIT_SERVICE_NAME:?}"
: "${SERVICES_HUB_SERVICE_NAME:?}"
: "${DEPLOYMENT_DRY_RUN:=false}"
```

### 0.2 Snapshot directory

```bash
SNAPSHOT_DIR="./migration-backups/$(date -u +%Y%m%dT%H%M%SZ)-${DEPLOYMENT_ENV}"
mkdir -p "$SNAPSHOT_DIR"
echo "Backups will be written to: $SNAPSHOT_DIR"
```

### 0.3 Wrapper for dry-run safe execution

```bash
run() {
  if [ "$DEPLOYMENT_DRY_RUN" = "true" ]; then
    printf '[DRY-RUN] %s\n' "$*"
  else
    printf '[RUN]     %s\n' "$*"
    eval "$@"
  fi
}

require_safety_flag() {
  local flag="$1" cmd="$2"
  local val
  val=$(eval "echo \"\$$flag\"")
  if [ "$val" != "true" ]; then
    echo "BLOCKED: $cmd requires $flag=true in input file"
    exit 1
  fi
}

confirm() {
  [ "${APPROVALS_INTERACTIVE_CONFIRMATION:-true}" = "false" ] && return 0
  printf 'Confirm: %s [y/N] ' "$1"
  read -r reply
  [ "$reply" = "y" ] || [ "$reply" = "Y" ]
}
```

---

## Phase 0 — Preflight

Goal: verify every precondition before any mutating command runs. This
phase writes nothing. If any check fails, abort with a structured report.

### 0.P PREFLIGHT

```bash
echo "=== Phase 0: Preflight ==="

# 0.P.1 — Repo cleanliness
for repo in "$REPOS_AIGNE_HUB_PATH" "$REPOS_PAYMENT_KIT_PATH"; do
  if [ -n "$(git -C "$repo" status --porcelain)" ] && [ "$REPOS_ALLOW_DIRTY" != "true" ]; then
    echo "BLOCKED: $repo has uncommitted changes (set repos.allow_dirty=true to override)"
    exit 1
  fi
done

# 0.P.2 — Tool availability
# NOTE: yq here refers to the Go implementation (mikefarah/yq):
#   brew install yq            # macOS
#   sudo snap install yq       # Linux
# The Python jq-based "yq" shipped via pip uses a different syntax and will
# NOT work with the path expressions in this playbook.
for tool in wrangler sqlite3 jq yq node npx; do
  command -v "$tool" >/dev/null || { echo "MISSING: $tool"; exit 1; }
done
# Verify yq flavour — mikefarah/yq prints "yq (https://github.com/mikefarah/yq/)"
yq --version 2>&1 | grep -qi 'mikefarah\|yq (https' \
  || { echo "WRONG yq: expected mikefarah/yq, got Python yq"; exit 1; }
# 0.P.2b — wrangler version must be >= 4.81.1 (4.75.0 has a d1-execute-remote
# timeout regression that silently breaks Phase 6 data imports)
WRANGLER_VERSION=$(npx --yes wrangler --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [ -n "$WRANGLER_VERSION" ]; then
  MAJOR=$(echo "$WRANGLER_VERSION" | cut -d. -f1)
  MINOR=$(echo "$WRANGLER_VERSION" | cut -d. -f2)
  if [ "$MAJOR" -lt 4 ] || { [ "$MAJOR" -eq 4 ] && [ "$MINOR" -lt 81 ]; }; then
    echo "BLOCKED: wrangler $WRANGLER_VERSION too old. Require >= 4.81.1 (see docs reason)."
    exit 1
  fi
fi

# 0.P.3 — Cloudflare auth
wrangler whoami || { echo "BLOCKED: wrangler not logged in"; exit 1; }

# 0.P.4 — blocklet-service existence (NOT deployed by us, must already exist)
if ! wrangler deployments list --name "$SERVICES_BLOCKLET_SERVICE_NAME" >/dev/null 2>&1; then
  echo "BLOCKED: Worker '$SERVICES_BLOCKLET_SERVICE_NAME' not found in account '$DEPLOYMENT_CLOUDFLARE_ACCOUNT'"
  echo "  The playbook assumes blocklet-service is already deployed."
  echo "  Either create it out-of-band first, or fix services.blocklet_service_name."
  exit 1
fi

# 0.P.5 — blocklet-service liveness (optional)
if [ "$VALIDATION_VERIFY_BLOCKLET_SERVICE_REACHABLE" = "true" ]; then
  curl -fsS "$SERVICES_BLOCKLET_SERVICE_BASE_URL/__blocklet__.js?type=json" >/dev/null \
    || { echo "BLOCKED: blocklet-service base URL not reachable"; exit 1; }
fi

# 0.P.6 — Wrangler configs resolve (syntax + binding targets)
# IMPORTANT: dry-run the config the operator will actually use, NOT the default
# wrangler.toml. For a new/test environment, HUB_RESOURCES_WRANGLER_CONFIG_PATH
# points at something like cloudflare/wrangler.test.toml or wrangler.staging.toml.
( cd "$REPOS_PAYMENT_KIT_PATH/blocklets/core" \
    && npx --yes wrangler@4.81.1 deploy --dry-run --config="$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH" >/dev/null ) \
  || { echo "BLOCKED: payment-kit wrangler config invalid ($PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH)"; exit 1; }
( cd "$REPOS_AIGNE_HUB_PATH" \
    && npx --yes wrangler@4.81.1 deploy --dry-run --config="$HUB_RESOURCES_WRANGLER_CONFIG_PATH" >/dev/null ) \
  || { echo "BLOCKED: aigne-hub wrangler config invalid ($HUB_RESOURCES_WRANGLER_CONFIG_PATH)"; exit 1; }

# 0.P.7 — Source SQLite file presence (only if migration enabled).
# If the file is missing and source_data.source_download_command is set,
# the playbook will run it once before aborting. Manual fetch instructions
# are printed if the file is still missing after that.
ensure_source_db() {
  local label="$1" local_path="$2" download_cmd="$3"
  if [ "$local_path" = "skip" ]; then
    echo "  $label: skipped per policy"
    return 0
  fi
  if [ -f "$local_path" ]; then
    echo "  $label: found at $local_path"
    return 0
  fi
  if [ -n "$download_cmd" ]; then
    echo "  $label: not found locally, running download command..."
    echo "    $download_cmd"
    eval "$download_cmd" || {
      echo "BLOCKED: $label download command failed"
      return 1
    }
    [ -f "$local_path" ] || { echo "BLOCKED: $label still missing after download"; return 1; }
    return 0
  fi
  cat <<FETCH_HELP
BLOCKED: $label source database not found: $local_path
  No source_download_command configured. Fetch it manually with one of:

    # Locate on remote Blocklet Server host:
    ssh $SOURCE_DATA_SOURCE_HOST "find ~/blocklet-server-data -name '$(basename "$local_path")'"

    # Copy over:
    scp $SOURCE_DATA_SOURCE_HOST:/remote/path/to/$(basename "$local_path") "$local_path"

    # Or via rsync (resumable for large files):
    rsync -avP $SOURCE_DATA_SOURCE_HOST:/remote/path/to/$(basename "$local_path") "$local_path"

  Then re-run Phase 0.
FETCH_HELP
  return 1
}

if [ "$MIGRATION_MIGRATE_PAYMENT_DATA" = "true" ]; then
  ensure_source_db "payment" "$SOURCE_DATA_PAYMENT_SQLITE_PATH" "$SOURCE_DATA_SOURCE_DOWNLOAD_COMMAND" \
    || exit 1
fi
if [ "$MIGRATION_HUB_L2" = "true" ] || [ "$MIGRATION_HUB_L3" = "true" ]; then
  ensure_source_db "hub" "$SOURCE_DATA_HUB_SQLITE_PATH" "$SOURCE_DATA_SOURCE_DOWNLOAD_COMMAND" \
    || exit 1
fi

# 0.P.8 — Resource id sanity (no placeholders left)
grep -q '<required' "$INPUT_FILE" \
  && { echo "BLOCKED: unresolved placeholders in $INPUT_FILE"; grep -n '<required' "$INPUT_FILE"; exit 1; }

# 0.P.9 — Credential readiness (APP_SK, APP_PID, AUTH_SECRET, CREDENTIAL_ENCRYPTION_KEY)
# Each key must be non-empty AND look like a real value (not a prompt to fill).
check_credential() {
  local label="$1" value="$2" min_len="${3:-32}"
  if [ -z "$value" ] || [ ${#value} -lt "$min_len" ]; then
    echo "BLOCKED: $label is empty or too short (<$min_len chars)"
    echo "  Generate with: node docs/migration/scripts/generate-credentials.mjs"
    echo "  Then paste the value into your input yaml under the matching key."
    exit 1
  fi
}
check_credential "hub_secrets.APP_SK" "$HUB_SECRETS_APP_SK" 32
check_credential "hub_secrets.AUTH_SECRET" "$HUB_SECRETS_AUTH_SECRET" 32
check_credential "hub_secrets.CREDENTIAL_ENCRYPTION_KEY" "$HUB_SECRETS_CREDENTIAL_ENCRYPTION_KEY" 32
check_credential "payment_secrets.APP_SK" "$PAYMENT_SECRETS_APP_SK" 32
# APP_PID is a DID string, typically starts with z followed by 35+ base58 chars
if [ -z "$PAYMENT_SECRETS_APP_PID" ] || ! echo "$PAYMENT_SECRETS_APP_PID" | grep -Eq '^z[1-9A-HJ-NP-Za-km-z]{20,}$'; then
  echo "BLOCKED: payment_secrets.APP_PID does not look like a valid DID"
  echo "  APP_PID must be obtained from blocklet-service — see Section 0 'Preparing credentials'"
  exit 1
fi

# 0.P.10 — blocklet-service knows about this APP_PID (read-only check)
# We cannot look up the instances table directly (read-only rule), so we rely
# on a best-effort probe: ask blocklet-service for its public component list.
# If the endpoint is unavailable, skip with a warning rather than abort.
if [ -n "$SERVICES_BLOCKLET_SERVICE_BASE_URL" ]; then
  if ! curl -fsS "$SERVICES_BLOCKLET_SERVICE_BASE_URL/__blocklet__.js?type=json" \
        | jq -e --arg pid "$PAYMENT_SECRETS_APP_PID" \
               '[.components[]?.did // empty] | index($pid) // (.appId // .componentDid) == $pid' \
        >/dev/null 2>&1; then
    echo "WARN: could not confirm APP_PID ($PAYMENT_SECRETS_APP_PID) is registered in blocklet-service."
    echo "      Proceeding anyway — Phase 1 deploy will fail fast if APP_PID is wrong."
  fi
fi
```

### 0.V VALIDATE

```bash
echo "Phase 0 passed. Proceeding to Payment Kit deployment."
```

Stop conditions: any of 0.P.1–0.P.8 fail.

---

## Phase 1 — Deploy Payment Kit

### 1.P PREFLIGHT (conflict detection)

```bash
echo "=== Phase 1: Deploy Payment Kit ==="

# 1.P.1 — Check if Payment Kit worker already deployed recently
LAST_DEPLOY=$(wrangler deployments list --name "$SERVICES_PAYMENT_KIT_SERVICE_NAME" \
  --json 2>/dev/null | jq -r '.[0].created_on // empty')
if [ -n "$LAST_DEPLOY" ]; then
  AGE_HOURS=$(( ( $(date -u +%s) - $(date -u -d "$LAST_DEPLOY" +%s 2>/dev/null || echo 0) ) / 3600 ))
  if [ "$AGE_HOURS" -lt "${CONFLICT_POLICY_DEPLOYMENT_RECENCY_HOURS:-24}" ]; then
    case "$CONFLICT_POLICY_ON_EXISTING_DEPLOYMENT" in
      abort|abort_if_recent)
        echo "BLOCKED: payment-kit deployed ${AGE_HOURS}h ago. Set conflict_policy.on_existing_deployment=overwrite to proceed."
        exit 1
        ;;
      overwrite)
        confirm "Overwrite existing payment-kit deployment ($LAST_DEPLOY)?" || exit 1
        ;;
    esac
  fi
fi

# 1.P.2 — D1 database existence check
if [ "$PAYMENT_RESOURCES_D1_ID" = "create" ]; then
  [ "$PAYMENT_RESOURCES_CREATE_IF_MISSING" = "true" ] \
    || { echo "BLOCKED: payment D1 id=create but create_if_missing=false"; exit 1; }
fi

# 1.P.3 — Existing secrets — we skip, never delete
EXISTING_SECRETS=$(wrangler secret list \
  --config "$REPOS_PAYMENT_KIT_PATH/blocklets/core/cloudflare/wrangler.staging.toml" \
  2>/dev/null | jq -r '.[].name' | sort -u)
echo "Existing payment-kit secrets: $EXISTING_SECRETS"
```

### 1.E EXECUTE

```bash
cd "$REPOS_PAYMENT_KIT_PATH/blocklets/core"

# 1.E.1 — Create D1 if requested, capture id, write back to wrangler config
if [ "$PAYMENT_RESOURCES_D1_ID" = "create" ]; then
  NEW_ID=$(run "wrangler d1 create $PAYMENT_RESOURCES_D1_NAME" \
    | awk -F'"' '/database_id/ {print $4; exit}')
  [ -n "$NEW_ID" ] || { echo "FAIL: could not parse new D1 id"; exit 1; }
  if [ "$APPROVALS_ALLOW_AI_TO_MODIFY_WRANGLER_CONFIGS" = "true" ]; then
    sed -i.bak "s/^database_id = .*/database_id = \"$NEW_ID\"/" \
      "cloudflare/$(basename "$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH")"
    echo "Wrote new D1 id ($NEW_ID) back to wrangler config"
  else
    echo "ACTION REQUIRED: write database_id=\"$NEW_ID\" into your wrangler config manually, then rerun"
    exit 1
  fi
fi

# 1.E.2 — Create KV namespace if requested
if [ "$PAYMENT_RESOURCES_KV_ID" = "create" ]; then
  run "wrangler kv namespace create $PAYMENT_RESOURCES_KV_NAME"
  # operator/playbook must copy the id into wrangler config as in 1.E.1
fi

# 1.E.3 — Apply D1 schema + incremental migrations
for f in cloudflare/migrations/*.sql; do
  echo "Applying $f"
  run "wrangler d1 execute $PAYMENT_RESOURCES_D1_NAME --remote --file=$f \
       --config=$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH"
done

# 1.E.4 — Set secrets (skip if already present; never delete)
set_secret_if_missing() {
  local name="$1" value="$2"
  [ -z "$value" ] && return 0
  if echo "$EXISTING_SECRETS" | grep -qx "$name"; then
    case "$CONFLICT_POLICY_ON_EXISTING_SECRET" in
      skip) echo "  skip existing secret: $name"; return 0 ;;
      abort) echo "BLOCKED: secret $name already set"; exit 1 ;;
      overwrite) confirm "Overwrite existing secret $name?" || exit 1 ;;
    esac
  fi
  printf '%s' "$value" | run "wrangler secret put $name \
    --config $PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH"
}
set_secret_if_missing APP_SK "$PAYMENT_SECRETS_APP_SK"

# 1.E.5 — Deploy (build runs automatically via wrangler.*.toml [build].command)
run "wrangler deploy --config=$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH"
```

### 1.V VALIDATE

```bash
# NOTE: payment-kit does NOT currently expose /api/health — that endpoint
# returns HTTP 501 on CF Worker builds. Use /__blocklet__.js?type=json as the
# authoritative liveness signal instead.
curl -fsS "$SERVICES_PAYMENT_KIT_BASE_URL/__blocklet__.js?type=json" \
  | jq -e '(.appPid // .componentId) != null' >/dev/null \
  || { echo "FAIL: payment-kit __blocklet__.js not valid"; exit 1; }
# Optional deeper probe — payment admin endpoint should respond (401/403 OK)
status=$(curl -s -o /dev/null -w '%{http_code}' "$SERVICES_PAYMENT_KIT_BASE_URL/api/customers?page=1&pageSize=1")
case "$status" in
  200|401|403) echo "  payment-kit admin path alive ($status)" ;;
  *) echo "FAIL: payment-kit admin path returned $status"; exit 1 ;;
esac
```

### 1.R ROLLBACK

```bash
# No automatic rollback. If Phase 1 left a broken deploy, the operator must
# manually re-deploy a known-good version or restore from:
#   $SNAPSHOT_DIR/payment-kit-wrangler-before.toml
# Destructive rollback (`wrangler delete`) is blocked unless safety.allow_worker_delete=true.
```

---

## Phase 2 — Import Payment Data

Skip this phase entirely if `migration.migrate_payment_data=false`.

### 2.P PREFLIGHT (conflict detection)

```bash
echo "=== Phase 2: Import Payment Data ==="
[ "$MIGRATION_MIGRATE_PAYMENT_DATA" = "true" ] || { echo "Skipped by policy."; exit 0; }

# 2.P.1 — Snapshot destination tables that we are about to touch
mkdir -p "$SNAPSHOT_DIR/payment-kit-d1"
for table in payment_customers payment_currencies payment_methods payment_products \
             payment_prices payment_credit_grants payment_meters payment_payment_links; do
  OUT="$SNAPSHOT_DIR/payment-kit-d1/${table}.json"
  wrangler d1 execute "$PAYMENT_RESOURCES_D1_NAME" --remote \
    --config "$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH" \
    --command "SELECT * FROM $table" --json >"$OUT" 2>/dev/null || true
done

# 2.P.2 — Row-count conflict detection
for table in payment_customers payment_currencies payment_methods payment_products \
             payment_prices payment_credit_grants; do
  COUNT=$(wrangler d1 execute "$PAYMENT_RESOURCES_D1_NAME" --remote \
    --config "$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH" \
    --command "SELECT COUNT(*) as n FROM $table" --json 2>/dev/null \
    | jq -r '.[0].results[0].n // 0')
  if [ "${COUNT:-0}" -gt 0 ]; then
    case "$CONFLICT_POLICY_ON_EXISTING_D1_ROWS" in
      abort)
        echo "BLOCKED: $table has $COUNT rows. Set conflict_policy.on_existing_d1_rows=append|overwrite to proceed."
        exit 1
        ;;
      append)
        echo "  $table has $COUNT rows — will append with INSERT OR IGNORE"
        ;;
      overwrite)
        require_safety_flag "SAFETY_ALLOW_DESTRUCTIVE_D1_SQL" "overwrite non-empty table"
        confirm "Overwrite $COUNT rows in $table?" || exit 1
        ;;
    esac
  fi
done
```

### 2.E EXECUTE

```bash
cd "$REPOS_PAYMENT_KIT_PATH/blocklets/core"

# 2.E.1 — Generate SQL files from source SQLite
SKIP_FLAG=""
[ "$MIGRATION_MIGRATE_PAYMENT_SKIP_EVENTS" = "true" ] && SKIP_FLAG="--skip-events"
run "node cloudflare/migrate-to-d1.js \
     --db-path=$SOURCE_DATA_PAYMENT_SQLITE_PATH \
     --output-dir=$SNAPSHOT_DIR/payment-migration-sql \
     $SKIP_FLAG \
     --dry-run"

# 2.E.2 — Import generated SQL files in order. The generator produces
# 000-schema.sql first, then 001-<table>.sql, 002-<table>.sql, etc.
# It uses INSERT OR IGNORE — never DELETE / DROP. Safe to re-run.
for f in "$SNAPSHOT_DIR/payment-migration-sql/"*.sql; do
  echo "Importing $(basename "$f")"
  run "wrangler d1 execute $PAYMENT_RESOURCES_D1_NAME --remote \
       --config=$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH --file=$f"
done
```

### 2.V VALIDATE

```bash
# 2.V.1 — Verify row counts increased (or stayed, if data was already there)
for table in payment_customers payment_currencies payment_products payment_prices; do
  COUNT=$(wrangler d1 execute "$PAYMENT_RESOURCES_D1_NAME" --remote \
    --config "$PAYMENT_RESOURCES_WRANGLER_CONFIG_PATH" \
    --command "SELECT COUNT(*) as n FROM $table" --json \
    | jq -r '.[0].results[0].n')
  echo "  $table: $COUNT rows"
  [ "$COUNT" -gt 0 ] || { echo "FAIL: $table empty after import"; exit 1; }
done
```

### 2.R ROLLBACK

```bash
# To roll back: restore tables from snapshots in $SNAPSHOT_DIR/payment-kit-d1/.
# Rollback is MANUAL — this playbook never DELETEs without safety.allow_destructive_d1_sql=true.
```

---

## Phase 3 — Validate Payment Billing Objects

**Phase 3 is verification-only.** It does NOT create meters, products, prices,
or payment links automatically. Creating billing objects involves domain
decisions (currency choice, meter aggregation method, product pricing,
payment link livemode) that cannot be safely automated. The playbook instead
reads the current state, checks it against expectations, and prints human
instructions if anything is missing or misaligned.

### 3.P PREFLIGHT

```bash
echo "=== Phase 3: Validate Payment Billing Objects ==="

# Helper: call payment-kit admin endpoints. Uses the first hub_admin DID as
# the probing identity (the dev headers work in staging; production requires
# an authenticated cookie).
PROBE_DID=$(yq -r '.memberships.hub_admins[0].user_did' "$INPUT_FILE")
pk_api() {
  curl -fsS \
    -H "x-user-did: $PROBE_DID" -H "x-user-role: admin" \
    "$SERVICES_PAYMENT_KIT_BASE_URL$1"
}
```

### 3.E EXECUTE (read-only queries)

```bash
LIVEMODE="$PAYMENT_VARS_PAYMENT_LIVEMODE"
MISSING=""

# 3.E.1 — Meter
METERS_JSON=$(pk_api "/api/meters?livemode=$LIVEMODE&pageSize=100" || echo '{"list":[]}')
METER_JSON=$(echo "$METERS_JSON" | jq --arg name "$PAYMENT_CONFIG_METER_NAME" \
  '.list // . | map(select(.name==$name or .event_name==$name)) | .[0] // empty')
if [ -z "$METER_JSON" ]; then
  echo "  MISSING: meter '$PAYMENT_CONFIG_METER_NAME' not found"
  MISSING="$MISSING meter"
  METER_CURRENCY=""
  METER_ID=""
else
  METER_ID=$(echo "$METER_JSON" | jq -r '.id')
  METER_CURRENCY=$(echo "$METER_JSON" | jq -r '.currency_id')
  echo "  OK:      meter $METER_ID (currency=$METER_CURRENCY)"
fi

# 3.E.2 — Product
PRODUCTS_JSON=$(pk_api "/api/products?livemode=$LIVEMODE&pageSize=100" || echo '{"list":[]}')
PRODUCT_JSON=$(echo "$PRODUCTS_JSON" | jq --arg name "$PAYMENT_CONFIG_METER_NAME" \
  '.list // . | map(select(.metadata.meter_name == $name or .name == "AIGNE Hub Credits")) | .[0] // empty')
if [ -z "$PRODUCT_JSON" ]; then
  echo "  MISSING: credit product for meter '$PAYMENT_CONFIG_METER_NAME' not found"
  MISSING="$MISSING product"
  PRODUCT_ID=""
else
  PRODUCT_ID=$(echo "$PRODUCT_JSON" | jq -r '.id')
  echo "  OK:      product $PRODUCT_ID"
fi

# 3.E.3 — Price
if [ -n "$PRODUCT_ID" ]; then
  PRICES_JSON=$(pk_api "/api/prices?livemode=$LIVEMODE&product=$PRODUCT_ID&pageSize=100" || echo '{"list":[]}')
  PRICE_JSON=$(echo "$PRICES_JSON" | jq '.list // . | .[0] // empty')
  if [ -z "$PRICE_JSON" ]; then
    echo "  MISSING: no price found for product $PRODUCT_ID"
    MISSING="$MISSING price"
    PRICE_ID=""
    PRICE_CURRENCY=""
  else
    PRICE_ID=$(echo "$PRICE_JSON" | jq -r '.id')
    PRICE_CURRENCY=$(echo "$PRICE_JSON" | jq -r '.metadata.credit_config.currency_id // empty')
    echo "  OK:      price $PRICE_ID (credit_config.currency_id=$PRICE_CURRENCY)"
  fi
fi

# 3.E.4 — Payment Link
LINKS_JSON=$(pk_api "/api/payment-links?livemode=$LIVEMODE&pageSize=100" || echo '{"list":[]}')
LINK_JSON=$(echo "$LINKS_JSON" | jq --arg pid "$PRODUCT_ID" \
  '.list // . | map(select(.line_items[]?.price.product == $pid)) | .[0] // empty')
if [ -z "$LINK_JSON" ] && [ -n "$PAYMENT_CONFIG_EXPECTED_PAYMENT_LINK" ]; then
  # operator has expressed a preference — check if THAT specific link exists
  EXPECTED_PLINK=$(echo "$PAYMENT_CONFIG_EXPECTED_PAYMENT_LINK" | sed 's|.*/||')
  LINK_JSON=$(pk_api "/api/payment-links/$EXPECTED_PLINK?livemode=$LIVEMODE" 2>/dev/null || echo "")
fi
if [ -z "$LINK_JSON" ]; then
  echo "  MISSING: no payment link pointing at product $PRODUCT_ID"
  MISSING="$MISSING payment_link"
  PAYMENT_LINK_PATH=""
else
  PLINK_ID=$(echo "$LINK_JSON" | jq -r '.id')
  PAYMENT_LINK_PATH="/payment/checkout/pay/$PLINK_ID"
  echo "  OK:      payment link $PLINK_ID  (path: $PAYMENT_LINK_PATH)"
fi
```

### 3.V VALIDATE (currency alignment + expectations)

```bash
# 3.V.1 — Currency alignment (the #1 silent failure mode)
if [ -n "$METER_CURRENCY" ] && [ -n "$PRICE_CURRENCY" ] && [ "$METER_CURRENCY" != "$PRICE_CURRENCY" ]; then
  echo "FAIL: meter currency ($METER_CURRENCY) != price credit_config currency ($PRICE_CURRENCY)"
  echo "  This is the #1 silent failure: payment will succeed but balance stays zero."
  MISSING="$MISSING currency_alignment"
fi

# 3.V.2 — Match against operator-supplied expected currency id
if [ -n "$PAYMENT_CONFIG_EXPECTED_CURRENCY_ID" ] && [ -n "$METER_CURRENCY" ] \
   && [ "$METER_CURRENCY" != "$PAYMENT_CONFIG_EXPECTED_CURRENCY_ID" ]; then
  echo "FAIL: actual meter currency ($METER_CURRENCY) != expected ($PAYMENT_CONFIG_EXPECTED_CURRENCY_ID)"
  MISSING="$MISSING expected_currency"
fi

# 3.V.3 — If anything is missing, print the manual creation steps and stop
if [ -n "$MISSING" ]; then
  cat <<HUMAN_FIX

===============================================================================
Phase 3 FAILED — missing or misaligned billing objects:${MISSING}

MANUAL FIX (the playbook cannot make these business decisions automatically):

  1. Open $SERVICES_PAYMENT_KIT_BASE_URL/admin in a browser. Sign in as a user
     who has owner/admin membership on the payment-kit instance (Phase 4
     prerequisite).

  2. Meter (if missing):
     - Navigate to Billing -> Meters -> Create Meter
     - name:              ${PAYMENT_CONFIG_METER_NAME}
     - event_name:        ${PAYMENT_CONFIG_METER_NAME}
     - aggregation:       sum
     - unit:              credit
     - currency:          create a new currency with decimal=${PAYMENT_CONFIG_EXPECTED_CURRENCY_DECIMAL:-10}
                          (this becomes the meter's currency_id)

  3. Product + Price (if missing):
     - Billing -> Products -> Create Product ("AIGNE Hub Credits")
     - On that product, create a Price with metadata.credit_config pointing at
       the SAME currency_id as the meter (this is the hard part — a mismatch
       here causes silent zero-balance failures)

  4. Payment Link (if missing):
     - Billing -> Payment Links -> Create
     - Select the product created above
     - livemode must match PAYMENT_LIVEMODE=${LIVEMODE}

  5. After creating, copy the payment link path into your input yaml:
        payment_config:
          expected_payment_link: "/payment/checkout/pay/plink_XXXXX"
        payment_config:
          expected_currency_id: "pc_XXXXX"

  6. Re-run Phase 3 to verify.

Reference for why this is manual, not automatic:
  - docs/cloudflare-payment-kit-integration-guide.md (section "Meter 和 Currency 如何关联")
  - MIGRATION_RUNBOOK.md section 9.4 "Currency Misalignment"

===============================================================================
HUMAN_FIX
  exit 1
fi

echo "Phase 3 passed — all billing objects present and currency-aligned."
# Export resolved values for Phase 7 to pick up
export PHASE3_PRICE_ID="$PRICE_ID"
export PHASE3_METER_ID="$METER_ID"
export PHASE3_PAYMENT_LINK_PATH="$PAYMENT_LINK_PATH"
```

### 3.R ROLLBACK

Not applicable — Phase 3 writes nothing.

---

## Phase 4 — Verify Payment Memberships

**Phase 4 is verification-only.** It NEVER writes to blocklet-service, because
blocklet-service state is out of scope for this migration. Membership
configuration is a **manual prerequisite** the operator must have completed
beforehand — see `MIGRATION_RUNBOOK.md` Phase 4 for the manual steps.

### 4.P PREFLIGHT

```bash
echo "=== Phase 4: Verify Payment Memberships ==="
# No conflict detection — Phase 4 is read-only.
```

### 4.E EXECUTE (read-only probes)

```bash
# 4.E.1 — For each payment admin, verify they can reach an admin-scoped
# payment-kit endpoint. The x-user-did / x-user-role dev headers work in
# staging; in production use an authenticated cookie jar instead.
FAILED_PAYMENT_ADMINS=""
for admin_did in $(yq -r '.memberships.payment_admins[].user_did' "$INPUT_FILE"); do
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "x-user-did: $admin_did" -H "x-user-role: admin" \
    "$SERVICES_PAYMENT_KIT_BASE_URL/api/customers?livemode=$PAYMENT_VARS_PAYMENT_LIVEMODE&page=1&pageSize=1")
  if [ "$status" = "200" ]; then
    echo "  OK:   $admin_did has payment-kit admin access"
  else
    echo "  FAIL: $admin_did cannot reach payment-kit admin ($status)"
    FAILED_PAYMENT_ADMINS="$FAILED_PAYMENT_ADMINS $admin_did"
  fi
done

# 4.E.2 — Same check for hub admins
FAILED_HUB_ADMINS=""
for admin_did in $(yq -r '.memberships.hub_admins[].user_did' "$INPUT_FILE"); do
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "x-user-did: $admin_did" -H "x-user-role: admin" \
    "$SERVICES_HUB_BASE_URL/api/ai-providers")
  if [ "$status" = "200" ]; then
    echo "  OK:   $admin_did has hub admin access"
  else
    echo "  FAIL: $admin_did cannot reach hub admin ($status)"
    FAILED_HUB_ADMINS="$FAILED_HUB_ADMINS $admin_did"
  fi
done
```

### 4.V VALIDATE

```bash
if [ -n "$FAILED_PAYMENT_ADMINS$FAILED_HUB_ADMINS" ]; then
  cat <<'HUMAN_FIX'

===============================================================================
Phase 4 FAILED — one or more admins do not have the required access.

MANUAL FIX (the playbook cannot do this for you — blocklet-service is read-only):

  1. Open the blocklet-service admin UI for this environment.
  2. For each FAILed DID above, grant the configured role on the corresponding
     instance (payment-kit or hub).
  3. Have each affected user sign out and sign back in — this refreshes the
     JWT role claim. Without a re-login, the new role will NOT be visible
     even if the database record is updated.
  4. Re-run Phase 4 to verify.

===============================================================================
HUMAN_FIX
  exit 1
fi
echo "Phase 4 passed."
```

### 4.R ROLLBACK

Not applicable — Phase 4 writes nothing.

---

## Phase 5 — Deploy AIGNE Hub

### 5.P PREFLIGHT

```bash
echo "=== Phase 5: Deploy AIGNE Hub ==="

# 5.P.1 — Same recency check as 1.P.1 but for hub service
LAST=$(wrangler deployments list --name "$SERVICES_HUB_SERVICE_NAME" --json 2>/dev/null | jq -r '.[0].created_on // empty')
# ... identical handling as Phase 1

# 5.P.2 — Payment Kit must be healthy (phase ordering gate)
curl -fsS "$SERVICES_PAYMENT_KIT_BASE_URL/api/health" >/dev/null \
  || { echo "BLOCKED: payment-kit not healthy; Phase 1/2/3 must pass first"; exit 1; }
```

### 5.E EXECUTE

```bash
cd "$REPOS_AIGNE_HUB_PATH/cloudflare"

# 5.E.1 — Resource creation (same pattern as 1.E.1)
[ "$HUB_RESOURCES_D1_ID" = "create" ] && run "wrangler d1 create $HUB_RESOURCES_D1_NAME"
[ "$HUB_RESOURCES_KV_ID" = "create" ] && run "wrangler kv namespace create $HUB_RESOURCES_KV_NAME"

# 5.E.2 — Apply ALL incremental schema migrations (not just 0001)
for f in migrations/*.sql; do
  echo "Applying $f"
  run "wrangler d1 execute $HUB_RESOURCES_D1_NAME --remote \
       --config=$HUB_RESOURCES_WRANGLER_CONFIG_PATH --file=$f"
done

# 5.E.3 — Secrets (skip-if-present pattern from 1.E.4)
set_secret_if_missing APP_SK "$HUB_SECRETS_APP_SK"
set_secret_if_missing AUTH_SECRET "$HUB_SECRETS_AUTH_SECRET"
set_secret_if_missing CREDENTIAL_ENCRYPTION_KEY "$HUB_SECRETS_CREDENTIAL_ENCRYPTION_KEY"
set_secret_if_missing GOOGLE_CLIENT_ID "$HUB_SECRETS_GOOGLE_CLIENT_ID"
set_secret_if_missing GOOGLE_CLIENT_SECRET "$HUB_SECRETS_GOOGLE_CLIENT_SECRET"
set_secret_if_missing GITHUB_CLIENT_ID "$HUB_SECRETS_GITHUB_CLIENT_ID"
set_secret_if_missing GITHUB_CLIENT_SECRET "$HUB_SECRETS_GITHUB_CLIENT_SECRET"
set_secret_if_missing ADMIN_EMAILS "$HUB_SECRETS_ADMIN_EMAILS"

# 5.E.4 — Deploy
run "wrangler deploy --config=$HUB_RESOURCES_WRANGLER_CONFIG_PATH"
```

### 5.V VALIDATE

```bash
# Accept "healthy" OR "ok" — the current implementation returns "healthy"
# with a deep-check payload ({d1, kv}); older revisions used "ok".
curl -fsS "$SERVICES_HUB_BASE_URL/api/health" \
  | jq -e '.status == "ok" or .status == "healthy"' \
  || { echo "FAIL: hub health"; exit 1; }
curl -fsS "$SERVICES_HUB_BASE_URL/__blocklet__.js?type=json" | jq -e '.componentDid' \
  || { echo "FAIL: hub __blocklet__.js"; exit 1; }
```

---

## Phase 6 — Migrate Hub Data

### 6.P PREFLIGHT

```bash
echo "=== Phase 6: Migrate Hub Data ==="
mkdir -p "$SNAPSHOT_DIR/aigne-hub-d1"

# 6.P.1 — Snapshot all tables we may touch
for table in AiProviders AiModelRates AiModelStatuses Apps AiCredentials Projects \
             ModelCalls ModelCallStats Usages AiModelRateHistories; do
  wrangler d1 execute "$HUB_RESOURCES_D1_NAME" --remote \
    --config "$HUB_RESOURCES_WRANGLER_CONFIG_PATH" \
    --command "SELECT * FROM $table" --json \
    >"$SNAPSHOT_DIR/aigne-hub-d1/${table}.json" 2>/dev/null || true
done

# 6.P.2 — Conflict detection for each enabled layer
check_nonempty() {
  local table="$1"
  local count
  count=$(wrangler d1 execute "$HUB_RESOURCES_D1_NAME" --remote \
    --config "$HUB_RESOURCES_WRANGLER_CONFIG_PATH" \
    --command "SELECT COUNT(*) as n FROM $table" --json 2>/dev/null \
    | jq -r '.[0].results[0].n // 0')
  if [ "${count:-0}" -gt 0 ]; then
    echo "  $table has $count rows"
    [ "$CONFLICT_POLICY_ON_EXISTING_D1_ROWS" = "abort" ] && { echo "BLOCKED"; exit 1; }
  fi
}
[ "$MIGRATION_HUB_L1" = "true" ] && for t in AiProviders AiModelRates AiModelStatuses; do check_nonempty "$t"; done
[ "$MIGRATION_HUB_L2" = "true" ] && for t in Apps AiCredentials Projects; do check_nonempty "$t"; done
[ "$MIGRATION_HUB_L3" = "true" ] && for t in ModelCalls Usages; do check_nonempty "$t"; done
```

### 6.E EXECUTE

```bash
cd "$REPOS_AIGNE_HUB_PATH/cloudflare"

# IMPORTANT: for custom environments (anything other than local/staging/production)
# you MUST pass --config=<path> and --db-name=<name> to both scripts. Older
# revisions of these scripts hardcoded `aigne-hub-${target}` as the db name and
# added `--env ${target}` to the wrangler call, which requires an [env.<target>]
# section in wrangler.toml that does not exist for new environments. The scripts
# now short-circuit that path when --config is supplied.

# 6.E.1 — L1 public sync (always safe — script uses INSERT OR REPLACE on 3 tables)
if [ "$MIGRATION_HUB_L1" = "true" ]; then
  SOURCE_HUB_URL=$(yq -r '.source_data.hub_api_url // ""' "$INPUT_FILE")
  [ -n "$SOURCE_HUB_URL" ] || SOURCE_HUB_URL="$SERVICES_HUB_BASE_URL"
  run "npx tsx scripts/sync-from-hub.ts \
       --hub=$SOURCE_HUB_URL \
       --target=$DEPLOYMENT_ENV \
       --config=$HUB_RESOURCES_WRANGLER_CONFIG_PATH \
       --db-name=$HUB_RESOURCES_D1_NAME"
fi

# 6.E.2 — L2 sensitive (only if explicitly enabled)
if [ "$MIGRATION_HUB_L2" = "true" ]; then
  L2_TABLES="Apps,Projects"
  [ "$MIGRATION_MIGRATE_AI_CREDENTIALS" = "true" ] && L2_TABLES="$L2_TABLES,AiCredentials"
  run "npx tsx scripts/migrate-data.ts \
       --source=$SOURCE_DATA_HUB_SQLITE_PATH \
       --target=$DEPLOYMENT_ENV \
       --config=$HUB_RESOURCES_WRANGLER_CONFIG_PATH \
       --db-name=$HUB_RESOURCES_D1_NAME \
       --tables=$L2_TABLES"
fi

# 6.E.3 — L3 historical
if [ "$MIGRATION_HUB_L3" = "true" ]; then
  run "npx tsx scripts/migrate-data.ts \
       --source=$SOURCE_DATA_HUB_SQLITE_PATH \
       --target=$DEPLOYMENT_ENV \
       --config=$HUB_RESOURCES_WRANGLER_CONFIG_PATH \
       --db-name=$HUB_RESOURCES_D1_NAME \
       --tables=ModelCalls,ModelCallStats,Usages,AiModelRateHistories,ArchiveExecutionLogs"
fi
```

**Known failure modes to watch for in Phase 6:**

1. *`wrangler d1 execute --remote` timing out* — verify wrangler is >= 4.81.1
   (`npx --yes wrangler --version`). 4.75.0 has a regression that times out on
   new D1 databases.
2. *`[Table] Error in batch N: Command failed`* — if the error message mentions
   `/bin/sh` not finding a column name, the shell is interpreting a backtick
   identifier as command substitution. This happens when the script uses
   `--command="..."` instead of `--file=<path>`. Make sure you are on the
   patched `migrate-data.ts` that writes each batch to a temp SQL file.
3. *`AiCredentials` decryption errors at runtime* — the new hub's
   `CREDENTIAL_ENCRYPTION_KEY` is different from the source, so migrated
   ciphertext will not decrypt. Either skip the `AiCredentials` table entirely
   (`migration.migrate_ai_credentials = false`) and have operators re-add
   provider keys manually in the hub admin UI, or reuse the source hub's
   `CREDENTIAL_ENCRYPTION_KEY` exactly.

### 6.V VALIDATE

```bash
run "npx tsx scripts/verify-migration.ts \
     --source=$SOURCE_DATA_HUB_SQLITE_PATH \
     --target=$DEPLOYMENT_ENV"
```

### 6.R ROLLBACK

```bash
# Snapshots in $SNAPSHOT_DIR/aigne-hub-d1/*.json can be restored manually.
```

---

## Phase 7 — Wire Hub to Payment Kit

### 7.P PREFLIGHT

```bash
echo "=== Phase 7: Wire Hub to Payment Kit ==="
# Check current KV preferences before overwriting
CURRENT_PREFS=$(wrangler kv key get "app:preferences" \
  --namespace-id "$HUB_RESOURCES_KV_ID" --remote 2>/dev/null || echo "")
echo "Current preferences: $CURRENT_PREFS"
```

### 7.E EXECUTE

```bash
# 7.E.1 — Verify service binding target is correct (read-only check)
wrangler tail "$SERVICES_HUB_SERVICE_NAME" --format=pretty &
TAIL_PID=$!
sleep 2
curl -fsS "$SERVICES_HUB_BASE_URL/payment/health" >/dev/null \
  || { kill $TAIL_PID 2>/dev/null; echo "FAIL: /payment/* proxy broken"; exit 1; }
kill $TAIL_PID 2>/dev/null

# 7.E.2 — Write configured payment link into KV (conflict-aware)
if [ "$PAYMENT_CONFIG_WRITE_LINK_TO_HUB_PREFERENCES" = "true" ] \
   && [ -n "$PAYMENT_CONFIG_EXPECTED_PAYMENT_LINK" ]; then
  NEW_PREFS=$(echo "${CURRENT_PREFS:-{\}}" \
    | jq --arg link "$PAYMENT_CONFIG_EXPECTED_PAYMENT_LINK" '.creditPaymentLink = $link')
  if [ "$CURRENT_PREFS" != "$NEW_PREFS" ] && [ -n "$CURRENT_PREFS" ]; then
    case "$CONFLICT_POLICY_ON_EXISTING_KV_KEY" in
      diff_then_ask)
        diff <(echo "$CURRENT_PREFS" | jq -S .) <(echo "$NEW_PREFS" | jq -S .) || true
        confirm "Apply the diff above?" || exit 1
        ;;
      abort) echo "BLOCKED: KV key differs"; exit 1 ;;
    esac
  fi
  echo "$NEW_PREFS" | run "wrangler kv key put app:preferences - \
    --namespace-id=$HUB_RESOURCES_KV_ID --remote"
fi
```

### 7.V VALIDATE

```bash
curl -fsS "$SERVICES_HUB_BASE_URL/api/user/info" \
  -H "x-user-did: ${MEMBERSHIPS_HUB_ADMINS_0_USER_DID}" -H "x-user-role: admin" \
  | jq -e '.paymentLink | test("plink_|/payment/")' \
  || echo "WARN: paymentLink field looks non-standard — manually verify"
```

---

## Phase 8 — End-to-End Validation

### 8.V Baseline smoke tests (no login required)

```bash
echo "=== Phase 8: End-to-End Validation ==="
[ "$VALIDATION_BASELINE_CURL_SUITE" = "true" ] && {
  curl -fsS "$SERVICES_HUB_BASE_URL/api/health" | jq -e '.status == "ok" or .status == "healthy"'
  curl -fsS "$SERVICES_HUB_BASE_URL/api/ai-providers/model-rates" \
    | jq -e '(.list // .data) | length > 0'
  curl -fsS "$SERVICES_HUB_BASE_URL/__blocklet__.js?type=json" \
    | jq -e '.preferences.creditBasedBillingEnabled != null'
  curl -fsS "$SERVICES_HUB_BASE_URL/payment/health"
  curl -fsS "$SERVICES_HUB_BASE_URL/api/ai-providers/models" | jq -e 'length > 0'
}
```

### 8.M Manual flow checklist (authenticated)

```text
The following require a logged-in real user — no CLI automation.

[ ] Log in at $SERVICES_HUB_BASE_URL via DID Connect
[ ] Navigate to /config/billing — billing page loads
[ ] Click "Top Up" — checkout opens on Payment Kit with correct livemode
[ ] Complete checkout with test payment method
[ ] Return to hub — /api/user/info shows increased balance
[ ] Trigger a small AI call via /api/v2/chat/completions
[ ] /api/user/info shows balance decreased by the expected amount
```

---

## Rollback philosophy

- All snapshots land under `$SNAPSHOT_DIR`.
- The playbook never calls `wrangler delete`, `wrangler d1 delete`, `wrangler
  kv namespace delete`, or `wrangler secret delete` unless the corresponding
  `safety.allow_*` flag is explicitly `true` AND interactive confirmation is
  given.
- SQL imports use `INSERT OR IGNORE` / `INSERT OR REPLACE` — they never
  `DELETE` or `DROP`.
- Schema migrations use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF
  NOT EXISTS` — re-running a phase is idempotent.
- To undo a deploy, redeploy a known-good commit. Restoring D1 rows requires
  manually loading the corresponding `$SNAPSHOT_DIR/<service>-d1/*.json`
  through an ad-hoc import script — intentionally not automated, because
  automated restore would itself be destructive.

---

## Appendix A — Cross-reference to wrangler configs

| File                                                              | Role                                 |
|-------------------------------------------------------------------|--------------------------------------|
| `<payment-kit>/blocklets/core/cloudflare/wrangler.toml`           | Payment Kit local / prod template    |
| `<payment-kit>/blocklets/core/cloudflare/wrangler.staging.toml`   | Payment Kit staging (authoritative)  |
| `<payment-kit>/blocklets/core/cloudflare/run-build.js`            | esbuild wrapper — invoked by deploy  |
| `<payment-kit>/blocklets/core/cloudflare/migrate-to-d1.js`        | SQLite -> D1 generator (whole-db)    |
| `<payment-kit>/blocklets/core/cloudflare/migrations/*.sql`        | Payment Kit D1 schema                |
| `<aigne-hub>/cloudflare/wrangler.toml`                            | Hub prod + env.production            |
| `<aigne-hub>/cloudflare/wrangler.local.toml`                      | Hub staging / migration envs         |
| `<aigne-hub>/cloudflare/migrations/*.sql`                         | Hub D1 schema (7 files, not 1)       |
| `<aigne-hub>/cloudflare/scripts/sync-from-hub.ts`                 | L1 public sync                       |
| `<aigne-hub>/cloudflare/scripts/migrate-data.ts`                  | L2/L3 SQLite -> D1                   |
| `<aigne-hub>/cloudflare/scripts/verify-migration.ts`              | Row-count verification               |

## Appendix B — Variable naming convention

YAML path `hub_resources.d1_name` flattens to shell var `HUB_RESOURCES_D1_NAME`.
Array elements flatten as `<PATH>_<INDEX>_<FIELD>` —
`memberships.hub_admins[0].user_did` → `MEMBERSHIPS_HUB_ADMINS_0_USER_DID`.
