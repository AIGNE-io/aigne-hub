import { getDidDomainForBlocklet } from '@abtnode/util/lib/get-domain-for-blocklet';
import logger from '@api/libs/logger';
import ModelCallStat from '@api/store/models/model-call-stat';
import { DailyStats } from '@api/store/models/types';
import axios from 'axios';
import { Op } from 'sequelize';
import { joinURL } from 'ufo';

import { formatUsageStats } from './format-usage';
import { UsageTrendComparisonResult, generateHourRangeFromTimestamps } from './hour-range';
import { computeGrowth, sumStats } from './sum';

interface AppNameCacheItem {
  appName: string;
  appLogo: string;
  appDid: string;
  appUrl: string;
  timestamp: number;
  expiresAt: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

const appNameCache = new Map<string, AppNameCacheItem>();

export const getAppName = async (appDid: string) => {
  try {
    const now = Date.now();

    const cached = appNameCache.get(appDid);
    if (cached && now < cached.expiresAt) {
      return {
        appName: cached.appName,
        appDid,
        appLogo: cached.appLogo,
        appUrl: cached.appUrl,
      };
    }

    if (cached && now >= cached.expiresAt) {
      appNameCache.delete(appDid);
    }

    if (appNameCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = appNameCache.keys().next().value;
      if (oldestKey) {
        appNameCache.delete(oldestKey);
      }
    }

    const domain = getDidDomainForBlocklet({ did: appDid });
    if (!domain) {
      throw new Error('Invalid blocklet DID');
    }
    const url = joinURL(`https://${domain}`, '__blocklet__.js?type=json');
    const { data } = await axios.get(url, { timeout: 3000 });
    const appName = data?.appName || appDid;

    appNameCache.set(appDid, {
      appName,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
      appDid,
      appUrl: data?.appUrl,
      appLogo: data?.appLogo,
    });

    return {
      appName,
      appDid,
      appLogo: data?.appLogo,
      appUrl: data?.appUrl,
    };
  } catch (error) {
    logger.error('Failed to get app name:', error);
    return {
      appName: appDid,
      appDid,
      appLogo: '',
      appUrl: '',
    };
  }
};

async function getHourlyStatsInRange(start: number, end: number): Promise<DailyStats[]> {
  const stats = await ModelCallStat.findAll({
    where: {
      timeType: 'hour',
      timestamp: { [Op.gte]: start, [Op.lte]: end },
    },
  });

  return stats.map((stat) => ({ ...stat.stats, timestamp: stat.timestamp }));
}

// Optimized trend comparison using hourly ModelCallStat data
export async function getTrendComparisonOptimized({
  userDid,
  startTime,
  endTime,
}: {
  userDid?: string;
  startTime: number;
  endTime: number;
}): Promise<UsageTrendComparisonResult | null> {
  const periodDuration = endTime - startTime;
  const previousEnd = startTime - 1;
  const previousStart = previousEnd - periodDuration;

  try {
    let currentHourlyStats: DailyStats[] = [];
    let previousHourlyStats: DailyStats[] = [];

    if (userDid) {
      // Generate hour ranges for both current and previous periods
      const currentHours = generateHourRangeFromTimestamps(startTime, endTime);
      const previousHours = generateHourRangeFromTimestamps(previousStart, previousEnd);

      // 批量查询两个时间段的缓存数据
      const [currentCachedStats, previousCachedStats] = await Promise.all([
        ModelCallStat.findAll({
          where: {
            userDid,
            timeType: 'hour',
            timestamp: { [Op.in]: currentHours },
          },
          raw: true,
        }),
        ModelCallStat.findAll({
          where: {
            userDid,
            timeType: 'hour',
            timestamp: { [Op.in]: previousHours },
          },
          raw: true,
        }),
      ]);

      // 构建缓存 Map
      const currentCachedMap = new Map<number, DailyStats>();
      const previousCachedMap = new Map<number, DailyStats>();

      currentCachedStats.forEach((stat: any) => {
        currentCachedMap.set(stat.timestamp, stat.stats);
      });
      previousCachedStats.forEach((stat: any) => {
        previousCachedMap.set(stat.timestamp, stat.stats);
      });

      // 找出缺失的小时
      const currentMissing = currentHours.filter((hour) => !currentCachedMap.has(hour));
      const previousMissing = previousHours.filter((hour) => !previousCachedMap.has(hour));

      // 当前小时实时计算，历史小时触发缓存
      const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

      // 分批处理缺失数据
      const BATCH_SIZE = 50;
      const processMissingBatch = async (hours: number[], isCurrentPeriod: boolean) => {
        const results: Array<{ hour: number; stats: DailyStats }> = [];
        const historicalHours = hours.filter((h) => h < currentHour);
        const currentHours = hours.filter((h) => h >= currentHour);

        // 分批处理历史小时
        for (let i = 0; i < historicalHours.length; i += BATCH_SIZE) {
          const batch = historicalHours.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (hour) => ({
              hour,
              stats: await ModelCallStat.getHourlyStats(userDid, hour),
            }))
          );
          results.push(...batchResults);
        }

        // 实时计算当前小时
        const currentResults = await Promise.all(
          currentHours.map(async (hour) => ({
            hour,
            stats: await ModelCallStat.computeHourlyStats(userDid, hour),
          }))
        );
        results.push(...currentResults);

        return results;
      };

      const [currentMissingStats, previousMissingStats] = await Promise.all([
        processMissingBatch(currentMissing, true),
        processMissingBatch(previousMissing, false),
      ]);

      // 合并数据
      currentMissingStats.forEach(({ hour, stats }) => {
        currentCachedMap.set(hour, stats);
      });
      previousMissingStats.forEach(({ hour, stats }) => {
        previousCachedMap.set(hour, stats);
      });

      // 按顺序构建结果
      currentHourlyStats = currentHours.map((hour) => currentCachedMap.get(hour)!);
      previousHourlyStats = previousHours.map((hour) => previousCachedMap.get(hour)!);
    } else {
      [currentHourlyStats, previousHourlyStats] = await Promise.all([
        getHourlyStatsInRange(startTime, endTime),
        getHourlyStatsInRange(previousStart, previousEnd),
      ]);
    }

    // Aggregate current period stats from hourly data
    const currentTotals = sumStats(currentHourlyStats);

    // Aggregate previous period stats from hourly data
    const previousTotals = sumStats(previousHourlyStats);

    // Calculate growth rates
    const growth = {
      usageGrowth: computeGrowth(currentTotals.totalUsage, previousTotals.totalUsage),
      creditsGrowth: computeGrowth(currentTotals.totalCredits, previousTotals.totalCredits),
      callsGrowth: computeGrowth(currentTotals.totalCalls, previousTotals.totalCalls),
    };

    return {
      current: currentTotals,
      previous: previousTotals,
      growth,
    };
  } catch (error) {
    logger.error('Failed to calculate optimized trend comparison:', error);
    return null;
  }
}

// New optimized usage stats using hourly ModelCallStat data
export async function getUsageStatsHourlyOptimized(userDid: string, startTime: number, endTime: number) {
  try {
    // Generate hourly range from user's local time timestamps
    const hours = generateHourRangeFromTimestamps(startTime, endTime);

    // Batch query the cached hourly data instead of querying one by one
    const cachedStats = await ModelCallStat.findAll({
      where: {
        userDid,
        timeType: 'hour',
        timestamp: { [Op.in]: hours },
      },
      raw: true,
    });

    // Build the Map of cached data
    const cachedStatsMap = new Map<number, DailyStats>();
    cachedStats.forEach((stat: any) => {
      cachedStatsMap.set(stat.timestamp, stat.stats);
    });

    // Find the missing hours
    const missingHours = hours.filter((hour) => !cachedStatsMap.has(hour));

    // The current hour is always calculated in real-time
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
    const missingHistoricalHours = missingHours.filter((hour) => hour < currentHour);
    const currentHours = missingHours.filter((hour) => hour >= currentHour);

    // Batch process the missing historical hours data to avoid too many concurrent queries
    const BATCH_SIZE = 50;
    const missingStats: Array<{ hour: number; stats: DailyStats }> = [];

    for (let i = 0; i < missingHistoricalHours.length; i += BATCH_SIZE) {
      const batch = missingHistoricalHours.slice(i, i + BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop
      const batchResults = await Promise.all(
        batch.map(async (hour) => {
          const stats = await ModelCallStat.getHourlyStats(userDid, hour);
          return { hour, stats };
        })
      );
      missingStats.push(...batchResults);
    }

    // Process the current hour (real-time calculation)
    const currentHourStats = await Promise.all(
      currentHours.map(async (hour) => {
        const stats = await ModelCallStat.computeHourlyStats(userDid, hour);
        return { hour, stats };
      })
    );

    // Merge all data
    missingStats.forEach(({ hour, stats }) => {
      cachedStatsMap.set(hour, stats);
    });
    currentHourStats.forEach(({ hour, stats }) => {
      cachedStatsMap.set(hour, stats);
    });

    // Build the result by hour order
    const hourlyStatsRaw = hours.map((hour) => cachedStatsMap.get(hour)!);

    return formatUsageStats({ hourlyStatsRaw, hours });
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}

export async function getUsageStatsHourlyOptimizedAdmin(startTime: number, endTime: number) {
  try {
    // 批量查询指定时间范围内所有用户的小时统计数据
    const existingStat = await ModelCallStat.findAll({
      where: {
        timeType: 'hour',
        timestamp: {
          [Op.gte]: startTime,
          [Op.lte]: endTime,
        },
      },
      raw: true,
    });

    const statsWithTimestamp = existingStat.map((stat: any) => ({
      ...stat.stats,
      timestamp: stat.timestamp,
    }));

    return formatUsageStats({
      hourlyStatsRaw: statsWithTimestamp,
      hours: statsWithTimestamp.map((stat) => stat.timestamp!),
    });
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}
