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

export default async function migrate() {
  await umzug.up();
}

export type Migration = typeof umzug._types.migration;
