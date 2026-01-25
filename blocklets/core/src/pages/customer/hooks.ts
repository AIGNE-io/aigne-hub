import api from '@app/libs/api';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { useRequest } from 'ahooks';
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

export interface ModelCallsResponse {
  data: ModelCall[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
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
  sortBy?: 'totalCalls' | 'totalCredits' | 'lastCallTime';
  sortOrder?: 'asc' | 'desc';
  allUsers?: boolean;
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
  enabled?: boolean;
}) {
  const { enabled, ...queryParams } = params;
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ trends: UsageTrend[] }, []>(
    () => api.get('/api/usage/trends', { params: queryParams }).then((res) => res.data),
    {
      refreshDeps: [queryParams.timeRange, queryParams.startTime, queryParams.endTime, queryParams.granularity],
      ready: enabled ?? true,
      onError: (error) => {
        console.error('Failed to fetch usage trends:', error);
      },
    }
  );

  return { data, loading, error, refetch };
}

export function useProjectGroupedTrends(params: {
  startTime?: number;
  endTime?: number;
  granularity?: 'hour' | 'day';
  allUsers?: boolean;
  enabled?: boolean;
}) {
  const { enabled, ...queryParams } = params;
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ projects: ProjectTrendSummary[]; trends: ProjectGroupedTrend[]; granularity: 'hour' | 'day' }, []>(
    () => api.get('/api/usage/projects/trends', { params: queryParams }).then((res) => res.data),
    {
      refreshDeps: [queryParams.startTime, queryParams.endTime, queryParams.granularity, queryParams.allUsers],
      ready: enabled ?? true,
      onError: (error) => {
        console.error('Failed to fetch project trends', error);
      },
    }
  );

  return { data, loading, error, refetch };
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
  params: { startTime?: number; endTime?: number; granularity?: 'hour' | 'day'; allUsers?: boolean }
) {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest<{ project?: ProjectTrendSummary | null; trends: ProjectTrend[] }, []>(
    () => api.get(`/api/usage/projects/${encodeURIComponent(appDid)}/trends`, { params }).then((res) => res.data),
    {
      refreshDeps: [appDid, params.startTime, params.endTime, params.granularity, params.allUsers],
      ready: !!appDid,
      onError: (error) => {
        console.error('Failed to fetch project trends:', error);
      },
    }
  );

  return { data, loading, error, refetch };
}
