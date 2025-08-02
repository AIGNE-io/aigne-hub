import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Typography } from '@mui/material';

interface EnterHintProps {
  variant?: 'caption' | 'body2';
  color?: string;
}

export default function EnterHint({ variant = 'caption', color = 'text.secondary' }: EnterHintProps) {
  const { t } = useLocaleContext();

  return (
    <Typography variant={variant} sx={{ color, display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        component="span"
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0.75,
          px: 0.75,
          py: 0.25,
          fontSize: '12px',
          lineHeight: 1,
          color: 'text.secondary',
          fontWeight: '400',
          bgcolor: 'transparent',
        }}>
        ↵
      </Box>
      {t('enterHint')}
    </Typography>
  );
}
