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

### Step 1: Run the Analysis Script

```bash
npx ts-node scripts/analyze-pricing.ts --hub-url <HUB_URL> --threshold 0.1
```

Options:
- `--hub-url <url>`: Hub API base URL (default: `http://localhost:8090`)
- `--threshold <n>`: Drift threshold as decimal (default: 0.1 = 10%)
- `--json`: Output as JSON
- `--token <token>`: Auth token if needed

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
| `scripts/analyze-pricing.ts` | CLI analysis script |
| `blocklets/core/api/src/libs/openrouter-pricing.ts` | OpenRouter pricing module |
| `blocklets/core/api/src/libs/pricing-comparison.ts` | Three-source comparison engine |
| `blocklets/core/api/src/libs/provider-pricing-pages.ts` | Provider page URLs & scraping |
| `blocklets/core/api/src/libs/model-registry.ts` | LiteLLM data source |
| `blocklets/core/api/src/crons/model-rate-check.ts` | Automated 6h rate check cron |
| `blocklets/core/api/src/store/models/ai-model-rate.ts` | DB model rate schema |

## Rate Calculation Formula

AIGNE Hub uses per-token pricing:
- **unitCosts.input**: Cost per input token (USD)
- **unitCosts.output**: Cost per output token (USD)
- **inputRate**: Applied rate per input token (may include markup)
- **outputRate**: Applied rate per output token (may include markup)

Drift formula: `abs(db - source) / max(db, source)`

## API Reference

### GET /api/ai-providers/model-rates
Returns all model rates with provider info.

### POST /api/ai-providers/bulk-rate-update
Batch update model rates. Body: `{ rates: [{ provider, model, type, unitCosts: { input, output } }] }`

### GET /api/ai-providers/:providerId/model-rates
Returns rates for a specific provider.
