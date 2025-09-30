import { DailyStats } from '@api/store/models/types';
import BigNumber from 'bignumber.js';

export function computeGrowth(current: number, previous: number): number {
  if (typeof current !== 'number' || typeof previous !== 'number' || Number.isNaN(current) || Number.isNaN(previous)) {
    return 0;
  }

  if (previous > 0) {
    return new BigNumber(current).minus(previous).div(previous).toNumber();
  }

  return current > 0 ? 1 : 0;
}

interface StatsTotals {
  totalUsage: BigNumber;
  totalCredits: BigNumber;
  totalCalls: BigNumber;
  byType: {
    [key: string]: {
      totalUsage: BigNumber;
      totalCalls: BigNumber;
    };
  };
}

export const sumStats = (stats: DailyStats[]) => {
  const zero = new BigNumber(0);

  const totals: StatsTotals = {
    totalUsage: zero,
    totalCredits: zero,
    totalCalls: zero,
    byType: {},
  };

  for (const hourStats of stats) {
    // eslint-disable-next-line no-continue
    if (!hourStats) continue;

    totals.totalUsage = totals.totalUsage.plus(hourStats.totalUsage || 0);
    totals.totalCredits = totals.totalCredits.plus(hourStats.totalCredits || 0);
    totals.totalCalls = totals.totalCalls.plus(hourStats.totalCalls || 0);

    for (const [type, typeStats] of Object.entries(hourStats.byType || {})) {
      if (!totals.byType[type]) {
        totals.byType[type] = { totalUsage: zero, totalCalls: zero };
      }

      totals.byType[type].totalUsage = totals.byType[type].totalUsage.plus(typeStats.totalUsage || 0);
      totals.byType[type].totalCalls = totals.byType[type].totalCalls.plus(typeStats.totalCalls || 0);
    }
  }

  return {
    totalUsage: totals.totalUsage.toNumber(),
    totalCredits: totals.totalCredits.toNumber(),
    totalCalls: totals.totalCalls.toNumber(),
    byType: Object.fromEntries(
      Object.entries(totals.byType).map(([type, v]) => [
        type,
        { totalUsage: v.totalUsage.toNumber(), totalCalls: v.totalCalls.toNumber() },
      ])
    ),
  };
};
