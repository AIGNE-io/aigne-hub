import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import { Router } from 'express';
import Joi from 'joi';

import { createModelCallStats } from '../crons/model-call-stats';
import { normalizeProjectAppDid } from '../libs/env';
import logger from '../libs/logger';
import { getUserCredits } from '../libs/payment';
import { pushProjectFetchJob } from '../queue/projects';
import ModelCall from '../store/models/model-call';
import ModelCallStat from '../store/models/model-call-stat';
import Project from '../store/models/project';

const router = Router();
const user = sessionMiddleware({ accessKey: true });

// Common schema components
const timestampSchema = Joi.number().integer().positive();
const paginationSchema = {
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
};

// Time range schema with defaults
const timeRangeSchema = {
  startTime: timestampSchema,
  endTime: timestampSchema,
  timeRange: Joi.number().integer().min(1).default(30),
  timezoneOffset: Joi.number().integer().allow(null),
};

// Common query schemas
const baseQuerySchema = Joi.object({
  ...timeRangeSchema,
  allUsers: Joi.boolean().default(false),
});

const projectTrendsSchema = baseQuerySchema.keys({
  appDid: Joi.string().required(),
  granularity: Joi.string().valid('hour', 'day'),
});

const projectCallsSchema = baseQuerySchema.keys({
  appDid: Joi.string().required(),
  ...paginationSchema,
  model: Joi.string(),
  type: Joi.string(),
  status: Joi.string().valid('success', 'failed', 'processing'),
  search: Joi.string().trim(),
  searchFields: Joi.string(),
  minDurationSeconds: Joi.number().min(0),
});

const projectsListSchema = baseQuerySchema.keys({
  ...paginationSchema,
  sortBy: Joi.string().valid('totalCalls', 'totalCredits').default('totalCalls'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const backfillSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  userDid: Joi.string().allow(null, ''),
});

// Helper to process time range
function processTimeRange(params: any) {
  const now = Math.floor(Date.now() / 1000);
  let { startTime, endTime } = params;
  const { timeRange = 30 } = params;

  endTime = endTime ? Math.min(endTime, now) : now;
  startTime = startTime || endTime - timeRange * 86400;

  const rangeDays = Math.max(1, Math.ceil((endTime - startTime) / 86400));
  const granularity = rangeDays <= 1 ? 'hour' : 'day';

  return { startTime, endTime, rangeDays, granularity };
}

// Helper to get scoped user DID based on allUsers flag
function getScopedUserDid(req: any, allUsers: boolean): string | null {
  return allUsers ? null : req.user?.did;
}

// Middleware to check admin permission for allUsers flag
function checkAllUsersPermission(req: any, res: any, allUsers: boolean): boolean {
  if (!allUsers) return true;
  const role = req.user?.role;
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
    return false;
  }
  return true;
}

function isAdminRole(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

// GET /api/usage/quota
router.get('/quota', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });

    const { startTime, endTime } = processTimeRange(req.query);
    const credits = await getUserCredits({ userDid });
    const stats = await ModelCallStat.getStatsByCalls(userDid, undefined, startTime, endTime);

    const decimal = credits.currency?.decimal || 0;
    const remaining = parseFloat(fromUnitToToken(credits.balance || '0', decimal));
    const total = parseFloat(fromUnitToToken(credits.total || '0', decimal));
    const pendingCredit = parseFloat(fromUnitToToken(credits.pendingCredit || '0', decimal));
    const dailyAvgCredits = stats.totalCredits / 30;
    const estimatedDaysRemaining =
      dailyAvgCredits > 0 && remaining > 0
        ? Math.max(1, Math.floor(remaining / dailyAvgCredits))
        : remaining > 0
          ? 999
          : 0;

    return res.json({
      total,
      remaining,
      used: total - remaining,
      pendingCredit,
      estimatedDaysRemaining,
      dailyAvgCredits,
      currency: credits.currency,
    });
  } catch (error: any) {
    logger.error('Failed to get quota', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/usage/projects
router.get('/projects', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });

    const params = await projectsListSchema.validateAsync(req.query);
    if (!checkAllUsersPermission(req, res, params.allUsers)) return;

    const { startTime, endTime, rangeDays } = processTimeRange(params);

    const result = await ModelCallStat.getProjects(getScopedUserDid(req, params.allUsers), startTime, endTime, {
      page: params.page,
      pageSize: params.pageSize,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      rangeDays,
      timezoneOffset: params.timezoneOffset,
    });

    return res.json({
      projects: result.projects.map((p) => ({
        appDid: p.appDid,
        appName: p.appName,
        appLogo: p.appLogo,
        appUrl: p.appUrl,
        totalCalls: p.stats.totalCalls,
        totalCredits: p.stats.totalCredits,
        avgDuration: p.stats.avgDuration || 0,
        successRate: p.stats.totalCalls > 0 ? (p.stats.successCalls / p.stats.totalCalls) * 100 : 0,
        lastCallTime: p.lastCallTime,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (error: any) {
    logger.error('Failed to get projects', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/usage/projects/group-trends
router.get('/projects/group-trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });

    const params = await baseQuerySchema.validateAsync(req.query);
    if (!checkAllUsersPermission(req, res, params.allUsers)) return;

    const { startTime, endTime, granularity } = processTimeRange(params);

    const result = await ModelCallStat.getTrendGroupByProjects({
      userDid: getScopedUserDid(req, params.allUsers),
      startTime,
      endTime,
      granularity,
      timezoneOffset: params.timezoneOffset,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Failed to get project trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/usage/trends (admin only)
router.get('/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
    }

    const params = await baseQuerySchema.validateAsync(req.query);
    const { startTime, endTime, granularity } = processTimeRange(params);

    const trends = await ModelCallStat.getGlobalTrends(startTime, endTime, granularity, params.timezoneOffset);

    return res.json({
      trends: trends.map((t) => ({
        timestamp: t.timestamp,
        calls: t.stats.totalCalls,
        successCalls: t.stats.successCalls,
        successRate: t.stats.totalCalls > 0 ? (t.stats.successCalls / t.stats.totalCalls) * 100 : 0,
        avgDuration: t.stats.avgDuration || 0,
        totalCredits: t.stats.totalCredits,
        totalUsage: t.stats.totalUsage,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to get trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

// POST /api/usage/stats/backfill (admin only)
router.post('/stats/backfill', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
    }

    const params = await backfillSchema.validateAsync({ ...req.body, ...req.query });
    const safeStart = Math.min(params.startDate.getTime(), params.endDate.getTime());
    const safeEnd = Math.max(params.startDate.getTime(), params.endDate.getTime());
    const normalizedUserDid = params.userDid?.trim() || null;

    const startDay = Math.floor(safeStart / 1000 / 86400) * 86400;
    const endDay = Math.floor(safeEnd / 1000 / 86400) * 86400;
    const ranges: Array<{ startTime: number; endTime: number }> = [];

    for (let day = startDay; day <= endDay; day += 86400) {
      ranges.push({ startTime: day, endTime: day + 86399 });
      await createModelCallStats(day, day + 86399, normalizedUserDid, true);
    }

    return res.json({ processed: ranges.length * 24, ranges });
  } catch (error: any) {
    logger.error('Failed to backfill stats', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/usage/projects/trends
router.get('/projects/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });

    const params = await projectTrendsSchema.validateAsync(req.query);
    if (!checkAllUsersPermission(req, res, params.allUsers)) return;

    const appDid = normalizeProjectAppDid(params.appDid);
    const { startTime, endTime, granularity } = processTimeRange(params);

    const trendBuckets = await ModelCallStat.getProjectTrends(
      getScopedUserDid(req, params.allUsers),
      [appDid],
      startTime,
      endTime,
      granularity,
      params.timezoneOffset
    );

    const emptyStats = ModelCallStat.getEmptyStats();
    const trends = trendBuckets.map((bucket) => ({
      timestamp: bucket.timestamp,
      stats: bucket.byProject[appDid as string] || emptyStats,
    }));

    const project = appDid ? await Project.getByAppDid(appDid) : null;
    if (!project && appDid) pushProjectFetchJob(appDid);

    return res.json({
      project: {
        appDid,
        appName: project?.appName || appDid || undefined,
        appLogo: project?.appLogo || undefined,
        appUrl: project?.appUrl || undefined,
      },
      trends: trends.map((t) => ({
        timestamp: t.timestamp,
        calls: t.stats.totalCalls,
        successCalls: t.stats.successCalls,
        avgDuration: t.stats.avgDuration || 0,
        totalCredits: t.stats.totalCredits,
        totalUsage: t.stats.totalUsage,
      })),
    });
  } catch (error: any) {
    if (error.status === 403) return res.status(403).json({ error: 'Access denied' });
    logger.error('Failed to get project trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/usage/projects/calls
router.get('/projects/calls', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) return res.status(401).json({ error: 'Unauthorized' });

    const params = await projectCallsSchema.validateAsync(req.query);
    if (!checkAllUsersPermission(req, res, params.allUsers)) return;

    const appDid = normalizeProjectAppDid(params.appDid);
    const { startTime, endTime } = processTimeRange(params);

    const calls = await ModelCall.getCallsByDateRange({
      userDid: getScopedUserDid(req, params.allUsers),
      appDid,
      startTime,
      endTime,
      limit: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
      model: params.model,
      type: params.type,
      status: params.status,
      search: params.search,
      searchFields: params.searchFields,
      minDurationSeconds: params.minDurationSeconds,
      includeProvider: false,
      attributes: [
        'id',
        'callTime',
        'createdAt',
        'traceId',
        'model',
        'providerId',
        'type',
        'status',
        'duration',
        'totalUsage',
        'usageMetrics',
        'credits',
        'errorReason',
        'appDid',
        'userDid',
      ],
    });

    return res.json({
      list: calls.list.map((call: any) => ({
        id: call.id,
        callTime: call.callTime,
        createdAt: call.createdAt,
        traceId: call.traceId,
        model: call.model,
        providerId: call.providerId,
        type: call.type,
        status: call.status,
        duration: call.duration != null ? Number(call.duration) : call.duration,
        totalUsage: call.totalUsage,
        usageMetrics: call.usageMetrics,
        credits: parseFloat(call.credits || '0'),
        errorReason: call.errorReason,
        appDid: call.appDid,
        userDid: call.userDid,
      })),
      count: calls.count,
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error: any) {
    if (error.status === 403) return res.status(403).json({ error: 'Access denied' });
    logger.error('Failed to get call history', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

export default router;
