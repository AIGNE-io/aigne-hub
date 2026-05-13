# Pricing Automation Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing pricing system to support end-to-end automated price sync: scrape official prices → match to DB models → bulk update unitCosts → recalculate rates → record history → notify.

**Architecture:** Incremental enhancement of existing infrastructure. Enhance `provider-aliases.ts` with provider tiers and richer model name mapping. Extend `bulk-rate-update` API with a new "sync" mode that accepts direct unitCost arrays. Add `deprecated` field to model rates for soft-delete. Leverage existing `AiModelRateHistory` and `NotificationManager` for change tracking and reporting.

**Tech Stack:** TypeScript, Sequelize (SQLite), Bun test framework, Blocklet SDK notifications

**Spec:** `docs/superpowers/specs/2026-03-16-pricing-automation-design.md`

---

## File Structure

```
Modified files:
  .claude/skills/model-pricing-analyzer/scripts/provider-aliases.ts  — Add tiers, overrides, resolveModelMapping()
  blocklets/core/api/src/routes/ai-providers.ts                      — Add sync mode to bulk-rate-update
  blocklets/core/api/src/store/models/ai-model-rate.ts               — Add deprecated fields
  blocklets/core/api/src/store/models/ai-model-rate-history.ts       — Add status field
  blocklets/core/api/src/providers/model-rate-cache.ts               — Update afterUpdate hook for changeType context
  blocklets/core/api/src/crons/model-rate-check.ts                   — Use status field in drift records

New files:
  blocklets/core/api/src/store/migrations/20260316000001-add-model-rate-deprecated.ts
  blocklets/core/api/src/store/migrations/20260316000002-add-history-status.ts
  blocklets/core/api/src/libs/bulk-rate-sync.ts                      — Sync mode logic (extracted from route)
  blocklets/core/api/src/tests/provider-aliases.test.ts              — Tests for mapping logic
  blocklets/core/api/src/tests/bulk-rate-sync.test.ts                — Tests for sync logic
```

---

## Chunk 1: Model Name Mapping Enhancement

### Task 1: Enhance provider-aliases.ts with tiers and overrides

**Files:**
- Modify: `.claude/skills/model-pricing-analyzer/scripts/provider-aliases.ts`
- Create: `blocklets/core/api/src/tests/provider-aliases.test.ts`

- [ ] **Step 1: Write tests for new mapping functionality**

Create `blocklets/core/api/src/tests/provider-aliases.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import {
  PROVIDER_TIERS,
  MODEL_NAME_OVERRIDES,
  modelNameFallbacks,
  resolveModelMapping,
  normalizeProvider,
} from '../../../../../.claude/skills/model-pricing-analyzer/scripts/provider-aliases';

describe('PROVIDER_TIERS', () => {
  test('tier1 includes all primary providers', () => {
    expect(PROVIDER_TIERS.tier1).toContain('openai');
    expect(PROVIDER_TIERS.tier1).toContain('anthropic');
    expect(PROVIDER_TIERS.tier1).toContain('google');
    expect(PROVIDER_TIERS.tier1).toContain('xai');
    expect(PROVIDER_TIERS.tier1).toContain('deepseek');
    expect(PROVIDER_TIERS.tier1).toContain('doubao');
  });

  test('tier2 includes secondary providers', () => {
    expect(PROVIDER_TIERS.tier2).toContain('poe');
    expect(PROVIDER_TIERS.tier2).toContain('openrouter');
  });

  test('no overlap between tiers', () => {
    const overlap = PROVIDER_TIERS.tier1.filter((p) => PROVIDER_TIERS.tier2.includes(p));
    expect(overlap).toHaveLength(0);
  });
});

describe('modelNameFallbacks', () => {
  test('strips trailing -0 from claude models', () => {
    expect(modelNameFallbacks('claude-sonnet-4-0')).toContain('claude-sonnet-4');
  });

  test('strips date suffix from OpenAI models', () => {
    const fallbacks = modelNameFallbacks('gpt-4o-2024-08-06');
    expect(fallbacks).toContain('gpt-4o');
  });

  test('strips date suffix from gpt-4-turbo variant', () => {
    const fallbacks = modelNameFallbacks('gpt-4-turbo-2024-04-09');
    expect(fallbacks).toContain('gpt-4-turbo');
  });

  test('does not strip non-date suffixes', () => {
    const fallbacks = modelNameFallbacks('gpt-4o-mini');
    expect(fallbacks).not.toContain('gpt-4o');
  });

  test('returns empty for models without fallbacks', () => {
    expect(modelNameFallbacks('gemini-2.0-flash')).toHaveLength(0);
  });
});

describe('MODEL_NAME_OVERRIDES', () => {
  test('maps known misspellings', () => {
    expect(MODEL_NAME_OVERRIDES['gemini-flash-2.5']).toBe('gemini-2.5-flash');
  });
});

describe('resolveModelMapping', () => {
  test('tier1 provider returns itself', () => {
    const result = resolveModelMapping('gpt-4o', 'openai');
    expect(result.primaryProvider).toBe('openai');
    expect(result.primaryModel).toBe('gpt-4o');
  });

  test('openrouter model with provider prefix', () => {
    const result = resolveModelMapping('anthropic/claude-sonnet-4', 'openrouter');
    expect(result.primaryProvider).toBe('anthropic');
    expect(result.primaryModel).toBe('claude-sonnet-4');
  });

  test('openrouter model with unknown prefix falls back', () => {
    const result = resolveModelMapping('meta-llama/llama-3', 'openrouter');
    expect(result.primaryProvider).toBe('openrouter');
    expect(result.primaryModel).toBe('meta-llama/llama-3');
  });

  test('poe model matched by name pattern', () => {
    const result = resolveModelMapping('claude-sonnet-4', 'poe');
    expect(result.primaryProvider).toBe('anthropic');
    expect(result.primaryModel).toBe('claude-sonnet-4');
  });

  test('poe model with gpt prefix', () => {
    const result = resolveModelMapping('gpt-4o', 'poe');
    expect(result.primaryProvider).toBe('openai');
    expect(result.primaryModel).toBe('gpt-4o');
  });

  test('applies MODEL_NAME_OVERRIDES', () => {
    const result = resolveModelMapping('gemini-flash-2.5', 'google');
    expect(result.primaryModel).toBe('gemini-2.5-flash');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && bun test api/src/tests/provider-aliases.test.ts`
Expected: FAIL — `PROVIDER_TIERS`, `MODEL_NAME_OVERRIDES`, `resolveModelMapping` not exported

- [ ] **Step 3: Implement the enhanced provider-aliases.ts**

In `.claude/skills/model-pricing-analyzer/scripts/provider-aliases.ts`, add after the existing `PROVIDER_ALIASES`:

```typescript
/**
 * Provider tier classification.
 * tier1: Primary providers with direct pricing pages.
 * tier2: Aggregators that resell tier1 models — inherit tier1 pricing.
 */
export const PROVIDER_TIERS = {
  tier1: ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'doubao'] as const,
  tier2: ['poe', 'openrouter', 'rock'] as const,
};

/**
 * Static overrides for model names that can't be derived by rules.
 * Maps external/misspelled name → canonical DB model name.
 */
export const MODEL_NAME_OVERRIDES: Record<string, string> = {
  'gemini-flash-2.5': 'gemini-2.5-flash',
  'gpt-3.5-turbo-instruct': 'gpt-3.5-turbo-instruct',
};
```

Replace the existing `modelNameFallbacks()` with:

```typescript
export function modelNameFallbacks(model: string): string[] {
  const fallbacks: string[] = [];

  // Override takes highest priority
  if (MODEL_NAME_OVERRIDES[model]) {
    fallbacks.push(MODEL_NAME_OVERRIDES[model]);
    return fallbacks;
  }

  // claude-xxx-N-0 → claude-xxx-N
  if (/^claude-.*-\d+-0$/.test(model)) {
    fallbacks.push(model.replace(/-0$/, ''));
  }

  // gpt-4o-2024-08-06 → gpt-4o (date suffix: YYYY-MM-DD)
  const dateMatch = model.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    fallbacks.push(dateMatch[1]);
  }

  return fallbacks;
}
```

Add the new `resolveModelMapping()`:

```typescript
/**
 * For tier2 providers, resolve the underlying tier1 provider and model name.
 * For tier1 providers, returns as-is (with override/fallback applied).
 */
export function resolveModelMapping(
  dbModel: string,
  dbProvider: string
): { primaryProvider: string; primaryModel: string } {
  const canonicalProvider = normalizeProvider(dbProvider) || dbProvider;
  const isTier2 = (PROVIDER_TIERS.tier2 as readonly string[]).includes(canonicalProvider);

  // Apply model name overrides
  const resolvedModel = MODEL_NAME_OVERRIDES[dbModel] || dbModel;

  if (!isTier2) {
    return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
  }

  // OpenRouter: "anthropic/claude-sonnet-4" → split on /
  if (canonicalProvider === 'openrouter' && resolvedModel.includes('/')) {
    const [providerPrefix, ...modelParts] = resolvedModel.split('/');
    const mappedProvider = normalizeProvider(providerPrefix);
    if (mappedProvider && (PROVIDER_TIERS.tier1 as readonly string[]).includes(mappedProvider)) {
      return { primaryProvider: mappedProvider, primaryModel: modelParts.join('/') };
    }
  }

  // Poe and others: infer provider from model name prefix
  const MODEL_PREFIX_TO_PROVIDER: Record<string, string> = {
    'claude-': 'anthropic',
    'gpt-': 'openai',
    'o1-': 'openai',
    'o3-': 'openai',
    'o4-': 'openai',
    'gemini-': 'google',
    'grok-': 'xai',
    'deepseek-': 'deepseek',
  };

  for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
    if (resolvedModel.startsWith(prefix)) {
      return { primaryProvider: provider, primaryModel: resolvedModel };
    }
  }

  // Can't resolve — return as-is
  return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && bun test api/src/tests/provider-aliases.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/model-pricing-analyzer/scripts/provider-aliases.ts blocklets/core/api/src/tests/provider-aliases.test.ts
git commit -m "feat(pricing): enhance model name mapping with tiers, overrides, and resolveModelMapping"
```

---

## Chunk 2: Database Migrations

### Task 2: Add deprecated fields to AiModelRate

**Files:**
- Create: `blocklets/core/api/src/store/migrations/20260316000001-add-model-rate-deprecated.ts`
- Modify: `blocklets/core/api/src/store/models/ai-model-rate.ts`

- [ ] **Step 1: Create migration file**

Create `blocklets/core/api/src/store/migrations/20260316000001-add-model-rate-deprecated.ts`:

```typescript
import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    AiModelRates: [
      { name: 'deprecated', field: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false } },
      { name: 'deprecatedAt', field: { type: DataTypes.DATE, allowNull: true } },
      { name: 'deprecatedReason', field: { type: DataTypes.STRING(100), allowNull: true } },
    ],
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('AiModelRates', 'deprecated');
  await context.removeColumn('AiModelRates', 'deprecatedAt');
  await context.removeColumn('AiModelRates', 'deprecatedReason');
};
```

- [ ] **Step 2: Add fields to AiModelRate model**

In `blocklets/core/api/src/store/models/ai-model-rate.ts`, add to the class declaration:

```typescript
declare deprecated: boolean;
declare deprecatedAt: Date | null;
declare deprecatedReason: string | null;
```

And add to the `init()` attributes:

```typescript
deprecated: {
  type: DataTypes.BOOLEAN,
  defaultValue: false,
  allowNull: false,
},
deprecatedAt: {
  type: DataTypes.DATE,
  allowNull: true,
},
deprecatedReason: {
  type: DataTypes.STRING(100),
  allowNull: true,
},
```

- [ ] **Step 3: Update public models endpoint to exclude deprecated**

In `blocklets/core/api/src/routes/ai-providers.ts`, find the `GET /api/ai-providers/models` handler and add a `where` clause:

```typescript
// In the findAll for public models endpoint, add:
where: {
  ...(req.query.includeDeprecated !== 'true' ? { deprecated: false } : {}),
},
```

- [ ] **Step 4: Commit**

```bash
git add blocklets/core/api/src/store/migrations/20260316000001-add-model-rate-deprecated.ts \
       blocklets/core/api/src/store/models/ai-model-rate.ts \
       blocklets/core/api/src/routes/ai-providers.ts
git commit -m "feat(pricing): add deprecated fields to AiModelRate for soft-delete"
```

### Task 3: Add status field to AiModelRateHistory

**Files:**
- Create: `blocklets/core/api/src/store/migrations/20260316000002-add-history-status.ts`
- Modify: `blocklets/core/api/src/store/models/ai-model-rate-history.ts`

- [ ] **Step 1: Create migration file**

Create `blocklets/core/api/src/store/migrations/20260316000002-add-history-status.ts`:

```typescript
import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    AiModelRateHistories: [
      { name: 'status', field: { type: DataTypes.STRING(20), defaultValue: 'applied', allowNull: false } },
    ],
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('AiModelRateHistories', 'status');
};
```

- [ ] **Step 2: Add status field to model**

In `blocklets/core/api/src/store/models/ai-model-rate-history.ts`, add:

```typescript
// Type
export type HistoryStatus = 'detected' | 'approved' | 'applied' | 'dismissed';

// Class declaration
declare status: HistoryStatus;

// Attributes in init()
status: {
  type: DataTypes.STRING(20),
  defaultValue: 'applied',
  allowNull: false,
},
```

- [ ] **Step 3: Update model-rate-check.ts to use status='detected'**

In `blocklets/core/api/src/crons/model-rate-check.ts`, in the `recordDriftHistory` function, add `status: 'detected'` to each record in the `drifted.map()`:

```typescript
// Add to each record object:
status: 'detected',
```

- [ ] **Step 4: Update model-rate-cache.ts afterUpdate hook to use status='applied'**

In `blocklets/core/api/src/providers/model-rate-cache.ts`, in the `afterUpdate` hook's `AiModelRateHistory.create()` call, add:

```typescript
status: 'applied',
```

- [ ] **Step 5: Commit**

```bash
git add blocklets/core/api/src/store/migrations/20260316000002-add-history-status.ts \
       blocklets/core/api/src/store/models/ai-model-rate-history.ts \
       blocklets/core/api/src/crons/model-rate-check.ts \
       blocklets/core/api/src/providers/model-rate-cache.ts
git commit -m "feat(pricing): add status field to AiModelRateHistory for approval workflow"
```

---

## Chunk 3: Bulk Rate Sync API

### Task 4: Implement bulk-rate-sync logic

**Files:**
- Create: `blocklets/core/api/src/libs/bulk-rate-sync.ts`
- Create: `blocklets/core/api/src/tests/bulk-rate-sync.test.ts`

- [ ] **Step 1: Write tests for sync logic**

Create `blocklets/core/api/src/tests/bulk-rate-sync.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';

// Test the pure matching logic, not DB operations
import { matchUpdateToDbRate, buildSyncResult } from '../libs/bulk-rate-sync';

describe('matchUpdateToDbRate', () => {
  const dbRates = [
    { id: '1', providerId: 'openai', model: 'gpt-4o', type: 'chatCompletion', unitCosts: { input: 0.0000025, output: 0.00001 } },
    { id: '2', providerId: 'anthropic', model: 'claude-sonnet-4', type: 'chatCompletion', unitCosts: { input: 0.000003, output: 0.000015 } },
    { id: '3', providerId: 'openrouter', model: 'anthropic/claude-sonnet-4', type: 'chatCompletion', unitCosts: { input: 0.000003, output: 0.000015 } },
    { id: '4', providerId: 'google', model: 'gemini-2.5-flash', type: 'chatCompletion', unitCosts: { input: 0.0000001, output: 0.0000004 } },
  ];

  test('exact match by provider and model', () => {
    const match = matchUpdateToDbRate(dbRates, 'openai', 'gpt-4o');
    expect(match?.id).toBe('1');
  });

  test('match with date suffix fallback', () => {
    const match = matchUpdateToDbRate(dbRates, 'openai', 'gpt-4o-2024-08-06');
    expect(match?.id).toBe('1');
  });

  test('no match returns null', () => {
    const match = matchUpdateToDbRate(dbRates, 'openai', 'gpt-5');
    expect(match).toBeNull();
  });

  test('match with MODEL_NAME_OVERRIDES', () => {
    const match = matchUpdateToDbRate(dbRates, 'google', 'gemini-flash-2.5');
    expect(match?.id).toBe('4');
  });
});

describe('buildSyncResult', () => {
  test('categorizes updates correctly', () => {
    const result = buildSyncResult({
      updated: [{ model: 'gpt-4o', provider: 'openai' }],
      unchanged: [{ model: 'claude-sonnet-4', provider: 'anthropic' }],
      unmatched: [{ model: 'gpt-5', provider: 'openai' }],
      errors: [],
    });
    expect(result.summary.updated).toBe(1);
    expect(result.summary.unchanged).toBe(1);
    expect(result.summary.unmatched).toBe(1);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.total).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && bun test api/src/tests/bulk-rate-sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement bulk-rate-sync.ts**

Create `blocklets/core/api/src/libs/bulk-rate-sync.ts`:

```typescript
import { modelNameFallbacks, resolveModelMapping, PROVIDER_TIERS } from '../../../../../.claude/skills/model-pricing-analyzer/scripts/provider-aliases';

export interface SyncUpdate {
  providerId: string;
  model: string;
  unitCosts: { input: number; output: number };
  caching?: { readRate?: number; writeRate?: number };
  source?: string;
}

export interface SyncOptions {
  applyRates?: boolean;
  profitMargin?: number;
  creditPrice?: number;
}

interface DbRateLike {
  id: string;
  providerId: string;
  model: string;
  type?: string;
  unitCosts?: { input: number; output: number } | null;
  [key: string]: any;
}

interface UpdatedEntry {
  id: string;
  model: string;
  provider: string;
  oldUnitCosts: { input: number; output: number } | null;
  newUnitCosts: { input: number; output: number };
  oldRates?: { inputRate: number; outputRate: number };
  newRates?: { inputRate: number; outputRate: number };
}

interface UnmatchedEntry {
  model: string;
  provider: string;
  source?: string;
}

interface ErrorEntry {
  model: string;
  provider: string;
  error: string;
}

export interface SyncResult {
  updated: UpdatedEntry[];
  unchanged: UpdatedEntry[];
  unmatched: UnmatchedEntry[];
  errors: ErrorEntry[];
  summary: {
    total: number;
    updated: number;
    unchanged: number;
    unmatched: number;
    errors: number;
  };
}

/**
 * Match an update request to a DB model rate record.
 * Tries: exact match → MODEL_NAME_OVERRIDES → modelNameFallbacks.
 */
export function matchUpdateToDbRate(
  dbRates: DbRateLike[],
  providerId: string,
  model: string
): DbRateLike | null {
  // Try exact match
  const exact = dbRates.find((r) => r.providerId === providerId && r.model === model);
  if (exact) return exact;

  // Try fallback names
  const fallbacks = modelNameFallbacks(model);
  for (const fallback of fallbacks) {
    const match = dbRates.find((r) => r.providerId === providerId && r.model === fallback);
    if (match) return match;
  }

  return null;
}

/**
 * Build the summary result object from categorized updates.
 */
export function buildSyncResult(data: {
  updated: any[];
  unchanged: any[];
  unmatched: any[];
  errors: any[];
}): SyncResult {
  return {
    ...data,
    summary: {
      total: data.updated.length + data.unchanged.length + data.unmatched.length + data.errors.length,
      updated: data.updated.length,
      unchanged: data.unchanged.length,
      unmatched: data.unmatched.length,
      errors: data.errors.length,
    },
  };
}

/**
 * Check if unitCosts have changed (with tolerance for floating point).
 */
export function unitCostsChanged(
  oldCosts: { input: number; output: number } | null | undefined,
  newCosts: { input: number; output: number }
): boolean {
  if (!oldCosts) return true;
  const tolerance = 1e-15;
  return (
    Math.abs(oldCosts.input - newCosts.input) > tolerance ||
    Math.abs(oldCosts.output - newCosts.output) > tolerance
  );
}

/**
 * Calculate selling rate from unit cost using margin formula.
 * rate = unitCost * (1 + profitMargin/100) / creditPrice
 */
export function calculateSyncRate(unitCost: number, profitMargin: number, creditPrice: number): number {
  if (unitCost <= 0 || creditPrice <= 0) return 0;
  return (unitCost * (1 + profitMargin / 100)) / creditPrice;
}

/**
 * Propagate tier1 unitCosts to tier2 models.
 * Returns additional SyncUpdate[] entries for tier2 models that inherit from tier1.
 */
export function propagateToTier2(
  dbRates: DbRateLike[],
  tier1Updates: Map<string, { input: number; output: number }>
): SyncUpdate[] {
  const tier2Rates = dbRates.filter((r) =>
    (PROVIDER_TIERS.tier2 as readonly string[]).includes(r.providerId)
  );

  const propagated: SyncUpdate[] = [];

  for (const rate of tier2Rates) {
    const { primaryProvider, primaryModel } = resolveModelMapping(rate.model, rate.providerId);
    const key = `${primaryProvider}:${primaryModel}`;
    const tier1Cost = tier1Updates.get(key);

    if (tier1Cost) {
      propagated.push({
        providerId: rate.providerId,
        model: rate.model,
        unitCosts: tier1Cost,
        source: `inherited:${primaryProvider}`,
      });
    }
  }

  return propagated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && bun test api/src/tests/bulk-rate-sync.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add blocklets/core/api/src/libs/bulk-rate-sync.ts blocklets/core/api/src/tests/bulk-rate-sync.test.ts
git commit -m "feat(pricing): add bulk-rate-sync library with matching and propagation logic"
```

### Task 5: Wire sync mode into the bulk-rate-update API endpoint

**Files:**
- Modify: `blocklets/core/api/src/routes/ai-providers.ts` (lines ~1255-1336)

- [ ] **Step 1: Add sync mode validation schema**

In `blocklets/core/api/src/routes/ai-providers.ts`, find `bulkRateUpdateSchema` (around line 202) and replace with a schema that supports both modes:

```typescript
const bulkRateUpdateSchema = Joi.object({
  mode: Joi.string().valid('margin', 'sync').default('margin'),

  // margin mode fields (required when mode=margin)
  profitMargin: Joi.number().when('mode', {
    is: 'margin',
    then: Joi.required(),
    otherwise: Joi.when('applyRates', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
  }),
  creditPrice: Joi.number().positive().when('mode', {
    is: 'margin',
    then: Joi.required(),
    otherwise: Joi.when('applyRates', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
  }),

  // sync mode fields
  updates: Joi.array()
    .items(
      Joi.object({
        providerId: Joi.string().required(),
        model: Joi.string().required(),
        unitCosts: Joi.object({
          input: Joi.number().min(0).required(),
          output: Joi.number().min(0).required(),
        }).required(),
        caching: Joi.object({
          readRate: Joi.number().min(0),
          writeRate: Joi.number().min(0),
        }).optional(),
        source: Joi.string().optional(),
      })
    )
    .when('mode', { is: 'sync', then: Joi.required() }),
  applyRates: Joi.boolean().default(false),
});
```

- [ ] **Step 2: Add sync mode handler to the route**

In the `bulk-rate-update` route handler (line ~1255), after the existing margin mode logic, add a branch for sync mode. Restructure the handler:

```typescript
router.post('/bulk-rate-update', ensureAdmin, async (req, res) => {
  try {
    const { error, value } = bulkRateUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0]?.message || 'Validation error' });
    }

    if (value.mode === 'sync') {
      return handleSyncMode(req, res, value);
    }

    // ... existing margin mode code stays unchanged ...
  } catch (error) {
    logger.error('Failed to bulk update model rates:', error);
    return res.status(500).json({ error: formatError(error) || 'Failed to bulk update model rates' });
  }
});
```

Add the sync handler function (import from bulk-rate-sync):

```typescript
import {
  matchUpdateToDbRate,
  buildSyncResult,
  unitCostsChanged,
  calculateSyncRate,
  propagateToTier2,
  type SyncUpdate,
} from '@api/libs/bulk-rate-sync';
import AiModelRateHistory from '@api/store/models/ai-model-rate-history';

async function handleSyncMode(req: any, res: any, value: any) {
  const { updates, applyRates, profitMargin, creditPrice } = value;

  const dbRates = await AiModelRate.findAll({
    include: [{ model: AiProvider, as: 'provider', attributes: ['id', 'name', 'displayName'] }],
  });

  const updated: any[] = [];
  const unchanged: any[] = [];
  const unmatched: any[] = [];
  const errors: any[] = [];
  const tier1Updates = new Map<string, { input: number; output: number }>();

  for (const update of updates as SyncUpdate[]) {
    const match = matchUpdateToDbRate(dbRates as any[], update.providerId, update.model);

    if (!match) {
      unmatched.push({ model: update.model, provider: update.providerId, source: update.source });
      continue;
    }

    if (!unitCostsChanged(match.unitCosts, update.unitCosts)) {
      unchanged.push({ id: match.id, model: match.model, provider: match.providerId });
      continue;
    }

    try {
      const updateData: any = { unitCosts: update.unitCosts };
      if (update.caching) updateData.caching = update.caching;

      if (applyRates && profitMargin != null && creditPrice != null) {
        updateData.inputRate = calculateSyncRate(update.unitCosts.input, profitMargin, creditPrice);
        updateData.outputRate = calculateSyncRate(update.unitCosts.output, profitMargin, creditPrice);
      }

      const oldUnitCosts = match.unitCosts || null;
      const oldRates = { inputRate: Number(match.inputRate), outputRate: Number(match.outputRate) };

      await (match as any).update(updateData);

      const entry = {
        id: match.id,
        model: match.model,
        provider: match.providerId,
        oldUnitCosts,
        newUnitCosts: update.unitCosts,
        oldRates,
        newRates: applyRates
          ? { inputRate: updateData.inputRate, outputRate: updateData.outputRate }
          : oldRates,
      };
      updated.push(entry);

      // Track tier1 updates for propagation
      tier1Updates.set(`${match.providerId}:${match.model}`, update.unitCosts);
    } catch (err: any) {
      errors.push({ model: match.model, provider: match.providerId, error: err.message });
    }
  }

  // Propagate to tier2 providers
  const tier2Updates = propagateToTier2(dbRates as any[], tier1Updates);
  for (const t2 of tier2Updates) {
    const match = dbRates.find((r) => r.providerId === t2.providerId && r.model === t2.model);
    if (!match) continue;
    if (!unitCostsChanged(match.unitCosts, t2.unitCosts)) continue;

    try {
      const updateData: any = { unitCosts: t2.unitCosts };
      if (applyRates && profitMargin != null && creditPrice != null) {
        updateData.inputRate = calculateSyncRate(t2.unitCosts.input, profitMargin, creditPrice);
        updateData.outputRate = calculateSyncRate(t2.unitCosts.output, profitMargin, creditPrice);
      }
      await (match as any).update(updateData);
      updated.push({
        id: match.id,
        model: match.model,
        provider: match.providerId,
        oldUnitCosts: match.unitCosts || null,
        newUnitCosts: t2.unitCosts,
        source: t2.source,
      });
    } catch (err: any) {
      errors.push({ model: match.model, provider: match.providerId, error: err.message });
    }
  }

  // Create bulk update summary history record
  if (updated.length > 0) {
    await AiModelRateHistory.create({
      providerId: 'system',
      model: '_bulk_sync',
      type: 'system',
      changeType: 'bulk_update',
      status: 'applied',
      source: 'bulk_sync_api',
      previousUnitCosts: null,
      currentUnitCosts: null,
      previousRates: null,
      currentRates: null,
      driftPercent: null,
      detectedAt: Math.floor(Date.now() / 1000),
      metadata: {
        totalUpdated: updated.length,
        totalUnchanged: unchanged.length,
        totalUnmatched: unmatched.length,
        totalErrors: errors.length,
        updates: updated.map((u) => ({
          model: u.model,
          provider: u.provider,
          oldInput: u.oldUnitCosts?.input,
          newInput: u.newUnitCosts.input,
          oldOutput: u.oldUnitCosts?.output,
          newOutput: u.newUnitCosts.output,
        })),
      },
    });
  }

  const result = buildSyncResult({ updated, unchanged, unmatched, errors });

  return res.json({
    message: `Sync completed: ${result.summary.updated} updated, ${result.summary.unchanged} unchanged, ${result.summary.unmatched} unmatched`,
    ...result,
  });
}
```

- [ ] **Step 3: Verify the server compiles**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && npx tsc --noEmit api/src/routes/ai-providers.ts` (or equivalent build check)

- [ ] **Step 4: Commit**

```bash
git add blocklets/core/api/src/routes/ai-providers.ts
git commit -m "feat(pricing): add sync mode to bulk-rate-update API with tier2 propagation"
```

---

## Chunk 4: History Approval APIs & Notifications

### Task 6: Add history approval and change report APIs

**Files:**
- Modify: `blocklets/core/api/src/routes/ai-providers.ts`

- [ ] **Step 1: Add approval endpoints**

Add after the `bulk-rate-update` route:

```typescript
// Approve a detected drift for later batch-apply
router.post('/model-rate-history/:id/approve', ensureAdmin, async (req, res) => {
  try {
    const record = await AiModelRateHistory.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'History record not found' });
    if (record.status !== 'detected') {
      return res.status(400).json({ error: `Cannot approve record with status '${record.status}'` });
    }
    await record.update({ status: 'approved' });
    return res.json({ message: 'Approved', id: record.id });
  } catch (error) {
    return res.status(500).json({ error: formatError(error) || 'Failed to approve' });
  }
});

// Dismiss a detected drift
router.post('/model-rate-history/:id/dismiss', ensureAdmin, async (req, res) => {
  try {
    const record = await AiModelRateHistory.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'History record not found' });
    if (record.status !== 'detected') {
      return res.status(400).json({ error: `Cannot dismiss record with status '${record.status}'` });
    }
    await record.update({ status: 'dismissed' });
    return res.json({ message: 'Dismissed', id: record.id });
  } catch (error) {
    return res.status(500).json({ error: formatError(error) || 'Failed to dismiss' });
  }
});

// Batch-apply all approved drift records
router.post('/model-rate-history/batch-apply', ensureAdmin, async (req, res) => {
  try {
    const approved = await AiModelRateHistory.findAll({
      where: { status: 'approved', changeType: 'source_drift' },
    });

    if (approved.length === 0) {
      return res.json({ message: 'No approved records to apply', applied: 0 });
    }

    const applied: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const record of approved) {
      try {
        // Find the model rate and update its unitCosts from the drift source data
        const modelRate = await AiModelRate.findOne({
          where: { providerId: record.providerId, model: record.model },
        });

        if (!modelRate) {
          failed.push({ id: record.id, error: 'Model rate not found' });
          continue;
        }

        // Use the best source cost from metadata
        const sources = record.metadata?.sources || {};
        const bestSource = Object.values(sources)[0] as any;
        if (bestSource?.inputCostPerToken != null) {
          await modelRate.update({
            unitCosts: {
              input: bestSource.inputCostPerToken,
              output: bestSource.outputCostPerToken || 0,
            },
          });
        }

        await record.update({ status: 'applied' });
        applied.push(record.id);
      } catch (err: any) {
        failed.push({ id: record.id, error: err.message });
      }
    }

    return res.json({
      message: `Applied ${applied.length} of ${approved.length} records`,
      applied: applied.length,
      failed,
    });
  } catch (error) {
    return res.status(500).json({ error: formatError(error) || 'Failed to batch apply' });
  }
});
```

- [ ] **Step 2: Add change report query endpoint**

```typescript
// Get recent bulk update history
router.get('/model-rate-history', ensureAdmin, async (req, res) => {
  try {
    const { changeType, status, limit = 20, offset = 0 } = req.query;
    const where: any = {};
    if (changeType) where.changeType = changeType;
    if (status) where.status = status;

    const { count, rows } = await AiModelRateHistory.findAndCountAll({
      where,
      order: [['detectedAt', 'DESC']],
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
    });

    return res.json({ total: count, records: rows });
  } catch (error) {
    return res.status(500).json({ error: formatError(error) || 'Failed to fetch history' });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add blocklets/core/api/src/routes/ai-providers.ts
git commit -m "feat(pricing): add history approval, batch-apply, and change report APIs"
```

### Task 7: Enhance notifications with change report

**Files:**
- Modify: `blocklets/core/api/src/crons/model-rate-check.ts`

- [ ] **Step 1: Enhance drift notification with actionable details**

In `model-rate-check.ts`, update the `sendDriftNotification()` function to include a more detailed body and action link:

```typescript
async function sendDriftNotification(drifted: PriceDiscrepancy[]): Promise<void> {
  const lines = drifted.slice(0, 10).map((d) => {
    const driftStr = `${(d.maxDrift * 100).toFixed(1)}%`;
    return `- ${d.providerName}/${d.model}: ${driftStr} drift`;
  });

  const body = [
    `Detected ${drifted.length} model(s) with price drift exceeding threshold.`,
    '',
    ...lines,
    ...(drifted.length > 10 ? [`- ... and ${drifted.length - 10} more`] : []),
    '',
    'Review and approve updates in the admin panel.',
  ].join('\n');

  await NotificationManager.sendCustomNotificationByRoles(['owner', 'admin'], {
    title: `Price Drift Detected: ${drifted.length} model(s)`,
    body,
    actions: [
      {
        name: 'review',
        title: 'Review Model Rates',
        link: '/admin/ai-providers',
      },
    ],
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add blocklets/core/api/src/crons/model-rate-check.ts
git commit -m "feat(pricing): enhance drift notification with detailed change report"
```

---

## Chunk 5: Integration & Verification

### Task 8: End-to-end verification

- [ ] **Step 1: Run all tests**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && bun test api/src/tests/provider-aliases.test.ts api/src/tests/bulk-rate-sync.test.ts`
Expected: All tests PASS

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/zac/work/arcblock/aigne-hub/blocklets/core && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify migrations are valid**

Check that the migration files follow the existing pattern in `api/src/store/migrations/` and will be picked up by the migration runner.

- [ ] **Step 4: Manual smoke test checklist**

If a dev server is available:

1. Call `POST /api/ai-providers/bulk-rate-update` with `mode: "sync"` and a few test updates
2. Verify response contains `updated`, `unchanged`, `unmatched` categories
3. Check `AiModelRateHistory` table has new `bulk_update` records with `status: 'applied'`
4. Verify deprecated models are excluded from `GET /api/ai-providers/models`
5. Call `GET /api/ai-providers/model-rate-history?changeType=bulk_update` and verify results

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(pricing): address integration issues from smoke testing"
```
