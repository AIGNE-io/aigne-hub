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

type MetricConfig = {
  label: string;
  dataKey: string;
  comparisonKey: string;
  color: string;
  currentValueKey: string;
  comparisonValueKey: string;
  formatValue: (value?: number) => string;
};

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

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === null) return '-';
  return `${Number(seconds).toFixed(1)}s`;
};

const getMetricConfig = ({
  t,
  theme,
  creditPrefix,
}: {
  t: any;
  theme: any;
  creditPrefix: string;
}): Record<UsageChartMetric, MetricConfig> => ({
  credits: {
    label: t('analytics.totalCreditsUsed'),
    dataKey: 'totalCredits',
    comparisonKey: 'comparisonTotalCredits',
    color: theme.palette.primary.main,
    currentValueKey: 'totalCredits',
    comparisonValueKey: 'comparisonTotalCredits',
    formatValue: (value?: number) => {
      if (value === undefined || value === null) return '-';
      return `${creditPrefix}${formatNumber(value)}`;
    },
  },
  usage: {
    label: t('analytics.totalUsage'),
    dataKey: 'totalUsage',
    comparisonKey: 'comparisonTotalUsage',
    color: theme.palette.success.main,
    currentValueKey: 'totalUsage',
    comparisonValueKey: 'comparisonTotalUsage',
    formatValue: (value?: number) => {
      if (value === undefined || value === null) return '-';
      return formatNumber(value, 0, true) || '-';
    },
  },
  requests: {
    label: t('analytics.totalRequests'),
    dataKey: 'totalCalls',
    comparisonKey: 'comparisonTotalCalls',
    color: theme.palette.warning.main,
    currentValueKey: 'totalCalls',
    comparisonValueKey: 'comparisonTotalCalls',
    formatValue: (value?: number) => {
      if (value === undefined || value === null) return '-';
      return formatNumber(value, 0, true) || '-';
    },
  },
  avgDuration: {
    label: t('analytics.avgDuration'),
    dataKey: 'avgDuration',
    comparisonKey: 'comparisonAvgDuration',
    color: theme.palette.info.main,
    currentValueKey: 'avgDuration',
    comparisonValueKey: 'comparisonAvgDuration',
    formatValue: (value?: number) => formatDuration(value),
  },
});

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
  const metricConfig = getMetricConfig({ t, theme, creditPrefix });
  const currentMetric = metricConfig[metric];
  const {
    label: metricLabel,
    formatValue: formatMetricValue,
    color: currentDotColor,
    currentValueKey,
    comparisonValueKey,
  } = currentMetric;
  const comparisonDotColor = theme.palette.grey[400];
  const metricCurrentValue = (data as any)[currentValueKey] as number | undefined;
  const metricPreviousValue = (data as any)[comparisonValueKey] as number | undefined;
  const metricValue = formatMetricValue(metricCurrentValue);
  const metricComparisonValue = formatMetricValue(metricPreviousValue);
  const { label: requestsLabel, comparisonValueKey: requestsComparisonKey } = metricConfig.requests;
  const requestsPreviousValue = (data as any)[requestsComparisonKey] as number | undefined;

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
                  {requestsLabel}
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
  const { t } = useLocaleContext();
  const theme = useTheme();

  const formatXAxisLabel = (label: string) => {
    if (xAxisGranularity === 'hour') {
      return dayjs(label).format('HH:mm');
    }
    return dayjs(label).format('MM-DD');
  };

  const resolvedMetric: UsageChartMetric = metric || (showCredits ? 'credits' : 'usage');
  const metricConfig = getMetricConfig({ t, theme, creditPrefix: '' });
  const resolvedMetricConfig = metricConfig[resolvedMetric];
  const { dataKey, color: strokeColor, comparisonKey } = resolvedMetricConfig;
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

  const chartTitleMap: Record<UsageChartMetric, string> = {
    credits: t('analytics.dailyCreditsUsage'),
    avgDuration: t('analytics.avgDuration'),
    usage: t('analytics.dailyUsage'),
    requests: t('analytics.dailyUsage'),
  };
  const chartTitle = title || chartTitleMap[resolvedMetric];

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
          '.recharts-wrapper *:focus:not(:focus-visible)': {
            outline: 'none !important',
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
            '.recharts-wrapper *:focus:not(:focus-visible)': {
              outline: 'none !important',
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
