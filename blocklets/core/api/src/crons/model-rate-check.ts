import { RATE_SOURCE_DRIFT_THRESHOLD } from '@api/libs/env';
import logger from '@api/libs/logger';
import { NotificationManager } from '@api/libs/notifications/manager';
import { compareAgainstDbRates } from '@api/libs/pricing-comparison';
import type { PriceDiscrepancy } from '@api/libs/pricing-comparison';
import AiModelRateHistory from '@api/store/models/ai-model-rate-history';

export async function executeRateCheck(): Promise<void> {
  logger.info('Starting rate check...');

  try {
    const discrepancies = await compareAgainstDbRates(RATE_SOURCE_DRIFT_THRESHOLD, { forceRefresh: true });

    const drifted = discrepancies.filter((d) => d.exceedsThreshold);

    if (drifted.length === 0) {
      logger.info('Rate check completed: no significant drift detected');
      return;
    }

    logger.warn('Rate drift detected', {
      count: drifted.length,
      threshold: RATE_SOURCE_DRIFT_THRESHOLD,
    });

    // Record drift history
    const now = Math.floor(Date.now() / 1000);
    await recordDriftHistory(drifted, now);

    // Send notification
    await sendDriftNotification(drifted);

    logger.info('Rate check completed', { driftedModels: drifted.length });
  } catch (error) {
    logger.error('Rate check failed', { error });
  }
}

async function recordDriftHistory(drifted: PriceDiscrepancy[], timestamp: number): Promise<void> {
  const records = drifted.map((d) => ({
    providerId: d.providerId,
    model: d.model,
    type: d.type,
    changeType: 'source_drift' as const,
    source: d.drifts.litellm ? 'litellm' : d.drifts.openrouter ? 'openrouter' : 'unknown',
    previousUnitCosts: d.dbUnitCosts,
    currentUnitCosts: null,
    previousRates: { inputRate: d.dbInputRate, outputRate: d.dbOutputRate },
    currentRates: null,
    driftPercent: Math.round(d.maxDrift * 10000) / 100,
    detectedAt: timestamp,
    metadata: {
      sources: d.sources,
      drifts: d.drifts,
    },
  }));

  try {
    await AiModelRateHistory.bulkCreate(records);
    logger.info('Recorded drift history', { count: records.length });
  } catch (error) {
    logger.error('Failed to record drift history', { error });
  }
}

async function sendDriftNotification(drifted: PriceDiscrepancy[]): Promise<void> {
  const top5 = drifted.slice(0, 5);
  const modelList = top5
    .map((d) => `• ${d.providerName}/${d.model}: ${(d.maxDrift * 100).toFixed(1)}% drift`)
    .join('\n');

  const title = `Rate Drift Alert: ${drifted.length} model(s) detected`;
  const body = `The following models have pricing that differs from external sources by more than ${(RATE_SOURCE_DRIFT_THRESHOLD * 100).toFixed(0)}%:\n\n${modelList}${drifted.length > 5 ? `\n\n...and ${drifted.length - 5} more` : ''}`;

  try {
    await NotificationManager.sendCustomNotificationByRoles(['owner'], {
      title,
      body,
      actions: [
        {
          name: 'view',
          title: 'View Model Rates',
          link: '/admin/ai-providers',
        },
      ],
    });
    logger.info('Drift notification sent');
  } catch (error) {
    logger.error('Failed to send drift notification', { error });
  }
}
