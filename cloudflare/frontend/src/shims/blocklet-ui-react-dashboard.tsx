import React, { createContext, forwardRef, useContext, useState } from 'react';

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

const Dashboard = forwardRef<HTMLDivElement, DashboardProps>(({ children, ...rest }, ref) => (
  <DashboardProvider>
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} {...rest}>
      {children}
    </div>
  </DashboardProvider>
));

Dashboard.displayName = 'Dashboard';

export default Dashboard;
