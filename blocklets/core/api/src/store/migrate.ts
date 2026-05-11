/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { join } from 'path';

import { Config, isDevelopment } from '@api/libs/env';
import { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

import logger from '../libs/logger';
import { sequelize } from './sequelize';

const umzug = new Umzug({
  migrations: {
    glob: ['**/migrations/*.{ts,js}', { cwd: isDevelopment ? __dirname : join(Config.appDir, 'api/dist/store') }],
    resolve: ({ name, path, context }) => {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const migration = require(path!);
      return {
        name: name.replace(/\.ts$/, '.js'),
        up: async () => migration.up({ context }),
        down: async () => migration.down({ context }),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger,
});

type ColumnChanges = Record<string, { name: string; field: any }[]>;
export async function safeApplyColumnChanges(context: QueryInterface, changes: ColumnChanges) {
  for (const [table, columns] of Object.entries(changes)) {
    const schema = await context.describeTable(table);
    for (const { name, field } of columns) {
      if (!schema[name]) {
        await context.addColumn(table, name, field);
        console.info('safeApplyColumnChanges.addColumn', { table, name, field });
        if (field.defaultValue) {
          await context.bulkUpdate(table, { [name]: field.defaultValue }, {});
        }
      } else {
        console.info('safeApplyColumnChanges.skip', { table, name, field });
      }
    }
  }
}

const indexExists = async (table: string, indexName: string, queryInterface: QueryInterface) => {
  const indexes = await queryInterface.showIndex(table);
  return indexes && Array.isArray(indexes) && indexes.some((index: { name: string }) => index.name === indexName);
};

export async function createIndexIfNotExists(
  queryInterface: QueryInterface,
  table: string,
  columns: string[],
  indexName: string
): Promise<void> {
  if (await indexExists(table, indexName, queryInterface)) {
    console.info(`Index ${indexName} already exists on ${table}, skipping...`);
    return;
  }
  await queryInterface.addIndex(table, columns, { name: indexName });
}

/**
 * SQLite + Sequelize gotcha: `changeColumn` and some `addColumn` calls cause
 * Sequelize to rebuild the table (CREATE temp -> INSERT SELECT -> DROP -> RENAME).
 * The rebuild does NOT carry secondary indexes over, so any index that lived on
 * the table before the rebuild silently disappears. SequelizeMeta still records
 * the migration as applied, which makes the loss invisible.
 *
 * The list below is the source of truth for "indexes that must exist at runtime".
 * On every boot we walk it and (re)create anything that has gone missing. This
 * gives us:
 *   - dev / fresh deploys: matches production index layout out of the box;
 *   - existing instances: any index lost to a future changeColumn is restored
 *     on the next restart;
 *   - observability: a `warn` log is emitted whenever an index is actually
 *     recreated, which is the canary for the bug recurring.
 *
 * When adding a new migration that uses `changeColumn`, also add the affected
 * indexes here so they survive the implicit table rebuild.
 */
type RequiredIndex = { table: string; name: string; columns: string[] };

const REQUIRED_INDEXES: RequiredIndex[] = [
  // ModelCalls
  { table: 'ModelCalls', name: 'idx_model_calls_call_time', columns: ['callTime'] },
  { table: 'ModelCalls', name: 'idx_model_calls_user_time', columns: ['userDid', 'callTime'] },
  { table: 'ModelCalls', name: 'idx_model_calls_app_time', columns: ['appDid', 'callTime'] },
  { table: 'ModelCalls', name: 'idx_model_calls_user_app_time', columns: ['userDid', 'appDid', 'callTime'] },
  { table: 'ModelCalls', name: 'idx_model_calls_time_model', columns: ['callTime', 'model'] },
  // ModelCallStats
  { table: 'ModelCallStats', name: 'idx_model_call_stats_user_type_time', columns: ['userDid', 'timeType', 'timestamp'] },
  { table: 'ModelCallStats', name: 'idx_model_call_stats_type_time', columns: ['timeType', 'timestamp'] },
  { table: 'ModelCallStats', name: 'idx_model_call_stats_type_time_app', columns: ['timeType', 'timestamp', 'appDid'] },
  // Projects
  { table: 'Projects', name: 'idx_projects_app_did', columns: ['appDid'] },
];

async function reaffirmRequiredIndexes(queryInterface: QueryInterface) {
  for (const idx of REQUIRED_INDEXES) {
    try {
      if (await indexExists(idx.table, idx.name, queryInterface)) {
        continue;
      }
      await queryInterface.addIndex(idx.table, idx.columns, { name: idx.name });
      logger.warn('[index-reaffirm] recreated missing index', {
        table: idx.table,
        index: idx.name,
        columns: idx.columns,
        hint: 'a previous migration (likely changeColumn) silently dropped this index; investigate recent migrations',
      });
    } catch (error) {
      logger.error('[index-reaffirm] failed to ensure index', {
        table: idx.table,
        index: idx.name,
        columns: idx.columns,
        error,
      });
    }
  }
}

export default async function migrate() {
  await umzug.up();
  await reaffirmRequiredIndexes(sequelize.getQueryInterface());
}

export type Migration = typeof umzug._types.migration;
