import type { Context } from 'hono';
import { Hono } from 'hono';

import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

// GET /api/user/profile
routes.get('/profile', async (c: Context<HonoEnv>) => {
  const user = c.get('user') as { id?: string; email?: string; name?: string; role?: string } | undefined;
  const did = user?.id || c.req.header('x-user-did');

  if (!did) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  return c.json({
    did,
    email: user?.email || '',
    name: user?.name || '',
    role: user?.role || 'member',
  });
});

// GET /api/app/status
routes.get('/app/status', async (c) => {
  return c.json({
    status: 'running',
    creditBasedBilling: true,
    version: '0.1.0',
  });
});

export default routes;
