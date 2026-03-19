import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface HeaderProps {
  title?: string;
  brand?: ReactNode;
  children?: ReactNode;
  [key: string]: unknown;
}

export default function Header({ title, brand, children, ...rest }: HeaderProps) {
  return (
    <AppBar position="static" color="default" elevation={1} {...rest}>
      <Toolbar>
        {brand || <Typography variant="h6">{title || 'AIGNE Hub'}</Typography>}
        <div style={{ flexGrow: 1 }} />
        {children}
      </Toolbar>
    </AppBar>
  );
}
