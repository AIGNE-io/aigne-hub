import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Tabs from '@arcblock/ux/lib/Tabs';
import { useAppInfo } from '@blocklet/ui-react/lib/Dashboard';
import { Box, Stack } from '@mui/material';
import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import Layout from '../../components/layout/admin';
import ProgressBar, { useTransitionContext } from '../../components/loading/progress-bar';
import { useIsRole, useSessionContext } from '../../contexts/session';

type TabConfig = {
  value: string;
  label: (t: any) => string;
  adminOnly?: boolean;
};

const tabConfigs: TabConfig[] = [
  {
    value: 'overview',
    label: (t) => t('quickStarts'),
  },
  {
    value: 'ai-config',
    label: (t) => t('aiConfig'),
  },
  {
    value: 'usage',
    label: (t) => t('usage'),
    adminOnly: true,
  },
  {
    value: 'playground',
    label: (t) => t('playground'),
    adminOnly: true,
  },
];

const hiddenTabRoutes: Record<string, string> = {
  projects: 'usage',
};

const resolveConfigGroup = (pathname: string) => {
  const normalized = pathname.startsWith('/config') ? pathname.slice('/config'.length) : pathname;
  const trimmed = normalized.replace(/^\/+/, '');
  return trimmed.split('/')[0] || 'overview';
};

function Integrations() {
  const navigate = useNavigate();
  const { t } = useLocaleContext();
  const { pathname } = useLocation();
  const { updateAppInfo } = useAppInfo();
  const { isPending, startTransition } = useTransitionContext();
  const isAdmin = useIsRole('owner', 'admin');
  const group = resolveConfigGroup(pathname);

  const onTabChange = (newTab: string) => {
    startTransition(() => navigate(`/config/${newTab}`));
  };

  const availableTabs = tabConfigs.filter((config) => (config.adminOnly ? isAdmin : true));
  const availableTabValues = new Set(availableTabs.map((config) => config.value));
  const mappedGroup = hiddenTabRoutes[group] || group;
  const currentTab = availableTabValues.has(mappedGroup) ? mappedGroup : availableTabs[0]?.value || 'overview';
  const tabs = availableTabs.map((config) => ({
    label: config.label(t),
    value: config.value,
  }));

  useEffect(() => {
    updateAppInfo({
      description: t('welcomeDesc2'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

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
          mt: -2,
        }}>
        <Tabs
          tabs={tabs}
          current={currentTab}
          onChange={onTabChange}
          scrollButtons="auto"
          variant="scrollable"
          sx={{
            pb: 2,
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

      <Box component="main" sx={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user]);

  return (
    <Layout>
      <Integrations />
    </Layout>
  );
}
