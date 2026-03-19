export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github';
  providerId: string;
  role: 'admin' | 'member' | 'guest';
  createdAt: string;
  updatedAt: string;
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: string;
  jti: string; // session id for KV lookup
  iat: number;
  exp: number;
}

export interface AuthConfig {
  providers: {
    google?: {
      clientId: string;
      clientSecret: string;
    };
    github?: {
      clientId: string;
      clientSecret: string;
    };
  };
  session: {
    kvBinding: KVNamespace;
    secret: string;
    maxAge?: number; // seconds, default 7 days
  };
  d1Binding?: D1Database;
  baseUrl: string; // e.g. https://aigne-hub.workers.dev
  adminEmails?: string[]; // emails that get admin role
  onUserCreated?: (user: AuthUser) => Promise<void>;
}

export interface OAuthState {
  provider: string;
  returnTo: string;
  csrfToken: string;
}
