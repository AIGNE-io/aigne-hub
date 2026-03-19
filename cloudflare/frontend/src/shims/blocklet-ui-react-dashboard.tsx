import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import React, { createContext, forwardRef, useContext, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

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

// --- Navigation items ---
const NAV_ITEMS = [
  { id: 'settings', label: '控制台', link: '/config', icon: '⚙️' },
  { id: 'playground', label: '沙盒', link: '/config/playground', icon: '▶️' },
  { id: 'pricing', label: '定价', link: '/pricing', icon: '💰' },
  { id: 'creditUsage', label: '额度分析', link: '/credit-usage', icon: '📊' },
];

// --- Dashboard Component ---
interface DashboardProps {
  children?: React.ReactNode;
  footerProps?: Record<string, unknown>;
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

function DashboardHeader() {
  const location = useLocation();

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper' }}>
      <Toolbar sx={{ gap: 1 }}>
        <Typography
          component={Link}
          to="/"
          variant="h6"
          sx={{ fontWeight: 700, color: 'text.primary', textDecoration: 'none', mr: 3 }}>
          AIGNE Hub
        </Typography>

        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname.startsWith(item.link);
          return (
            <Button
              key={item.id}
              component={Link}
              to={item.link}
              size="small"
              sx={{
                color: isActive ? 'primary.main' : 'text.secondary',
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid' : '2px solid transparent',
                borderColor: isActive ? 'primary.main' : 'transparent',
                borderRadius: 0,
                px: 1.5,
                py: 1,
              }}>
              {item.label}
            </Button>
          );
        })}

        <Box sx={{ flex: 1 }} />
      </Toolbar>
    </AppBar>
  );
}

const Dashboard = forwardRef<HTMLDivElement, DashboardProps>(({ children, ...rest }, ref) => {
  // Strip non-DOM props that would cause React warnings
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { footerProps, padding, ...domProps } = rest as Record<string, unknown>;

  return (
    <DashboardProvider>
      <div
        ref={ref}
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
        className="dashboard-root"
        {...(domProps as React.HTMLAttributes<HTMLDivElement>)}>
        <DashboardHeader />
        <Box className="dashboard-body" sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box className="dashboard-main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
