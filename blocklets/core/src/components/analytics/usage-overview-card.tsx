import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AttachMoney, InfoOutlined, QueryStats } from '@mui/icons-material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { Box, ButtonBase, Card, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { fromUnitToToken } from '@ocap/util';
import BigNumber from 'bignumber.js';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';

import { useGrantUsage } from '../../hooks/use-grant-usage';
import dayjs from '../../libs/dayjs';
import type { ProjectGroupedTrend, ProjectTrendSummary, UsageTrend } from '../../pages/customer/hooks';
import { DateRangePicker } from './date-range-picker';
import { ProjectUsageCharts } from './project-usage-charts';
import { UsageOverviewSkeleton, toUTCTimestamp, useSmartLoading } from './skeleton';
import { UsageChartMetric, UsageCharts } from './usage-charts';

export interface UsageOverviewCardProps {
  title?: string;
  isAdmin?: boolean;
  dateRange: {
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
  };
  projectTrends?: {
    projects: ProjectTrendSummary[];
    trends: ProjectGroupedTrend[];
    granularity: 'hour' | 'day';
  };
  previousProjectTrends?: {
    projects: ProjectTrendSummary[];
    trends: ProjectGroupedTrend[];
    granularity: 'hour' | 'day';
  };
  usageTrends?: {
    trends: UsageTrend[];
  };
  previousUsageTrends?: {
    trends: UsageTrend[];
  };
  trendsLoading?: boolean;
  onDateRangeChange: Dispatch<
    SetStateAction<{
      start: dayjs.Dayjs;
      end: dayjs.Dayjs;
    }>
  >;
}

const getTrendColor = (trendStr?: string, theme?: any, options?: { invert?: boolean }) => {
  if (!trendStr || !theme) return theme?.palette?.text?.secondary || 'text.secondary';
  const isPositive = trendStr.startsWith('+');
  const isNegative = trendStr.startsWith('-');
  const successColor = options?.invert ? theme.palette.error.main : theme.palette.success.main;
  const errorColor = options?.invert ? theme.palette.success.main : theme.palette.error.main;
  if (isPositive) return successColor;
  if (isNegative) return errorColor;
  return theme.palette.text.secondary;
};

const computeGrowth = (current: number, previous: number): number => {
  if (previous > 0) return (current - previous) / previous;
  return current > 0 ? 1 : 0;
};

const sumUsageTrends = (trends?: Array<{ calls: number; totalCredits: number; totalUsage: number }>) => {
  return (trends || []).reduce(
    (acc, trend) => ({
      totalCalls: acc.totalCalls + (trend.calls || 0),
      totalCredits: acc.totalCredits + (trend.totalCredits || 0),
      totalUsage: acc.totalUsage + (trend.totalUsage || 0),
    }),
    { totalCalls: 0, totalCredits: 0, totalUsage: 0 }
  );
};

const sumProjectGroupedTrends = (trends?: ProjectGroupedTrend[]) => {
  return (trends || []).reduce(
    (acc, trend) => {
      Object.values(trend.byProject || {}).forEach((stats) => {
        acc.totalCalls += stats.totalCalls || 0;
        acc.totalCredits += stats.totalCredits || 0;
        acc.totalUsage += stats.totalUsage || 0;
      });
      return acc;
    },
    { totalCalls: 0, totalCredits: 0, totalUsage: 0 }
  );
};

export function UsageOverviewCard({
  title,
  isAdmin = false,
  dateRange,
  projectTrends,
  previousProjectTrends,
  usageTrends,
  previousUsageTrends,
  trendsLoading = false,
  onDateRangeChange,
}: UsageOverviewCardProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';
  const timezoneOffset = new Date().getTimezoneOffset();

  const [selectedMetric, setSelectedMetric] = useState<UsageChartMetric>('credits');

  // Fetch grant usage data from API (global, no grantorDid filter)
  const { data: grantUsageData } = useGrantUsage({
    startTime: toUTCTimestamp(dateRange.start),
    endTime: toUTCTimestamp(dateRange.end, true),
    timezoneOffset,
    enabled: isAdmin,
  });
  const rangeStart = dateRange.start.startOf('day');
  const rangeEnd = dateRange.end.endOf('day');
  const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
  const chartGranularity = rangeDays <= 1 ? 'hour' : 'day';
  const currentTrends = isAdmin ? usageTrends : projectTrends;
  const canShowGrantBreakdown = isAdmin && chartGranularity === 'day';

  const chartTrends = useMemo(() => {
    if (!isAdmin) return projectTrends;
    if (!usageTrends?.trends) return undefined;
    const overallKey = '__all__';
    const trends = usageTrends.trends.map((trend) => ({
      timestamp: trend.timestamp,
      byProject: {
        [overallKey]: {
          totalUsage: trend.totalUsage || 0,
          totalCredits: trend.totalCredits,
          totalCalls: trend.calls,
          avgDuration: trend.avgDuration || 0,
          successCalls: trend.successCalls || 0,
        },
      },
    }));
    return {
      projects: [{ appDid: overallKey, appName: 'All Projects' }],
      trends,
      granularity: chartGranularity,
    };
  }, [isAdmin, chartGranularity, projectTrends, usageTrends]);

  const chartComparisonTrends = useMemo(() => {
    if (!isAdmin) return previousProjectTrends?.trends;
    if (!previousUsageTrends?.trends) return undefined;
    const overallKey = '__all__';
    const trends = previousUsageTrends.trends.map((trend) => ({
      timestamp: trend.timestamp,
      byProject: {
        [overallKey]: {
          totalUsage: trend.totalUsage || 0,
          totalCredits: trend.totalCredits,
          totalCalls: trend.calls,
          avgDuration: trend.avgDuration || 0,
          successCalls: trend.successCalls || 0,
        },
      },
    }));
    return trends;
  }, [isAdmin, previousProjectTrends, previousUsageTrends]);

  const showOverviewSkeleton = useSmartLoading(trendsLoading, currentTrends);

  const currentTotals = useMemo(
    () => (isAdmin ? sumUsageTrends(usageTrends?.trends) : sumProjectGroupedTrends(projectTrends?.trends)),
    [isAdmin, projectTrends, usageTrends]
  );
  const previousTotals = useMemo(
    () =>
      isAdmin ? sumUsageTrends(previousUsageTrends?.trends) : sumProjectGroupedTrends(previousProjectTrends?.trends),
    [isAdmin, previousProjectTrends, previousUsageTrends]
  );
  const hasComparison = isAdmin ? !!previousUsageTrends : !!previousProjectTrends;

  // Extract grant usage from API data and convert using decimal
  const grantDecimal = grantUsageData?.summary?.currency?.decimal || 0;
  const grantUsedAmount = parseFloat(fromUnitToToken(grantUsageData?.summary?.total_consumed || '0', grantDecimal));
  const grantTotalAmount = parseFloat(fromUnitToToken(grantUsageData?.summary?.total_granted || '0', grantDecimal));

  // Merge trends with grant usage daily stats to add grantedUsage and paidUsage (only for isAdmin mode)
  const mergedDailyStats = useMemo(() => {
    if (!canShowGrantBreakdown) return [];
    const trends = usageTrends?.trends || [];
    if (!trends.length) return [];

    const dailyGrantMap = new Map<string, number>();
    (grantUsageData?.daily_stats || []).forEach((stat) => {
      const consumed = parseFloat(fromUnitToToken(stat.total_consumed || '0', grantDecimal));
      dailyGrantMap.set(stat.date, consumed);
    });

    return trends.map((trend) => {
      const dateStr = dayjs.unix(trend.timestamp).format('YYYY-MM-DD');
      const grantedUsage = dailyGrantMap.get(dateStr) || 0;
      const paidUsage = Math.max(0, trend.totalCredits - grantedUsage);
      return {
        ...trend,
        grantedUsage,
        paidUsage,
      };
    });
  }, [canShowGrantBreakdown, usageTrends?.trends, grantUsageData?.daily_stats, grantDecimal]);

  const periodDays = rangeDays;
  const currentTotalCalls = currentTotals.totalCalls;
  const currentTotalCredits = currentTotals.totalCredits;
  const currentTotalUsage = currentTotals.totalUsage;
  const avgRequestsPerHour = currentTotalCalls > 0 ? currentTotalCalls / (periodDays * 24) : 0;
  const creditsPer1k = currentTotalCalls > 0 ? (currentTotalCredits / currentTotalCalls) * 1000 : 0;
  const avgUsagePerHour = currentTotalUsage > 0 ? currentTotalUsage / (periodDays * 24) : 0;

  const formatTrend = (growth: number): string => {
    if (growth === 0) return '0%';
    const sign = growth > 0 ? '+' : '';
    return `${sign}${(growth * 100).toFixed(1)}%`;
  };

  const creditsGrowth = hasComparison ? computeGrowth(currentTotalCredits, previousTotals.totalCredits) : undefined;
  const usageGrowth = hasComparison ? computeGrowth(currentTotalUsage, previousTotals.totalUsage) : undefined;
  const callsGrowth = hasComparison ? computeGrowth(currentTotalCalls, previousTotals.totalCalls) : undefined;

  const metrics = useMemo(() => {
    const getTrendDescription = (days: number): string => {
      if (days <= 1) return t('analytics.fromPreviousDay');
      if (days <= 7) return t('analytics.fromPreviousWeek');
      if (days <= 31) return t('analytics.fromPreviousMonth');
      return t('analytics.fromPreviousPeriod');
    };

    return [
      {
        key: 'credits' as const,
        title: t('analytics.totalCreditsUsed'),
        icon: AttachMoney,
        value: `${creditPrefix}${formatNumber(new BigNumber(currentTotalCredits).toString())}`,
        trend: creditsGrowth !== undefined ? formatTrend(creditsGrowth) : undefined,
        trendTooltip: hasComparison ? getTrendDescription(periodDays) : undefined,
        subLabel: isAdmin
          ? t('analytics.includesGrantCredits', {
              used: `${creditPrefix}${formatNumber(grantUsedAmount)}`,
              total: `${creditPrefix}${formatNumber(grantTotalAmount)}`,
            })
          : currentTotalCalls > 0
            ? t('analytics.creditsPer1kRequests', { credits: `${creditPrefix}${formatNumber(creditsPer1k, 2)}` })
            : '-',
        tooltip: null,
        showInfoIcon: false,
        infoTooltip: undefined,
        accent: theme.palette.primary.main,
      },
      {
        key: 'usage' as const,
        title: t('analytics.totalUsage'),
        icon: QueryStats,
        value: formatNumber(currentTotalUsage, 0, true),
        trend: usageGrowth !== undefined ? formatTrend(usageGrowth) : undefined,
        trendTooltip: hasComparison ? getTrendDescription(periodDays) : undefined,
        subLabel:
          currentTotalUsage > 0 ? t('analytics.usagePerHour', { usage: formatNumber(avgUsagePerHour, 0, true) }) : '-',
        tooltip: null,
        showInfoIcon: false,
        infoTooltip: undefined,
        accent: theme.palette.primary.main,
      },
      {
        key: 'requests' as const,
        title: t('analytics.totalRequests'),
        icon: TrendingUpIcon,
        value: formatNumber(currentTotalCalls, 0, true),
        trend: callsGrowth !== undefined ? formatTrend(callsGrowth) : undefined,
        trendTooltip: hasComparison ? getTrendDescription(periodDays) : undefined,
        subLabel:
          currentTotalCalls > 0
            ? t('analytics.requestsPerHour', { requests: formatNumber(avgRequestsPerHour, 0, true) })
            : '-',
        tooltip: null,
        showInfoIcon: false,
        infoTooltip: undefined,
        accent: theme.palette.primary.main,
      },
    ];
  }, [
    t,
    creditPrefix,
    currentTotalCredits,
    creditsGrowth,
    hasComparison,
    periodDays,
    currentTotalCalls,
    creditsPer1k,
    theme.palette.primary.main,
    currentTotalUsage,
    usageGrowth,
    avgUsagePerHour,
    callsGrowth,
    avgRequestsPerHour,
    isAdmin,
    grantUsedAmount,
    grantTotalAmount,
  ]);

  const activeMetric = metrics.find((metric) => metric.key === selectedMetric) ?? metrics[0]!;

  if (showOverviewSkeleton) {
    return <UsageOverviewSkeleton />;
  }

  return (
    <Card
      sx={{
        boxShadow: 1,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.default',
        overflow: 'visible',
      }}>
      <Box sx={{ p: 2, pb: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {/* <LeaderboardIcon /> */}
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {title || t('analytics.creditOverview')}
            </Typography>
          </Stack>

          <DateRangePicker
            startDate={dateRange.start}
            endDate={dateRange.end}
            onStartDateChange={(date) =>
              onDateRangeChange((prev) => ({
                ...prev,
                start: date || dayjs(),
              }))
            }
            onEndDateChange={(date) =>
              onDateRangeChange((prev) => ({
                ...prev,
                end: date || dayjs(),
              }))
            }
            onQuickSelect={(range) =>
              onDateRangeChange(() => ({
                start: range.start,
                end: range.end,
              }))
            }
            sx={{ alignSelf: 'flex-end' }}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2.5 }}>
          {metrics.map((metric) => {
            const isActive = metric.key === selectedMetric;
            const trendColor = getTrendColor(metric.trend, theme);
            const backgroundColor = theme.palette.action.hover;
            const valueNode = metric.tooltip ? (
              <Tooltip
                title={metric.tooltip}
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
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    lineHeight: 1.1,
                    display: 'inline-block',
                  }}>
                  {metric.value}
                </Typography>
              </Tooltip>
            ) : (
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1.1,
                }}>
                {metric.value}
              </Typography>
            );
            const MetricIcon = metric.icon;

            return (
              <ButtonBase
                key={metric.key}
                onClick={() => setSelectedMetric(metric.key)}
                disableRipple
                disableTouchRipple
                aria-pressed={isActive}
                sx={{
                  flex: 1,
                  textAlign: 'left',
                  borderRadius: 2,
                }}>
                <Box
                  sx={{
                    width: '100%',
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isActive ? metric.accent : 'divider',
                    // backgroundColor: isActive ? backgroundColor : 'background.paper',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor,
                    },
                  }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <Box
                        sx={{
                          p: 0.75,
                          borderRadius: 1.5,
                          backgroundColor: alpha(metric.accent, 0.1),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <MetricIcon sx={{ fontSize: 18, color: metric.accent }} />
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          color: isActive ? metric.accent : 'text.secondary',
                          fontWeight: 600,
                        }}>
                        {metric.title}
                      </Typography>
                      {metric.showInfoIcon && (
                        <Tooltip title={metric.infoTooltip} arrow placement="top">
                          <InfoOutlined
                            sx={{
                              fontSize: 16,
                              color: 'text.secondary',
                              cursor: 'help',
                            }}
                          />
                        </Tooltip>
                      )}
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
                      {valueNode}
                      {metric.trend && (
                        <Tooltip title={metric.trendTooltip || ''} arrow placement="top">
                          <Box
                            sx={{
                              px: 1,
                              py: 0.25,
                              borderRadius: 999,
                              backgroundColor: alpha(trendColor, 0.12),
                            }}>
                            <Typography
                              variant="caption"
                              sx={{
                                color: trendColor,
                                fontWeight: 600,
                              }}>
                              {metric.trend}
                            </Typography>
                          </Box>
                        </Tooltip>
                      )}
                    </Stack>

                    {metric.subLabel && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {metric.subLabel}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </ButtonBase>
            );
          })}
        </Stack>

        <Box sx={{ mt: 4 }}>
          {isAdmin ? (
            <UsageCharts
              dailyStats={
                canShowGrantBreakdown && mergedDailyStats.length > 0 ? mergedDailyStats : usageTrends?.trends || []
              }
              comparisonDailyStats={previousUsageTrends?.trends || []}
              metric={activeMetric.key}
              variant="plain"
              height={260}
              xAxisGranularity={chartGranularity as any}
            />
          ) : (
            <ProjectUsageCharts
              projects={chartTrends?.projects}
              trends={chartTrends?.trends}
              comparisonTrends={chartComparisonTrends}
              metric={activeMetric.key}
              granularity={chartTrends?.granularity as any}
              variant="plain"
              height={260}
            />
          )}
        </Box>
      </Box>
    </Card>
  );
}
