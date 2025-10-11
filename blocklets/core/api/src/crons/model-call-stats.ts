import dayjs from '@api/libs/dayjs';
import logger from '@api/libs/logger';
import { getCurrentUnixTimestamp } from '@api/libs/timestamp';
import ModelCallStat from '@api/store/models/model-call-stat';

import { sequelize } from '../store/sequelize';

const HOUR_IN_SECONDS = 3600;

export async function getHoursToWarmup(): Promise<number[]> {
  const item = await ModelCallStat.findOne({
    order: [['timestamp', 'DESC']],
    limit: 1,
    offset: 0,
    attributes: ['timestamp'],
  });

  const now = dayjs.utc().unix();
  const currentHour = Math.floor(now / HOUR_IN_SECONDS) * HOUR_IN_SECONDS;
  const previousHour = currentHour - HOUR_IN_SECONDS;

  if (item) {
    const hours: number[] = [];
    let current = item.timestamp + HOUR_IN_SECONDS;

    // Include all missing hours up to the previous hour
    while (current <= previousHour) {
      hours.push(current);
      current += HOUR_IN_SECONDS;
    }

    // Always include previous hour to ensure it's updated with final data
    if (!hours.includes(previousHour)) {
      hours.push(previousHour);
    }

    return hours;
  }

  // If no existing stats, start with previous hour
  return [previousHour];
}

// Create cached statistics for specified hour
export async function createModelCallStats(hourTimestamp?: number) {
  const hours = hourTimestamp ? [hourTimestamp] : await getHoursToWarmup();

  // Get all active users (users with calls in the last 7 days)
  const activeUsers = (await sequelize.query(
    `
    SELECT DISTINCT "userDid" 
    FROM "ModelCalls" 
    WHERE "callTime" >= :sevenDaysAgo
  `,
    {
      type: 'SELECT',
      replacements: {
        sevenDaysAgo: getCurrentUnixTimestamp() - 7 * 24 * 60 * 60,
      },
    }
  )) as any[];

  await Promise.all(
    hours.map(async (hourTimestamp) => {
      await Promise.all(
        activeUsers.map(async (user) => {
          try {
            await ModelCallStat.getHourlyStats(user.userDid, hourTimestamp);
            logger.info('ModelCallStat hourly processed', {
              hour: new Date(hourTimestamp * 1000).toISOString(),
              userDid: user.userDid,
            });
          } catch (error) {
            logger.error('Failed to process hourly stats', {
              hour: new Date(hourTimestamp * 1000).toISOString(),
              userDid: user.userDid,
              error,
            });
          }
        })
      );
    })
  );
}
