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
  [key: string]: unknown;
}

interface Session {
  user: SessionUser | null;
  token: string;
  loading: boolean;
  initialized: boolean;
  // Required by @blocklet/ui-react Header → SessionUser → un-login.js
  login: (...args: unknown[]) => void;
  logout: () => void;
  // Required by @blocklet/ui-react Header → SessionUser → un-login.js (quick login)
  getUserSessions: () => Promise<unknown[]>;
  loginUserSession: (session: unknown) => Promise<void>;
  // Required by @blocklet/ui-react Header → SessionUser → logged-in.js
  switchDid: (...args: unknown[]) => void;
  switchProfile: (...args: unknown[]) => void;
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
  session: Session;
  api: typeof api;
  events: SimpleEvents;
  login: (...args: unknown[]) => void;
  logout: () => void;
  connectApi: unknown;
}

const SessionContext = createContext<SessionContextValue>({
  session: {
    user: null,
    token: '',
    loading: true,
    initialized: false,
    login: () => {},
    logout: () => {},
    getUserSessions: async () => [],
    loginUserSession: async () => {},
    switchDid: () => {},
    switchProfile: () => {},
  },
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
          const u: SessionUser = {
            did: data.user.did,
            email: data.user.email,
            fullName: data.user.displayName,
            role: data.user.role || 'member',
            avatar: data.user.avatar,
          };
          setUser(u);
          // Auto-create API key for authenticated users so subsequent API calls have Bearer token
          ensureApiKey();
          events.emit('LOGIN', u);
        }
      })
      .catch((err) => {
        console.warn('[session] Failed to fetch DID session:', err?.message || err);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((..._args: unknown[]) => {
    // DID Connect login — redirect to blocklet-service login page
    // The real session.login(callback, {openMode}) opens a DID Connect dialog,
    // but in CF mode we redirect to blocklet-service's built-in login page which
    // supports Passkey / DID Wallet / OAuth.
    window.location.href = '/.well-known/service/login';
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(API_KEY_STORAGE);
    events.emit('LOGOUT');
    window.location.href = '/.well-known/service/api/did/logout';
  }, []);

  // Quick login: return empty — blocklet-service doesn't expose user sessions to CF workers
  const getUserSessions = useCallback(async () => [], []);
  const loginUserSession = useCallback(async () => {}, []);

  // switchDid / switchProfile: redirect to blocklet-service profile page
  const switchDid = useCallback((..._args: unknown[]) => {
    window.location.href = '/.well-known/service/admin#profile';
  }, []);
  const switchProfile = useCallback((..._args: unknown[]) => {
    window.location.href = '/.well-known/service/admin#profile';
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
        getUserSessions,
        loginUserSession,
        switchDid,
        switchProfile,
      },
      events,
      api,
      login,
      logout,
      connectApi: null,
    }),
    [user, loading, login, logout, getUserSessions, loginUserSession, switchDid, switchProfile]
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
