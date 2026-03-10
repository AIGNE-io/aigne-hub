# AIGNE Hub Scripts

## Authentication Scripts

### `hub-auth.mjs` - Browser-based DID Wallet Authentication

Browser-based authentication for AIGNE Hub environments, modeled after `myvibe-publish` skill.

**Usage:**
```bash
# Login to staging
node scripts/hub-auth.mjs staging

# Login to production
node scripts/hub-auth.mjs production

# Login to local (requires hub URL)
node scripts/hub-auth.mjs local http://localhost:8090
```

**Features:**
- Auto-opens browser for DID Wallet QR code scan
- Uses `@aigne/cli`'s `createConnect()` for standard authentication flow
- Stores token in `~/.aigne-hub/credentials.json` for reuse
- Env-specific credential keys for multi-environment support

**Implementation:**
- Uses `@aigne/cli/utils/aigne-hub/credential.js`
- Browser auto-launch via `open` package
- Token persists until expiration

---

### `save-token.mjs` - Manual Token Storage

For scenarios where you already have an access token and want to save it directly.

**Usage:**
```bash
node scripts/save-token.mjs staging <your_token>
node scripts/save-token.mjs production <your_token>
```

---

## Pricing Analysis

### `analyze-pricing.ts` - Model Pricing Analyzer

Compare AIGNE Hub database rates against external pricing sources (LiteLLM and OpenRouter).

**Usage:**
```bash
# Analyze staging environment (credentials auto-loaded)
pnpm tsx scripts/analyze-pricing.ts --env staging

# Analyze production
pnpm tsx scripts/analyze-pricing.ts --env production

# Custom Hub URL with explicit token
pnpm tsx scripts/analyze-pricing.ts --hub-url https://hub.aigne.io --token <TOKEN>

# Adjust drift threshold (default 10%)
pnpm tsx scripts/analyze-pricing.ts --env staging --threshold 0.15

# JSON output
pnpm tsx scripts/analyze-pricing.ts --env staging --json
```

**Output:**
- Models exceeding drift threshold (default 10%)
- Comparison with LiteLLM and OpenRouter pricing
- Suggested bulk-rate-update API call

**Data Sources:**
1. **LiteLLM** (primary): `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`
2. **OpenRouter** (validation): `https://openrouter.ai/api/v1/models`
3. **Provider Pages** (reference): Official pricing documentation

---

### `detect-mount-point.mjs` - Dynamic Mount Point Detection

Automatically detects blocklet mount point for correct API URL construction.

**Why This Matters:**

Different AIGNE Hub deployments may have different mount points:
- **Staging**: Mount point `/` → API at `https://staging-hub.aigne.io/api/...`
- **Production**: Mount point `/app` → API at `https://hub.aigne.io/app/api/...`
- **Local**: DID-based URLs with custom mount points

**Usage:**
```bash
# Detect mount point for a Hub URL
node scripts/detect-mount-point.mjs https://staging-hub.aigne.io
# Output: /

node scripts/detect-mount-point.mjs https://hub.aigne.io
# Output: /app

# Use programmatically
import { buildApiUrl } from './detect-mount-point.mjs';
const apiUrl = await buildApiUrl('https://staging-hub.aigne.io', '/api/ai-providers/model-rates');
// Returns: https://staging-hub.aigne.io/api/ai-providers/model-rates

const apiUrl2 = await buildApiUrl('https://hub.aigne.io', '/api/ai-providers/model-rates');
// Returns: https://hub.aigne.io/app/api/ai-providers/model-rates
```

**Technical Details:**
- Queries `/__blocklet__.js?type=json&owner=1&nocache=1` to get component mount points
- Finds AIGNE Hub component by DID (`z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ`)
- Extracts `mountPoint` from `componentMountPoints` array
- Returns pure JSON (not HTML), more reliable than parsing JavaScript
- Falls back to `/` if detection fails

---

## Workflow

### First-Time Setup

1. **Install dependencies:**
   ```bash
   cd scripts && npm install
   ```

2. **Authenticate:**
   ```bash
   node scripts/hub-auth.mjs staging
   ```
   - Browser opens automatically
   - Scan QR code with DID Wallet
   - Token saved to `~/.aigne-hub/credentials.json`

### Run Pricing Analysis

```bash
pnpm tsx scripts/analyze-pricing.ts --env staging --threshold 0.1
```

### Re-authentication

Token expires after a period. Simply re-run `hub-auth.mjs` when needed:
```bash
node scripts/hub-auth.mjs staging
```

---

## Architecture

### Mount Point Detection Flow

```
User Input: https://staging-hub.aigne.io
         ↓
detect-mount-point.mjs
         ↓
GET /__blocklet__.js?type=json&owner=1&nocache=1
         ↓
Parse JSON → componentMountPoints array
         ↓
Find: did === "z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ"
         ↓
Extract: mountPoint = "/"
         ↓
buildApiUrl()
         ↓
Output: https://staging-hub.aigne.io/api/ai-providers/model-rates

Production example:
https://hub.aigne.io → mountPoint="/app"
→ https://hub.aigne.io/app/api/ai-providers/model-rates
```


### Authentication Flow

```
hub-auth.mjs
     ↓
createConnect() from @aigne/cli
     ↓
Browser opens: /.well-known/service/gen-simple-access-key
     ↓
User scans QR code with DID Wallet
     ↓
Poll for result (60 retries, 5s interval)
     ↓
Token received
     ↓
Save to ~/.aigne-hub/credentials.json
     ↓
analyze-pricing.ts can use stored token
```

---

## Dependencies

```json
{
  "@aigne/cli": "latest",
  "axios": "^1.6.0",
  "chalk": "^5.3.0",
  "open": "^10.0.0"
}
```

These are managed in `scripts/package.json` (separate from main project).

---

## Credential Storage

**Location:** `~/.aigne-hub/credentials.json`

**Format:**
```json
{
  "staging:https://staging-hub.aigne.io/app": {
    "token": "blocklet-zG2kwe...",
    "updatedAt": "2026-03-10T04:10:15.732Z"
  },
  "production:https://hub.aigne.io/app": {
    "token": "blocklet-...",
    "updatedAt": "2026-03-09T..."
  }
}
```

**Key Format:** `${env}:${hubUrl}/app`

---

## Integration with `.claude/skills/model-pricing-analyzer.md`

This project-specific skill guides the usage of these scripts:
- Provides step-by-step workflow
- References all key files
- Explains authentication and pricing analysis
- Documents data sources and API endpoints

**Trigger the skill:**
```bash
# Via Claude Code (project-level skills aren't callable via Skill tool)
# Follow the skill documentation manually
```

---

## Troubleshooting

### "No stored credentials" warning

**Solution:** Run authentication:
```bash
node scripts/hub-auth.mjs staging
```

### API returns HTML instead of JSON

**Cause:** Incorrect mount point or API path

**Solution:** The scripts now auto-detect mount point via `detect-mount-point.mjs`. If issues persist, verify Hub URL is correct.

### Authentication timeout

**Cause:** DID Wallet scan not completed within 5 minutes

**Solution:** Re-run `hub-auth.mjs` and scan faster, or check network connectivity.

### "Failed to detect mount point"

**Cause:** Network issue or Hub URL inaccessible

**Solution:** Check Hub URL, network, and firewall. The script will fallback to `/` as mount point.

---

## References

- **Model Registry (LiteLLM)**: `blocklets/core/api/src/libs/model-registry.ts`
- **OpenRouter Integration**: `blocklets/core/api/src/libs/openrouter-pricing.ts`
- **Pricing Comparison Engine**: `blocklets/core/api/src/libs/pricing-comparison.ts`
- **Provider Pages**: `blocklets/core/api/src/libs/provider-pricing-pages.ts`
- **Rate Check Cron**: `blocklets/core/api/src/crons/model-rate-check.ts`
- **Rate History**: `blocklets/core/api/src/store/models/ai-model-rate-history.ts`
