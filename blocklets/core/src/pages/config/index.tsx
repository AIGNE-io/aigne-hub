import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Tabs from '@arcblock/ux/lib/Tabs';
import { Box, Stack } from '@mui/material';
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Layout from '../../components/layout/admin';
import ProgressBar, { useTransitionContext } from '../../components/loading/progress-bar';
import { useIsRole, useSessionContext } from '../../contexts/session';

const pages: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  overview: React.lazy(() => import('./overview')),
  'ai-config': React.lazy(() => import('./ai-config')),
  usage: React.lazy(() => import('../admin/usage')),
  playground: React.lazy(() => import('../playground/chat')),
};

function Integrations() {
  const navigate = useNavigate();
  const { t } = useLocaleContext();
  const { group = 'overview' } = useParams();
  const { isPending, startTransition } = useTransitionContext();
  const isAdmin = useIsRole('owner', 'admin');

  const onTabChange = (newTab: string) => {
    startTransition(() => navigate(`/config/${newTab}`));
  };

  const TabComponent = pages[group] || pages.overview!;
  const tabs = [
    { label: t('quickStarts'), value: 'overview' },
    { label: t('aiConfig'), value: 'ai-config' },
  ];

  if (isAdmin) {
    tabs.push({ label: t('usage'), value: 'usage' });
    tabs.push({ label: t('playground'), value: 'playground' });
  }

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
        }}>
        <Tabs
          tabs={tabs}
          current={group}
          onChange={onTabChange}
          scrollButtons="auto"
          variant="scrollable"
          sx={{
            py: 2,
            px: 3,
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

      <Box component="main" sx={{ flex: 1, overflow: 'auto', px: 3 }}>
        {React.isValidElement(TabComponent) ? TabComponent : <TabComponent />}
      </Box>
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
  }, [session.user]);

  return (
    <Layout>
      <Integrations />
    </Layout>
  );
}
