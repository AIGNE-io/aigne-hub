/**
 * 分析 stability-check 的结果 + 和历史同条件 run 合并，生成可靠的统一统计。
 *
 * 输入：benchmarks/data/samples.jsonl
 * 输出：
 *   1) 各 cell (provider × path) 的每 run 明细（看漂移）
 *   2) 合并所有同条件 run 的大样本统计
 *   3) Hub vs Direct 相对关系在每个 run 内的 p50 / p99 差值（跨时段稳健性）
 *
 * Run: pnpm tsx src/analyze-stability.ts
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_PATH = join(__dirname, '..', 'data', 'samples.jsonl');

interface Sample {
  runId: string;
  target: string;
  provider: string;
  model: string;
  payload: string;
  concurrency: number;
  error?: string | null;
  ttfb: number;
  totalTime: number;
  serverTiming?: Record<string, number> | null;
}

function loadSamples(): Sample[] {
  const lines = readFileSync(SAMPLES_PATH, 'utf-8').trim().split('\n');
  return lines.map((l) => JSON.parse(l) as Sample);
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stats(arr: number[]) {
  if (arr.length === 0) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  const stdev = Math.sqrt(variance);
  return {
    n: arr.length,
    p50: Math.round(pct(arr, 0.5)),
    p90: Math.round(pct(arr, 0.9)),
    p99: Math.round(pct(arr, 0.99)),
    min: Math.round(Math.min(...arr)),
    max: Math.round(Math.max(...arr)),
    mean: Math.round(mean),
    cv: +(stdev / mean).toFixed(2),
  };
}

// Cells to analyze: (label, filter function)
interface CellDef {
  label: string;
  path: 'hub' | 'direct';
  provider: string;
  filter: (s: Sample) => boolean;
}

const CELLS: CellDef[] = [
  // OpenAI
  {
    label: 'Hub OpenAI (short, c=3)',
    path: 'hub',
    provider: 'openai',
    filter: (s) =>
      s.error == null &&
      s.provider === 'openai' &&
      s.payload === 'short' &&
      s.concurrency === 3 &&
      (s.target === 'hub-openai' || s.target === 'hub-openai-nano' || s.target === 'stab-hub-openai'),
  },
  {
    label: 'Direct OpenAI (short, c=3)',
    path: 'direct',
    provider: 'openai',
    filter: (s) =>
      s.error == null &&
      s.provider === 'openai' &&
      s.payload === 'short' &&
      s.concurrency === 3 &&
      (s.target === 'openai-direct' ||
        s.target === 'openai-direct-nano' ||
        s.target === 'stab-direct-openai'),
  },
  // Google
  {
    label: 'Hub Google (short, c=3)',
    path: 'hub',
    provider: 'google',
    filter: (s) =>
      s.error == null &&
      s.provider === 'google' &&
      s.payload === 'short' &&
      s.concurrency === 3 &&
      (s.target === 'hub-google' || s.target === 'stab-hub-google'),
  },
  {
    label: 'Direct Google (short, c=3)',
    path: 'direct',
    provider: 'google',
    filter: (s) =>
      s.error == null &&
      s.provider === 'google' &&
      s.payload === 'short' &&
      s.concurrency === 3 &&
      (s.target === 'google-direct' || s.target === 'stab-direct-google'),
  },
  // Anthropic c=1
  {
    label: 'Hub Anthropic (short, c=1)',
    path: 'hub',
    provider: 'anthropic',
    filter: (s) =>
      s.error == null &&
      s.provider === 'anthropic' &&
      s.payload === 'short' &&
      s.concurrency === 1 &&
      (s.target === 'hub-anthropic-c1' || s.target === 'stab-hub-anthropic-c1'),
  },
  {
    label: 'Direct Anthropic (short, c=1)',
    path: 'direct',
    provider: 'anthropic',
    filter: (s) =>
      s.error == null &&
      s.provider === 'anthropic' &&
      s.payload === 'short' &&
      s.concurrency === 1 &&
      (s.target === 'anthropic-direct-c1' || s.target === 'stab-direct-anthropic-c1'),
  },
];

function formatMs(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return 'N/A';
  return `${n}ms`;
}

function printCell(cell: CellDef, samples: Sample[]) {
  const matched = samples.filter(cell.filter);
  const byRun = new Map<string, Sample[]>();
  for (const s of matched) {
    if (!byRun.has(s.runId)) byRun.set(s.runId, []);
    byRun.get(s.runId)!.push(s);
  }

  console.log(`\n  ${cell.label}`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Run ID                                  │    n │   p50 │   p90 │   p99 │   cv`);
  const runIds = [...byRun.keys()].sort();
  for (const runId of runIds) {
    const group = byRun.get(runId)!;
    const s = stats(group.map((g) => g.ttfb));
    if (!s) continue;
    console.log(
      `  ${runId.padEnd(38)} │ ${String(s.n).padStart(4)} │ ${formatMs(s.p50).padStart(6)} │ ${formatMs(s.p90).padStart(6)} │ ${formatMs(s.p99).padStart(6)} │ ${s.cv.toFixed(2).padStart(5)}`
    );
  }
  const merged = stats(matched.map((m) => m.ttfb));
  if (merged) {
    console.log(`  ${'─'.repeat(80)}`);
    console.log(
      `  ${'MERGED'.padEnd(38)} │ ${String(merged.n).padStart(4)} │ ${formatMs(merged.p50).padStart(6)} │ ${formatMs(merged.p90).padStart(6)} │ ${formatMs(merged.p99).padStart(6)} │ ${merged.cv.toFixed(2).padStart(5)}`
    );
  }
}

function main() {
  const samples = loadSamples();
  console.log(`Loaded ${samples.length} samples from ${SAMPLES_PATH}\n`);

  console.log('═'.repeat(82));
  console.log('  Per-cell per-run breakdown (shows cross-run drift)');
  console.log('═'.repeat(82));

  for (const cell of CELLS) {
    printCell(cell, samples);
  }

  // ── Hub vs Direct: p50 / p99 差值跨 run 稳定性 ─────────────────────
  console.log(`\n\n${'═'.repeat(82)}`);
  console.log('  Hub vs Direct delta stability (Hub - Direct, per run)');
  console.log('═'.repeat(82));

  const providers = ['openai', 'google', 'anthropic'] as const;
  for (const provider of providers) {
    const hubCell = CELLS.find((c) => c.provider === provider && c.path === 'hub')!;
    const directCell = CELLS.find((c) => c.provider === provider && c.path === 'direct')!;
    console.log(`\n  ${provider.toUpperCase()}`);

    // Group samples by runId
    const hubByRun = new Map<string, number[]>();
    const directByRun = new Map<string, number[]>();
    for (const s of samples.filter(hubCell.filter)) {
      if (!hubByRun.has(s.runId)) hubByRun.set(s.runId, []);
      hubByRun.get(s.runId)!.push(s.ttfb);
    }
    for (const s of samples.filter(directCell.filter)) {
      if (!directByRun.has(s.runId)) directByRun.set(s.runId, []);
      directByRun.get(s.runId)!.push(s.ttfb);
    }

    // Find runs where both hub and direct exist
    const commonRuns = [...hubByRun.keys()].filter((r) => directByRun.has(r)).sort();
    if (commonRuns.length === 0) {
      console.log('    (no paired runs)');
      continue;
    }

    console.log(`    Run ID                                 │ Hub p50 │ Dir p50 │ Δp50 │ Hub p99 │ Dir p99 │ Δp99`);
    for (const runId of commonRuns) {
      const h = stats(hubByRun.get(runId)!)!;
      const d = stats(directByRun.get(runId)!)!;
      const dp50 = h.p50 - d.p50;
      const dp99 = h.p99 - d.p99;
      const dp50Sign = dp50 > 0 ? '+' : '';
      const dp99Sign = dp99 > 0 ? '+' : '';
      console.log(
        `    ${runId.padEnd(37)} │ ${formatMs(h.p50).padStart(7)} │ ${formatMs(d.p50).padStart(7)} │ ${(dp50Sign + dp50).padStart(5)} │ ${formatMs(h.p99).padStart(7)} │ ${formatMs(d.p99).padStart(7)} │ ${(dp99Sign + dp99).padStart(5)}`
      );
    }
  }

  // ── Hub self overhead (Server-Timing) ─────────────────────────────
  console.log(`\n\n${'═'.repeat(82)}`);
  console.log('  Hub self overhead from Server-Timing (跨 run 稳定性核心指标)');
  console.log('═'.repeat(82));

  const hubSelfOverhead = new Map<string, number[]>();
  for (const s of samples) {
    if (
      s.error == null &&
      s.target?.startsWith('hub-') || s.target?.startsWith('stab-hub-')
    ) {
      const st = s.serverTiming;
      if (!st || st.total == null) continue;
      const overhead = Math.max(0, (st.total ?? 0) - (st.providerTtfb ?? 0) - (st.streaming ?? 0));
      const key = `${s.target}|${s.runId}`;
      if (!hubSelfOverhead.has(key)) hubSelfOverhead.set(key, []);
      hubSelfOverhead.get(key)!.push(overhead);
    }
  }

  // Aggregate by target (across all runs)
  const byTarget = new Map<string, number[]>();
  for (const [key, values] of hubSelfOverhead) {
    const target = key.split('|')[0];
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)!.push(...values);
  }

  console.log(`\n  Target                        │    n │ p50  │ p90  │ p99  │`);
  for (const [target, values] of [...byTarget.entries()].sort()) {
    const s = stats(values);
    if (!s) continue;
    console.log(
      `  ${target.padEnd(30)} │ ${String(s.n).padStart(4)} │ ${formatMs(s.p50).padStart(4)} │ ${formatMs(s.p90).padStart(4)} │ ${formatMs(s.p99).padStart(4)} │`
    );
  }
}

main();
