import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { apps } from '../db/schema';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

/**
 * Generate a random API key with prefix
 */
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (const b of bytes) key += chars[b % chars.length];
  return `aigne_${key}`;
}

// POST /api/api-keys - Create a new API key
routes.post('/', async (c: Context<HonoEnv>) => {
  if (c.env.ENVIRONMENT === 'production') {
    const user = c.get('user') as { role?: string } | undefined;
    const role = user?.role || c.req.header('x-user-role');
    if (role !== 'admin' && role !== 'owner') {
      return c.json({ error: 'Admin access required' }, 403);
    }
  }

  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: 'default' }));
  const name = body?.name || 'default';
  const apiKey = generateApiKey();

  const db = c.get('db');

  // Store: id = api key hash (for lookup), publicKey = plaintext key (returned once)
  const keyId = `app:${name}:${Date.now()}`;
  await db.insert(apps).values({
    id: keyId,
    publicKey: apiKey,
  });

  return c.json(
    {
      id: keyId,
      name,
      apiKey, // Only returned once at creation
      message: 'Save this API key - it will not be shown again',
    },
    201
  );
});

// GET /api/api-keys - List API keys (masked)
routes.get('/', async (c: Context<HonoEnv>) => {
  const user = c.get('user') as { role?: string } | undefined;
  const role = user?.role || c.req.header('x-user-role');
  if (role !== 'admin' && role !== 'owner') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const db = c.get('db');
  const keys = await db.select().from(apps);

  return c.json(
    keys.map((k) => ({
      id: k.id,
      keyPreview: k.publicKey ? `${k.publicKey.substring(0, 10)}...${k.publicKey.slice(-4)}` : '',
      createdAt: k.createdAt,
    }))
  );
});

// DELETE /api/api-keys/:id - Revoke an API key
routes.delete('/:id', async (c: Context<HonoEnv>) => {
  const user = c.get('user') as { role?: string } | undefined;
  const role = user?.role || c.req.header('x-user-role');
  if (role !== 'admin' && role !== 'owner') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { id } = c.req.param();
  const db = c.get('db');
  await db.delete(apps).where(eq(apps.id, id));
  return c.json({ message: 'API key revoked' });
});

/**
 * Validate an API key against the database.
 * Returns the app record if valid, null otherwise.
 */
export async function validateApiKey(
  db: ReturnType<typeof import('drizzle-orm/d1').drizzle>,
  apiKey: string
): Promise<{ id: string; publicKey: string | null; name: string | null; userDid: string | null; createdAt: string; updatedAt: string } | null> {
  const results = await db.select().from(apps).where(eq(apps.publicKey, apiKey)).limit(1);
  return results.length > 0 ? results[0] : null;
}

export default routes;
