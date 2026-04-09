import type { Context } from 'hono';
import { Hono } from 'hono';

import { grantCredits } from '../libs/credit';
import { addNotification, buildCreditGrantedNotification } from '../libs/notifications';
import type { PaymentClient } from '../libs/payment';
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

// POST /api/payment/webhook - Payment Kit webhook
// Validates webhook signature via HMAC-SHA256 shared secret
routes.post('/webhook', async (c) => {
  let body: any;

  // Verify webhook signature in production
  const webhookSecret = c.env.PAYMENT_WEBHOOK_SECRET;
  if (c.env.ENVIRONMENT === 'production') {
    if (!webhookSecret) {
      return c.json({ error: 'Webhook not configured' }, 503);
    }
    const signature = c.req.header('x-webhook-signature');
    if (!signature) {
      return c.json({ error: 'Missing signature' }, 401);
    }
    const rawBody = await c.req.text();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (signature !== expected) {
      return c.json({ error: 'Invalid signature' }, 401);
    }
    body = JSON.parse(rawBody);
  } else {
    body = await c.req.json();
  }

  const event = body.event as string;
  const data = body.data;
  if (!event || !data) return c.json({ received: true, ignored: true });

  const kv = c.env.AUTH_KV;

  if (event === 'payment.completed' && data.userDid && data.amount) {
    const db = c.get('db');
    await grantCredits(db, data.userDid, data.amount, {
      source: 'payment',
      paymentId: data.paymentId,
      description: `Payment: ${data.amount} credits`,
    });
    await addNotification(kv, data.userDid, buildCreditGrantedNotification({
      amount: data.amount,
    }));
    return c.json({ received: true });
  }

  // For Payment Kit events, resolve the user DID from customer object or nested fields.
  // Payment Kit's customer_id is an internal ID (cus_xxx), not the user DID.
  // The webhook payload may include customer.did or customer_did depending on event type.
  const resolveUserDid = (): string | null =>
    data.customer?.did || data.customer_did || data.userDid || null;

  if (event === 'customer.credit_grant.granted') {
    const userDid = resolveUserDid();
    if (!userDid) return c.json({ received: true, ignored: true, reason: 'no user DID' });
    const amount = data.amount || data.credit_amount;
    const isWelcome = data.metadata?.welcomeCredit === true;
    if (amount) {
      await addNotification(kv, userDid, buildCreditGrantedNotification({
        amount,
        isWelcome,
      }));
    }
    return c.json({ received: true });
  }

  if (event === 'checkout.session.completed') {
    const userDid = resolveUserDid();
    if (!userDid) return c.json({ received: true, ignored: true, reason: 'no user DID' });
    await addNotification(kv, userDid, {
      type: 'payment_completed',
      title: 'Payment successful',
      message: 'Your payment has been processed. Credits will be added shortly.',
      link: '/credit-usage',
    });
    return c.json({ received: true });
  }

  return c.json({ received: true, ignored: true });
});

// Proxy remaining payment routes to Payment Kit or Blocklet Server
routes.all('/*', async (c) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _payment = c.get('payment') as PaymentClient | undefined;

  // Fallback: proxy to Blocklet Server if configured
  const origin = c.env.BLOCKLET_SERVER_ORIGIN;
  if (origin) {
    const url = new URL(c.req.url);
    const targetUrl = `${origin}${url.pathname}${url.search}`;
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
        signal: AbortSignal.timeout(15000),
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
  }

  return c.json({ error: 'Use /payment/* gateway for Payment Kit operations' }, 404);
});

export default routes;
