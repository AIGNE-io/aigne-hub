import ErrorBoundary from '@app/components/error/error-boundary';
import NotFoundView from '@app/components/error/not-found';
import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import { styled } from '@mui/material';
import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

export default function BillingRoutes() {
  return (
    <AdminLayout footerProps={{ className: 'dashboard-footer' }} sx={{ bgcolor: 'background.paper' }}>
      <ErrorBoundary>
        <Routes>
          <Route index element={<BillingPage />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </ErrorBoundary>
    </AdminLayout>
  );
}

const AdminLayout = styled(Dashboard)`
  > .dashboard-body > .dashboard-main {
    > .dashboard-content {
      overflow: auto;
      padding: 0;
    }

    > .dashboard-footer {
      margin-top: 0;
      padding: 0;
    }
  }
`;

const BillingPage = lazy(() => import('./billing-page'));
