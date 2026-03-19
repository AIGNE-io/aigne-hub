import { GitHub } from 'arctic';

import type { AuthConfig, AuthUser } from '../types';

export function createGitHubProvider(config: AuthConfig) {
  const { clientId, clientSecret } = config.providers.github!;
  const redirectUri = `${config.baseUrl}/auth/callback/github`;
  const github = new GitHub(clientId, clientSecret, redirectUri);

  return {
    getAuthorizationUrl(): { url: URL; state: string } {
      const state = crypto.randomUUID();
      const url = github.createAuthorizationURL(state, ['user:email', 'read:user']);
      return { url, state };
    },

    async handleCallback(code: string): Promise<AuthUser> {
      const tokens = await github.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();

      // Fetch user profile
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'AIGNE-Hub-Auth',
        },
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub user API failed: ${userResponse.status}`);
      }

      const profile = (await userResponse.json()) as {
        id: number;
        login: string;
        name: string | null;
        email: string | null;
        avatar_url: string;
      };

      // If email is private, fetch from emails endpoint
      let { email } = profile;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'AIGNE-Hub-Auth',
          },
        });

        if (emailsResponse.ok) {
          const emails = (await emailsResponse.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primary = emails.find((e) => e.primary && e.verified);
          email = primary?.email || emails[0]?.email || `${profile.login}@github.noemail`;
        }
      }

      const now = new Date().toISOString();
      const isAdmin = config.adminEmails?.includes(email || '') ?? false;

      return {
        id: `github:${profile.id}`,
        email: email || `${profile.login}@github.noemail`,
        name: profile.name || profile.login,
        avatar: profile.avatar_url,
        provider: 'github',
        providerId: String(profile.id),
        role: isAdmin ? 'admin' : 'member',
        createdAt: now,
        updatedAt: now,
      };
    },
  };
}
