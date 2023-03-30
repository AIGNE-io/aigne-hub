import '@blocklet/sdk/lib/error-handler';

import dotenv from 'dotenv-flow';

import logger from '../libs/logger';

dotenv.config();

const { name } = require('../../../package.json');

(async () => {
  try {
    process.exit(0);
  } catch (err) {
    logger.error(`${name} pre-start error`, err.message);
    process.exit(1);
  }
})();
