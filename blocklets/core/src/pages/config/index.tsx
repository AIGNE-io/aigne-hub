import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Tabs from '@arcblock/ux/lib/Tabs';
import { Stack } from '@mui/material';
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Layout from '../../components/layout/admin';
import ProgressBar, { useTransitionContext } from '../../components/loading/progress-bar';
import { useSessionContext } from '../../contexts/session';

const pages = {
  overview: React.lazy(() => import('./overview')),
  'ai-config': React.lazy(() => import('./ai-config')),
};

function Integrations() {
  const navigate = useNavigate();
  const { t } = useLocaleContext();
  const { group = 'overview' } = useParams();
  const { isPending, startTransition } = useTransitionContext();

  const onTabChange = (newTab: string) => {
    startTransition(() => {
      navigate(`/config/${newTab}`);
    });
  };

  // @ts-ignore
  const TabComponent = pages[group] || pages.overview;
  const tabs = [
    { label: t('quickStarts'), value: 'overview' },
    { label: t('aiConfig'), value: 'ai-config' },
  ];

  return (
    <>
      <ProgressBar pending={isPending} />
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          justifyContent: 'end',
          flexWrap: 'wrap',
          mt: 1,
          pb: 2,
        }}>
        <Tabs
          tabs={tabs}
          current={group}
          onChange={onTabChange}
          scrollButtons="auto"
          variant="scrollable"
          sx={{
            flex: '1 0 auto',
            maxWidth: '100%',
            '.MuiTab-root': {
              marginBottom: '12px',
              fontWeight: '500',
              color: 'text.lighter',
              '&.Mui-selected': {
                color: 'primary.main',
              },
            },
            '.MuiTouchRipple-root': {
              display: 'none',
            },
          }}
        />
      </Stack>
      <div className="page-content">{React.isValidElement(TabComponent) ? TabComponent : <TabComponent />}</div>
    </>
  );
}

export default function WrappedIntegrations() {
  const { session } = useSessionContext();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.user && ['owner', 'admin'].includes(session.user.role) === false) {
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user]);
  return (
    <Layout>
      <Integrations />
    </Layout>
  );
}
