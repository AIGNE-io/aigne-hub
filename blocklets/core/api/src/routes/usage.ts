import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { fromUnitToToken } from '@ocap/util';
import { Router } from 'express';
import { Op } from 'sequelize';

import { backfillModelCallStatsBatch } from '../crons/model-call-stats';
import { normalizeProjectAppDid } from '../libs/env';
import logger from '../libs/logger';
import { getCreditTransactions, getUserCredits } from '../libs/payment';
import { pushProjectFetchJob } from '../queue/projects';
import ModelCall from '../store/models/model-call';
import ModelCallStat from '../store/models/model-call-stat';
import Project from '../store/models/project';
import { sequelize } from '../store/sequelize';

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
  const endTime = hasEnd ? parsedEnd : now;

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
    const stats = await ModelCallStat.getUserAggregatedStats(userDid, startTime, endTime);
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
    const rangeDays = timeRange;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 20, 100);
    const sortBy = (req.query.sortBy as 'totalCalls' | 'totalCredits' | 'lastCallTime') || 'totalCalls';
    const rawSortOrder = String(req.query.sortOrder || '').toLowerCase();
    const sortOrder = rawSortOrder === 'asc' ? 'asc' : 'desc';

    const result = await ModelCallStat.getProjects(allUsers ? null : userDid, startTime, endTime, {
      page,
      pageSize,
      sortBy,
      sortOrder,
      rangeDays,
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
    const rangeDays = timeRange;
    const granularity = rangeDays <= 1 ? 'hour' : 'day';
    const scopedUserDid = allUsers ? null : userDid;

    let sortedProjects: Array<{ appDid: string; lastCallTime: number }> = [];
    let appDids: string[] = [];

    if (granularity === 'hour') {
      const whereClause: any = {
        callTime: { [Op.between]: [startTime, endTime] },
      };
      if (!allUsers) {
        whereClause.userDid = userDid;
      }

      const projectCalls = (await ModelCall.findAll({
        attributes: ['appDid', [sequelize.fn('MAX', sequelize.col('callTime')), 'lastCallTime']],
        where: whereClause,
        group: ['appDid'],
        raw: true,
      })) as unknown as Array<{ appDid: string | null; lastCallTime: number }>;

      const projectCallsMap = new Map<string, { appDid: string; lastCallTime: number }>();
      projectCalls.forEach((item) => {
        const { appDid } = item;
        if (!appDid) return;
        const key = appDid;
        const existing = projectCallsMap.get(key);
        const lastCallTime = Math.max(existing?.lastCallTime || 0, item.lastCallTime || 0);
        projectCallsMap.set(key, { appDid, lastCallTime });
      });

      const projectCallsList = Array.from(projectCallsMap.values());
      sortedProjects = projectCallsList.sort((a, b) => (b.lastCallTime || 0) - (a.lastCallTime || 0));
      appDids = sortedProjects.map((item) => item.appDid).filter(Boolean) as string[];
    } else {
      const startBucket = Math.floor(startTime / 86400) * 86400;
      const endBucket = Math.floor(endTime / 86400) * 86400;
      const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;
      const statsWhere: any = {
        timeType: 'day',
        timestamp: { [Op.between]: [startBucket, endBucket] },
      };
      if (allUsers) {
        statsWhere.userDid = { [Op.not]: null };
      } else {
        statsWhere.userDid = userDid;
      }
      const statsRows = (await ModelCallStat.findAll({
        attributes: ['appDid'],
        where: statsWhere,
        group: ['appDid'],
        raw: true,
      })) as Array<{ appDid: string | null }>;

      const statsAppDids = Array.from(
        new Set(
          statsRows
            .map((row) => row.appDid)
            .filter((appDid): appDid is string => typeof appDid === 'string' && appDid.length > 0)
        )
      );
      const realtimeAppDids = new Set<string>();
      const lastCallMap = new Map<string, number>();

      if (endTime >= currentDay) {
        const realtimeStart = Math.max(startTime, currentDay);
        const realtimeEnd = endTime;
        const whereClause: any = {
          callTime: { [Op.between]: [realtimeStart, realtimeEnd] },
        };
        if (!allUsers) {
          whereClause.userDid = userDid;
        }

        const projectCalls = (await ModelCall.findAll({
          attributes: ['appDid', [sequelize.fn('MAX', sequelize.col('callTime')), 'lastCallTime']],
          where: whereClause,
          group: ['appDid'],
          raw: true,
        })) as unknown as Array<{ appDid: string | null; lastCallTime: number }>;

        projectCalls.forEach((item) => {
          const { appDid } = item;
          if (!appDid) return;
          realtimeAppDids.add(appDid);
          const existing = lastCallMap.get(appDid) || 0;
          lastCallMap.set(appDid, Math.max(existing, item.lastCallTime || 0));
        });
      }

      const appDidList = Array.from(new Set([...statsAppDids, ...realtimeAppDids]));
      if (appDidList.length === 0) {
        return res.json({ projects: [], trends: [], granularity });
      }

      sortedProjects = appDidList
        .map((appDid) => ({ appDid, lastCallTime: lastCallMap.get(appDid) || 0 }))
        .sort((a, b) => (b.lastCallTime || 0) - (a.lastCallTime || 0));
      appDids = sortedProjects.map((item) => item.appDid).filter(Boolean) as string[];
    }

    if (sortedProjects.length === 0) {
      return res.json({ projects: [], trends: [], granularity });
    }

    const projects = appDids.length
      ? await Project.findAll({
          where: { appDid: { [Op.in]: appDids } },
        })
      : [];
    const projectMap = new Map(projects.map((project) => [project.appDid, project]));

    const projectList = sortedProjects.map(({ appDid, lastCallTime }) => {
      const project = projectMap.get(appDid);
      if (!project && appDid) {
        pushProjectFetchJob(appDid);
      }
      return {
        appDid,
        appName: project?.appName || appDid || undefined,
        appLogo: project?.appLogo || undefined,
        appUrl: project?.appUrl || undefined,
        lastCallTime,
      };
    });

    const trendBuckets = await ModelCallStat.getProjectTrendsBatch(
      scopedUserDid,
      sortedProjects.map((project) => project.appDid),
      startTime,
      endTime,
      granularity
    );

    const trends = trendBuckets.map(({ timestamp, byProject }) => {
      const normalizedByProject: Record<
        string,
        { totalUsage: number; totalCredits: number; totalCalls: number; successCalls: number; avgDuration: number }
      > = {};

      Object.entries(byProject).forEach(([appDidKey, stats]) => {
        normalizedByProject[appDidKey] = {
          totalUsage: stats.totalUsage,
          totalCredits: stats.totalCredits,
          totalCalls: stats.totalCalls,
          successCalls: stats.successCalls,
          avgDuration: stats.avgDuration || 0,
        };
      });

      return { timestamp, byProject: normalizedByProject };
    });

    return res.json({ projects: projectList, trends, granularity });
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

    // Query directly from pre-aggregated ModelCallStat table instead of scanning ModelCalls
    // This is much faster as we aggregate from already-aggregated data
    const trends = await ModelCallStat.getGlobalTrends(startTime, endTime, granularity);

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
    const appDidParam = (req.body?.appDid ?? req.query?.appDid) as string | undefined;
    const userDidParam = (req.body?.userDid ?? req.query?.userDid) as string | undefined;

    const appDid = appDidParam !== undefined ? normalizeProjectAppDid(appDidParam) : undefined;
    const normalizedUserDid =
      userDidParam && userDidParam !== 'null' && userDidParam.trim() !== '' ? userDidParam.trim() : null;

    const startDay = Math.floor(safeStart / 1000 / 86400) * 86400;
    const endDay = Math.floor(safeEnd / 1000 / 86400) * 86400;
    const dayTimestamps: number[] = [];
    for (let day = startDay; day <= endDay; day += 86400) {
      dayTimestamps.push(day);
    }

    await backfillModelCallStatsBatch({
      userDid: normalizedUserDid,
      appDid,
      dayTimestamps,
    });

    return res.json({ processed: dayTimestamps.length, dayTimestamps });
  } catch (error: any) {
    logger.error('Failed to backfill stats', { error, userDid: req.user?.did });
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
    const endTime = parseInt(req.query.endTime as string, 10) || Math.floor(Date.now() / 1000);
    const rangeDays = getRangeDays(startTime, endTime);
    const granularity = rangeDays <= 1 ? 'hour' : 'day';

    const trendBuckets = await ModelCallStat.getProjectTrendsBatch(
      allUsers ? null : userDid,
      [appDid],
      startTime,
      endTime,
      granularity
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
        duration: call.duration !== undefined && call.duration !== null ? Number(call.duration) : call.duration,
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
