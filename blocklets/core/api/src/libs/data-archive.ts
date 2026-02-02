import fs from 'fs/promises';

import { QueryTypes } from 'sequelize';

import { sequelize } from '../store/sequelize';
import { ArchiveDatabase } from './archive-database';
import dayjs from './dayjs';
import { RETENTION_MODEL_CALL_MONTHS, RETENTION_MODEL_CALL_STATS_MONTHS, RETENTION_USAGE_MONTHS } from './env';
import logger from './logger';

export interface ArchiveResult {
  success: boolean;
  archivedCount: number;
  errorMessage?: string;
  duration: number;
  dataRangeStart?: number;
  dataRangeEnd?: number;
  targetArchiveDbs?: string[];
}

type FieldType = 'timestamp' | 'date';

type QuarterRange = { key: string; start: Date; end: Date };

interface TableConfig {
  tableName: string;
  timeField: string;
  retentionMonths: number;
  fieldType: FieldType;
}

/**
 * Data archiving service
 *
 * Quarterly archive strategy:
 * - One SQLite file per quarter (archive_2025_Q1.db, archive_2025_Q2.db, ...)
 * - Table names match source tables (model_calls, model_call_stats, usage)
 *
 * Archive flow:
 * ATTACH → (INSERT + DELETE in transaction) → DETACH
 */
export class DataArchiveService {
  // SQLite has a binding parameter limit of 999, keep batch size safely below it
  private static readonly BATCH_SIZE = 800;

  private static readonly BATCH_DELAY_MS = 100;

  private static readonly TABLE_CONFIGS: Record<string, TableConfig> = {
    ModelCalls: {
      tableName: 'ModelCalls',
      timeField: 'callTime',
      retentionMonths: RETENTION_MODEL_CALL_MONTHS,
      fieldType: 'timestamp',
    },
    ModelCallStats: {
      tableName: 'ModelCallStats',
      timeField: 'timestamp',
      retentionMonths: RETENTION_MODEL_CALL_STATS_MONTHS,
      fieldType: 'timestamp',
    },
    Usage: {
      tableName: 'Usages',
      timeField: 'createdAt',
      retentionMonths: RETENTION_USAGE_MONTHS,
      fieldType: 'date',
    },
  };

  /**
   * Archive ModelCalls table
   */
  async archiveModelCalls(): Promise<ArchiveResult> {
    return this.archiveTable(DataArchiveService.TABLE_CONFIGS.ModelCalls!);
  }

  /**
   * Archive ModelCallStats table
   */
  async archiveModelCallStats(): Promise<ArchiveResult> {
    return this.archiveTable(DataArchiveService.TABLE_CONFIGS.ModelCallStats!);
  }

  /**
   * Archive Usage table
   */
  async archiveUsage(): Promise<ArchiveResult> {
    return this.archiveTable(DataArchiveService.TABLE_CONFIGS.Usage!);
  }

  /**
   * Generic archive method
   */
  private async archiveTable(config: TableConfig): Promise<ArchiveResult> {
    const { tableName, timeField, retentionMonths, fieldType } = config;
    const startTime = Date.now();
    const targetArchiveDbs: string[] = [];

    // Use calculateCutoffDate to compute a precise calendar-month cutoff
    const cutoffDate = this.calculateCutoffDate(retentionMonths);
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

    try {
      let totalArchived = 0;

      const { ranges, dataRangeStart, dataRangeEnd } = await this.getQuarterRanges(
        tableName,
        timeField,
        fieldType,
        cutoffTimestamp,
        cutoffDate
      );

      for (const range of ranges) {
        const archivePath = ArchiveDatabase.getArchivePath(range.key);
        // eslint-disable-next-line no-await-in-loop
        await this.ensureArchiveTables(archivePath);
      }

      for (const range of ranges) {
        const dbName = ArchiveDatabase.getDbName(range.key);
        if (!targetArchiveDbs.includes(dbName)) {
          targetArchiveDbs.push(dbName);
        }

        // eslint-disable-next-line no-await-in-loop
        const archivedCount = await this.archiveQuarter(tableName, timeField, fieldType, range);
        totalArchived += archivedCount;
      }

      return {
        success: true,
        archivedCount: totalArchived,
        duration: (Date.now() - startTime) / 1000,
        dataRangeStart,
        dataRangeEnd,
        targetArchiveDbs,
      };
    } catch (error) {
      logger.error(`Failed to archive ${tableName}`, { error });
      return {
        success: false,
        archivedCount: 0,
        errorMessage: (error as Error).message,
        duration: (Date.now() - startTime) / 1000,
        targetArchiveDbs,
      };
    }
  }

  private async archiveQuarter(
    tableName: string,
    timeField: string,
    fieldType: FieldType,
    range: QuarterRange
  ): Promise<number> {
    const archivePath = ArchiveDatabase.getArchivePath(range.key);
    const dbName = ArchiveDatabase.getDbName(range.key);
    await fs.mkdir(ArchiveDatabase.getArchiveDir(), { recursive: true });

    const connection = await sequelize.connectionManager.getConnection({ type: 'write' });
    const txLike = { connection } as { connection: unknown };

    try {
      await sequelize.query('ATTACH DATABASE :path AS archive', {
        replacements: { path: archivePath },
        transaction: txLike as any,
      });

      let totalArchived = 0;
      let batchCount = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const count = await this.migrateBatchWithAttach(tableName, timeField, fieldType, range, txLike);
        if (count === 0) break;

        totalArchived += count;
        batchCount += 1;

        logger.info('Batch archived', {
          table: tableName,
          quarter: range.key,
          batchNumber: batchCount,
          recordsArchived: count,
          targetDb: dbName,
        });

        if (DataArchiveService.BATCH_DELAY_MS > 0) {
          // eslint-disable-next-line no-await-in-loop
          await this.sleep(DataArchiveService.BATCH_DELAY_MS);
        }
      }

      return totalArchived;
    } finally {
      await sequelize.query('DETACH DATABASE archive', { transaction: txLike as any }).catch((error) => {
        logger.error('Failed to detach archive database', { error, quarter: range.key });
      });
      await sequelize.connectionManager.releaseConnection(connection);
    }
  }

  /**
   * Batch migrate data (ATTACH cross-database transaction)
   */
  private async migrateBatchWithAttach(
    tableName: string,
    timeField: string,
    fieldType: FieldType,
    range: QuarterRange,
    txLike: { connection: unknown }
  ): Promise<number> {
    const { startValue, endValue } = this.getRangeValues(fieldType, range);

    await sequelize.query('BEGIN IMMEDIATE', { transaction: txLike as any });
    try {
      const records = (await sequelize.query(
        `SELECT id FROM main."${tableName}"
         WHERE "${timeField}" >= :start
           AND "${timeField}" < :end
         LIMIT :limit`,
        {
          replacements: {
            start: startValue,
            end: endValue,
            limit: DataArchiveService.BATCH_SIZE,
          },
          type: QueryTypes.SELECT,
          transaction: txLike as any,
        }
      )) as Array<{ id: string }>;

      if (records.length === 0) {
        await sequelize.query('COMMIT', { transaction: txLike as any });
        return 0;
      }

      const ids = records.map((r) => r.id);

      await sequelize.query(
        `INSERT INTO archive."${tableName}"
         SELECT * FROM main."${tableName}" WHERE id IN (:ids)`,
        { replacements: { ids }, transaction: txLike as any }
      );
      const insertedCount = await this.getLastChangeCount(txLike);
      if (insertedCount !== records.length) {
        throw new Error(
          `Archive batch insert count mismatch for ${tableName} ${range.key}: expected ${records.length}, inserted ${insertedCount}`
        );
      }

      await sequelize.query(`DELETE FROM main."${tableName}" WHERE id IN (:ids)`, {
        replacements: { ids },
        transaction: txLike as any,
      });
      const deletedCount = await this.getLastChangeCount(txLike);
      if (deletedCount !== records.length) {
        throw new Error(
          `Archive batch delete count mismatch for ${tableName} ${range.key}: expected ${records.length}, deleted ${deletedCount}`
        );
      }

      await sequelize.query('COMMIT', { transaction: txLike as any });

      return records.length;
    } catch (error) {
      await sequelize.query('ROLLBACK', { transaction: txLike as any }).catch((rollbackError) => {
        logger.error('Failed to rollback archive batch', {
          error: rollbackError,
          table: tableName,
          quarter: range.key,
        });
      });
      throw error;
    }
  }

  private getRangeValues(
    fieldType: FieldType,
    range: QuarterRange
  ): { startValue: number | string; endValue: number | string } {
    if (fieldType === 'timestamp') {
      return {
        startValue: Math.floor(range.start.getTime() / 1000),
        endValue: Math.floor(range.end.getTime() / 1000),
      };
    }

    return {
      startValue: this.formatDateForSqliteUtc(range.start),
      endValue: this.formatDateForSqliteUtc(range.end),
    };
  }

  private async getLastChangeCount(txLike: { connection: unknown }): Promise<number> {
    const result = (await sequelize.query('SELECT changes() as count', {
      type: QueryTypes.SELECT,
      transaction: txLike as any,
    })) as Array<{ count: number | string }>;
    const count = Number(result[0]?.count ?? 0);
    return Number.isFinite(count) ? count : 0;
  }

  private async getQuarterRanges(
    tableName: string,
    timeField: string,
    fieldType: FieldType,
    cutoffTimestamp: number,
    cutoffDate: Date
  ): Promise<{ ranges: QuarterRange[]; dataRangeStart?: number; dataRangeEnd?: number }> {
    const rangeResult = (await sequelize.query(
      `SELECT MIN("${timeField}") as minValue, MAX("${timeField}") as maxValue
       FROM "${tableName}"
       WHERE "${timeField}" < :cutoff`,
      {
        replacements: {
          cutoff: fieldType === 'timestamp' ? cutoffTimestamp : this.formatDateForSqliteUtc(cutoffDate),
        },
        type: QueryTypes.SELECT,
      }
    )) as Array<{ minValue: number | string | null; maxValue: number | string | null }>;

    const minValue = rangeResult[0]?.minValue ?? null;
    const maxValue = rangeResult[0]?.maxValue ?? null;

    if (minValue === null || maxValue === null) {
      return { ranges: [] };
    }

    let minDate: Date;
    let maxDate: Date;
    let dataRangeStart: number;
    let dataRangeEnd: number;

    if (fieldType === 'timestamp') {
      const minNumber = Number(minValue);
      const maxNumber = Number(maxValue);
      if (!Number.isFinite(minNumber) || !Number.isFinite(maxNumber)) {
        return { ranges: [] };
      }
      minDate = new Date(minNumber * 1000);
      maxDate = new Date(maxNumber * 1000);
      dataRangeStart = minNumber;
      dataRangeEnd = maxNumber;
    } else {
      minDate = this.parseSqliteUtc(String(minValue));
      maxDate = this.parseSqliteUtc(String(maxValue));
      dataRangeStart = Math.floor(minDate.getTime() / 1000);
      dataRangeEnd = Math.floor(maxDate.getTime() / 1000);
    }

    const ranges = this.buildQuarterRanges(minDate, maxDate, cutoffDate);

    return {
      ranges,
      dataRangeStart,
      dataRangeEnd,
    };
  }

  private buildQuarterRanges(minDate: Date, maxDate: Date, cutoffDate: Date): QuarterRange[] {
    const ranges: QuarterRange[] = [];
    const cutoffMs = cutoffDate.getTime();

    let cursor = this.getQuarterStartUtc(minDate);
    while (cursor.getTime() <= maxDate.getTime() && cursor.getTime() < cutoffMs) {
      const next = this.addQuarterUtc(cursor);
      const endDate = next.getTime() > cutoffMs ? new Date(cutoffMs) : next;

      if (endDate.getTime() > cursor.getTime()) {
        ranges.push({
          key: this.getQuarterKeyFromUtcDate(cursor),
          start: new Date(cursor.getTime()),
          end: endDate,
        });
      }

      cursor = next;
    }

    return ranges;
  }

  private getQuarterStartUtc(date: Date): Date {
    const current = dayjs.utc(date);
    const quarterStartMonth = Math.floor(current.month() / 3) * 3;
    return current.month(quarterStartMonth).date(1).hour(0).minute(0).second(0).millisecond(0).toDate();
  }

  private addQuarterUtc(date: Date): Date {
    return dayjs.utc(date).add(3, 'month').startOf('month').toDate();
  }

  private getQuarterKeyFromUtcDate(date: Date): string {
    const current = dayjs.utc(date);
    const year = current.year();
    const quarter = Math.floor(current.month() / 3) + 1;
    return `${year}_Q${quarter}`;
  }

  private formatDateForSqliteUtc(date: Date): string {
    return dayjs.utc(date).format('YYYY-MM-DD HH:mm:ss.SSS Z');
  }

  private parseSqliteUtc(value: string): Date {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T').replace(' +', '+');
    const parsed = dayjs.utc(normalized);
    if (!parsed.isValid()) {
      throw new Error(`Invalid sqlite datetime: ${value}`);
    }
    return parsed.toDate();
  }

  /**
   * Compute cutoff date (Date object)
   */
  private calculateCutoffDate(retentionMonths: number): Date {
    const months = Number.isFinite(retentionMonths) && retentionMonths >= 0 ? retentionMonths : 6;
    return dayjs().subtract(months, 'month').toDate();
  }

  /**
   * Delay helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async ensureArchiveTables(archivePath: string): Promise<void> {
    for (const config of Object.values(DataArchiveService.TABLE_CONFIGS)) {
      // eslint-disable-next-line no-await-in-loop
      await ArchiveDatabase.ensureArchiveDbAndTable(archivePath, config.tableName, sequelize);
    }
  }
}

export const dataArchiveService = new DataArchiveService();
