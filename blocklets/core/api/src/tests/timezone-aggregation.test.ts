import { formatUsageStats } from '@api/libs/user/format-usage';
import { DailyStats } from '@api/store/models/types';
import { describe, expect, test } from 'bun:test';

const createMockStats = (totalUsage: number): DailyStats => ({
  totalUsage,
  totalCredits: totalUsage * 0.005,
  totalCalls: 1,
  successCalls: 1,
  byType: {
    chatCompletion: {
      totalUsage,
      totalCredits: totalUsage * 0.005,
      totalCalls: 1,
      successCalls: 1,
    },
  },
});

describe('Timezone Aggregation Fix', () => {
  test('without timezoneOffset: should aggregate by UTC date', () => {
    const utcTimestamp = 1734667200; // 2024-12-20 04:00:00 UTC
    const hourlyStatsRaw: DailyStats[] = [createMockStats(100)];

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-12-20');
  });

  test('with PST timezoneOffset: should aggregate by user local date', () => {
    const utcTimestamp = 1734667200; // 2024-12-20 04:00:00 UTC
    const pstOffset = 480; // PST is UTC-8

    const hourlyStatsRaw: DailyStats[] = [createMockStats(100)];

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
      timezoneOffset: pstOffset,
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-12-19');
    expect(result.dailyStats[0]?.totalUsage).toBe(100);
    expect(result.dailyStats[0]?.totalCalls).toBe(1);
  });

  test('PST user evening calls should aggregate to same local date', () => {
    const pstOffset = 480;

    const calls = [
      1734667200, // 2024-12-20 04:00 UTC = 2024-12-19 20:00 PST
      1734670800, // 2024-12-20 05:00 UTC = 2024-12-19 21:00 PST
      1734674400, // 2024-12-20 06:00 UTC = 2024-12-19 22:00 PST
      1734679800, // 2024-12-20 07:30 UTC = 2024-12-19 23:30 PST
    ];

    const hourlyStatsRaw: DailyStats[] = calls.map(() => createMockStats(100));

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: calls,
      timezoneOffset: pstOffset,
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-12-19');
    expect(result.dailyStats[0]?.totalUsage).toBe(400);
    expect(result.dailyStats[0]?.totalCalls).toBe(4);
  });

  test('cross-midnight calls should aggregate to correct local dates', () => {
    const pstOffset = 480;

    const calls = [
      1734678000, // 2024-12-20 07:00 UTC = 2024-12-19 23:00 PST
      1734683400, // 2024-12-20 08:30 UTC = 2024-12-20 00:30 PST
      1734685200, // 2024-12-20 09:00 UTC = 2024-12-20 01:00 PST
    ];

    const hourlyStatsRaw: DailyStats[] = [createMockStats(100), createMockStats(200), createMockStats(300)];

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: calls,
      timezoneOffset: pstOffset,
    });

    expect(result.dailyStats).toHaveLength(2);
    expect(result.dailyStats[0]?.date).toBe('2024-12-19');
    expect(result.dailyStats[1]?.date).toBe('2024-12-20');

    expect(result.dailyStats[0]?.totalUsage).toBe(100);
    expect(result.dailyStats[0]?.totalCalls).toBe(1);

    expect(result.dailyStats[1]?.totalUsage).toBe(500);
    expect(result.dailyStats[1]?.totalCalls).toBe(2);
  });

  test('China timezone (UTC+8) should aggregate correctly', () => {
    const chinaOffset = -480; // China is UTC+8
    const utcTimestamp = 1734544800; // 2024-12-18 18:00:00 UTC

    const hourlyStatsRaw: DailyStats[] = [createMockStats(100)];

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
      timezoneOffset: chinaOffset,
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-12-19');
  });

  test('UK timezone (UTC+0) should work correctly', () => {
    const ukOffset = 0;
    const utcTimestamp = 1734649200; // 2024-12-19 23:00:00 UTC

    const hourlyStatsRaw: DailyStats[] = [createMockStats(100)];

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
      timezoneOffset: ukOffset,
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-12-19');
  });

  test('aggregate by service type should work with timezone', () => {
    const pstOffset = 480;
    const utcTimestamp = 1734667200;

    const hourlyStatsRaw: DailyStats[] = [
      {
        totalUsage: 300,
        totalCredits: 1.5,
        totalCalls: 3,
        successCalls: 3,
        byType: {
          chatCompletion: { totalUsage: 100, totalCredits: 0.5, totalCalls: 1, successCalls: 1 },
          imageGeneration: { totalUsage: 150, totalCredits: 0.75, totalCalls: 1, successCalls: 1 },
          embedding: { totalUsage: 50, totalCredits: 0.25, totalCalls: 1, successCalls: 1 },
        },
      },
    ];

    const result = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
      timezoneOffset: pstOffset,
    });

    expect(result.dailyStats).toHaveLength(1);
    expect(result.dailyStats[0]?.date).toBe('2024-12-19');

    const byType = result.dailyStats[0]?.byType;
    expect(byType?.chatCompletion?.totalUsage).toBe(100);
    expect(byType?.imageGeneration?.totalUsage).toBe(150);
    expect(byType?.embedding?.totalUsage).toBe(50);
  });

  test('edge case: exactly midnight UTC vs local', () => {
    const pstOffset = 480;
    const midnightUTC = 1734652800; // 2024-12-20 00:00 UTC

    const hourlyStatsRaw: DailyStats[] = [createMockStats(100)];

    const resultUTC = formatUsageStats({
      hourlyStatsRaw,
      hours: [midnightUTC],
    });
    expect(resultUTC.dailyStats[0]?.date).toBe('2024-12-20');

    const resultPST = formatUsageStats({
      hourlyStatsRaw,
      hours: [midnightUTC],
      timezoneOffset: pstOffset,
    });
    expect(resultPST.dailyStats[0]?.date).toBe('2024-12-19');
  });

  test('summary stats should match regardless of timezone', () => {
    const pstOffset = 480;
    const utcTimestamp = 1734667200;

    const hourlyStatsRaw: DailyStats[] = [createMockStats(100)];

    const resultUTC = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
    });

    const resultPST = formatUsageStats({
      hourlyStatsRaw,
      hours: [utcTimestamp],
      timezoneOffset: pstOffset,
    });

    expect(resultUTC.totalUsage).toBe(resultPST.totalUsage);
    expect(resultUTC.totalCredits).toBe(resultPST.totalCredits);
    expect(resultUTC.usageStats.totalCalls).toBe(resultPST.usageStats.totalCalls);

    expect(resultUTC.dailyStats[0]?.date).not.toBe(resultPST.dailyStats[0]?.date);
  });
});
