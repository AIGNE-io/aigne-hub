import Cron from '@abtnode/cron';

import { dailyCallCacheCronTime } from '../libs/env';
import logger from '../libs/logger';
import { createModelCallStats } from './model-call-stats';

function init() {
  Cron.init({
    context: {},
    jobs: [
      {
        name: 'daily.call.cache',
        time: dailyCallCacheCronTime,
        fn: () => createModelCallStats(),
        options: { runOnInit: false },
      },
    ],
    onError: (error: Error, name: string) => {
      logger.error('run job failed', { name, error });
    },
  });
}

export default {
  init,
};
