import { Hono } from 'hono';

import { createGitHubProvider } from './providers/github';
import { createGoogleProvider } from './providers/google';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSession,
  getSessionCookie,
  getTokenFromRequest,
} from './session';
import type { AuthConfig, AuthUser } from './types';

// KV keys for OAuth state
const STATE_PREFIX = 'oauth_state:';
const STATE_TTL = 600; // 10 minutes

export function createAuthRoutes(config: AuthConfig): Hono {
  const app = new Hono();

  // --- Google OAuth ---
  if (config.providers.google) {
    const google = createGoogleProvider(config);

    app.get('/auth/login/google', async (c) => {
      const { url, state, codeVerifier } = google.getAuthorizationUrl();

      // Store state + codeVerifier in KV
      await config.session.kvBinding.put(
        `${STATE_PREFIX}${state}`,
        JSON.stringify({ provider: 'google', codeVerifier }),
        { expirationTtl: STATE_TTL }
      );

      return c.redirect(url.toString());
    });

    app.get('/auth/callback/google', async (c) => {
      const code = c.req.query('code');
      const state = c.req.query('state');

      if (!code || !state) {
        return c.json({ error: 'Missing code or state' }, 400);
      }

      // Verify state
      const stateData = await config.session.kvBinding.get(`${STATE_PREFIX}${state}`);
      if (!stateData) {
        return c.json({ error: 'Invalid or expired state' }, 400);
      }
      await config.session.kvBinding.delete(`${STATE_PREFIX}${state}`);

      const { codeVerifier } = JSON.parse(stateData);

      try {
        const user = await google.handleCallback(code, codeVerifier);
        const resolvedUser = await upsertUser(user, config);
        const token = await createSession(resolvedUser, config);

        return new Response(null, {
          status: 302,
          headers: {
            Location: '/',
            'Set-Cookie': getSessionCookie(token, config),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth callback failed';
        return c.json({ error: message }, 401);
      }
    });
  }

  // --- GitHub OAuth ---
  if (config.providers.github) {
    const github = createGitHubProvider(config);

    app.get('/auth/login/github', async (c) => {
      const { url, state } = github.getAuthorizationUrl();

      await config.session.kvBinding.put(`${STATE_PREFIX}${state}`, JSON.stringify({ provider: 'github' }), {
        expirationTtl: STATE_TTL,
      });

      return c.redirect(url.toString());
    });

    app.get('/auth/callback/github', async (c) => {
      const code = c.req.query('code');
      const state = c.req.query('state');

      if (!code || !state) {
        return c.json({ error: 'Missing code or state' }, 400);
      }

      const stateData = await config.session.kvBinding.get(`${STATE_PREFIX}${state}`);
      if (!stateData) {
        return c.json({ error: 'Invalid or expired state' }, 400);
      }
      await config.session.kvBinding.delete(`${STATE_PREFIX}${state}`);

      try {
        const user = await github.handleCallback(code);
        const resolvedUser = await upsertUser(user, config);
        const token = await createSession(resolvedUser, config);

        return new Response(null, {
          status: 302,
          headers: {
            Location: '/',
            'Set-Cookie': getSessionCookie(token, config),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth callback failed';
        return c.json({ error: message }, 401);
      }
    });
  }

  // --- Session endpoints ---
  app.get('/auth/session', async (c) => {
    const token = getTokenFromRequest(c.req.raw);
    if (!token) {
      return c.json({ user: null }, 401);
    }

    const user = await getSession(token, config);
    if (!user) {
      return c.json({ user: null }, 401);
    }

    return c.json({ user });
  });

  app.post('/auth/logout', async (c) => {
    const token = getTokenFromRequest(c.req.raw);
    if (token) {
      await destroySession(token, config);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(),
      },
    });
  });

  return app;
}

// --- User upsert helper ---
async function upsertUser(user: AuthUser, config: AuthConfig): Promise<AuthUser> {
  if (!config.d1Binding) return user;

  // Check if user exists by provider ID
  const existing = await config.d1Binding
    .prepare('SELECT * FROM AuthUsers WHERE providerId = ? AND provider = ?')
    .bind(user.providerId, user.provider)
    .first<AuthUser>();

  if (existing) {
    // Update existing user
    await config.d1Binding
      .prepare('UPDATE AuthUsers SET name = ?, avatar = ?, email = ?, updatedAt = ? WHERE id = ?')
      .bind(user.name, user.avatar || null, user.email, new Date().toISOString(), existing.id)
      .run();
    return { ...existing, name: user.name, avatar: user.avatar, email: user.email };
  }

  // Also check by email (link accounts)
  const byEmail = await config.d1Binding
    .prepare('SELECT * FROM AuthUsers WHERE email = ?')
    .bind(user.email)
    .first<AuthUser>();

  if (byEmail) {
    return byEmail;
  }

  // Create new user
  await config.d1Binding
    .prepare(
      'INSERT INTO AuthUsers (id, email, name, avatar, provider, providerId, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      user.id,
      user.email,
      user.name,
      user.avatar || null,
      user.provider,
      user.providerId,
      user.role,
      user.createdAt,
      user.updatedAt
    )
    .run();

  if (config.onUserCreated) {
    await config.onUserCreated(user);
  }

  return user;
}
