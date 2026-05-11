// NOTE: add next line to keep sqlite3 in the bundle
import 'sqlite3';

import { Sequelize } from 'sequelize';

import { Config } from '../libs/env';
import logger from '../libs/logger';

const url = `sqlite:${Config.dataDir}/aikit.db`;

// Slow-SQL threshold. Queries that take >= this many ms emit a `warn` log with
// the SQL truncated, even when VERBOSE is off. Tunable via env without
// rebuilding. Keep the threshold below user-visible latency (500ms is a
// reasonable signal floor) so anything actually slow shows up.
const SLOW_SQL_MS = Number(process.env.SLOW_SQL_MS) > 0 ? Number(process.env.SLOW_SQL_MS) : 500;
const MAX_SQL_LOG_CHARS = 500;

export const sequelize = new Sequelize(url, {
  benchmark: true,
  logging: (sql: string, timing?: number) => {
    const ms = typeof timing === 'number' ? timing : 0;
    if (Config.verbose) {
      logger.info(sql, { ms });
      return;
    }
    if (ms >= SLOW_SQL_MS) {
      logger.warn('[slow-sql]', {
        ms,
        sql: sql.length > MAX_SQL_LOG_CHARS ? `${sql.slice(0, MAX_SQL_LOG_CHARS)}...` : sql,
      });
    }
  },
});

sequelize.query('pragma journal_mode = WAL;');
sequelize.query('pragma synchronous = normal;');
sequelize.query('pragma journal_size_limit = 67108864;');
