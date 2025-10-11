import { generateHourRangeFromTimestamps } from '@api/libs/user/hour-range';
import { describe, expect, test } from 'bun:test';

describe('generateHourRangeFromTimestamps', () => {
  test('should generate correct hour range for same day', () => {
    const startTime = 1705312200;
    const endTime = 1705326300;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    // Expected: [10:00, 11:00, 12:00, 13:00, 14:00]
    const expected = [+1705309200, +1705312800, +1705316400, +1705320000, +1705323600];

    expect(result).toEqual(expected);
  });

  test('should handle exact hour boundaries', () => {
    const startTime = 1705311600;
    const endTime = 1705318800;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [+1705309200, +1705312800, +1705316400];

    expect(result).toEqual(expected);
  });

  test('should handle single hour range', () => {
    const startTime = 1705312500;
    const endTime = 1705314300;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1705309200, 1705312800];

    expect(result).toEqual(expected);
  });

  test('should handle cross-day range', () => {
    const startTime = 1705361400;
    const endTime = 1705371300;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1705359600, 1705363200, 1705366800, 1705370400];

    expect(result).toEqual(expected);
  });

  test('should handle same start and end time', () => {
    const startTime = 1705312200;
    const endTime = 1705312200;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1705309200];

    expect(result).toEqual(expected);
  });

  test('should handle very short range within same hour', () => {
    const startTime = 1705311630;
    const endTime = 1705311645;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1705309200];

    expect(result).toEqual(expected);
  });

  test('should handle large time range', () => {
    const startTime = 1704067200;
    const endTime = 1704240000;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    expect(result).toHaveLength(48);
    expect(result[0]).toBe(1704067200);
    expect(result[47]).toBe(1704236400);
  });

  test('should handle leap year February', () => {
    const startTime = 1709254200;
    const endTime = 1709259000;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1709251200, 1709254800, 1709258400];

    expect(result).toEqual(expected);
  });

  test('should handle negative timestamps (before 1970)', () => {
    const startTime = -3600;
    const endTime = 5400;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [-3600, 0, 3600];

    expect(result).toEqual(expected);
  });

  test('should handle edge case with end time exactly at hour boundary', () => {
    const startTime = 1705312200;
    const endTime = 1705318800;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1705309200, 1705312800, 1705316400];

    expect(result).toEqual(expected);
  });

  test('should return empty array for invalid range (end before start)', () => {
    const startTime = 1705318800;
    const endTime = 1705311600;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    expect(result).toEqual([]);
  });

  test('should handle fractional seconds correctly', () => {
    const startTime = 1705312230.5;
    const endTime = 1705315830.5;

    const result = generateHourRangeFromTimestamps(startTime, endTime);

    const expected = [1705309200, 1705312800];

    expect(result).toEqual(expected);
  });
});
