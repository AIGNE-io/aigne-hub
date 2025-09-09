export interface TrendComparisonResult {
  current: { totalUsage: number; totalCredits: number; totalCalls: number };
  previous: { totalUsage: number; totalCredits: number; totalCalls: number };
  growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
}

// Helper function to generate hour timestamps from user local time range
// Converts user's local time range to UTC hour timestamps for precise querying
export function generateHourRangeFromTimestamps(startTime: number, endTime: number): number[] {
  const hours: number[] = [];
  const hourInSeconds = 3600;

  // Round down start time to the beginning of the hour
  const startHour = Math.floor(startTime / hourInSeconds) * hourInSeconds;

  // Round up end time to the end of the hour
  const endHour = Math.ceil(endTime / hourInSeconds) * hourInSeconds;

  for (let currentHour = startHour; currentHour < endHour; currentHour += hourInSeconds) {
    hours.push(currentHour);
  }

  return hours;
}
