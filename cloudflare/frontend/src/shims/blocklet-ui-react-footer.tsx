import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface FooterProps {
  children?: ReactNode;
  [key: string]: unknown;
}

export default function Footer({ children, ...rest }: FooterProps) {
  return (
    <Box component="footer" sx={{ py: 2, textAlign: 'center' }} {...rest}>
      {children || (
        <Typography variant="body2" color="text.secondary">
          Powered by AIGNE Hub
        </Typography>
      )}
    </Box>
  );
}
