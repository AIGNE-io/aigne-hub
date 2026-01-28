import { DataArchiveService } from '@api/services/data-archive';
import ModelCall from '@api/store/models/model-call';
import { sequelize } from '@api/store/sequelize';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { QueryTypes } from 'sequelize';

describe('DataArchiveService', () => {
  let service: DataArchiveService;

  beforeEach(() => {
    service = new DataArchiveService();
  });

  test('calculateCutoffTimestamp should subtract retention months', () => {
    const nowMs = 1700000000000;
    const nowSpy = spyOn(Date, 'now').mockReturnValue(nowMs);

    const cutoff = (service as any).calculateCutoffTimestamp(6);
    const expected = Math.floor(nowMs / 1000) - 6 * 30 * 24 * 60 * 60;

    expect(cutoff).toBe(expected);

    nowSpy.mockRestore();
  });

  test('ensureArchiveTable should return existing table name', async () => {
    const querySpy = spyOn(sequelize, 'query').mockResolvedValue([{ name: 'model_calls_archive_2024' }] as any);

    const result = await (service as any).ensureArchiveTable(2024, 'ModelCalls', 'model_calls_archive');

    expect(result).toBe('model_calls_archive_2024');
    expect(querySpy).toHaveBeenCalledTimes(1);

    querySpy.mockRestore();
  });

  test('ensureArchiveTable should create table when missing', async () => {
    const querySpy = spyOn(sequelize, 'query').mockImplementation(async (sql: string) => {
      if (sql.includes('sqlite_master') && sql.includes("type='table'") && sql.includes('name=:tableName')) {
        return [] as any;
      }
      if (sql.startsWith('PRAGMA index_list')) {
        return [{ name: 'idx_model_calls_user_time', unique: 0 }] as any;
      }
      if (sql.startsWith('PRAGMA index_info')) {
        return [{ name: 'userDid' }, { name: 'callTime' }] as any;
      }
      return [] as any;
    });

    const queryInterface = {
      createTable: async () => undefined,
      addIndex: async () => undefined,
    };
    const createTableSpy = spyOn(queryInterface, 'createTable');
    const addIndexSpy = spyOn(queryInterface, 'addIndex');
    const getQueryInterfaceSpy = spyOn(sequelize, 'getQueryInterface').mockReturnValue(queryInterface as any);

    const result = await (service as any).ensureArchiveTable(2025, 'ModelCalls', 'model_calls_archive');

    expect(result).toBe('model_calls_archive_2025');
    expect(createTableSpy).toHaveBeenCalledTimes(1);
    expect(createTableSpy).toHaveBeenCalledWith('model_calls_archive_2025', ModelCall.GENESIS_ATTRIBUTES);
    expect(addIndexSpy).toHaveBeenCalledTimes(1);
    const addIndexArgs: any = addIndexSpy.mock.calls[0] || [];
    expect(addIndexArgs[0]).toBe('model_calls_archive_2025');
    expect(addIndexArgs[1]).toEqual(['userDid', 'callTime']);
    expect(addIndexArgs[2]?.name).toBe('idx_model_calls_user_time__model_calls_archive_2025');

    querySpy.mockRestore();
    getQueryInterfaceSpy.mockRestore();
    createTableSpy.mockRestore();
    addIndexSpy.mockRestore();
  });

  test('migrateBatch should commit when records exist', async () => {
    const records = [{ id: '1' }, { id: '2' }];
    const querySpy = spyOn(sequelize, 'query').mockImplementation(async (_sql: string, options?: any) => {
      if (options?.type === QueryTypes.SELECT) {
        return records as any;
      }
      return [] as any;
    });

    const bulkInsert = async () => undefined;
    const bulkInsertSpy = spyOn({ bulkInsert }, 'bulkInsert');
    const getQueryInterfaceSpy = spyOn(sequelize, 'getQueryInterface').mockReturnValue({
      bulkInsert: bulkInsertSpy,
    } as any);

    const transaction = { commit: async () => undefined, rollback: async () => undefined };
    const commitSpy = spyOn(transaction, 'commit');
    const rollbackSpy = spyOn(transaction, 'rollback');
    const transactionSpy = spyOn(sequelize, 'transaction').mockResolvedValue(transaction as any);

    const result = await (service as any).migrateBatch('ModelCalls', 'model_calls_archive_2024', 'callTime', 0, '2024');

    expect(result).toBe(2);
    expect(bulkInsertSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).toHaveBeenCalledTimes(0);

    querySpy.mockRestore();
    getQueryInterfaceSpy.mockRestore();
    transactionSpy.mockRestore();
    bulkInsertSpy.mockRestore();
    commitSpy.mockRestore();
    rollbackSpy.mockRestore();
  });

  test('migrateBatch should rollback when no records', async () => {
    const querySpy = spyOn(sequelize, 'query').mockImplementation(async (_sql: string, options?: any) => {
      if (options?.type === QueryTypes.SELECT) {
        return [] as any;
      }
      return [] as any;
    });

    const bulkInsert = async () => undefined;
    const bulkInsertSpy = spyOn({ bulkInsert }, 'bulkInsert');
    const getQueryInterfaceSpy = spyOn(sequelize, 'getQueryInterface').mockReturnValue({
      bulkInsert: bulkInsertSpy,
    } as any);

    const transaction = { commit: async () => undefined, rollback: async () => undefined };
    const commitSpy = spyOn(transaction, 'commit');
    const rollbackSpy = spyOn(transaction, 'rollback');
    const transactionSpy = spyOn(sequelize, 'transaction').mockResolvedValue(transaction as any);

    const result = await (service as any).migrateBatch('ModelCalls', 'model_calls_archive_2024', 'callTime', 0, '2024');

    expect(result).toBe(0);
    expect(bulkInsertSpy).toHaveBeenCalledTimes(0);
    expect(commitSpy).toHaveBeenCalledTimes(0);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);

    querySpy.mockRestore();
    getQueryInterfaceSpy.mockRestore();
    transactionSpy.mockRestore();
    bulkInsertSpy.mockRestore();
    commitSpy.mockRestore();
    rollbackSpy.mockRestore();
  });

  test('archiveModelCalls should aggregate batches by year', async () => {
    const years = [{ year: '2023' }, { year: '2024' }];
    const querySpy = spyOn(sequelize, 'query').mockResolvedValue(years as any);

    const ensureSpy = spyOn(service as any, 'ensureArchiveTable').mockImplementation(
      async (year: number, _sourceTable: string, prefix: string) => `${prefix}_${year}`
    );

    const counts = [2, 0, 1, 0];
    const migrateSpy = spyOn(service as any, 'migrateBatch').mockImplementation(async () => counts.shift() ?? 0);

    const result = await service.archiveModelCalls();

    expect(result.success).toBe(true);
    expect(result.archivedCount).toBe(3);
    expect(result.deletedCount).toBe(3);
    expect(ensureSpy).toHaveBeenCalledTimes(2);
    expect(migrateSpy).toHaveBeenCalledTimes(4);

    querySpy.mockRestore();
    ensureSpy.mockRestore();
    migrateSpy.mockRestore();
  });
});
