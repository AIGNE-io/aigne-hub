/**
 * Stability check: 3 independent hub-vs-direct runs spaced 5 min apart.
 *
 * 动机：
 *   审计发现同一条件（gpt-5-nano, short, c=3）的两次独立 run 出现了严重漂移：
 *     run 6o4u6u: hub-openai p50=1258ms p99=4344ms cv=0.53
 *     run nre1z6: hub-openai p50=1025ms p99=1792ms cv=0.22
 *   27 分钟内 Hub vs Direct 的 p99 胜负关系甚至反转。
 *
 *   报告之前"Hub p99 三冠王"的结论基于单次 run，不是跨时段稳健现象。
 *
 * 目标：
 *   跑 3 次独立 run（每次间隔 5 分钟），每次覆盖 OpenAI + Google + Anthropic
 *   的 Hub/Direct 对比。合并 3 次 run 后每个 cell 样本量 >= 300（Anthropic ~120）。
 *   用合并的大样本重新计算 p50/p99/cv，判断哪些结论跨时段稳健。
 *
 * target naming：
 *   用新的 `stab-*` 前缀，避免和历史 target 混淆。分析时可以 union 老数据
 *   (hub-openai, hub-openai-nano, etc.) 做更大样本的合并。
 *
 * 条件：
 *   - OpenAI/Google: c=3, 60s, short payload (30 max_tokens)
 *   - Anthropic: c=1 sequential + 800ms delay, 40 samples/target
 *     (避开 Anthropic 50 req/min + 10K tokens/min 限流)
 *
 * Run: pnpm tsx src/stability-check.ts
 */
import 'dotenv/config';

import {
  BenchmarkResult,
  Message,
  computeStats,
  config,
  fmt,
  parseServerTiming,
  printTable,
} from './index.js';
import { appendSamples, buildSamples, createRunContext } from './sample-store.js';

// ── Config ────────────────────────────────────────────────────────────

const HUB_URL = config.hubBaseUrl;
const NUM_RUNS = 3;
const INTER_RUN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const C3_DURATION_MS = 60_000;
const C1_COUNT = 40;
const C1_DELAY_MS = 800;
const INTRA_RUN_COOLDOWN_MS = 15_000;

const SHORT_PAYLOAD = {
  messages: [
    { role: 'system' as const, content: 'You are a helpful assistant. Answer concisely.' },
    { role: 'user' as const, content: 'What is 2+2? Reply in one short sentence.' },
  ],
  maxTokens: 30,
};

type Format = 'openai' | 'anthropic';
type Mode = 'c3' | 'c1';

interface Target {
  name: string;
  provider: 'openai' | 'google' | 'anthropic';
  format: Format;
  mode: Mode;
  url: string;
  key: string;
  model: string;
  path: 'hub' | 'direct';
  useCompletionTokens?: boolean;
}

// ── Format-specific builders ─────────────────────────────────────────

function buildBody(target: Target, messages: Message[], maxTokens: number): object {
  if (target.format === 'openai') {
    const body: Record<string, unknown> = {
      model: target.model,
      messages,
      stream: true,
    };
    if (target.useCompletionTokens) body.max_completion_tokens = maxTokens;
    else body.max_tokens = maxTokens;
    return body;
  }
  // anthropic
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
  const body: Record<string, unknown> = {
    model: target.model,
    messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    stream: true,
  };
  if (systemMsgs.length > 0) body.system = systemMsgs.map((m) => m.content).join('\n');
  return body;
}

function buildHeaders(target: Target): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.format === 'openai') headers.Authorization = `Bearer ${target.key}`;
  else {
    headers['x-api-key'] = target.key;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

function extractUsage(
  format: Format,
  line: string,
  current: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
) {
  if (!line.startsWith('data: ') || line === 'data: [DONE]') return null;
  let data: any;
  try {
    data = JSON.parse(line.slice(6));
  } catch {
    return null;
  }
  if (format === 'openai' && data.usage) {
    return {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    };
  }
  if (format === 'anthropic') {
    if (data.type === 'message_start' && data.message?.usage) {
      return { promptTokens: data.message.usage.input_tokens ?? 0 };
    }
    if (data.type === 'message_delta' && data.usage) {
      const completion = data.usage.output_tokens ?? 0;
      return {
        completionTokens: completion,
        totalTokens: (current.promptTokens ?? 0) + completion,
      };
    }
  }
  return null;
}

// ── Single request ───────────────────────────────────────────────────

async function request(target: Target): Promise<BenchmarkResult> {
  const start = performance.now();
  const body = buildBody(target, [...SHORT_PAYLOAD.messages], SHORT_PAYLOAD.maxTokens);
  const headers = buildHeaders(target);

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.requestTimeout),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const totalTime = performance.now() - start;
      return {
        status: response.status,
        ttfb: totalTime,
        totalTime,
        streamingTime: 0,
        rateLimited: response.status === 429,
        error: `HTTP ${response.status}: ${errBody.slice(0, 250)}`,
      };
    }

    let ttfb: number | undefined;
    let streamServerTiming: string | undefined;
    let usage: any = {};
    let buf = '';
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ttfb) ttfb = performance.now() - start;
      const text = decoder.decode(value, { stream: true });
      buf += text;
      const stMatch = text.match(/event: server-timing\ndata: (.+)\n/);
      if (stMatch) streamServerTiming = stMatch[1];
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const u = extractUsage(target.format, line, usage);
        if (u) usage = { ...usage, ...u };
      }
    }

    const totalTime = performance.now() - start;
    const serverTiming = parseServerTiming(
      streamServerTiming ?? response.headers.get('Server-Timing')
    );
    const result: BenchmarkResult = {
      status: response.status,
      ttfb: ttfb ?? totalTime,
      totalTime,
      streamingTime: totalTime - (ttfb ?? totalTime),
      serverTiming,
      rateLimited: false,
    };
    if (usage.totalTokens !== undefined || usage.promptTokens !== undefined) {
      result.usage = {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens:
          usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
      };
    }
    return result;
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

// ── Runners ──────────────────────────────────────────────────────────

async function runConcurrent(
  target: Target,
  concurrency: number,
  duration: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - startTime < duration) {
      results.push(await request(target));
    }
  });
  await Promise.all(workers);
  return results;
}

async function runSequential(
  target: Target,
  count: number,
  delayMs: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (let i = 0; i < count; i++) {
    const r = await request(target);
    results.push(r);
    if (i < count - 1 && delayMs > 0) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  return results;
}

// ── Build target list ────────────────────────────────────────────────

function buildTargets(): Target[] {
  const hubKey = config.hubAccessKey || config.comparisonHubAccessKey;
  const targets: Target[] = [];

  // OpenAI c=3 (short, 60s)
  if (hubKey) {
    targets.push({
      name: 'stab-hub-openai',
      provider: 'openai',
      format: 'openai',
      mode: 'c3',
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: 'openai/gpt-5-nano',
      path: 'hub',
    });
  }
  if (config.openaiApiKey) {
    targets.push({
      name: 'stab-direct-openai',
      provider: 'openai',
      format: 'openai',
      mode: 'c3',
      url: 'https://api.openai.com/v1/chat/completions',
      key: config.openaiApiKey,
      model: 'gpt-5-nano',
      path: 'direct',
      useCompletionTokens: true,
    });
  }

  // Google c=3 (short, 60s)
  if (hubKey) {
    targets.push({
      name: 'stab-hub-google',
      provider: 'google',
      format: 'openai',
      mode: 'c3',
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: 'google/gemini-2.5-flash',
      path: 'hub',
    });
  }
  if (config.googleApiKey) {
    targets.push({
      name: 'stab-direct-google',
      provider: 'google',
      format: 'openai',
      mode: 'c3',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: config.googleApiKey,
      model: 'gemini-2.5-flash',
      path: 'direct',
    });
  }

  // Anthropic c=1 (short, sequential)
  if (hubKey) {
    targets.push({
      name: 'stab-hub-anthropic-c1',
      provider: 'anthropic',
      format: 'openai', // Hub uses OpenAI-compatible format
      mode: 'c1',
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: 'anthropic/claude-haiku-4-5',
      path: 'hub',
    });
  }
  if (config.anthropicApiKey) {
    targets.push({
      name: 'stab-direct-anthropic-c1',
      provider: 'anthropic',
      format: 'anthropic',
      mode: 'c1',
      url: 'https://api.anthropic.com/v1/messages',
      key: config.anthropicApiKey,
      model: 'claude-haiku-4-5',
      path: 'direct',
    });
  }

  return targets;
}

// ── Main ──────────────────────────────────────────────────────────────

async function runOneRun(runIdx: number, targets: Target[]): Promise<Map<string, BenchmarkResult[]>> {
  const ctx = createRunContext(`stability-check-${runIdx}`, {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Run ${runIdx}/${NUM_RUNS}  |  ID: ${ctx.runId}`);
  console.log(`${'═'.repeat(70)}\n`);

  const results = new Map<string, BenchmarkResult[]>();

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`\n  [${i + 1}/${targets.length}] ${t.name} (${t.path}, ${t.mode})`);
    console.log(`  Model: ${t.model}`);

    // Warmup
    process.stdout.write(`  Warmup...`);
    const w = await request(t);
    if (w.error) {
      console.log(` FAILED: ${w.error.substring(0, 150)}`);
      results.set(t.name, []);
      continue;
    }
    console.log(` ok (${fmt(w.ttfb)})`);

    // Main run
    let samples: BenchmarkResult[];
    if (t.mode === 'c3') {
      console.log(`  Running c=3, ${C3_DURATION_MS / 1000}s...`);
      samples = await runConcurrent(t, 3, C3_DURATION_MS);
    } else {
      console.log(`  Running c=1 sequential, ${C1_COUNT} requests, ${C1_DELAY_MS}ms delay...`);
      samples = await runSequential(t, C1_COUNT, C1_DELAY_MS);
    }

    const ok = samples.filter((r) => !r.error);
    const err = samples.filter((r) => r.error);
    const stats = ok.length > 0 ? computeStats(ok.map((r) => r.ttfb)) : null;
    console.log(
      `  Done: ${ok.length} ok, ${err.length} err${
        stats
          ? ` | p50=${fmt(stats.p50)} p90=${fmt(stats.p90)} p99=${fmt(stats.p99)} cv=${stats.cv.toFixed(2)}`
          : ''
      }`
    );
    if (err.length > 0) console.log(`  First error: ${err[0].error?.substring(0, 150)}`);

    results.set(t.name, samples);

    const built = buildSamples(samples, ctx, {
      target: { name: t.name, url: t.url, key: t.key, model: t.model },
      provider: t.provider,
      concurrency: t.mode === 'c3' ? 3 : 1,
      stream: true,
      payload: 'short',
    });
    appendSamples(built);

    // Cooldown between targets within a run
    if (i < targets.length - 1) {
      console.log(`  Cooldown ${INTRA_RUN_COOLDOWN_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, INTRA_RUN_COOLDOWN_MS));
    }
  }

  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Stability Check: 3 independent runs × Hub vs Direct');
  console.log('  Goal: merge 3 runs → check if p50/p99/cv are stable across time');
  console.log('═══════════════════════════════════════════════════════════\n');

  const targets = buildTargets();
  if (targets.length === 0) {
    console.error('No targets configured (missing keys).');
    process.exit(1);
  }

  const c3Count = targets.filter((t) => t.mode === 'c3').length;
  const c1Count = targets.filter((t) => t.mode === 'c1').length;
  const estPerRun =
    c3Count * (C3_DURATION_MS / 1000) +
    c1Count * (C1_COUNT * C1_DELAY_MS / 1000) +
    (targets.length - 1) * (INTRA_RUN_COOLDOWN_MS / 1000);
  const estTotal = NUM_RUNS * estPerRun + (NUM_RUNS - 1) * (INTER_RUN_COOLDOWN_MS / 1000);
  console.log(`Targets: ${targets.length} (${c3Count} c3 + ${c1Count} c1)`);
  console.log(`Runs: ${NUM_RUNS}`);
  console.log(`Est. per run: ${Math.ceil(estPerRun)}s`);
  console.log(`Est. total: ${Math.ceil(estTotal / 60)} min\n`);

  const allRunResults: Array<Map<string, BenchmarkResult[]>> = [];

  for (let run = 1; run <= NUM_RUNS; run++) {
    const results = await runOneRun(run, targets);
    allRunResults.push(results);

    if (run < NUM_RUNS) {
      console.log(`\n  ⏸  Inter-run cooldown ${INTER_RUN_COOLDOWN_MS / 60_000} min...`);
      await new Promise((r) => setTimeout(r, INTER_RUN_COOLDOWN_MS));
    }
  }

  // ── Summary: per-run table ───────────────────────────────────────
  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Summary: per-run TTFB p50 / p99 / cv');
  console.log(`${'═'.repeat(70)}\n`);

  for (const t of targets) {
    console.log(`\n  ${t.name} (${t.path})`);
    const perRunRows: string[][] = [];
    for (let run = 0; run < NUM_RUNS; run++) {
      const r = allRunResults[run].get(t.name) ?? [];
      const ok = r.filter((x) => !x.error);
      const stats = ok.length > 0 ? computeStats(ok.map((x) => x.ttfb)) : null;
      perRunRows.push([
        `Run ${run + 1}`,
        String(ok.length),
        stats ? fmt(stats.p50) : 'N/A',
        stats ? fmt(stats.p90) : 'N/A',
        stats ? fmt(stats.p99) : 'N/A',
        stats ? stats.cv.toFixed(2) : 'N/A',
      ]);
    }

    // merged
    const merged = allRunResults
      .map((m) => m.get(t.name) ?? [])
      .flat()
      .filter((x) => !x.error);
    const mergedStats = merged.length > 0 ? computeStats(merged.map((x) => x.ttfb)) : null;
    perRunRows.push([
      'MERGED',
      String(merged.length),
      mergedStats ? fmt(mergedStats.p50) : 'N/A',
      mergedStats ? fmt(mergedStats.p90) : 'N/A',
      mergedStats ? fmt(mergedStats.p99) : 'N/A',
      mergedStats ? mergedStats.cv.toFixed(2) : 'N/A',
    ]);

    printTable(['Run', 'n', 'p50', 'p90', 'p99', 'cv'], perRunRows);
  }

  console.log('\nDone. All samples persisted to data/samples.jsonl with target prefix "stab-".');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
