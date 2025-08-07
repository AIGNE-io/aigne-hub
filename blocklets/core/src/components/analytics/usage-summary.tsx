import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';

export interface UsageSummaryProps {
  totalCredits?: number;
  totalTokens?: number;
  totalRequests?: number;
  title?: string;
  customMetrics?: Array<{
    title: string;
    value: string;
    icon: React.ReactNode;
    trend?: string;
  }>;
}

interface SummaryCardProps {
  title: string;
  value: string;
  trend?: string;
}

function SummaryCard({ title, value, trend = undefined }: SummaryCardProps) {
  return (
    <Card sx={{ height: '100%', boxShadow: 1, borderColor: 'divider' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" sx={{ mb: 2, alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
        </Stack>
        <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
          {value}
        </Typography>
        {trend && (
          <Typography variant="caption" color="text.secondary">
            <Box component="span" sx={{ color: 'success.main', fontWeight: 500 }}>
              {trend}
            </Box>
            {' from last week'}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function UsageSummary({
  totalCredits = 0,
  totalTokens = 0,
  totalRequests = 0,
  title = undefined,
  customMetrics = undefined,
}: UsageSummaryProps) {
  const { t } = useLocaleContext();

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  // 使用自定义指标或默认指标
  const metrics = customMetrics || [
    {
      title: t('analytics.totalCreditsUsed'),
      value: totalCredits.toLocaleString(),
      trend: '+12%',
    },
    {
      title: t('analytics.totalTokens'),
      value: formatTokens(totalTokens),
      trend: '+8%',
    },
    {
      title: t('analytics.totalRequests'),
      value: totalRequests.toString(),
      trend: '+15%',
    },
  ];

  return (
    <Box>
      {title && (
        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 3 }}>
          {title}
        </Typography>
      )}
      <Grid container spacing={3}>
        {metrics.map((metric, index) => (
          <Grid key={index} size={{ xs: 12, md: 4 }}>
            <SummaryCard title={metric.title} value={metric.value} trend={metric.trend} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
