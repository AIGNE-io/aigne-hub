import { DailyStats } from '@api/store/models/types';
import BigNumber from 'bignumber.js';

export type Stats = { totalUsage: BigNumber; totalCredits: BigNumber; totalCalls: BigNumber; byType: ByType };
export type ByType = Record<string, { totalUsage: BigNumber; totalCalls: BigNumber }>;

function initByType(): ByType {
  return {};
}

export function addToTotals(
  target: { totalUsage: BigNumber; totalCredits: BigNumber; totalCalls: BigNumber; byType: ByType },
  source: DailyStats
) {
  target.totalUsage = target.totalUsage.plus(source.totalUsage || 0);
  target.totalCredits = target.totalCredits.plus(source.totalCredits || 0);
  target.totalCalls = target.totalCalls.plus(source.totalCalls || 0);

  for (const [type, typeStats] of Object.entries(source.byType || {})) {
    if (!target.byType[type]) {
      target.byType[type] = { totalUsage: new BigNumber(0), totalCalls: new BigNumber(0) };
    }
    target.byType[type].totalUsage = target.byType[type].totalUsage.plus(typeStats.totalUsage || 0);
    target.byType[type].totalCalls = target.byType[type].totalCalls.plus(typeStats.totalCalls || 0);
  }
}

export function formatUsageStats({ hourlyStatsRaw, hours }: { hourlyStatsRaw: DailyStats[]; hours: number[] }) {
  const usageStats: Stats = {
    byType: initByType(),
    totalUsage: new BigNumber(0),
    totalCredits: new BigNumber(0),
    totalCalls: new BigNumber(0),
  };

  const dailyStatsMap = new Map<
    string,
    { totalUsage: BigNumber; totalCredits: BigNumber; totalCalls: BigNumber; byType: ByType }
  >();

  hourlyStatsRaw.forEach((hourStats, index) => {
    const hourTimestamp = hours[index] ?? hourStats.timestamp;

    addToTotals(usageStats, hourStats);

    if (!hourTimestamp) return;
    const date = new Date(hourTimestamp * 1000).toISOString().split('T')[0];
    if (!date) return;
    if (!dailyStatsMap.has(date)) {
      dailyStatsMap.set(date, {
        byType: initByType(),
        totalUsage: new BigNumber(0),
        totalCredits: new BigNumber(0),
        totalCalls: new BigNumber(0),
      });
    }

    addToTotals(dailyStatsMap.get(date)!, hourStats);
  });

  const dailyStats = Array.from(dailyStatsMap.entries())
    .map(([date, dayData]) => ({
      date,
      timestamp: Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000),
      totalUsage: dayData.totalUsage.toNumber(),
      totalCredits: dayData.totalCredits.toNumber(),
      totalCalls: dayData.totalCalls.toNumber(),
      byType: Object.fromEntries(
        Object.entries(dayData.byType).map(([type, v]) => [
          type,
          { totalUsage: v.totalUsage.toNumber(), totalCalls: v.totalCalls.toNumber() },
        ])
      ),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    usageStats: {
      totalUsage: usageStats.totalUsage.toNumber(),
      totalCredits: usageStats.totalCredits.toNumber(),
      totalCalls: usageStats.totalCalls.toNumber(),
      byType: Object.fromEntries(
        Object.entries(usageStats.byType).map(([type, v]) => [
          type,
          { totalUsage: v.totalUsage.toNumber(), totalCalls: v.totalCalls.toNumber() },
        ])
      ),
    },
    totalUsage: usageStats.totalUsage.toNumber(),
    totalCredits: usageStats.totalCredits.toNumber(),
    dailyStats,
  };
}
