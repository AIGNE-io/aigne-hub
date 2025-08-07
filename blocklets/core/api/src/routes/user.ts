import { blocklet, getConnectQueryParam } from '@api/libs/auth';
import { Config } from '@api/libs/env';
import {
  ensureMeter,
  getCreditGrants,
  getCreditPaymentLink,
  getCreditTransactions,
  getUserCredits,
  getUserProfileLink,
  isPaymentRunning,
} from '@api/libs/payment';
import ModelCall from '@api/store/models/model-call';
import { proxyToAIKit } from '@blocklet/aigne-hub/api/call';
import { CustomError } from '@blocklet/error';
import config from '@blocklet/sdk/lib/config';
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import { Router } from 'express';
import Joi from 'joi';
import { pick } from 'lodash';
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
}

const modelCallsSchema = Joi.object<ModelCallsQuery>({
  page: Joi.number().integer().min(1).empty([null, '']),
  pageSize: Joi.number().integer().min(1).max(100).empty([null, '']),
  startTime: Joi.date().iso().empty([null, '']),
  endTime: Joi.date().iso().empty([null, '']),
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
  startTime: Joi.date().iso().empty([null, '']),
  endTime: Joi.date().iso().empty([null, '']),
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
      profileLink: getUserProfileLink(req.user?.did),
    });
  }
  return res.json({
    user: userInfo,
    creditBalance: null,
    paymentLink: null,
    enableCredit: false,
    profileLink: getUserProfileLink(req.user?.did),
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
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      limit: pageSize,
      offset,
      search,
      status,
      model,
      providerId,
    });

    return res.json({
      data: calls,
      pagination: {
        page,
        pageSize,
        total: calls.length,
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

    const calls = await ModelCall.getCallsByDateRange({
      userDid,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
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
      provider: call.providerId,
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
      'Timestamp,Request ID,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration,Error Reason,App DID\n';
    const csvRows = csvData
      .map(
        (row) =>
          `${row.timestamp},${row.requestId},${row.model},${row.provider},${row.type},${row.status},${row.inputTokens},${row.outputTokens},${row.totalUsage},${row.credits},${row.duration},${row.errorReason || ''},${row.appDid || ''}`
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

    const [usageStats, totalCredits, dailyStats, modelStats] = await Promise.all([
      ModelCall.getUsageStatsByDateRange({
        userDid,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
      }),
      ModelCall.getTotalCreditsByDateRange({
        userDid,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
      }),
      ModelCall.getDailyUsageStats({
        userDid,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
      }),
      ModelCall.getModelUsageStats({
        userDid,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        limit: 10,
      }),
    ]);

    return res.json({
      summary: {
        byType: usageStats.byType,
        totalCalls: usageStats.totalCalls,
        totalCredits,
      },
      dailyStats,
      modelStats,
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
