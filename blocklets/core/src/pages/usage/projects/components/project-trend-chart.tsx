import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Card, CardContent, CardHeader, Typography, useTheme } from '@mui/material';
import dayjs from 'dayjs';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { ProjectTrend } from '../../../customer/hooks';

interface ProjectTrendChartProps {
  trends?: ProjectTrend[];
  comparisonTrends?: ProjectTrend[];
  timeRange?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function CustomTooltip({ active = false, payload = [], label = '' }: CustomTooltipProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();

  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0]?.payload || {};
  const comparisonTimestamp = data?.comparisonTimestamp;
  const currentLabel = dayjs.unix(Number(label)).format('YYYY-MM-DD HH:mm');
  const comparisonLabel = comparisonTimestamp
    ? dayjs.unix(Number(comparisonTimestamp)).format('YYYY-MM-DD HH:mm')
    : null;

  const formatDuration = (seconds?: number) =>
    seconds === undefined || seconds === null ? '-' : `${Number(seconds).toFixed(1)}s`;
  const formatCalls = (value?: number) => (value === undefined || value === null ? '-' : formatNumber(value, 0, true));
  const formatChange = (current?: number, previous?: number) => {
    if (previous === undefined || previous === null) return null;
    if (previous === 0) return current === 0 ? '0%' : '-';
    const diff = ((Number(current) - Number(previous)) / Number(previous)) * 100;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}%`;
  };

  const metrics = [
    {
      key: 'calls',
      label: t('analytics.callsTrend'),
      color: theme.palette.primary.main,
      format: formatCalls,
      current: data.calls,
      previous: data.comparisonCalls,
    },
    {
      key: 'avgDuration',
      label: t('analytics.avgDuration'),
      color: theme.palette.info.main,
      format: formatDuration,
      current: data.avgDuration,
      previous: data.comparisonAvgDuration,
    },
  ];

  return (
    <div
      style={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '8px',
        boxShadow: theme.shadows[8],
        padding: '12px 16px',
        minWidth: '200px',
      }}>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
        {currentLabel}
      </Typography>
      {comparisonLabel && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {comparisonLabel}
        </Typography>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {metrics.map((metric) => {
          const currentValue = metric.format(metric.current);
          const previousValue = comparisonLabel ? metric.format(metric.previous) : null;
          const changeText = comparisonLabel ? formatChange(metric.current, metric.previous) : null;
          const valueText =
            comparisonLabel && previousValue
              ? `${currentValue} / ${previousValue}${changeText ? ` (${changeText})` : ''}`
              : currentValue;

          return (
            <div
              key={metric.key}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '3px',
                    borderRadius: '2px',
                    backgroundColor: metric.color,
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {metric.label}
                </Typography>
              </div>
              <Typography variant="body2" fontWeight={600}>
                {valueText}
              </Typography>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectTrendChart({ trends = [], comparisonTrends = [], timeRange = 30 }: ProjectTrendChartProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();

  const formatXAxisLabel = (timestamp: number) => {
    const date = dayjs.unix(timestamp);
    if (timeRange <= 7) {
      return date.format('HH:mm');
    }
    return date.format('MM-DD');
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '0.0';
    return Number(seconds).toFixed(1);
  };

  const hasComparison = Array.isArray(comparisonTrends) && comparisonTrends.length > 0;
  const mergedTrends = hasComparison
    ? trends.map((item, index) => {
        const comparison = comparisonTrends[index];
        return {
          ...item,
          comparisonCalls: comparison?.calls,
          comparisonAvgDuration: comparison?.avgDuration,
          comparisonTimestamp: comparison?.timestamp,
        };
      })
    : trends;

  return (
    <Card
      sx={{
        boxShadow: 'none',
        border: '1px solid',
        borderColor: 'divider',
        height: '100%',
        backgroundColor: 'background.default',
      }}>
      <CardHeader
        title={
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('analytics.callsTrend')} & {t('analytics.avgDuration')}
          </Typography>
        }
      />
      <CardContent sx={{ height: 350, pt: 0 }}>
        {trends && trends.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mergedTrends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatXAxisLabel}
                tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                stroke={theme.palette.divider}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                stroke={theme.palette.divider}
                label={{
                  value: t('analytics.totalRequests'),
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 12, fill: theme.palette.text.secondary },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                stroke={theme.palette.divider}
                label={{
                  value: `${t('analytics.avgDuration')} (s)`,
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 12, fill: theme.palette.text.secondary },
                }}
                tickFormatter={formatDuration}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '14px' }}
                iconType="line"
                formatter={(value) => <span style={{ color: theme.palette.text.primary }}>{value}</span>}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="calls"
                name={t('analytics.callsTrend')}
                stroke={theme.palette.primary.main}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {hasComparison && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="comparisonCalls"
                  name={`${t('analytics.callsTrend')} (${t('analytics.fromPreviousPeriod')})`}
                  stroke={theme.palette.grey[400]}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                />
              )}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgDuration"
                name={t('analytics.avgDuration')}
                stroke={theme.palette.info.main}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {hasComparison && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="comparisonAvgDuration"
                  name={`${t('analytics.avgDuration')} (${t('analytics.fromPreviousPeriod')})`}
                  stroke={theme.palette.grey[400]}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty>{t('analytics.dailyUsageEmpty')}</Empty>
        )}
      </CardContent>
    </Card>
  );
}
