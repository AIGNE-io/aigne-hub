import { getDidDomainForBlocklet } from '@abtnode/util/lib/get-domain-for-blocklet';
import { blocklet, getConnectQueryParam } from '@api/libs/auth';
import { Config } from '@api/libs/env';
import logger from '@api/libs/logger';
import {
  ensureMeter,
  getCreditGrants,
  getCreditPaymentLink,
  getCreditTransactions,
  getCreditUsageLink,
  getUserCredits,
  isPaymentRunning,
} from '@api/libs/payment';
import { ensureAdmin } from '@api/libs/security';
import { formatToShortUrl } from '@api/libs/url';
import ModelCall from '@api/store/models/model-call';
import ModelCallStat from '@api/store/models/model-call-stat';
import { isValid as isValidDid } from '@arcblock/did';
import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import { CustomError } from '@blocklet/error';
import config from '@blocklet/sdk/lib/config';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { Router } from 'express';
import Joi from 'joi';
import { pick } from 'lodash';
import { Op } from 'sequelize';
import { joinURL, withQuery } from 'ufo';

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

const getAppName = async (appDid: string) => {
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

    const url = joinURL(`https://${getDidDomainForBlocklet({ did: appDid })}`, '__blocklet__.js?type=json');
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
      appLogo: data.appLogo,
      appUrl: data.appUrl,
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

const router = Router();

const user = sessionMiddleware({ accessKey: true });

interface TrendComparisonResult {
  current: { totalUsage: number; totalCredits: number; totalCalls: number };
  previous: { totalUsage: number; totalCredits: number; totalCalls: number };
  growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
}

// Helper function to generate hour timestamps from user local time range
// Converts user's local time range to UTC hour timestamps for precise querying
function generateHourRangeFromTimestamps(startTime: number, endTime: number): number[] {
  const hours: number[] = [];
  const hourInSeconds = 3600;

  // Round down start time to the beginning of the hour
  const startHour = Math.floor(startTime / hourInSeconds) * hourInSeconds;

  // Round up end time to the end of the hour
  const endHour = Math.ceil(endTime / hourInSeconds) * hourInSeconds;

  for (let currentHour = startHour; currentHour < endHour; currentHour += hourInSeconds) {
    hours.push(currentHour);
  }

  return hours;
}

// Optimized trend comparison using hourly ModelCallStat data
async function getTrendComparisonOptimized(
  userDid: string,
  startTime: number,
  endTime: number
): Promise<TrendComparisonResult | null> {
  const periodDuration = endTime - startTime;
  const previousEnd = startTime - 1;
  const previousStart = previousEnd - periodDuration;

  // Generate hour ranges for both current and previous periods
  const currentHours = generateHourRangeFromTimestamps(startTime, endTime);
  const previousHours = generateHourRangeFromTimestamps(previousStart, previousEnd);

  try {
    // Get hourly stats using ModelCallStat (cached/precomputed)
    const [currentHourlyStats, previousHourlyStats] = await Promise.all([
      Promise.all(currentHours.map((hour: number) => ModelCallStat.getHourlyStats(userDid, hour))),
      Promise.all(previousHours.map((hour: number) => ModelCallStat.getHourlyStats(userDid, hour))),
    ]);

    // Aggregate current period stats from hourly data
    const currentTotals = {
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      byType: {} as { [key: string]: { totalUsage: number; totalCalls: number } },
    };

    currentHourlyStats.forEach((hourStats: any) => {
      if (hourStats) {
        currentTotals.totalUsage = new BigNumber(currentTotals.totalUsage).plus(hourStats.totalUsage || 0).toNumber();
        currentTotals.totalCredits = new BigNumber(currentTotals.totalCredits)
          .plus(hourStats.totalCredits || 0)
          .toNumber();
        currentTotals.totalCalls = new BigNumber(currentTotals.totalCalls).plus(hourStats.totalCalls || 0).toNumber();

        Object.entries(hourStats.byType || {}).forEach(([type, typeStats]: [string, any]) => {
          if (!currentTotals.byType[type]) {
            currentTotals.byType[type] = { totalUsage: 0, totalCalls: 0 };
          }
          currentTotals.byType[type].totalUsage = new BigNumber(currentTotals.byType[type].totalUsage)
            .plus(typeStats.totalUsage || 0)
            .toNumber();
          currentTotals.byType[type].totalCalls = new BigNumber(currentTotals.byType[type].totalCalls)
            .plus(typeStats.totalCalls || 0)
            .toNumber();
        });
      }
    });

    // Aggregate previous period stats from hourly data
    const previousTotals = {
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      byType: {} as { [key: string]: { totalUsage: number; totalCalls: number } },
    };

    previousHourlyStats.forEach((hourStats: any) => {
      if (hourStats) {
        previousTotals.totalUsage = new BigNumber(previousTotals.totalUsage).plus(hourStats.totalUsage || 0).toNumber();
        previousTotals.totalCredits = new BigNumber(previousTotals.totalCredits)
          .plus(hourStats.totalCredits || 0)
          .toNumber();
        previousTotals.totalCalls = new BigNumber(previousTotals.totalCalls).plus(hourStats.totalCalls || 0).toNumber();

        Object.entries(hourStats.byType || {}).forEach(([type, typeStats]: [string, any]) => {
          if (!previousTotals.byType[type]) {
            previousTotals.byType[type] = { totalUsage: 0, totalCalls: 0 };
          }
          previousTotals.byType[type].totalUsage = new BigNumber(previousTotals.byType[type].totalUsage)
            .plus(typeStats.totalUsage || 0)
            .toNumber();
          previousTotals.byType[type].totalCalls = new BigNumber(previousTotals.byType[type].totalCalls)
            .plus(typeStats.totalCalls || 0)
            .toNumber();
        });
      }
    });

    // Calculate growth rates
    const growth = {
      usageGrowth:
        previousTotals.totalUsage > 0
          ? new BigNumber(currentTotals.totalUsage)
              .minus(previousTotals.totalUsage)
              .div(previousTotals.totalUsage)
              .toNumber()
          : currentTotals.totalUsage > 0
            ? 1
            : 0,
      creditsGrowth:
        previousTotals.totalCredits > 0
          ? new BigNumber(currentTotals.totalCredits)
              .minus(previousTotals.totalCredits)
              .div(previousTotals.totalCredits)
              .toNumber()
          : currentTotals.totalCredits > 0
            ? 1
            : 0,
      callsGrowth:
        previousTotals.totalCalls > 0
          ? new BigNumber(currentTotals.totalCalls)
              .minus(previousTotals.totalCalls)
              .div(previousTotals.totalCalls)
              .toNumber()
          : currentTotals.totalCalls > 0
            ? 1
            : 0,
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
async function getUsageStatsHourlyOptimized(userDid: string, startTime: number, endTime: number) {
  try {
    // Generate hourly range from user's local time timestamps
    const hours = generateHourRangeFromTimestamps(startTime, endTime);

    // Get hourly stats using ModelCallStat (cached/precomputed)
    const hourlyStatsRaw = await Promise.all(hours.map((hour: number) => ModelCallStat.getHourlyStats(userDid, hour)));

    // Aggregate usage stats from hourly data
    const usageStats = {
      byType: {} as { [key: string]: { totalUsage: number; totalCalls: number } },
      totalCalls: 0,
    };

    let totalCredits = 0;
    let totalUsage = 0;
    const dailyStats: Array<{
      date: string;
      timestamp: number;
      byType: { [key: string]: { totalUsage: number; totalCalls: number } };
      totalCredits: number;
      totalCalls: number;
      totalUsage: number;
    }> = [];

    // Group hourly stats by date for dailyStats
    const dailyStatsMap = new Map<
      string,
      {
        byType: { [key: string]: { totalUsage: number; totalCalls: number } };
        totalCredits: number;
        totalCalls: number;
        totalUsage: number;
      }
    >();

    hourlyStatsRaw.forEach((hourStats: any, index: number) => {
      const hourTimestamp = hours[index]!;
      const date = new Date(hourTimestamp * 1000).toISOString().split('T')[0]!;

      // Aggregate for overall usageStats
      usageStats.totalCalls = new BigNumber(usageStats.totalCalls).plus(hourStats.totalCalls).toNumber();
      totalCredits = new BigNumber(totalCredits).plus(hourStats.totalCredits).toNumber();
      totalUsage = new BigNumber(totalUsage).plus(hourStats.totalUsage).toNumber();

      Object.entries(hourStats.byType).forEach(([type, typeStats]: [string, any]) => {
        if (!usageStats.byType[type]) {
          usageStats.byType[type] = { totalUsage: 0, totalCalls: 0 };
        }
        usageStats.byType[type].totalUsage = new BigNumber(usageStats.byType[type].totalUsage)
          .plus(typeStats.totalUsage)
          .toNumber();
        usageStats.byType[type].totalCalls = new BigNumber(usageStats.byType[type].totalCalls)
          .plus(typeStats.totalCalls)
          .toNumber();
      });

      // Group by date for dailyStats
      if (!dailyStatsMap.has(date)) {
        dailyStatsMap.set(date, {
          byType: {},
          totalCredits: 0,
          totalCalls: 0,
          totalUsage: 0,
        });
      }

      const dayData = dailyStatsMap.get(date)!;
      dayData.totalCalls = new BigNumber(dayData.totalCalls).plus(hourStats.totalCalls).toNumber();
      dayData.totalCredits = new BigNumber(dayData.totalCredits).plus(hourStats.totalCredits).toNumber();
      dayData.totalUsage = new BigNumber(dayData.totalUsage).plus(hourStats.totalUsage).toNumber();

      Object.entries(hourStats.byType).forEach(([type, typeStats]: [string, any]) => {
        if (!dayData.byType[type]) {
          dayData.byType[type] = { totalUsage: 0, totalCalls: 0 };
        }
        dayData.byType[type].totalUsage = new BigNumber(dayData.byType[type].totalUsage)
          .plus(typeStats.totalUsage)
          .toNumber();
        dayData.byType[type].totalCalls = new BigNumber(dayData.byType[type].totalCalls)
          .plus(typeStats.totalCalls)
          .toNumber();
      });
    });

    // Convert dailyStats map to array with timestamp for frontend filtering
    dailyStatsMap.forEach((dayData, date) => {
      const dayTimestamp = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
      dailyStats.push({
        date,
        timestamp: dayTimestamp,
        byType: dayData.byType,
        totalCredits: dayData.totalCredits,
        totalCalls: dayData.totalCalls,
        totalUsage: dayData.totalUsage,
      });
    });

    // Sort dailyStats by date
    dailyStats.sort((a, b) => a.date.localeCompare(b.date));

    return {
      usageStats,
      totalCredits,
      totalUsage,
      dailyStats,
    };
  } catch (error) {
    logger.error('Failed to get hourly optimized usage stats, falling back to legacy method:', error);
    throw error;
  }
}

export interface UsageCreditsQuery {
  startTime: string;
  endTime: string;
}

export interface CreditGrantsQuery {
  page?: number;
  pageSize?: number;
  start?: number;
  end?: number;
}

const creditGrantsSchema = Joi.object<CreditGrantsQuery>({
  page: Joi.number().integer().min(1).empty([null, '']),
  pageSize: Joi.number().integer().min(1).max(100).empty([null, '']),
  start: Joi.number().integer().min(0).empty([null, '']),
  end: Joi.number().integer().min(0).empty([null, '']),
});

export interface CreditTransactionsQuery {
  page?: number;
  pageSize?: number;
  start?: number;
  end?: number;
}

const creditTransactionsSchema = Joi.object<CreditTransactionsQuery>({
  page: Joi.number().integer().min(1).empty([null, '']),
  pageSize: Joi.number().integer().min(1).max(100).empty([null, '']),
  start: Joi.number().integer().min(0).empty([null, '']),
  end: Joi.number().integer().min(0).empty([null, '']),
});

export interface ModelCallsQuery {
  page?: number;
  pageSize?: number;
  startTime?: string;
  endTime?: string;
  search?: string;
  status?: 'success' | 'failed' | 'all';
  model?: string;
  providerId?: string;
}

const modelCallsSchema = Joi.object<ModelCallsQuery>({
  page: Joi.number().integer().min(1).empty([null, '']),
  pageSize: Joi.number().integer().min(1).max(100).empty([null, '']),
  startTime: Joi.string().pattern(/^\d+$/).empty([null, '']),
  endTime: Joi.string().pattern(/^\d+$/).empty([null, '']),
  search: Joi.string().max(100).empty([null, '']),
  status: Joi.string().valid('success', 'failed', 'all').empty([null, '']),
  model: Joi.string().max(100).empty([null, '']),
  providerId: Joi.string().max(100).empty([null, '']),
});

export interface UsageStatsQuery {
  startTime?: string;
  endTime?: string;
}

const usageStatsSchema = Joi.object<UsageStatsQuery>({
  startTime: Joi.string().pattern(/^\d+$/).required(),
  endTime: Joi.string().pattern(/^\d+$/).required(),
});

router.get('/credit/grants', user, async (req, res) => {
  try {
    const { page, pageSize, start, end } = await creditGrantsSchema.validateAsync(req.query, { stripUnknown: true });
    const customerId = req.user?.did;

    if (!customerId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const creditGrants = await getCreditGrants({
      customer_id: customerId,
      page,
      pageSize,
      start,
      end,
    });

    return res.json(creditGrants);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/credit/transactions', user, async (req, res) => {
  try {
    const {
      error,
      value: { page, pageSize, start, end },
    } = creditTransactionsSchema.validate(req.query, {
      stripUnknown: true,
    });
    if (error) {
      throw new CustomError(400, error.message);
    }
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const creditTransactions = await getCreditTransactions({
      customer_id: userDid,
      page,
      pageSize,
      start,
      end,
    });

    return res.json(creditTransactions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/credit/balance', user, async (req, res) => {
  try {
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const creditBalance = await getUserCredits({ userDid });
    return res.json(creditBalance);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/credit/payment-link', user, async (_, res) => {
  try {
    const creditPaymentLink = await getCreditPaymentLink();
    const shortUrl = creditPaymentLink ? await formatToShortUrl(creditPaymentLink) : creditPaymentLink;
    res.json(shortUrl);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/service/credit/balance', user, proxyToAIKit('/api/user/credit/balance', { useAIKitService: true }));

router.get('/service/credit/grants', user, proxyToAIKit('/api/user/credit/grants', { useAIKitService: true }));
router.get(
  '/service/credit/transactions',
  user,
  proxyToAIKit('/api/user/credit/transactions', { useAIKitService: true })
);

router.get(
  '/service/credit/payment-link',
  user,
  proxyToAIKit('/api/user/credit/payment-link', { useAIKitService: true })
);

router.get('/info', user, async (req, res) => {
  if (!req.user?.did) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const { user } = await blocklet.getUser(req.user?.did);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.avatar = user.avatar?.startsWith('/') ? joinURL(config.env.appUrl, user.avatar) : user.avatar;

  const userInfo = pick(user, ['did', 'fullName', 'email', 'avatar']);

  if (Config.creditBasedBillingEnabled) {
    if (!isPaymentRunning()) {
      return res.status(502).json({ error: 'Payment kit is not Running' });
    }
    const meter = await ensureMeter();
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const creditBalance = await getUserCredits({ userDid: req.user?.did });
    const paymentLink = await getCreditPaymentLink();
    const decimal = meter.paymentCurrency?.decimal || 0;

    const fullPaymentLink = withQuery(paymentLink || '', {
      ...getConnectQueryParam({ userDid: req.user?.did }),
    });
    const profileUrl = getCreditUsageLink(req.user?.did);

    const [shortPaymentLink, shortProfileLink] = await Promise.all([
      fullPaymentLink ? formatToShortUrl(fullPaymentLink) : null,
      profileUrl ? formatToShortUrl(profileUrl) : null,
    ]);

    return res.json({
      user: userInfo,
      creditBalance: {
        balance: fromUnitToToken(creditBalance.balance, decimal),
        total: fromUnitToToken(creditBalance.total, decimal),
        grantCount: creditBalance.grantCount,
        pendingCredit: fromUnitToToken(creditBalance.pendingCredit, decimal),
      },
      paymentLink: shortPaymentLink,
      currency: meter.paymentCurrency,
      enableCredit: true,
      profileLink: shortProfileLink,
    });
  }

  const profileUrl = getCreditUsageLink(req.user?.did);
  const shortProfileLink = profileUrl ? await formatToShortUrl(profileUrl) : null;

  return res.json({
    user: userInfo,
    creditBalance: null,
    paymentLink: null,
    enableCredit: false,
    profileLink: shortProfileLink,
  });
});

router.get('/model-calls', user, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      startTime,
      endTime,
      search,
      status,
      model,
      providerId,
    } = await modelCallsSchema.validateAsync(req.query, {
      stripUnknown: true,
    });
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const offset = (page - 1) * pageSize;
    const calls = await ModelCall.getCallsByDateRange({
      userDid,
      startTime: startTime ? parseInt(startTime, 10) : undefined,
      endTime: endTime ? parseInt(endTime, 10) : undefined,
      limit: pageSize,
      offset,
      search,
      status,
      model,
      providerId,
    });

    const uniqueAppDids = [
      ...new Set(calls.list.filter((call) => call.appDid && isValidDid(call.appDid)).map((call) => call.appDid!)),
    ];

    const appNameMap = new Map<string, { appName: string; appDid: string; appLogo: string; appUrl: string }>();
    if (uniqueAppDids.length) {
      await Promise.all(
        uniqueAppDids.map(async (appDid) => {
          const data = await getAppName(appDid);
          appNameMap.set(appDid, data);
        })
      );
    }

    const list = calls.list.map((call) => {
      if (call.appDid) {
        if (isValidDid(call.appDid)) {
          return {
            ...call.dataValues,
            appInfo: appNameMap.get(call.appDid),
          };
        }
      }

      return call.dataValues;
    });

    return res.json({
      count: calls.count,
      list,
      paging: {
        page,
        pageSize,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/model-calls/export', user, async (req, res) => {
  try {
    const { startTime, endTime, search, status, model, providerId } = await modelCallsSchema.validateAsync(req.query, {
      stripUnknown: true,
    });
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { list: calls } = await ModelCall.getCallsByDateRange({
      userDid,
      startTime: startTime ? Number(startTime) : undefined,
      endTime: endTime ? Number(endTime) : undefined,
      limit: 10000, // Get more data for export
      offset: 0,
      search,
      status,
      model,
      providerId,
    });

    // Convert to CSV format
    const csvData = calls.map((call) => ({
      timestamp: call.createdAt,
      requestId: call.id,
      model: call.model,
      provider: call.provider?.displayName || '-',
      type: call.type,
      status: call.status,
      inputTokens: call.usageMetrics?.inputTokens || 0,
      outputTokens: call.usageMetrics?.outputTokens || 0,
      totalUsage: call.totalUsage,
      credits: call.credits,
      duration: call.duration,
      errorReason: call.errorReason,
      appDid: call.appDid,
    }));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="model-calls-${new Date().toISOString().split('T')[0]}.csv"`
    );

    // Generate CSV content
    const csvHeaders =
      'Timestamp,Request ID,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration(ms),App DID\n';
    const csvRows = csvData
      .map(
        (row) =>
          `${row.timestamp},${row.requestId},${row.model},${row.provider},${row.type},${row.status},${row.inputTokens},${row.outputTokens},${row.totalUsage},${row.credits},${row.duration},${row.appDid || ''}`
      )
      .join('\n');

    return res.send(csvHeaders + csvRows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/usage-stats', user, async (req, res) => {
  try {
    const { startTime, endTime } = await usageStatsSchema.validateAsync(req.query, {
      stripUnknown: true,
    });
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const startTimeNum = startTime ? Number(startTime) : undefined;
    const endTimeNum = endTime ? Number(endTime) : undefined;

    if (!startTimeNum || !endTimeNum) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const { usageStats, totalCredits, dailyStats, totalUsage } = await getUsageStatsHourlyOptimized(
      userDid,
      startTimeNum,
      endTimeNum
    );

    // Get model stats (optimized query without JOIN)
    const modelStatsResult = await ModelCall.getModelUsageStats({
      userDid,
      startTime: startTimeNum,
      endTime: endTimeNum,
      limit: 5,
    });

    const trendComparison = await getTrendComparisonOptimized(userDid, startTimeNum, endTimeNum);

    return res.json({
      summary: {
        byType: usageStats.byType,
        totalCalls: usageStats.totalCalls,
        totalCredits,
        modelCount: modelStatsResult.totalModelCount,
        totalUsage,
      },
      dailyStats,
      modelStats: modelStatsResult.list,
      trendComparison,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/weekly-comparison', user, async (req, res) => {
  try {
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const comparison = await ModelCall.getWeeklyComparison(userDid);
    return res.json(comparison);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/monthly-comparison', user, async (req, res) => {
  try {
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const comparison = await ModelCall.getMonthlyComparison(userDid);
    return res.json(comparison);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/admin/user-stats', ensureAdmin, async (req, res) => {
  try {
    const { startTime, endTime } = await usageStatsSchema.validateAsync(pick(req.query, ['startTime', 'endTime']), {
      stripUnknown: true,
    });

    const userDid = req.query.userDid as string;
    if (!userDid) {
      return res.status(400).json({
        error: 'userDid is required',
      });
    }

    const startTimeNum = Number(startTime);
    const endTimeNum = Number(endTime);

    const { usageStats, totalCredits, dailyStats } = await getUsageStatsHourlyOptimized(
      userDid as string,
      startTimeNum,
      endTimeNum
    );

    const modelStatsResult = await ModelCall.getModelUsageStats({
      userDid: userDid as string,
      startTime: startTimeNum,
      endTime: endTimeNum,
      limit: 5,
    });

    const trendComparison = await getTrendComparisonOptimized(userDid as string, startTimeNum, endTimeNum);
    return res.json({
      userDid,
      dateRange: {
        startTime: startTimeNum,
        endTime: endTimeNum,
        startDate: new Date(startTimeNum * 1000).toISOString().split('T')[0],
        endDate: new Date(endTimeNum * 1000).toISOString().split('T')[0],
      },
      summary: {
        byType: usageStats.byType,
        totalCalls: usageStats.totalCalls,
        totalCredits,
        modelCount: modelStatsResult.totalModelCount,
      },
      dailyStats,
      modelStats: modelStatsResult.list,
      trendComparison,
      generatedBy: req.user?.did,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Admin query user stats failed:', error);
    return res.status(500).json({ message: error.message });
  }
});

// Admin interface: Recalculate user statistics (general rebuild interface)
router.post('/recalculate-stats', ensureAdmin, async (req, res) => {
  try {
    const { userDid, startTime, endTime, dryRun = false } = req.body;

    if (!userDid || !startTime || !endTime) {
      return res.status(400).json({
        error: 'userDid, startTime, endTime are required',
      });
    }

    const startTimeNum = Number(startTime);
    const endTimeNum = Number(endTime);

    if (Number.isNaN(startTimeNum) || Number.isNaN(endTimeNum)) {
      return res.status(400).json({
        error: 'startTime and endTime must be valid timestamps',
      });
    }

    // Generate hour list for recalculation
    const hours = generateHourRangeFromTimestamps(startTimeNum, endTimeNum);

    // Delete all stat cache in the specified time range (including day and hour types)
    const deleteConditions = {
      userDid,
      timestamp: {
        [Op.gte]: startTimeNum,
        [Op.lte]: endTimeNum,
      },
    };

    const existingStats = await ModelCallStat.findAll({
      where: deleteConditions,
      raw: true,
    });

    // Preview mode
    if (dryRun) {
      return res.json({
        message: 'Preview mode - will rebuild hourly data',
        userDid,
        willDeleteStats: existingStats.length,
        willRecalculateHours: hours.length,
      });
    }

    // Delete old cache and rebuild
    const deletedCount = await ModelCallStat.destroy({ where: deleteConditions });

    const results = await Promise.all(
      hours.map(async (hour) => {
        try {
          await ModelCallStat.getHourlyStats(userDid, hour);
          return true;
        } catch (error) {
          return false;
        }
      })
    );

    const successCount = results.filter(Boolean).length;
    const failedCount = results.length - successCount;

    return res.json({
      message: 'Rebuild completed',
      deleted: deletedCount,
      success: successCount,
      failed: failedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

// Cleanup daily data interface
router.post('/cleanup-daily-stats', ensureAdmin, async (req, res) => {
  try {
    const { userDid, startTime, endTime } = req.body;
    if (!userDid || !startTime || !endTime) {
      return res.status(400).json({ error: 'userDid, startTime, endTime are required' });
    }

    const deletedCount = await ModelCallStat.destroy({
      where: {
        userDid,
        timeType: 'day',
        timestamp: {
          [Op.gte]: Number(startTime),
          [Op.lte]: Number(endTime),
        },
      },
    });

    return res.json({
      message: 'Daily data cleanup completed',
      deleted: deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
