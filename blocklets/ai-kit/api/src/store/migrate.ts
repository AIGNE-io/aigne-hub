import { SequelizeStorage, Umzug } from 'umzug';

import logger from '../libs/logger';
import { sequelize } from './sequelize';

const umzug = new Umzug({
  migrations: {
    glob: ['migrations/*.{ts,js}', { cwd: __dirname }],
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

export default async function migrate() {
  await umzug.up();
}

export type Migration = typeof umzug._types.migration;
