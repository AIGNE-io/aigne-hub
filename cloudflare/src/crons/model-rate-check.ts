import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { aiModelRateHistories, aiModelRates, aiProviders } from '../db/schema';
import * as schema from '../db/schema';
import { logger } from '../libs/logger';

type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

interface RateCheckResult {
  checked: number;
  belowCost: number;
  autoUpdated: number;
}

/**
 * Detect models where the selling rate (inputRate/outputRate) is below the unit cost.
 * Optionally auto-update rates to prevent margin loss.
 *
 * This is a simplified version focused on below-cost detection using the unitCosts
 * field already stored in aiModelRates. External price source comparison (drift detection)
 * is handled separately by the pricing analyzer tool.
 */
export async function checkModelRates(
  db: DB,
  options?: { autoUpdate?: boolean }
): Promise<RateCheckResult> {
  const autoUpdate = options?.autoUpdate ?? false;
  let belowCost = 0;
  let autoUpdated = 0;

  // Fetch all active (non-deprecated) model rates that have unitCosts defined
  const rates = await db
    .select({ rate: aiModelRates, provider: aiProviders })
    .from(aiModelRates)
    .innerJoin(aiProviders, eq(aiModelRates.providerId, aiProviders.id))
    .where(and(eq(aiModelRates.deprecated, false), eq(aiProviders.enabled, true)));

  const now = Math.floor(Date.now() / 1000);

  for (const { rate, provider } of rates) {
    if (!rate.unitCosts) continue;

    const unitCosts = typeof rate.unitCosts === 'string' ? JSON.parse(rate.unitCosts) : rate.unitCosts;
    const costInput = parseFloat((unitCosts as Record<string, unknown>).input as string) || 0;
    const costOutput = parseFloat((unitCosts as Record<string, unknown>).output as string) || 0;

    // Skip if no unit costs defined
    if (costInput === 0 && costOutput === 0) continue;

    const currentInput = parseFloat(rate.inputRate);
    const currentOutput = parseFloat(rate.outputRate);

    const inputBelowCost = costInput > 0 && currentInput < costInput;
    const outputBelowCost = costOutput > 0 && currentOutput < costOutput;

    if (!inputBelowCost && !outputBelowCost) continue;

    belowCost++;

    // Calculate drift percentage (how far below cost)
    const inputDrift = costInput > 0 ? ((costInput - currentInput) / costInput * 100).toFixed(1) : '0';
    const outputDrift = costOutput > 0 ? ((costOutput - currentOutput) / costOutput * 100).toFixed(1) : '0';
    const maxDrift = Math.max(parseFloat(inputDrift), parseFloat(outputDrift));

    logger.warn('Below-cost model detected', {
      provider: provider.name,
      model: rate.model,
      currentInput: rate.inputRate,
      currentOutput: rate.outputRate,
      costInput: String(costInput),
      costOutput: String(costOutput),
      driftPercent: maxDrift.toFixed(1),
    });

    if (autoUpdate) {
      // Auto-fix: raise rates to at least match unit costs
      const newInput = inputBelowCost ? costInput : currentInput;
      const newOutput = outputBelowCost ? costOutput : currentOutput;

      // Only update if something actually changes
      if (newInput !== currentInput || newOutput !== currentOutput) {
        await db
          .update(aiModelRates)
          .set({
            inputRate: String(newInput),
            outputRate: String(newOutput),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(aiModelRates.id, rate.id));
        autoUpdated++;
      }
    }

    // Record history entry regardless of auto-update
    try {
      await db.insert(aiModelRateHistories).values({
        providerId: provider.id,
        model: rate.model,
        type: rate.type,
        changeType: autoUpdate ? 'auto_update' : 'source_drift',
        source: 'cron:model-rate-check',
        previousUnitCosts: rate.unitCosts as any,
        currentUnitCosts: rate.unitCosts as any,
        previousRates: JSON.stringify({ inputRate: rate.inputRate, outputRate: rate.outputRate }),
        currentRates: autoUpdate
          ? JSON.stringify({
              inputRate: inputBelowCost ? String(costInput) : rate.inputRate,
              outputRate: outputBelowCost ? String(costOutput) : rate.outputRate,
            })
          : JSON.stringify({ inputRate: rate.inputRate, outputRate: rate.outputRate }),
        driftPercent: maxDrift.toFixed(1),
        detectedAt: now,
        metadata: JSON.stringify({
          inputBelowCost,
          outputBelowCost,
          inputDriftPercent: inputDrift,
          outputDriftPercent: outputDrift,
        }),
      });
    } catch (err) {
      logger.error('Failed to record rate history', {
        model: rate.model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked: rates.length, belowCost, autoUpdated };
}
