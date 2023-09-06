// NOTE: add next line to keep sqlite3 in the bundle
import 'sqlite3';

import { Sequelize } from 'sequelize';

import env from '../libs/env';
import logger from '../libs/logger';

const url = `sqlite:${env.dataDir}/aikit.db`;

export const sequelize = new Sequelize(url, {
  logging: env.verbose === false ? false : logger.log,
});
