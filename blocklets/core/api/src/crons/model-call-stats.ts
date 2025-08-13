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
  const now = dayjs().unix();
  const yesterday = now - dayInSeconds;

  if (item) {
    const dates: string[] = [];
    let current = item.timestamp + dayInSeconds;

    // Include all missing dates up to yesterday
    while (current <= yesterday) {
      dates.push(dayjs(current * 1000).format('YYYY-MM-DD'));
      current += dayInSeconds;
    }

    // Always include yesterday to ensure it's updated with final data
    const yesterdayStr = dayjs(yesterday * 1000).format('YYYY-MM-DD');
    if (!dates.includes(yesterdayStr)) {
      dates.push(yesterdayStr);
    }

    return dates;
  }

  // If no existing stats, start with yesterday
  return [dayjs(yesterday * 1000).format('YYYY-MM-DD')];
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
