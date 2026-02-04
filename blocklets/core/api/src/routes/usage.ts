import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import { Router } from 'express';

import { createHourlyModelCallStats } from '../crons/model-call-stats';
import { normalizeProjectAppDid } from '../libs/env';
import logger from '../libs/logger';
import { getUserCredits } from '../libs/payment';
import { pushProjectFetchJob } from '../queue/projects';
import ModelCall from '../store/models/model-call';
import ModelCallStat from '../store/models/model-call-stat';
import Project from '../store/models/project';

const router = Router();

// Session middleware for authenticated routes
const user = sessionMiddleware({ accessKey: true });

/**
 * Helper to get time range from query params
 */
function getTimeRange(query: any, defaultDays = 30) {
  const now = Math.floor(Date.now() / 1000);
  const parsedStart = parseInt(query.startTime as string, 10);
  const parsedEnd = parseInt(query.endTime as string, 10);
  const hasStart = Number.isFinite(parsedStart) && parsedStart > 0;
  const hasEnd = Number.isFinite(parsedEnd) && parsedEnd > 0;
  const rawEndTime = hasEnd ? parsedEnd : now;
  const endTime = Math.min(rawEndTime, now);

  if (hasStart) {
    const startTime = Math.min(parsedStart, endTime);
    const timeRange = Math.max(1, Math.ceil((endTime - startTime) / (24 * 3600)));
    return { startTime, endTime, timeRange };
  }

  const timeRange = parseInt(query.timeRange as string, 10) || defaultDays;
  const startTime = endTime - timeRange * 24 * 3600;
  return { startTime, endTime, timeRange };
}

function getRangeDays(startTime: number, endTime: number): number {
  const rangeSeconds = Math.max(0, endTime - startTime);
  return Math.max(1, Math.ceil(rangeSeconds / 86400));
}

function parseBooleanFlag(value: any): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return value === 'true' || value === '1';
  if (typeof value === 'number') return value === 1;
  return false;
}

function parseTimezoneOffset(query: any): number | undefined {
  const raw = query?.timezoneOffset;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getAllUsersFlag(req: any, res: any): boolean | null {
  const allUsers = parseBooleanFlag(req.query?.allUsers ?? req.query?.allUser);
  if (!allUsers) return false;
  const role = req.user?.role;
  if (!role || !['owner', 'admin'].includes(role)) {
    res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
    return null;
  }
  return true;
}

function isAdminRole(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

function decodeRouteParam(value?: string): string | undefined {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
    const { startTime, endTime, timeRange } = getTimeRange(req.query, 30);

    // Calculate estimated days remaining based on recent usage
    const stats = await ModelCallStat.getStatsByCalls(userDid, undefined, startTime, endTime);
    const daysInRange = 30;
    const dailyAvgCredits = stats.totalCredits / daysInRange;

    const decimal = credits.currency?.decimal || 0;
    const remaining = parseFloat(fromUnitToToken(credits.balance || '0', decimal));
    const total = parseFloat(fromUnitToToken(credits.total || '0', decimal));
    const pendingCredit = parseFloat(fromUnitToToken(credits.pendingCredit || '0', decimal));
    let estimatedDaysRemaining = 0;
    if (dailyAvgCredits > 0 && remaining > 0) {
      estimatedDaysRemaining = Math.max(1, Math.floor(remaining / dailyAvgCredits));
    } else if (remaining > 0) {
      estimatedDaysRemaining = 999;
    }

    logger.info('Usage quota calc', {
      userDid,
      startTime,
      endTime,
      timeRange,
      daysInRange,
      currencyDecimal: decimal,
      totalCredits: stats.totalCredits,
      remaining,
      dailyAvgCredits,
    });

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
    const allUsersFlag = getAllUsersFlag(req, res);
    if (allUsersFlag === null) {
      return;
    }
    const allUsers = allUsersFlag;

    const { startTime, endTime, timeRange } = getTimeRange(req.query);
    const timezoneOffset = parseTimezoneOffset(req.query);
    const rangeDays = timeRange;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 20, 100);
    const rawSortBy = req.query.sortBy as string | undefined;
    const sortBy = rawSortBy === 'totalCredits' ? 'totalCredits' : 'totalCalls';
    const rawSortOrder = String(req.query.sortOrder || '').toLowerCase();
    const sortOrder = rawSortOrder === 'asc' ? 'asc' : 'desc';

    const result = await ModelCallStat.getProjects(allUsers ? null : userDid, startTime, endTime, {
      page,
      pageSize,
      sortBy,
      sortOrder,
      rangeDays,
      timezoneOffset,
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

/**
 * GET /api/usage/projects/trends
 * Get project-grouped usage trends over time (current user)
 */
router.get('/projects/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const allUsersFlag = getAllUsersFlag(req, res);
    if (allUsersFlag === null) {
      return;
    }
    const allUsers = allUsersFlag;

    const { startTime, endTime, timeRange } = getTimeRange(req.query);
    const timezoneOffset = parseTimezoneOffset(req.query);
    const granularity = timeRange <= 1 ? 'hour' : 'day';
    const scopedUserDid = allUsers ? null : userDid;

    const result = await ModelCallStat.getTrendGroupByProjects({
      userDid: scopedUserDid,
      startTime,
      endTime,
      granularity,
      timezoneOffset,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Failed to get project trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/trends
 * Get platform usage trends over time (admin only)
 */
router.get('/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
    }

    const { startTime, endTime, timeRange } = getTimeRange(req.query);
    const rangeDays = timeRange;
    const granularity = rangeDays <= 1 ? 'hour' : 'day';
    const timezoneOffset = parseTimezoneOffset(req.query);

    // Query directly from pre-aggregated ModelCallStat table instead of scanning ModelCalls
    // This is much faster as we aggregate from already-aggregated data
    const trends = await ModelCallStat.getGlobalTrends(startTime, endTime, granularity, timezoneOffset);

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

/**
 * POST /api/usage/stats/backfill
 * Manually trigger stats backfill (admin/owner only)
 */
router.post('/stats/backfill', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
    }

    const startDate = new Date((req.body?.startDate ?? req.query?.startDate) as string);
    const endDate = new Date((req.body?.endDate ?? req.query?.endDate) as string);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: 'startDate and endDate are required and must be valid Date strings.',
      });
    }

    const safeStart = Math.min(startDate.getTime(), endDate.getTime());
    const safeEnd = Math.max(startDate.getTime(), endDate.getTime());
    const userDidParam = (req.body?.userDid ?? req.query?.userDid) as string | undefined;

    const normalizedUserDid =
      userDidParam && userDidParam !== 'null' && userDidParam.trim() !== '' ? userDidParam.trim() : null;

    const startDay = Math.floor(safeStart / 1000 / 86400) * 86400;
    const endDay = Math.floor(safeEnd / 1000 / 86400) * 86400;
    const ranges: Array<{ startTime: number; endTime: number }> = [];
    let processed = 0;

    for (let day = startDay; day <= endDay; day += 86400) {
      const rangeStart = day;
      const rangeEnd = day + 86400 - 1;
      ranges.push({ startTime: rangeStart, endTime: rangeEnd });
      processed += 24;
      await createHourlyModelCallStats(rangeStart, rangeEnd, normalizedUserDid, true);
    }

    return res.json({ processed, ranges });
  } catch (error: any) {
    logger.error('Failed to backfill stats', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/projects/:appDid/trends
 * Get trends for a specific project
 */
router.get('/projects/:appDid(.*)/trends', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const allUsersFlag = getAllUsersFlag(req, res);
    if (allUsersFlag === null) {
      return;
    }
    const allUsers = allUsersFlag;

    const appDidParam = decodeRouteParam(req.params.appDid);
    const appDid = normalizeProjectAppDid(appDidParam);
    const startTime = parseInt(req.query.startTime as string, 10) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const rawEndTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);
    const endTime = Math.min(rawEndTime, Math.floor(Date.now() / 1000));
    const rangeDays = getRangeDays(startTime, endTime);
    const granularity = rangeDays <= 1 ? 'hour' : 'day';
    const timezoneOffset = parseTimezoneOffset(req.query);

    const trendBuckets = await ModelCallStat.getProjectTrends(
      allUsers ? null : userDid,
      [appDid],
      startTime,
      endTime,
      granularity,
      timezoneOffset
    );
    const appDidKey = appDid as string;
    const emptyStats = ModelCallStat.getEmptyStats();
    const trends = trendBuckets.map((bucket) => ({
      timestamp: bucket.timestamp,
      stats: bucket.byProject[appDidKey] || emptyStats,
    }));

    const project = appDid ? await Project.getByAppDid(appDid) : null;
    if (!project && appDid) {
      pushProjectFetchJob(appDid);
    }

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
    if (error.status === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    logger.error('Failed to get project trends', { error, userDid: req.user?.did });
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/usage/projects/:appDid/calls
 * Get call history for a specific project (real-time query with pagination)
 */
router.get('/projects/:appDid(.*)/calls', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const allUsersFlag = getAllUsersFlag(req, res);
    if (allUsersFlag === null) {
      return;
    }
    const allUsers = allUsersFlag;

    const appDidParam = decodeRouteParam(req.params.appDid);
    const appDid = normalizeProjectAppDid(appDidParam);
    const startTime = parseInt(req.query.startTime as string, 10) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const endTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 20, 100);
    const model = req.query.model as string | undefined;
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const searchFields = typeof req.query.searchFields === 'string' ? req.query.searchFields : undefined;
    const minDurationSeconds =
      req.query.minDurationSeconds !== undefined ? Number(req.query.minDurationSeconds) : undefined;

    // Build query params
    const queryParams: any = {
      userDid: allUsers ? null : userDid,
      appDid,
      startTime,
      endTime,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };

    if (model) {
      queryParams.model = model;
    }
    if (type) {
      queryParams.type = type;
    }
    if (status && ['success', 'failed', 'processing'].includes(status)) {
      queryParams.status = status;
    }
    if (search) {
      queryParams.search = search;
      if (searchFields) {
        queryParams.searchFields = searchFields;
      }
    }
    if (Number.isFinite(minDurationSeconds)) {
      queryParams.minDurationSeconds = minDurationSeconds;
    }

    const calls = await ModelCall.getCallsByDateRange({
      ...queryParams,
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
        duration: call.duration !== undefined && call.duration !== null ? Number(call.duration) : call.duration,
        totalUsage: call.totalUsage,
        usageMetrics: call.usageMetrics,
        credits: parseFloat(call.credits || '0'),
        errorReason: call.errorReason,
        appDid: call.appDid,
        userDid: call.userDid,
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
