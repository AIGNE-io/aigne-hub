import { ModelUsageStats, ProjectList, UsageOverviewCard } from '@app/components/analytics';
import {
  CreditsBalanceSkeleton,
  ModelUsageStatsSkeleton,
  toUTCTimestamp,
  useSmartLoading,
} from '@app/components/analytics/skeleton';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { getPrefix } from '@blocklet/aigne-hub/api/utils/util';
import { formatError } from '@blocklet/error';
import { Alert, Box, Button, Link, Stack, Typography } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { SetStateAction, useMemo, useState } from 'react';
import { joinURL } from 'ufo';

import dayjs from '../../libs/dayjs';
import { CreditsBalance } from './credits-balance';
import {
  useCreditBalance,
  useCreditGrants,
  useCreditTransactions,
  useProjectGroupedTrends,
  useUsageQuota,
  useUsageStats,
} from './hooks';

const INTRO_ARTICLE_URL = 'https://www.arcblock.io/content/tags/en/ai-kit';
const AIGNE_WEBSITE_URL = 'https://www.aigne.io/';
const USAGE_DATE_RANGE_SESSION_KEY = 'usage:date-range:customer';

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
  sessionStorage.setItem(
    USAGE_DATE_RANGE_SESSION_KEY,
    JSON.stringify({
      start: range.start.format('YYYY-MM-DD'),
      end: range.end.format('YYYY-MM-DD'),
    })
  );
};

function CreditBoard() {
  const { t } = useLocaleContext();
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
  const rangeStart = dateRange.start.startOf('day');
  const rangeEnd = dateRange.end.endOf('day');
  const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
  const chartGranularity = rangeDays <= 1 ? 'hour' : 'day';
  const rangeFrom = toUTCTimestamp(rangeStart);
  const rangeTo = toUTCTimestamp(rangeEnd, true);
  const periodSeconds = rangeTo - rangeFrom;
  const previousRangeTo = rangeFrom - 1;
  const previousRangeFrom = previousRangeTo - periodSeconds;
  const timezoneOffset = new Date().getTimezoneOffset();

  // API hooks
  const { data: creditBalance, loading: balanceLoading, error: balanceError } = useCreditBalance();
  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;

  const { data: creditGrants } = useCreditGrants(isCreditBillingEnabled);
  const { data: creditTransactions } = useCreditTransactions(isCreditBillingEnabled);

  // New usage API hooks
  const { data: usageQuota } = useUsageQuota();
  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
  } = useUsageStats({
    startTime: rangeFrom.toString(),
    endTime: rangeTo.toString(),
    timezoneOffset, // Send timezone offset in minutes
  });
  const { data: projectGroupedTrends, loading: projectTrendsLoading } = useProjectGroupedTrends({
    startTime: rangeFrom,
    endTime: rangeTo,
    granularity: chartGranularity,
    timezoneOffset,
  });
  const { data: previousProjectGroupedTrends } = useProjectGroupedTrends({
    startTime: previousRangeFrom,
    endTime: previousRangeTo,
    granularity: chartGranularity,
    timezoneOffset,
  });

  const hasError = balanceError || statsError;

  // Smart loading states to prevent flickering
  const showBalanceSkeleton = useSmartLoading(balanceLoading, creditBalance);
  const showStatsSkeleton = statsLoading;

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
        <Stack spacing={3} sx={{ pb: 20 }}>
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
            <CreditsBalance
              data={creditBalance as unknown as UserInfoResult}
              estimatedDaysRemaining={usageQuota?.estimatedDaysRemaining}
              dailyAvgCredits={usageQuota?.dailyAvgCredits}
            />
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <Stack spacing={3}>
              <UsageOverviewCard
                title={t('analytics.creditOverview')}
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
                projectTrends={projectGroupedTrends}
                previousProjectTrends={previousProjectGroupedTrends}
                trendsLoading={projectTrendsLoading}
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

          {/* Project List - replaces CallHistory */}
          <ProjectList
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            dataSource="trends"
            trendsData={projectGroupedTrends}
            trendsLoading={projectTrendsLoading}
          />
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}

export default CreditBoard;
