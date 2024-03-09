import '@blocklet/sdk/lib/error-handler';

import dotenv from 'dotenv-flow';

const logger = console;

dotenv.config();

const { name } = require('../../../package.json');

(async () => {
  try {
    await import('../store/migrate').then((m) => m.default());

    process.exit(0);
  } catch (err) {
    logger.error(`${name} pre-start error`, err.message);
    process.exit(1);
  }
})();
