/**
 * Pricing Comparison Engine
 *
 * Compares DB rates against external sources (LiteLLM, OpenRouter, Official Pricing)
 * and produces structured comparison results with drift analysis.
 */

import type { DbRate, ExternalRate } from './fetch-sources';
import type { CacheTier, OfficialPricingEntry, PricingUnit } from './pricing-schema';
import { deriveResolutionTiers, modelNameFallbacks } from './provider-aliases';

// ─── Types ───────────────────────────────────────────────────────────────────

// Re-export PricingUnit for local use (subset of schema PricingUnit)
type LocalPricingUnit = 'per-token' | 'per-image' | 'per-second';

export interface ComparisonResult {
  provider: string;
  model: string;
  type: string;
  pricingUnit: LocalPricingUnit; // How output is priced
  dbInput: number;
  dbOutput: number;
  litellmInput?: number;
  litellmOutput?: number;
  litellmDrift?: number;
  openrouterInput?: number;
  openrouterOutput?: number;
  openrouterDrift?: number;
  providerPageInput?: number;
  providerPageOutput?: number;
  providerPageDrift?: number;
  providerPageUrl?: string;
  maxDrift: number;
  exceedsThreshold: boolean;
  // Cache token pricing (DB stores as credit rates; in margin=0 setups these equal USD costs)
  dbCacheWrite?: number;
  dbCacheRead?: number;
  litellmCacheWrite?: number;
  litellmCacheRead?: number;
  cacheDrift?: number; // max drift between DB cache rates and LiteLLM cache costs
  // Pricing sanity check: inputRate/outputRate vs unitCosts
  inputRate?: number;
  outputRate?: number;
  inputRateIssue?: number; // Negative = loss (rate < cost)
  outputRateIssue?: number; // Negative = loss (rate < cost)
  hasPricingIssue: boolean;
  // Image/video pricing from LiteLLM (same-unit as DB)
  litellmInputPerImage?: number;
  litellmOutputPerImage?: number;
  litellmOutputPerSecond?: number;
  // Tiered / resolution variant details
  resolutionTiers?: { quality: string; size: string; costPerImage: number }[];
  tieredPricing?: { threshold: string; input?: number; output?: number }[];
  // Official cache tier data from provider pages
  officialCacheWrite?: number;
  officialCacheRead?: number;
  officialCacheTiers?: CacheTier[];
  // Tiered pricing loss analysis (DB cost < highest tier = potential loss at high volume)
  tierMaxInput?: number; // highest tier input cost
  tierMaxOutput?: number; // highest tier output cost
  tierInputDrift?: number; // drift between dbInput and tierMaxInput
  tierOutputDrift?: number; // drift between dbOutput and tierMaxOutput
  // Cache tier loss analysis (DB cache cost < highest tier = potential loss)
  cacheTierMaxWrite?: number;
  cacheTierMaxRead?: number;
  cacheTierWriteDrift?: number;
  cacheTierReadDrift?: number;
  // Best cost source (for simplified report)
  bestCostInput?: number;
  bestCostOutput?: number;
  bestCostSource?: 'provider-page' | 'openrouter' | 'litellm';
  bestCostSourceLabel?: string; // "官方" / "OpenRouter" / "LiteLLM"
  bestCostUrl?: string;
  inputMargin?: number; // (售价 - 成本) / 成本 × 100
  outputMargin?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function calcDrift(dbValue: number, sourceValue: number): number {
  const maxVal = Math.max(Math.abs(dbValue), Math.abs(sourceValue));
  if (maxVal === 0) return 0;
  return Math.abs(dbValue - sourceValue) / maxVal;
}

export function formatCost(cost: number, unit: LocalPricingUnit = 'per-token'): string {
  if (cost === 0) return '$0';
  if (unit === 'per-image') return `$${cost.toFixed(4)}/张`;
  if (unit === 'per-second') return `$${cost.toFixed(4)}/秒`;
  // Convert to per-1M-tokens format
  const perMillion = cost * 1000000;
  if (perMillion < 0.01) return `$${perMillion.toExponential(2)}/1M`;
  if (perMillion < 1) return `$${perMillion.toFixed(3)}/1M`;
  if (perMillion < 10) return `$${perMillion.toFixed(2)}/1M`;
  return `$${perMillion.toFixed(1)}/1M`;
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

// ─── Best Cost Selection ─────────────────────────────────────────────────────

function pickBestCost(result: ComparisonResult): void {
  if (result.pricingUnit === 'per-image' || result.pricingUnit === 'per-second') {
    // Image/video models: output MUST be in per-image/per-second unit (not per-token).
    // Provider page & OpenRouter only provide per-token output prices, which are
    // incompatible with DB sell prices (per-image / per-second). Use LiteLLM for output.
    if (result.pricingUnit === 'per-image' && result.resolutionTiers?.length) {
      // Resolution tiers contain complete tiered info — use highest tier as best cost
      result.bestCostOutput = Math.max(...result.resolutionTiers.map((t) => t.costPerImage));
    } else if (result.pricingUnit === 'per-image' && result.litellmOutputPerImage !== undefined) {
      // Fallback: flat per-image cost from LiteLLM
      result.bestCostOutput = result.litellmOutputPerImage;
    } else if (result.pricingUnit === 'per-second' && result.litellmOutputPerSecond !== undefined) {
      result.bestCostOutput = result.litellmOutputPerSecond;
    }

    // For per-image/per-second: prefer provider-page output if available (correct unit)
    if (result.pricingUnit === 'per-image' && result.providerPageOutput !== undefined && !result.bestCostOutput) {
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (
      result.pricingUnit === 'per-second' &&
      result.providerPageOutput !== undefined &&
      !result.bestCostOutput
    ) {
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    }

    // Input: for per-image models, prefer per-image input cost from LiteLLM;
    // otherwise fall back to per-token (provider-page > openrouter > litellm)
    if (result.pricingUnit === 'per-image' && result.litellmInputPerImage !== undefined) {
      result.bestCostInput = result.litellmInputPerImage;
      if (!result.bestCostSource) {
        result.bestCostSource = 'litellm';
        result.bestCostSourceLabel = 'LiteLLM';
      }
    } else if (result.providerPageInput !== undefined) {
      result.bestCostInput = result.providerPageInput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (result.openrouterInput !== undefined) {
      result.bestCostInput = result.openrouterInput;
      result.bestCostSource = 'openrouter';
      result.bestCostSourceLabel = 'OpenRouter';
    } else if (result.litellmInput !== undefined) {
      result.bestCostInput = result.litellmInput;
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
    // If output came from LiteLLM but source wasn't set yet, mark it
    if (result.bestCostOutput !== undefined && !result.bestCostSource) {
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
  } else {
    // Per-token models: priority provider-page > openrouter > litellm
    if (result.providerPageInput !== undefined && result.providerPageOutput !== undefined) {
      result.bestCostInput = result.providerPageInput;
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (result.openrouterInput !== undefined && result.openrouterOutput !== undefined) {
      result.bestCostInput = result.openrouterInput;
      result.bestCostOutput = result.openrouterOutput;
      result.bestCostSource = 'openrouter';
      result.bestCostSourceLabel = 'OpenRouter';
    } else if (result.litellmInput !== undefined && result.litellmOutput !== undefined) {
      result.bestCostInput = result.litellmInput;
      result.bestCostOutput = result.litellmOutput;
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
  }

  // Calculate margin: (售价 - 成本) / 成本 × 100
  if (result.bestCostInput !== undefined && result.inputRate !== undefined && result.bestCostInput > 0) {
    result.inputMargin = ((result.inputRate - result.bestCostInput) / result.bestCostInput) * 100;
  }
  if (result.bestCostOutput !== undefined && result.outputRate !== undefined && result.bestCostOutput > 0) {
    result.outputMargin = ((result.outputRate - result.bestCostOutput) / result.bestCostOutput) * 100;
  }
}

// ─── Core Compare ────────────────────────────────────────────────────────────

export function compare(
  dbRates: DbRate[],
  litellm: Map<string, ExternalRate>,
  openrouter: Map<string, ExternalRate>,
  providerPages: Map<string, OfficialPricingEntry>,
  threshold: number
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  for (const rate of dbRates) {
    const providerName = rate.provider?.name || '';
    // For OpenRouter provider, the model name already contains provider prefix (e.g., "anthropic/claude-opus-4")
    // For other providers, use "provider/model" format
    const lookupKey = providerName === 'openrouter' ? rate.model : `${providerName}/${rate.model}`;
    const dbInput = Number(rate.unitCosts?.input ?? rate.inputRate ?? 0);
    const dbOutput = Number(rate.unitCosts?.output ?? rate.outputRate ?? 0);

    // Model name fallbacks (e.g. claude-sonnet-4-0 → claude-sonnet-4)
    const modelFallbacks = modelNameFallbacks(rate.model);
    const fallbackKeys = modelFallbacks.map((m) => (providerName === 'openrouter' ? m : `${providerName}/${m}`));

    // LiteLLM lookup with fallbacks for provider name mismatches
    let ll = litellm.get(lookupKey);
    if (!ll && providerName === 'openrouter') {
      // For openrouter DB entries like "anthropic/claude-opus-4.6", also try "openrouter/anthropic/claude-opus-4.6"
      ll = litellm.get(`openrouter/${rate.model}`);
    }
    if (!ll) {
      // Try model-name-only lookup (without provider prefix) against all known keys
      const modelOnly = rate.model;
      for (const tryProvider of ['openai', 'anthropic', 'google', 'gemini', 'deepseek', 'xai']) {
        const tryKey = `${tryProvider}/${modelOnly}`;
        const found = litellm.get(tryKey);
        if (found) {
          ll = found;
          break;
        }
      }
    }
    // Try model name fallbacks for LiteLLM (e.g. claude-sonnet-4-0 → claude-sonnet-4)
    if (!ll) {
      for (const fbKey of fallbackKeys) {
        ll = litellm.get(fbKey);
        if (ll) break;
      }
      if (!ll) {
        for (const fbModel of modelFallbacks) {
          for (const tryProvider of ['openai', 'anthropic', 'google', 'gemini', 'deepseek', 'xai']) {
            ll = litellm.get(`${tryProvider}/${fbModel}`);
            if (ll) break;
          }
          if (ll) break;
        }
      }
    }
    const or =
      openrouter.get(lookupKey) ??
      fallbackKeys.reduce<ExternalRate | undefined>((found, k) => found ?? openrouter.get(k), undefined);
    const pp =
      providerPages.get(lookupKey) ??
      fallbackKeys.reduce<OfficialPricingEntry | undefined>((found, k) => found ?? providerPages.get(k), undefined);

    // Determine pricing unit based on model type
    const pricingUnit: LocalPricingUnit =
      rate.type === 'imageGeneration' ? 'per-image' : rate.type === 'video' ? 'per-second' : 'per-token';

    // Initialize result
    let maxDrift = 0;
    const result: ComparisonResult = {
      provider: providerName,
      model: rate.model,
      type: rate.type,
      pricingUnit,
      dbInput,
      dbOutput,
      maxDrift: 0,
      exceedsThreshold: false,
      hasPricingIssue: false,
    };

    // Image/video models use per-image/per-video pricing in DB output field,
    // while LiteLLM/OpenRouter report per-token prices. Skip output drift comparison
    // for these types to avoid false 20000x drift alerts.
    const isPerUnitPricing = pricingUnit !== 'per-token';

    if (ll) {
      result.litellmInput = ll.inputCostPerToken;
      result.litellmOutput = ll.outputCostPerToken;

      // Attach tiered/resolution data
      if (ll.tieredPricing) result.tieredPricing = ll.tieredPricing;
      if (ll.resolutionTiers) result.resolutionTiers = ll.resolutionTiers;

      // Derive resolution tiers for image models using unified function
      if (
        pricingUnit === 'per-image' &&
        !result.resolutionTiers &&
        ll.outputCostPerImage != null &&
        ll.outputCostPerImageToken != null
      ) {
        const derived = deriveResolutionTiers(ll.outputCostPerImage, ll.outputCostPerImageToken);
        if (derived) result.resolutionTiers = derived;
      }

      if (pricingUnit === 'per-image') {
        // Image models: compare output per-image if available
        const llOutputPerImage = ll.outputCostPerImage ?? ll.inputCostPerImage;
        if (ll.inputCostPerImage !== undefined) result.litellmInputPerImage = ll.inputCostPerImage;
        if (llOutputPerImage !== undefined) {
          result.litellmOutputPerImage = llOutputPerImage;
          const outputDrift = calcDrift(dbOutput, llOutputPerImage);
          const inputDrift =
            ll.inputCostPerToken !== undefined && dbInput > 0 ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
          result.litellmDrift = Math.max(inputDrift, outputDrift);
        } else {
          const inputDrift = ll.inputCostPerToken !== undefined ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
          result.litellmDrift = inputDrift;
        }
      } else if (pricingUnit === 'per-second') {
        // Video models: compare output per-second if available
        const llOutputPerSecond = ll.outputCostPerVideoPerSecond;
        if (llOutputPerSecond !== undefined) {
          result.litellmOutputPerSecond = llOutputPerSecond;
          const outputDrift = calcDrift(dbOutput, llOutputPerSecond);
          result.litellmDrift = outputDrift;
        } else {
          result.litellmDrift = 0;
        }
      } else {
        // Token models: original logic
        const inputDrift = ll.inputCostPerToken !== undefined ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
        const outputDrift = ll.outputCostPerToken !== undefined ? calcDrift(dbOutput, ll.outputCostPerToken) : 0;
        result.litellmDrift = Math.max(inputDrift, outputDrift);
      }
      if (result.litellmDrift !== undefined) {
        maxDrift = Math.max(maxDrift, result.litellmDrift);
      }
    }

    if (or && or.inputCostPerToken !== undefined && or.outputCostPerToken !== undefined) {
      const inputDrift = calcDrift(dbInput, or.inputCostPerToken);
      result.openrouterInput = or.inputCostPerToken;
      result.openrouterOutput = or.outputCostPerToken;
      if (isPerUnitPricing) {
        result.openrouterDrift = inputDrift;
      } else {
        const outputDrift = calcDrift(dbOutput, or.outputCostPerToken);
        result.openrouterDrift = Math.max(inputDrift, outputDrift);
      }
      maxDrift = Math.max(maxDrift, result.openrouterDrift);
    }

    // Cache token pricing — extract DB cache rates early so they're available for provider page comparison
    const dbCacheWrite = rate.caching ? Number(rate.caching.writeRate ?? 0) : 0;
    const dbCacheRead = rate.caching ? Number(rate.caching.readRate ?? 0) : 0;

    if (pp) {
      // Use OfficialPricingEntry fields — handle per-token, per-image, and per-second
      if (pricingUnit === 'per-image' && pp.costPerImage != null) {
        result.providerPageOutput = pp.costPerImage;
        result.providerPageDrift = calcDrift(dbOutput, pp.costPerImage);
        result.providerPageUrl = pp.sourceUrl;
        maxDrift = Math.max(maxDrift, result.providerPageDrift);
      } else if (pricingUnit === 'per-second' && pp.costPerSecond != null) {
        result.providerPageOutput = pp.costPerSecond;
        result.providerPageDrift = calcDrift(dbOutput, pp.costPerSecond);
        result.providerPageUrl = pp.sourceUrl;
        maxDrift = Math.max(maxDrift, result.providerPageDrift);
      } else if (pp.inputCostPerToken != null && pp.outputCostPerToken != null) {
        // per-token: original logic
        const inputDrift = calcDrift(dbInput, pp.inputCostPerToken);
        result.providerPageInput = pp.inputCostPerToken;
        result.providerPageOutput = pp.outputCostPerToken;
        if (isPerUnitPricing) {
          result.providerPageDrift = inputDrift;
        } else {
          const outputDrift = calcDrift(dbOutput, pp.outputCostPerToken);
          result.providerPageDrift = Math.max(inputDrift, outputDrift);
        }
        result.providerPageUrl = pp.sourceUrl;
        maxDrift = Math.max(maxDrift, result.providerPageDrift);
      } else if (pp.inputCostPerToken != null || pp.outputCostPerToken != null) {
        // Partial data
        result.providerPageInput = pp.inputCostPerToken;
        result.providerPageOutput = pp.outputCostPerToken;
        result.providerPageUrl = pp.sourceUrl;
        if (pp.outputCostPerToken != null) {
          result.providerPageDrift = calcDrift(dbOutput, pp.outputCostPerToken);
          maxDrift = Math.max(maxDrift, result.providerPageDrift);
        }
      }

      // Official cache tier data from provider page
      if (pp.cacheTiers?.length) {
        result.officialCacheTiers = pp.cacheTiers;
        const readTiers = pp.cacheTiers.filter((t) => t.label === 'read' || t.label === 'cached-input');
        const writeTiers = pp.cacheTiers.filter((t) => t.label.includes('write'));
        const maxWriteCost = writeTiers.length > 0 ? Math.max(...writeTiers.map((t) => t.costPerToken)) : 0;
        const maxReadCost = readTiers.length > 0 ? Math.max(...readTiers.map((t) => t.costPerToken)) : 0;
        if (maxWriteCost > 0) result.officialCacheWrite = maxWriteCost;
        if (maxReadCost > 0) result.officialCacheRead = maxReadCost;
        // Drift is handled uniformly via cache tier loss analysis below (same as input/output tiers)
      } else if (pp.cachedInputCostPerToken !== undefined) {
        result.officialCacheRead = pp.cachedInputCostPerToken;
      }
    }

    // Cache token pricing — store DB and LiteLLM values for reference
    if (dbCacheWrite > 0 || dbCacheRead > 0) {
      result.dbCacheWrite = dbCacheWrite;
      result.dbCacheRead = dbCacheRead;
    }
    if (ll && (ll.cacheWriteCostPerToken !== undefined || ll.cacheReadCostPerToken !== undefined)) {
      result.litellmCacheWrite = ll.cacheWriteCostPerToken;
      result.litellmCacheRead = ll.cacheReadCostPerToken;

      // Only compute LiteLLM cache drift when NO official cache tiers exist.
      // When official tiers exist, the tier loss analysis below handles everything
      // uniformly (same pattern as input/output tiered pricing).
      const hasOfficialCacheTiers = (result.officialCacheTiers?.length ?? 0) > 0;
      if (!hasOfficialCacheTiers) {
        let cDrift = 0;
        if (dbCacheWrite > 0 && ll.cacheWriteCostPerToken !== undefined && ll.cacheWriteCostPerToken > 0) {
          cDrift = Math.max(cDrift, calcDrift(dbCacheWrite, ll.cacheWriteCostPerToken));
        }
        if (dbCacheRead > 0 && ll.cacheReadCostPerToken !== undefined && ll.cacheReadCostPerToken > 0) {
          cDrift = Math.max(cDrift, calcDrift(dbCacheRead, ll.cacheReadCostPerToken));
        }
        if (cDrift > 0) {
          result.cacheDrift = cDrift;
          maxDrift = Math.max(maxDrift, cDrift);
        }
      }
    }

    // Tiered pricing loss analysis: if DB cost uses base tier but higher tiers exist,
    // the actual cost at high token volumes will exceed DB cost → potential loss
    if (result.tieredPricing?.length && pricingUnit === 'per-token') {
      const maxTierInput = Math.max(...result.tieredPricing.map((t) => t.input ?? 0));
      const maxTierOutput = Math.max(...result.tieredPricing.map((t) => t.output ?? 0));

      if (maxTierInput > dbInput && dbInput > 0) {
        result.tierMaxInput = maxTierInput;
        result.tierInputDrift = calcDrift(dbInput, maxTierInput);
        maxDrift = Math.max(maxDrift, result.tierInputDrift);
      }
      if (maxTierOutput > dbOutput && dbOutput > 0) {
        result.tierMaxOutput = maxTierOutput;
        result.tierOutputDrift = calcDrift(dbOutput, maxTierOutput);
        maxDrift = Math.max(maxDrift, result.tierOutputDrift);
      }
    }

    // Cache tier loss analysis: if DB cache cost < highest tier cost → potential loss
    if (result.officialCacheTiers?.length) {
      const writeTiers = result.officialCacheTiers.filter((t) => t.label.includes('write'));
      const readTiers = result.officialCacheTiers.filter((t) => t.label === 'read' || t.label === 'cached-input');

      if (writeTiers.length > 0) {
        const maxWriteCost = Math.max(...writeTiers.map((t) => t.costPerToken));
        if (dbCacheWrite > 0 && dbCacheWrite < maxWriteCost) {
          const drift = calcDrift(dbCacheWrite, maxWriteCost);
          // Skip floating point noise (e.g. 1e-7 vs 1.0000000000000001e-7)
          if (drift > 1e-6) {
            result.cacheTierMaxWrite = maxWriteCost;
            result.cacheTierWriteDrift = drift;
            maxDrift = Math.max(maxDrift, drift);
          }
        } else if ((dbCacheWrite === 0 || dbCacheWrite === undefined) && maxWriteCost > 0) {
          result.cacheTierMaxWrite = maxWriteCost;
          result.cacheTierWriteDrift = 1; // 100% — no cache write cost set
          maxDrift = Math.max(maxDrift, 1);
        }
      }

      if (readTiers.length > 0) {
        const maxReadCost = Math.max(...readTiers.map((t) => t.costPerToken));
        if (dbCacheRead > 0 && dbCacheRead < maxReadCost) {
          const drift = calcDrift(dbCacheRead, maxReadCost);
          // Skip floating point noise (e.g. 1e-7 vs 1.0000000000000001e-7)
          if (drift > 1e-6) {
            result.cacheTierMaxRead = maxReadCost;
            result.cacheTierReadDrift = drift;
            maxDrift = Math.max(maxDrift, drift);
          }
        } else if ((dbCacheRead === 0 || dbCacheRead === undefined) && maxReadCost > 0) {
          result.cacheTierMaxRead = maxReadCost;
          result.cacheTierReadDrift = 1;
          maxDrift = Math.max(maxDrift, 1);
        }
      }
    }

    result.maxDrift = maxDrift;
    result.exceedsThreshold = maxDrift > threshold;

    // Check pricing sanity: inputRate/outputRate vs unitCosts
    if (rate.unitCosts && (rate.inputRate || rate.outputRate)) {
      const unitInputCost = Number(rate.unitCosts.input);
      const unitOutputCost = Number(rate.unitCosts.output);
      const inputRate = Number(rate.inputRate ?? 0);
      const outputRate = Number(rate.outputRate ?? 0);

      result.inputRate = inputRate;
      result.outputRate = outputRate;

      if (unitInputCost > 0 && inputRate > 0) {
        result.inputRateIssue = ((inputRate - unitInputCost) / unitInputCost) * 100;
      }
      if (unitOutputCost > 0 && outputRate > 0) {
        result.outputRateIssue = ((outputRate - unitOutputCost) / unitOutputCost) * 100;
      }

      const PRICING_TOLERANCE = 2; // ±2% tolerance
      result.hasPricingIssue =
        (result.inputRateIssue !== undefined && Math.abs(result.inputRateIssue) > PRICING_TOLERANCE) ||
        (result.outputRateIssue !== undefined && Math.abs(result.outputRateIssue) > PRICING_TOLERANCE);
    } else {
      result.hasPricingIssue = false;
    }

    pickBestCost(result);
    results.push(result);
  }

  results.sort((a, b) => b.maxDrift - a.maxDrift);
  return results;
}

// ─── Table Output ────────────────────────────────────────────────────────────

export function printTable(results: ComparisonResult[], threshold: number): void {
  // Categorize issues
  const costDriftErrors = results.filter((r) => r.exceedsThreshold);
  const pricingErrors = results.filter((r) => !r.exceedsThreshold && r.hasPricingIssue);
  const fullyCorrect = results.filter((r) => !r.exceedsThreshold && !r.hasPricingIssue);
  const totalErrors = costDriftErrors.length + pricingErrors.length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚨 AIGNE Hub 定价错误报告`);
  console.log(`${'='.repeat(80)}\n`);

  if (totalErrors > 0) {
    console.log(`⚠️  发现 ${totalErrors} 个模型存在定价问题：\n`);
  }

  // 1. Cost Setting Errors (unitCosts vs external sources)
  if (costDriftErrors.length > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`❌ 1. 成本设置错误（${costDriftErrors.length} 个）`);
    console.log(`   成本价格与外部数据源差异超过 ${(threshold * 100).toFixed(0)}%\n`);
    for (let i = 0; i < costDriftErrors.length; i++) {
      const r = costDriftErrors[i];
      const pu = r.pricingUnit;
      const unitLabel = pu === 'per-image' ? ' [按张计费]' : pu === 'per-second' ? ' [按秒计费]' : '';
      console.log(`${i + 1}. ${r.provider}/${r.model} (${r.type})${unitLabel}`);
      console.log(`   ❌ AIGNE Hub 当前设置：`);
      console.log(`      输入成本：${formatCost(r.dbInput)}`);
      console.log(`      输出成本：${formatCost(r.dbOutput, pu)}`);
      if (r.dbCacheWrite || r.dbCacheRead) {
        console.log(`      缓存写入：${formatCost(r.dbCacheWrite || 0)}`);
        console.log(`      缓存读取：${formatCost(r.dbCacheRead || 0)}`);
      }

      const hasLiteLLM = r.litellmInput !== undefined;
      const hasOpenRouter = r.openrouterInput !== undefined;

      if (hasLiteLLM || hasOpenRouter) {
        const source = hasLiteLLM ? 'LiteLLM' : 'OpenRouter';
        const correctInput = hasLiteLLM ? r.litellmInput! : r.openrouterInput!;
        const correctOutput = hasLiteLLM ? r.litellmOutput! : r.openrouterOutput!;

        console.log(`   ✅ 建议更新为（基于 ${source}）：`);
        console.log(`      输入成本：${formatCost(correctInput)}`);
        if (pu === 'per-token') {
          console.log(`      输出成本：${formatCost(correctOutput)}`);
        } else {
          console.log(
            `      输出成本：${formatCost(r.dbOutput, pu)} (${pu === 'per-image' ? '按张' : '按秒'}计费，外部源为按token，不可直接对比)`
          );
        }

        const inputDiff = correctInput !== 0 ? ((r.dbInput - correctInput) / correctInput) * 100 : 0;
        const outputDiff = correctOutput !== 0 ? ((r.dbOutput - correctOutput) / correctOutput) * 100 : 0;

        if (Math.abs(inputDiff) > threshold * 100) {
          console.log(`   📊 输入成本差异：${inputDiff > 0 ? '高出' : '低了'} ${Math.abs(inputDiff).toFixed(1)}%`);
        }
        if (pu === 'per-token' && Math.abs(outputDiff) > threshold * 100) {
          console.log(`   📊 输出成本差异：${outputDiff > 0 ? '高出' : '低了'} ${Math.abs(outputDiff).toFixed(1)}%`);
        }

        // Show cache drift if any
        if (hasLiteLLM && r.cacheDrift !== undefined && r.cacheDrift > threshold) {
          const llCache = { write: r.litellmCacheWrite, read: r.litellmCacheRead };
          if (llCache.write !== undefined && r.dbCacheWrite) {
            const writeDiff = ((r.dbCacheWrite - llCache.write) / llCache.write) * 100;
            if (Math.abs(writeDiff) > threshold * 100)
              console.log(
                `   📊 缓存写入差异：${writeDiff > 0 ? '高出' : '低了'} ${Math.abs(writeDiff).toFixed(1)}% (DB: ${formatCost(r.dbCacheWrite)} vs LiteLLM: ${formatCost(llCache.write)})`
              );
          }
          if (llCache.read !== undefined && r.dbCacheRead) {
            const readDiff = ((r.dbCacheRead - llCache.read) / llCache.read) * 100;
            if (Math.abs(readDiff) > threshold * 100)
              console.log(
                `   📊 缓存读取差异：${readDiff > 0 ? '高出' : '低了'} ${Math.abs(readDiff).toFixed(1)}% (DB: ${formatCost(r.dbCacheRead)} vs LiteLLM: ${formatCost(llCache.read)})`
              );
          }
        }
      }

      // Show tiered pricing loss warnings
      if (r.tierMaxInput !== undefined || r.tierMaxOutput !== undefined) {
        console.log(`   📶 阶梯定价风险（DB 使用基础价，高量时实际成本更高）：`);
        if (r.tieredPricing) {
          for (const t of r.tieredPricing) {
            const parts: string[] = [];
            if (t.input !== undefined && t.input > r.dbInput) {
              const pct = ((t.input - r.dbInput) / r.dbInput) * 100;
              parts.push(`输入 ${formatCost(t.input)} (+${pct.toFixed(0)}%)`);
            }
            if (t.output !== undefined && t.output > r.dbOutput) {
              const pct = ((t.output - r.dbOutput) / r.dbOutput) * 100;
              parts.push(`输出 ${formatCost(t.output)} (+${pct.toFixed(0)}%)`);
            }
            if (parts.length > 0) {
              console.log(`      >${t.threshold} tokens: ${parts.join(', ')} 🔴 潜在亏损`);
            }
          }
        }
      }

      // Show cache tier loss warnings
      if (r.cacheTierMaxWrite !== undefined || r.cacheTierMaxRead !== undefined) {
        console.log(`   🗄️ 缓存 tier 风险：`);
        if (r.officialCacheTiers) {
          for (const ct of r.officialCacheTiers) {
            if (ct.label.includes('write')) {
              const dbVal = r.dbCacheWrite ?? 0;
              if (ct.costPerToken > dbVal) {
                const pct = dbVal > 0 ? ((ct.costPerToken - dbVal) / dbVal) * 100 : 100;
                console.log(
                  `      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} (+${pct.toFixed(0)}%) 🔴`
                );
              } else {
                console.log(`      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} ✅`);
              }
            }
          }
          for (const ct of r.officialCacheTiers) {
            if (ct.label === 'read' || ct.label === 'cached-input') {
              const dbVal = r.dbCacheRead ?? 0;
              if (ct.costPerToken > dbVal) {
                const pct = dbVal > 0 ? ((ct.costPerToken - dbVal) / dbVal) * 100 : 100;
                console.log(
                  `      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} (+${pct.toFixed(0)}%) 🔴`
                );
              } else {
                console.log(`      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} ✅`);
              }
            }
          }
        }
      }

      // Show current applied rates and impact
      if (r.inputRate !== undefined || r.outputRate !== undefined) {
        console.log(`   💰 当前实际应用价格：`);
        if (r.inputRate) console.log(`      输入：${formatCost(r.inputRate)}`);
        if (r.outputRate) console.log(`      输出：${formatCost(r.outputRate, pu)}`);

        const correctInput = hasLiteLLM ? r.litellmInput! : hasOpenRouter ? r.openrouterInput! : r.dbInput;
        const correctOutput = hasLiteLLM ? r.litellmOutput! : hasOpenRouter ? r.openrouterOutput! : r.dbOutput;

        if (r.inputRate && correctInput) {
          const newMargin = ((r.inputRate - correctInput) / correctInput) * 100;
          const status = newMargin < -5 ? ' 🔴 过低' : newMargin < 0 ? ' ⚠️' : ' ✅';
          console.log(`   📈 更新成本后利润率（输入）：${newMargin.toFixed(1)}%${status}`);
        }
        if (r.outputRate && correctOutput && pu === 'per-token') {
          const newMargin = ((r.outputRate - correctOutput) / correctOutput) * 100;
          const status = newMargin < -5 ? ' 🔴 过低' : newMargin < 0 ? ' ⚠️' : ' ✅';
          console.log(`   📈 更新成本后利润率（输出）：${newMargin.toFixed(1)}%${status}`);
        }
      }

      console.log('');
    }
  }

  // 2. Pricing Deviation Errors (inputRate/outputRate deviation > ±2%)
  if (pricingErrors.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`❌ 2. 售价偏差错误（${pricingErrors.length} 个）`);
    console.log(`   售价与成本的偏差超过 ±2% 阈值\n`);
    console.log(
      padRight('Provider', 15) +
        padRight('Model', 30) +
        padRight('成本', 14) +
        padRight('售价', 14) +
        padRight('偏差', 12) +
        padRight('状态', 15)
    );
    console.log('-'.repeat(100));

    for (const r of pricingErrors) {
      if (r.inputRateIssue !== undefined && Math.abs(r.inputRateIssue) > 2) {
        const status = r.inputRateIssue < 0 ? '🔴 亏损' : '🟡 盈利过高';
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (input)`, 30) +
            padRight(formatCost(r.dbInput), 14) +
            padRight(formatCost(r.inputRate!), 14) +
            padRight(`${r.inputRateIssue.toFixed(1)}%`, 12) +
            padRight(status, 15)
        );
      }
      if (r.outputRateIssue !== undefined && Math.abs(r.outputRateIssue) > 2) {
        const status = r.outputRateIssue < 0 ? '🔴 亏损' : '🟡 盈利过高';
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (output)`, 30) +
            padRight(formatCost(r.dbOutput), 14) +
            padRight(formatCost(r.outputRate!), 14) +
            padRight(`${r.outputRateIssue.toFixed(1)}%`, 12) +
            padRight(status, 15)
        );
      }
    }
    console.log(`\nℹ️  偏差说明：负数=亏损（售价<成本），正数=盈利（售价>成本）\n`);
    console.log(`ℹ️  阈值：售价应控制在成本的 ±2% 范围内\n`);
  }

  // 3. Fully Correct Pricing
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ 定价完全正确（${fullyCorrect.length} 个）`);
  console.log(`   成本设置准确 + 售价偏差在 ±2% 内`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`总计检查：${results.length} 个模型\n`);

  // Generate bulk-rate-update suggestions for cost drift errors
  if (costDriftErrors.length > 0) {
    console.log(`${'='.repeat(80)}`);
    console.log('建议的批量更新 API 调用（成本设置错误）:');
    console.log(`${'='.repeat(80)}\n`);

    const updates = costDriftErrors
      .filter((r) => r.litellmInput !== undefined || r.openrouterInput !== undefined)
      .map((r) => {
        const source = r.litellmInput !== undefined ? 'litellm' : 'openrouter';
        const input = source === 'litellm' ? r.litellmInput! : r.openrouterInput!;
        const output = source === 'litellm' ? r.litellmOutput! : r.openrouterOutput!;
        return {
          provider: r.provider,
          model: r.model,
          type: r.type,
          unitCosts: { input, output },
          source,
        };
      });

    console.log('POST /api/ai-providers/bulk-rate-update');
    console.log(JSON.stringify({ rates: updates }, null, 2));
  }
}
