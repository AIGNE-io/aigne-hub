import { CallHistory, DateRangePicker, ModelUsageStats, UsageCharts, UsageSummary } from '@app/components/analytics';
import { Toast } from '@arcblock/ux';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { formatError } from '@blocklet/error';
import { RefreshOutlined } from '@mui/icons-material';
import { Alert, Box, Card, Divider, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useEffect, useRef, useState } from 'react';

import dayjs from '../../libs/dayjs';
import { CreditsBalance } from './credits-balance';
import { useCreditBalance, useUsageStats } from './hooks';

// Custom hook for smart skeleton loading
const useSmartLoading = (loading: boolean, data: any, minLoadingTime = 300) => {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (loading && !data) {
      startTimeRef.current = Date.now();
      timer = setTimeout(() => setShowSkeleton(true), 200);
    } else if (!loading && showSkeleton) {
      const elapsed = Date.now() - startTimeRef.current;
      const minTime = isFirstLoad ? 1000 : minLoadingTime;
      const delay = Math.max(0, minTime - elapsed);

      setTimeout(() => {
        setShowSkeleton(false);
        setIsFirstLoad(false);
      }, delay);
    } else if (!loading) {
      setIsFirstLoad(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading, data, minLoadingTime, showSkeleton, isFirstLoad]);

  return showSkeleton;
};

function UsageSummarySkeleton() {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
      {[1, 2, 3].map((i) => (
        <Card key={i} sx={{ flex: 1, p: 2 }}>
          <Stack spacing={1}>
            <Skeleton variant="text" width="60%" height={20} />
            <Skeleton variant="text" width="40%" height={32} />
            <Skeleton variant="text" width="80%" height={16} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function UsageChartsSkeleton() {
  return (
    <Card sx={{ p: 3 }}>
      <Skeleton variant="text" width="40%" height={24} sx={{ mb: 2 }} />
      <Skeleton variant="rectangular" width="100%" height={260} />
    </Card>
  );
}

function ModelUsageStatsSkeleton() {
  return (
    <Card sx={{ p: 3, height: '100%' }}>
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Skeleton variant="text" width="60%" height={24} />
          <Skeleton variant="text" width="80%" height={16} />
        </Stack>
        {[1, 2, 3, 4, 5].map((i) => (
          <Stack
            key={i}
            direction="row"
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <Stack
              direction="row"
              spacing={3}
              sx={{
                alignItems: 'center',
              }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Stack>
                <Skeleton variant="text" width={120} height={20} />
              </Stack>
            </Stack>
            <Skeleton variant="text" width={60} height={20} />
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

function CreditsBalanceSkeleton() {
  return (
    <Card sx={{ p: 3 }}>
      <Stack spacing={1}>
        <Skeleton variant="text" width="20%" height={30} />
        <Skeleton variant="text" width="10%" height={32} />
      </Stack>
    </Card>
  );
}

const toUTCTimestamp = (localDayjs: dayjs.Dayjs, isEndOfDay = false) => {
  return isEndOfDay ? localDayjs.endOf('day').utc().unix() : localDayjs.startOf('day').utc().unix();
};
function CreditBoard() {
  const { t } = useLocaleContext();
  const [dateRange, setDateRange] = useState({
    from: toUTCTimestamp(dayjs().subtract(6, 'day')),
    to: toUTCTimestamp(dayjs(), true),
  });
  const [refreshKey, setRefreshKey] = useState(0);

  // API hooks
  const {
    data: creditBalance,
    loading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
  } = useCreditBalance();

  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useUsageStats({
    startTime: dateRange.from.toString(),
    endTime: dateRange.to.toString(),
  });

  const handleQuickDateSelect = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    setDateRange({
      from: toUTCTimestamp(range.start),
      to: toUTCTimestamp(range.end, true),
    });
  };

  const hasError = balanceError || statsError;

  // Smart loading states to prevent flickering
  const showBalanceSkeleton = useSmartLoading(balanceLoading, creditBalance);
  const showStatsSkeleton = useSmartLoading(statsLoading, usageStats);

  const onRefresh = () => {
    refetchBalance();
    refetchStats();
    setRefreshKey((prev) => prev + 1);
    Toast.success(t('analytics.refreshSuccess'));
  };

  const dailyStats = usageStats?.dailyStats?.filter(
    (stat: any) => stat.timestamp >= dateRange.from && stat.timestamp <= dateRange.to
  );
  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Stack spacing={3}>
          {/* Header */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
            }}>
            <Box>
              <Typography variant="h2" sx={{ fontWeight: 'bold', mb: 0.5, color: 'text.primary' }}>
                {t('analytics.creditUsage')}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                }}>
                {t('analytics.creditBoardDescription')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <DateRangePicker
                startDate={dayjs.unix(dateRange.from).local()}
                endDate={dayjs.unix(dateRange.to).local()}
                onStartDateChange={(date: dayjs.Dayjs | null) =>
                  setDateRange((prev) => ({ ...prev, from: toUTCTimestamp(date || dayjs()) }))
                }
                onEndDateChange={(date: dayjs.Dayjs | null) =>
                  setDateRange((prev) => ({ ...prev, to: toUTCTimestamp(date || dayjs(), true) }))
                }
                onQuickSelect={handleQuickDateSelect}
                sx={{
                  alignSelf: 'flex-end',
                }}
              />
              <Tooltip title={t('analytics.refresh')}>
                <IconButton
                  onClick={onRefresh}
                  size="small"
                  sx={{
                    color: 'grey.400',
                    '&:hover': { color: 'primary.main' },
                    transition: 'color 0.2s ease',
                  }}>
                  <RefreshOutlined />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Error Alert */}
          {hasError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {formatError(balanceError || statsError)}
            </Alert>
          )}

          {/* Credits Balance */}
          {showBalanceSkeleton ? (
            <CreditsBalanceSkeleton />
          ) : (
            <CreditsBalance data={creditBalance as unknown as UserInfoResult} />
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <Stack spacing={3}>
              {showStatsSkeleton ? (
                <UsageSummarySkeleton />
              ) : (
                <UsageSummary
                  totalCredits={usageStats?.summary?.totalCredits}
                  totalUsage={usageStats?.summary?.totalUsage}
                  totalCalls={usageStats?.summary?.totalCalls}
                  trendComparison={usageStats?.trendComparison}
                  periodDays={Math.ceil((dateRange.to - dateRange.from) / (24 * 60 * 60))}
                />
              )}

              {showStatsSkeleton ? (
                <UsageChartsSkeleton />
              ) : (
                <UsageCharts dailyStats={dailyStats} showCredits={isCreditBillingEnabled} showRequests={false} />
              )}
            </Stack>

            <Stack spacing={3}>
              {showStatsSkeleton ? (
                <ModelUsageStatsSkeleton />
              ) : (
                <ModelUsageStats
                  modelStats={usageStats?.modelStats}
                  totalModelCount={usageStats?.summary?.modelCount}
                  title={t('analytics.modelUsageStats')}
                  subtitle={t('analytics.modelUsageStatsDescription')}
                />
              )}
            </Stack>
          </Box>

          <Divider sx={{ my: 2 }} />

          <CallHistory refreshKey={refreshKey} dateRange={dateRange} enableExport />
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}

export default CreditBoard;
