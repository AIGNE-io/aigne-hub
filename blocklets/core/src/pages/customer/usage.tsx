import { ModelUsageStats, ProjectList, UsageOverviewCard } from '@app/components/analytics';
import {
  CreditsBalanceSkeleton,
  ModelUsageStatsSkeleton,
  toUTCTimestamp,
  useSmartLoading,
} from '@app/components/analytics/skeleton';
import { useTransitionContext } from '@app/components/loading/progress-bar';
import { useIsRole } from '@app/contexts/session';
import { useDateRange } from '@app/hooks/use-date-range';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { getPrefix } from '@blocklet/aigne-hub/api/utils/util';
import { formatError } from '@blocklet/error';
import { PersonOutline, PeopleOutline, WavingHandOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Link, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinURL } from 'ufo';

import { CreditsBalance } from './credits-balance';
import {
  useCreditBalance,
  useCreditGrants,
  useCreditTransactions,
  useProjectGroupedTrends,
  useUsageQuota,
  useUsageStats,
  useUsageTrends,
} from './hooks';

const INTRO_ARTICLE_URL = 'https://www.arcblock.io/content/tags/en/ai-kit';
const AIGNE_WEBSITE_URL = 'https://www.aigne.io/';

function CreditBoard() {
  const { t } = useLocaleContext();
  const navigate = useNavigate();
  const { startTransition } = useTransitionContext();
  const isAdmin = useIsRole('owner', 'admin');
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');
  const allUsers = isAdmin && viewMode === 'all';

  const [dateRange, handleDateRangeChange] = useDateRange('usage:date-range:customer');
  const rangeStart = dateRange.start.startOf('day');
  const rangeEnd = dateRange.end.endOf('day');
  const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
  const chartGranularity = rangeDays <= 1 ? 'hour' : 'day';
  const rangeFrom = toUTCTimestamp(rangeStart);
  const rangeTo = toUTCTimestamp(rangeEnd, true);
  const timezoneOffset = new Date().getTimezoneOffset();

  // API hooks
  const { data: creditBalance, loading: balanceLoading, error: balanceError } = useCreditBalance();
  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;

  const { data: creditGrants } = useCreditGrants(isCreditBillingEnabled);
  const { data: creditTransactions } = useCreditTransactions(isCreditBillingEnabled);

  // Usage API hooks — personal view
  const { data: usageQuota } = useUsageQuota();
  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
  } = useUsageStats({
    allUsers,
    startTime: rangeFrom.toString(),
    endTime: rangeTo.toString(),
    timezoneOffset,
  });
  const { data: projectGroupedTrends, loading: projectTrendsLoading } = useProjectGroupedTrends({
    startTime: rangeFrom,
    endTime: rangeTo,
    granularity: chartGranularity,
    allUsers,
    timezoneOffset,
  });

  // Usage trends — platform view (only fetched when admin + allUsers)
  const {
    data: usageTrends,
    comparisonData: previousUsageTrends,
    loading: usageTrendsLoading,
  } = useUsageTrends({
    startTime: rangeFrom,
    endTime: rangeTo,
    granularity: chartGranularity,
    timezoneOffset,
    enabled: allUsers,
    includeComparison: true,
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

  const shouldShowWelcomeGuide = !allUsers && hasWelcomeCredit && hasNoTransactions && isCreditBillingEnabled;
  const showGuestPlayground = window.blocklet?.preferences?.guestPlaygroundEnabled;

  const isCfMode = !window.blocklet?.appId;
  const handleProjectSelect = allUsers
    ? (appDid: string) => {
        const basePath = isCfMode ? '/usage/projects' : '/config/projects';
        startTransition(() => navigate(`${basePath}/${encodeURIComponent(appDid)}`));
      }
    : undefined;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Stack spacing={3} sx={{ pb: 20 }}>
          {/* Header */}
          {shouldShowWelcomeGuide && (
            <Alert
              severity="info"
              icon={<WavingHandOutlined sx={{ fontSize: 18 }} />}
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

            {/* Admin view toggle */}
            {isAdmin && (
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, val) => val && setViewMode(val)}
                size="small">
                <ToggleButton value="my">
                  <PersonOutline sx={{ fontSize: 18, mr: 0.5 }} />
                  {t('analytics.myUsage')}
                </ToggleButton>
                <ToggleButton value="all">
                  <PeopleOutline sx={{ fontSize: 18, mr: 0.5 }} />
                  {t('analytics.allUsage')}
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Stack>

          {/* Error Alert */}
          {hasError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {formatError(balanceError || statsError)}
            </Alert>
          )}

          {/* Credits Balance — personal view only */}
          {!allUsers && (
            <>
              {showBalanceSkeleton ? (
                <CreditsBalanceSkeleton />
              ) : (
                <CreditsBalance
                  data={creditBalance as unknown as UserInfoResult}
                  estimatedDaysRemaining={usageQuota?.estimatedDaysRemaining}
                  dailyAvgCredits={usageQuota?.dailyAvgCredits}
                />
              )}
            </>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            <Stack spacing={3}>
              <UsageOverviewCard
                title={t('analytics.creditOverview')}
                allUsers={allUsers}
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
                projectTrends={allUsers ? undefined : projectGroupedTrends}
                usageTrends={allUsers ? usageTrends : undefined}
                previousUsageTrends={allUsers ? previousUsageTrends : undefined}
                trendsLoading={allUsers ? usageTrendsLoading : projectTrendsLoading}
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

          {/* Project List */}
          <ProjectList
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            allUsers={allUsers}
            onProjectSelect={handleProjectSelect}
            {...(!allUsers && { dataSource: 'trends', trendsData: projectGroupedTrends, trendsLoading: projectTrendsLoading })}
          />
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}

export default CreditBoard;
