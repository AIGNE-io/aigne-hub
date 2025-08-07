import dayjs from '@api/libs/dayjs';
import logger from '@api/libs/logger';
import { getCurrentUnixTimestamp } from '@api/libs/timestamp';
import ModelCallStat from '@api/store/models/model-call-stat';

import { sequelize } from '../store/sequelize';

export async function getDatesToWarmup(): Promise<string[]> {
  const item = await ModelCallStat.findOne({
    order: [['timestamp', 'DESC']],
    limit: 1,
    offset: 0,
    attributes: ['timestamp'],
  });

  const dayInSeconds = 60 * 60 * 24;
  const now = dayjs().unix() - dayInSeconds;
  if (item) {
    const dates: string[] = [];
    let current = item.timestamp + dayInSeconds;

    while (current < now) {
      dates.push(dayjs(current * 1000).format('YYYY-MM-DD'));
      current += dayInSeconds;
    }

    return dates;
  }

  return [dayjs(now * 1000).format('YYYY-MM-DD')];
}

// 创建指定日期的缓存
export async function createModelCallStats(date?: string) {
  const dates = date ? [date] : await getDatesToWarmup();

  // 获取所有活跃用户（最近7天有调用的用户）
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
    dates.map(async (date) => {
      await Promise.all(
        activeUsers.map(async (user) => {
          try {
            await ModelCallStat.getDailyStats(user.userDid, date);
            logger.info('ModelCallStat processed', { date, userDid: user.userDid });
          } catch (error) {
            logger.warn('Failed to process stats', { date, userDid: user.userDid, error });
          }
        })
      );
    })
  );
}

export async function scheduledModelCallStatsWarmup() {
  try {
    logger.info('Starting scheduled warmup at:', new Date().toISOString());

    await createModelCallStats();

    logger.info('Scheduled warmup completed successfully');
  } catch (error) {
    logger.error('Scheduled warmup failed:', error);
    throw error;
  }
}

export async function manualModelCallStatsWarmup(date: string) {
  try {
    logger.info('Starting manual warmup for date:', date);

    await createModelCallStats(date);

    logger.info('Manual warmup completed successfully');
  } catch (error) {
    logger.error('Manual warmup failed:', error);
    throw error;
  }
}
