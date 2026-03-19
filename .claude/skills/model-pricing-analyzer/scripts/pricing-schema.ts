/**
 * Unified Official Pricing Schema
 *
 * All price fields are in $/token (not $/MTok) unless otherwise noted,
 * consistent with DB and LiteLLM conventions.
 */

// Core types
export type PricingUnit = 'per-token' | 'per-image' | 'per-second' | 'per-minute';
export type ModelType =
  | 'chatCompletion'
  | 'lexicon'
  | 'embedding'
  | 'imageGeneration'
  | 'video'
  | 'audio'
  | 'transcription'
  | 'fineTuning'
  | 'tool';

// Cache pricing tier (generic, not provider-specific)
export interface CacheTier {
  label: string; // "5min-write", "1h-write", "read", "cached-input"
  costPerToken: number; // $/token
}

// Context-length tiered pricing
export interface ContextTier {
  threshold: string; // ">200K", ">272K"
  inputCostPerToken?: number;
  cachedInputCostPerToken?: number;
  outputCostPerToken?: number;
}

// Batch / discount pricing
export interface BatchPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
  discountNote?: string; // "50% of standard"
}

// Special mode pricing (fast mode, data residency, etc.)
export interface SpecialModePricing {
  mode: string; // "fast-mode", "data-residency-us"
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  multiplierNote?: string; // "6x standard rates"
}

// Image generation variant
export interface ImageVariant {
  quality: string;
  size: string;
  costPerImage: number;
}

// Video resolution variant
export interface VideoVariant {
  resolution: string;
  costPerSecond: number;
}

// ── Core: complete official pricing for a single model ──
export interface OfficialPricingEntry {
  // Identity
  provider: string; // "anthropic", "openai", "google"
  modelId: string; // "claude-opus-4-6", "gpt-4o"
  displayName?: string;

  // Classification
  modelType?: ModelType;
  pricingUnit: PricingUnit;

  // Base token pricing ($/token)
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  cachedInputCostPerToken?: number; // default / cheapest cache read price

  // Cache tiers
  cacheTiers?: CacheTier[];

  // Context-length tiers
  contextTiers?: ContextTier[];

  // Batch pricing
  batchPricing?: BatchPricing;

  // Special modes
  specialModes?: SpecialModePricing[];

  // Image generation
  costPerImage?: number;
  imageVariants?: ImageVariant[];

  // Video generation
  costPerSecond?: number;
  videoVariants?: VideoVariant[];

  // Audio / transcription
  costPerMinute?: number;
  costPerMillionChars?: number;

  // Fine-tuning
  trainingCostPerToken?: number;
  trainingCostPerHour?: number;

  // Metadata
  sourceUrl: string;
  extractionMethod?: string; // "regex", "llm", "browser-dom"
  deprecated?: boolean;
}

// Complete output for a single provider
export interface OfficialPricingResult {
  provider: string;
  sourceUrl: string;
  fetchedAt: string;
  entries: OfficialPricingEntry[];
  providerNotes?: Record<string, unknown>;
  meta?: {
    extractionMethod?: Record<string, string>;
    modelCount?: number;
    sectionCounts?: Record<string, number>;
  };
}

// Disk cache format (replaces ProviderPageCache + OpenAIPricingCache)
export interface OfficialPricingCache {
  timestamp: number;
  entries: OfficialPricingEntry[];
}
