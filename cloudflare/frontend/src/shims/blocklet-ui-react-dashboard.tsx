import React, { createContext, forwardRef, useContext } from 'react';

interface AppInfo {
  appId: string;
  appName: string;
  appUrl: string;
  [key: string]: unknown;
}

const AppInfoContext = createContext<AppInfo>({
  appId: '',
  appName: 'AIGNE Hub',
  appUrl: '',
});

export function useAppInfo() {
  return useContext(AppInfoContext);
}

interface DashboardProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

const Dashboard = forwardRef<HTMLDivElement, DashboardProps>(({ children, ...rest }, ref) => (
  <div ref={ref} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} {...rest}>
    {children}
  </div>
));

Dashboard.displayName = 'Dashboard';

export default Dashboard;
