import logger from '../libs/logger';
import { dataArchiveService } from '../services/data-archive';

export async function executeArchiveTask(): Promise<void> {
  const startTime = Date.now();

  logger.info('Archive task started');

  const modelCallsResult = await dataArchiveService.archiveModelCalls();
  const modelCallStatsResult = await dataArchiveService.archiveModelCallStats();

  const totalDuration = (Date.now() - startTime) / 1000;

  logger.info('Archive task completed', {
    totalDuration,
    results: {
      modelCalls: {
        success: modelCallsResult.success,
        archived: modelCallsResult.archivedCount,
        duration: modelCallsResult.duration,
      },
      modelCallStats: {
        success: modelCallStatsResult.success,
        archived: modelCallStatsResult.archivedCount,
        duration: modelCallStatsResult.duration,
      },
    },
  });
}
