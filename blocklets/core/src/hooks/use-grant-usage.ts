import { useRequest } from 'ahooks';
import axios from 'axios';

interface DailyGrantStat {
  date: string; // YYYY-MM-DD
  currency_id: string;
  category: string;
  grant_count: number;
  total_granted: number;
  total_remaining: number;
  total_consumed: string;
}

interface GrantUsageCurrency {
  id: string;
  name: string;
  symbol: string;
  decimal: number;
}

interface GrantUsageSummary {
  currency_id: string;
  currency: GrantUsageCurrency;
  category: string;
  grant_count: number;
  total_granted: string;
  total_remaining: string;
  total_consumed: string;
}

interface GrantUsageStats {
  summary: GrantUsageSummary;
  daily_stats: DailyGrantStat[];
}

interface UseGrantUsageParams {
  startTime?: number;
  endTime?: number;
  grantorDid?: string; // Project DID (appDid)
  timezoneOffset?: number;
  enabled?: boolean;
}

export function useGrantUsage({ startTime, endTime, grantorDid, timezoneOffset, enabled = true }: UseGrantUsageParams) {
  return useRequest(
    async () => {
      if (!enabled || !startTime || !endTime) {
        return null;
      }

      try {
        const response = await axios.get<GrantUsageStats>('/api/credit/grant-usage', {
          params: {
            startTime,
            endTime,
            ...(grantorDid && { grantorDid }),
            ...(timezoneOffset !== undefined && { timezoneOffset }),
          },
        });

        // Silent degradation on failure
        if ('success' in response.data && (response.data as any).success === false) {
          console.warn('Grant usage query failed:', (response.data as any).error);
          return null;
        }

        return response.data;
      } catch (err: any) {
        console.error('Failed to fetch grant usage:', err);
        // Silent degradation - return null
        return null;
      }
    },
    {
      refreshDeps: [startTime, endTime, grantorDid, timezoneOffset, enabled],
      ready: enabled,
    }
  );
}
