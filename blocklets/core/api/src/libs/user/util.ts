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
    where: { timestamp: { [Op.gte]: start, [Op.lte]: end }, timeType: 'hour' },
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

      [currentHourlyStats, previousHourlyStats] = await Promise.all([
        Promise.all(currentHours.map((hour) => ModelCallStat.getHourlyStats(userDid, hour))),
        Promise.all(previousHours.map((hour) => ModelCallStat.getHourlyStats(userDid, hour))),
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
export async function getUsageStatsHourlyOptimized(userDid: string, startTime: number, endTime: number) {
  try {
    // Generate hourly range from user's local time timestamps
    const hours = generateHourRangeFromTimestamps(startTime, endTime);

    // Get hourly stats using ModelCallStat (cached/precomputed)
    const hourlyStatsRaw = await Promise.all(hours.map((hour: number) => ModelCallStat.getHourlyStats(userDid, hour)));

    return formatUsageStats({ hourlyStatsRaw, hours });
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}

export async function getUsageStatsHourlyOptimizedAdmin(startTime: number, endTime: number) {
  try {
    const existingStat = await getHourlyStatsInRange(startTime, endTime);
    return formatUsageStats({ hourlyStatsRaw: existingStat, hours: existingStat.map((stat) => stat.timestamp!) });
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}
