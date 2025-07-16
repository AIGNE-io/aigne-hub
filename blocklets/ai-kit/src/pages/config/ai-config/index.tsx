import { useTransitionContext } from '@app/components/loading/progress-bar';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Tabs from '@arcblock/ux/lib/Tabs';
import { Stack } from '@mui/material';
import React, { isValidElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const pages = {
  providers: React.lazy(() => import('./ai-providers')),
  models: React.lazy(() => import('./ai-model-rates')),
};

export default function AIConfig() {
  const navigate = useNavigate();
  const { t } = useLocaleContext();
  const { page = 'providers' } = useParams();
  const { startTransition } = useTransitionContext();

  // @ts-ignore
  const TabComponent = pages[page] || pages.products;
  const tabs = [
    { label: t('providerName'), value: 'providers' },
    { label: t('config.modelRates.title'), value: 'models' },
  ];

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'flex-start',
          justifyContent: 'end',
          flexWrap: 'wrap',
          mb: 1,
        }}>
        {/* @ts-ignore */}
        <Tabs
          // @ts-ignore
          tabs={tabs}
          // @ts-ignore
          current={page}
          // @ts-ignore
          onChange={(newTab: string) => startTransition(() => navigate(`/config/ai-config/${newTab}`))}
          scrollButtons="auto"
          variant="scrollable"
          sx={{
            flex: '1 0 auto',

            maxWidth: '100%',
            '.MuiTab-root': {
              color: 'text.lighter',
            },
            '.MuiTabs-indicator': {
              display: 'none',
            },
            '.Mui-selected': {
              fontSize: 24,
              color: 'text.primary',
            },
            '.MuiTabs-hideScrollbar': {
              border: 'none !important',
            },
            '.MuiTouchRipple-root': {
              display: 'none',
            },
          }}
        />
      </Stack>
      {isValidElement(TabComponent) ? TabComponent : <TabComponent />}
    </>
  );
}
