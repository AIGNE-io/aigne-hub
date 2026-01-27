import dayjs from '@api/libs/dayjs';
import logger from '@api/libs/logger';
import ModelCallStat from '@api/store/models/model-call-stat';
import pAll from 'p-all';
import pRetry from 'p-retry';
import { Op, QueryTypes } from 'sequelize';

import { sequelize } from '../store/sequelize';

const HOUR_IN_SECONDS = 3600;
const DAY_IN_SECONDS = 24 * HOUR_IN_SECONDS;
const CALC_HOURLY_STATS_CONCURRENCY = 10;
const CALC_HOURLY_STATS_RETRY_OPTIONS = {
  retries: 2,
  factor: 2,
  minTimeout: 500,
  maxTimeout: 5000,
  randomize: true,
};

export async function getHoursToWarmup(): Promise<{ startTime: number; endTime: number } | null> {
  const item = await ModelCallStat.findOne({
    where: { timeType: 'hour', userDid: { [Op.not]: null } },
    order: [['timestamp', 'DESC']],
    limit: 1,
    offset: 0,
    attributes: ['timestamp'],
  });

  const now = dayjs.utc().unix();
  const currentHour = Math.floor(now / HOUR_IN_SECONDS) * HOUR_IN_SECONDS;
  const previousHour = currentHour - HOUR_IN_SECONDS;
  const isMidnight = currentHour % DAY_IN_SECONDS === 0;

  const startHour = item ? item.timestamp + HOUR_IN_SECONDS : previousHour;
  const rangeStart = isMidnight ? Math.min(startHour, currentHour - DAY_IN_SECONDS) : startHour;
  const rangeEnd = previousHour;
  if (rangeStart > rangeEnd) {
    return null;
  }

  return { startTime: rangeStart, endTime: rangeEnd + HOUR_IN_SECONDS - 1 };
}

// 创建指定时间段内的缓存统计
export async function createModelCallStats(
  startTime: number,
  endTime: number,
  userDid?: string | null,
  force?: boolean
) {
  const normalizedUserDid = userDid ?? null;
  const shouldForce = force === true;

  const calls = (await sequelize.query(
    `
      SELECT DISTINCT "userDid",
        "appDid",
        ("callTime" / ${HOUR_IN_SECONDS}) * ${HOUR_IN_SECONDS} AS "hourTimestamp"
      FROM "ModelCalls"
      WHERE "callTime" >= :startTime
        AND "callTime" <= :endTime
        ${normalizedUserDid ? 'AND "userDid" = :userDid' : ''}
        AND "userDid" IS NOT NULL
        AND "appDid" IS NOT NULL
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { startTime, endTime, userDid: normalizedUserDid },
    }
  )) as Array<{ userDid: string; appDid: string; hourTimestamp: number }>;

  const pairsByHour = new Map<number, Array<{ userDid: string; appDid: string }>>();
  calls.forEach((call) => {
    const list = pairsByHour.get(call.hourTimestamp);
    if (list) {
      list.push({ userDid: call.userDid, appDid: call.appDid });
      return;
    }
    pairsByHour.set(call.hourTimestamp, [{ userDid: call.userDid, appDid: call.appDid }]);
  });

  const hoursToProcess = Array.from(pairsByHour.keys()).sort((a, b) => a - b);
  for (const hourTimestamp of hoursToProcess) {
    await pAll(
      (pairsByHour.get(hourTimestamp) || []).map(({ userDid: uid, appDid: aid }) => async () => {
        try {
          await pRetry(
            async () => {
              await ModelCallStat.calcHourlyStats(uid, aid, hourTimestamp, { force: shouldForce });
            },
            {
              ...CALC_HOURLY_STATS_RETRY_OPTIONS,
              onFailedAttempt: (error: any) => {
                logger.warn('ModelCallStat hourly retry', {
                  hour: new Date(hourTimestamp * 1000).toISOString(),
                  userDid: uid,
                  appDid: aid,
                  attempt: error?.attemptNumber,
                  retriesLeft: error?.retriesLeft,
                  error,
                });
              },
            }
          );
          logger.info('ModelCallStat hourly processed', {
            hour: new Date(hourTimestamp * 1000).toISOString(),
            userDid: uid,
            appDid: aid,
          });
        } catch (error) {
          logger.error('Failed to process hourly stats', {
            hour: new Date(hourTimestamp * 1000).toISOString(),
            userDid: uid,
            appDid: aid,
            error,
          });
        }
      }),
      { concurrency: CALC_HOURLY_STATS_CONCURRENCY, stopOnError: false }
    );
  }
}
