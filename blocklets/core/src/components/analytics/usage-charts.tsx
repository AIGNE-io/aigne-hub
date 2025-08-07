import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Card, CardContent, CardHeader, Grid, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DailyStats {
  date: string;
  credits: number;
  tokens: number;
  requests: number;
}

export interface UsageChartsProps {
  dailyStats?: DailyStats[];
  title?: string;
  showCredits?: boolean;
  showTokens?: boolean;
  showRequests?: boolean;
  height?: number;
  useCard?: boolean;
}

export function UsageCharts({
  dailyStats = [],
  title = undefined,
  showCredits = true,
  showTokens = true,
  showRequests = false,
  height = 300,
  useCard = false,
}: UsageChartsProps) {
  const { t } = useLocaleContext();

  const formatDateTick = (tickItem: string) => {
    return dayjs(tickItem).format('MMM DD');
  };

  const formatDateLabel = (label: string) => {
    return dayjs(label).format('MMM DD, YYYY');
  };

  const tooltipStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  };

  const cardStyles = {
    boxShadow: 1,
    borderColor: 'divider',
  };

  const renderChart = (chartTitle: string, chartContent: React.ReactNode) => {
    if (useCard) {
      return (
        <Card sx={cardStyles}>
          <CardHeader title={chartTitle} titleTypographyProps={{ variant: 'h6', fontWeight: 600 }} />
          <CardContent sx={{ height }}>{chartContent}</CardContent>
        </Card>
      );
    }

    return (
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          {chartTitle}
        </Typography>
        <Box sx={{ height }}>{chartContent}</Box>
      </Box>
    );
  };

  return (
    <Grid container spacing={3}>
      {/* Credits Chart */}
      {showCredits && (
        <Grid size={{ xs: 12, lg: showTokens || showRequests ? 6 : 12 }}>
          {renderChart(
            title ? `${title} - ${t('analytics.dailyCreditsUsage')}` : t('analytics.dailyCreditsUsage'),
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={formatDateTick} stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} />
                <Tooltip
                  labelFormatter={formatDateLabel}
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [value.toLocaleString(), t('analytics.credits')]}
                />
                <Bar dataKey="credits" fill="#1976d2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Grid>
      )}

      {/* Tokens Chart */}
      {showTokens && (
        <Grid size={{ xs: 12, lg: showCredits || showRequests ? 6 : 12 }}>
          {renderChart(
            title ? `${title} - ${t('analytics.dailyTokenUsage')}` : t('analytics.dailyTokenUsage'),
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={formatDateTick} stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} />
                <Tooltip
                  labelFormatter={formatDateLabel}
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [value.toLocaleString(), t('analytics.tokens')]}
                />
                <Line
                  type="monotone"
                  dataKey="tokens"
                  stroke="#2e7d32"
                  strokeWidth={2}
                  dot={{ fill: '#2e7d32', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#2e7d32' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Grid>
      )}

      {/* Requests Chart */}
      {showRequests && (
        <Grid size={{ xs: 12, lg: showCredits || showTokens ? 6 : 12 }}>
          {renderChart(
            title ? `${title} - ${t('analytics.dailyRequests')}` : t('analytics.dailyRequests'),
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={formatDateTick} stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} />
                <Tooltip
                  labelFormatter={formatDateLabel}
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [value.toLocaleString(), t('analytics.requests')]}
                />
                <Bar dataKey="requests" fill="#ed6c02" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Grid>
      )}
    </Grid>
  );
}
