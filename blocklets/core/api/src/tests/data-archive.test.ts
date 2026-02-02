import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { ArchiveDatabase } from '@api/libs/archive-database';
import { DataArchiveService } from '@api/libs/data-archive';
import dayjs from '@api/libs/dayjs';
import { sequelize } from '@api/store/sequelize';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { QueryTypes, Sequelize } from 'sequelize';

const formatSqliteUtc = (date: Date): string => {
  return dayjs.utc(date).format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

describe('DataArchiveService', () => {
  let service: DataArchiveService;

  beforeEach(() => {
    service = new DataArchiveService();
  });

  test('calculateCutoffDate should subtract retention months', () => {
    const cutoff = (service as any).calculateCutoffDate(3);
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 3);

    // Compare year and month only (allow some margin for day)
    expect(cutoff.getFullYear()).toBe(expected.getFullYear());
    expect(cutoff.getMonth()).toBe(expected.getMonth());
  });

  test('buildQuarterRanges should align to quarters and respect cutoff', () => {
    const minDate = new Date('2025-01-15T00:00:00Z');
    const maxDate = new Date('2025-10-10T00:00:00Z');
    const cutoffDate = new Date('2025-08-15T00:00:00Z');

    const ranges = (service as any).buildQuarterRanges(minDate, maxDate, cutoffDate) as Array<{
      key: string;
      start: Date;
      end: Date;
    }>;

    expect(ranges.map((range) => range.key)).toEqual(['2025_Q1', '2025_Q2', '2025_Q3']);
    expect(ranges[0]?.start.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(ranges[0]?.end.toISOString()).toBe('2025-04-01T00:00:00.000Z');
    expect(ranges[2]?.end.toISOString()).toBe('2025-08-15T00:00:00.000Z');
  });
});

describe('DataArchiveService integration', () => {
  let service: DataArchiveService;
  let tempDir: string;
  let testSequelize: Sequelize;
  let originalQuery: typeof sequelize.query;
  let originalTransaction: typeof sequelize.transaction;
  let originalGetConnection: typeof sequelize.connectionManager.getConnection;
  let originalReleaseConnection: typeof sequelize.connectionManager.releaseConnection;
  let archiveDirSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(async () => {
    service = new DataArchiveService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-test-'));

    testSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: path.join(tempDir, 'main.db'),
      logging: false,
    });

    await testSequelize.query('pragma journal_mode = WAL;');
    await testSequelize.query('pragma synchronous = normal;');

    originalQuery = sequelize.query.bind(sequelize);
    originalTransaction = sequelize.transaction.bind(sequelize);
    originalGetConnection = sequelize.connectionManager.getConnection.bind(sequelize.connectionManager);
    originalReleaseConnection = sequelize.connectionManager.releaseConnection.bind(sequelize.connectionManager);

    (sequelize as any).query = testSequelize.query.bind(testSequelize);
    (sequelize as any).transaction = testSequelize.transaction.bind(testSequelize);
    (sequelize.connectionManager as any).getConnection = testSequelize.connectionManager.getConnection.bind(
      testSequelize.connectionManager
    );
    (sequelize.connectionManager as any).releaseConnection = testSequelize.connectionManager.releaseConnection.bind(
      testSequelize.connectionManager
    );

    archiveDirSpy = spyOn(ArchiveDatabase, 'getArchiveDir').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    if (archiveDirSpy) {
      archiveDirSpy.mockRestore();
      archiveDirSpy = null;
    }

    (sequelize as any).query = originalQuery;
    (sequelize as any).transaction = originalTransaction;
    (sequelize.connectionManager as any).getConnection = originalGetConnection;
    (sequelize.connectionManager as any).releaseConnection = originalReleaseConnection;

    await testSequelize.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('archives data across databases with ATTACH', async () => {
    await testSequelize.query(
      `CREATE TABLE "ModelCalls" (
         id TEXT PRIMARY KEY,
         callTime INTEGER NOT NULL
       )`
    );
    await testSequelize.query(
      `CREATE TABLE "ModelCallStats" (
         id TEXT PRIMARY KEY,
         timestamp INTEGER NOT NULL
       )`
    );
    await testSequelize.query(
      `CREATE TABLE "Usages" (
         id TEXT PRIMARY KEY,
         createdAt TEXT NOT NULL
       )`
    );

    const nowSec = Math.floor(Date.now() / 1000);
    const oldSec = nowSec - 200 * 24 * 60 * 60;
    const recentSec = nowSec - 10 * 24 * 60 * 60;

    await testSequelize.query('INSERT INTO "ModelCalls" (id, callTime) VALUES (:id, :ts)', {
      replacements: { id: 'old-call', ts: oldSec },
    });
    await testSequelize.query('INSERT INTO "ModelCalls" (id, callTime) VALUES (:id, :ts)', {
      replacements: { id: 'new-call', ts: recentSec },
    });

    const oldDate = formatSqliteUtc(new Date(oldSec * 1000));
    const recentDate = formatSqliteUtc(new Date(recentSec * 1000));

    await testSequelize.query('INSERT INTO "Usages" (id, createdAt) VALUES (:id, :createdAt)', {
      replacements: { id: 'old-usage', createdAt: oldDate },
    });
    await testSequelize.query('INSERT INTO "Usages" (id, createdAt) VALUES (:id, :createdAt)', {
      replacements: { id: 'new-usage', createdAt: recentDate },
    });

    const modelResult = await service.archiveModelCalls();
    const usageResult = await service.archiveUsage();

    expect(modelResult.success).toBe(true);
    expect(usageResult.success).toBe(true);

    const modelCount = (await testSequelize.query('SELECT COUNT(*) as count FROM "ModelCalls"', {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number | string }>;

    expect(Number(modelCount[0]?.count ?? 0)).toBe(1);

    const usageCount = (await testSequelize.query('SELECT COUNT(*) as count FROM "Usages"', {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number | string }>;

    expect(Number(usageCount[0]?.count ?? 0)).toBe(1);

    const oldDateObj = new Date(oldSec * 1000);
    const quarter = Math.floor(oldDateObj.getUTCMonth() / 3) + 1;
    const quarterKey = `${oldDateObj.getUTCFullYear()}_Q${quarter}`;
    const archivePath = path.join(tempDir, `archive_${quarterKey}.db`);

    await fs.access(archivePath);

    const archiveSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: archivePath,
      logging: false,
    });

    const archiveModelCount = (await archiveSequelize.query('SELECT COUNT(*) as count FROM "ModelCalls"', {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number | string }>;

    const archiveUsageCount = (await archiveSequelize.query('SELECT COUNT(*) as count FROM "Usages"', {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number | string }>;

    const archiveStatsCount = (await archiveSequelize.query('SELECT COUNT(*) as count FROM "ModelCallStats"', {
      type: QueryTypes.SELECT,
    })) as Array<{ count: number | string }>;

    expect(Number(archiveModelCount[0]?.count ?? 0)).toBe(1);
    expect(Number(archiveUsageCount[0]?.count ?? 0)).toBe(1);
    expect(Number(archiveStatsCount[0]?.count ?? 0)).toBe(0);

    await archiveSequelize.close();
  });
});

describe('ArchiveDatabase', () => {
  test('ensureArchiveDbAndTable should add missing columns for existing table', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-schema-'));
    const mainSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: path.join(tempDir, 'main.db'),
      logging: false,
    });

    const archivePath = path.join(tempDir, 'archive_2025_Q1.db');
    const archiveSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: archivePath,
      logging: false,
    });

    try {
      await mainSequelize.query(
        `CREATE TABLE "ModelCalls" (
           id TEXT PRIMARY KEY,
           callTime INTEGER NOT NULL,
           extra TEXT NOT NULL DEFAULT ''
         )`
      );

      await archiveSequelize.query(
        `CREATE TABLE "ModelCalls" (
           id TEXT PRIMARY KEY,
           callTime INTEGER NOT NULL
         )`
      );
      await archiveSequelize.close();

      await ArchiveDatabase.ensureArchiveDbAndTable(archivePath, 'ModelCalls', mainSequelize);

      const verifySequelize = new Sequelize({
        dialect: 'sqlite',
        storage: archivePath,
        logging: false,
      });

      const columns = (await verifySequelize.query('PRAGMA table_info("ModelCalls")', {
        type: QueryTypes.SELECT,
      })) as Array<{ name: string }>;

      expect(columns.map((col) => col.name)).toContain('extra');

      await verifySequelize.close();
    } finally {
      await mainSequelize.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('cleanupOldArchives should remove older files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-clean-'));
    const dirSpy = spyOn(ArchiveDatabase, 'getArchiveDir').mockReturnValue(tempDir);

    const files = [
      'archive_2023_Q1.db',
      'archive_2023_Q2.db',
      'archive_2023_Q3.db',
      'archive_2023_Q4.db',
      'archive_2024_Q1.db',
      'archive_2024_Q2.db',
      'archive_2024_Q3.db',
      'archive_2024_Q4.db',
    ];

    await fs.mkdir(tempDir, { recursive: true });
    await Promise.all(files.map((file) => fs.writeFile(path.join(tempDir, file), '')));

    const deleted = await ArchiveDatabase.cleanupOldArchives();

    expect(deleted.length).toBe(files.length - 6);

    const remaining = (await fs.readdir(tempDir)).filter((file) => /^archive_\d{4}_Q[1-4]\.db$/.test(file));
    expect(remaining.length).toBe(6);

    dirSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
