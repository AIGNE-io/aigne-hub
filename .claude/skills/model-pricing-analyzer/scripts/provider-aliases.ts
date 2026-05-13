/**
 * Provider Aliases & Normalization — thin TypeScript wrapper over core/pricing-core.mjs.
 *
 * Re-exports shared pure functions with TypeScript type annotations.
 */

import {
  MODEL_NAME_OVERRIDES as _MODEL_NAME_OVERRIDES,
  MODEL_PREFIX_TO_PROVIDER as _MODEL_PREFIX_TO_PROVIDER,
  PROVIDER_ALIASES as _PROVIDER_ALIASES,
  PROVIDER_TIERS as _PROVIDER_TIERS,
  deriveResolutionTiers as _deriveResolutionTiers,
  modelNameFallbacks as _modelNameFallbacks,
  normalizeProvider as _normalizeProvider,
  resolveModelMapping as _resolveModelMapping,
} from './core/pricing-core.mjs';

export const PROVIDER_ALIASES: Record<string, string> = _PROVIDER_ALIASES;

export const PROVIDER_TIERS: {
  tier1: readonly string[];
  tier2: readonly string[];
} = _PROVIDER_TIERS;

export const MODEL_NAME_OVERRIDES: Record<string, string> = _MODEL_NAME_OVERRIDES;

export const MODEL_PREFIX_TO_PROVIDER: Record<string, string> = _MODEL_PREFIX_TO_PROVIDER;

export const normalizeProvider: (name: string) => string | undefined = _normalizeProvider;

export const modelNameFallbacks: (model: string) => string[] = _modelNameFallbacks;

export const resolveModelMapping: (
  dbModel: string,
  dbProvider: string
) => { primaryProvider: string; primaryModel: string } = _resolveModelMapping;

export const deriveResolutionTiers: (
  outputCostPerImage?: number,
  outputCostPerImageToken?: number
) => { quality: string; size: string; costPerImage: number }[] | undefined = _deriveResolutionTiers;
