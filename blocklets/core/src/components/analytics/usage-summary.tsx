import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AccountBalance, CallMade, InfoOutlined, TrendingUp } from '@mui/icons-material';
import { Box, Card, CardContent, Grid, Tooltip, Typography } from '@mui/material';
import BigNumber from 'bignumber.js';

export interface TrendComparison {
  current: {
    totalUsage: number;
    totalCredits: number;
    totalCalls: number;
  };
  previous: {
    totalUsage: number;
    totalCredits: number;
    totalCalls: number;
  };
  growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
}

export interface UsageSummaryProps {
  totalCredits?: number;
  totalCalls?: number;
  totalUsage?: number;
  title?: string;
  trendComparison?: TrendComparison | null;
  periodDays?: number;
  customMetrics?: Array<{
    title: string;
    value: string;
    icon: React.ReactNode;
    trend?: string;
    trendDescription?: string;
    tooltip?: React.ReactNode;
    showInfoIcon?: boolean;
    infoTooltip?: string;
  }>;
}

interface SummaryCardProps {
  title: string;
  value?: string;
  trend?: string;
  trendDescription?: string;
  tooltip?: React.ReactNode;
  showInfoIcon?: boolean;
  infoTooltip?: string;
}

function SummaryCard({
  title,
  value = '-',
  trend = undefined,
  trendDescription = undefined,
  tooltip = undefined,
  showInfoIcon = false,
  infoTooltip = undefined,
}: SummaryCardProps) {
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
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mb: 1,
          }}>
          <Typography
            variant="body2"
            sx={{
              color: 'text.primary',
              fontWeight: 600,
            }}>
            {title}
          </Typography>
          {showInfoIcon && (
            <Tooltip title={infoTooltip} arrow placement="top">
              <InfoOutlined
                sx={{
                  fontSize: 16,
                  color: 'text.secondary',
                  cursor: 'help',
                }}
              />
            </Tooltip>
          )}
        </Box>
        <Box>
          {tooltip ? (
            <Tooltip
              title={tooltip}
              slotProps={{
                tooltip: {
                  sx: {
                    maxWidth: 'none',
                    backgroundColor: 'background.paper',
                    boxShadow: 2,
                    color: 'text.primary',
                    p: 0,
                  },
                },
              }}>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 'bold',
                  mb: 0.5,
                  cursor: 'help',
                  display: 'inline-block',
                }}>
                {value || '-'}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              {value || '-'}
            </Typography>
          )}
        </Box>

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
  totalCalls = 0,
  totalUsage = 0,
  title = undefined,
  trendComparison = null,
  periodDays = 7,
  customMetrics = undefined,
}: UsageSummaryProps) {
  const { t } = useLocaleContext();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';

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
      value: `${creditPrefix}${formatNumber(new BigNumber(trendComparison?.current?.totalCredits || totalCredits || 0).toString())}`,
      trend: trendComparison ? formatTrend(trendComparison.growth.creditsGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <CallMade color="primary" />,
      color: 'primary' as const,
      tooltip: null,
      showInfoIcon: false,
      infoTooltip: undefined,
    },
    {
      title: t('analytics.totalUsage'),
      value: formatNumber(trendComparison?.current?.totalUsage || totalUsage || 0, 0, true),
      trend: trendComparison ? formatTrend(trendComparison.growth.usageGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <TrendingUp color="success" />,
      color: 'success' as const,
      tooltip: null,
      showInfoIcon: false,
      infoTooltip: undefined,
    },
    {
      title: t('analytics.totalRequests'),
      value: formatNumber(trendComparison?.current?.totalCalls || totalCalls || 0, 0, true),
      trend: trendComparison ? formatTrend(trendComparison.growth.callsGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <AccountBalance color="warning" />,
      color: 'warning' as const,
      tooltip: null,
      showInfoIcon: false,
      infoTooltip: undefined,
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
        {(metrics || []).map(
          (metric) =>
            metric && (
              <Grid key={metric.title} size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard
                  title={metric.title}
                  value={metric.value || '-'}
                  trend={metric.trend}
                  trendDescription={metric.trendDescription}
                  tooltip={metric.tooltip}
                  showInfoIcon={metric.showInfoIcon}
                  infoTooltip={metric.infoTooltip}
                />
              </Grid>
            )
        )}
      </Grid>
    </Box>
  );
}
