import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

export type UsageDatePreset = '6m' | '3m' | '30d' | '7d' | '24h';

export interface UsageDateToolbarOption {
  value: UsageDatePreset;
  label: string;
}

export interface UsageDateToolbarProps {
  value?: UsageDatePreset;
  onChange: (value: UsageDatePreset) => void;
  options?: UsageDateToolbarOption[];
}

export function UsageDateToolbar({ value, onChange, options }: UsageDateToolbarProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();

  const defaultOptions: UsageDateToolbarOption[] = [
    { value: '6m', label: t('analytics.rangeMonths6') },
    { value: '3m', label: t('analytics.rangeMonths3') },
    { value: '30d', label: t('analytics.rangeDays30') },
    { value: '7d', label: t('analytics.rangeDays7') },
    { value: '24h', label: t('analytics.rangeHours24') },
  ];

  const renderedOptions = options || defaultOptions;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        p: 0.5,
        borderRadius: 999,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: theme.palette.mode === 'dark' ? alpha(theme.palette.grey[900], 0.3) : theme.palette.grey[100],
        overflowX: 'auto',
        '&::-webkit-scrollbar': { display: 'none' },
      }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {renderedOptions.map((option) => {
          const isActive = option.value === value;
          return (
            <ButtonBase
              key={option.value}
              onClick={() => onChange(option.value)}
              focusRipple
              sx={{
                borderRadius: 999,
                px: 2,
                py: 0.6,
                transition: 'all 0.2s ease',
                backgroundColor: isActive ? theme.palette.background.paper : 'transparent',
                boxShadow: isActive ? '0 6px 12px rgba(0, 0, 0, 0.08)' : 'none',
                '&:hover': {
                  backgroundColor: isActive ? theme.palette.background.paper : alpha(theme.palette.primary.main, 0.08),
                },
              }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: isActive ? 'text.primary' : 'text.secondary',
                  whiteSpace: 'nowrap',
                }}>
                {option.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
}
