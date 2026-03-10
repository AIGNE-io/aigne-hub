import { RATE_SOURCE_DRIFT_THRESHOLD } from '@api/libs/env';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';

import logger from './logger';
import { modelRegistry } from './model-registry';
import type { ModelOption } from './model-registry';
import { openRouterPricing } from './openrouter-pricing';
import type { NormalizedPricing } from './openrouter-pricing';
import { fetchAllProviderPages } from './provider-pricing-pages';
import type { ProviderPagePricing } from './provider-pricing-pages';

export interface PriceDiscrepancy {
  providerId: string;
  providerName: string;
  model: string;
  type: string;
  dbUnitCosts: { input: number; output: number } | null;
  dbInputRate: number;
  dbOutputRate: number;
  sources: {
    litellm?: { inputCostPerToken: number; outputCostPerToken: number };
    openrouter?: { inputCostPerToken: number; outputCostPerToken: number };
    providerPage?: { inputCostPerToken?: number; outputCostPerToken?: number; url: string };
  };
  drifts: {
    litellm?: { inputDrift: number; outputDrift: number; maxDrift: number };
    openrouter?: { inputDrift: number; outputDrift: number; maxDrift: number };
  };
  maxDrift: number;
  exceedsThreshold: boolean;
}

function calcDrift(dbValue: number, sourceValue: number): number {
  const maxVal = Math.max(Math.abs(dbValue), Math.abs(sourceValue));
  if (maxVal === 0) return 0;
  return Math.abs(dbValue - sourceValue) / maxVal;
}

function buildLiteLLMMap(
  allModels: Record<string, ModelOption[]>
): Map<string, { inputCostPerToken: number; outputCostPerToken: number }> {
  const map = new Map<string, { inputCostPerToken: number; outputCostPerToken: number }>();
  for (const [provider, models] of Object.entries(allModels)) {
    for (const model of models) {
      if (model.inputCost !== undefined && model.outputCost !== undefined) {
        map.set(`${provider}/${model.name}`, {
          inputCostPerToken: model.inputCost,
          outputCostPerToken: model.outputCost,
        });
      }
    }
  }
  return map;
}

function buildOpenRouterMap(
  pricing: NormalizedPricing[]
): Map<string, { inputCostPerToken: number; outputCostPerToken: number }> {
  const map = new Map<string, { inputCostPerToken: number; outputCostPerToken: number }>();
  for (const p of pricing) {
    map.set(`${p.provider}/${p.model}`, {
      inputCostPerToken: p.inputCostPerToken,
      outputCostPerToken: p.outputCostPerToken,
    });
  }
  return map;
}

function buildProviderPageMap(
  pages: Record<string, ProviderPagePricing[]>
): Map<string, { inputCostPerToken?: number; outputCostPerToken?: number; url: string }> {
  const map = new Map<string, { inputCostPerToken?: number; outputCostPerToken?: number; url: string }>();
  for (const [, pricingList] of Object.entries(pages)) {
    for (const p of pricingList) {
      map.set(`${p.provider}/${p.model}`, {
        inputCostPerToken: p.inputCostPerToken,
        outputCostPerToken: p.outputCostPerToken,
        url: p.url,
      });
    }
  }
  return map;
}

export async function compareAgainstDbRates(
  threshold: number = RATE_SOURCE_DRIFT_THRESHOLD,
  options?: { forceRefresh?: boolean }
): Promise<PriceDiscrepancy[]> {
  const forceRefresh = options?.forceRefresh ?? false;

  // Fetch all three sources in parallel
  const [litellmModels, openrouterPricing, providerPages, dbRates, providers] = await Promise.all([
    modelRegistry.getAllModels().catch((err) => {
      logger.warn('Failed to fetch LiteLLM data for comparison', { error: err });
      return {} as Record<string, ModelOption[]>;
    }),
    forceRefresh
      ? openRouterPricing.refreshPricing().catch((err) => {
          logger.warn('Failed to refresh OpenRouter data for comparison', { error: err });
          return [] as NormalizedPricing[];
        })
      : openRouterPricing.getAllPricing().catch((err) => {
          logger.warn('Failed to fetch OpenRouter data for comparison', { error: err });
          return [] as NormalizedPricing[];
        }),
    fetchAllProviderPages().catch((err) => {
      logger.warn('Failed to fetch provider pages for comparison', { error: err });
      return {} as Record<string, ProviderPagePricing[]>;
    }),
    AiModelRate.findAll(),
    AiProvider.findAll(),
  ]);

  const providerMap = new Map(providers.map((p) => [p.id, p.name]));
  const litellmMap = buildLiteLLMMap(litellmModels);
  const openrouterMap = buildOpenRouterMap(openrouterPricing);
  const pageMap = buildProviderPageMap(providerPages);

  const discrepancies: PriceDiscrepancy[] = [];

  for (const rate of dbRates) {
    const providerName = providerMap.get(rate.providerId) || '';
    const lookupKey = `${providerName}/${rate.model}`;

    const dbInput = Number(rate.unitCosts?.input ?? rate.inputRate ?? 0);
    const dbOutput = Number(rate.unitCosts?.output ?? rate.outputRate ?? 0);

    const litellm = litellmMap.get(lookupKey);
    const openrouter = openrouterMap.get(lookupKey);
    const page = pageMap.get(lookupKey);

    const drifts: PriceDiscrepancy['drifts'] = {};
    let maxDrift = 0;

    if (litellm) {
      const inputDrift = calcDrift(dbInput, litellm.inputCostPerToken);
      const outputDrift = calcDrift(dbOutput, litellm.outputCostPerToken);
      const drift = Math.max(inputDrift, outputDrift);
      drifts.litellm = { inputDrift, outputDrift, maxDrift: drift };
      maxDrift = Math.max(maxDrift, drift);
    }

    if (openrouter) {
      const inputDrift = calcDrift(dbInput, openrouter.inputCostPerToken);
      const outputDrift = calcDrift(dbOutput, openrouter.outputCostPerToken);
      const drift = Math.max(inputDrift, outputDrift);
      drifts.openrouter = { inputDrift, outputDrift, maxDrift: drift };
      maxDrift = Math.max(maxDrift, drift);
    }

    // Only report if at least one source has data
    if (!litellm && !openrouter && !page) continue;

    const exceedsThreshold = maxDrift > threshold;

    discrepancies.push({
      providerId: rate.providerId,
      providerName,
      model: rate.model,
      type: rate.type as string,
      dbUnitCosts: rate.unitCosts
        ? { input: Number(rate.unitCosts.input), output: Number(rate.unitCosts.output) }
        : null,
      dbInputRate: Number(rate.inputRate),
      dbOutputRate: Number(rate.outputRate),
      sources: {
        litellm: litellm || undefined,
        openrouter: openrouter || undefined,
        providerPage: page || undefined,
      },
      drifts,
      maxDrift,
      exceedsThreshold,
    });
  }

  // Sort by drift descending
  discrepancies.sort((a, b) => b.maxDrift - a.maxDrift);

  logger.info('Rate comparison completed', {
    totalChecked: dbRates.length,
    discrepanciesFound: discrepancies.filter((d) => d.exceedsThreshold).length,
    threshold,
  });

  return discrepancies;
}
