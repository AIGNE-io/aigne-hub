import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Layout from '../../../components/layout/admin';
import { useSessionContext } from '../../../contexts/session';

export default function WrappedLayout({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.user && ['owner', 'admin'].includes(session.user.role) === false) {
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user]);

  return <Layout>{children}</Layout>;
}
