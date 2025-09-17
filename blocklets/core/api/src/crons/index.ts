import Cron from '@abtnode/cron';
import {
  CHECK_MODEL_STATUS_CRON_TIME,
  CLEANUP_STALE_MODEL_CALLS_CRON_TIME,
  MODEL_CALL_STATS_CRON_TIME,
} from '@api/libs/env';

import logger from '../libs/logger';
import { cleanupStaleProcessingCalls } from '../middlewares/model-call-tracker';
import { createModelCallStats } from './model-call-stats';

function shouldExecuteTask(): boolean {
  const isMasterCluster = process.env.BLOCKLET_INSTANCE_ID === '0';
  const nonCluster = process.env.BLOCKLET_INSTANCE_ID === undefined;
  logger.info('Cluster execution check:', { isMasterCluster, nonCluster });

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
          logger.info('cron model.call.stats');
          if (shouldExecuteTask()) {
            logger.info('Executing model.call.stats on cluster:', { instanceId: process.env.BLOCKLET_INSTANCE_ID });
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
