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
 * Generate fallback model name variants for lookup.
 * For Claude models, names ending in "-X-0" (e.g. "claude-sonnet-4-0") should
 * fall back to the base name without "-0" (e.g. "claude-sonnet-4"), since official
 * pricing may use either form.
 */
export function modelNameFallbacks(model: string): string[] {
  const fallbacks: string[] = [];
  // claude-xxx-N-0 → claude-xxx-N (e.g. claude-sonnet-4-0 → claude-sonnet-4)
  if (/^claude-.*-\d+-0$/.test(model)) {
    fallbacks.push(model.replace(/-0$/, ''));
  }
  return fallbacks;
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
