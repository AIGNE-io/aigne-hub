import { blocklet, getConnectQueryParam } from '@api/libs/auth';
import { Config } from '@api/libs/env';
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
import {
  generateHourRangeFromTimestamps,
  getAppName,
  getTrendComparisonOptimized,
  getUsageStatsHourlyOptimized,
  getUsageStatsHourlyOptimizedAdmin,
} from '@api/libs/user';
import ModelCall from '@api/store/models/model-call';
import ModelCallStat from '@api/store/models/model-call-stat';
import { isValid as isValidDid } from '@arcblock/did';
import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import { CustomError } from '@blocklet/error';
import config from '@blocklet/sdk/lib/config';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import { Router } from 'express';
import Joi from 'joi';
import { pick } from 'lodash';
import { Op } from 'sequelize';
import { joinURL, withQuery } from 'ufo';

const router = Router();

const user = sessionMiddleware({ accessKey: true });

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
  appDid?: string;
  allUsers?: boolean;
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
  appDid: Joi.string().optional().empty([null, '']),
  allUsers: Joi.boolean().optional().empty([null, '']),
});

export interface UsageStatsQuery {
  startTime?: string;
  endTime?: string;
  allUsers?: boolean;
}

const usageStatsSchema = Joi.object<UsageStatsQuery>({
  startTime: Joi.string().pattern(/^\d+$/).required(),
  endTime: Joi.string().pattern(/^\d+$/).required(),
  allUsers: Joi.boolean().optional().empty([null, '']),
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

router.get(
  '/model-calls',
  user,
  async (req, res, next) => {
    const { allUsers } = await modelCallsSchema.validateAsync(req.query, { stripUnknown: true });

    if (allUsers) {
      const list = ['admin', 'owner'];
      if (req.user?.role && !list.includes(req.user?.role)) {
        return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
      }
    }

    return next();
  },
  async (req, res) => {
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
        appDid,
        allUsers,
      } = await modelCallsSchema.validateAsync(req.query, { stripUnknown: true });

      const userDid = req.user?.did;
      if (!userDid) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const offset = (page - 1) * pageSize;

      const calls = await ModelCall.getCallsByDateRange({
        userDid: allUsers ? undefined : userDid,
        startTime: startTime ? parseInt(startTime, 10) : undefined,
        endTime: endTime ? parseInt(endTime, 10) : undefined,
        limit: pageSize,
        offset,
        search,
        status,
        model,
        providerId,
        appDid,
      });

      const uniqueAppDids = [
        ...new Set(calls.list.filter((call) => call.appDid && isValidDid(call.appDid)).map((call) => call.appDid!)),
      ];
      const uniqueUserDids = [...new Set(calls.list.map((call) => call.userDid))];

      const appNameMap = new Map<string, { appName: string; appDid: string; appLogo: string; appUrl: string }>();
      const userInfoMap = new Map<string, { did: string; fullName: string; email: string; avatar?: string }>();

      await Promise.all([
        ...uniqueAppDids.map(async (appDid) => {
          const data = await getAppName(appDid);
          appNameMap.set(appDid, data);
        }),
        ...uniqueUserDids.map(async (userDid) => {
          try {
            const { user } = await blocklet.getUser(userDid);
            if (user) {
              user.avatar = user.avatar?.startsWith('/') ? joinURL(config.env.appUrl, user.avatar) : user.avatar;
              userInfoMap.set(userDid, pick(user, ['did', 'fullName', 'email', 'avatar']));
            }
          } catch (error) {
            userInfoMap.set(userDid, { did: userDid, fullName: 'Unknown User', email: '' });
          }
        }),
      ]);

      const list = calls.list.map((call) => {
        const result: any = { ...call.dataValues };

        if (call.appDid && isValidDid(call.appDid)) {
          result.appInfo = appNameMap.get(call.appDid);
        }

        result.userInfo = userInfoMap.get(call.userDid);

        return result;
      });

      return res.json({
        count: calls.count,
        list,
        paging: { page, pageSize },
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

router.get(
  '/model-calls/export',
  user,
  async (req, res, next) => {
    const { allUsers } = await modelCallsSchema.validateAsync(req.query, { stripUnknown: true });

    if (allUsers) {
      const list = ['admin', 'owner'];
      if (req.user?.role && !list.includes(req.user?.role)) {
        return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
      }
    }

    return next();
  },
  async (req, res) => {
    try {
      const { startTime, endTime, search, status, model, providerId, appDid, allUsers } =
        await modelCallsSchema.validateAsync(req.query, { stripUnknown: true });

      const userDid = req.user?.did;
      if (!userDid) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { list: calls } = await ModelCall.getCallsByDateRange({
        userDid: allUsers ? undefined : userDid,
        startTime: startTime ? Number(startTime) : undefined,
        endTime: endTime ? Number(endTime) : undefined,
        limit: 10000,
        offset: 0,
        search,
        status,
        model,
        providerId,
        appDid,
      });

      const uniqueUserDids = [...new Set(calls.map((call) => call.userDid))];
      const userInfoMap = new Map<string, { did: string; fullName: string; email: string }>();

      await Promise.all(
        uniqueUserDids.map(async (userDid) => {
          try {
            const { user } = await blocklet.getUser(userDid);
            if (user) {
              userInfoMap.set(userDid, pick(user, ['did', 'fullName', 'email']));
            }
          } catch (error) {
            userInfoMap.set(userDid, { did: userDid, fullName: 'Unknown User', email: '' });
          }
        })
      );

      const csvData = calls.map((call) => {
        const userInfo = userInfoMap.get(call.userDid);

        return {
          timestamp: call.createdAt,
          requestId: call.id,
          userDid: call.userDid,
          userName: userInfo?.fullName || 'Unknown User',
          userEmail: userInfo?.email || '',
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
        };
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="model-calls-${new Date().toISOString().split('T')[0]}.csv"`
      );

      const csvHeaders =
        'Timestamp,Request ID,User DID,User Name,User Email,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration(ms),App DID\n';
      const csvRows = csvData
        .map(
          (row) =>
            `${row.timestamp},${row.requestId},${row.userDid},${row.userName},${row.userEmail},${row.model},${row.provider},${row.type},${row.status},${row.inputTokens},${row.outputTokens},${row.totalUsage},${row.credits},${row.duration},${row.appDid || ''}`
        )
        .join('\n');

      return res.send(csvHeaders + csvRows);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

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

    const trendComparison = await getTrendComparisonOptimized({
      userDid,
      startTime: startTimeNum,
      endTime: endTimeNum,
    });

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

router.get('/admin/user-stats', user, ensureAdmin, async (req, res) => {
  try {
    const { startTime, endTime } = await usageStatsSchema.validateAsync(req.query, { stripUnknown: true });
    const userDid = req.user?.did;

    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const startTimeNum = startTime ? Number(startTime) : undefined;
    const endTimeNum = endTime ? Number(endTime) : undefined;

    if (!startTimeNum || !endTimeNum) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const { usageStats, totalCredits, dailyStats, totalUsage } = await getUsageStatsHourlyOptimizedAdmin(
      startTimeNum,
      endTimeNum
    );

    const modelStatsResult = await ModelCall.getModelUsageStats({
      startTime: startTimeNum,
      endTime: endTimeNum,
      limit: 5,
    });

    const trendComparison = await getTrendComparisonOptimized({ startTime: startTimeNum, endTime: endTimeNum });

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
