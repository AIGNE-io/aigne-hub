/**
 * Provider Aliases & Normalization
 *
 * Single source of truth for mapping external provider names (LiteLLM, OpenRouter, etc.)
 * to internal DB provider names. Also provides resolution tier derivation for image models.
 */

// Single mapping table, replaces scattered mappings in fetchLiteLLM, fetchOpenRouter, etc.
export const PROVIDER_ALIASES: Record<string, string> = {
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

/**
 * Normalize a provider name to the canonical DB provider name.
 * Tries exact match first, then prefix match (e.g. "vertex_ai_beta" via "vertex_ai").
 * Returns undefined if no match found.
 */
export function normalizeProvider(name: string): string | undefined {
  const lower = name.toLowerCase();

  // Exact match
  if (PROVIDER_ALIASES[lower]) return PROVIDER_ALIASES[lower];

  // Prefix match (e.g. "bedrock_converse" → "bedrock")
  for (const [alias, canonical] of Object.entries(PROVIDER_ALIASES)) {
    if (lower.startsWith(alias)) return canonical;
  }

  // Special case: bedrock variants
  if (lower.startsWith('bedrock')) return 'bedrock';

  return undefined;
}

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

/**
 * Generate fallback model name variants for lookup.
 * - claude-xxx-N-0 → claude-xxx-N
 * - gpt-4o-2024-08-06 → gpt-4o (date suffix)
 */
export function modelNameFallbacks(model: string): string[] {
  if (MODEL_NAME_OVERRIDES[model]) {
    return [MODEL_NAME_OVERRIDES[model]];
  }

  const fallbacks: string[] = [];

  // claude-xxx-N-0 → claude-xxx-N (e.g. claude-sonnet-4-0 → claude-sonnet-4)
  if (/^claude-.*-\d+-0$/.test(model)) {
    fallbacks.push(model.replace(/-0$/, ''));
  }

  // gpt-4o-2024-08-06 → gpt-4o (date suffix: YYYY-MM-DD)
  const dateMatch = model.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch?.[1]) {
    fallbacks.push(dateMatch[1]);
  }

  return fallbacks;
}

/** Infer tier1 provider from model name prefix (for tier2 providers like Poe). */
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

  const resolvedModel = MODEL_NAME_OVERRIDES[dbModel] || dbModel;

  if (!isTier2) {
    return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
  }

  // OpenRouter: "anthropic/claude-sonnet-4" → split on /
  if (canonicalProvider === 'openrouter' && resolvedModel.includes('/')) {
    const slashIdx = resolvedModel.indexOf('/');
    const providerPrefix = resolvedModel.slice(0, slashIdx);
    const modelName = resolvedModel.slice(slashIdx + 1);
    const mappedProvider = normalizeProvider(providerPrefix);
    if (mappedProvider && (PROVIDER_TIERS.tier1 as readonly string[]).includes(mappedProvider)) {
      return { primaryProvider: mappedProvider, primaryModel: modelName };
    }
  }

  // Poe and others: infer provider from model name prefix
  for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
    if (resolvedModel.startsWith(prefix)) {
      return { primaryProvider: provider, primaryModel: resolvedModel };
    }
  }

  // Can't resolve — return as-is
  return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
}

/**
 * Derive resolution tiers for image models that have per-image and per-image-token pricing.
 * Used for Google-style image models with 1K-2K and 4K pricing tiers.
 *
 * Returns tiers only if the hi-res cost differs from standard cost by >5%.
 */
export function deriveResolutionTiers(
  outputCostPerImage?: number,
  outputCostPerImageToken?: number
): { quality: string; size: string; costPerImage: number }[] | undefined {
  if (outputCostPerImage == null || outputCostPerImageToken == null) return undefined;
  if (outputCostPerImageToken === 0) return undefined;

  const stdTokens = Math.round(outputCostPerImage / outputCostPerImageToken);
  const hiTokens = Math.round(stdTokens * 1.786); // ~2000 for Google (1120 x 1.786)
  const stdCost = outputCostPerImage;
  const hiCost = outputCostPerImageToken * hiTokens;

  if (Math.abs(hiCost - stdCost) / stdCost <= 0.05) return undefined;

  return [
    { quality: '1K-2K', size: `~${stdTokens}tok`, costPerImage: stdCost },
    { quality: '4K', size: `~${hiTokens}tok`, costPerImage: hiCost },
  ];
}
