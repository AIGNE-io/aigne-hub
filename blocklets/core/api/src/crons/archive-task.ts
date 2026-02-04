import fs from 'fs/promises';
import path from 'path';

import lockfile from 'proper-lockfile';

import { ArchiveDatabase } from '../libs/archive-database';
import { ArchiveResult, dataArchiveService } from '../libs/data-archive';
import { Config, MIN_ARCHIVE_FREE_GB } from '../libs/env';
import logger from '../libs/logger';
import ArchiveExecutionLog, { ArchiveTableName } from '../store/models/archive-execution-log';

const BYTES_PER_GB = 1024 ** 3;

/**
 * Get archive task lock file path
 */
function getLockFilePath(): string {
  const dataDir = Config.dataDir || process.cwd();
  return path.join(dataDir, 'archive.lock');
}

async function getFreeDiskGb(targetPath: string): Promise<number> {
  const stats = await fs.statfs(targetPath);
  const freeBytes = stats.bavail * stats.bsize;
  return freeBytes / BYTES_PER_GB;
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
  const dataDir = Config.dataDir || process.cwd();
  try {
    const freeGb = await getFreeDiskGb(dataDir);
    if (freeGb < MIN_ARCHIVE_FREE_GB) {
      logger.warn('Archive task skipped due to low disk space', {
        dataDir,
        freeGb,
        minFreeGb: MIN_ARCHIVE_FREE_GB,
      });
      return;
    }
  } catch (error) {
    logger.warn('Failed to check free disk space for archive task', { dataDir, error });
  }

  const lockFilePath = getLockFilePath();
  let releaseLock: (() => Promise<void>) | null = null;

  try {
    // Try to acquire the lock (1-hour stale timeout)
    releaseLock = await lockfile.lock(lockFilePath, {
      stale: 3600000, // Lock automatically expires after 1 hour
      retries: 0, // No retries, fail fast
      realpath: false, // Skip realpath resolution to allow locking non-existent target files
    });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ELOCKED') {
      logger.info('Another archive process is running, skip this execution');
      return;
    }
    logger.error('Failed to acquire archive lock', { error: err });
    return;
  }

  try {
    const startTime = Date.now();
    logger.info('Archive task started');

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
