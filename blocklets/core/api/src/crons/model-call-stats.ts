import dayjs from '@api/libs/dayjs';
import logger from '@api/libs/logger';
import ModelCallStat from '@api/store/models/model-call-stat';
import { Op, QueryTypes } from 'sequelize';

import { sequelize } from '../store/sequelize';

const DAY_IN_SECONDS = 86400;

export async function getDaysToWarmup(): Promise<number[]> {
  const item = await ModelCallStat.findOne({
    where: { timeType: 'day', userDid: { [Op.not]: null } },
    order: [['timestamp', 'DESC']],
    limit: 1,
    offset: 0,
    attributes: ['timestamp'],
  });

  const now = dayjs.utc().unix();
  const currentDay = Math.floor(now / DAY_IN_SECONDS) * DAY_IN_SECONDS;
  const previousDay = currentDay - DAY_IN_SECONDS;

  if (item) {
    const days: number[] = [];
    let current = item.timestamp + DAY_IN_SECONDS;

    // Include all missing days up to the previous day
    while (current <= previousDay) {
      days.push(current);
      current += DAY_IN_SECONDS;
    }

    // Always include previous day to ensure it's updated with final data
    if (!days.includes(previousDay)) {
      days.push(previousDay);
    }

    return days;
  }

  // If no existing stats, start with previous day
  return [previousDay];
}

// 创建指定天的缓存统计
export async function createModelCallStats(dayTimestamp?: number) {
  const days = dayTimestamp ? [dayTimestamp] : await getDaysToWarmup();

  await Promise.all(
    days.map(async (dayTimestamp) => {
      const startTime = dayTimestamp;
      const endTime = dayTimestamp + DAY_IN_SECONDS - 1;
      const calls = (await sequelize.query(
        `
        SELECT DISTINCT "userDid", "appDid"
        FROM "ModelCalls"
        WHERE "callTime" >= :startTime
          AND "callTime" <= :endTime
      `,
        {
          type: QueryTypes.SELECT,
          replacements: { startTime, endTime },
        }
      )) as Array<{ userDid: string; appDid: string | null }>;

      const uniquePairs = new Map<string, { userDid: string; appDid: string | null }>();
      calls.forEach((call) => {
        const { appDid } = call;
        const key = `${call.userDid}::${appDid || ''}`;
        uniquePairs.set(key, { userDid: call.userDid, appDid });
      });

      await Promise.all(
        Array.from(uniquePairs.values()).map(async ({ userDid, appDid }) => {
          try {
            await ModelCallStat.getDailyStatsByApp(userDid, appDid, dayTimestamp);
            logger.info('ModelCallStat daily processed', {
              day: new Date(dayTimestamp * 1000).toISOString(),
              userDid,
              appDid,
            });
          } catch (error) {
            logger.error('Failed to process daily stats', {
              day: new Date(dayTimestamp * 1000).toISOString(),
              userDid,
              appDid,
              error,
            });
          }
        })
      );
    })
  );
}

export async function backfillModelCallStats({
  dayTimestamp,
  userDid,
  appDid,
}: {
  dayTimestamp: number;
  userDid?: string | null;
  appDid?: string | null;
}): Promise<void> {
  if (!Number.isFinite(dayTimestamp)) return;

  const normalizedUserDid = userDid ?? null;
  const startTime = dayTimestamp;
  const endTime = dayTimestamp + DAY_IN_SECONDS - 1;

  if (appDid === undefined) {
    if (!normalizedUserDid) {
      // Admin triggered: aggregate all (userDid, appDid) combinations
      const calls = (await sequelize.query(
        `
          SELECT DISTINCT "userDid", "appDid"
          FROM "ModelCalls"
          WHERE "callTime" >= :startTime
            AND "callTime" <= :endTime
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { startTime, endTime },
        }
      )) as Array<{ userDid: string; appDid: string | null }>;

      const uniquePairs = new Map<string, { userDid: string; appDid: string | null }>();
      calls.forEach((call) => {
        const { appDid } = call;
        const key = `${call.userDid}::${appDid || ''}`;
        uniquePairs.set(key, { userDid: call.userDid, appDid });
      });

      await Promise.all(
        Array.from(uniquePairs.values()).map(({ userDid: uid, appDid: aid }) =>
          ModelCallStat.getDailyStatsByApp(uid, aid, dayTimestamp)
        )
      );

      return;
    }

    // User triggered: aggregate all appDids for this user
    const calls = (await sequelize.query(
      `
        SELECT DISTINCT "appDid"
        FROM "ModelCalls"
        WHERE "userDid" = :userDid
          AND "callTime" >= :startTime
          AND "callTime" <= :endTime
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { userDid: normalizedUserDid, startTime, endTime },
      }
    )) as Array<{ appDid: string | null }>;

    const appDids = new Set<string>();
    calls.forEach((call) => {
      if (call.appDid) {
        appDids.add(call.appDid);
      }
    });

    await Promise.all(
      Array.from(appDids.values()).map((appDidValue) =>
        ModelCallStat.getDailyStatsByApp(normalizedUserDid, appDidValue, dayTimestamp)
      )
    );

    return;
  }

  await ModelCallStat.getDailyStatsByApp(normalizedUserDid, appDid, dayTimestamp);
}

export async function backfillModelCallStatsBatch({
  dayTimestamps,
  userDid,
  appDid,
}: {
  dayTimestamps: number[];
  userDid?: string | null;
  appDid?: string | null;
}): Promise<void> {
  if (!Array.isArray(dayTimestamps) || dayTimestamps.length === 0) {
    return;
  }

  for (const dayTimestamp of dayTimestamps) {
    await backfillModelCallStats({ dayTimestamp, userDid, appDid });
  }
}
