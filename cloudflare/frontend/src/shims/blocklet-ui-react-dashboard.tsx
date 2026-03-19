import Box from '@mui/material/Box';
import React, { createContext, forwardRef, useContext, useState } from 'react';

import Header from './blocklet-ui-react-header';

// --- AppInfo Context ---
interface AppInfo {
  appId: string;
  appName: string;
  appUrl: string;
  description?: string;
  [key: string]: unknown;
}

interface AppInfoContextValue extends AppInfo {
  updateAppInfo: (info: Partial<AppInfo>) => void;
}

const AppInfoContext = createContext<AppInfoContextValue>({
  appId: '',
  appName: 'AIGNE Hub',
  appUrl: '',
  updateAppInfo: () => {},
});

export function useAppInfo() {
  return useContext(AppInfoContext);
}

// --- Dashboard Component ---
interface DashboardProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<AppInfo>({
    appId: '',
    appName: 'AIGNE Hub',
    appUrl: window.location.origin,
  });

  const updateAppInfo = (partial: Partial<AppInfo>) => {
    setInfo((prev) => ({ ...prev, ...partial }));
  };

  const value = React.useMemo(() => ({ ...info, updateAppInfo }), [info]);

  return <AppInfoContext.Provider value={value}>{children}</AppInfoContext.Provider>;
}

const Dashboard = forwardRef<HTMLDivElement, DashboardProps>(({ children, ...rest }, ref) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { footerProps, padding, ...domProps } = rest as Record<string, unknown>;

  return (
    <DashboardProvider>
      <div
        ref={ref}
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
        {...(domProps as React.HTMLAttributes<HTMLDivElement>)}>
        <Header />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box className="dashboard-content" sx={{ flex: 1, p: { xs: 2, md: 3 }, overflow: 'auto' }}>
              {children}
            </Box>
          </Box>
        </Box>
      </div>
    </DashboardProvider>
  );
});

Dashboard.displayName = 'Dashboard';

export default Dashboard;
