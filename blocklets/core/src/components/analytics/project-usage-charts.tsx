import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Card, CardContent, CardHeader, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import dayjs from 'dayjs';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { ProjectGroupedTrend, ProjectTrendSummary } from '../../pages/customer/hooks';

type ProjectUsageMetric = 'credits' | 'usage' | 'requests' | 'avgDuration';

interface ProjectUsageChartsProps {
  projects?: ProjectTrendSummary[];
  trends?: ProjectGroupedTrend[];
  metric?: ProjectUsageMetric;
  granularity?: 'hour' | 'day';
  height?: number;
  title?: string;
  variant?: 'card' | 'plain';
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: number;
  metric: ProjectUsageMetric;
  granularity: 'hour' | 'day';
  projects: ProjectTrendSummary[];
}

const getProjectKey = (appDid: string | null) => appDid ?? 'null';

function CustomTooltip({ active = false, payload = [], label = 0, metric, granularity, projects }: CustomTooltipProps) {
  const { locale, t } = useLocaleContext();
  const theme = useTheme();
  const creditPrefix = (typeof window !== 'undefined' && window.blocklet?.preferences?.creditPrefix) || '';
  const projectMap = new Map(projects.map((project) => [getProjectKey(project.appDid), project]));

  if (!active || !payload || !payload.length) {
    return null;
  }

  const date = dayjs.unix(Number(label));
  const dateLabel =
    granularity === 'hour'
      ? locale === 'zh'
        ? date.format('M/D HH:mm')
        : date.format('M/D HH:mm')
      : locale === 'zh'
        ? date.format('M月D日')
        : date.format('MMM D');

  const formatValue = (value: number) => {
    if (metric === 'credits') return `${creditPrefix}${formatNumber(value)}`;
    if (metric === 'requests') return formatNumber(value, 0, true);
    if (metric === 'avgDuration') return `${Number(value).toFixed(1)}s`;
    return formatNumber(value, 0, true);
  };

  const rows = payload
    .map((entry: any) => {
      const project = projectMap.get(entry.dataKey);
      return {
        appDid: entry.dataKey,
        name: project?.appName || (entry.dataKey === 'null' ? t('analytics.unknownProject') : entry.dataKey),
        value: Number(entry.value) || 0,
        color: entry.color,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) {
    return null;
  }

  const metricLabel =
    metric === 'credits'
      ? t('analytics.totalCreditsUsed')
      : metric === 'requests'
        ? t('analytics.totalRequests')
        : metric === 'avgDuration'
          ? t('analytics.avgDuration')
          : t('analytics.totalUsage');

  return (
    <div
      style={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '8px',
        boxShadow: theme.shadows[8],
        padding: '12px 16px',
        minWidth: '220px',
      }}>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
        {dateLabel}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {metricLabel}
      </Typography>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.map((row) => (
          <div
            key={row.appDid}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  backgroundColor: row.color,
                  display: 'inline-block',
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {row.name}
              </Typography>
            </div>
            <Typography variant="body2" fontWeight={600}>
              {formatValue(row.value)}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectUsageCharts({
  projects = [],
  trends = [],
  metric = 'credits',
  granularity = 'day',
  height = 260,
  title,
  variant = 'card',
}: ProjectUsageChartsProps) {
  const { locale, t } = useLocaleContext();
  const theme = useTheme();
  const unknownProjectLabel = t('analytics.unknownProject');

  const resolvedProjects = projects.length
    ? projects.map((project) => ({
        ...project,
        appName: project.appName || project.appDid || unknownProjectLabel,
      }))
    : Array.from(
        trends.reduce((set, item) => {
          Object.keys(item.byProject || {}).forEach((key) => set.add(key));
          return set;
        }, new Set<string>())
      ).map((appDid) => ({
        appDid: appDid === 'null' ? null : appDid,
        appName: appDid === 'null' ? unknownProjectLabel : appDid,
      }));

  const fallbackColor = theme.palette.primary.main ?? '#1976d2';
  const colorPool: string[] = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.secondary.main,
    theme.palette.error.main,
  ].map((color) => color ?? fallbackColor);

  const chartData = trends.map((entry) => {
    const row: Record<string, number | string> = { timestamp: entry.timestamp };
    resolvedProjects.forEach((project) => {
      const projectKey = getProjectKey(project.appDid);
      const stats = entry.byProject?.[projectKey];
      const value =
        metric === 'credits'
          ? stats?.totalCredits
          : metric === 'requests'
            ? stats?.totalCalls
            : metric === 'avgDuration'
              ? stats?.avgDuration
              : stats?.totalUsage;
      row[projectKey] = value || 0;
    });
    return row;
  });

  const formatXAxisLabel = (timestamp: number) => {
    const date = dayjs.unix(timestamp);
    if (granularity === 'hour') {
      return locale === 'zh' ? date.format('M/D HH:mm') : date.format('M/D HH:mm');
    }
    return locale === 'zh' ? date.format('M月D日') : date.format('MMM D');
  };

  const chartContent = (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(value) => formatXAxisLabel(value)}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
        />
        <YAxis hide />
        <Tooltip
          content={<CustomTooltip metric={metric} granularity={granularity} projects={resolvedProjects} />}
          wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
        />
        {resolvedProjects.map((project, index) => {
          const color = colorPool[index % colorPool.length] ?? fallbackColor;
          const projectKey = getProjectKey(project.appDid);
          return (
            <Area
              key={projectKey}
              type="monotone"
              dataKey={projectKey}
              stackId={metric === 'avgDuration' ? undefined : 'projects'}
              stroke={color}
              fill={alpha(color, 0.2)}
              strokeWidth={1.5}
              dot={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );

  if (variant === 'plain') {
    return trends && trends.length > 0 ? (
      <CardContent
        sx={{
          height,
          px: 0,
          py: 0,
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
          px: 0,
          py: 0,
        }}>
        <Empty>{t('analytics.dailyUsageEmpty')}</Empty>
      </CardContent>
    );
  }

  return (
    <Card
      sx={{
        boxShadow: 1,
        border: '1px solid',
        borderColor: 'divider',
        height: '100%',
        backgroundColor: 'background.default',
      }}>
      <CardHeader title={title || t('analytics.projects')} />
      {trends && trends.length > 0 ? (
        <CardContent
          sx={{
            height,
            px: 0,
            py: 0,
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
            px: 0,
            py: 0,
          }}>
          <Empty>{t('analytics.dailyUsageEmpty')}</Empty>
        </CardContent>
      )}
    </Card>
  );
}
