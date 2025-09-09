import api from '@app/libs/api';
import Toast from '@arcblock/ux/lib/Toast';
import { useRequest } from 'ahooks';

// Types
export interface CreditBalance {
  balance: number;
  currency: string;
}

export interface UsageStats {
  summary: {
    totalCredits: number;
    totalCalls: number;
    modelCount: number;
    byType: Record<
      string,
      {
        totalUsage: number;
        totalCredits: number;
        totalCalls: number;
        successCalls: number;
      }
    >;
  };
  dailyStats: Array<{
    date: string;
    credits: number;
    tokens: number;
    requests: number;
  }>;
  modelStats: Array<{
    providerId: string;
    provider: {
      id: string;
      name: string;
      displayName: string;
    };
    model: string;
    type: string;
    totalUsage: number;
    totalCredits: number;
    totalCalls: number;
    successRate: number;
  }>;
  trendComparison?: {
    current: {
      totalUsage: number;
      totalCredits: number;
      totalCalls: number;
      byType: Record<
        string,
        {
          totalUsage: number;
          totalCalls: number;
        }
      >;
    };
    previous: {
      totalUsage: number;
      totalCredits: number;
      totalCalls: number;
      byType: Record<
        string,
        {
          totalUsage: number;
          totalCalls: number;
        }
      >;
    };
    growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
  } | null;
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

// Custom hooks
export function useCreditBalance() {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest(() => api.get('/api/user/info').then((res) => res.data), {
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

export function useUsageStats(params: { startTime: string; endTime: string; allUsers?: boolean }) {
  const {
    data,
    loading,
    error,
    runAsync: refetch,
  } = useRequest(
    () =>
      api
        .get(params.allUsers ? '/api/user/admin/user-stats' : '/api/user/usage-stats', { params })
        .then((res) => res.data),
    {
      refreshDeps: [params.startTime, params.endTime],
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
        params,
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
