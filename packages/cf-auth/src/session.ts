import type { AuthConfig, AuthUser, SessionPayload } from './types';

const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function createJWT(payload: Omit<SessionPayload, 'iat' | 'exp'>, config: AuthConfig): Promise<string> {
  const maxAge = config.session.maxAge || DEFAULT_MAX_AGE;
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + maxAge,
  };

  const header = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer as ArrayBuffer
  );
  const body = base64url(new TextEncoder().encode(JSON.stringify(fullPayload)).buffer as ArrayBuffer);
  const signingInput = `${header}.${body}`;

  const key = await getSigningKey(config.session.secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));

  return `${signingInput}.${base64url(signature)}`;
}

export async function verifyJWT(token: string, config: AuthConfig): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;

  const key = await getSigningKey(config.session.secret);
  const signatureBytes = base64urlDecode(sig);
  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(signingInput));

  if (!isValid) return null;

  const payload: SessionPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}

export async function createSession(user: AuthUser, config: AuthConfig): Promise<string> {
  const maxAge = config.session.maxAge || DEFAULT_MAX_AGE;
  const jti = crypto.randomUUID();

  // Store session data in KV
  await config.session.kvBinding.put(`session:${jti}`, JSON.stringify(user), {
    expirationTtl: maxAge,
  });

  // Create JWT
  const token = await createJWT(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      jti,
    },
    config
  );

  return token;
}

export async function getSession(token: string, config: AuthConfig): Promise<AuthUser | null> {
  const payload = await verifyJWT(token, config);
  if (!payload) return null;

  // Verify session exists in KV
  const sessionData = await config.session.kvBinding.get(`session:${payload.jti}`);
  if (!sessionData) return null;

  return JSON.parse(sessionData) as AuthUser;
}

export async function destroySession(token: string, config: AuthConfig): Promise<void> {
  const payload = await verifyJWT(token, config);
  if (payload) {
    await config.session.kvBinding.delete(`session:${payload.jti}`);
  }
}

export function getSessionCookie(token: string, config: AuthConfig): string {
  const maxAge = config.session.maxAge || DEFAULT_MAX_AGE;
  const secure = config.baseUrl.startsWith('https');
  return `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(): string {
  return 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function getTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;

  const match = cookie.match(/auth_token=([^;]+)/);
  return match ? match[1] : null;
}
