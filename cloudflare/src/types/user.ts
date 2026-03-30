/**
 * App-level user type — replaces @aigne/cf-auth AuthUser.
 * Supports DID auth, API key, OAuth, and dev-mode providers.
 */
export interface AppUser {
  /** User DID or legacy provider ID */
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'did' | 'api-key' | 'google' | 'github' | 'dev';
  providerId: string;
  role: 'admin' | 'member' | 'guest';
  createdAt: string;
  updatedAt: string;
}
