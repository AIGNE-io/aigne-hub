import { CustomError } from '@blocklet/error';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { Router } from 'express';

import { getCreditTransactions, getUserCredits } from '../libs/payment';
import logger from '../libs/logger';
import ModelCall from '../store/models/model-call';
import ModelCallStat from '../store/models/model-call-stat';

const router = Router();

// Session middleware for authenticated routes
const user = sessionMiddleware({ accessKey: true });

/**
 * Helper to get time range from query params
 */
function getTimeRange(query: any, defaultDays = 30) {
  const timeRange = parseInt(query.timeRange as string, 10) || defaultDays;
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - timeRange * 24 * 3600;
  return { startTime, endTime, timeRange };
}

/**
 * GET /api/usage/quota
 * Get user's credit quota information
 */
router.get('/quota', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const credits = await getUserCredits({ userDid });
    const { startTime, endTime } = getTimeRange(req.query, 30);

    // Calculate estimated days remaining based on recent usage
    const stats = await ModelCallStat.getAggregatedStats(userDid, null, startTime, endTime);
    const daysInRange = 30;
    const dailyAvgCredits = stats.totalCredits / daysInRange;

    const remaining = parseFloat(credits.balance || '0');
    const estimatedDaysRemaining =
      dailyAvgCredits > 0 ? Math.floor(remaining / dailyAvgCredits) : remaining > 0 ? 999 : 0;

    return res.json({
      total: parseFloat(credits.total || '0'),
      remaining,
      used: parseFloat(credits.total || '0') - remaining,
      pendingCredit: parseFloat(credits.pendingCredit || '0'),
      estimatedDaysRemaining,
      currency: credits.currency,
    });
  } catch (error: any) {
    logger.error('Failed to get quota', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/overview
 * Get user's overall usage statistics (from pre-aggregated data)
 */
router.get('/overview', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startTime, endTime } = getTimeRange(req.query);

    const stats = await ModelCallStat.getAggregatedStats(userDid, null, startTime, endTime);

    return res.json({
      totalCalls: stats.totalCalls,
      totalTokens: stats.totalUsage,
      totalCredits: stats.totalCredits,
      successRate: stats.totalCalls > 0 ? (stats.successCalls / stats.totalCalls) * 100 : 0,
      avgDuration: stats.avgDuration || 0,
    });
  } catch (error: any) {
    logger.error('Failed to get overview', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/projects
 * Get list of user's projects with statistics
 */
router.get('/projects', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startTime, endTime } = getTimeRange(req.query);

    const projects = await ModelCallStat.getProjects(userDid, startTime, endTime);

    return res.json({
      projects: projects.map((p) => ({
        appDid: p.appDid,
        totalCalls: p.stats.totalCalls,
        totalCredits: p.stats.totalCredits,
        successRate: p.stats.totalCalls > 0 ? (p.stats.successCalls / p.stats.totalCalls) * 100 : 0,
        lastCallTime: p.lastCallTime,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to get projects', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/trends
 * Get usage trends over time
 */
router.get('/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startTime, endTime, timeRange } = getTimeRange(req.query);
    // Auto-select granularity based on time range
    const granularity = (req.query.granularity as 'hour' | 'day') || (timeRange <= 7 ? 'hour' : 'day');

    const trends = await ModelCallStat.getTrends(userDid, null, startTime, endTime, granularity);

    return res.json({
      trends: trends.map((t) => ({
        timestamp: t.timestamp,
        calls: t.stats.totalCalls,
        successRate: t.stats.totalCalls > 0 ? (t.stats.successCalls / t.stats.totalCalls) * 100 : 0,
        avgDuration: t.stats.avgDuration || 0,
        totalCredits: t.stats.totalCredits,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to get trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/quota-details
 * Get credit transaction details (from payment-kit)
 * NOTE: This endpoint is implemented last as it depends on payment-kit API
 */
router.get('/quota-details', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

    const transactions = await getCreditTransactions({
      customer_id: userDid,
      page,
      pageSize,
    });

    return res.json({
      list: (transactions.list || []).map((t: any) => ({
        id: t.id,
        amount: parseFloat(t.amount || '0'),
        type: t.type || 'unknown',
        createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
        description: t.description || '',
        metadata: t.metadata,
      })),
      count: transactions.count || 0,
      page,
      pageSize,
    });
  } catch (error: any) {
    logger.error('Failed to get quota details', { error, userDid: req.user?.did });
    // Return empty result if payment-kit is not available
    return res.json({
      list: [],
      count: 0,
      page: parseInt(req.query.page as string, 10) || 1,
      pageSize: parseInt(req.query.pageSize as string, 10) || 20,
    });
  }
});

/**
 * GET /api/usage/projects/:appDid/stats
 * Get statistics for a specific project
 */
router.get('/projects/:appDid/stats', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appDid } = req.params;
    const startTime = parseInt(req.query.startTime as string, 10) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const endTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);

    // Permission check: ensure appDid belongs to current user
    const accessCheck = await ModelCall.findOne({
      where: { userDid, appDid },
    });
    if (!accessCheck) {
      throw new CustomError(403, 'Access denied');
    }

    const stats = await ModelCallStat.getAggregatedStats(userDid, appDid, startTime, endTime);

    return res.json({
      appDid,
      totalCalls: stats.totalCalls,
      totalTokens: stats.totalUsage,
      totalCredits: stats.totalCredits,
      successRate: stats.totalCalls > 0 ? (stats.successCalls / stats.totalCalls) * 100 : 0,
      avgDuration: stats.avgDuration || 0,
      p95Duration: stats.p95Duration || 0,
    });
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    logger.error('Failed to get project stats', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/projects/:appDid/trends
 * Get trends for a specific project
 */
router.get('/projects/:appDid/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appDid } = req.params;
    const startTime = parseInt(req.query.startTime as string, 10) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const endTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);
    const granularity = (req.query.granularity as 'hour' | 'day') || 'day';

    // Permission check
    const accessCheck = await ModelCall.findOne({
      where: { userDid, appDid },
    });
    if (!accessCheck) {
      throw new CustomError(403, 'Access denied');
    }

    const trends = await ModelCallStat.getTrends(userDid, appDid, startTime, endTime, granularity);

    return res.json({
      trends: trends.map((t) => ({
        timestamp: t.timestamp,
        calls: t.stats.totalCalls,
        avgDuration: t.stats.avgDuration || 0,
        totalCredits: t.stats.totalCredits,
      })),
    });
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    logger.error('Failed to get project trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/projects/:appDid/models
 * Get model distribution for a specific project
 */
router.get('/projects/:appDid/models', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appDid } = req.params;
    const startTime = parseInt(req.query.startTime as string, 10) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const endTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);

    // Permission check
    const accessCheck = await ModelCall.findOne({
      where: { userDid, appDid },
    });
    if (!accessCheck) {
      throw new CustomError(403, 'Access denied');
    }

    const modelDistribution = await ModelCallStat.getModelDistribution(userDid, appDid, startTime, endTime);

    return res.json({
      modelDistribution,
    });
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    logger.error('Failed to get model distribution', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/projects/:appDid/calls
 * Get call history for a specific project (real-time query with pagination)
 */
router.get('/projects/:appDid/calls', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appDid } = req.params;
    const startTime = parseInt(req.query.startTime as string, 10) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const endTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 20, 100);
    const model = req.query.model as string | undefined;
    const status = req.query.status as string | undefined;

    // Permission check
    const accessCheck = await ModelCall.findOne({
      where: { userDid, appDid },
    });
    if (!accessCheck) {
      throw new CustomError(403, 'Access denied');
    }

    // Build query params
    const queryParams: any = {
      userDid,
      appDid,
      startTime,
      endTime,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };

    if (model) {
      queryParams.model = model;
    }
    if (status && ['success', 'failed', 'processing'].includes(status)) {
      queryParams.status = status;
    }

    const calls = await ModelCall.getCallsByDateRange(queryParams);

    return res.json({
      list: calls.list.map((call: any) => ({
        id: call.id,
        callTime: call.callTime,
        model: call.model,
        type: call.type,
        status: call.status,
        duration: call.duration,
        totalUsage: call.totalUsage,
        credits: parseFloat(call.credits || '0'),
        errorReason: call.errorReason,
      })),
      count: calls.count,
      page,
      pageSize,
    });
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    logger.error('Failed to get call history', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

export default router;
