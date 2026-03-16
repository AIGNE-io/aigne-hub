/**
 * Bulk Rate Sync — core matching and sync logic.
 *
 * Consumes OfficialPricingEntry[] from the pricing catalog scraper
 * and matches them to DB model rate records for bulk update.
 *
 * NOTE: Provider alias/mapping logic is inlined here to avoid cross-package imports.
 * The canonical version lives in .claude/skills/model-pricing-analyzer/scripts/provider-aliases.ts
 */

// ── Provider Mapping (subset inlined from provider-aliases.ts) ──

const PROVIDER_ALIASES: Record<string, string> = {
  gemini: 'google',
  vertex_ai: 'google',
  vertex_ai_beta: 'google',
  google: 'google',
  anthropic: 'anthropic',
  openai: 'openai',
  'text-completion-openai': 'openai',
  chatgpt: 'openai',
  deepseek: 'deepseek',
  xai: 'xai',
  'x-ai': 'xai',
  openrouter: 'openrouter',
  volcengine: 'doubao',
};

function normalizeProvider(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (PROVIDER_ALIASES[lower]) return PROVIDER_ALIASES[lower];
  for (const [alias, canonical] of Object.entries(PROVIDER_ALIASES)) {
    if (lower.startsWith(alias)) return canonical;
  }
  if (lower.startsWith('bedrock')) return 'bedrock';
  return undefined;
}

const PROVIDER_TIERS = {
  tier1: ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'doubao'] as const,
  tier2: ['poe', 'openrouter', 'rock'] as const,
};

const MODEL_NAME_OVERRIDES: Record<string, string> = {
  'gemini-flash-2.5': 'gemini-2.5-flash',
  'gpt-3.5-turbo-instruct': 'gpt-3.5-turbo-instruct',
};

function modelNameFallbacks(model: string): string[] {
  if (MODEL_NAME_OVERRIDES[model]) return [MODEL_NAME_OVERRIDES[model]];

  const fallbacks: string[] = [];
  if (/^claude-.*-\d+-0$/.test(model)) {
    fallbacks.push(model.replace(/-0$/, ''));
  }
  const dateMatch = model.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch?.[1]) {
    fallbacks.push(dateMatch[1]);
  }
  return fallbacks;
}

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

function resolveModelMapping(dbModel: string, dbProvider: string): { primaryProvider: string; primaryModel: string } {
  const canonicalProvider = normalizeProvider(dbProvider) || dbProvider;
  const isTier2 = (PROVIDER_TIERS.tier2 as readonly string[]).includes(canonicalProvider);
  const resolvedModel = MODEL_NAME_OVERRIDES[dbModel] || dbModel;

  if (!isTier2) {
    return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
  }

  if (canonicalProvider === 'openrouter' && resolvedModel.includes('/')) {
    const slashIdx = resolvedModel.indexOf('/');
    const providerPrefix = resolvedModel.slice(0, slashIdx);
    const modelName = resolvedModel.slice(slashIdx + 1);
    const mappedProvider = normalizeProvider(providerPrefix);
    if (mappedProvider && (PROVIDER_TIERS.tier1 as readonly string[]).includes(mappedProvider)) {
      return { primaryProvider: mappedProvider, primaryModel: modelName };
    }
  }

  for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
    if (resolvedModel.startsWith(prefix)) {
      return { primaryProvider: provider, primaryModel: resolvedModel };
    }
  }

  return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
}

// ── Types ──

export interface SyncUpdate {
  providerId: string;
  model: string;
  unitCosts: { input: number; output: number };
  caching?: { readRate?: number; writeRate?: number };
  source?: string;
}

interface DbRateLike {
  id: string;
  providerId: string;
  model: string;
  type?: string;
  inputRate?: number;
  outputRate?: number;
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
  source?: string;
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

// ── Pure functions (testable without DB) ──

/**
 * Match an update request to a DB model rate record.
 * Tries: exact match → modelNameFallbacks (overrides + date suffix stripping).
 */
export function matchUpdateToDbRate(dbRates: DbRateLike[], providerId: string, model: string): DbRateLike | null {
  const exact = dbRates.find((r) => r.providerId === providerId && r.model === model);
  if (exact) return exact;

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
  updated: UpdatedEntry[];
  unchanged: UpdatedEntry[];
  unmatched: UnmatchedEntry[];
  errors: ErrorEntry[];
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
    Math.abs(Number(oldCosts.input) - newCosts.input) > tolerance ||
    Math.abs(Number(oldCosts.output) - newCosts.output) > tolerance
  );
}

/**
 * Propagate tier1 unitCosts to tier2 models.
 * Returns additional SyncUpdate[] entries for tier2 models that inherit from tier1.
 */
export function propagateToTier2(
  dbRates: DbRateLike[],
  tier1Updates: Map<string, { input: number; output: number }>
): SyncUpdate[] {
  const tier2Rates = dbRates.filter((r) => (PROVIDER_TIERS.tier2 as readonly string[]).includes(r.providerId));
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

/**
 * Convert OfficialPricingEntry[] (from scraped data) into SyncUpdate[] for token-priced models.
 */
export function officialPricingToSyncUpdates(
  entries: Array<{
    provider: string;
    modelId: string;
    inputCostPerToken?: number | null;
    outputCostPerToken?: number | null;
    cachedInputCostPerToken?: number | null;
    cacheTiers?: Array<{ label: string; costPerToken: number }>;
    modelType?: string;
  }>
): SyncUpdate[] {
  const updates: SyncUpdate[] = [];

  for (const entry of entries) {
    const provider = normalizeProvider(entry.provider) || entry.provider;

    // Only sync token-priced models (skip image/video/audio)
    if (entry.inputCostPerToken == null && entry.outputCostPerToken == null) continue;

    const update: SyncUpdate = {
      providerId: provider,
      model: entry.modelId,
      unitCosts: {
        input: entry.inputCostPerToken || 0,
        output: entry.outputCostPerToken || 0,
      },
      source: 'official-pricing-catalog',
    };

    // Map caching info
    const readRate = entry.cachedInputCostPerToken;
    const writeTier = entry.cacheTiers?.find((t) => t.label.includes('write'));
    if (readRate != null || writeTier) {
      update.caching = {};
      if (readRate != null) update.caching.readRate = readRate;
      if (writeTier) update.caching.writeRate = writeTier.costPerToken;
    }

    updates.push(update);
  }

  return updates;
}
