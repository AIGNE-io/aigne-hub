// NOTE: add next line to keep sqlite3 in the bundle
import 'sqlite3';

import { Sequelize } from 'sequelize';

import { Config } from '../libs/env';
import logger from '../libs/logger';

const url = `sqlite:${Config.dataDir}/aikit.db`;

export const sequelize = new Sequelize(url, {
  logging: Config.verbose === false ? false : logger.info.bind(logger),
});

sequelize.query('pragma journal_mode = WAL;');
sequelize.query('pragma synchronous = normal;');
sequelize.query('pragma journal_size_limit = 67108864;');
