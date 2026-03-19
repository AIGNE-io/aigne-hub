import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

interface SessionContextValue {
  session: Session;
  login: () => void;
  logout: () => void;
  // compat fields that original did-connect-react provides
  connectApi: unknown;
}

const SessionContext = createContext<SessionContextValue>({
  session: { user: null, token: '', loading: true },
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

  const login = useCallback(() => {
    window.location.href = '/auth/login/google';
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
        login,
        logout,
      },
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
