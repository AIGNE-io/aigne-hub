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

  byType: Partial<Record<CallType, TypeStats>>;
}
