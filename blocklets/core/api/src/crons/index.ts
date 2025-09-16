import Cron from '@abtnode/cron';
import {
  CHECK_MODEL_STATUS_CRON_TIME,
  CLEANUP_STALE_MODEL_CALLS_CRON_TIME,
  MODEL_CALL_STATS_CRON_TIME,
} from '@api/libs/env';

import logger from '../libs/logger';
// import { checkAllModelStatus } from '../libs/status';
import { cleanupStaleProcessingCalls } from '../middlewares/model-call-tracker';
import { createModelCallStats } from './model-call-stats';

function shouldExecuteTask(): boolean {
  const isMasterCluster = process.env.BLOCKLET_INSTANCE_ID === '0';
  const nonCluster = process.env.BLOCKLET_INSTANCE_ID === undefined;

  return nonCluster || isMasterCluster;
}

function init() {
  Cron.init({
    context: {},
    jobs: [
      {
        name: 'model.call.stats',
        time: MODEL_CALL_STATS_CRON_TIME,
        fn: () => {
          if (shouldExecuteTask()) {
            createModelCallStats();
          }
        },
        options: { runOnInit: false },
      },
      {
        name: 'cleanup.stale.model.calls',
        time: CLEANUP_STALE_MODEL_CALLS_CRON_TIME,
        fn: async () => {
          if (shouldExecuteTask()) {
            const cleanedCount = await cleanupStaleProcessingCalls(30);
            if (cleanedCount > 0) {
              logger.info(`Model call cleanup completed, cleaned ${cleanedCount} stale calls`);
            }
          }
        },
        options: { runOnInit: false },
      },
      {
        name: 'check.model.status',
        time: CHECK_MODEL_STATUS_CRON_TIME,
        fn: () => {
          // logger.info('start check all model status');
          // checkAllModelStatus();
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
