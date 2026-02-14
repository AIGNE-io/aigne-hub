import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────────────────────

export interface Target {
  name: string;
  url: string;
  key: string;
  model: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RequestOptions {
  stream?: boolean;
  messages?: Message[];
  maxTokens?: number;
}

export interface BenchmarkResult {
  status: number;
  ttfb: number;
  totalTime: number;
  streamingTime: number;
  serverTiming?: Record<string, number>;
  error?: string;
  rateLimited: boolean;
}

export interface MetricsResult {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  stddev: number;
  cv: number;
  samples: number;
}

// ── Config ─────────────────────────────────────────────────────────────

const defaultHubBaseUrl = process.env.HUB_BASE_URL || 'http://localhost:3030';

export const config = {
  hubBaseUrl: defaultHubBaseUrl,
  stressHubBaseUrl: process.env.STRESS_HUB_BASE_URL || defaultHubBaseUrl,
  isolationHubBaseUrl: process.env.ISOLATION_HUB_BASE_URL || defaultHubBaseUrl,
  comparisonHubBaseUrl: process.env.COMPARISON_HUB_BASE_URL || defaultHubBaseUrl,
  hubAccessKey: process.env.HUB_ACCESS_KEY || '',
  stressHubAccessKey: process.env.STRESS_HUB_ACCESS_KEY || process.env.HUB_ACCESS_KEY || '',
  isolationHubAccessKey: process.env.ISOLATION_HUB_ACCESS_KEY || process.env.HUB_ACCESS_KEY || '',
  comparisonHubAccessKey: process.env.COMPARISON_HUB_ACCESS_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  mockProviderPort: parseInt(process.env.MOCK_PROVIDER_PORT || '9876', 10),
  mockHubModel: process.env.MOCK_HUB_MODEL || 'mock/gpt-4o-mini',
  warmupCount: parseInt(process.env.WARMUP_COUNT || '3', 10),
  comparisonIterations: parseInt(process.env.COMPARISON_ITERATIONS || '10', 10),
  comparisonDuration: parseInt(process.env.COMPARISON_DURATION || '15000', 10),
  comparisonConcurrencyLevels: (process.env.COMPARISON_CONCURRENCY_LEVELS || '1,5,20').split(',').map(Number),
  stressDuration: parseInt(process.env.STRESS_DURATION || '15000', 10),
  stressConcurrencyLevels: (process.env.STRESS_CONCURRENCY_LEVELS || '1,5,10,25,50').split(',').map(Number),
  isolationDuration: parseInt(process.env.ISOLATION_DURATION || '10000', 10),
  isolationConcurrencyLevels: (process.env.ISOLATION_CONCURRENCY_LEVELS || '1,5,10,25,50,100,200')
    .split(',')
    .map(Number),
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),
};

// ── Payloads ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT_1K = `You are a helpful, harmless, and honest AI assistant. You should provide clear, accurate, and comprehensive responses to user queries. When uncertain, acknowledge your limitations. Follow these guidelines:

1. Always be respectful and professional in your responses.
2. Provide evidence-based information when possible.
3. Break down complex topics into understandable explanations.
4. If a question is ambiguous, ask for clarification.
5. Avoid generating harmful, misleading, or biased content.
6. Respect user privacy and do not ask for personal information.
7. When providing code examples, ensure they are correct and well-documented.
8. For mathematical problems, show your work step by step.
9. When discussing controversial topics, present multiple perspectives fairly.
10. Always prioritize safety and ethical considerations in your responses.

You have expertise in programming, mathematics, science, writing, and general knowledge. Use your knowledge to provide the most helpful response possible while maintaining accuracy and honesty.`;

const ASSISTANT_REPLY_500 = `The meaning of life is a deeply philosophical question that has been pondered by thinkers throughout human history. Different perspectives offer various answers:

From a philosophical standpoint, existentialists like Jean-Paul Sartre argued that life has no inherent meaning, and it is up to each individual to create their own purpose through their choices and actions. This perspective emphasizes personal responsibility and freedom.

From a religious perspective, many traditions suggest that the meaning of life is connected to a higher purpose or divine plan. For example, in Christianity, the purpose might be to love God and serve others; in Buddhism, it might be to achieve enlightenment and end suffering.

From a scientific viewpoint, the meaning of life could be understood through evolutionary biology - to survive and reproduce, passing on genetic information to future generations. However, as conscious beings, humans have the unique ability to transcend purely biological imperatives.

From a humanistic perspective, the meaning of life might be found in pursuing happiness, building meaningful relationships, contributing to society, and personal growth. Psychologist Abraham Maslow's hierarchy of needs suggests that self-actualization - reaching one's full potential - is the highest human motivation.`;

export const PAYLOADS = {
  realistic: {
    messages: [
      { role: 'system' as const, content: SYSTEM_PROMPT_1K },
      { role: 'user' as const, content: 'What is the meaning of life?' },
      { role: 'assistant' as const, content: ASSISTANT_REPLY_500 },
      { role: 'user' as const, content: 'Can you elaborate on that point?' },
    ],
    maxTokens: 200,
  },
} as const;

// ── Core benchmark function ────────────────────────────────────────────

export async function benchmarkRequest(target: Target, options?: RequestOptions): Promise<BenchmarkResult> {
  const start = performance.now();
  const stream = options?.stream ?? true;

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.key}`,
      },
      body: JSON.stringify({
        messages: options?.messages ?? [{ role: 'user', content: 'Say hello' }],
        model: target.model,
        stream,
        max_tokens: options?.maxTokens ?? 50,
      }),
      signal: AbortSignal.timeout(config.requestTimeout),
    });

    if (!stream) {
      const serverTiming = parseServerTiming(response.headers.get('Server-Timing'));
      await response.json();
      const totalTime = performance.now() - start;
      return {
        status: response.status,
        ttfb: totalTime,
        totalTime,
        streamingTime: 0,
        serverTiming,
        rateLimited: response.status === 429,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    }

    let ttfb: number | undefined;
    let streamServerTiming: string | undefined;
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ttfb) ttfb = performance.now() - start;
      // Look for server-timing SSE event in the stream
      const text = decoder.decode(value, { stream: true });
      const match = text.match(/event: server-timing\ndata: (.+)\n/);
      if (match) streamServerTiming = match[1];
    }

    const totalTime = performance.now() - start;
    const serverTiming = parseServerTiming(streamServerTiming ?? response.headers.get('Server-Timing'));

    return {
      status: response.status,
      ttfb: ttfb ?? totalTime,
      totalTime,
      streamingTime: totalTime - (ttfb ?? totalTime),
      serverTiming,
      rateLimited: response.status === 429,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err: any) {
    const totalTime = performance.now() - start;
    return {
      status: 0,
      ttfb: totalTime,
      totalTime,
      streamingTime: 0,
      rateLimited: false,
      error: err.name === 'TimeoutError' ? 'Timeout' : err.message,
    };
  }
}

// ── Warmup ─────────────────────────────────────────────────────────────

export async function warmup(target: Target, count?: number, options?: RequestOptions): Promise<void> {
  const n = count ?? config.warmupCount;
  console.log(`  Warming up ${target.name} (${n} requests)...`);
  for (let i = 0; i < n; i++) {
    await benchmarkRequest(target, options).catch(() => {});
  }
}

// ── Run concurrent workers ─────────────────────────────────────────────

export async function runConcurrent(
  target: Target,
  concurrency: number,
  duration: number,
  options?: RequestOptions
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - startTime < duration) {
      results.push(await benchmarkRequest(target, options));
    }
  });

  await Promise.all(workers);
  return results;
}

// ── Statistics ─────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const i = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, i)];
}

export function computeStats(values: number[]): MetricsResult {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p75: 0, p90: 0, p99: 0, stddev: 0, cv: 0, samples: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted.at(-1)!,
    avg: Math.round(avg * 100) / 100,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    stddev: Math.round(stddev * 100) / 100,
    cv: avg > 0 ? Math.round((stddev / avg) * 1000) / 1000 : 0,
    samples: values.length,
  };
}

// ── Server-Timing parsing ──────────────────────────────────────────────

export function parseServerTiming(header: string | null): Record<string, number> | undefined {
  if (!header) return undefined;
  const result: Record<string, number> = {};
  for (const part of header.split(',')) {
    const match = part.trim().match(/^(\w+);dur=([\d.]+)$/);
    if (match) {
      result[match[1]] = parseFloat(match[2]);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ── Server-Timing aggregation ──────────────────────────────────────────

export const TIMING_PHASES = [
  'session',
  'resolveProvider',
  'modelCallCreate',
  'preChecks',
  'modelSetup',
  'getCredentials',
  'providerTtfb',
  'ttfb',
  'streaming',
  'usage',
  'modelStatus',
  'total',
] as const;

export function aggregateServerTimings(results: BenchmarkResult[]): Map<string, ReturnType<typeof computeStats>> {
  const phaseValues = new Map<string, number[]>();
  for (const phase of TIMING_PHASES) phaseValues.set(phase, []);

  for (const r of results) {
    if (r.serverTiming) {
      for (const phase of TIMING_PHASES) {
        if (r.serverTiming[phase] !== undefined) {
          phaseValues.get(phase)!.push(r.serverTiming[phase]);
        }
      }
    }
  }

  const stats = new Map<string, ReturnType<typeof computeStats>>();
  for (const [phase, values] of phaseValues) {
    if (values.length > 0) {
      stats.set(phase, computeStats(values));
    }
  }
  return stats;
}

export function printServerTimingBreakdown(label: string, results: BenchmarkResult[]): void {
  const stats = aggregateServerTimings(results);
  const totalStats = stats.get('total');
  if (!totalStats) return;

  console.log(`\n┌─ Server-Timing Breakdown (${label}) ──────────────────────┐`);

  const headers = ['Phase', 'p50', 'p90', 'p99', '% of total', ''];
  const rows: string[][] = [];

  for (const phase of TIMING_PHASES) {
    const s = stats.get(phase);
    if (!s) continue;
    const pctOfTotal = totalStats.p50 > 0 ? s.p50 / totalStats.p50 : 0;
    rows.push([
      phase,
      fmt(s.p50),
      fmt(s.p90),
      fmt(s.p99),
      `${(pctOfTotal * 100).toFixed(1)}%`,
      bar(s.p50, totalStats.p50),
    ]);
  }

  printTable(headers, rows);

  // Top 3 bottlenecks (excluding total, ttfb, streaming which are pass-through)
  const bottlenecks = TIMING_PHASES.filter((p) => p !== 'total' && p !== 'ttfb' && p !== 'streaming')
    .map((p) => ({ phase: p, p50: stats.get(p)?.p50 ?? 0 }))
    .sort((a, b) => b.p50 - a.p50)
    .slice(0, 3);

  if (bottlenecks.length > 0 && totalStats.p50 > 0) {
    const desc = bottlenecks.map((b) => `${b.phase} (${((b.p50 / totalStats.p50) * 100).toFixed(1)}%)`).join(', ');
    console.log(`  → Top bottlenecks: ${desc}`);
  }
}

// ── Formatting helpers ─────────────────────────────────────────────────

export function fmt(ms: number): string {
  return `${Math.round(ms)}ms`;
}

export function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

export function padLeft(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

export function printTable(headers: string[], rows: string[][], columnWidths?: number[]): void {
  const widths = columnWidths ?? headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)) + 2);

  const separator = '├' + widths.map((w) => '─'.repeat(w)).join('┼') + '┤';
  const top = '┌' + widths.map((w) => '─'.repeat(w)).join('┬') + '┐';
  const bottom = '└' + widths.map((w) => '─'.repeat(w)).join('┴') + '┘';

  console.log(top);
  console.log('│' + headers.map((h, i) => padLeft(h, widths[i] - 1) + ' ').join('│') + '│');
  console.log(separator);
  for (const row of rows) {
    console.log('│' + row.map((cell, i) => padLeft(cell, widths[i] - 1) + ' ').join('│') + '│');
  }
  console.log(bottom);
}

// ── Bar chart helper ───────────────────────────────────────────────────

export function bar(value: number, total: number, maxWidth: number = 20): string {
  if (total === 0) return '';
  const ratio = value / total;
  const full = Math.floor(ratio * maxWidth);
  const fractions = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const remainder = Math.round((ratio * maxWidth - full) * 8);
  return '█'.repeat(full) + (remainder > 0 ? fractions[remainder] : '');
}

// ── JSON report ────────────────────────────────────────────────────────

export function saveReport(type: 'comparison' | 'stress' | 'isolation', results: any): void {
  const dir = join(import.meta.dirname, '..', 'results');
  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${type}-${timestamp}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    type,
    config: {
      hubBaseUrl:
        type === 'stress'
          ? config.stressHubBaseUrl
          : type === 'isolation'
            ? config.isolationHubBaseUrl
            : config.comparisonHubBaseUrl,
      warmupCount: config.warmupCount,
      requestTimeout: config.requestTimeout,
      ...(type === 'comparison' && { duration: config.comparisonDuration, levels: config.comparisonConcurrencyLevels }),
      ...(type === 'stress' && { duration: config.stressDuration, levels: config.stressConcurrencyLevels }),
      ...(type === 'isolation' && { duration: config.isolationDuration, levels: config.isolationConcurrencyLevels }),
    },
    results,
  };

  writeFileSync(join(dir, filename), JSON.stringify(report, null, 2));
  console.log(`\nReport saved: results/${filename}`);
}
