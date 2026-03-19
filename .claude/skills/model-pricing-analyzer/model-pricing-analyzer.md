---
name: model-pricing-analyzer
description: Analyze and compare AI model pricing across multiple sources. Use when asked to check model pricing, verify rates, or update model costs.
---

# Model Pricing Analyzer

## Overview

This skill guides you through analyzing AI model pricing by comparing AIGNE Hub's database rates against external pricing sources (LiteLLM, OpenRouter, and provider official pages).

## When to Use

- User asks to check/verify model pricing
- User asks to update model rates
- User wants to compare pricing across providers
- User asks about pricing drift or discrepancies

## Workflow

### Prerequisites

First-time setup requires authentication via DID Wallet:

```bash
# Login to staging environment (one-time setup)
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs login staging

# Or login to production
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs login production
```

This opens your browser for DID Wallet authentication and saves the token to `~/.aigne-hub/credentials.json`.

## Step 1: Run the Analysis Script

### Option A: Quick Analysis with HTML Report (Recommended)

```bash
# One-command analysis + HTML report generation
bash .claude/skills/model-pricing-analyzer/scripts/analyze-and-report.sh staging 0.1
bash .claude/skills/model-pricing-analyzer/scripts/analyze-and-report.sh production 0.1

# Opens a beautiful HTML report in your browser
```

### Option B: CLI Analysis Only

```bash
# Analyze staging environment
pnpm tsx .claude/skills/model-pricing-analyzer/scripts/analyze-pricing.ts --env staging --threshold 0.1

# Analyze production environment
pnpm tsx .claude/skills/model-pricing-analyzer/scripts/analyze-pricing.ts --env production --threshold 0.1

# Generate HTML report manually
pnpm tsx .claude/skills/model-pricing-analyzer/scripts/analyze-pricing.ts --env staging --json > .claude/skills/model-pricing-analyzer/output/report.json
sed -n '/^\[/,$p' .claude/skills/model-pricing-analyzer/output/report.json > .claude/skills/model-pricing-analyzer/output/clean.json
node .claude/skills/model-pricing-analyzer/scripts/generate-html-report.mjs .claude/skills/model-pricing-analyzer/output/clean.json pricing-report.html
```

Options:
- `--env <env>`: Environment (local, staging, production) - auto-loads credentials
- `--hub-url <url>`: Hub API base URL (default: `http://localhost:8090`)
- `--threshold <n>`: Drift threshold as decimal (default: 0.1 = 10%)
- `--json`: Output as JSON
- `--token <token>`: Auth token (auto-loaded if --env is specified)
- `--scrape`: Force direct scraping of provider pages (instead of default remote catalog)
- `--no-scrape`: Skip official pricing fetch entirely, use existing local cache

Note: By default, official pricing is fetched from the pre-built remote catalog at `blocklet/model-pricing-data`. No API keys or manual scraping needed.

### Step 2: Interpret Results

The script outputs:
1. **Drifted models**: Models where DB pricing differs from external sources by more than the threshold
2. **OK models**: Models within the threshold
3. **Bulk update suggestion**: A ready-to-use API call for updating drifted models

### Step 3: Manual Verification (for edge cases)

When the script can't cover a model (new provider, page structure change), use WebFetch on official pricing pages:

| Provider | Pricing Page URL |
|----------|-----------------|
| OpenAI | https://openai.com/api/pricing/ |
| Anthropic | https://docs.anthropic.com/en/docs/about-claude/models |
| Google | https://ai.google.dev/pricing |
| DeepSeek | https://api-docs.deepseek.com/quick_start/pricing |
| xAI | https://docs.x.ai/docs/models#models-and-pricing |
| Bedrock | https://aws.amazon.com/bedrock/pricing/ |

### Step 4: Apply Updates

Use the bulk-rate-update API:

```bash
curl -X POST <HUB_URL>/api/ai-providers/bulk-rate-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{ "rates": [...] }'
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/analyze-pricing.ts` | CLI analysis script with mount point detection |
| `scripts/hub-auth.mjs` | Browser-based DID Wallet authentication (like myvibe-publish) |
| `scripts/detect-mount-point.mjs` | Auto-detect blocklet mount point for correct API URLs |
| `blocklets/core/api/src/libs/openrouter-pricing.ts` | OpenRouter pricing module |
| `blocklets/core/api/src/libs/pricing-comparison.ts` | Three-source comparison engine |
| `blocklets/core/api/src/libs/provider-pricing-pages.ts` | Provider page URLs & scraping |
| `blocklets/core/api/src/libs/model-registry.ts` | LiteLLM data source |
| `blocklets/core/api/src/crons/model-rate-check.ts` | Automated 6h rate check cron |
| `blocklets/core/api/src/store/models/ai-model-rate.ts` | DB model rate schema |

## Technical Implementation

### Dynamic Mount Point Detection

The skill automatically detects the blocklet's mount point by querying `/__blocklet__.js?type=json&owner=1&nocache=1` and finding the AIGNE Hub component (DID: `z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ`) in the `componentMountPoints` array. This ensures correct API URL construction across different deployment configurations:

- **Staging**: `https://staging-hub.aigne.io` (mount point: `/`) → API: `https://staging-hub.aigne.io/api/...`
- **Production**: `https://hub.aigne.io` (mount point: `/app`) → API: `https://hub.aigne.io/app/api/...`
- **Local**: Dynamic DID-based URLs → Mount point auto-detected

**Why this matters:** The endpoint returns pure JSON with all component mount points, making it more reliable than parsing HTML/JavaScript responses.

### Authentication Flow

Modeled after `myvibe-publish` skill:
1. Uses `@aigne/cli`'s `createConnect()` for DID Wallet authentication
2. Auto-opens browser for QR code scan
3. Stores token in `~/.aigne-hub/credentials.json` with env-specific keys
4. Token persists across sessions until expired

## Rate Calculation Formula

AIGNE Hub uses per-token pricing:
- **unitCosts.input**: Cost per input token (USD)
- **unitCosts.output**: Cost per output token (USD)
- **inputRate**: Applied rate per input token (may include markup)
- **outputRate**: Applied rate per output token (may include markup)

Drift formula: `abs(db - source) / abs(source)`

When `source = 0` and `db = 0`, drift is 0; when `source = 0` and `db > 0`, drift is 1 (100%).

### Three Classification Dimensions

The report classifies models along three independent dimensions (a model can appear in multiple):

1. **Cost Drift** (`exceedsThreshold`): DB unit costs differ from external sources (LiteLLM/OpenRouter) by > threshold. Input and output drift are calculated separately, max is taken.
2. **Pricing Loss** (`hasPricingIssue`): Selling price (inputRate/outputRate) is below unit cost by > 2%. Independent of cost drift.
3. **Missing Unit Costs** (`missingUnitCosts`): No `unitCosts.input`/`output` configured. Cost drift and margin calculations are skipped for these models.

## API Reference

### GET /api/ai-providers/model-rates
Returns all model rates with provider info.

### POST /api/ai-providers/bulk-rate-update
Batch update model rates. Body: `{ rates: [{ provider, model, type, unitCosts: { input, output } }] }`

### GET /api/ai-providers/:providerId/model-rates
Returns rates for a specific provider.
