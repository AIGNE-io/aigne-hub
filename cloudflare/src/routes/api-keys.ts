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

const MAX_KEYS_PER_USER = 5;

// POST /api/api-keys - Create a new API key
routes.post('/', async (c: Context<HonoEnv>) => {
  const user = c.get('user') as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const userDid = user.id;
  const db = c.get('db');

  // Enforce per-user key limit
  const existingKeys = await db.select().from(apps).where(eq(apps.userDid, userDid));
  if (existingKeys.length >= MAX_KEYS_PER_USER) {
    return c.json({ error: `Maximum ${MAX_KEYS_PER_USER} keys per account` }, 400);
  }

  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: 'default' }));
  const name = body?.name || 'default';
  const apiKey = generateApiKey();
  const keyId = `app:${name}:${Date.now()}`;

  await db.insert(apps).values({
    id: keyId,
    publicKey: apiKey,
    name,
    userDid,
  });

  // Register as a project so it appears in usage analytics
  try {
    const { projects } = await import('../db/schema');
    await db.insert(projects).values({
      appDid: keyId,
      appName: name,
    }).onConflictDoNothing();
  } catch {
    // Projects table insert is best-effort
  }

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
  const user = c.get('user') as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const db = c.get('db');
  const role = user.role || c.req.header('x-user-role');
  const isAdmin = role === 'admin' || role === 'owner';
  const showAll = isAdmin && c.req.query('all') === 'true';

  let keys;
  if (showAll) {
    keys = await db.select().from(apps);
  } else {
    keys = await db.select().from(apps).where(eq(apps.userDid, user.id));
  }

  return c.json(
    keys.map((k) => ({
      id: k.id,
      name: k.name || k.id.split(':')[1] || 'default',
      keyPreview: k.publicKey ? `${k.publicKey.substring(0, 10)}...${k.publicKey.slice(-4)}` : '',
      createdAt: k.createdAt,
    }))
  );
});

// DELETE /api/api-keys/:id - Revoke an API key
routes.delete('/:id', async (c: Context<HonoEnv>) => {
  const user = c.get('user') as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const { id } = c.req.param();
  const db = c.get('db');
  const role = user.role || c.req.header('x-user-role');
  const isAdmin = role === 'admin' || role === 'owner';

  // Verify ownership unless admin
  if (!isAdmin) {
    const [key] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    if (!key || key.userDid !== user.id) {
      return c.json({ error: 'Key not found or access denied' }, 404);
    }
  }

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
