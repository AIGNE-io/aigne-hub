import { ENABLE_AUTO_RATE_UPDATE, RATE_SOURCE_DRIFT_THRESHOLD } from '@api/libs/env';
import logger from '@api/libs/logger';
import { NotificationManager } from '@api/libs/notifications/manager';
import { compareAgainstDbRates } from '@api/libs/pricing-comparison';
import type { ComparisonResult } from '@api/libs/pricing-comparison';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiModelRateHistory from '@api/store/models/ai-model-rate-history';
import AiProvider from '@api/store/models/ai-provider';

export async function executeRateCheck(): Promise<void> {
  logger.info('Starting rate check...');

  try {
    const results = await compareAgainstDbRates(RATE_SOURCE_DRIFT_THRESHOLD);

    const belowCost = results.filter((r) => r.classification === 'below-cost');
    const drift = results.filter((r) => r.classification === 'drift');

    if (belowCost.length === 0 && drift.length === 0) {
      logger.info('Rate check completed: no issues detected');
      return;
    }

    logger.warn('Rate issues detected', {
      belowCost: belowCost.length,
      drift: drift.length,
      threshold: RATE_SOURCE_DRIFT_THRESHOLD,
      belowCostModels: belowCost.map((d) => ({
        model: `${d.provider}/${d.model}`,
        dbInput: d.dbInput,
        dbOutput: d.dbOutput,
        bestCostInput: d.bestCostInput,
        bestCostOutput: d.bestCostOutput,
        bestCostSource: d.bestCostSource,
        inputMargin: d.inputMargin != null ? `${d.inputMargin.toFixed(1)}%` : undefined,
        outputMargin: d.outputMargin != null ? `${d.outputMargin.toFixed(1)}%` : undefined,
      })),
    });

    const now = Math.floor(Date.now() / 1000);
    await recordHistory([...belowCost, ...drift], now);

    let autoUpdated = 0;
    logger.info('Auto-update check', {
      ENABLE_AUTO_RATE_UPDATE,
      belowCostCount: belowCost.length,
      envRaw: process.env.ENABLE_AUTO_RATE_UPDATE,
    });
    if (ENABLE_AUTO_RATE_UPDATE && belowCost.length > 0) {
      autoUpdated = await autoApplyUpdates(belowCost);
    }

    await sendNotification(belowCost, drift, autoUpdated);

    logger.info('Rate check completed', { belowCost: belowCost.length, drift: drift.length, autoUpdated });
  } catch (error) {
    logger.error('Rate check failed', { error });
  }
}

/**
 * Auto-fix below-cost models:
 * - unitCosts → bestCost (standard tier cost basis)
 * - inputRate/outputRate → raised to highest tier cost (ensure no loss at any usage level)
 *
 * pricing-core provides:
 * - bestCostInput/Output: standard cost (for unitCosts)
 * - tierMaxInput/Output: highest context-tier cost (for sell rate floor)
 * - cacheTierMaxWrite/Read: highest cache tier (for caching rate floor)
 */
async function autoApplyUpdates(entries: ComparisonResult[]): Promise<number> {
  let updated = 0;
  const providers = await AiProvider.findAll();
  const nameToId = new Map(providers.map((p) => [p.name as string, p.id]));

  for (const d of entries) {
    const providerId = nameToId.get(d.provider);
    if (!providerId) continue;

    try {
      const rate = await AiModelRate.findOne({
        where: { providerId, model: d.model, type: d.type },
      });
      if (!rate) continue;

      const prevUnitCosts = rate.unitCosts ? { ...rate.unitCosts } : null;
      const prevInputRate = Number(rate.inputRate ?? 0);
      const prevOutputRate = Number(rate.outputRate ?? 0);

      // unitCosts = standard cost basis
      const newUnitCosts = {
        input: d.bestCostInput ?? Number(rate.unitCosts?.input ?? 0),
        output: d.bestCostOutput ?? Number(rate.unitCosts?.output ?? 0),
      };

      // sell rate = max(current sell, highest tier cost) — ensure no loss
      const highestInput = Math.max(d.tierMaxInput ?? 0, d.bestCostInput ?? 0);
      const highestOutput = Math.max(d.tierMaxOutput ?? 0, d.bestCostOutput ?? 0);
      const newInputRate = Math.max(prevInputRate, highestInput);
      const newOutputRate = Math.max(prevOutputRate, highestOutput);

      // cache write/read = max(current, highest cache tier cost)
      const prevCacheWrite = rate.caching ? Number(rate.caching.writeRate ?? 0) : 0;
      const prevCacheRead = rate.caching ? Number(rate.caching.readRate ?? 0) : 0;
      const highestCacheWrite = Math.max(d.cacheTierMaxWrite ?? 0, d.officialCacheWrite ?? 0, d.litellmCacheWrite ?? 0);
      const highestCacheRead = Math.max(d.cacheTierMaxRead ?? 0, d.officialCacheRead ?? 0, d.litellmCacheRead ?? 0);
      const newCacheWrite = Math.max(prevCacheWrite, highestCacheWrite);
      const newCacheRead = Math.max(prevCacheRead, highestCacheRead);

      const updateFields: Record<string, any> = { unitCosts: newUnitCosts };
      if (newInputRate > prevInputRate) updateFields.inputRate = newInputRate;
      if (newOutputRate > prevOutputRate) updateFields.outputRate = newOutputRate;

      // Update caching if any value needs to be raised
      if (newCacheWrite > prevCacheWrite || newCacheRead > prevCacheRead) {
        updateFields.caching = {
          writeRate: newCacheWrite > prevCacheWrite ? newCacheWrite : prevCacheWrite,
          readRate: newCacheRead > prevCacheRead ? newCacheRead : prevCacheRead,
        };
      }

      // Skip if nothing actually changes
      const unitCostsChanged =
        newUnitCosts.input !== Number(prevUnitCosts?.input ?? 0) ||
        newUnitCosts.output !== Number(prevUnitCosts?.output ?? 0);
      const ratesChanged = updateFields.inputRate != null || updateFields.outputRate != null;
      const cachingChanged = updateFields.caching != null;
      if (!unitCostsChanged && !ratesChanged && !cachingChanged) {
        logger.info('Auto-update skipped (no change)', { model: `${d.provider}/${d.model}` });
        continue;
      }

      await rate.update(updateFields);

      await AiModelRateHistory.create({
        providerId,
        model: d.model,
        type: d.type,
        changeType: 'auto_update',
        source: d.bestCostSource || 'unknown',
        previousUnitCosts: prevUnitCosts,
        currentUnitCosts: newUnitCosts,
        previousRates: { inputRate: prevInputRate, outputRate: prevOutputRate },
        currentRates: {
          inputRate: updateFields.inputRate ?? prevInputRate,
          outputRate: updateFields.outputRate ?? prevOutputRate,
        },
        driftPercent: Math.round(d.maxDrift * 10000) / 100,
        detectedAt: Math.floor(Date.now() / 1000),
        metadata: { classification: d.classification },
      });

      updated++;
      logger.info('Auto-updated model', {
        model: `${d.provider}/${d.model}`,
        unitCosts: unitCostsChanged ? { prev: prevUnitCosts, new: newUnitCosts } : 'unchanged',
        inputRate: updateFields.inputRate != null ? { prev: prevInputRate, new: newInputRate } : 'unchanged',
        outputRate: updateFields.outputRate != null ? { prev: prevOutputRate, new: newOutputRate } : 'unchanged',
        cacheWrite: updateFields.caching ? { prev: prevCacheWrite, new: newCacheWrite } : 'unchanged',
        cacheRead: updateFields.caching ? { prev: prevCacheRead, new: newCacheRead } : 'unchanged',
        source: d.bestCostSource,
      });
    } catch (err) {
      logger.error('Failed to auto-update', {
        model: `${d.provider}/${d.model}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (updated > 0) logger.info('Auto-applied updates', { updated, total: entries.length });
  return updated;
}

async function recordHistory(models: ComparisonResult[], timestamp: number): Promise<void> {
  const records = models.map((d) => ({
    providerId: d.provider,
    model: d.model,
    type: d.type,
    changeType: 'source_drift' as const,
    source: d.bestCostSource || 'unknown',
    previousUnitCosts: { input: d.dbInput, output: d.dbOutput },
    currentUnitCosts: null,
    previousRates: { inputRate: d.inputRate ?? 0, outputRate: d.outputRate ?? 0 },
    currentRates: null,
    driftPercent: Math.round(d.maxDrift * 10000) / 100,
    detectedAt: timestamp,
    metadata: {
      classification: d.classification,
      bestCostInput: d.bestCostInput,
      bestCostOutput: d.bestCostOutput,
      bestCostSource: d.bestCostSource,
      inputMargin: d.inputMargin,
      outputMargin: d.outputMargin,
    },
  }));

  try {
    await AiModelRateHistory.bulkCreate(records);
    logger.info('Recorded history', { count: records.length });
  } catch (error) {
    logger.error('Failed to record history', { error });
  }
}

async function sendNotification(
  belowCost: ComparisonResult[],
  drift: ComparisonResult[],
  autoUpdated: number
): Promise<void> {
  const fmtMtok = (v: number) => `$${(v * 1e6).toFixed(2)}`;

  const formatModel = (d: ComparisonResult) => {
    const parts = [`${d.provider}/${d.model}`];
    if (d.bestCostOutput) parts.push(`cost=${fmtMtok(d.bestCostOutput)}`);
    if (d.outputRate) parts.push(`sell=${fmtMtok(d.outputRate)}`);
    if (d.outputMargin != null) parts.push(`${d.outputMargin.toFixed(1)}%`);
    return `• ${parts.join(' ')}`;
  };

  const sections: string[] = [];

  if (autoUpdated > 0) {
    sections.push(`✅ Auto-fixed: ${autoUpdated} model(s)`);
  }

  if (belowCost.length > 0) {
    const list = belowCost.slice(0, 5).map(formatModel).join('\n');
    sections.push(
      `🔴 Below cost (${belowCost.length}):\n${list}${belowCost.length > 5 ? `\n  ...+${belowCost.length - 5} more` : ''}`
    );
  }

  if (drift.length > 0) {
    const list = drift.slice(0, 3).map(formatModel).join('\n');
    sections.push(`🟡 Drift (${drift.length}):\n${list}${drift.length > 3 ? `\n  ...+${drift.length - 3} more` : ''}`);
  }

  const title =
    belowCost.length > 0
      ? `🔴 ${belowCost.length} model(s) below cost${drift.length > 0 ? `, ${drift.length} drift` : ''}`
      : `🟡 ${drift.length} model(s) price drift`;

  try {
    await NotificationManager.sendCustomNotificationByRoles(['owner'], {
      title,
      body: sections.join('\n\n'),
      actions: [{ name: 'view', title: 'View Model Rates', link: '/admin/ai-providers' }],
    });
    logger.info('Notification sent', { belowCost: belowCost.length, drift: drift.length });
  } catch (error) {
    logger.error('Failed to send notification', { error });
  }
}
