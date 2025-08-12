import Cron from '@abtnode/cron';

import logger from '../libs/logger';
import { cleanupStaleProcessingCalls } from '../middlewares/model-call-tracker';
import { createModelCallStats } from './model-call-stats';

function init() {
  Cron.init({
    context: {},
    jobs: [
      {
        name: 'model.call.stats',
        time: '0 1 0 * * *', // every day at 1:00 AM
        fn: () => createModelCallStats(),
        options: { runOnInit: false },
      },
      {
        name: 'cleanup.stale.model.calls',
        time: '*/10 * * * *', // 每10分钟执行一次
        fn: async () => {
          const cleanedCount = await cleanupStaleProcessingCalls(30);
          if (cleanedCount > 0) {
            logger.info(`Model call cleanup completed, cleaned ${cleanedCount} stale calls`);
          }
        },
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
