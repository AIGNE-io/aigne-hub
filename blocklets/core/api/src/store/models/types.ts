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
  avgDuration?: number; // Average duration in seconds
  // TTFB metrics
  totalTtfb?: number;
  ttfbCount?: number; // Count of successful calls with non-null ttfb (correct denominator for avgTtfb)
  avgTtfb?: number;
  p50Ttfb?: number;
  p95Ttfb?: number;
  totalProviderTtfb?: number;
  providerTtfbCount?: number; // Count of successful calls with non-null providerTtfb
  avgProviderTtfb?: number;
  p50ProviderTtfb?: number;
  p95ProviderTtfb?: number;

  byType: Partial<Record<CallType, TypeStats>>;
}
