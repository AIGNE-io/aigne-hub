import fs from 'fs/promises';
import path from 'path';

import { QueryTypes, Sequelize } from 'sequelize';

import { ARCHIVE_RETENTION_QUARTERS, Config } from './env';
import logger from './logger';

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

/**
 * Archive database utilities
 * Quarterly sharding: one SQLite file per quarter (archive_2025_Q1.db, archive_2025_Q2.db, ...)
 */
export class ArchiveDatabase {
  /**
   * Get archive database directory
   */
  static getArchiveDir(): string {
    const dataDir = Config.dataDir || process.cwd();
    return path.join(dataDir, 'archives');
  }

  /**
   * Get archive DB filename
   */
  static getDbName(quarterKey: string): string {
    return `archive_${quarterKey}.db`;
  }

  /**
   * Get archive DB path
   */
  static getArchivePath(quarterKey: string): string {
    return path.join(this.getArchiveDir(), this.getDbName(quarterKey));
  }

  /**
   * Get quarter key: "2025_Q1", "2025_Q2", etc.
   */
  static getQuarterKey(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
    return `${year}_Q${quarter}`;
  }

  /**
   * Clean up archive DBs beyond retention
   */
  static async cleanupOldArchives(): Promise<string[]> {
    const retentionQuarters =
      Number.isFinite(ARCHIVE_RETENTION_QUARTERS) && ARCHIVE_RETENTION_QUARTERS >= 0 ? ARCHIVE_RETENTION_QUARTERS : 6;

    if (retentionQuarters === 0) {
      logger.info('Archive cleanup disabled (ARCHIVE_RETENTION_QUARTERS=0)');
      return [];
    }

    const archiveDir = this.getArchiveDir();

    try {
      await fs.access(archiveDir);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const files = await fs.readdir(archiveDir);
    const archiveFiles = files
      .filter((file) => /^archive_\d{4}_Q[1-4]\.db$/.test(file))
      .sort()
      .reverse();

    const toDelete = archiveFiles.slice(retentionQuarters);
    const deleted: string[] = [];

    for (const file of toDelete) {
      const filePath = path.join(archiveDir, file);
      // eslint-disable-next-line no-await-in-loop
      await fs.unlink(filePath);
      deleted.push(file);
      logger.info('Old archive deleted', { file });
    }

    return deleted;
  }

  /**
   * Create a table in a standalone archive DB (if not exists)
   */
  static async ensureArchiveDbAndTable(
    archivePath: string,
    tableName: string,
    mainSequelize: Sequelize
  ): Promise<void> {
    if (!['ModelCalls', 'ModelCallStats', 'Usages'].includes(tableName)) {
      throw new Error(`Invalid archive table name: ${tableName}`);
    }

    await fs.mkdir(path.dirname(archivePath), { recursive: true });

    const archiveSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: archivePath,
      logging: false,
    });

    try {
      const tables = (await archiveSequelize.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=:tableName",
        {
          replacements: { tableName },
          type: QueryTypes.SELECT,
        }
      )) as Array<{ name: string }>;

      if (tables.length > 0) {
        await this.syncArchiveTableColumns(mainSequelize, archiveSequelize, tableName);
        return;
      }

      const columns = (await mainSequelize.query(`PRAGMA main.table_info("${tableName}")`, {
        type: QueryTypes.SELECT,
      })) as ColumnInfo[];

      const columnDefs = columns
        .map((col) => {
          let def = `"${col.name}" ${col.type}`;
          if (col.pk) def += ' PRIMARY KEY';
          if (col.notnull && !col.pk) def += ' NOT NULL';
          if (col.dflt_value !== null && !this.isDynamicDefault(col.dflt_value)) {
            def += ` DEFAULT ${col.dflt_value}`;
          }
          return def;
        })
        .join(', ');

      await archiveSequelize.query(`CREATE TABLE "${tableName}" (${columnDefs})`);

      logger.info('Archive table created', {
        table: tableName,
        database: path.basename(archivePath),
      });
    } finally {
      await archiveSequelize.close();
    }
  }

  /**
   * Check whether a default value is dynamic (e.g. CURRENT_TIMESTAMP)
   * Dynamic defaults should not be copied because archived rows already have concrete values
   */
  private static isDynamicDefault(dfltValue: string): boolean {
    const dynamicPatterns = [
      /current_timestamp/i,
      /current_date/i,
      /current_time/i,
      /datetime\s*\(/i,
      /date\s*\(/i,
      /time\s*\(/i,
      /strftime\s*\(/i,
    ];
    return dynamicPatterns.some((pattern) => pattern.test(dfltValue));
  }

  /**
   * Align archive table columns: only add columns introduced in the main table
   */
  private static async syncArchiveTableColumns(
    mainSequelize: Sequelize,
    archiveSequelize: Sequelize,
    tableName: string
  ): Promise<void> {
    const mainColumns = (await mainSequelize.query(`PRAGMA main.table_info("${tableName}")`, {
      type: QueryTypes.SELECT,
    })) as ColumnInfo[];

    const archiveColumns = (await archiveSequelize.query(`PRAGMA table_info("${tableName}")`, {
      type: QueryTypes.SELECT,
    })) as ColumnInfo[];

    const archiveColumnNames = new Set(archiveColumns.map((col) => col.name));
    const missingColumns = mainColumns.filter((col) => !archiveColumnNames.has(col.name));

    for (const col of missingColumns) {
      let def = `"${col.name}" ${col.type}`;
      const hasDefault = col.dflt_value !== null;
      const relaxNotNull = col.notnull && !hasDefault;
      if (col.notnull && !relaxNotNull) def += ' NOT NULL';
      if (hasDefault) {
        def += ` DEFAULT ${col.dflt_value}`;
      }

      // eslint-disable-next-line no-await-in-loop
      await archiveSequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
      if (relaxNotNull) {
        logger.warn('Archive column NOT NULL relaxed due to missing default', {
          table: tableName,
          column: col.name,
        });
      }
      logger.info('Archive table column added', { table: tableName, column: col.name });
    }
  }
}
