import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Tooltip, Typography } from '@mui/material';

interface UnitDisplayProps {
  value: string | number;
  type: 'credit' | 'token';
  variant?: 'body1' | 'body2' | 'caption';
  sx?: any;
  addon?: string;
}

export default function UnitDisplay({ value, type, variant = 'body2', addon = '', sx = {} }: UnitDisplayProps) {
  const { t } = useLocaleContext();

  const tooltipTitle = t(`config.modelRates.configInfo.unitTooltip.${type}`);

  return (
    <Tooltip
      title={tooltipTitle}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: 2,
            border: '1px solid',
            borderColor: 'divider',
            fontSize: '0.75rem',
          },
        },
      }}>
      <Box component="span" sx={{ cursor: 'help', ...sx }}>
        <Typography variant={variant} component="span">
          {value} / 1M {addon}
        </Typography>
      </Box>
    </Tooltip>
  );
}
