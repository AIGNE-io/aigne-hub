import Cron from '@abtnode/cron';
import { CLEANUP_STALE_MODEL_CALLS_CRON_TIME, MODEL_CALL_STATS_CRON_TIME } from '@api/libs/env';

import logger from '../libs/logger';
import { cleanupStaleProcessingCalls } from '../middlewares/model-call-tracker';
import { createModelCallStats } from './model-call-stats';

function init() {
  Cron.init({
    context: {},
    jobs: [
      {
        name: 'model.call.stats',
        time: MODEL_CALL_STATS_CRON_TIME,
        fn: () => createModelCallStats(),
        options: { runOnInit: false },
      },
      {
        name: 'cleanup.stale.model.calls',
        time: CLEANUP_STALE_MODEL_CALLS_CRON_TIME,
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
