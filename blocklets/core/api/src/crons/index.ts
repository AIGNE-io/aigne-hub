import Cron from '@abtnode/cron';
import dayjs from '@api/libs/dayjs';
import {
  ARCHIVE_MODEL_DATA_CRON_TIME,
  CHECK_MODEL_STATUS_CRON_TIME,
  CLEANUP_STALE_MODEL_CALLS_CRON_TIME,
  ENABLE_ARCHIVE_MODEL_DATA_CRON,
  MODEL_CALL_MONTHLY_STATS_CRON_TIME,
  MODEL_CALL_STATS_CRON_TIME,
} from '@api/libs/env';

import logger from '../libs/logger';
import shouldExecuteTask from '../libs/master-cluster';
import { cleanupStaleProcessingCalls } from '../middlewares/model-call-tracker';
import { executeArchiveTask } from './archive-task';
import { createHourlyModelCallStats, createMonthlyModelCallStats, getHoursToWarmup } from './model-call-stats';

function init() {
  Cron.init({
    context: {},
    jobs: [
      {
        name: 'model.call.stats',
        time: MODEL_CALL_STATS_CRON_TIME,
        fn: async () => {
          logger.info('cron model.call.stats');
          if (shouldExecuteTask('model.call.stats cron')) {
            logger.info('Executing model.call.stats on cluster:', { instanceId: process.env.BLOCKLET_INSTANCE_ID });
            const range = await getHoursToWarmup();
            if (!range) {
              return;
            }
            const now = dayjs.utc().unix();
            const currentHour = Math.floor(now / 3600) * 3600;
            const isMidnight = currentHour % (24 * 3600) === 0;
            await createHourlyModelCallStats(range.startTime, range.endTime, undefined, isMidnight);
          }
        },
        options: { runOnInit: false },
      },
      {
        name: 'model.call.monthly.stats',
        time: MODEL_CALL_MONTHLY_STATS_CRON_TIME,
        fn: async () => {
          logger.info('cron model.call.monthly.stats');
          if (shouldExecuteTask('model.call.monthly.stats cron')) {
            const now = dayjs.utc();
            const currentMonthStart = now.startOf('month');
            const previousMonthStart = currentMonthStart.subtract(1, 'month');
            await createMonthlyModelCallStats(previousMonthStart.unix());
          }
        },
        options: { runOnInit: false },
      },
      {
        name: 'cleanup.stale.model.calls',
        time: CLEANUP_STALE_MODEL_CALLS_CRON_TIME,
        fn: async () => {
          if (shouldExecuteTask('cleanup.stale.model.calls cron')) {
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
      {
        name: 'archive.model.data',
        time: ARCHIVE_MODEL_DATA_CRON_TIME,
        fn: async () => {
          if (ENABLE_ARCHIVE_MODEL_DATA_CRON && shouldExecuteTask('archive.model.data cron')) {
            logger.info('Executing archive task on cluster:', { instanceId: process.env.BLOCKLET_INSTANCE_ID });
            await executeArchiveTask();
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
