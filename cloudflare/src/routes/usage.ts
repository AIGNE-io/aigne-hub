import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { modelCallStats, modelCalls, projects, usages } from '../db/schema';
import { getCreditBalance } from '../libs/credit';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

function getUserDid(c: Context<HonoEnv>): string {
  return (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';
}

function isAdminUser(c: Context<HonoEnv>): boolean {
  const user = c.get('user') as { role?: string } | undefined;
  const role = user?.role || c.req.header('x-user-role');
  return role === 'admin' || role === 'owner';
}

function getTimeRange(c: Context<HonoEnv>): { startTime: number; endTime: number } {
  const now = Math.floor(Date.now() / 1000);
  const startTimeParam = c.req.query('startTime');
  const endTimeParam = c.req.query('endTime');
  const timeRange = parseInt(c.req.query('timeRange') || '30', 10);

  const endTime = endTimeParam ? Math.min(parseInt(endTimeParam, 10), now) : now;
  const startTime = startTimeParam ? parseInt(startTimeParam, 10) : endTime - timeRange * 86400;

  return { startTime, endTime };
}

// GET /api/usage/quota - Credit quota & remaining
routes.get('/quota', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);

  const [result] = await db
    .select({
      totalCredits: sql<string>`COALESCE(SUM(CAST(${usages.usedCredits} AS REAL)), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
    })
    .from(usages)
    .where(userDid ? eq(usages.userDid, userDid) : undefined);

  const creditBalance = await getCreditBalance(db, userDid || 'anonymous');
  const used = creditBalance.used;
  const total = creditBalance.total;
  const remaining = creditBalance.balance;
  const dailyAvgCredits = used / 30;
  const estimatedDaysRemaining = dailyAvgCredits > 0 ? Math.floor(remaining / dailyAvgCredits) : 999;

  return c.json({
    total,
    remaining,
    used,
    pendingCredit: 0,
    estimatedDaysRemaining,
    dailyAvgCredits,
    currency: { decimal: 6 },
  });
});

// GET /api/usage/projects - Projects list with stats
routes.get('/projects', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const { startTime, endTime } = getTimeRange(c);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(100, parseInt(c.req.query('pageSize') || '20', 10));
  const allUsers = c.req.query('allUsers') === 'true';
  const sortBy = c.req.query('sortBy') || 'totalCalls';
  const sortOrder = c.req.query('sortOrder') || 'desc';

  const conditions = [gte(modelCalls.callTime, startTime), lte(modelCalls.callTime, endTime)];
  if (!allUsers && userDid) conditions.push(eq(modelCalls.userDid, userDid));

  const projectStats = await db
    .select({
      appDid: modelCalls.appDid,
      totalCalls: sql<number>`COUNT(*)`,
      totalCredits: sql<string>`COALESCE(SUM(CAST(${modelCalls.credits} AS REAL)), 0)`,
      avgDuration: sql<string>`AVG(CAST(${modelCalls.duration} AS REAL))`,
      successCalls: sql<number>`SUM(CASE WHEN ${modelCalls.status} = 'success' THEN 1 ELSE 0 END)`,
      lastCallTime: sql<number>`MAX(${modelCalls.callTime})`,
    })
    .from(modelCalls)
    .where(and(...conditions))
    .groupBy(modelCalls.appDid);

  // Enrich with project metadata
  const appDids = projectStats.map((p) => p.appDid).filter(Boolean) as string[];
  let projectMeta: Array<typeof projects.$inferSelect> = [];
  if (appDids.length > 0) {
    projectMeta = await db.select().from(projects);
    projectMeta = projectMeta.filter((p) => appDids.includes(p.appDid));
  }
  const metaMap = new Map(projectMeta.map((p) => [p.appDid, p]));

  // Sort in JS (SQL alias ordering unreliable in D1)
  projectStats.sort((a, b) => {
    const aVal = sortBy === 'totalCredits' ? parseFloat(a.totalCredits) : a.totalCalls;
    const bVal = sortBy === 'totalCredits' ? parseFloat(b.totalCredits) : b.totalCalls;
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const total = projectStats.length;
  const paged = projectStats.slice((page - 1) * pageSize, page * pageSize);

  return c.json({
    projects: paged.map((s) => {
      const validAppDid = s.appDid && s.appDid !== 'undefined' && s.appDid.trim() !== '' ? s.appDid : null;
      const meta = validAppDid ? metaMap.get(validAppDid) : undefined;
      return {
        appDid: validAppDid,
        appName: meta?.appName || (validAppDid ? validAppDid : 'Direct API'),
        appLogo: meta?.appLogo,
        appUrl: meta?.appUrl,
        totalCalls: s.totalCalls,
        totalCredits: parseFloat(s.totalCredits),
        avgDuration: s.avgDuration ? parseFloat(s.avgDuration) : 0,
        successRate: s.totalCalls > 0 ? (s.successCalls / s.totalCalls) * 100 : 0,
        lastCallTime: s.lastCallTime,
      };
    }),
    total,
    page,
    pageSize,
  });
});

// GET /api/usage/projects/group-trends - Trends grouped by project
routes.get('/projects/group-trends', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const { startTime, endTime } = getTimeRange(c);
  const allUsers = c.req.query('allUsers') === 'true';
  const timezoneOffset = parseInt(c.req.query('timezoneOffset') || '0', 10);
  const offsetSeconds = timezoneOffset * 60;

  const rangeDays = (endTime - startTime) / 86400;
  const granularity = rangeDays <= 1 ? 'hour' : 'day';
  const bucketSize = granularity === 'hour' ? 3600 : 86400;

  const conditions = [gte(modelCalls.callTime, startTime), lte(modelCalls.callTime, endTime)];
  if (!allUsers && userDid) conditions.push(eq(modelCalls.userDid, userDid));

  const bucketExpr = sql`CAST((${modelCalls.callTime} - ${offsetSeconds}) / ${bucketSize} AS INTEGER) * ${bucketSize} + ${offsetSeconds}`;

  const rows = await db
    .select({
      bucket: bucketExpr.as('bucket'),
      appDid: modelCalls.appDid,
      totalCalls: sql<number>`COUNT(*)`,
      successCalls: sql<number>`SUM(CASE WHEN ${modelCalls.status} = 'success' THEN 1 ELSE 0 END)`,
      totalUsage: sql<number>`SUM(${modelCalls.totalUsage})`,
      totalCredits: sql<string>`COALESCE(SUM(CAST(${modelCalls.credits} AS REAL)), 0)`,
      avgDuration: sql<string>`AVG(CAST(${modelCalls.duration} AS REAL))`,
      avgTtfb: sql<string>`AVG(CAST(${modelCalls.ttfb} AS REAL))`,
    })
    .from(modelCalls)
    .where(and(...conditions))
    .groupBy(sql`bucket`, modelCalls.appDid)
    .orderBy(sql`bucket`);

  // Group by timestamp
  const trendMap = new Map<number, Record<string, { totalUsage: number; totalCredits: number; totalCalls: number; successCalls: number; avgDuration: number; avgTtfb?: number }>>();
  const projectSet = new Set<string>();

  for (const row of rows) {
    const ts = row.bucket as number;
    const appDid = (row.appDid && row.appDid !== 'undefined' && row.appDid.trim() !== '') ? row.appDid : 'direct';
    projectSet.add(appDid);

    if (!trendMap.has(ts)) trendMap.set(ts, {});
    const bucket = trendMap.get(ts)!;
    bucket[appDid] = {
      totalUsage: row.totalUsage || 0,
      totalCredits: parseFloat(row.totalCredits),
      totalCalls: row.totalCalls,
      successCalls: row.successCalls,
      avgDuration: row.avgDuration ? parseFloat(row.avgDuration) : 0,
      avgTtfb: row.avgTtfb ? parseFloat(row.avgTtfb) / 1000 : undefined,
    };
  }

  // Enrich project metadata
  const appDids = [...projectSet].filter((d) => d !== 'direct');
  let projectMeta: Array<typeof projects.$inferSelect> = [];
  if (appDids.length > 0) {
    const allProjects = await db.select().from(projects);
    projectMeta = allProjects.filter((p) => appDids.includes(p.appDid));
  }
  const metaMap = new Map(projectMeta.map((p) => [p.appDid, p]));

  return c.json({
    projects: [...projectSet].map((appDid) => {
      const meta = metaMap.get(appDid);
      return {
        appDid: appDid === 'direct' ? null : appDid,
        appName: meta?.appName || (appDid === 'direct' ? 'Direct API' : appDid),
        appLogo: meta?.appLogo,
        appUrl: meta?.appUrl,
      };
    }),
    trends: [...trendMap.entries()].map(([timestamp, byProject]) => ({ timestamp, byProject })),
    granularity,
  });
});

// GET /api/usage/projects/trends - Trends for a specific project
routes.get('/projects/trends', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const rawAppDid = c.req.query('appDid');
  const { startTime, endTime } = getTimeRange(c);
  const allUsers = c.req.query('allUsers') === 'true';
  const timezoneOffset = parseInt(c.req.query('timezoneOffset') || '0', 10);
  const offsetSeconds = timezoneOffset * 60;

  const rangeDays = (endTime - startTime) / 86400;
  const granularity = rangeDays <= 1 ? 'hour' : 'day';
  const bucketSize = granularity === 'hour' ? 3600 : 86400;

  const conditions = [gte(modelCalls.callTime, startTime), lte(modelCalls.callTime, endTime)];
  if (!allUsers && userDid) conditions.push(eq(modelCalls.userDid, userDid));
  if (rawAppDid === '__direct__') {
    conditions.push(
      sql`(${modelCalls.appDid} IS NULL OR ${modelCalls.appDid} = '' OR ${modelCalls.appDid} = 'undefined')`
    );
  } else if (rawAppDid) {
    conditions.push(eq(modelCalls.appDid, rawAppDid));
  }

  const bucketExpr = sql`CAST((${modelCalls.callTime} - ${offsetSeconds}) / ${bucketSize} AS INTEGER) * ${bucketSize} + ${offsetSeconds}`;

  const rows = await db
    .select({
      bucket: bucketExpr.as('bucket'),
      calls: sql<number>`COUNT(*)`,
      successCalls: sql<number>`SUM(CASE WHEN ${modelCalls.status} = 'success' THEN 1 ELSE 0 END)`,
      totalUsage: sql<number>`SUM(${modelCalls.totalUsage})`,
      totalCredits: sql<string>`COALESCE(SUM(CAST(${modelCalls.credits} AS REAL)), 0)`,
      avgDuration: sql<string>`AVG(CAST(${modelCalls.duration} AS REAL))`,
      avgTtfb: sql<string>`AVG(CAST(${modelCalls.ttfb} AS REAL))`,
    })
    .from(modelCalls)
    .where(and(...conditions))
    .groupBy(sql`bucket`)
    .orderBy(sql`bucket`);

  // Get project metadata
  let project = null;
  if (rawAppDid === '__direct__') {
    project = { appDid: null, appName: 'Direct API', appLogo: null, appUrl: null };
  } else if (rawAppDid) {
    const [meta] = await db.select().from(projects).where(eq(projects.appDid, rawAppDid)).limit(1);
    if (meta) project = { appDid: meta.appDid, appName: meta.appName, appLogo: meta.appLogo, appUrl: meta.appUrl };
  }

  return c.json({
    project,
    trends: rows.map((r) => ({
      timestamp: r.bucket as number,
      calls: r.calls,
      successCalls: r.successCalls,
      avgDuration: r.avgDuration ? parseFloat(r.avgDuration) : 0,
      avgTtfb: r.avgTtfb ? parseFloat(r.avgTtfb) / 1000 : undefined,
      totalCredits: parseFloat(r.totalCredits),
      totalUsage: r.totalUsage || 0,
    })),
  });
});

// GET /api/usage/trends - Platform-wide trends (admin only)
routes.get('/trends', async (c) => {
  if (!isAdminUser(c) && c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const db = c.get('db');
  const { startTime, endTime } = getTimeRange(c);
  const timezoneOffset = parseInt(c.req.query('timezoneOffset') || '0', 10);
  const offsetSeconds = timezoneOffset * 60;

  const rangeDays = (endTime - startTime) / 86400;
  const granularity = rangeDays <= 1 ? 'hour' : 'day';
  const bucketSize = granularity === 'hour' ? 3600 : 86400;

  const bucketExpr = sql`CAST((${modelCalls.callTime} - ${offsetSeconds}) / ${bucketSize} AS INTEGER) * ${bucketSize} + ${offsetSeconds}`;

  const rows = await db
    .select({
      bucket: bucketExpr.as('bucket'),
      calls: sql<number>`COUNT(*)`,
      successCalls: sql<number>`SUM(CASE WHEN ${modelCalls.status} = 'success' THEN 1 ELSE 0 END)`,
      totalUsage: sql<number>`SUM(${modelCalls.totalUsage})`,
      totalCredits: sql<string>`COALESCE(SUM(CAST(${modelCalls.credits} AS REAL)), 0)`,
      avgDuration: sql<string>`AVG(CAST(${modelCalls.duration} AS REAL))`,
      avgTtfb: sql<string>`AVG(CAST(${modelCalls.ttfb} AS REAL))`,
    })
    .from(modelCalls)
    .where(and(gte(modelCalls.callTime, startTime), lte(modelCalls.callTime, endTime)))
    .groupBy(sql`bucket`)
    .orderBy(sql`bucket`);

  return c.json({
    trends: rows.map((r) => ({
      timestamp: r.bucket as number,
      calls: r.calls,
      successCalls: r.successCalls,
      successRate: r.calls > 0 ? (r.successCalls / r.calls) * 100 : 0,
      avgDuration: r.avgDuration ? parseFloat(r.avgDuration) : 0,
      avgTtfb: r.avgTtfb ? parseFloat(r.avgTtfb) / 1000 : undefined,
      totalCredits: parseFloat(r.totalCredits),
      totalUsage: r.totalUsage || 0,
    })),
  });
});

// Legacy endpoints (keep for compatibility)

// GET /api/usage/stats
routes.get('/stats', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const timeType = c.req.query('timeType') || 'hour';
  const from = c.req.query('from');
  const to = c.req.query('to');

  const conditions = [];
  if (userDid) conditions.push(eq(modelCallStats.userDid, userDid));
  if (timeType) conditions.push(eq(modelCallStats.timeType, timeType as 'day' | 'hour' | 'month'));
  if (from) conditions.push(gte(modelCallStats.timestamp, parseInt(from, 10)));
  if (to) conditions.push(lte(modelCallStats.timestamp, parseInt(to, 10)));

  const stats = await db
    .select()
    .from(modelCallStats)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(modelCallStats.timestamp))
    .limit(100);

  return c.json(stats);
});

// GET /api/usage/credits
routes.get('/credits', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  if (!userDid) return c.json({ error: 'Authentication required' }, 401);

  const [result] = await db
    .select({
      totalCredits: sql<string>`COALESCE(SUM(CAST(${usages.usedCredits} AS REAL)), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
    })
    .from(usages)
    .where(eq(usages.userDid, userDid));

  return c.json({
    userDid,
    totalCreditsUsed: parseFloat(result?.totalCredits || '0'),
    totalCalls: result?.totalCalls || 0,
  });
});

// GET /api/usage/recent
routes.get('/recent', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

  const calls = await db
    .select()
    .from(modelCalls)
    .where(userDid ? eq(modelCalls.userDid, userDid) : undefined)
    .orderBy(desc(modelCalls.callTime))
    .limit(limit);

  return c.json(calls);
});

// GET /api/usage/projects/calls - Call history for a specific project
routes.get('/projects/calls', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const { startTime, endTime } = getTimeRange(c);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(100, parseInt(c.req.query('pageSize') || '20', 10));
  const allUsers = c.req.query('allUsers') === 'true';
  const rawAppDid = c.req.query('appDid') || '';
  const search = c.req.query('search');
  const status = c.req.query('status');
  const type = c.req.query('type');
  const minDurationSeconds = c.req.query('minDurationSeconds');

  const conditions = [gte(modelCalls.callTime, startTime), lte(modelCalls.callTime, endTime)];
  if (!allUsers && userDid) conditions.push(eq(modelCalls.userDid, userDid));

  // Handle __direct__ = calls without a project (null or empty appDid)
  if (rawAppDid === '__direct__') {
    conditions.push(
      sql`(${modelCalls.appDid} IS NULL OR ${modelCalls.appDid} = '' OR ${modelCalls.appDid} = 'undefined')`
    );
  } else if (rawAppDid) {
    conditions.push(eq(modelCalls.appDid, rawAppDid));
  }

  if (status) conditions.push(eq(modelCalls.status, status as 'success' | 'failed'));
  if (type) conditions.push(eq(modelCalls.type, type as 'chatCompletion' | 'embedding' | 'imageGeneration' | 'video'));
  if (search) {
    conditions.push(
      sql`(${modelCalls.model} LIKE ${'%' + search + '%'} OR ${modelCalls.requestId} LIKE ${'%' + search + '%'})`
    );
  }
  if (minDurationSeconds) {
    conditions.push(sql`CAST(${modelCalls.duration} AS REAL) >= ${parseFloat(minDurationSeconds)}`);
  }

  const whereClause = and(...conditions);

  const [calls, countResult] = await Promise.all([
    db
      .select()
      .from(modelCalls)
      .where(whereClause)
      .orderBy(desc(modelCalls.callTime))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(modelCalls)
      .where(whereClause),
  ]);

  // Sanitize invalid DID values to prevent frontend DID parsing errors
  const sanitized = calls.map((call) => ({
    ...call,
    userDid: call.userDid && !call.userDid.startsWith('did:') ? null : call.userDid,
    appDid: call.appDid && (call.appDid === 'undefined' || call.appDid.trim() === '') ? null : call.appDid,
  }));

  return c.json({
    list: sanitized,
    count: countResult[0]?.count || 0,
    page,
    pageSize,
  });
});

// GET /api/usage/by-model
routes.get('/by-model', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const from = c.req.query('from');
  const to = c.req.query('to');

  const conditions = [];
  if (userDid) conditions.push(eq(modelCalls.userDid, userDid));
  if (from) conditions.push(gte(modelCalls.callTime, parseInt(from, 10)));
  if (to) conditions.push(lte(modelCalls.callTime, parseInt(to, 10)));

  const result = await db
    .select({
      model: modelCalls.model,
      type: modelCalls.type,
      totalCalls: sql<number>`COUNT(*)`,
      successCalls: sql<number>`SUM(CASE WHEN ${modelCalls.status} = 'success' THEN 1 ELSE 0 END)`,
      totalUsage: sql<number>`SUM(${modelCalls.totalUsage})`,
      totalCredits: sql<string>`SUM(CAST(${modelCalls.credits} AS REAL))`,
      avgDuration: sql<string>`AVG(CAST(${modelCalls.duration} AS REAL))`,
      avgTtfb: sql<string>`AVG(CAST(${modelCalls.ttfb} AS REAL))`,
    })
    .from(modelCalls)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(modelCalls.model, modelCalls.type);

  return c.json(result);
});

export default routes;
