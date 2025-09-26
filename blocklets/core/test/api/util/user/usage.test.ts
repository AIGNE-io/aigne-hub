import { addToTotals, formatUsageStats } from '@api/libs/user/format-usage';
import type { Stats } from '@api/libs/user/format-usage';
import { DailyStats } from '@api/store/models/types';
import BigNumber from 'bignumber.js';
import { describe, expect, test } from 'bun:test';

describe('addToTotals', () => {
  test('should add basic stats to empty target', () => {
    const target: Stats = {
      totalUsage: new BigNumber(0),
      totalCredits: new BigNumber(0),
      totalCalls: new BigNumber(0),
      byType: {},
    };

    const source: DailyStats = {
      timestamp: 1705312200,
      totalUsage: 100,
      totalCredits: 50,
      totalCalls: 10,
      successCalls: 8,
      byType: {
        chatCompletion: {
          totalUsage: 80,
          totalCredits: 40,
          totalCalls: 8,
          successCalls: 6,
        },
      },
    };

    addToTotals(target, source);

    expect(target.totalUsage.toNumber()).toBe(100);
    expect(target.totalCredits.toNumber()).toBe(50);
    expect(target.totalCalls.toNumber()).toBe(10);
    expect(target.byType.chatCompletion?.totalUsage.toNumber()).toBe(80);
    expect(target.byType.chatCompletion?.totalCalls.toNumber()).toBe(8);
  });

  test('should add stats to existing target', () => {
    const target: Stats = {
      totalUsage: new BigNumber(50),
      totalCredits: new BigNumber(25),
      totalCalls: new BigNumber(5),
      byType: {
        chatCompletion: {
          totalUsage: new BigNumber(40),
          totalCalls: new BigNumber(4),
        },
      },
    };

    const source: DailyStats = {
      timestamp: 1705312200,
      totalUsage: 100,
      totalCredits: 50,
      totalCalls: 10,
      successCalls: 8,
      byType: {
        chatCompletion: {
          totalUsage: 80,
          totalCredits: 40,
          totalCalls: 8,
          successCalls: 6,
        },
        embedding: {
          totalUsage: 20,
          totalCredits: 10,
          totalCalls: 2,
          successCalls: 2,
        },
      },
    };

    addToTotals(target, source);

    expect(target.totalUsage.toNumber()).toBe(150);
    expect(target.totalCredits.toNumber()).toBe(75);
    expect(target.totalCalls.toNumber()).toBe(15);
    expect(target.byType.chatCompletion?.totalUsage.toNumber()).toBe(120);
    expect(target.byType.chatCompletion?.totalCalls.toNumber()).toBe(12);
    expect(target.byType.embedding?.totalUsage.toNumber()).toBe(20);
    expect(target.byType.embedding?.totalCalls.toNumber()).toBe(2);
  });

  test('should handle null/undefined values in source', () => {
    const target: Stats = {
      totalUsage: new BigNumber(0),
      totalCredits: new BigNumber(0),
      totalCalls: new BigNumber(0),
      byType: {},
    };

    const source: DailyStats = {
      timestamp: 1705312200,
      totalUsage: undefined as any,
      totalCredits: undefined as any,
      totalCalls: undefined as any,
      successCalls: 8,
      byType: {
        chatCompletion: {
          totalUsage: undefined as any,
          totalCredits: undefined as any,
          totalCalls: undefined as any,
          successCalls: 6,
        },
      },
    };

    addToTotals(target, source);

    expect(target.totalUsage.toNumber()).toBe(0);
    expect(target.totalCredits.toNumber()).toBe(0);
    expect(target.totalCalls.toNumber()).toBe(0);
    expect(target.byType.chatCompletion?.totalUsage.toNumber()).toBe(0);
    expect(target.byType.chatCompletion?.totalCalls.toNumber()).toBe(0);
  });

  test('should handle missing byType in source', () => {
    const target: Stats = {
      totalUsage: new BigNumber(0),
      totalCredits: new BigNumber(0),
      totalCalls: new BigNumber(0),
      byType: {},
    };

    const source: DailyStats = {
      timestamp: 1705312200,
      totalUsage: 100,
      totalCredits: 50,
      totalCalls: 10,
      successCalls: 8,
      byType: undefined as any,
    };

    addToTotals(target, source);

    expect(target.totalUsage.toNumber()).toBe(100);
    expect(target.totalCredits.toNumber()).toBe(50);
    expect(target.totalCalls.toNumber()).toBe(10);
    expect(Object.keys(target.byType)).toHaveLength(0);
  });

  test('should handle multiple call types', () => {
    const target: Stats = {
      totalUsage: new BigNumber(0),
      totalCredits: new BigNumber(0),
      totalCalls: new BigNumber(0),
      byType: {},
    };

    const source: DailyStats = {
      timestamp: 1705312200,
      totalUsage: 200,
      totalCredits: 100,
      totalCalls: 20,
      successCalls: 18,
      byType: {
        chatCompletion: {
          totalUsage: 100,
          totalCredits: 50,
          totalCalls: 10,
          successCalls: 9,
        },
        embedding: {
          totalUsage: 50,
          totalCredits: 25,
          totalCalls: 5,
          successCalls: 4,
        },
        imageGeneration: {
          totalUsage: 50,
          totalCredits: 25,
          totalCalls: 5,
          successCalls: 5,
        },
      },
    };

    addToTotals(target, source);

    expect(target.totalUsage.toNumber()).toBe(200);
    expect(target.totalCredits.toNumber()).toBe(100);
    expect(target.totalCalls.toNumber()).toBe(20);
    expect(target.byType.chatCompletion?.totalUsage.toNumber()).toBe(100);
    expect(target.byType.chatCompletion?.totalCalls.toNumber()).toBe(10);
    expect(target.byType.embedding?.totalUsage.toNumber()).toBe(50);
    expect(target.byType.embedding?.totalCalls.toNumber()).toBe(5);
    expect(target.byType.imageGeneration?.totalUsage.toNumber()).toBe(50);
    expect(target.byType.imageGeneration?.totalCalls.toNumber()).toBe(5);
  });
});

describe('formatUsageStats', () => {
  test('should format empty stats correctly', () => {
    const result = formatUsageStats({
      hourlyStatsRaw: [],
      hours: [],
    });

    expect(result).toEqual({
      usageStats: {
        totalUsage: 0,
        totalCredits: 0,
        totalCalls: 0,
        byType: {},
      },
      totalUsage: 0,
      totalCredits: 0,
      dailyStats: [],
    });
  });

  test('should format single hour stats correctly', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: 100,
        totalCredits: 50,
        totalCalls: 10,
        successCalls: 8,
        byType: {
          chatCompletion: {
            totalUsage: 80,
            totalCredits: 40,
            totalCalls: 8,
            successCalls: 6,
          },
          embedding: {
            totalUsage: 20,
            totalCredits: 10,
            totalCalls: 2,
            successCalls: 2,
          },
        },
      },
    ];

    const hours = [1705312200];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.usageStats).toEqual({
      totalUsage: 100,
      totalCredits: 50,
      totalCalls: 10,
      byType: {
        chatCompletion: {
          totalUsage: 80,
          totalCalls: 8,
        },
        embedding: {
          totalUsage: 20,
          totalCalls: 2,
        },
      },
    });

    expect(result.totalUsage).toBe(100);
    expect(result.totalCredits).toBe(50);
    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-01-15');
    expect(result.dailyStats[0]?.timestamp).toBe(1705276800);
    expect(result.dailyStats[0]?.totalUsage).toBe(100);
    expect(result.dailyStats[0]?.totalCredits).toBe(50);
    expect(result.dailyStats[0]?.totalCalls).toBe(10);
  });

  test('should format multiple hours from same day correctly', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705312200, // 2024-01-15 10:30:00
        totalUsage: 50,
        totalCredits: 25,
        totalCalls: 5,
        successCalls: 4,
        byType: {
          chatCompletion: {
            totalUsage: 40,
            totalCredits: 20,
            totalCalls: 4,
            successCalls: 3,
          },
        },
      },
      {
        timestamp: 1705315800,
        totalUsage: 75,
        totalCredits: 37.5,
        totalCalls: 7,
        successCalls: 6,
        byType: {
          chatCompletion: {
            totalUsage: 60,
            totalCredits: 30,
            totalCalls: 6,
            successCalls: 5,
          },
          embedding: {
            totalUsage: 15,
            totalCredits: 7.5,
            totalCalls: 1,
            successCalls: 1,
          },
        },
      },
    ];

    const hours = [1705312200, 1705315800];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.usageStats).toEqual({
      totalUsage: 125,
      totalCredits: 62.5,
      totalCalls: 12,
      byType: {
        chatCompletion: {
          totalUsage: 100,
          totalCalls: 10,
        },
        embedding: {
          totalUsage: 15,
          totalCalls: 1,
        },
      },
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.totalUsage).toBe(125);
    expect(result.dailyStats[0]?.totalCredits).toBe(62.5);
    expect(result.dailyStats[0]?.totalCalls).toBe(12);
  });

  test('should format multiple days correctly', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: 100,
        totalCredits: 50,
        totalCalls: 10,
        successCalls: 8,
        byType: {
          chatCompletion: {
            totalUsage: 80,
            totalCredits: 40,
            totalCalls: 8,
            successCalls: 6,
          },
        },
      },
      {
        timestamp: 1705398600,
        totalUsage: 200,
        totalCredits: 100,
        totalCalls: 20,
        successCalls: 18,
        byType: {
          chatCompletion: {
            totalUsage: 150,
            totalCredits: 75,
            totalCalls: 15,
            successCalls: 14,
          },
          embedding: {
            totalUsage: 50,
            totalCredits: 25,
            totalCalls: 5,
            successCalls: 4,
          },
        },
      },
    ];

    const hours = [1705312200, 1705398600];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.usageStats).toEqual({
      totalUsage: 300,
      totalCredits: 150,
      totalCalls: 30,
      byType: {
        chatCompletion: {
          totalUsage: 230,
          totalCalls: 23,
        },
        embedding: {
          totalUsage: 50,
          totalCalls: 5,
        },
      },
    });

    expect(result.dailyStats).toHaveLength(2);
    expect(result.dailyStats[0]?.date).toBe('2024-01-15');
    expect(result.dailyStats[0]?.totalUsage).toBe(100);
    expect(result.dailyStats[1]?.date).toBe('2024-01-16');
    expect(result.dailyStats[1]?.totalUsage).toBe(200);
    expect(result.dailyStats[0]?.timestamp).toBeLessThan(result.dailyStats[1]?.timestamp ?? 0);
  });

  test('should handle missing hours array', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: 100,
        totalCredits: 50,
        totalCalls: 10,
        successCalls: 8,
        byType: {
          chatCompletion: {
            totalUsage: 80,
            totalCredits: 40,
            totalCalls: 8,
            successCalls: 6,
          },
        },
      },
    ];

    const hours: number[] = [];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.usageStats.totalUsage).toBe(100);
    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-01-15');
  });

  test('should handle null/undefined values in hourly stats', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: undefined as any,
        totalCredits: undefined as any,
        totalCalls: undefined as any,
        successCalls: 8,
        byType: {
          chatCompletion: {
            totalUsage: undefined as any,
            totalCredits: undefined as any,
            totalCalls: undefined as any,
            successCalls: 6,
          },
        },
      },
    ];

    const hours = [1705312200];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.usageStats).toEqual({
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      byType: {
        chatCompletion: {
          totalUsage: 0,
          totalCalls: 0,
        },
      },
    });

    expect(result.dailyStats[0]?.totalUsage).toBe(0);
    expect(result.dailyStats[0]?.totalCredits).toBe(0);
    expect(result.dailyStats[0]?.totalCalls).toBe(0);
  });

  test('should sort daily stats by timestamp', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705485000,
        totalUsage: 300,
        totalCredits: 150,
        totalCalls: 30,
        successCalls: 28,
        byType: {
          chatCompletion: {
            totalUsage: 300,
            totalCredits: 150,
            totalCalls: 30,
            successCalls: 28,
          },
        },
      },
      {
        timestamp: 1705312200,
        totalUsage: 100,
        totalCredits: 50,
        totalCalls: 10,
        successCalls: 8,
        byType: {
          chatCompletion: {
            totalUsage: 100,
            totalCredits: 50,
            totalCalls: 10,
            successCalls: 8,
          },
        },
      },
      {
        timestamp: 1705398600,
        totalUsage: 200,
        totalCredits: 100,
        totalCalls: 20,
        successCalls: 18,
        byType: {
          chatCompletion: {
            totalUsage: 200,
            totalCredits: 100,
            totalCalls: 20,
            successCalls: 18,
          },
        },
      },
    ];

    const hours = [1705485000, 1705312200, 1705398600];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.dailyStats).toHaveLength(3);
    expect(result.dailyStats[0]?.date).toBe('2024-01-15');
    expect(result.dailyStats[1]?.date).toBe('2024-01-16');
    expect(result.dailyStats[2]?.date).toBe('2024-01-17');
    expect(result.dailyStats[0]?.timestamp).toBeLessThan(result.dailyStats[1]?.timestamp ?? 0);
    expect(result.dailyStats[1]?.timestamp).toBeLessThan(result.dailyStats[2]?.timestamp ?? 0);
  });

  test('should handle large numbers with precision', () => {
    const hourlyStatsRaw: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: 999999999.99,
        totalCredits: 500000000.5,
        totalCalls: 1000000,
        successCalls: 950000,
        byType: {
          chatCompletion: {
            totalUsage: 999999999.99,
            totalCredits: 500000000.5,
            totalCalls: 1000000,
            successCalls: 950000,
          },
        },
      },
    ];

    const hours = [1705312200];

    const result = formatUsageStats({ hourlyStatsRaw, hours });

    expect(result.usageStats.totalUsage).toBe(999999999.99);
    expect(result.usageStats.totalCredits).toBe(500000000.5);
    expect(result.usageStats.totalCalls).toBe(1000000);
    expect(result.usageStats.byType.chatCompletion?.totalUsage).toBe(999999999.99);
    expect(result.usageStats.byType.chatCompletion?.totalCalls).toBe(1000000);
  });
});
