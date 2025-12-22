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
    where: { timeType: 'hour', timestamp: { [Op.gte]: start, [Op.lte]: end } },
  });

  return stats.map((stat) => ({ ...stat.stats, timestamp: stat.timestamp }));
}

/**
 * Fetch hourly stats with cache optimization
 * - Batch query cached data
 * - Compute missing hours (save historical, real-time for current)
 * - Merge and return in hour order
 */
async function fetchHourlyStatsWithCache(userDid: string, hours: number[]): Promise<DailyStats[]> {
  // Batch query cached hourly data
  const cachedStats = await ModelCallStat.findAll({
    where: {
      userDid,
      timeType: 'hour',
      timestamp: { [Op.in]: hours },
    },
  });

  // Build cache Map
  const cachedStatsMap = new Map<number, DailyStats>();
  cachedStats.forEach((stat: any) => {
    cachedStatsMap.set(stat.timestamp, stat.stats);
  });

  // Find missing hours
  const missingHours = hours.filter((hour) => !cachedStatsMap.has(hour));

  // Separate historical hours and current hour
  const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const historicalHours = missingHours.filter((h) => h < currentHour);
  const currentHours = missingHours.filter((h) => h >= currentHour);

  // Batch process missing data
  const BATCH_SIZE = 50;
  const missingStats: Array<{ hour: number; stats: DailyStats }> = [];

  // Process historical hours in batches (save to cache)
  if (historicalHours.length > 0) {
    for (let i = 0; i < historicalHours.length; i += BATCH_SIZE) {
      const batch = historicalHours.slice(i, i + BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop
      const batchResults = await Promise.all(
        batch.map(async (hour) => ({ hour, stats: await ModelCallStat.computeAndSaveHourlyStats(userDid, hour) }))
      );
      missingStats.push(...batchResults);
    }
  }

  // Process current hours (real-time, no cache)
  const currentHourStats = await Promise.all(
    currentHours.map(async (hour) => ({ hour, stats: await ModelCallStat.computeHourlyStats(userDid, hour) }))
  );

  // Merge all data
  missingStats.forEach(({ hour, stats }) => {
    cachedStatsMap.set(hour, stats);
  });
  currentHourStats.forEach(({ hour, stats }) => {
    cachedStatsMap.set(hour, stats);
  });

  // Return in hour order
  return hours.map((hour) => cachedStatsMap.get(hour)!);
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

      // Fetch hourly stats with cache for both periods in parallel
      [currentHourlyStats, previousHourlyStats] = await Promise.all([
        fetchHourlyStatsWithCache(userDid, currentHours),
        fetchHourlyStatsWithCache(userDid, previousHours),
      ]);
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
export async function getUsageStatsHourlyOptimized(
  userDid: string,
  startTime: number,
  endTime: number,
  timezoneOffset?: number
) {
  try {
    // Generate hourly range from user's local time timestamps
    const hours = generateHourRangeFromTimestamps(startTime, endTime);

    // Fetch hourly stats with cache optimization
    const hourlyStatsRaw = await fetchHourlyStatsWithCache(userDid, hours);

    return formatUsageStats({ hourlyStatsRaw, hours, timezoneOffset });
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}

export async function getUsageStatsHourlyOptimizedAdmin(startTime: number, endTime: number, timezoneOffset?: number) {
  try {
    // Batch query the hourly statistics of all users within the specified time range
    const existingStat = await ModelCallStat.findAll({
      where: { timeType: 'hour', timestamp: { [Op.gte]: startTime, [Op.lte]: endTime } },
    });

    const statsWithTimestamp = existingStat.map((stat) => ({
      ...stat.stats,
      timestamp: stat.timestamp,
    }));

    return formatUsageStats({
      hourlyStatsRaw: statsWithTimestamp,
      hours: statsWithTimestamp.map((stat) => stat.timestamp!),
      timezoneOffset,
    });
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}
