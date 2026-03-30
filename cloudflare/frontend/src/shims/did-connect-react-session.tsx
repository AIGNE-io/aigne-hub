import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const API_KEY_STORAGE = 'aigne_api_key';

const api = axios.create({ baseURL: window?.blocklet?.prefix || '/', timeout: 30000 });

// Auto-attach API Key from localStorage to every request
api.interceptors.request.use((config) => {
  const key = localStorage.getItem(API_KEY_STORAGE);
  if (key) {
    config.headers.Authorization = `Bearer ${key}`;
  }
  return config;
});

/**
 * Get or create an API key for the current session.
 * Creates one automatically on first use (dev convenience).
 */
async function ensureApiKey(): Promise<string> {
  const existing = localStorage.getItem(API_KEY_STORAGE);
  if (existing) return existing;

  try {
    // Relies on login_token cookie for auth (no hardcoded dev headers)
    const res = await axios.post(
      '/api/api-keys',
      { name: 'frontend-auto' },
      { withCredentials: true }
    );
    const key = res.data?.apiKey;
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
      return key;
    }
  } catch {
    // API key creation failed, continue without
  }
  return '';
}

interface SessionUser {
  did: string;
  email?: string;
  fullName?: string;
  role: string;
  avatar?: string;
}

interface Session {
  user: SessionUser | null;
  token: string;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

// Simple EventEmitter stub for session events
class SimpleEvents {
  private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      handler(...args);
      this.off(event, wrapped);
    };
    this.on(event, wrapped);
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter((h) => h !== handler);
    }
  }

  emit(event: string, ...args: unknown[]) {
    (this.handlers[event] || []).forEach((h) => h(...args));
  }
}

const events = new SimpleEvents();

interface SessionContextValue {
  session: Session & { initialized: boolean };
  api: typeof api;
  events: SimpleEvents;
  login: (...args: unknown[]) => void;
  logout: () => void;
  connectApi: unknown;
}

const SessionContext = createContext<SessionContextValue>({
  session: { user: null, token: '', loading: true, initialized: false, login: () => {}, logout: () => {} },
  api,
  events,
  login: () => {},
  logout: () => {},
  connectApi: null,
});

function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check DID Connect session via blocklet-service
    fetch('/.well-known/service/api/did/session', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        return { authenticated: false, user: null };
      })
      .then((data: { authenticated?: boolean; user?: { did: string; displayName?: string; role?: string; avatar?: string; email?: string } }) => {
        if (data.authenticated && data.user) {
          setUser({
            did: data.user.did,
            email: data.user.email,
            fullName: data.user.displayName,
            role: data.user.role || 'member',
            avatar: data.user.avatar,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(() => {
    // Redirect to DID Connect login page (Passkey / DID Wallet / OAuth)
    window.location.href = '/.well-known/service/login';
  }, []);

  const logout = useCallback(() => {
    // DID Connect logout — redirect-based (clears login_token cookie)
    setUser(null);
    window.location.href = '/.well-known/service/api/did/logout';
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session: {
        user,
        token: user ? 'session-active' : '',
        loading,
        initialized: !loading,
        login,
        logout,
      },
      events,
      api,
      login,
      logout,
      connectApi: null,
    }),
    [user, loading, login, logout]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function SessionConsumer({ children }: { children: (value: SessionContextValue) => React.ReactNode }) {
  return <SessionContext.Consumer>{children}</SessionContext.Consumer>;
}

function withSession<P extends object>(Component: React.ComponentType<P & { session: SessionContextValue }>) {
  return function WrappedComponent(props: P) {
    const ctx = useContext(SessionContext);
    return <Component {...props} session={ctx} />;
  };
}

export function createAuthServiceSessionContext() {
  return {
    SessionProvider,
    SessionContext,
    SessionConsumer,
    withSession,
  };
}

export { SessionProvider, SessionContext, SessionConsumer, withSession };
export default { createAuthServiceSessionContext };
