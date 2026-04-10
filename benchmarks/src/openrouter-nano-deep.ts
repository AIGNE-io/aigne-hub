/**
 * OpenRouter gpt-5-nano 深度采样补数据。
 *
 * 动机：
 *   前期 openrouter-all.ts (42 样本, cv=0.53) 和 long-payload-3way.ts (13 样本)
 *   给 OpenRouter / gpt-5-nano 的样本量明显不足，TTFB 出现双峰分布：
 *     - 大部分请求 ~650-720ms (正常路径)
 *     - 约 15-20% 请求 1400-2600ms (慢路径 / 冷连接 / 后端漂移)
 *   小样本下 cv 被双峰放大，percentile 估计也不稳。
 *
 * 这个脚本只跑 OpenRouter × gpt-5-nano 两种 payload，跑更长时间：
 *   - short payload: c=3, 240s  → 预期 ~150+ 样本
 *   - long payload:  c=3, 240s  → 预期 ~25+ 样本
 *
 * 使用与前期相同的 target name（openrouter-openai-nano /
 * openrouter-openai-long），新样本追加到 samples.jsonl 后可以按 target 聚合分析，
 * 也可以按 runId 单独切片。
 *
 * Run: pnpm tsx src/openrouter-nano-deep.ts
 */
import 'dotenv/config';

import {
  BenchmarkResult,
  Message,
  PAYLOADS,
  computeStats,
  config,
  fmt,
  printTable,
} from './index.js';
import { appendSamples, buildSamples, createRunContext } from './sample-store.js';

// ── Config ────────────────────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-5-nano';
const CONCURRENCY = 3;
const DURATION_MS = 240_000;
const COOLDOWN_MS = 20_000;

const SHORT_PAYLOAD = {
  messages: [
    { role: 'system' as const, content: 'You are a helpful assistant. Answer concisely.' },
    { role: 'user' as const, content: 'What is 2+2? Reply in one short sentence.' },
  ],
  maxTokens: 30,
};

interface Phase {
  label: string;
  targetName: string; // matches earlier runs for joinability
  payloadLabel: 'short' | 'realistic';
  messages: Message[];
  maxTokens: number;
}

const PHASES: Phase[] = [
  {
    label: 'short payload (c=3, 240s)',
    targetName: 'openrouter-openai-nano',
    payloadLabel: 'short',
    messages: [...SHORT_PAYLOAD.messages],
    maxTokens: SHORT_PAYLOAD.maxTokens,
  },
  {
    label: 'long payload (realistic, c=3, 240s)',
    targetName: 'openrouter-openai-long',
    payloadLabel: 'realistic',
    messages: [...PAYLOADS.realistic.messages],
    maxTokens: PAYLOADS.realistic.maxTokens,
  },
];

// ── Single request ───────────────────────────────────────────────────

async function request(phase: Phase): Promise<BenchmarkResult> {
  const start = performance.now();
  const body = {
    model: MODEL,
    messages: phase.messages,
    max_tokens: phase.maxTokens,
    stream: true,
  };

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openrouterApiKey}`,
      },
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
    let usage: any = {};
    let buf = '';
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ttfb) ttfb = performance.now() - start;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.usage) {
            usage = {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            };
          }
        } catch {
          /* ignore */
        }
      }
    }

    const totalTime = performance.now() - start;
    const result: BenchmarkResult = {
      status: response.status,
      ttfb: ttfb ?? totalTime,
      totalTime,
      streamingTime: totalTime - (ttfb ?? totalTime),
      rateLimited: false,
    };
    if (usage.totalTokens !== undefined) result.usage = usage;
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

async function runConcurrent(
  phase: Phase,
  concurrency: number,
  duration: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - startTime < duration) {
      results.push(await request(phase));
    }
  });
  await Promise.all(workers);
  return results;
}

function printBuckets(ttfbs: number[]) {
  const buckets = [0, 0, 0, 0, 0, 0];
  const labels = ['<500', '500-1000', '1000-1500', '1500-2000', '2000-3000', '>3000'];
  for (const t of ttfbs) {
    if (t < 500) buckets[0]++;
    else if (t < 1000) buckets[1]++;
    else if (t < 1500) buckets[2]++;
    else if (t < 2000) buckets[3]++;
    else if (t < 3000) buckets[4]++;
    else buckets[5]++;
  }
  const max = Math.max(...buckets, 1);
  console.log('  Distribution:');
  for (let i = 0; i < buckets.length; i++) {
    const bar = '█'.repeat(Math.round((buckets[i] / max) * 30));
    console.log(`    ${labels[i].padStart(10)} ms | ${String(buckets[i]).padStart(4)} ${bar}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  OpenRouter gpt-5-nano Deep Resample');
  console.log(`  Model: ${MODEL}`);
  console.log(`  Phases: short + long payload`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!config.openrouterApiKey) {
    console.error('OPENROUTER_API_KEY required');
    process.exit(1);
  }

  const ctx = createRunContext('openrouter-nano-deep', {
    hubBaseUrl: config.hubBaseUrl,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID:      ${ctx.runId}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Duration:    ${DURATION_MS / 1000}s per phase`);
  console.log(`Cooldown:    ${COOLDOWN_MS / 1000}s between phases`);
  console.log(`Est. time:   ~${Math.ceil((PHASES.length * (DURATION_MS + COOLDOWN_MS)) / 60_000)} min\n`);

  const allResults = new Map<string, BenchmarkResult[]>();

  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  [${i + 1}/${PHASES.length}] ${phase.targetName}`);
    console.log(`  ${phase.label}`);
    console.log(`${'─'.repeat(60)}`);

    // Warmup
    process.stdout.write(`  Warmup...`);
    const w = await request(phase);
    if (w.error) {
      console.log(` FAILED: ${w.error.substring(0, 200)}`);
      allResults.set(phase.targetName, []);
      continue;
    }
    console.log(` ok (${fmt(w.ttfb)} TTFB, ${fmt(w.totalTime)} total)`);

    // Main run
    console.log(`  Running c=${CONCURRENCY}, ${DURATION_MS / 1000}s...`);
    const results = await runConcurrent(phase, CONCURRENCY, DURATION_MS);
    const ok = results.filter((r) => !r.error);
    const err = results.filter((r) => r.error);
    const ttfbStats = ok.length > 0 ? computeStats(ok.map((r) => r.ttfb)) : null;
    const totalStats = ok.length > 0 ? computeStats(ok.map((r) => r.totalTime)) : null;

    console.log(
      `  Done: ${ok.length} ok, ${err.length} err${
        ttfbStats
          ? ` | TTFB p50=${fmt(ttfbStats.p50)} p90=${fmt(ttfbStats.p90)} p99=${fmt(ttfbStats.p99)} cv=${ttfbStats.cv.toFixed(2)}`
          : ''
      }`
    );
    if (totalStats) {
      console.log(
        `        Total  p50=${fmt(totalStats.p50)} p90=${fmt(totalStats.p90)} p99=${fmt(totalStats.p99)}`
      );
    }
    if (err.length > 0) console.log(`  First error: ${err[0].error?.substring(0, 150)}`);

    if (ok.length > 0) {
      printBuckets(ok.map((r) => r.ttfb));
    }

    allResults.set(phase.targetName, results);

    // Persist samples using same target name as earlier runs → joinable
    const samples = buildSamples(results, ctx, {
      target: {
        name: phase.targetName,
        url: OPENROUTER_URL,
        key: config.openrouterApiKey,
        model: MODEL,
      },
      provider: 'openai',
      concurrency: CONCURRENCY,
      stream: true,
      payload: phase.payloadLabel,
    });
    appendSamples(samples);

    if (i < PHASES.length - 1) {
      console.log(`  Cooldown ${COOLDOWN_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Summary: OpenRouter gpt-5-nano (this run only)');
  console.log(`${'═'.repeat(70)}\n`);

  const rows: string[][] = [];
  for (const phase of PHASES) {
    const r = allResults.get(phase.targetName) ?? [];
    const ok = r.filter((x) => !x.error);
    const ttfbStats = ok.length > 0 ? computeStats(ok.map((x) => x.ttfb)) : null;
    const totalStats = ok.length > 0 ? computeStats(ok.map((x) => x.totalTime)) : null;
    rows.push([
      phase.targetName,
      phase.payloadLabel,
      String(ok.length),
      ttfbStats ? fmt(ttfbStats.p50) : 'N/A',
      ttfbStats ? fmt(ttfbStats.p90) : 'N/A',
      ttfbStats ? fmt(ttfbStats.p99) : 'N/A',
      ttfbStats ? ttfbStats.cv.toFixed(2) : 'N/A',
      totalStats ? fmt(totalStats.p50) : 'N/A',
    ]);
  }
  printTable(
    ['Target', 'Payload', 'n', 'TTFB p50', 'TTFB p90', 'TTFB p99', 'cv', 'Total p50'],
    rows
  );

  console.log(`\nRun ID: ${ctx.runId}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
