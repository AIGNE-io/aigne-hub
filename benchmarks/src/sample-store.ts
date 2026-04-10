import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

import type { BenchmarkResult, Target } from './index.js';

/**
 * Persistent sample store for benchmark data.
 *
 * Every benchmark request is persisted as one line in a JSONL file.
 * This ensures no measurement is wasted and enables cross-run analysis
 * with jq / DuckDB / pandas without re-running benchmarks.
 *
 * File: benchmarks/data/samples.jsonl (append-only)
 * Query with: duckdb -c "SELECT * FROM read_json_auto('data/samples.jsonl')"
 */

export interface Sample {
  // Run metadata
  runId: string;
  runTimestamp: string;
  benchmarkName: string;
  gitCommit?: string;
  hubBaseUrl?: string;
  gatewayEnabled?: boolean;

  // Target info
  target: string;
  provider: string;
  model: string;
  concurrency: number;
  stream: boolean;
  payload: string;

  // Per-request data
  sampleTimestamp: string;
  status: number;
  error?: string;
  rateLimited: boolean;
  ttfb: number;
  totalTime: number;
  streamingTime: number;
  usage?: BenchmarkResult['usage'];
  creditsUsed?: number;
  requestId?: string;
  serverTiming?: Record<string, number>;
}

export interface RunContext {
  runId: string;
  runTimestamp: string;
  benchmarkName: string;
  gitCommit?: string;
  hubBaseUrl?: string;
  gatewayEnabled?: boolean;
}

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');
const DEFAULT_SAMPLES_FILE = join(DEFAULT_DATA_DIR, 'samples.jsonl');

/** Generate a unique run ID combining timestamp + random suffix. */
export function createRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/** Get the current git HEAD commit hash (short form), or undefined if not in a git repo. */
export function getGitCommit(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Create a RunContext for a benchmark script invocation.
 * All samples in this run share the same runId and metadata.
 */
export function createRunContext(
  benchmarkName: string,
  env?: { hubBaseUrl?: string; gatewayEnabled?: boolean }
): RunContext {
  return {
    runId: createRunId(),
    runTimestamp: new Date().toISOString(),
    benchmarkName,
    gitCommit: getGitCommit(),
    hubBaseUrl: env?.hubBaseUrl,
    gatewayEnabled: env?.gatewayEnabled,
  };
}

/**
 * Append a batch of samples to the JSONL store.
 * Creates the data directory if it doesn't exist. Silently no-ops on empty input.
 */
export function appendSamples(
  samples: Sample[],
  filePath: string = DEFAULT_SAMPLES_FILE
): void {
  if (samples.length === 0) return;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const lines = samples.map((s) => JSON.stringify(s)).join('\n') + '\n';
  appendFileSync(filePath, lines, { encoding: 'utf8' });
}

/**
 * Build samples from raw benchmark results + run context + target info.
 * Each BenchmarkResult becomes one Sample.
 */
export function buildSamples(
  results: BenchmarkResult[],
  ctx: RunContext,
  targetInfo: {
    target: Target;
    provider: string;
    concurrency: number;
    stream: boolean;
    payload: string;
  }
): Sample[] {
  const ts = new Date().toISOString();
  return results.map((r) => ({
    // Run metadata
    runId: ctx.runId,
    runTimestamp: ctx.runTimestamp,
    benchmarkName: ctx.benchmarkName,
    gitCommit: ctx.gitCommit,
    hubBaseUrl: ctx.hubBaseUrl,
    gatewayEnabled: ctx.gatewayEnabled,

    // Target info
    target: targetInfo.target.name,
    provider: targetInfo.provider,
    model: targetInfo.target.model,
    concurrency: targetInfo.concurrency,
    stream: targetInfo.stream,
    payload: targetInfo.payload,

    // Per-request data (use batch timestamp; precise per-request timing would
    // require adding a field to BenchmarkResult — not worth it for now)
    sampleTimestamp: ts,
    status: r.status,
    error: r.error,
    rateLimited: r.rateLimited,
    ttfb: r.ttfb,
    totalTime: r.totalTime,
    streamingTime: r.streamingTime,
    usage: r.usage,
    creditsUsed: r.creditsUsed,
    requestId: r.requestId,
    serverTiming: r.serverTiming,
  }));
}

/**
 * Read all samples from the store (for analysis scripts).
 * Returns an empty array if the file doesn't exist.
 */
export function readSamples(filePath: string = DEFAULT_SAMPLES_FILE): Sample[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter((l) => l.length > 0);
  return lines.map((line) => JSON.parse(line) as Sample);
}
