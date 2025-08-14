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
    byType: {
      chatCompletion?: {
        totalUsage: number;
        totalCalls: number;
      };
      imageGeneration?: {
        totalUsage: number;
        totalCalls: number;
      };
      embedding?: {
        totalUsage: number;
        totalCalls: number;
      };
    };
  };
  previous: {
    totalUsage: number;
    totalCredits: number;
    totalCalls: number;
    byType: {
      chatCompletion?: {
        totalUsage: number;
        totalCalls: number;
      };
      imageGeneration?: {
        totalUsage: number;
        totalCalls: number;
      };
      embedding?: {
        totalUsage: number;
        totalCalls: number;
      };
    };
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
  value: string;
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

  // Function to get usage unit based on service type
  const getUsageUnit = (type: string) => {
    const normalizedType = type.toLowerCase();
    switch (normalizedType) {
      case 'chatcompletion':
      case 'completion':
      case 'embedding':
      case 'transcription':
      case 'speech':
      case 'audiogeneration':
        return t('modelUnits.tokens');
      case 'imagegeneration':
        return t('modelUnits.images');
      case 'videogeneration':
        return t('modelUnits.minutes');
      default:
        return t('modelUnits.tokens');
    }
  };

  // Function to get display name for service type
  const getServiceTypeDisplayName = (type: string) => {
    const typeKey = `modelTypes.${type}`;
    try {
      return t(typeKey);
    } catch {
      return type;
    }
  };

  const createUsageTooltip = () => {
    const byType = trendComparison?.current?.byType;

    if (!byType || Object.keys(byType).length === 0) {
      return null;
    }

    return (
      <Box sx={{ minWidth: 200 }}>
        <Box
          sx={{
            p: '12px 16px 8px 16px',

            borderColor: 'divider',
            backgroundColor: 'grey.50',
          }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'text.primary',
            }}>
            {t('analytics.modelUsageStats')}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Object.entries(byType).map(([type, stats]) => {
            const unit = getUsageUnit(type);
            const displayName = getServiceTypeDisplayName(type);
            return (
              <Box
                key={type}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: '6px 12px',
                }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '12px',
                    color: 'text.secondary',
                    fontWeight: 500,
                  }}>
                  {displayName}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '12px',
                    color: 'text.primary',
                    fontWeight: 600,
                  }}>
                  {formatNumber(stats?.totalUsage || 0)} {unit}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  const metrics = customMetrics || [
    {
      title: t('analytics.totalCreditsUsed'),
      value: formatNumber(new BigNumber(trendComparison?.current?.totalCredits || totalCredits || 0).dp(2).toString()),
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
      value: formatNumber(trendComparison?.current?.totalUsage || totalUsage || 0),
      trend: trendComparison ? formatTrend(trendComparison.growth.usageGrowth) : undefined,
      trendDescription: trendComparison ? getTrendDescription(periodDays) : undefined,
      icon: <TrendingUp color="success" />,
      color: 'success' as const,
      tooltip: createUsageTooltip(),
      showInfoIcon: true,
      infoTooltip: t('analytics.modelUsageSummaryDescription'),
    },
    {
      title: t('analytics.totalRequests'),
      value: formatNumber(trendComparison?.current?.totalCalls || totalCalls || 0),
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
