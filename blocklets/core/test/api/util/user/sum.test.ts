import { computeGrowth, sumStats } from '@api/libs/user/sum';
import { DailyStats } from '@api/store/models/types';
import { describe, expect, test } from 'bun:test';

describe('computeGrowth', () => {
  test('should calculate growth rate correctly when previous > 0', () => {
    expect(computeGrowth(120, 100)).toBe(0.2);
    expect(computeGrowth(80, 100)).toBe(-0.2);
    expect(computeGrowth(100, 100)).toBe(0);
    expect(computeGrowth(150, 50)).toBe(2);
  });

  test('should return 1 when previous is 0 and current > 0', () => {
    expect(computeGrowth(100, 0)).toBe(1);
    expect(computeGrowth(50, 0)).toBe(1);
    expect(computeGrowth(0.1, 0)).toBe(1);
  });

  test('should return 0 when previous is 0 and current is 0', () => {
    expect(computeGrowth(0, 0)).toBe(0);
  });

  test('should handle decimal values', () => {
    expect(computeGrowth(1.5, 1.0)).toBe(0.5);
    expect(computeGrowth(0.8, 1.0)).toBe(-0.2);
  });
});

describe('sumStats', () => {
  test('should sum empty array correctly', () => {
    const result = sumStats([]);

    expect(result).toEqual({
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      byType: {},
    });
  });

  test('should sum single stats object correctly', () => {
    const stats: DailyStats[] = [
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

    const result = sumStats(stats);

    expect(result).toEqual({
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
  });

  test('should sum multiple stats objects correctly', () => {
    const stats: DailyStats[] = [
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
        timestamp: 1705315800,
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

    const result = sumStats(stats);

    expect(result).toEqual({
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
  });

  test('should handle null/undefined values in stats', () => {
    const stats: DailyStats[] = [
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
      null as any, // null entry
      {
        timestamp: 1705315800,
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
        },
      },
    ];

    const result = sumStats(stats);

    expect(result).toEqual({
      totalUsage: 300,
      totalCredits: 150,
      totalCalls: 30,
      byType: {
        chatCompletion: {
          totalUsage: 230,
          totalCalls: 23,
        },
      },
    });
  });

  test('should handle missing byType data', () => {
    const stats: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: 100,
        totalCredits: 50,
        totalCalls: 10,
        successCalls: 8,
        byType: {},
      },
      {
        timestamp: 1705315800,
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
        },
      },
    ];

    const result = sumStats(stats);

    expect(result).toEqual({
      totalUsage: 300,
      totalCredits: 150,
      totalCalls: 30,
      byType: {
        chatCompletion: {
          totalUsage: 150,
          totalCalls: 15,
        },
      },
    });
  });

  test('should handle missing totalUsage/totalCredits/totalCalls in byType', () => {
    const stats: DailyStats[] = [
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
            totalUsage: undefined as any,
            totalCredits: undefined as any,
            totalCalls: undefined as any,
            successCalls: 2,
          },
        },
      },
    ];

    const result = sumStats(stats);

    expect(result).toEqual({
      totalUsage: 100,
      totalCredits: 50,
      totalCalls: 10,
      byType: {
        chatCompletion: {
          totalUsage: 80,
          totalCalls: 8,
        },
        embedding: {
          totalUsage: 0,
          totalCalls: 0,
        },
      },
    });
  });

  test('should handle large numbers with precision', () => {
    const stats: DailyStats[] = [
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

    const result = sumStats(stats);

    expect(result.totalUsage).toBe(999999999.99);
    expect(result.totalCredits).toBe(500000000.5);
    expect(result.totalCalls).toBe(1000000);
    expect(result.byType.chatCompletion?.totalUsage).toBe(999999999.99);
    expect(result.byType.chatCompletion?.totalCalls).toBe(1000000);
  });

  test('should handle multiple call types correctly', () => {
    const stats: DailyStats[] = [
      {
        timestamp: 1705312200,
        totalUsage: 100,
        totalCredits: 50,
        totalCalls: 10,
        successCalls: 8,
        byType: {
          chatCompletion: {
            totalUsage: 60,
            totalCredits: 30,
            totalCalls: 6,
            successCalls: 5,
          },
          embedding: {
            totalUsage: 40,
            totalCredits: 20,
            totalCalls: 4,
            successCalls: 3,
          },
        },
      },
      {
        timestamp: 1705315800,
        totalUsage: 200,
        totalCredits: 100,
        totalCalls: 20,
        successCalls: 18,
        byType: {
          chatCompletion: {
            totalUsage: 120,
            totalCredits: 60,
            totalCalls: 12,
            successCalls: 11,
          },
          imageGeneration: {
            totalUsage: 80,
            totalCredits: 40,
            totalCalls: 8,
            successCalls: 7,
          },
        },
      },
    ];

    const result = sumStats(stats);

    expect(result).toEqual({
      totalUsage: 300,
      totalCredits: 150,
      totalCalls: 30,
      byType: {
        chatCompletion: {
          totalUsage: 180,
          totalCalls: 18,
        },
        embedding: {
          totalUsage: 40,
          totalCalls: 4,
        },
        imageGeneration: {
          totalUsage: 80,
          totalCalls: 8,
        },
      },
    });
  });
});
