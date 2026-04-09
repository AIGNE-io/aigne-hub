import type { Context } from 'hono';
import { Hono } from 'hono';

import { getInstanceDid } from '../worker';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

const BS_API_BASE = '/.well-known/service/api/access-keys';

/**
 * Proxy API key requests to blocklet-service access key API.
 * blocklet-service handles CRUD, RBAC, audit logging, and instance isolation.
 */
async function proxyToBlockletService(c: Context<HonoEnv>, subpath = ''): Promise<Response> {
  if (!c.env.BLOCKLET_SERVICE) {
    return c.json({ error: 'Blocklet service not configured' }, 503);
  }

  const instanceDid = getInstanceDid();
  const url = new URL(c.req.url);
  const targetUrl = new URL(`${BS_API_BASE}${subpath}${url.search}`, url.origin);
  if (instanceDid) {
    targetUrl.searchParams.set('instanceDid', instanceDid);
  }

  const headers = new Headers(c.req.raw.headers);
  const resp = await c.env.BLOCKLET_SERVICE.fetch(
    new Request(targetUrl.href, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
    })
  );

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  });
}

// GET /api/api-keys — List access keys
routes.get('/', (c) => proxyToBlockletService(c));

// POST /api/api-keys — Create access key
routes.post('/', (c) => proxyToBlockletService(c));

// GET /api/api-keys/:id — Get access key details
routes.get('/:id', (c) => proxyToBlockletService(c, `/${encodeURIComponent(c.req.param('id'))}`));

// PUT /api/api-keys/:id — Update access key
routes.put('/:id', (c) => proxyToBlockletService(c, `/${encodeURIComponent(c.req.param('id'))}`));

// DELETE /api/api-keys/:id — Delete access key
routes.delete('/:id', (c) => proxyToBlockletService(c, `/${encodeURIComponent(c.req.param('id'))}`));

export default routes;
