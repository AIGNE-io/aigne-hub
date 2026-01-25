import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Box, Card, CardContent, CardHeader, useTheme } from '@mui/material';
import dayjs from 'dayjs';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// New data format
export interface DailyStats {
  date: string;
  totalCredits: number;
  totalCalls: number;
  totalUsage: number;
  avgDuration?: number;
}

// Legacy data format for backward compatibility
export interface LegacyDailyStats {
  date: string;
  credits: number;
  tokens: number;
  requests: number;
}

export type UsageChartMetric = 'credits' | 'usage' | 'requests' | 'avgDuration';

export interface UsageChartsProps {
  dailyStats?: (DailyStats | LegacyDailyStats)[];
  comparisonDailyStats?: (DailyStats | LegacyDailyStats)[];
  title?: string;
  height?: number;
  metric?: UsageChartMetric;
  variant?: 'card' | 'plain';
  xAxisGranularity?: 'day' | 'hour';
  // Legacy props for backward compatibility
  showCredits?: boolean;
  showRequests?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  metric: UsageChartMetric;
  showRequests: boolean;
  xAxisGranularity: 'day' | 'hour';
  theme: any;
  t: any;
}

interface ComparisonStats {
  comparisonTotalCredits?: number;
  comparisonTotalUsage?: number;
  comparisonTotalCalls?: number;
  comparisonAvgDuration?: number;
  comparisonDate?: string;
}

function CustomTooltip({
  active = false,
  payload = [],
  label = '',
  metric,
  showRequests,
  xAxisGranularity,
  theme,
  t,
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload as DailyStats & ComparisonStats;

  const formatDateLabel = (label: string) => {
    if (xAxisGranularity === 'hour') {
      return dayjs(label).format('YYYY-MM-DD HH:mm');
    }
    return dayjs(label).format('YYYY-MM-DD');
  };

  const tooltipStyle = {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '12px',
    boxShadow: theme.shadows[8],
    minWidth: '240px',
    maxWidth: '320px',
    color: theme.palette.text.primary,
    padding: 0,
  };

  const creditPrefix = (typeof window !== 'undefined' && window.blocklet?.preferences?.creditPrefix) || '';
  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    return `${Number(seconds).toFixed(1)}s`;
  };
  const metricLabel =
    metric === 'credits'
      ? t('analytics.totalCreditsUsed')
      : metric === 'requests'
        ? t('analytics.totalRequests')
        : metric === 'avgDuration'
          ? t('analytics.avgDuration')
          : t('analytics.totalUsage');
  const formatMetricValue = (value?: number) => {
    if (value === undefined || value === null) return '-';
    if (metric === 'credits') return `${creditPrefix}${formatNumber(value)}`;
    if (metric === 'requests') return formatNumber(value, 0, true);
    if (metric === 'avgDuration') return formatDuration(value);
    return formatNumber(value, 0, true);
  };
  const currentDotColor =
    metric === 'credits'
      ? theme.palette.primary.main
      : metric === 'requests'
        ? theme.palette.warning.main
        : metric === 'avgDuration'
          ? theme.palette.info.main
          : theme.palette.success.main;
  const comparisonDotColor = theme.palette.grey[400];
  const metricCurrentValue =
    metric === 'credits'
      ? data.totalCredits
      : metric === 'requests'
        ? data.totalCalls
        : metric === 'avgDuration'
          ? data.avgDuration
          : data.totalUsage;
  const metricPreviousValue =
    metric === 'credits'
      ? data.comparisonTotalCredits
      : metric === 'requests'
        ? data.comparisonTotalCalls
        : metric === 'avgDuration'
          ? data.comparisonAvgDuration
          : data.comparisonTotalUsage;
  const metricValue = formatMetricValue(metricCurrentValue);
  const metricComparisonValue = formatMetricValue(metricPreviousValue);
  const requestsPreviousValue = data.comparisonTotalCalls;

  return (
    <div style={tooltipStyle}>
      {/* Header */}
      <div
        style={{
          padding: '14px 16px 10px 16px',
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[50],
          borderRadius: '12px 12px 0 0',
        }}>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: theme.palette.text.primary,
          }}>
          {metricLabel}
        </span>
      </div>

      {/* Main Stats */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  backgroundColor: currentDotColor,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  color: theme.palette.text.primary,
                  fontWeight: 500,
                }}>
                {t('analytics.dateLabel')}: {formatDateLabel(label!)}
              </span>
            </div>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: theme.palette.text.primary,
              }}>
              {metricValue}
            </span>
          </div>
          {data.comparisonDate && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: comparisonDotColor,
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    color: theme.palette.text.primary,
                    fontWeight: 500,
                  }}>
                  {t('analytics.dateLabel')}: {formatDateLabel(data.comparisonDate)}
                </span>
              </div>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                }}>
                {metricComparisonValue}
              </span>
            </div>
          )}

          {showRequests && metric !== 'requests' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: theme.palette.warning.main,
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    color: theme.palette.text.primary,
                    fontWeight: 500,
                  }}>
                  {t('analytics.totalRequests')}
                </span>
              </div>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                }}>
                {data.comparisonDate
                  ? `${formatNumber(data.totalCalls, 0, true)} / ${
                      requestsPreviousValue === undefined || requestsPreviousValue === null
                        ? '-'
                        : formatNumber(requestsPreviousValue, 0, true)
                    }`
                  : formatNumber(data.totalCalls, 0, true)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UsageCharts({
  dailyStats = [],
  comparisonDailyStats = [],
  title = '',
  height = 220,
  metric,
  variant = 'card',
  xAxisGranularity = 'day',
  showCredits = true,
  showRequests = false,
}: UsageChartsProps) {
  const { t, locale } = useLocaleContext();
  const theme = useTheme();

  const formatXAxisLabel = (label: string) => {
    if (xAxisGranularity === 'hour') {
      return dayjs(label).format('HH:mm');
    }
    if (locale === 'zh') {
      return dayjs(label).format('M月D日');
    }
    return dayjs(label).format('MMM DD');
  };

  const resolvedMetric: UsageChartMetric = metric || (showCredits ? 'credits' : 'usage');
  const dataKey =
    resolvedMetric === 'credits'
      ? 'totalCredits'
      : resolvedMetric === 'requests'
        ? 'totalCalls'
        : resolvedMetric === 'avgDuration'
          ? 'avgDuration'
          : 'totalUsage';
  const strokeColor =
    resolvedMetric === 'credits'
      ? theme.palette.primary.main
      : resolvedMetric === 'requests'
        ? theme.palette.warning.main
        : resolvedMetric === 'avgDuration'
          ? theme.palette.info.main
          : theme.palette.success.main;
  const comparisonKey =
    resolvedMetric === 'credits'
      ? 'comparisonTotalCredits'
      : resolvedMetric === 'requests'
        ? 'comparisonTotalCalls'
        : resolvedMetric === 'avgDuration'
          ? 'comparisonAvgDuration'
          : 'comparisonTotalUsage';
  const getMetricValue = (stat: DailyStats | LegacyDailyStats | undefined, metricType: UsageChartMetric) => {
    if (!stat) return undefined;
    if (metricType === 'credits') {
      return (stat as DailyStats).totalCredits ?? (stat as LegacyDailyStats).credits ?? 0;
    }
    if (metricType === 'requests') {
      return (stat as DailyStats).totalCalls ?? (stat as LegacyDailyStats).requests ?? 0;
    }
    if (metricType === 'avgDuration') {
      return (stat as DailyStats).avgDuration ?? 0;
    }
    return (stat as DailyStats).totalUsage ?? (stat as LegacyDailyStats).tokens ?? 0;
  };

  const hasComparison = Array.isArray(comparisonDailyStats) && comparisonDailyStats.length > 0;
  const mergedStats = hasComparison
    ? dailyStats.map((item, index) => {
        const comparison = comparisonDailyStats[index];
        return {
          ...item,
          comparisonTotalCredits: getMetricValue(comparison, 'credits'),
          comparisonTotalUsage: getMetricValue(comparison, 'usage'),
          comparisonTotalCalls: getMetricValue(comparison, 'requests'),
          comparisonAvgDuration: getMetricValue(comparison, 'avgDuration'),
          comparisonDate: comparison?.date,
        };
      })
    : dailyStats;

  const cardStyles = {
    boxShadow: 1,
    border: '1px solid',
    borderColor: 'divider',
    height: '100%',
    backgroundColor: 'background.default',
    overflow: 'visible',
  };

  const chartTitle =
    title ||
    (resolvedMetric === 'credits'
      ? t('analytics.dailyCreditsUsage')
      : resolvedMetric === 'avgDuration'
        ? t('analytics.avgDuration')
        : t('analytics.dailyUsage'));

  const chartContent = (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={mergedStats} margin={{ right: 0, left: 0, top: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
        <Tooltip
          content={
            <CustomTooltip
              metric={resolvedMetric}
              showRequests={showRequests}
              xAxisGranularity={xAxisGranularity}
              theme={theme}
              t={t}
            />
          }
          allowEscapeViewBox={{ x: false, y: true }}
          wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
        />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => formatXAxisLabel(value)}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
          padding={{ left: 0, right: 0 }}
        />
        <YAxis hide />
        {hasComparison && (
          <Line
            type="monotone"
            dataKey={comparisonKey}
            stroke={theme.palette.grey[400]}
            strokeWidth={1}
            strokeDasharray="6 4"
            dot={false}
          />
        )}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={strokeColor}
          strokeWidth={2}
          fill={strokeColor}
          fillOpacity={0.18}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  if (variant === 'plain') {
    return dailyStats && dailyStats.length > 0 ? (
      <Box
        sx={{
          height,
          p: 0,
          overflow: 'visible',
          svg: {
            outline: 'none',
          },
        }}>
        {chartContent}
      </Box>
    ) : (
      <Box
        sx={{
          height,
          p: 0,
        }}>
        <Empty>{t('analytics.dailyUsageEmpty')}</Empty>
      </Box>
    );
  }

  return (
    <Card sx={cardStyles}>
      <CardHeader title={chartTitle} />
      {dailyStats && dailyStats.length > 0 ? (
        <CardContent
          sx={{
            height,
            p: 0,
            overflow: 'visible',
            svg: {
              outline: 'none',
            },
          }}>
          {chartContent}
        </CardContent>
      ) : (
        <CardContent
          sx={{
            height,
            p: 0,
          }}>
          <Empty>{t('analytics.dailyUsageEmpty')}</Empty>
        </CardContent>
      )}
    </Card>
  );
}
