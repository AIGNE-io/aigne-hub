import { toUTCTimestamp } from '@app/components/analytics/skeleton';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { ArrowBack } from '@mui/icons-material';
import { Alert, Box, Link, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import dayjs from '../../../libs/dayjs';
import { useProjectTrends } from '../../customer/hooks';
import { ProjectCallHistory } from './components/project-call-history';
import { ProjectUsageOverviewCard } from './components/project-usage-overview-card';

const ADMIN_USAGE_DATE_RANGE_SESSION_KEY = 'usage:date-range:admin';
const CUSTOMER_USAGE_DATE_RANGE_SESSION_KEY = 'usage:date-range:customer';

const readUsageDateRangeFromSession = (isAdmin: boolean) => {
  if (typeof window === 'undefined') return null;
  try {
    const storageKey = isAdmin ? ADMIN_USAGE_DATE_RANGE_SESSION_KEY : CUSTOMER_USAGE_DATE_RANGE_SESSION_KEY;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { start: dayjs(parsed.start), end: dayjs(parsed.end) };
  } catch {
    return null;
  }
};

interface ProjectPageProps {
  appDid?: string;
  emptyStateText?: string;
  isAdmin?: boolean;
}

export default function ProjectPage({ appDid: appDidProp, emptyStateText, isAdmin = false }: ProjectPageProps) {
  const { appDid: appDidParam, page } = useParams<{ appDid?: string; page?: string }>();
  const appDid = appDidProp || appDidParam || page;
  const { t } = useLocaleContext();
  const usagePath = isAdmin ? '/config/usage' : '/credit-usage';
  const resolvedEmptyStateText = emptyStateText ?? (isAdmin ? t('analytics.selectProjectToView') : undefined);
  const [dateRange, setDateRange] = useState(() => {
    const fallbackRange = {
      from: toUTCTimestamp(dayjs().subtract(29, 'day')),
      to: toUTCTimestamp(dayjs(), true),
    };
    const storedRange = readUsageDateRangeFromSession(isAdmin);
    return storedRange
      ? { from: toUTCTimestamp(storedRange.start), to: toUTCTimestamp(storedRange.end, true) }
      : fallbackRange;
  });
  const rangeStart = dayjs.unix(dateRange.from).local().startOf('day');
  const rangeEnd = dayjs.unix(dateRange.to).local().endOf('day');
  const rangeDays = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
  const chartGranularity = rangeDays <= 1 ? 'hour' : 'day';
  const rangeFrom = toUTCTimestamp(rangeStart);
  const rangeTo = toUTCTimestamp(rangeEnd, true);
  const previousRangeEnd = rangeStart.subtract(1, 'second');
  const previousRangeStart = previousRangeEnd.subtract(rangeDays - 1, 'day').startOf('day');
  const previousRangeFrom = toUTCTimestamp(previousRangeStart);
  const previousRangeTo = toUTCTimestamp(previousRangeEnd, true);

  const { data: trendsData, loading: trendsLoading } = useProjectTrends(appDid || '', {
    startTime: rangeFrom,
    endTime: rangeTo,
    granularity: chartGranularity,
    allUsers: isAdmin,
  });
  const { data: previousTrendsData } = useProjectTrends(appDid || '', {
    startTime: previousRangeFrom,
    endTime: previousRangeTo,
    granularity: chartGranularity,
    allUsers: isAdmin,
  });

  const projectMeta = trendsData?.project ?? null;

  if (!appDid) {
    return (
      <Box sx={{ py: 6 }}>
        {resolvedEmptyStateText ? (
          <Typography variant="body2" color="text.secondary">
            {resolvedEmptyStateText}
          </Typography>
        ) : (
          <Alert severity="error">Invalid project ID</Alert>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Stack spacing={4} sx={{ mx: 'auto' }}>
        {/* Header */}
        <Link
          component={RouterLink}
          to={usagePath}
          underline="hover"
          color="text.secondary"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <ArrowBack fontSize="small" />
          {t('analytics.creditUsage')}
        </Link>

        <ProjectUsageOverviewCard
          appDid={appDid}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          trendsData={trendsData}
          previousTrendsData={previousTrendsData}
          trendsLoading={trendsLoading}
          projectMeta={projectMeta || undefined}
        />

        <ProjectCallHistory appDid={appDid} dateRange={dateRange} onDateRangeChange={setDateRange} allUsers={isAdmin} />
      </Stack>
    </Box>
  );
}
