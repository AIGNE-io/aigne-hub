import type { Context } from 'hono';
import { Hono } from 'hono';

import { grantCredits } from '../libs/credit';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

function isAdminUser(c: Context<HonoEnv>): boolean {
  if (c.env.ENVIRONMENT !== 'production') return true;
  const user = c.get('user') as { role?: string } | undefined;
  const role = user?.role || c.req.header('x-user-role');
  return role === 'admin' || role === 'owner';
}

// POST /api/payment/grant - Admin grant credits to a user
routes.post('/grant', async (c) => {
  if (!isAdminUser(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json<{
    userDid: string;
    amount: number;
    description?: string;
  }>();

  if (!body.userDid || !body.amount || body.amount <= 0) {
    return c.json({ error: 'userDid and positive amount are required' }, 400);
  }

  const db = c.get('db');
  const result = await grantCredits(db, body.userDid, body.amount, {
    source: 'admin',
    description: body.description || `Admin grant: ${body.amount} credits`,
  });

  return c.json({ success: true, balance: result.balance });
});

// POST /api/payment/webhook - Payment Kit webhook (mock)
// In production, this would validate Stripe/Payment Kit signatures
routes.post('/webhook', async (c) => {
  const body = await c.req.json<{
    event: string;
    data: {
      userDid: string;
      amount: number;
      paymentId: string;
    };
  }>();

  if (body.event === 'payment.completed' && body.data) {
    const db = c.get('db');
    await grantCredits(db, body.data.userDid, body.data.amount, {
      source: 'payment',
      paymentId: body.data.paymentId,
      description: `Payment: ${body.data.amount} credits`,
    });
    return c.json({ received: true });
  }

  return c.json({ received: true, ignored: true });
});

// Fallback: proxy to Blocklet Server payment if configured
routes.all('/*', async (c) => {
  const origin = c.env.BLOCKLET_SERVER_ORIGIN;
  if (!origin) {
    return c.json({ error: 'Payment service not configured' }, 503);
  }

  const url = new URL(c.req.url);
  const targetUrl = `${origin}${url.pathname}${url.search}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('transfer-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return c.json({ error: 'Payment service unavailable' }, 502);
  }
});

export default routes;
