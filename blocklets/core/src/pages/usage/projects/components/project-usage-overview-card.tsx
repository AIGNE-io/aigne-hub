import { DateRangePicker, UsageCharts } from '@app/components/analytics';
import type { DailyStats, UsageChartMetric } from '@app/components/analytics';
import { UsageOverviewSkeleton, toUTCTimestamp, useSmartLoading } from '@app/components/analytics/skeleton';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AttachMoney, QueryStats, Speed } from '@mui/icons-material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { Avatar, Box, ButtonBase, Card, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import BigNumber from 'bignumber.js';
import { useMemo, useState } from 'react';

import dayjs from '../../../../libs/dayjs';
import type { ProjectTrend, ProjectTrendSummary } from '../../../customer/hooks';

export interface ProjectUsageOverviewCardProps {
  appDid: string;
  dateRange?: { from: number; to: number };
  onDateRangeChange?: (dateRange: { from: number; to: number }) => void;
  trendsData?: { project?: ProjectTrendSummary | null; trends: ProjectTrend[] };
  previousTrendsData?: { project?: ProjectTrendSummary | null; trends: ProjectTrend[] };
  trendsLoading?: boolean;
  projectMeta?: { appName?: string; appLogo?: string; appUrl?: string };
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

const formatTrend = (growth: number): string => {
  if (growth === 0) return '0%';
  const sign = growth > 0 ? '+' : '';
  return `${sign}${(growth * 100).toFixed(1)}%`;
};

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === null) return '-';
  return `${Number(seconds).toFixed(1)}s`;
};

const computeGrowth = (current: number, previous: number) => {
  if (previous > 0) return (current - previous) / previous;
  return current > 0 ? 1 : 0;
};

const getTrendDescription = (days: number, t: (key: string) => string): string => {
  if (days <= 1) return t('analytics.fromPreviousDay');
  if (days <= 7) return t('analytics.fromPreviousWeek');
  if (days <= 31) return t('analytics.fromPreviousMonth');
  return t('analytics.fromPreviousPeriod');
};

const toDailyStats = (trends?: ProjectTrend[]): DailyStats[] => {
  if (!trends?.length) return [];
  return trends.map((trend) => ({
    date: dayjs.unix(trend.timestamp).toISOString(),
    totalCredits: trend.totalCredits || 0,
    totalCalls: trend.calls || 0,
    totalUsage: trend.totalUsage || 0,
    avgDuration: trend.avgDuration || 0,
  }));
};

export function ProjectUsageOverviewCard({
  appDid,
  dateRange: externalDateRange,
  onDateRangeChange,
  trendsData,
  previousTrendsData,
  trendsLoading = false,
  projectMeta,
}: ProjectUsageOverviewCardProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';

  const [selectedMetric, setSelectedMetric] = useState<UsageChartMetric>('credits');
  const [internalDateRange, setInternalDateRange] = useState(() => ({
    start: dayjs().subtract(6, 'day'),
    end: dayjs(),
  }));

  // Use external date range if provided, otherwise use internal
  const dateRange = externalDateRange
    ? {
        start: dayjs.unix(externalDateRange.from).local(),
        end: dayjs.unix(externalDateRange.to).local(),
      }
    : internalDateRange;

  const setDateRange = (newRange: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    if (onDateRangeChange) {
      onDateRangeChange({
        from: toUTCTimestamp(newRange.start),
        to: toUTCTimestamp(newRange.end, true),
      });
    } else {
      setInternalDateRange(newRange);
    }
  };

  const { chartGranularity, periodDays } = useMemo(() => {
    const rangeStart = dateRange.start.startOf('day');
    const rangeEnd = dateRange.end.endOf('day');
    const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
    const granularity = rangeDays <= 1 ? 'hour' : 'day';

    return {
      chartGranularity: granularity,
      periodDays: rangeDays,
    };
  }, [dateRange.end, dateRange.start]);

  const showOverviewSkeleton = useSmartLoading(trendsLoading, trendsData);

  const currentTotals = useMemo(() => {
    const totals = {
      totalCalls: 0,
      totalCredits: 0,
      totalUsage: 0,
      totalSuccessCalls: 0,
      totalDuration: 0,
    };

    (trendsData?.trends || []).forEach((trend) => {
      totals.totalCalls += trend.calls || 0;
      totals.totalCredits += trend.totalCredits || 0;
      totals.totalUsage += trend.totalUsage || 0;
      const successCalls = trend.successCalls ?? trend.calls ?? 0;
      totals.totalSuccessCalls += successCalls;
      totals.totalDuration += (trend.avgDuration || 0) * successCalls;
    });

    return totals;
  }, [trendsData]);

  const previousTotals = useMemo(() => {
    const totals = {
      totalCalls: 0,
      totalCredits: 0,
      totalUsage: 0,
      totalSuccessCalls: 0,
      totalDuration: 0,
    };
    (previousTrendsData?.trends || []).forEach((trend) => {
      totals.totalCalls += trend.calls || 0;
      totals.totalCredits += trend.totalCredits || 0;
      totals.totalUsage += trend.totalUsage || 0;
      const successCalls = trend.successCalls ?? trend.calls ?? 0;
      totals.totalSuccessCalls += successCalls;
      totals.totalDuration += (trend.avgDuration || 0) * successCalls;
    });
    return totals;
  }, [previousTrendsData]);

  const { totalCalls } = currentTotals;
  const { totalCredits } = currentTotals;
  const { totalUsage } = currentTotals;
  const avgDuration =
    currentTotals.totalSuccessCalls > 0
      ? Math.round((currentTotals.totalDuration / currentTotals.totalSuccessCalls) * 10) / 10
      : undefined;
  const previousAvgDuration =
    previousTotals.totalSuccessCalls > 0 ? previousTotals.totalDuration / previousTotals.totalSuccessCalls : 0;
  const successRate = totalCalls > 0 ? (currentTotals.totalSuccessCalls / totalCalls) * 100 : 0;
  const resolvedProjectMeta = projectMeta ?? trendsData?.project ?? null;
  const projectName = resolvedProjectMeta?.appName || appDid;
  const projectLogo =
    resolvedProjectMeta?.appUrl && resolvedProjectMeta?.appLogo
      ? `${resolvedProjectMeta.appUrl}${resolvedProjectMeta.appLogo}`
      : undefined;
  const avgRequestsPerHour = totalCalls > 0 ? totalCalls / (periodDays * 24) : 0;
  const creditsPer1k = totalCalls > 0 ? (totalCredits / totalCalls) * 1000 : 0;
  const avgUsagePerHour = totalUsage > 0 ? totalUsage / (periodDays * 24) : 0;

  const trendComparison = useMemo(() => {
    if (!previousTrendsData) return null;
    const current = {
      totalUsage,
      totalCredits,
      totalCalls,
    };
    const previous = {
      totalUsage: previousTotals.totalUsage,
      totalCredits: previousTotals.totalCredits,
      totalCalls: previousTotals.totalCalls,
    };
    return {
      current,
      previous,
      growth: {
        usageGrowth: computeGrowth(current.totalUsage, previous.totalUsage),
        creditsGrowth: computeGrowth(current.totalCredits, previous.totalCredits),
        callsGrowth: computeGrowth(current.totalCalls, previous.totalCalls),
        avgDurationGrowth: computeGrowth(avgDuration ?? 0, previousAvgDuration),
      },
    };
  }, [avgDuration, previousAvgDuration, previousTotals, previousTrendsData, totalCalls, totalCredits, totalUsage]);

  const metrics = useMemo(
    () => [
      {
        key: 'credits' as const,
        title: t('analytics.totalCreditsUsed'),
        icon: AttachMoney,
        value: `${creditPrefix}${formatNumber(new BigNumber(totalCredits).toString())}`,
        trend: trendComparison ? formatTrend(trendComparison.growth.creditsGrowth) : undefined,
        trendTooltip: trendComparison ? getTrendDescription(periodDays, t) : undefined,
        subLabel:
          totalCalls > 0
            ? t('analytics.creditsPer1kRequests', { credits: `${creditPrefix}${formatNumber(creditsPer1k, 2)}` })
            : '-',
        accent: theme.palette.primary.main,
      },
      {
        key: 'usage' as const,
        title: t('analytics.totalUsage'),
        icon: QueryStats,
        value: formatNumber(totalUsage, 0, true),
        trend: trendComparison ? formatTrend(trendComparison.growth.usageGrowth) : undefined,
        trendTooltip: trendComparison ? getTrendDescription(periodDays, t) : undefined,
        subLabel: totalUsage > 0 ? t('analytics.usagePerHour', { usage: formatNumber(avgUsagePerHour, 0, true) }) : '-',
        accent: theme.palette.success.main,
      },
      {
        key: 'requests' as const,
        title: t('analytics.totalRequests'),
        icon: TrendingUpIcon,
        value: formatNumber(totalCalls, 0, true),
        trend: trendComparison ? formatTrend(trendComparison.growth.callsGrowth) : undefined,
        trendTooltip: trendComparison ? getTrendDescription(periodDays, t) : undefined,
        subLabel:
          totalCalls > 0
            ? t('analytics.requestsPerHour', { requests: formatNumber(avgRequestsPerHour, 0, true) })
            : '-',
        accent: theme.palette.warning.main,
      },
      {
        key: 'avgDuration' as const,
        title: t('analytics.avgDuration'),
        icon: Speed,
        value: formatDuration(avgDuration),
        trend: trendComparison ? formatTrend(trendComparison.growth.avgDurationGrowth) : undefined,
        trendTooltip: trendComparison ? getTrendDescription(periodDays, t) : undefined,
        subLabel: totalCalls > 0 ? `${t('successRate')} ${successRate.toFixed(1)}%` : '-',
        accent: theme.palette.info.main,
      },
    ],
    [
      avgRequestsPerHour,
      avgUsagePerHour,
      avgDuration,
      creditPrefix,
      creditsPer1k,
      periodDays,
      successRate,
      t,
      totalCalls,
      totalCredits,
      totalUsage,
      trendComparison,
      theme.palette.primary.main,
      theme.palette.info.main,
      theme.palette.success.main,
      theme.palette.warning.main,
    ]
  );

  const activeMetric = metrics.find((metric) => metric.key === selectedMetric) ?? metrics[0]!;

  if (showOverviewSkeleton) {
    return <UsageOverviewSkeleton />;
  }

  return (
    <Card
      sx={{
        boxShadow: 1,
        border: 'none',
        backgroundColor: 'background.default',
      }}>
      <Box>
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: { xs: 1.5, sm: 2 },
            }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', width: '100%' }}>
              <Avatar
                src={projectLogo}
                variant="rounded"
                sx={{ width: { xs: 40, sm: 44 }, height: { xs: 40, sm: 44 } }}>
                {projectName?.charAt(0)?.toUpperCase()}
              </Avatar>
              <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: '1.25rem', sm: '1.5rem' },
                    lineHeight: 1.2,
                    wordBreak: 'break-word',
                  }}>
                  {projectName}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}>
                  {appDid}
                </Typography>
              </Stack>
            </Stack>

            <Box sx={{ width: { xs: '100%', sm: 'auto' }, alignSelf: { xs: 'stretch', sm: 'flex-end' } }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DateRangePicker
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  onStartDateChange={(date) => setDateRange({ start: date || dayjs(), end: dateRange.end })}
                  onEndDateChange={(date) => setDateRange({ start: dateRange.start, end: date || dayjs() })}
                  onQuickSelect={(range) => setDateRange({ start: range.start, end: range.end })}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                />
              </LocalizationProvider>
            </Box>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {metrics.map((metric) => {
              const isActive = metric.key === selectedMetric;
              const trendColor = getTrendColor(metric.trend, theme, { invert: metric.key === 'avgDuration' });
              const backgroundColor = theme.palette.action.hover;
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
                      </Stack>

                      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
                        <Typography
                          variant="h4"
                          sx={{
                            fontWeight: 700,
                            lineHeight: 1.1,
                          }}>
                          {metric.value}
                        </Typography>
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

          <Box>
            <UsageCharts
              dailyStats={toDailyStats(trendsData?.trends)}
              comparisonDailyStats={toDailyStats(previousTrendsData?.trends)}
              metric={activeMetric.key}
              variant="plain"
              height={260}
              xAxisGranularity={chartGranularity as any}
            />
          </Box>
        </Stack>
      </Box>
    </Card>
  );
}
