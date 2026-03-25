import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { id: 'home', label: '首页', link: '/' },
  { id: 'config', label: '配置', link: '/config' },
  { id: 'usage', label: '用量', link: '/usage' },
  { id: 'playground', label: '沙盒', link: '/playground' },
  { id: 'pricing', label: '定价', link: '/pricing' },
  { id: 'apiKeys', label: 'API Keys', link: '/api-keys' },
];

interface HeaderProps {
  title?: string;
  brand?: ReactNode;
  children?: ReactNode;
  addons?: (existing: ReactNode[]) => ReactNode[];
  [key: string]: unknown;
}

// eslint-disable-next-line react/prop-types
export default function Header({ title, brand, children, addons, ...allProps }: HeaderProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxWidth, homeLink, sessionManagerProps, hideNavMenu, ...rest } = allProps;
  let location: { pathname: string };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    location = useLocation();
  } catch {
    location = { pathname: '/' };
  }

  const extra = addons ? addons([]) : [];

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper' }} {...rest}>
      <Toolbar sx={{ gap: 0.5 }}>
        {brand || (
          <Typography
            component={Link}
            to="/"
            variant="h6"
            sx={{ fontWeight: 700, color: 'text.primary', textDecoration: 'none', mr: 2 }}>
            {title || 'AIGNE Hub'}
          </Typography>
        )}

        {NAV_ITEMS.map((item) => {
          const isActive = item.link === '/' ? location.pathname === '/' : location.pathname.startsWith(item.link);
          return (
            <Button
              key={item.id}
              component={Link}
              to={item.link}
              size="small"
              sx={{
                color: isActive ? 'primary.main' : 'text.secondary',
                fontWeight: isActive ? 600 : 400,
                borderBottom: '2px solid',
                borderColor: isActive ? 'primary.main' : 'transparent',
                borderRadius: 0,
                px: 1.5,
                py: 1,
                minWidth: 'auto',
                fontSize: '0.875rem',
              }}>
              {item.label}
            </Button>
          );
        })}

        <Box sx={{ flex: 1 }} />
        {extra}
        {children}
      </Toolbar>
    </AppBar>
  );
}
