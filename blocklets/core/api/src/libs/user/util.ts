import { getDidDomainForBlocklet } from '@abtnode/util/lib/get-domain-for-blocklet';
import logger from '@api/libs/logger';
import ModelCallStat from '@api/store/models/model-call-stat';
import { DailyStats } from '@api/store/models/types';
import axios from 'axios';
import { Op } from 'sequelize';
import { joinURL } from 'ufo';

import { formatUsageStats } from './format-usage';
import { UsageTrendComparisonResult } from './hour-range';
import { computeGrowth, sumStats } from './sum';

export const getAppName = async (appDid: string) => {
  try {
    if (/[.@]/.test(appDid)) {
      return { appName: '', appDid, appLogo: '', appUrl: '' };
    }

    const domain = getDidDomainForBlocklet({ did: appDid });
    if (!domain) {
      logger.warn('Invalid blocklet DID, skipping fetch', { appDid });
      return { appName: '', appDid, appLogo: '', appUrl: '' };
    }
    const url = joinURL(`https://${domain}`, '__blocklet__.js?type=json');
    const { data } = await axios.get(url, { timeout: 30000 });

    // Validate that we got valid app name from API
    if (!data?.appName) {
      logger.warn('No appName found in blocklet metadata', { appDid, domain });
      return { appName: '', appDid, appLogo: '', appUrl: '' };
    }

    const { appName, appUrl, appLogo } = data;

    return {
      appName,
      appDid,
      appLogo,
      appUrl,
    };
  } catch (error) {
    logger.error('Failed to get app name', {
      appDid,
      domain: getDidDomainForBlocklet({ did: appDid }),
      error: error?.message || error,
    });
    return { appName: '', appDid, appLogo: '', appUrl: '' };
  }
};

async function getHourlyStatsInRange(start: number, end: number, userDid?: string): Promise<DailyStats[]> {
  const whereClause: any = {
    timeType: 'hour',
    timestamp: { [Op.gte]: start, [Op.lte]: end },
  };
  if (userDid) {
    whereClause.userDid = userDid;
  } else {
    whereClause.userDid = { [Op.not]: null };
  }

  const stats = await ModelCallStat.findAll({
    where: whereClause,
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
      // Fetch hourly stats using getTrends for both periods in parallel
      const [currentTrends, previousTrends] = await Promise.all([
        ModelCallStat.getUserTrends(userDid, startTime, endTime, 'hour'),
        ModelCallStat.getUserTrends(userDid, previousStart, previousEnd, 'hour'),
      ]);

      // Extract stats from trends
      currentHourlyStats = currentTrends.map((t) => t.stats);
      previousHourlyStats = previousTrends.map((t) => t.stats);
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
    // Fetch hourly stats using getTrends
    const trends = await ModelCallStat.getUserTrends(userDid, startTime, endTime, 'hour');

    // Extract hours and stats
    const hours = trends.map((t) => t.timestamp);
    const hourlyStatsRaw = trends.map((t) => t.stats);

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
      where: { timeType: 'hour', userDid: { [Op.not]: null }, timestamp: { [Op.gte]: startTime, [Op.lte]: endTime } },
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
