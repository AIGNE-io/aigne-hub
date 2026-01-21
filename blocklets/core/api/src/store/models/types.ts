export type CallStatus = 'processing' | 'success' | 'failed';
export type CallType = 'chatCompletion' | 'embedding' | 'imageGeneration' | 'audioGeneration' | 'video' | 'custom';

export interface UsageMetrics {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  totalTokens?: number;
  imageQuality?: string;
  imageSize?: string;
  audioFormat?: string;
  videoFormat?: string;
  [key: string]: string | number | undefined;
}

export interface TypeStats {
  totalUsage: number;
  totalCredits: number;
  totalCalls: number;
  successCalls: number;
}

export interface DailyStats {
  timestamp?: number;
  totalUsage: number;
  totalCredits: number;
  totalCalls: number;
  successCalls: number;
  // Duration metrics for latency statistics
  totalDuration?: number; // Sum of all durations (for calculating averages)
  avgDuration?: number; // Average duration in ms
  p95Duration?: number; // P95 latency in ms (pre-aggregated)
  // Duration distribution for P95 calculation during aggregation
  durationBuckets?: number[]; // Sorted array of durations for percentile calculation

  byType: Partial<Record<CallType, TypeStats>>;
}
