import { QueryTypes } from 'sequelize';

import { RETENTION_MODEL_CALL_MONTHS, RETENTION_MODEL_CALL_STATS_MONTHS } from '../libs/env';
import logger from '../libs/logger';
import { sequelize } from '../store/sequelize';

export interface ArchiveResult {
  success: boolean;
  archivedCount: number;
  deletedCount: number;
  errorMessage?: string;
  duration: number;
}

type YearRow = { year: string };

export class DataArchiveService {
  private static readonly BATCH_SIZE = 1000;

  async archiveModelCalls(): Promise<ArchiveResult> {
    const startTime = Date.now();
    const cutoffTimestamp = this.calculateCutoffTimestamp(RETENTION_MODEL_CALL_MONTHS);

    try {
      let totalArchived = 0;

      const yearsResult = (await sequelize.query(
        `SELECT DISTINCT strftime('%Y', datetime(callTime, 'unixepoch')) as year
         FROM ModelCalls
         WHERE callTime < :cutoff`,
        {
          replacements: { cutoff: cutoffTimestamp },
          type: QueryTypes.SELECT,
        }
      )) as YearRow[];

      for (const { year } of yearsResult) {
        // eslint-disable-next-line no-await-in-loop
        const archiveTable = await this.ensureArchiveTable(
          Number.parseInt(year, 10),
          'ModelCalls',
          'model_calls_archive'
        );

        let batchCount = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const count = await this.migrateBatch('ModelCalls', archiveTable, 'callTime', cutoffTimestamp, year);
          if (count === 0) break;

          totalArchived += count;
          batchCount += 1;

          logger.info('Batch archived', {
            table: 'ModelCalls',
            year,
            batchNumber: batchCount,
            recordsArchived: count,
          });
        }
      }

      return {
        success: true,
        archivedCount: totalArchived,
        deletedCount: totalArchived,
        duration: (Date.now() - startTime) / 1000,
      };
    } catch (error) {
      logger.error('Failed to archive ModelCalls', { error });
      return {
        success: false,
        archivedCount: 0,
        deletedCount: 0,
        errorMessage: (error as Error).message,
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  async archiveModelCallStats(): Promise<ArchiveResult> {
    const startTime = Date.now();
    const cutoffTimestamp = this.calculateCutoffTimestamp(RETENTION_MODEL_CALL_STATS_MONTHS);

    try {
      let totalArchived = 0;

      const yearsResult = (await sequelize.query(
        `SELECT DISTINCT strftime('%Y', datetime(timestamp, 'unixepoch')) as year
         FROM ModelCallStats
         WHERE timestamp < :cutoff`,
        {
          replacements: { cutoff: cutoffTimestamp },
          type: QueryTypes.SELECT,
        }
      )) as YearRow[];

      for (const { year } of yearsResult) {
        // eslint-disable-next-line no-await-in-loop
        const archiveTable = await this.ensureArchiveTable(
          Number.parseInt(year, 10),
          'ModelCallStats',
          'model_call_stats_archive'
        );

        let batchCount = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const count = await this.migrateBatch('ModelCallStats', archiveTable, 'timestamp', cutoffTimestamp, year);
          if (count === 0) break;

          totalArchived += count;
          batchCount += 1;

          logger.info('Batch archived', {
            table: 'ModelCallStats',
            year,
            batchNumber: batchCount,
            recordsArchived: count,
          });
        }
      }

      return {
        success: true,
        archivedCount: totalArchived,
        deletedCount: totalArchived,
        duration: (Date.now() - startTime) / 1000,
      };
    } catch (error) {
      logger.error('Failed to archive ModelCallStats', { error });
      return {
        success: false,
        archivedCount: 0,
        deletedCount: 0,
        errorMessage: (error as Error).message,
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  private calculateCutoffTimestamp(retentionMonths: number): number {
    const now = Math.floor(Date.now() / 1000);
    const months = Number.isFinite(retentionMonths) && retentionMonths >= 0 ? retentionMonths : 6;
    const secondsPerMonth = 30 * 24 * 60 * 60;
    return now - months * secondsPerMonth;
  }

  private async migrateBatch(
    sourceTable: string,
    targetTable: string,
    timestampField: string,
    cutoffTimestamp: number,
    year: string
  ): Promise<number> {
    const transaction = await sequelize.transaction();
    try {
      const records = (await sequelize.query(
        `SELECT * FROM "${sourceTable}"
         WHERE "${timestampField}" < :cutoff
           AND strftime('%Y', datetime("${timestampField}", 'unixepoch')) = :year
         LIMIT :limit`,
        {
          replacements: {
            cutoff: cutoffTimestamp,
            year,
            limit: DataArchiveService.BATCH_SIZE,
          },
          type: QueryTypes.SELECT,
          transaction,
        }
      )) as Array<Record<string, unknown>>;

      if (records.length === 0) {
        await transaction.rollback();
        return 0;
      }

      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.bulkInsert(targetTable, records, { transaction });

      const ids = records.map((record) => record.id);
      await sequelize.query(`DELETE FROM "${sourceTable}" WHERE id IN (:ids)`, {
        replacements: { ids },
        transaction,
      });

      await transaction.commit();
      return records.length;
    } catch (error) {
      await transaction.rollback();
      logger.error('Batch migration failed', { error, sourceTable, targetTable });
      throw error;
    }
  }

  private async ensureArchiveTable(year: number, sourceTable: string, archiveTablePrefix: string): Promise<string> {
    const archiveTableName = `${archiveTablePrefix}_${year}`;

    const tables = (await sequelize.query(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name=:tableName`,
      {
        replacements: { tableName: archiveTableName },
        type: QueryTypes.SELECT,
      }
    )) as Array<{ name: string }>;

    if (tables.length > 0) {
      return archiveTableName;
    }

    const created = await this.createArchiveTableFromModel(sourceTable, archiveTableName);
    if (!created) {
      throw new Error(`Unsupported archive table source: ${sourceTable}`);
    }

    logger.info('Archive table created', { archiveTableName, year });

    return archiveTableName;
  }

  private async createArchiveTableFromModel(sourceTable: string, archiveTableName: string): Promise<boolean> {
    const queryInterface = sequelize.getQueryInterface();

    if (sourceTable === 'ModelCalls') {
      const { default: ModelCalls } = await import('../store/models/model-call');
      await queryInterface.createTable(archiveTableName, ModelCalls.GENESIS_ATTRIBUTES);
      await this.cloneIndexesFromSource(sourceTable, archiveTableName);
      return true;
    }

    if (sourceTable === 'ModelCallStats') {
      const { default: ModelCallStat } = await import('../store/models/model-call-stat');
      await queryInterface.createTable(archiveTableName, ModelCallStat.GENESIS_ATTRIBUTES);
      await this.cloneIndexesFromSource(sourceTable, archiveTableName);
      return true;
    }

    return false;
  }

  private async cloneIndexesFromSource(sourceTable: string, archiveTableName: string): Promise<void> {
    const indexList = (await sequelize.query(`PRAGMA index_list("${sourceTable}")`, {
      type: QueryTypes.SELECT,
    })) as Array<{ name: string; unique: number }>;

    const queryInterface = sequelize.getQueryInterface();

    for (const index of indexList) {
      const indexName = index.name;
      if (indexName.startsWith('sqlite_autoindex')) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const indexInfo = (await sequelize.query(`PRAGMA index_info("${indexName}")`, {
        type: QueryTypes.SELECT,
      })) as Array<{ name: string }>;

      const columns = indexInfo.map((row) => row.name).filter(Boolean);
      if (columns.length === 0) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.addIndex(archiveTableName, columns, {
        name: `${indexName}__${archiveTableName}`,
        unique: index.unique === 1,
      });
    }
  }
}

export const dataArchiveService = new DataArchiveService();
