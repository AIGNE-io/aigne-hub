import { createAuthServiceSessionContext } from '@arcblock/did-connect/lib/Session';
import { useContext } from 'react';

const { SessionProvider, SessionContext, SessionConsumer, withSession } = createAuthServiceSessionContext();

export function useSessionContext(): any {
  return useContext(SessionContext);
}

export { SessionProvider, SessionContext, SessionConsumer, withSession };

export function useIsRole(...roles: string[]) {
  const { session } = useSessionContext();
  return roles.includes(session.user?.role);
}
