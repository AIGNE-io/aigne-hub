import path from 'path';

import lockfile from 'proper-lockfile';

import { ArchiveDatabase } from '../libs/archive-database';
import { ArchiveResult, dataArchiveService } from '../libs/data-archive';
import { Config } from '../libs/env';
import logger from '../libs/logger';
import ArchiveExecutionLog, { ArchiveTableName } from '../store/models/archive-execution-log';

/**
 * Get archive task lock file path
 */
function getLockFilePath(): string {
  const dataDir = Config.dataDir || process.cwd();
  return path.join(dataDir, 'archive.lock');
}

/**
 * Record archive execution results to ArchiveExecutionLog
 */
async function logArchiveResult(tableName: ArchiveTableName, result: ArchiveResult): Promise<void> {
  try {
    await ArchiveExecutionLog.create({
      tableName,
      status: result.success ? 'success' : 'failed',
      archivedCount: result.archivedCount,
      dataRangeStart: result.dataRangeStart ?? null,
      dataRangeEnd: result.dataRangeEnd ?? null,
      targetArchiveDb: result.targetArchiveDbs?.join(', ') ?? null,
      duration: result.duration,
      errorMessage: result.errorMessage ?? null,
    });
  } catch (error) {
    logger.error('Failed to log archive result', { tableName, error });
  }
}

/**
 * Execute data archiving task
 * Use a file lock to prevent concurrent execution across processes/instances
 */
export async function executeArchiveTask(): Promise<void> {
  const lockFilePath = getLockFilePath();
  let releaseLock: (() => Promise<void>) | null = null;

  try {
    // Try to acquire the lock (1-hour stale timeout)
    releaseLock = await lockfile.lock(lockFilePath, {
      stale: 3600000, // Lock automatically expires after 1 hour
      retries: 0, // No retries, fail fast
    });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ELOCKED') {
      logger.info('Another archive process is running, skip this execution');
      return;
    }
    // If the lock file doesn't exist, create it
    if (error.code === 'ENOENT') {
      const fs = await import('fs/promises');
      await fs.writeFile(lockFilePath, '');
      try {
        releaseLock = await lockfile.lock(lockFilePath, {
          stale: 3600000,
          retries: 0,
        });
      } catch (retryErr) {
        logger.error('Failed to acquire archive lock after creating lock file', { error: retryErr });
        return;
      }
    } else {
      logger.error('Failed to acquire archive lock', { error: err });
      return;
    }
  }

  const startTime = Date.now();
  logger.info('Archive task started');

  try {
    // Archive three tables sequentially (SQLite is single-threaded; serial is safer)
    const modelCallsResult = await dataArchiveService.archiveModelCalls();
    await logArchiveResult('ModelCalls', modelCallsResult);

    const modelCallStatsResult = await dataArchiveService.archiveModelCallStats();
    await logArchiveResult('ModelCallStats', modelCallStatsResult);

    const usageResult = await dataArchiveService.archiveUsage();
    await logArchiveResult('Usage', usageResult);

    // Automatically clean up expired archive databases
    try {
      const deletedFiles = await ArchiveDatabase.cleanupOldArchives();
      if (deletedFiles.length > 0) {
        logger.info('Old archives cleaned up', { deletedFiles });
      }
    } catch (error) {
      logger.error('Failed to cleanup old archives', { error });
    }

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
        usage: {
          success: usageResult.success,
          archived: usageResult.archivedCount,
          duration: usageResult.duration,
        },
      },
    });
  } finally {
    // Release the file lock
    if (releaseLock) {
      try {
        await releaseLock();
        logger.info('Archive lock released');
      } catch (err) {
        logger.error('Failed to release archive lock', { error: err });
      }
    }
  }
}
