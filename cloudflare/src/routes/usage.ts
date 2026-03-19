import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { modelCallStats, modelCalls, usages } from '../db/schema';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

function getUserDid(c: Context<HonoEnv>): string {
  return (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';
}

// GET /api/usage/stats - Aggregated usage statistics
routes.get('/stats', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const appDid = c.req.query('appDid');
  const timeType = c.req.query('timeType') || 'hour';
  const from = c.req.query('from');
  const to = c.req.query('to');

  const conditions = [];
  if (userDid) conditions.push(eq(modelCallStats.userDid, userDid));
  if (appDid) conditions.push(eq(modelCallStats.appDid, appDid));
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

// GET /api/usage/credits - User credit balance
routes.get('/credits', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);

  if (!userDid) {
    return c.json({ error: 'Authentication required' }, 401);
  }

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

// GET /api/usage/recent - Recent model calls
routes.get('/recent', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const limit = parseInt(c.req.query('limit') || '20', 10);

  const conditions = userDid ? eq(modelCalls.userDid, userDid) : undefined;

  const calls = await db
    .select()
    .from(modelCalls)
    .where(conditions)
    .orderBy(desc(modelCalls.callTime))
    .limit(Math.min(limit, 100));

  return c.json(calls);
});

// GET /api/usage/by-model - Usage grouped by model
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
