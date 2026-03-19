import { Google } from 'arctic';

import type { AuthConfig, AuthUser } from '../types';

export function createGoogleProvider(config: AuthConfig) {
  const { clientId, clientSecret } = config.providers.google!;
  const redirectUri = `${config.baseUrl}/auth/callback/google`;
  const google = new Google(clientId, clientSecret, redirectUri);

  return {
    getAuthorizationUrl(): { url: URL; state: string; codeVerifier: string } {
      const state = crypto.randomUUID();
      const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
      const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);
      return { url, state, codeVerifier };
    },

    async handleCallback(code: string, codeVerifier: string): Promise<AuthUser> {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      const accessToken = tokens.accessToken();

      // Fetch user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Google userinfo failed: ${response.status}`);
      }

      const profile = (await response.json()) as {
        id: string;
        email: string;
        name: string;
        picture?: string;
      };

      const now = new Date().toISOString();
      const isAdmin = config.adminEmails?.includes(profile.email) ?? false;

      return {
        id: `google:${profile.id}`,
        email: profile.email,
        name: profile.name,
        avatar: profile.picture,
        provider: 'google',
        providerId: profile.id,
        role: isAdmin ? 'admin' : 'member',
        createdAt: now,
        updatedAt: now,
      };
    },
  };
}
