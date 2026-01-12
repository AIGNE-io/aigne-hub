import { CallHistory, DateRangePicker, ModelUsageStats, UsageCharts, UsageSummary } from '@app/components/analytics';
import {
  CreditsBalanceSkeleton,
  ModelUsageStatsSkeleton,
  UsageChartsSkeleton,
  UsageSummarySkeleton,
  toUTCTimestamp,
  useSmartLoading,
} from '@app/components/analytics/skeleton';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { getPrefix } from '@blocklet/aigne-hub/api/utils/util';
import { formatError } from '@blocklet/error';
import { RefreshOutlined } from '@mui/icons-material';
import { Alert, Box, Button, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { joinURL } from 'ufo';

import dayjs from '../../libs/dayjs';
import { CreditsBalance } from './credits-balance';
import { useCreditBalance, useCreditGrants, useCreditTransactions, useUsageStats } from './hooks';

const INTRO_ARTICLE_URL = 'https://www.arcblock.io/content/tags/en/ai-kit';
const AIGNE_WEBSITE_URL = 'https://www.aigne.io/';

function CreditBoard() {
  const { t } = useLocaleContext();
  const [dateRange, setDateRange] = useState({
    from: toUTCTimestamp(dayjs().subtract(6, 'day')),
    to: toUTCTimestamp(dayjs(), true),
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchParams] = useSearchParams();
  const appDid = searchParams.get('appDid') || searchParams.get('appdid');

  // API hooks
  const {
    data: creditBalance,
    loading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
  } = useCreditBalance();
  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;

  const { data: creditGrants } = useCreditGrants(isCreditBillingEnabled);
  const { data: creditTransactions } = useCreditTransactions(isCreditBillingEnabled);

  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useUsageStats({
    startTime: dateRange.from.toString(),
    endTime: dateRange.to.toString(),
    timezoneOffset: new Date().getTimezoneOffset(), // Send timezone offset in minutes
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
  const showStatsSkeleton = statsLoading;

  const onRefresh = () => {
    refetchBalance();
    refetchStats();
    setRefreshKey((prev) => prev + 1);
    Toast.success(t('analytics.refreshSuccess'));
  };

  // Backend now returns data aggregated by user's local timezone
  // No filtering needed on the frontend
  const dailyStats = usageStats?.dailyStats;

  // Check if user has welcome credit and no transactions
  const hasWelcomeCredit = useMemo(() => {
    if (!creditGrants?.list || creditGrants.list.length === 0) return false;
    return creditGrants.list.some((grant: any) => grant.metadata?.welcomeCredit === true && grant.status === 'granted');
  }, [creditGrants]);

  const hasNoTransactions = useMemo(() => {
    if (!creditTransactions) return false;
    return (creditTransactions.count || 0) <= 0;
  }, [creditTransactions]);

  const shouldShowWelcomeGuide = hasWelcomeCredit && hasNoTransactions && isCreditBillingEnabled;
  const showGuestPlayground = window.blocklet?.preferences?.guestPlaygroundEnabled;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Stack spacing={3}>
          {/* Header */}
          {shouldShowWelcomeGuide && (
            <Alert
              severity="info"
              icon={<span style={{ fontSize: '18px' }}>👋</span>}
              sx={{
                borderRadius: 2,
                alignItems: 'flex-start',
                mb: 1,
              }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    {t('analytics.welcomeTitle')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.85 }}>
                    {t('analytics.welcomeMessage')
                      .split('[AIGNE]')
                      .flatMap((part, i, arr) =>
                        i < arr.length - 1
                          ? [
                              part,
                              <Link
                                // eslint-disable-next-line react/no-array-index-key
                                key={`aigne-link-${i}`}
                                href={AIGNE_WEBSITE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ color: 'inherit', fontWeight: 'bold' }}>
                                AIGNE
                              </Link>,
                            ]
                          : [part]
                      )}
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  {showGuestPlayground && (
                    <Button
                      variant="outlined"
                      size="small"
                      href={joinURL(getPrefix(), '/playground')}
                      target="_blank"
                      rel="noopener noreferrer">
                      {t('analytics.welcomeSandboxLabel')}
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    href={INTRO_ARTICLE_URL}
                    target="_blank"
                    rel="noopener noreferrer">
                    {t('analytics.welcomeDocLabel')}
                  </Button>
                </Stack>
              </Stack>
            </Alert>
          )}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
            }}>
            <Stack>
              <Typography variant="h3">{t('analytics.creditUsage')}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                  }}>
                  {t('analytics.creditBoardDescription')}
                </Typography>
              </Stack>
            </Stack>
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

          <Box sx={{ my: 2 }} />

          <CallHistory
            refreshKey={refreshKey}
            enableExport
            appDid={appDid ?? undefined}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}

export default CreditBoard;
