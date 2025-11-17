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
        <Card key={i} sx={{ flex: 1, p: 2.5, pb: 3 }}>
          <Stack spacing={0}>
            <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
            <Skeleton variant="text" width="40%" height={34} sx={{ mb: 0.5 }} />
            <Skeleton variant="text" width="80%" height={18} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

export function UsageChartsSkeleton() {
  return (
    <Card sx={{ height: 278 }}>
      <Skeleton variant="text" width="40%" height={24} sx={{ m: 2 }} />
      <Skeleton variant="rectangular" height={180} sx={{ m: 2, mb: 3, overflow: 'hidden' }} />
    </Card>
  );
}

export function ModelUsageStatsSkeleton() {
  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Stack spacing={0}>
        <Stack spacing={0} sx={{ mb: '24px !important' }}>
          <Skeleton variant="text" width="60%" height={27} sx={{ mb: 0.1 }} />
          <Skeleton variant="text" width="80%" height={24} sx={{ mb: 1 }} />
        </Stack>

        <Stack spacing={1.5}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Stack
              key={i}
              direction="row"
              sx={{
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <Stack
                width="100%"
                direction="row"
                spacing={1.5}
                my={1}
                sx={{
                  alignItems: 'center',
                }}>
                <Skeleton variant="circular" width={24} height={24} />
                <Skeleton variant="text" width={200} height={20} sx={{ mb: 0.1 }} />
              </Stack>
              <Skeleton variant="text" width={60} height={20} />
            </Stack>
          ))}
        </Stack>
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
