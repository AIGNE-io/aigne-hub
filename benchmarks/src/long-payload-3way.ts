/**
 * Long-payload 3-way comparison: Hub vs Direct vs OpenRouter for OpenAI gpt-5-nano
 * with realistic payload (1K system prompt + 800 max_tokens).
 *
 * This fills a gap: earlier multi-provider.ts run used OpenRouter with a
 * different model (openai/gpt-oss-20b), so we couldn't compare long-payload
 * performance apples-to-apples.
 *
 * This script re-runs all 3 targets with the SAME model (openai/gpt-5-nano)
 * and realistic payload, in the same time window.
 *
 * Run: pnpm tsx src/long-payload-3way.ts
 */
import 'dotenv/config';

import {
  BenchmarkResult,
  Message,
  PAYLOADS,
  computeStats,
  config,
  fmt,
  parseServerTiming,
  printTable,
} from './index.js';
import { appendSamples, buildSamples, createRunContext } from './sample-store.js';

const HUB_URL = config.hubBaseUrl;
const CONCURRENCY = 3;
const DURATION_MS = 120_000;
const COOLDOWN_MS = 15_000;

interface Target {
  name: string;
  path: 'hub' | 'direct' | 'openrouter';
  url: string;
  key: string;
  model: string;
  useCompletionTokens?: boolean;
}

const TARGETS: Target[] = [];
const hubKey = config.hubAccessKey || config.comparisonHubAccessKey;

if (hubKey) {
  TARGETS.push({
    name: 'hub-openai-long',
    path: 'hub',
    url: `${HUB_URL}/api/v2/chat/completions`,
    key: hubKey,
    model: 'openai/gpt-5-nano',
  });
}
if (config.openaiApiKey) {
  TARGETS.push({
    name: 'openai-direct-long',
    path: 'direct',
    url: 'https://api.openai.com/v1/chat/completions',
    key: config.openaiApiKey,
    model: 'gpt-5-nano',
    useCompletionTokens: true,
  });
}
if (config.openrouterApiKey) {
  TARGETS.push({
    name: 'openrouter-openai-long',
    path: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: config.openrouterApiKey,
    model: 'openai/gpt-5-nano',
  });
}

async function request(
  target: Target,
  messages: Message[],
  maxTokens: number
): Promise<BenchmarkResult> {
  const start = performance.now();
  const body: Record<string, unknown> = {
    model: target.model,
    messages,
    stream: true,
  };
  if (target.useCompletionTokens) body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.key}`,
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
        } catch { /* ignore */ }
      }
    }

    const totalTime = performance.now() - start;
    const serverTiming = parseServerTiming(streamServerTiming ?? response.headers.get('Server-Timing'));
    const result: BenchmarkResult = {
      status: response.status,
      ttfb: ttfb ?? totalTime,
      totalTime,
      streamingTime: totalTime - (ttfb ?? totalTime),
      serverTiming,
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
  target: Target,
  concurrency: number,
  duration: number,
  messages: Message[],
  maxTokens: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - startTime < duration) {
      results.push(await request(target, messages, maxTokens));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Long-Payload 3-Way: Hub vs Direct vs OpenRouter');
  console.log('  Model: openai/gpt-5-nano');
  console.log('  Payload: realistic (1K system prompt + 800 max_tokens)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (TARGETS.length === 0) {
    console.error('No targets configured.');
    process.exit(1);
  }

  const ctx = createRunContext('long-payload-3way', {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID:      ${ctx.runId}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Duration:    ${DURATION_MS / 1000}s per target`);
  console.log(`Cooldown:    ${COOLDOWN_MS / 1000}s between targets`);
  console.log(`Targets:     ${TARGETS.length}`);
  console.log(`Est. time:   ~${Math.ceil((TARGETS.length * (DURATION_MS + COOLDOWN_MS)) / 60_000)} min\n`);

  const payload = PAYLOADS.realistic;
  const allResults = new Map<string, BenchmarkResult[]>();

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  [${i + 1}/${TARGETS.length}] ${t.name} (${t.path})`);
    console.log(`${'─'.repeat(60)}`);

    // Warmup
    process.stdout.write(`  Warmup...`);
    const w = await request(t, [...payload.messages], payload.maxTokens);
    if (w.error) {
      console.log(` FAILED: ${w.error.substring(0, 200)}`);
      allResults.set(t.name, []);
      continue;
    }
    console.log(` ok (${fmt(w.ttfb)} TTFB, ${fmt(w.totalTime)} total)`);

    // Main run
    console.log(`  Running c=${CONCURRENCY}, ${DURATION_MS / 1000}s...`);
    const results = await runConcurrent(
      t,
      CONCURRENCY,
      DURATION_MS,
      [...payload.messages],
      payload.maxTokens
    );
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
      console.log(`        Total  p50=${fmt(totalStats.p50)} p90=${fmt(totalStats.p90)} p99=${fmt(totalStats.p99)}`);
    }
    if (err.length > 0) console.log(`  First error: ${err[0].error?.substring(0, 150)}`);

    allResults.set(t.name, results);

    const samples = buildSamples(results, ctx, {
      target: { name: t.name, url: t.url, key: t.key, model: t.model },
      provider: 'openai',
      concurrency: CONCURRENCY,
      stream: true,
      payload: 'realistic',
    });
    appendSamples(samples);

    if (i < TARGETS.length - 1) {
      console.log(`  Cooldown ${COOLDOWN_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
    }
  }

  // ── Head-to-head summary ─────────────────────────────────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Head-to-Head: TTFB (realistic payload, 800 max_tokens)');
  console.log(`${'═'.repeat(70)}\n`);

  const rows: string[][] = [];
  for (const t of TARGETS) {
    const r = allResults.get(t.name) ?? [];
    const ok = r.filter((x) => !x.error);
    const ttfbStats = ok.length > 0 ? computeStats(ok.map((x) => x.ttfb)) : null;
    const totalStats = ok.length > 0 ? computeStats(ok.map((x) => x.totalTime)) : null;
    rows.push([
      t.name,
      t.path,
      String(ok.length),
      ttfbStats ? fmt(ttfbStats.p50) : 'N/A',
      ttfbStats ? fmt(ttfbStats.p90) : 'N/A',
      ttfbStats ? fmt(ttfbStats.p99) : 'N/A',
      ttfbStats ? ttfbStats.cv.toFixed(2) : 'N/A',
      totalStats ? fmt(totalStats.p50) : 'N/A',
    ]);
  }
  printTable(['Target', 'Path', 'n', 'TTFB p50', 'TTFB p90', 'TTFB p99', 'cv', 'Total p50'], rows);

  console.log(`\nRun ID: ${ctx.runId}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
