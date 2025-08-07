import api from '@app/libs/api';
import { useCallback, useEffect, useState } from 'react';

// Types
export interface CreditBalance {
  balance: number;
  currency: string;
}

export interface UsageStats {
  summary: {
    totalCredits: number;
    totalCalls: number;
    byType: {
      chatCompletion?: {
        totalUsage: number;
        totalCredits: number;
        totalCalls: number;
      };
      imageGeneration?: {
        totalUsage: number;
        totalCredits: number;
        totalCalls: number;
      };
    };
  };
  dailyStats: Array<{
    date: string;
    credits: number;
    tokens: number;
    requests: number;
  }>;
  modelStats: Array<{
    providerId: string;
    model: string;
    type: string;
    totalUsage: number;
    totalCredits: number;
    totalCalls: number;
    successRate: number;
  }>;
}

export interface ModelCall {
  id: string;
  createdAt: string;
  model: string;
  providerId: string;
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
  const [data, setData] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/user/info');
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch credit balance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    data,
    loading,
    error,
    refetch: fetchBalance,
  };
}

export function useUsageStats(params: { startTime: string; endTime: string }) {
  const [data, setData] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/user/usage-stats', { params });
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch usage stats');
    } finally {
      setLoading(false);
    }
  }, [params.startTime, params.endTime]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    data,
    loading,
    error,
    refetch: fetchStats,
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
  const [data, setData] = useState<ModelCallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/user/model-calls', { params });
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch model calls');
    } finally {
      setLoading(false);
    }
  }, [
    params.page,
    params.pageSize,
    params.startTime,
    params.endTime,
    params.search,
    params.status,
    params.model,
    params.providerId,
  ]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  return {
    data,
    loading,
    error,
    refetch: fetchCalls,
  };
}

export function useExportModelCalls() {
  const [loading, setLoading] = useState(false);

  const exportCalls = useCallback(
    async (params: {
      startTime: string;
      endTime: string;
      search?: string;
      status?: 'success' | 'failed';
      model?: string;
      providerId?: string;
    }) => {
      try {
        setLoading(true);
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
      } catch (err: any) {
        console.error('Export failed:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    exportCalls,
    loading,
  };
}
