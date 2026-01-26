import { ModelUsageStats, ProjectList, UsageOverviewCard } from '@app/components/analytics';
import { ModelUsageStatsSkeleton, toUTCTimestamp } from '@app/components/analytics/skeleton';
import { useTransitionContext } from '@app/components/loading/progress-bar';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatError } from '@blocklet/error';
import { Alert, Box, Stack } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { SetStateAction, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import dayjs from '../../libs/dayjs';
import { useUsageStats, useUsageTrends } from '../customer/hooks';

const USAGE_DATE_RANGE_SESSION_KEY = 'usage:date-range:admin';

const readUsageDateRangeFromSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(USAGE_DATE_RANGE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { start: dayjs(parsed.start), end: dayjs(parsed.end) };
  } catch {
    return null;
  }
};

const persistUsageDateRangeToSession = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(
    USAGE_DATE_RANGE_SESSION_KEY,
    JSON.stringify({
      start: range.start.format('YYYY-MM-DD'),
      end: range.end.format('YYYY-MM-DD'),
    })
  );
};

export default function UsageStatsBoard() {
  const { t } = useLocaleContext();
  const navigate = useNavigate();
  const { startTransition } = useTransitionContext();
  const [dateRange, setDateRange] = useState(() => {
    const storedRange = readUsageDateRangeFromSession();
    if (storedRange) return storedRange;
    return {
      start: dayjs().subtract(6, 'day'),
      end: dayjs(),
    };
  });
  const handleDateRangeChange = (updater: SetStateAction<{ start: dayjs.Dayjs; end: dayjs.Dayjs }>) => {
    setDateRange((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistUsageDateRangeToSession(next);
      return next;
    });
  };
  const rangeFrom = toUTCTimestamp(dateRange.start);
  const rangeTo = toUTCTimestamp(dateRange.end, true);
  const rangeStart = dateRange.start.startOf('day');
  const rangeEnd = dateRange.end.endOf('day');
  const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
  const chartGranularity = rangeDays <= 1 ? 'hour' : 'day';
  const periodSeconds = rangeTo - rangeFrom;
  const previousRangeTo = rangeFrom - 1;
  const previousRangeFrom = previousRangeTo - periodSeconds;

  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
  } = useUsageStats({
    allUsers: true,
    startTime: rangeFrom.toString(),
    endTime: rangeTo.toString(),
    timezoneOffset: new Date().getTimezoneOffset(),
  });
  const { data: usageTrends, loading: usageTrendsLoading } = useUsageTrends({
    startTime: rangeFrom,
    endTime: rangeTo,
    granularity: chartGranularity,
    enabled: true,
  });
  const { data: previousUsageTrends } = useUsageTrends({
    startTime: previousRangeFrom,
    endTime: previousRangeTo,
    granularity: chartGranularity,
    enabled: true,
  });

  const showStatsSkeleton = statsLoading;

  const handleProjectSelect = (appDid: string) => {
    startTransition(() => navigate(`/config/projects/${encodeURIComponent(appDid)}`));
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ bgcolor: 'background.default' }}>
        <Stack spacing={3} sx={{ pb: 4 }}>
          {/* <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
            }}>
            <Stack>
              <Typography variant="h3">{t('analytics.creditUsage')}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                  }}>
                  {t('analytics.creditBoardDescription')}
                </Typography>
              </Stack>
            </Stack>
          </Stack> */}

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
