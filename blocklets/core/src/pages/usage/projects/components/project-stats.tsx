import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AttachMoney, CheckCircle, Speed, TrendingUp } from '@mui/icons-material';
import { Box, Card, CardContent, Stack, Typography, alpha, useTheme } from '@mui/material';

import type { ProjectStats as ProjectStatsType } from '../../../customer/hooks';

interface ProjectStatsProps {
  stats?: ProjectStatsType;
  timeRangeDays?: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit = '',
  color = 'primary',
  subLabel,
}: {
  icon: any;
  label: string;
  value: string | number;
  unit?: string;
  color?: 'primary' | 'success' | 'warning' | 'info';
  subLabel?: string;
}) {
  const theme = useTheme();
  const colorMap = {
    primary: theme.palette.primary.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
    info: theme.palette.info.main,
  };
  const selectedColor = colorMap[color];

  return (
    <Card
      sx={{
        height: '100%',
        boxShadow: 'none',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: selectedColor,
          boxShadow: `0 4px 12px ${alpha(selectedColor, 0.1)}`,
        },
      }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                p: 0.75,
                borderRadius: 1.5,
                backgroundColor: alpha(selectedColor, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon sx={{ fontSize: 18, color: selectedColor }} />
            </Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              {label}
            </Typography>
          </Stack>
          <Typography variant="h4" fontWeight={700} sx={{ color: 'text.primary' }}>
            {value}
            {unit && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {unit}
              </Typography>
            )}
          </Typography>
          {subLabel && (
            <Typography variant="body2" color="text.secondary">
              {subLabel}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ProjectStats({ stats, timeRangeDays = 30 }: ProjectStatsProps) {
  const { t } = useLocaleContext();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';

  if (!stats) {
    return null;
  }

  const normalizedDays = Math.max(timeRangeDays, 1);
  const totalCalls = stats.totalCalls || 0;
  const successCalls =
    typeof stats.successCalls === 'number' ? stats.successCalls : Math.round((stats.successRate / 100) * totalCalls);
  const avgRequestsPerHour = totalCalls > 0 ? totalCalls / (normalizedDays * 24) : 0;
  const creditsPer1k = totalCalls > 0 ? (stats.totalCredits / totalCalls) * 1000 : 0;

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    return `${Number(seconds).toFixed(1)}s`;
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(3, 1fr)',
          md: 'repeat(4, 1fr)',
        },
        gap: 2,
      }}>
      <StatCard
        icon={CheckCircle}
        label={t('successRate')}
        value={`${stats.successRate.toFixed(2)}%`}
        subLabel={t('analytics.requestsCount', {
          success: formatNumber(successCalls, 0, true),
          total: formatNumber(totalCalls, 0, true),
        })}
        color="success"
      />
      <StatCard
        icon={Speed}
        label={t('analytics.avgDuration')}
        value={formatDuration(stats.avgDuration)}
        color="warning"
      />
      <StatCard
        icon={TrendingUp}
        label={t('analytics.totalRequests')}
        value={formatNumber(stats.totalCalls, 0, true) ?? '0'}
        subLabel={
          totalCalls > 0 ? t('analytics.requestsPerHour', { requests: formatNumber(avgRequestsPerHour, 0, true) }) : '-'
        }
        color="primary"
      />
      <StatCard
        icon={AttachMoney}
        label={t('credits')}
        value={`${creditPrefix}${formatNumber(stats.totalCredits)}`}
        subLabel={
          totalCalls > 0
            ? t('analytics.creditsPer1kRequests', { credits: `${creditPrefix}${formatNumber(creditsPer1k, 2)}` })
            : '-'
        }
        color="warning"
      />
    </Box>
  );
}
