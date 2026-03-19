import React, { createContext, useContext } from 'react';

interface SessionUser {
  did: string;
  email?: string;
  fullName?: string;
  role: string;
  avatar?: string;
}

interface SessionState {
  user: SessionUser | null;
  token: string;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

const defaultSession: SessionState = {
  user: null,
  token: '',
  loading: false,
  login: () => {
    window.location.href = '/auth/login/google';
  },
  logout: () => {
    window.location.href = '/auth/logout';
  },
};

const SessionContext = createContext<SessionState>(defaultSession);

function SessionProvider({ children }: { children: React.ReactNode }) {
  // TODO: Replace with real CF Auth SDK session when available
  return <SessionContext.Provider value={defaultSession}>{children}</SessionContext.Provider>;
}

function SessionConsumer({ children }: { children: (session: SessionState) => React.ReactNode }) {
  return <SessionContext.Consumer>{children}</SessionContext.Consumer>;
}

function withSession<P extends object>(Component: React.ComponentType<P & { session: SessionState }>) {
  return function WrappedComponent(props: P) {
    const session = useContext(SessionContext);
    return <Component {...props} session={session} />;
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
