import api from '@app/libs/api';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { useRequest } from 'ahooks';
import { useMemo, useState } from 'react';
// Types
export interface CreditBalance {
  balance: number;
  currency: string;
}

export interface UsageStats {
  modelStats: {
    list: Array<{
      providerId: string;
      provider: {
        id: string;
        name: string;
        displayName: string;
      };
      model: string;
      totalCalls: number;
    }>;
    totalModelCount: number;
  };
}

export interface ModelCall {
  id: string;
  createdAt: string;
  model: string;
  providerId: string;
  provider?: {
    id: string;
    name: string;
    displayName: string;
  };
  type: string;
  status: 'success' | 'failed';
  totalUsage: number;
  credits: number;
  duration?: number;
  errorReason?: string;
  appDid?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  displayName: string;
  enabled?: boolean;
}

export interface ModelCallsResponse {
  data: ModelCall[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface UserInfoItem {
  did: string;
  fullName?: string;
  email?: string;
  avatar?: string;
}

// Polling interval for all queries (30 seconds)
const POLLING_INTERVAL = 30 * 1000;

// Custom hooks
export function useCreditBalance() {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest(() => api.get('/api/user/info').then((res) => res.data), {
    pollingInterval: POLLING_INTERVAL,
    pollingWhenHidden: false,
    onError: (error) => {
      console.error('Failed to fetch credit balance:', error);
    },
  });

  return {
    data,
    loading,
    error,
    refetch,
  };
}

export function useUsageStats(params: {
  startTime: string;
  endTime: string;
  allUsers?: boolean;
  timezoneOffset?: number;
}) {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<UsageStats, []>(
    () =>
      api
        .get(params.allUsers ? '/api/user/admin/user-stats' : '/api/user/usage-stats', { params })
        .then((res) => res.data),
    {
      refreshDeps: [params.startTime, params.endTime, params.timezoneOffset],
      onError: (error) => {
        console.error('Failed to fetch usage stats:', error);
        Toast.error(error?.message);
      },
    }
  );

  return {
    data,
    loading,
    error,
    refetch,
  };
}

export function useModelCalls(params: {
  page: number;
  pageSize: number;
  startTime: string;
  endTime: string;
  search?: string;
  status?: 'success' | 'failed';
  model?: string;
  providerId?: string;
}) {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest(() => api.get('/api/user/model-calls', { params }).then((res) => res.data), {
    refreshDeps: [
      params.page,
      params.pageSize,
      params.startTime,
      params.endTime,
      params.search,
      params.status,
      params.model,
      params.providerId,
    ],
    onError: (error) => {
      console.error('Failed to fetch model calls:', error);
    },
  });

  return {
    data,
    loading,
    error,
    refetch,
  };
}

export function useExportModelCalls() {
  const { locale } = useLocaleContext();

  const { run: exportCalls, loading } = useRequest(
    async (params: {
      startTime: string;
      endTime: string;
      search?: string;
      status?: 'success' | 'failed';
      model?: string;
      providerId?: string;
    }) => {
      const response = await api.get('/api/user/model-calls/export', {
        params: { ...params, locale },
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `model-calls-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    {
      manual: true,
      onError: (error) => {
        console.error('Export failed:', error);
      },
    }
  );

  return {
    exportCalls,
    loading,
  };
}

export function useAIProviders(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;

  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<AIProvider[], []>(() => api.get('/api/ai-providers').then((res) => res.data), {
    ready: enabled,
    cacheKey: 'ai-providers',
    staleTime: 5 * 60 * 1000,
    onError: (error) => {
      console.error('Failed to fetch providers:', error);
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const providers = Array.isArray(data) ? data : [];
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);

  return {
    providers,
    providerMap,
    loading,
    error,
    refetch,
  };
}

export function useCreditGrants(isCreditBillingEnabled: boolean) {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest(
    () => api.get('/api/user/credit/grants', { params: { page: 1, pageSize: 10 } }).then((res) => res.data),
    {
      pollingInterval: POLLING_INTERVAL,
      pollingWhenHidden: false,
      onError: (error) => {
        console.error('Failed to fetch credit grants:', error);
      },
      ready: isCreditBillingEnabled,
    }
  );

  return {
    data,
    loading,
    error,
    refetch,
  };
}

export function useCreditTransactions(isCreditBillingEnabled: boolean) {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest(
    () => api.get('/api/user/credit/transactions', { params: { page: 1, pageSize: 1 } }).then((res) => res.data),
    {
      onError: (error) => {
        console.error('Failed to fetch credit transactions:', error);
      },
      ready: isCreditBillingEnabled,
    }
  );

  return {
    data,
    loading,
    error,
    refetch,
  };
}

// New hooks for usage dashboard APIs

export interface UsageQuota {
  total: number;
  remaining: number;
  used: number;
  pendingCredit: number;
  estimatedDaysRemaining: number;
  dailyAvgCredits?: number;
  currency: string;
}

export interface UsageProject {
  appDid: string | null;
  appName?: string;
  totalCalls: number;
  totalCredits: number;
  avgDuration?: number;
  successRate: number;
  lastCallTime: number;
}

export interface UsageTrend {
  timestamp: number;
  calls: number;
  successCalls: number;
  successRate: number;
  avgDuration: number;
  totalCredits: number;
  totalUsage: number;
}

export interface ProjectGroupedTrend {
  timestamp: number;
  byProject: Record<
    string,
    {
      totalUsage: number;
      totalCredits: number;
      totalCalls: number;
      successCalls: number;
      avgDuration: number;
    }
  >;
}

export interface ProjectTrendSummary {
  appDid: string | null;
  appName?: string;
  appLogo?: string;
  appUrl?: string;
  lastCallTime?: number;
}

export function useUsageQuota() {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<UsageQuota, []>(() => api.get('/api/usage/quota').then((res) => res.data), {
    pollingInterval: POLLING_INTERVAL,
    pollingWhenHidden: false,
    onError: (error) => {
      console.error('Failed to fetch usage quota:', error);
    },
  });

  return { data, loading, error, refetch };
}

export function useUsageProjects(params: {
  timeRange?: number;
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
  sortBy?: 'totalCalls' | 'totalCredits';
  sortOrder?: 'asc' | 'desc';
  allUsers?: boolean;
  timezoneOffset?: number;
  enabled?: boolean;
}) {
  const { enabled, ...queryParams } = params;
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ projects: UsageProject[]; total: number; page: number; pageSize: number }, []>(
    () => api.get('/api/usage/projects', { params: queryParams }).then((res) => res.data),
    {
      refreshDeps: [
        queryParams.timeRange,
        queryParams.startTime,
        queryParams.endTime,
        queryParams.page,
        queryParams.pageSize,
        queryParams.sortBy,
        queryParams.sortOrder,
        queryParams.allUsers,
        queryParams.timezoneOffset,
      ],
      ready: enabled ?? true,
      onError: (error) => {
        console.error('Failed to fetch usage projects:', error);
      },
    }
  );

  return { data, loading, error, refetch };
}

export function useUsageTrends(params: {
  timeRange?: number;
  startTime?: number;
  endTime?: number;
  granularity?: 'hour' | 'day';
  timezoneOffset?: number;
  enabled?: boolean;
  includeComparison?: boolean;
}) {
  const { enabled, includeComparison, ...queryParams } = params;

  // Calculate extended range for comparison
  const actualParams = useMemo(() => {
    if (!includeComparison || !queryParams.startTime || !queryParams.endTime) {
      return queryParams;
    }
    const periodSeconds = queryParams.endTime - queryParams.startTime;
    return {
      ...queryParams,
      startTime: queryParams.startTime - periodSeconds,
      endTime: queryParams.endTime,
      timeRange: undefined, // Clear timeRange when using explicit timestamps
    };
  }, [includeComparison, queryParams]);

  const {
    data: rawData,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ trends: UsageTrend[] }, []>(
    () => api.get('/api/usage/trends', { params: actualParams }).then((res) => res.data),
    {
      refreshDeps: [
        actualParams.timeRange,
        actualParams.startTime,
        actualParams.endTime,
        actualParams.granularity,
        actualParams.timezoneOffset,
      ],
      ready: enabled ?? true,
      onError: (error) => {
        console.error('Failed to fetch usage trends:', error);
      },
    }
  );

  // Split data if comparison is included
  const data = useMemo(() => {
    if (!includeComparison || !rawData || !queryParams.startTime) {
      return {
        current: rawData,
        comparison: undefined,
      };
    }

    const midTimestamp = queryParams.startTime;
    const currentTrends = rawData.trends.filter((t) => t.timestamp >= midTimestamp);
    const comparisonTrends = rawData.trends.filter((t) => t.timestamp < midTimestamp);

    return {
      current: {
        trends: currentTrends,
      },
      comparison:
        comparisonTrends.length > 0
          ? {
              trends: comparisonTrends,
            }
          : undefined,
    };
  }, [includeComparison, rawData, queryParams.startTime]);

  return {
    data: includeComparison ? data.current : rawData,
    comparisonData: includeComparison ? data.comparison : undefined,
    loading,
    error,
    refetch,
  };
}

export function useProjectGroupedTrends(params: {
  startTime?: number;
  endTime?: number;
  granularity?: 'hour' | 'day';
  allUsers?: boolean;
  timezoneOffset?: number;
  enabled?: boolean;
  includeComparison?: boolean;
}) {
  const { enabled, includeComparison, ...queryParams } = params;

  // Calculate extended range for comparison
  const actualParams = useMemo(() => {
    if (!includeComparison || !queryParams.startTime || !queryParams.endTime) {
      return queryParams;
    }
    const periodSeconds = queryParams.endTime - queryParams.startTime;
    return {
      ...queryParams,
      startTime: queryParams.startTime - periodSeconds,
      endTime: queryParams.endTime,
    };
  }, [includeComparison, queryParams]);

  const {
    data: rawData,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ projects: ProjectTrendSummary[]; trends: ProjectGroupedTrend[]; granularity: 'hour' | 'day' }, []>(
    () => api.get('/api/usage/projects/trends', { params: actualParams }).then((res) => res.data),
    {
      refreshDeps: [
        actualParams.startTime,
        actualParams.endTime,
        actualParams.granularity,
        actualParams.allUsers,
        actualParams.timezoneOffset,
      ],
      ready: enabled ?? true,
      onError: (error) => {
        console.error('Failed to fetch project trends', error);
      },
    }
  );

  // Split data if comparison is included
  const data = useMemo(() => {
    if (!includeComparison || !rawData || !queryParams.startTime) {
      return {
        current: rawData,
        comparison: undefined,
      };
    }

    const midTimestamp = queryParams.startTime;
    const currentTrends = rawData.trends.filter((t) => t.timestamp >= midTimestamp);
    const comparisonTrends = rawData.trends.filter((t) => t.timestamp < midTimestamp);

    return {
      current: {
        projects: rawData.projects,
        trends: currentTrends,
        granularity: rawData.granularity,
      },
      comparison:
        comparisonTrends.length > 0
          ? {
              projects: rawData.projects,
              trends: comparisonTrends,
              granularity: rawData.granularity,
            }
          : undefined,
    };
  }, [includeComparison, rawData, queryParams.startTime]);

  return {
    data: includeComparison ? data.current : rawData,
    comparisonData: includeComparison ? data.comparison : undefined,
    loading,
    error,
    refetch,
  };
}

// Project page hooks

export interface ProjectStats {
  appDid: string | null;
  appName?: string;
  appLogo?: string;
  appUrl?: string;
  totalCalls: number;
  totalTokens: number;
  totalCredits: number;
  successCalls?: number;
  successRate: number;
  avgDuration: number;
}

export interface ProjectTrend {
  timestamp: number;
  calls: number;
  successCalls: number;
  avgDuration: number;
  totalCredits: number;
  totalUsage: number;
}

export interface ModelDistribution {
  model: string;
  calls: number;
  percentage: number;
}

export function useProjectTrends(
  appDid: string,
  params: {
    startTime?: number;
    endTime?: number;
    granularity?: 'hour' | 'day';
    allUsers?: boolean;
    timezoneOffset?: number;
    includeComparison?: boolean;
  }
) {
  const { includeComparison, ...queryParams } = params;

  // Calculate extended range for comparison
  const actualParams = useMemo(() => {
    if (!includeComparison || !queryParams.startTime || !queryParams.endTime) {
      return queryParams;
    }
    const periodSeconds = queryParams.endTime - queryParams.startTime;
    return {
      ...queryParams,
      startTime: queryParams.startTime - periodSeconds,
      endTime: queryParams.endTime,
    };
  }, [includeComparison, queryParams]);

  const {
    data: rawData,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ project?: ProjectTrendSummary | null; trends: ProjectTrend[] }, []>(
    () =>
      api
        .get(`/api/usage/projects/${encodeURIComponent(appDid)}/trends`, { params: actualParams })
        .then((res) => res.data),
    {
      refreshDeps: [
        appDid,
        actualParams.startTime,
        actualParams.endTime,
        actualParams.granularity,
        actualParams.allUsers,
        actualParams.timezoneOffset,
      ],
      ready: !!appDid,
      onError: (error) => {
        console.error('Failed to fetch project trends:', error);
      },
    }
  );

  // Split data if comparison is included
  const data = useMemo(() => {
    if (!includeComparison || !rawData || !queryParams.startTime) {
      return {
        current: rawData,
        comparison: undefined,
      };
    }

    const midTimestamp = queryParams.startTime;
    const currentTrends = rawData.trends.filter((t) => t.timestamp >= midTimestamp);
    const comparisonTrends = rawData.trends.filter((t) => t.timestamp < midTimestamp);

    return {
      current: {
        project: rawData.project,
        trends: currentTrends,
      },
      comparison:
        comparisonTrends.length > 0
          ? {
              project: rawData.project,
              trends: comparisonTrends,
            }
          : undefined,
    };
  }, [includeComparison, rawData, queryParams.startTime]);

  return {
    data: includeComparison ? data.current : rawData,
    comparisonData: includeComparison ? data.comparison : undefined,
    loading,
    error,
    refetch,
  };
}

export function useAdminUserInfo(params: { userDids: string[]; enabled?: boolean }) {
  const enabled = params.enabled ?? true;
  const [userInfoMap, setUserInfoMap] = useState<Record<string, UserInfoItem>>({});

  const userDidsToFetch = useMemo(() => {
    if (!enabled) return [];
    const dids = (params.userDids || []).filter(Boolean);
    const uniqueDids = Array.from(new Set(dids)).sort();
    return uniqueDids.filter((did) => !userInfoMap[did]);
  }, [params.userDids, userInfoMap, enabled]);

  const {
    loading,
    error,
    runAsync: refetch,
  } = useRequest(
    async () => {
      if (!enabled || userDidsToFetch.length === 0) return [];
      const { data } = await api.post('/api/user/admin/user-info', { userDids: userDidsToFetch });
      return data?.users || [];
    },
    {
      refreshDeps: [enabled, userDidsToFetch.join('|')],
      onSuccess: (users: UserInfoItem[] = []) => {
        if (!enabled || userDidsToFetch.length === 0) return;
        setUserInfoMap((prev) => {
          const next = { ...prev };
          users.forEach((info) => {
            if (info?.did) next[info.did] = info;
          });
          userDidsToFetch.forEach((did) => {
            if (did && !next[did]) next[did] = { did, fullName: '', avatar: '' };
          });
          return next;
        });
      },
      onError: (error) => {
        console.error('Failed to fetch user info:', error);
      },
    }
  );

  return { userInfoMap, loading, error, refetch };
}
