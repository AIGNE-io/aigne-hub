export interface UsageTrendComparisonResult {
  current: { totalUsage: number; totalCredits: number; totalCalls: number };
  previous: { totalUsage: number; totalCredits: number; totalCalls: number };
  growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
}

const HOUR_IN_SECONDS = 3600;

// Helper function to generate hour timestamps from user local time range
// Converts user's local time range to UTC hour timestamps for precise querying
export function generateHourRangeFromTimestamps(startTime: number, endTime: number): number[] {
  const hours: number[] = [];

  // Round down start time to the beginning of the hour
  const startHour = Math.floor(startTime / HOUR_IN_SECONDS) * HOUR_IN_SECONDS;

  // Round up end time to the end of the hour
  const endHour = Math.ceil(endTime / HOUR_IN_SECONDS) * HOUR_IN_SECONDS;

  for (let currentHour = startHour; currentHour < endHour; currentHour += HOUR_IN_SECONDS) {
    hours.push(currentHour);
  }

  return hours;
}
