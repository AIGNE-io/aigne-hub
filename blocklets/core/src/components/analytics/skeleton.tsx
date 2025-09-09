import { Card, Skeleton, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

import dayjs from '../../libs/dayjs';

// Custom hook for smart skeleton loading
export const useSmartLoading = (loading: boolean, data: any, minLoadingTime = 300) => {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isFirstLoad && !hasInitialized && !data) {
      startTimeRef.current = Date.now();
      setShowSkeleton(true);
      setHasInitialized(true);
    } else if (loading && !data && !isFirstLoad) {
      timer = setTimeout(() => {
        startTimeRef.current = Date.now();
        setShowSkeleton(true);
      }, 200);
    } else if (!loading && data && showSkeleton) {
      const elapsed = Date.now() - startTimeRef.current;
      const minTime = isFirstLoad ? 1000 : minLoadingTime;
      const delay = Math.max(0, minTime - elapsed);

      timer = setTimeout(() => {
        setShowSkeleton(false);
        setIsFirstLoad(false);
      }, delay);
    } else if (data && !hasInitialized) {
      setIsFirstLoad(false);
      setHasInitialized(true);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading, data, minLoadingTime, showSkeleton, isFirstLoad, hasInitialized]);

  return showSkeleton;
};

export function UsageSummarySkeleton() {
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

export function UsageChartsSkeleton() {
  return (
    <Card sx={{ p: 3 }}>
      <Skeleton variant="text" width="40%" height={24} sx={{ mb: 2 }} />
      <Skeleton variant="rectangular" width="100%" height={260} />
    </Card>
  );
}

export function ModelUsageStatsSkeleton() {
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

export function CreditsBalanceSkeleton() {
  return (
    <Card sx={{ p: 3 }}>
      <Stack spacing={1}>
        <Skeleton variant="text" width="20%" height={30} />
        <Skeleton variant="text" width="10%" height={32} />
      </Stack>
    </Card>
  );
}

export const toUTCTimestamp = (localDayjs: dayjs.Dayjs, isEndOfDay = false) => {
  return isEndOfDay ? localDayjs.endOf('day').utc().unix() : localDayjs.startOf('day').utc().unix();
};
