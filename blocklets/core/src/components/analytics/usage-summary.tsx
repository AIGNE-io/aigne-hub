import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AccountBalance, CallMade, TrendingUp } from '@mui/icons-material';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import BigNumber from 'bignumber.js';

export interface TrendComparison {
  current: { totalUsage: number; totalCredits: number; totalCalls: number };
  previous: { totalUsage: number; totalCredits: number; totalCalls: number };
  growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
}

export interface UsageSummaryProps {
  totalCredits?: number;
  totalUsage?: number;
  totalCalls?: number;
  title?: string;
  trendComparison?: TrendComparison | null;
  periodDays?: number;
  customMetrics?: Array<{
    title: string;
    value: string;
    icon: React.ReactNode;
    trend?: string;
    trendDescription?: string;
  }>;
}

interface SummaryCardProps {
  title: string;
  value: string;
  trend?: string;
  trendDescription?: string;
}

function SummaryCard({ title, value = '-', trend = undefined, trendDescription = undefined }: SummaryCardProps) {
  const getTrendColor = (trendStr?: string) => {
    if (!trendStr) return 'text.secondary';
    const isPositive = trendStr.startsWith('+');
    const isNegative = trendStr.startsWith('-');
    if (isPositive) return 'success.main';
    if (isNegative) return 'error.main';
    return 'text.secondary';
  };

  return (
    <Card
      sx={{
        height: '100%',
        boxShadow: 1,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.default',
      }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography
          variant="body2"
          sx={{
            color: 'text.primary',
            fontWeight: 600,
            mb: 1,
          }}>
          {title}
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          {value || '-'}
        </Typography>
        {trend && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
            }}>
            <Box component="span" sx={{ color: getTrendColor(trend), fontWeight: 500 }}>
              {trend}
            </Box>
            {trendDescription && ` ${trendDescription}`}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function UsageSummary({
  totalCredits = 0,
  totalUsage = 0,
  totalCalls = 0,
  title = undefined,
  trendComparison = null,
  periodDays = 7,
  customMetrics = undefined,
}: UsageSummaryProps) {
  const { t } = useLocaleContext();
  const formatTrend = (growth: number): string => {
    if (growth === 0) return '0%';
    const sign = growth > 0 ? '+' : '';
    return `${sign}${(growth * 100).toFixed(1)}%`;
  };

  const getTrendDescription = (days: number): string => {
    if (days <= 1) return t('analytics.fromPreviousDay');
    if (days <= 7) return t('analytics.fromPreviousWeek');
    if (days <= 31) return t('analytics.fromPreviousMonth');
    return t('analytics.fromPreviousPeriod');
  };

  const metrics = customMetrics || [
    {
      title: t('analytics.totalCreditsUsed'),
      value: formatNumber(new BigNumber(trendComparison?.current?.totalCredits || totalCredits || 0).dp(2).toString()),
      trend: trendComparison ? formatTrend(trendComparison.growth.callsGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <CallMade color="primary" />,
      color: 'primary' as const,
    },
    {
      title: t('analytics.totalUsage'),
      value: formatNumber(trendComparison?.current?.totalUsage || totalUsage || 0),
      trend: trendComparison ? formatTrend(trendComparison.growth.usageGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <TrendingUp color="success" />,
      color: 'success' as const,
    },
    {
      title: t('analytics.totalRequests'),
      value: formatNumber(trendComparison?.current?.totalCalls || totalCalls || 0),
      trend: trendComparison ? formatTrend(trendComparison.growth.creditsGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <AccountBalance color="warning" />,
      color: 'warning' as const,
    },
  ];

  return (
    <Box>
      {title && (
        <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 3 }}>
          {title}
        </Typography>
      )}
      <Grid container spacing={2}>
        {metrics.map((metric) => (
          <Grid key={metric.title} size={{ xs: 12, sm: 6, md: 4 }}>
            <SummaryCard
              title={metric.title}
              value={metric.value || '-'}
              trend={metric.trend}
              trendDescription={metric.trendDescription}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
