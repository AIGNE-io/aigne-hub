import { ModelUsageStats, ProjectList, UsageOverviewCard } from '@app/components/analytics';
import { ModelUsageStatsSkeleton, toUTCTimestamp } from '@app/components/analytics/skeleton';
import { useTransitionContext } from '@app/components/loading/progress-bar';
import { useDateRange } from '@app/hooks/use-date-range';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatError } from '@blocklet/error';
import { Alert, Box, Stack } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useNavigate } from 'react-router-dom';

import { useUsageStats, useUsageTrends } from '../customer/hooks';

export default function UsageStatsBoard() {
  const { t } = useLocaleContext();
  const navigate = useNavigate();
  const { startTransition } = useTransitionContext();
  const [dateRange, handleDateRangeChange] = useDateRange('usage:date-range:admin');
  const rangeFrom = toUTCTimestamp(dateRange.start);
  const rangeTo = toUTCTimestamp(dateRange.end, true);
  const rangeStart = dateRange.start.startOf('day');
  const rangeEnd = dateRange.end.endOf('day');
  const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
  const chartGranularity = rangeDays <= 1 ? 'hour' : 'day';
  const timezoneOffset = new Date().getTimezoneOffset();

  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
  } = useUsageStats({
    allUsers: true,
    startTime: rangeFrom.toString(),
    endTime: rangeTo.toString(),
    timezoneOffset,
  });
  const {
    data: usageTrends,
    comparisonData: previousUsageTrends,
    loading: usageTrendsLoading,
  } = useUsageTrends({
    startTime: rangeFrom,
    endTime: rangeTo,
    granularity: chartGranularity,
    timezoneOffset,
    enabled: true,
    includeComparison: true,
  });

  const showStatsSkeleton = statsLoading;

  const isCfMode = !window.blocklet?.appId;
  const handleProjectSelect = (appDid: string) => {
    const basePath = isCfMode ? '/usage/projects' : '/config/projects';
    startTransition(() => navigate(`${basePath}/${encodeURIComponent(appDid)}`));
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ bgcolor: 'background.default' }}>
        <Stack spacing={3} sx={{ pb: 4 }}>
          {statsError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {formatError(statsError)}
            </Alert>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <Stack spacing={3}>
              <UsageOverviewCard
                title={t('analytics.creditOverview')}
                allUsers
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
                usageTrends={usageTrends}
                previousUsageTrends={previousUsageTrends}
                trendsLoading={usageTrendsLoading}
              />
            </Stack>

            <Stack spacing={3}>
              {showStatsSkeleton ? (
                <ModelUsageStatsSkeleton />
              ) : (
                <ModelUsageStats
                  modelStats={usageStats?.modelStats?.list}
                  totalModelCount={usageStats?.modelStats?.totalModelCount}
                  title={t('analytics.modelUsageStats')}
                  subtitle={t('analytics.modelUsageStatsDescription')}
                />
              )}
            </Stack>
          </Box>

          <ProjectList
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            onProjectSelect={handleProjectSelect}
            allUsers
          />
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}
