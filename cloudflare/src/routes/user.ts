import { createBlockletServiceClient } from '@arcblock/did-connect-cloudflare/client';
import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { aiProviders, creditAccounts, modelCalls } from '../db/schema';
import { getCreditBalance, getTransactions } from '../libs/credit';
import { ensureMeter, getCreditPaymentLink, type PaymentClient } from '../libs/payment';
import { getPreferences, setPreferences } from '../libs/preferences';
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

// GET /api/user/info - User info + credit balance
routes.get('/info', async (c) => {
  const user = c.get('user') as { id?: string; email?: string; name?: string; role?: string } | undefined;
  const did = user?.id || c.req.header('x-user-did');

  if (!did) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const db = c.get('db');
  const prefs = await getPreferences(c.env.AUTH_KV);
  const payment = c.get('payment') as PaymentClient | undefined;
  let creditBalance;
  let currency: any = { decimal: 10 };
  if (payment) {
    try {
      const customer = await payment.ensureCustomer(did);
      const meter = await ensureMeter(payment);
      if (meter?.paymentCurrency) currency = meter.paymentCurrency;
      const summary = await payment.getCreditSummary(customer.id);
      const currencyId = meter?.currency_id;
      creditBalance = {
        balance: parseFloat(summary?.[currencyId]?.remainingAmount ?? '0'),
        total: parseFloat(summary?.[currencyId]?.totalAmount ?? '0'),
        used: 0,
        grantCount: summary?.[currencyId]?.grantCount ?? 0,
        pendingCredit: 0,
      };
    } catch {
      creditBalance = await getCreditBalance(db, did);
    }
  } else {
    creditBalance = await getCreditBalance(db, did);
  }

  return c.json({
    user: {
      did,
      fullName: user?.name || did,
      email: user?.email || '',
      avatar: '',
    },
    creditBalance: {
      balance: creditBalance.balance,
      total: creditBalance.total,
      grantCount: creditBalance.grantCount,
      pendingCredit: creditBalance.pendingCredit,
    },
    paymentLink: payment ? '/payment/customer' : null,
    currency,
    enableCredit: prefs.creditBasedBillingEnabled ?? true,
    profileLink: null,
    creditPrefix: prefs.creditPrefix || '',
  });
});

// GET /api/user/profile
routes.get('/profile', async (c) => {
  const user = c.get('user') as { id?: string; email?: string; name?: string; role?: string } | undefined;
  const did = user?.id || c.req.header('x-user-did');
  if (!did) return c.json({ error: 'Authentication required' }, 401);
  return c.json({ did, email: user?.email || '', name: user?.name || '', role: user?.role || 'member' });
});

// GET /api/app/status
routes.get('/app/status', async (c) => {
  return c.json({ status: 'running', creditBasedBilling: true, version: '0.1.0' });
});

// GET /api/user/usage-stats - Model usage stats (current user)
routes.get('/usage-stats', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');

  const conditions = [];
  if (userDid) conditions.push(eq(modelCalls.userDid, userDid));
  if (startTime) conditions.push(gte(modelCalls.callTime, parseInt(startTime, 10)));
  if (endTime) conditions.push(lte(modelCalls.callTime, parseInt(endTime, 10)));

  const stats = await db
    .select({
      model: modelCalls.model,
      providerId: modelCalls.providerId,
      totalCalls: sql<number>`COUNT(*)`,
    })
    .from(modelCalls)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(modelCalls.model)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);

  const [countResult] = await db
    .select({ total: sql<number>`COUNT(DISTINCT ${modelCalls.model})` })
    .from(modelCalls)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  // Enrich with provider info
  const providerIds = [...new Set(stats.map((s) => s.providerId))];
  const providers =
    providerIds.length > 0
      ? await db
          .select({ id: aiProviders.id, name: aiProviders.name, displayName: aiProviders.displayName })
          .from(aiProviders)
          .where(or(...providerIds.map((pid) => eq(aiProviders.id, pid))))
      : [];
  const providerMap = new Map(providers.map((p) => [p.id, p]));

  return c.json({
    modelStats: {
      list: stats.map((s) => ({
        providerId: s.providerId,
        provider: providerMap.get(s.providerId) || { id: s.providerId, name: 'unknown', displayName: 'Unknown' },
        model: s.model,
        totalCalls: s.totalCalls,
      })),
      totalModelCount: countResult?.total || 0,
    },
  });
});

// GET /api/user/admin/user-stats - Model usage stats (all users, admin only)
routes.get('/admin/user-stats', async (c) => {
  if (!isAdminUser(c) && c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const db = c.get('db');
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');

  const conditions = [];
  if (startTime) conditions.push(gte(modelCalls.callTime, parseInt(startTime, 10)));
  if (endTime) conditions.push(lte(modelCalls.callTime, parseInt(endTime, 10)));

  const stats = await db
    .select({
      model: modelCalls.model,
      providerId: modelCalls.providerId,
      totalCalls: sql<number>`COUNT(*)`,
    })
    .from(modelCalls)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(modelCalls.model)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);

  const [countResult] = await db
    .select({ total: sql<number>`COUNT(DISTINCT ${modelCalls.model})` })
    .from(modelCalls)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const providerIds = [...new Set(stats.map((s) => s.providerId))];
  const providers =
    providerIds.length > 0
      ? await db
          .select({ id: aiProviders.id, name: aiProviders.name, displayName: aiProviders.displayName })
          .from(aiProviders)
          .where(or(...providerIds.map((pid) => eq(aiProviders.id, pid))))
      : [];
  const providerMap = new Map(providers.map((p) => [p.id, p]));

  return c.json({
    modelStats: {
      list: stats.map((s) => ({
        providerId: s.providerId,
        provider: providerMap.get(s.providerId) || { id: s.providerId, name: 'unknown', displayName: 'Unknown' },
        model: s.model,
        totalCalls: s.totalCalls,
      })),
      totalModelCount: countResult?.total || 0,
    },
  });
});

// GET /api/user/model-calls - Paginated model call history
routes.get('/model-calls', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '50', 10)));
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');
  const search = c.req.query('search');
  const status = c.req.query('status');
  const model = c.req.query('model');
  const providerId = c.req.query('providerId');
  const allUsers = c.req.query('allUsers') === 'true';

  const conditions = [];
  if (!allUsers && userDid) conditions.push(eq(modelCalls.userDid, userDid));
  if (startTime) conditions.push(gte(modelCalls.callTime, parseInt(startTime, 10)));
  if (endTime) conditions.push(lte(modelCalls.callTime, parseInt(endTime, 10)));
  if (status && status !== 'all') conditions.push(eq(modelCalls.status, status as 'success' | 'failed'));
  if (model) conditions.push(like(modelCalls.model, `%${model}%`));
  if (providerId) conditions.push(eq(modelCalls.providerId, providerId));
  if (search) {
    conditions.push(or(like(modelCalls.model, `%${search}%`), like(modelCalls.id, `%${search}%`)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [calls, countResult] = await Promise.all([
    db
      .select({
        call: modelCalls,
        provider: {
          id: aiProviders.id,
          name: aiProviders.name,
          displayName: aiProviders.displayName,
        },
      })
      .from(modelCalls)
      .leftJoin(aiProviders, eq(modelCalls.providerId, aiProviders.id))
      .where(whereClause)
      .orderBy(desc(modelCalls.callTime))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`COUNT(*)` }).from(modelCalls).where(whereClause),
  ]);

  return c.json({
    count: countResult[0]?.count || 0,
    list: calls.map(({ call, provider }) => ({
      ...call,
      duration: call.duration ? parseFloat(call.duration) : null,
      ttfb: call.ttfb ? parseFloat(call.ttfb) : null,
      provider,
    })),
    paging: { page, pageSize },
  });
});

// GET /api/user/model-calls/export - Export model calls as CSV
routes.get('/model-calls/export', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');
  const locale = c.req.query('locale') || 'en';

  const conditions = [];
  if (userDid) conditions.push(eq(modelCalls.userDid, userDid));
  if (startTime) conditions.push(gte(modelCalls.callTime, parseInt(startTime, 10)));
  if (endTime) conditions.push(lte(modelCalls.callTime, parseInt(endTime, 10)));

  const calls = await db
    .select({
      call: modelCalls,
      providerName: aiProviders.name,
    })
    .from(modelCalls)
    .leftJoin(aiProviders, eq(modelCalls.providerId, aiProviders.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(modelCalls.callTime))
    .limit(10000);

  const headers =
    locale === 'zh'
      ? ['时间', '模型', '供应商', '类型', '状态', '用量', '积分', '耗时(秒)']
      : ['Timestamp', 'Model', 'Provider', 'Type', 'Status', 'Usage', 'Credits', 'Duration(s)'];

  const rows = calls.map(({ call, providerName }) => [
    new Date(call.callTime * 1000).toISOString(),
    call.model,
    providerName || '',
    call.type,
    call.status,
    call.totalUsage,
    call.credits,
    call.duration || '',
  ]);

  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="model-calls-${Date.now()}.csv"`,
    },
  });
});

// GET /api/user/credit/payment-link - Get credit purchase link (under /payment/ mount point)
routes.get('/credit/payment-link', async (c) => {
  // Use configured payment link from preferences first
  const prefs = await getPreferences(c.env.AUTH_KV);
  if (prefs.creditPaymentLink) {
    return c.json(prefs.creditPaymentLink);
  }
  // Fallback: auto-create via Payment Kit API
  const payment = c.get('payment') as PaymentClient | undefined;
  if (!payment) return c.json(null);
  try {
    const link = await getCreditPaymentLink(payment);
    return c.json(link);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to get payment link' }, 500);
  }
});

// GET /api/user/credit/grants - Credit grants
routes.get('/credit/grants', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  if (!userDid) return c.json({ error: 'Authentication required' }, 401);
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '10', 10);
  const payment = c.get('payment') as PaymentClient | undefined;
  if (payment) {
    try {
      const customer = await payment.ensureCustomer(userDid);
      const meter = await ensureMeter(payment);
      return c.json(await payment.getCreditGrants({ customer_id: customer.id, currency_id: meter?.currency_id, page, pageSize }));
    } catch { /* fall through to local */ }
  }
  return c.json(await getTransactions(db, userDid, { page, pageSize, type: 'grant' }));
});

// GET /api/user/credit/transactions - Credit transactions
routes.get('/credit/transactions', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  if (!userDid) return c.json({ error: 'Authentication required' }, 401);
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '10', 10);
  const payment = c.get('payment') as PaymentClient | undefined;
  if (payment) {
    try {
      const customer = await payment.ensureCustomer(userDid);
      const meter = await ensureMeter(payment);
      return c.json(await payment.getCreditTransactions({ customer_id: customer.id, meter_id: meter?.id, page, pageSize }));
    } catch { /* fall through to local */ }
  }
  return c.json(await getTransactions(db, userDid, { page, pageSize }));
});

// GET /api/user/credit/balance - Credit balance
routes.get('/credit/balance', async (c) => {
  const db = c.get('db');
  const userDid = getUserDid(c);
  if (!userDid) return c.json({ error: 'Authentication required' }, 401);
  const payment = c.get('payment') as PaymentClient | undefined;
  if (payment) {
    try {
      const meter = await ensureMeter(payment);
      const customer = await payment.ensureCustomer(userDid);
      const [summary, pending] = await Promise.all([
        payment.getCreditSummary(customer.id),
        payment.getPendingAmount(customer.id),
      ]);
      const currencyId = meter?.currency_id;
      const remainingAmount = parseFloat(summary?.[currencyId]?.remainingAmount ?? '0');
      const pendingAmount = parseFloat(pending?.[currencyId] ?? '0');
      return c.json({ balance: Math.max(0, remainingAmount - pendingAmount) });
    } catch { /* fall through to local */ }
  }
  const balance = await getCreditBalance(db, userDid);
  return c.json({ balance: balance.balance });
});

// GET /api/user/admin/preferences - Get app preferences
routes.get('/admin/preferences', async (c) => {
  if (!isAdminUser(c)) return c.json({ error: 'Admin access required' }, 403);
  return c.json(await getPreferences(c.env.AUTH_KV));
});

// PUT /api/user/admin/preferences - Update app preferences
routes.put('/admin/preferences', async (c) => {
  if (!isAdminUser(c)) return c.json({ error: 'Admin access required' }, 403);
  const updates = await c.req.json<Record<string, unknown>>();
  const result = await setPreferences(c.env.AUTH_KV, updates);
  return c.json(result);
});

// POST /api/user/admin/user-info - Batch fetch user info
routes.post('/admin/user-info', async (c) => {
  const body = await c.req
    .json<{ userDids?: string[]; userDid?: string; email?: string }>()
    .catch(() => ({} as { userDids?: string[]; userDid?: string; email?: string }));

  // Support single-user lookup by userDid or email
  let dids: string[] = [];
  if (body.userDids) {
    dids = [...new Set(body.userDids.filter(Boolean).slice(0, 200))];
  } else if (body.userDid) {
    dids = [body.userDid];
  }

  // Lookup by email via blocklet-service
  if (dids.length === 0 && body.email && c.env.BLOCKLET_SERVICE) {
    const bsClient = createBlockletServiceClient(c.env.BLOCKLET_SERVICE);
    const user = await bsClient.getUserByEmail(body.email);
    if (user) dids = [user.did];
  }

  if (dids.length === 0) {
    return c.json({ users: [] });
  }

  // Batch-fetch user profiles from blocklet-service
  type ProfileInfo = { id: string; name: string | null; email: string | null; avatar: string | null };
  const profileMap = new Map<string, ProfileInfo>();
  if (c.env.BLOCKLET_SERVICE) {
    const bsClient = createBlockletServiceClient(c.env.BLOCKLET_SERVICE);
    // Parallel fetch, capped at 200 DIDs (already sliced above)
    const results = await Promise.allSettled(dids.map((did) => bsClient.getUserProfile(did)));
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === 'fulfilled' && r.value) {
        profileMap.set(dids[i]!, {
          id: r.value.did,
          name: r.value.fullName ?? null,
          email: r.value.email ?? null,
          avatar: r.value.avatar ?? null,
        });
      }
    }
  }

  // Batch-fetch credit balances
  const db = c.get('db');
  const balanceMap = new Map<string, { balance: string; totalGranted: string; totalUsed: string }>();
  try {
    const accounts = await db
      .select({
        userDid: creditAccounts.userDid,
        balance: creditAccounts.balance,
        totalGranted: creditAccounts.totalGranted,
        totalUsed: creditAccounts.totalUsed,
      })
      .from(creditAccounts)
      .where(or(...dids.map((did) => eq(creditAccounts.userDid, did))));
    for (const acct of accounts) {
      balanceMap.set(acct.userDid, acct);
    }
  } catch {
    // credit table may not exist yet
  }

  return c.json({
    users: dids.map((did) => {
      const profile = profileMap.get(did);
      const credit = balanceMap.get(did);
      return {
        did,
        fullName: profile?.name || (did.startsWith('dev:') ? `Dev ${did.split(':')[1]}` : did.slice(0, 12)),
        email: profile?.email || '',
        avatar: profile?.avatar || '',
        creditBalance: credit
          ? {
              balance: parseFloat(credit.balance),
              total: parseFloat(credit.totalGranted),
              used: parseFloat(credit.totalUsed),
            }
          : null,
      };
    }),
  });
});

export default routes;
