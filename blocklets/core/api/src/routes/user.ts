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
import ModelCall from '@api/store/models/model-call';
import ModelCallStat from '@api/store/models/model-call-stat';
import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import { CustomError } from '@blocklet/error';
import config from '@blocklet/sdk/lib/config';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import BigNumber from 'bignumber.js';
import { Router } from 'express';
import Joi from 'joi';
import { pick } from 'lodash';
import { joinURL, withQuery } from 'ufo';

const router = Router();

const user = sessionMiddleware({ accessKey: true });

interface TrendComparisonResult {
  current: { totalUsage: number; totalCredits: number; totalCalls: number };
  previous: { totalUsage: number; totalCredits: number; totalCalls: number };
  growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
}

// Helper function to generate date strings from timestamp range
function generateDateRangeFromTimestamps(startTime: number, endTime: number): string[] {
  const dates: string[] = [];
  const startDate = new Date(startTime * 1000);
  const endDate = new Date(endTime * 1000);

  // Use local date methods to avoid timezone conversion issues
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const startDay = startDate.getDate();

  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();
  const endDay = endDate.getDate();

  // Create date objects for comparison using local date
  const currentDate = new Date(startYear, startMonth, startDay);
  const endDateLocal = new Date(endYear, endMonth, endDay);

  while (currentDate <= endDateLocal) {
    // Format date as YYYY-MM-DD without timezone conversion
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    dates.push(dateStr);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

// Optimized trend comparison using ModelCallStat
async function getTrendComparisonOptimized(
  userDid: string,
  startTime: number,
  endTime: number
): Promise<TrendComparisonResult | null> {
  const periodDuration = endTime - startTime;
  const previousEnd = startTime - 1;
  const previousStart = previousEnd - periodDuration;

  // Generate date ranges using improved method
  const currentDates = generateDateRangeFromTimestamps(startTime, endTime);
  const previousDates = generateDateRangeFromTimestamps(previousStart, previousEnd);

  try {
    // Get daily stats using ModelCallStat (cached/precomputed)
    const [currentDailyStats, previousDailyStats] = await Promise.all([
      Promise.all(currentDates.map((date: string) => ModelCallStat.getDailyStats(userDid, date))),
      Promise.all(previousDates.map((date: string) => ModelCallStat.getDailyStats(userDid, date))),
    ]);

    // Aggregate current period stats
    const currentTotals = {
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      byType: {} as { [key: string]: { totalUsage: number; totalCalls: number } },
    };

    currentDailyStats.forEach((dayStats: any) => {
      currentTotals.totalUsage = new BigNumber(currentTotals.totalUsage).plus(dayStats.totalUsage).toNumber();
      currentTotals.totalCredits = new BigNumber(currentTotals.totalCredits).plus(dayStats.totalCredits).toNumber();
      currentTotals.totalCalls = new BigNumber(currentTotals.totalCalls).plus(dayStats.totalCalls).toNumber();

      Object.entries(dayStats.byType).forEach(([type, typeStats]: [string, any]) => {
        if (!currentTotals.byType[type]) {
          currentTotals.byType[type] = { totalUsage: 0, totalCalls: 0 };
        }
        currentTotals.byType[type].totalUsage = new BigNumber(currentTotals.byType[type].totalUsage)
          .plus(typeStats.totalUsage)
          .toNumber();
        currentTotals.byType[type].totalCalls = new BigNumber(currentTotals.byType[type].totalCalls)
          .plus(typeStats.totalCalls)
          .toNumber();
      });
    });

    // Aggregate previous period stats
    const previousTotals = {
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      byType: {} as { [key: string]: { totalUsage: number; totalCalls: number } },
    };

    previousDailyStats.forEach((dayStats: any) => {
      previousTotals.totalUsage = new BigNumber(previousTotals.totalUsage).plus(dayStats.totalUsage).toNumber();
      previousTotals.totalCredits = new BigNumber(previousTotals.totalCredits).plus(dayStats.totalCredits).toNumber();
      previousTotals.totalCalls = new BigNumber(previousTotals.totalCalls).plus(dayStats.totalCalls).toNumber();

      Object.entries(dayStats.byType).forEach(([type, typeStats]: [string, any]) => {
        if (!previousTotals.byType[type]) {
          previousTotals.byType[type] = { totalUsage: 0, totalCalls: 0 };
        }
        previousTotals.byType[type].totalUsage = new BigNumber(previousTotals.byType[type].totalUsage)
          .plus(typeStats.totalUsage)
          .toNumber();
        previousTotals.byType[type].totalCalls = new BigNumber(previousTotals.byType[type].totalCalls)
          .plus(typeStats.totalCalls)
          .toNumber();
      });
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

// Optimized usage stats using ModelCallStat
async function getUsageStatsOptimized(userDid: string, startTime?: number, endTime?: number) {
  if (!startTime || !endTime) {
    // Fall back to ModelCall for incomplete date ranges
    return {
      usageStats: await ModelCall.getUsageStatsByDateRange({ userDid, startTime, endTime }),
      totalCredits: await ModelCall.getTotalCreditsByDateRange({ userDid, startTime, endTime }),
      dailyStats: await ModelCall.getDailyUsageStats({ userDid, startTime, endTime }),
    };
  }

  // Generate date range using improved method
  const dates = generateDateRangeFromTimestamps(startTime, endTime);

  try {
    // Get daily stats using ModelCallStat (cached/precomputed)
    const dailyStatsRaw = await Promise.all(dates.map((date: string) => ModelCallStat.getDailyStats(userDid, date)));

    // Aggregate usage stats
    const usageStats = {
      byType: {} as { [key: string]: { totalUsage: number; totalCalls: number } },
      totalCalls: 0,
    };

    let totalCredits = 0;
    const dailyStats: Array<{
      date: string;
      byType: { [key: string]: { totalUsage: number; totalCalls: number } };
      totalCredits: number;
      totalCalls: number;
    }> = [];

    dailyStatsRaw.forEach((dayStats: any, index: number) => {
      const date = dates[index]!;

      // Aggregate for usageStats
      usageStats.totalCalls = new BigNumber(usageStats.totalCalls).plus(dayStats.totalCalls).toNumber();
      totalCredits = new BigNumber(totalCredits).plus(dayStats.totalCredits).toNumber();

      Object.entries(dayStats.byType).forEach(([type, typeStats]: [string, any]) => {
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

      // Build dailyStats
      dailyStats.push({
        date,
        byType: dayStats.byType,
        totalCredits: dayStats.totalCredits,
        totalCalls: dayStats.totalCalls,
      });
    });

    return {
      usageStats,
      totalCredits,
      dailyStats,
    };
  } catch (error) {
    console.warn('Failed to get optimized usage stats, falling back to ModelCall:', error);
    // Fall back to ModelCall on error
    return {
      usageStats: await ModelCall.getUsageStatsByDateRange({ userDid, startTime, endTime }),
      totalCredits: await ModelCall.getTotalCreditsByDateRange({ userDid, startTime, endTime }),
      dailyStats: await ModelCall.getDailyUsageStats({ userDid, startTime, endTime }),
    };
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
  startTime: Joi.string().pattern(/^\d+$/).empty([null, '']),
  endTime: Joi.string().pattern(/^\d+$/).empty([null, '']),
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
    res.json(creditPaymentLink);
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
    return res.json({
      user: userInfo,
      creditBalance: {
        balance: fromUnitToToken(creditBalance.balance, decimal),
        total: fromUnitToToken(creditBalance.total, decimal),
        grantCount: creditBalance.grantCount,
        pendingCredit: fromUnitToToken(creditBalance.pendingCredit, decimal),
      },
      paymentLink: withQuery(paymentLink || '', {
        ...getConnectQueryParam({ userDid: req.user?.did }),
      }),
      currency: meter.paymentCurrency,
      enableCredit: true,
      profileLink: getCreditUsageLink(req.user?.did),
    });
  }
  return res.json({
    user: userInfo,
    creditBalance: null,
    paymentLink: null,
    enableCredit: false,
    profileLink: getCreditUsageLink(req.user?.did),
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

    return res.json({
      count: calls.count,
      list: calls.list,
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
      limit: 10000, // 导出时获取更多数据
      offset: 0,
      search,
      status,
      model,
      providerId,
    });

    // 转换为CSV格式
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

    // 生成CSV内容
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

    // Use optimized version when we have complete date range
    const { usageStats, totalCredits, dailyStats } = await getUsageStatsOptimized(userDid, startTimeNum, endTimeNum);

    // Get model stats separately (still using ModelCall as it needs complex joins)
    const modelStats = await ModelCall.getModelUsageStats({
      userDid,
      startTime: startTimeNum,
      endTime: endTimeNum,
      limit: 5,
    });

    // Calculate trend comparison if we have both start and end times
    let trendComparison = null;
    if (startTimeNum && endTimeNum) {
      trendComparison = await getTrendComparisonOptimized(userDid, startTimeNum, endTimeNum);
    }

    return res.json({
      summary: {
        byType: usageStats.byType,
        totalCalls: usageStats.totalCalls,
        totalCredits,
      },
      dailyStats,
      modelStats,
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

export default router;
