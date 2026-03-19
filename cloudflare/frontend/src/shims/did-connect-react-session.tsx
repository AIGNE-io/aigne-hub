import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const api = axios.create({ baseURL: window?.blocklet?.prefix || '/', timeout: 30000 });

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
    fetch('/auth/session', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        return { user: null };
      })
      .then((data: { user?: { id: string; email?: string; name?: string; role?: string; avatar?: string } }) => {
        if (data.user) {
          setUser({
            did: data.user.id,
            email: data.user.email,
            fullName: data.user.name,
            role: data.user.role || 'member',
            avatar: data.user.avatar,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((...args: unknown[]) => {
    // In dev mode, use dev-login endpoint for instant admin session
    const isDev = window.location.hostname === 'localhost';
    const opts = (args[1] || {}) as { redirect?: string };
    const redirect = opts.redirect || window.location.href;
    if (isDev) {
      window.location.href = `/auth/dev-login?role=admin&redirect=${encodeURIComponent(redirect)}`;
    } else {
      window.location.href = '/auth/login/google';
    }
  }, []);

  const logout = useCallback(() => {
    fetch('/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      setUser(null);
      window.location.href = '/';
    });
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
