import dayjs from '@api/libs/dayjs';
import logger from '@api/libs/logger';
import ModelCallStat from '@api/store/models/model-call-stat';
import type { CallType, TypeStats } from '@api/store/models/types';
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

// Build cached stats for a specific time range
export async function createHourlyModelCallStats(
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
    // eslint-disable-next-line no-await-in-loop
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

function parseMonthlyByType(rawValue: unknown): Partial<Record<CallType, TypeStats>> {
  if (!rawValue) return {};
  let parsed = rawValue as any;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const byType: Partial<Record<CallType, TypeStats>> = {};
  for (const [type, stats] of Object.entries(parsed as Record<string, any>)) {
    if (!stats || typeof stats !== 'object') continue;
    const totalUsage = Number(stats.totalUsage ?? 0);
    const totalCredits = Number(stats.totalCredits ?? 0);
    const totalCalls = Number(stats.totalCalls ?? 0);
    const successCalls = Number(stats.successCalls ?? 0);
    if (totalUsage || totalCredits || totalCalls || successCalls) {
      byType[type as CallType] = {
        totalUsage,
        totalCredits,
        totalCalls,
        successCalls,
      };
    }
  }

  return byType;
}

function buildMonthlyStats(row: Record<string, any>) {
  const baseStats = ModelCallStat.buildStatsFromAggregateRow(row);
  const byType = parseMonthlyByType(row.byType);

  return {
    stats: {
      ...baseStats,
      byType,
    },
    byType,
  };
}

// Rebuild monthly stats for the month containing the given time
export async function createMonthlyModelCallStats(monthTime: number): Promise<number> {
  const monthStartMoment = dayjs.utc(monthTime * 1000).startOf('month');
  const nextMonthStart = monthStartMoment.add(1, 'month').startOf('month');
  const monthStart = monthStartMoment.unix();
  const monthEnd = nextMonthStart.unix();
  const monthLabel = monthStartMoment.format('YYYY-MM');

  const baseSelectFields = [
    'stats."userDid"',
    'stats."appDid"',
    'SUM(COALESCE(CAST(json_extract(stats."stats",\'$.totalUsage\') AS INTEGER), 0)) as "totalUsage"',
    'SUM(COALESCE(CAST(json_extract(stats."stats",\'$.totalCredits\') AS REAL), 0)) as "totalCredits"',
    'SUM(COALESCE(CAST(json_extract(stats."stats",\'$.totalCalls\') AS INTEGER), 0)) as "totalCalls"',
    'SUM(COALESCE(CAST(json_extract(stats."stats",\'$.successCalls\') AS INTEGER), 0)) as "successCalls"',
    'SUM(COALESCE(CAST(json_extract(stats."stats",\'$.totalDuration\') AS REAL), 0)) as "totalDuration"',
  ];

  const recordsCount = await sequelize.transaction(async (transaction) => {
    await ModelCallStat.destroy({
      where: { timeType: 'month', timestamp: monthStart },
      transaction,
    });

    const rows = (await sequelize.query(
      `
        WITH base AS (
          SELECT
            ${baseSelectFields.join(',\n            ')}
          FROM "ModelCallStats" AS stats
          WHERE stats."timeType" = 'hour'
            AND stats."timestamp" >= :start
            AND stats."timestamp" < :end
            AND stats."userDid" IS NOT NULL
            AND stats."appDid" IS NOT NULL
          GROUP BY stats."userDid", stats."appDid"
        ),
        by_type_raw AS (
          SELECT
            stats."userDid",
            stats."appDid",
            byType.key as "type",
            SUM(COALESCE(CAST(json_extract(byType.value,'$.totalUsage') AS INTEGER), 0)) as "totalUsage",
            SUM(COALESCE(CAST(json_extract(byType.value,'$.totalCredits') AS REAL), 0)) as "totalCredits",
            SUM(COALESCE(CAST(json_extract(byType.value,'$.totalCalls') AS INTEGER), 0)) as "totalCalls",
            SUM(COALESCE(CAST(json_extract(byType.value,'$.successCalls') AS INTEGER), 0)) as "successCalls"
          FROM "ModelCallStats" AS stats
          JOIN json_each(stats."stats",'$.byType') AS byType
          WHERE stats."timeType" = 'hour'
            AND stats."timestamp" >= :start
            AND stats."timestamp" < :end
            AND stats."userDid" IS NOT NULL
            AND stats."appDid" IS NOT NULL
          GROUP BY stats."userDid", stats."appDid", byType.key
        ),
        by_type AS (
          SELECT
            "userDid",
            "appDid",
            json_group_object(
              "type",
              json_object(
                'totalUsage', "totalUsage",
                'totalCredits', "totalCredits",
                'totalCalls', "totalCalls",
                'successCalls', "successCalls"
              )
            ) as "byType"
          FROM by_type_raw
          GROUP BY "userDid", "appDid"
        )
        SELECT base.*, by_type."byType" as "byType"
        FROM base
        LEFT JOIN by_type
          ON base."userDid" = by_type."userDid"
          AND base."appDid" = by_type."appDid"
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { start: monthStart, end: monthEnd },
        transaction,
      }
    )) as Array<Record<string, any>>;

    const records = rows
      .map((row) => {
        const userDid = row.userDid as string | null;
        const appDid = row.appDid as string | null;
        if (!userDid || !appDid) return null;
        const { stats } = buildMonthlyStats(row);
        return {
          id: `${userDid}-${appDid}-month-${monthStart}`,
          userDid,
          appDid,
          timestamp: monthStart,
          timeType: 'month' as const,
          stats,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      userDid: string;
      appDid: string;
      timestamp: number;
      timeType: 'month';
      stats: any;
    }>;

    if (records.length > 0) {
      await ModelCallStat.bulkCreate(records, { transaction });
    }

    return records.length;
  });
  logger.info('ModelCallStat monthly processed', { month: monthLabel, records: recordsCount });
  return recordsCount;
}
