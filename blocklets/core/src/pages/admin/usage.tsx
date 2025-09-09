import { CallHistory, DateRangePicker, ModelUsageStats, UsageCharts, UsageSummary } from '@app/components/analytics';
import {
  ModelUsageStatsSkeleton,
  UsageChartsSkeleton,
  UsageSummarySkeleton,
  toUTCTimestamp,
  useSmartLoading,
} from '@app/components/analytics/skeleton';
import { Toast } from '@arcblock/ux';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatError } from '@blocklet/error';
import { RefreshOutlined } from '@mui/icons-material';
import { Alert, Box, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useState } from 'react';

import Layout from '../../components/layout/admin';
import dayjs from '../../libs/dayjs';
import { useUsageStats } from '../customer/hooks';

function CreditBoard() {
  const { t } = useLocaleContext();
  const [dateRange, setDateRange] = useState({
    from: toUTCTimestamp(dayjs().subtract(6, 'day')),
    to: toUTCTimestamp(dayjs(), true),
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useUsageStats({
    allUsers: true,
    startTime: dateRange.from.toString(),
    endTime: dateRange.to.toString(),
  });

  const handleQuickDateSelect = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    setDateRange({
      from: toUTCTimestamp(range.start),
      to: toUTCTimestamp(range.end, true),
    });
  };

  const showStatsSkeleton = useSmartLoading(statsLoading, usageStats);

  const onRefresh = () => {
    refetchStats();
    setRefreshKey((prev) => prev + 1);
    Toast.success(t('analytics.refreshSuccess'));
  };

  const dailyStats = usageStats?.dailyStats?.filter(
    (stat: { timestamp: number }) => stat.timestamp >= dateRange.from && stat.timestamp <= dateRange.to
  );
  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 3 }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
            }}>
            <Box>
              <Typography variant="h2" sx={{ fontWeight: 'bold', mb: 0.5, color: 'text.primary' }}>
                {t('analytics.allCreditsUsage')}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                }}>
                {t('analytics.allCreditBoardDescription')}
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

          {statsError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {formatError(statsError)}
            </Alert>
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

          <CallHistory refreshKey={refreshKey} dateRange={dateRange} enableExport allUsers />
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}

export default function UsageAdminPage() {
  return (
    <Layout>
      <CreditBoard />
    </Layout>
  );
}
