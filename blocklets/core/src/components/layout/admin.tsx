/* eslint-disable react-hooks/exhaustive-deps */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import { Typography } from '@mui/material';
// eslint-disable-next-line import/no-extraneous-dependencies
import { styled } from '@mui/system';
import { useEffect } from 'react';

import { useSessionContext } from '../../contexts/session';

const Root = styled(Dashboard)<{ padding: string }>`
  width: 100%;
  background-color: ${({ theme }) => theme.palette.background.default};

  > .dashboard-body > .dashboard-main {
    overflow: hidden;

    > .dashboard-content {
      padding: 0;
      height: 0;
      display: flex;
      flex-direction: column;

      .MuiTab-root {
        padding: 0;
        margin-right: 24px;
        min-height: 32px;
        min-width: auto;
        font-size: 0.875rem;
      }
      .page-content .MuiTab-root {
        font-size: 0.875rem;
        &.Mui-selected {
          font-size: 1.125rem;
        }
      }

      .MuiTabs-scroller {
        border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
      }

      .MuiToggleButton-root {
        padding: 4px 16px;
      }
    }

    > .dashboard-footer {
      margin-top: 0;
      padding: 8px 0;

      .logo-container {
        svg {
          height: 100%;
        }
      }
    }
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.values.md}px) {
    > .dashboard-body > .dashboard-main > .dashboard-content {
      padding: ${(props) => props.padding || '0 16px'};
    }
  }
`;

export default function Layout(props: any) {
  const { t } = useLocaleContext();
  const { session, events } = useSessionContext();

  useEffect(() => {
    events.once('logout', () => {
      window.location.href = '/';
    });
  }, []);

  useEffect(() => {
    if (session.initialized && !session.user) {
      // @ts-ignore
      session.login(() => {}, { openMode: 'redirect', redirect: window.location.href });
    }
  }, [session.initialized]);

  if (session.user) {
    return <Root {...props} footerProps={{ className: 'dashboard-footer' }} />;
  }

  return <Typography>{t('common.redirecting')}</Typography>;
}
