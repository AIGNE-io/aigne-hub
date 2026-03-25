import { Box } from '@mui/material';
import { ReactNode } from 'react';

import AppFooter from './app-footer';
import AppHeader from './app-header';

interface PageLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
  showCreditButton?: boolean;
  headerBorderBottom?: boolean;
  fullHeight?: boolean;
  padding?: { px?: object | number; py?: object | number };
}

const PAGE_PADDING = { px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } };

export default function PageLayout({
  children,
  showHeader = true,
  showFooter = true,
  showCreditButton = true,
  headerBorderBottom = false,
  fullHeight = false,
  padding = PAGE_PADDING,
}: PageLayoutProps) {
  if (fullHeight) {
    return (
      <Box
        component="main"
        sx={{
          overflow: 'hidden',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}>
        {showHeader && <AppHeader showCreditButton={showCreditButton} borderBottom={headerBorderBottom} />}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>{children}</Box>
      </Box>
    );
  }

  return (
    <>
      {showHeader && <AppHeader showCreditButton={showCreditButton} borderBottom={headerBorderBottom} />}
      <Box
        component="main"
        sx={{
          flex: 1,
          ...padding,
        }}>
        {children}
      </Box>
      {showFooter && <AppFooter />}
    </>
  );
}

export { PAGE_PADDING };
