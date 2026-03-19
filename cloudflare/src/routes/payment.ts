import { Hono } from 'hono';

import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

// All payment routes proxy back to Blocklet Server
routes.all('/*', async (c) => {
  const origin = c.env.BLOCKLET_SERVER_ORIGIN;
  if (!origin) {
    return c.json({ error: 'Payment service not configured (BLOCKLET_SERVER_ORIGIN not set)' }, 503);
  }

  const url = new URL(c.req.url);
  const targetUrl = `${origin}${url.pathname}${url.search}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    // Remove host header to avoid conflicts
    headers.delete('host');

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    });

    // Forward response with original headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('transfer-encoding'); // Workers handle this

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
