import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import dayjs from '@api/libs/dayjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Sequelize } from 'sequelize';

describe('ModelCallStats monthly aggregation', () => {
  let tempDir: string;
  let testSequelize: Sequelize;
  let originalQuery: any;
  let originalTransaction: any;
  let originalGetConnection: any;
  let originalReleaseConnection: any;
  let sequelize: any;
  let ModelCallStat: any;
  let createMonthlyModelCallStats: any;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-call-stats-'));
    await fs.mkdir(path.join(tempDir, 'queue'), { recursive: true });

    const sequelizeModule = await import('@api/store/sequelize');
    sequelize = sequelizeModule.sequelize;
    ({ default: ModelCallStat } = await import('@api/store/models/model-call-stat'));
    ({ createMonthlyModelCallStats } = await import('@api/crons/model-call-stats'));
  });

  beforeEach(async () => {
    const dbPath = path.join(tempDir, `stats-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
    testSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
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

    await testSequelize.query(
      `CREATE TABLE "ModelCallStats" (
         id TEXT PRIMARY KEY,
         "userDid" TEXT,
         "appDid" TEXT,
         "timestamp" INTEGER NOT NULL,
         "timeType" TEXT NOT NULL,
         "stats" TEXT NOT NULL,
         "createdAt" DATETIME NOT NULL,
         "updatedAt" DATETIME NOT NULL
       )`
    );
  });

  afterEach(async () => {
    (sequelize as any).query = originalQuery;
    (sequelize as any).transaction = originalTransaction;
    (sequelize.connectionManager as any).getConnection = originalGetConnection;
    (sequelize.connectionManager as any).releaseConnection = originalReleaseConnection;

    await testSequelize.close();
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should aggregate hourly stats into monthly totals with byType', async () => {
    const hour1 = dayjs.utc('2025-01-10T01:00:00Z').unix();
    const hour2 = dayjs.utc('2025-01-10T02:00:00Z').unix();
    const hour3 = dayjs.utc('2025-01-15T03:00:00Z').unix();
    const hourOutside = dayjs.utc('2025-02-01T00:00:00Z').unix();
    const now = new Date();

    await ModelCallStat.bulkCreate([
      {
        id: `u1-a1-hour-${hour1}`,
        userDid: 'u1',
        appDid: 'a1',
        timestamp: hour1,
        timeType: 'hour',
        stats: {
          totalUsage: 100,
          totalCredits: 1.0,
          totalCalls: 2,
          successCalls: 2,
          totalDuration: 10,
          byType: {
            chatCompletion: { totalUsage: 100, totalCredits: 1.0, totalCalls: 2, successCalls: 2 },
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `u1-a1-hour-${hour2}`,
        userDid: 'u1',
        appDid: 'a1',
        timestamp: hour2,
        timeType: 'hour',
        stats: {
          totalUsage: 50,
          totalCredits: 0.5,
          totalCalls: 1,
          successCalls: 1,
          totalDuration: 5,
          byType: {
            chatCompletion: { totalUsage: 50, totalCredits: 0.5, totalCalls: 1, successCalls: 1 },
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `u1-a1-hour-${hour3}`,
        userDid: 'u1',
        appDid: 'a1',
        timestamp: hour3,
        timeType: 'hour',
        stats: {
          totalUsage: 30,
          totalCredits: 0.3,
          totalCalls: 1,
          successCalls: 1,
          totalDuration: 3,
          byType: {
            imageGeneration: { totalUsage: 30, totalCredits: 0.3, totalCalls: 1, successCalls: 1 },
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `u1-a1-hour-${hourOutside}`,
        userDid: 'u1',
        appDid: 'a1',
        timestamp: hourOutside,
        timeType: 'hour',
        stats: {
          totalUsage: 999,
          totalCredits: 9.99,
          totalCalls: 9,
          successCalls: 9,
          totalDuration: 9,
          byType: {
            embedding: { totalUsage: 999, totalCredits: 9.99, totalCalls: 9, successCalls: 9 },
          },
        },
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const startTime = dayjs.utc('2025-01-05T00:00:00Z').unix();
    const recordsCount = await createMonthlyModelCallStats(startTime);

    expect(recordsCount).toBe(1);

    const monthStart = dayjs.utc('2025-01-01T00:00:00Z').unix();
    const monthly = (await ModelCallStat.findOne({
      where: { timeType: 'month', userDid: 'u1', appDid: 'a1', timestamp: monthStart },
      raw: true,
    })) as any;

    expect(monthly).toBeTruthy();

    const statsRaw = monthly.stats as any;
    const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;

    expect(stats.totalUsage).toBe(180);
    expect(stats.totalCredits).toBeCloseTo(1.8, 6);
    expect(stats.totalCalls).toBe(4);
    expect(stats.successCalls).toBe(4);
    expect(stats.totalDuration).toBe(18);

    expect(stats.byType?.chatCompletion?.totalUsage).toBe(150);
    expect(stats.byType?.chatCompletion?.totalCredits).toBeCloseTo(1.5, 6);
    expect(stats.byType?.chatCompletion?.totalCalls).toBe(3);
    expect(stats.byType?.chatCompletion?.successCalls).toBe(3);

    expect(stats.byType?.imageGeneration?.totalUsage).toBe(30);
    expect(stats.byType?.imageGeneration?.totalCredits).toBeCloseTo(0.3, 6);
    expect(stats.byType?.imageGeneration?.totalCalls).toBe(1);
    expect(stats.byType?.imageGeneration?.successCalls).toBe(1);

    expect(stats.byType?.embedding).toBeUndefined();
  });
});
