import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Layout from '../../../components/layout/admin';
import { useSessionContext } from '../../../contexts/session';

const ADMIN_ROLES = ['owner', 'admin'] as const;

export default function WrappedLayout({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session.user || !ADMIN_ROLES.includes(session.user.role)) {
      navigate('/');
    }
  }, [session.user]);

  return <Layout>{children}</Layout>;
}
