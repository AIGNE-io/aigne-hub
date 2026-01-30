import { useRequest } from 'ahooks';
import axios from 'axios';

interface DailyGrantStat {
  date: string; // YYYY-MM-DD
  granted_amount: string;
  used_amount: string; // Grant credits consumed on this day
  remaining_amount: string;
}

interface GrantUsageSummary {
  total_granted_amount: string;
  total_used_amount: string;
  total_remaining_amount: string;
}

interface GrantUsageStats {
  summary: GrantUsageSummary;
  daily_stats: DailyGrantStat[];
}

interface UseGrantUsageParams {
  startTime?: number;
  endTime?: number;
  grantorDid?: string; // Project DID (appDid)
}

export function useGrantUsage({ startTime, endTime, grantorDid }: UseGrantUsageParams) {
  return useRequest(
    async () => {
      if (!startTime || !endTime || !grantorDid) {
        return {
          summary: {
            total_granted_amount: '0',
            total_used_amount: '0',
            total_remaining_amount: '0',
          },
          daily_stats: [],
        };
      }

      try {
        const response = await axios.get<GrantUsageStats>('/api/credit/grant-usage', {
          params: { startTime, endTime, grantorDid },
        });

        // Silent degradation on failure
        if ('success' in response.data && (response.data as any).success === false) {
          console.warn('Grant usage query failed:', (response.data as any).error);
          return {
            summary: {
              total_granted_amount: '0',
              total_used_amount: '0',
              total_remaining_amount: '0',
            },
            daily_stats: [],
          };
        }

        return response.data;
      } catch (err: any) {
        console.error('Failed to fetch grant usage:', err);
        // Silent degradation - return empty data
        return {
          summary: {
            total_granted_amount: '0',
            total_used_amount: '0',
            total_remaining_amount: '0',
          },
          daily_stats: [],
        };
      }
    },
    {
      refreshDeps: [startTime, endTime, grantorDid],
      ready: !!startTime && !!endTime && !!grantorDid,
    }
  );
}
