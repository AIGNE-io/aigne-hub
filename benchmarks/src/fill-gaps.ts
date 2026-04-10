/**
 * Fill-gaps benchmark: adds two comparisons to the existing dataset.
 *
 * 1. OpenAI gpt-5-nano 三路对比：Hub / Direct / OpenRouter (same model)
 *    This answers "how does routing via Hub, direct, or via OpenRouter
 *    proxy compare for the exact same OpenAI model?"
 *
 * 2. Anthropic claude-haiku-4-5 补数据（c=1 避开 50 req/min 限流）
 *    Hub and Direct, sequential requests with built-in spacing to stay
 *    under Anthropic's rate limit.
 *
 * Uses the short payload (30 max_tokens) for consistency with the
 * earlier hub-vs-direct benchmark.
 *
 * Run: pnpm tsx src/fill-gaps.ts
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
const SHORT_PAYLOAD = {
  messages: [
    { role: 'system' as const, content: 'You are a helpful assistant. Answer concisely.' },
    { role: 'user' as const, content: 'What is 2+2? Reply in one short sentence.' },
  ],
  maxTokens: 30,
};

type Format = 'openai' | 'anthropic' | 'gemini';

interface Target {
  name: string;
  provider: string;
  format: Format;
  url: string;
  key: string;
  model: string;
  path: 'hub' | 'direct' | 'openrouter';
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
  if (target.format === 'anthropic') {
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
  throw new Error(`Unsupported format: ${target.format}`);
}

function buildHeaders(target: Target): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.format === 'openai') headers.Authorization = `Bearer ${target.key}`;
  else if (target.format === 'anthropic') {
    headers['x-api-key'] = target.key;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

function extractUsage(
  format: Format,
  line: string,
  current: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
): typeof current | null {
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
  const body = buildBody(target, SHORT_PAYLOAD.messages, SHORT_PAYLOAD.maxTokens);
  const headers = buildHeaders(target);

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.requestTimeout),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const totalTime = performance.now() - start;
      return {
        status: response.status,
        ttfb: totalTime,
        totalTime,
        streamingTime: 0,
        rateLimited: response.status === 429,
        error: `HTTP ${response.status}: ${errorBody.slice(0, 250)}`,
      };
    }

    let ttfb: number | undefined;
    let streamServerTiming: string | undefined;
    let usage: any = {};
    let sseBuffer = '';
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ttfb) ttfb = performance.now() - start;
      const text = decoder.decode(value, { stream: true });
      sseBuffer += text;
      const stMatch = text.match(/event: server-timing\ndata: (.+)\n/);
      if (stMatch) streamServerTiming = stMatch[1];
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';
      for (const line of lines) {
        const u = extractUsage(target.format, line, usage);
        if (u) usage = { ...usage, ...u };
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
    if (usage.totalTokens !== undefined || usage.promptTokens !== undefined) {
      result.usage = {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
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

// ── Sequential runner with delay (avoids rate limits) ────────────────

async function runSequential(
  target: Target,
  count: number,
  delayMs: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (let i = 0; i < count; i++) {
    process.stdout.write(`    ${i + 1}/${count}...`);
    const r = await request(target);
    results.push(r);
    if (r.error) console.log(` ERR ${r.error.substring(0, 60)}`);
    else console.log(` ${fmt(r.ttfb)}`);
    if (i < count - 1 && delayMs > 0) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  return results;
}

// ── Concurrent runner (for OpenAI targets) ───────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Fill-Gaps Benchmark');
  console.log('  (1) OpenAI gpt-5-nano 三路对比: Hub / Direct / OpenRouter');
  console.log('  (2) Anthropic c=1 补数据');
  console.log('═══════════════════════════════════════════════════════════\n');

  const hubKey = config.hubAccessKey || config.comparisonHubAccessKey;

  const ctx = createRunContext('fill-gaps', {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });
  console.log(`Run ID: ${ctx.runId}`);
  console.log(`Hub: ${HUB_URL}\n`);

  // ── Part 1: OpenAI gpt-5-nano 三路对比（c=3, 60s） ───────────────

  const openaiTargets: Target[] = [];
  if (hubKey) {
    openaiTargets.push({
      name: 'hub-openai-nano',
      provider: 'openai',
      format: 'openai',
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: 'openai/gpt-5-nano',
      path: 'hub',
    });
  }
  if (config.openaiApiKey) {
    openaiTargets.push({
      name: 'openai-direct-nano',
      provider: 'openai',
      format: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      key: config.openaiApiKey,
      model: 'gpt-5-nano',
      path: 'direct',
      useCompletionTokens: true,
    });
  }
  if (config.openrouterApiKey) {
    openaiTargets.push({
      name: 'openrouter-direct-nano',
      provider: 'openai',
      format: 'openai',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: config.openrouterApiKey,
      model: 'openai/gpt-5-nano',
      path: 'openrouter',
    });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Part 1: OpenAI gpt-5-nano 三路对比 (c=3, 60s each)');
  console.log(`${'═'.repeat(60)}`);

  const openaiResults = new Map<string, BenchmarkResult[]>();
  for (const t of openaiTargets) {
    console.log(`\n  [${t.name}] (${t.path})`);
    console.log(`  URL: ${t.url}`);
    console.log(`  Model: ${t.model}`);

    // Warmup
    process.stdout.write(`  Warmup...`);
    const w = await request(t);
    if (w.error) {
      console.log(` FAILED: ${w.error.substring(0, 150)}`);
      openaiResults.set(t.name, []);
      continue;
    }
    console.log(` ok (${fmt(w.ttfb)})`);

    console.log(`  Running c=3, 60s...`);
    const results = await runConcurrent(t, 3, 60_000);
    const ok = results.filter((r) => !r.error);
    const err = results.filter((r) => r.error);
    const stats = ok.length > 0 ? computeStats(ok.map((r) => r.ttfb)) : null;
    console.log(
      `  Done: ${ok.length} ok, ${err.length} err${
        stats ? ` | p50=${fmt(stats.p50)} p90=${fmt(stats.p90)} p99=${fmt(stats.p99)} cv=${stats.cv.toFixed(2)}` : ''
      }`
    );
    if (err.length > 0) console.log(`  First error: ${err[0].error?.substring(0, 150)}`);

    openaiResults.set(t.name, results);

    // Persist
    const samples = buildSamples(results, ctx, {
      target: { name: t.name, url: t.url, key: t.key, model: t.model },
      provider: t.provider,
      concurrency: 3,
      stream: true,
      payload: 'short',
    });
    appendSamples(samples);

    // Cooldown
    console.log(`  Cooldown 10s...`);
    await new Promise((r) => setTimeout(r, 10_000));
  }

  // ── Part 2: Anthropic c=1 补数据 ─────────────────────────────────

  const anthropicTargets: Target[] = [];
  if (hubKey) {
    anthropicTargets.push({
      name: 'hub-anthropic-c1',
      provider: 'anthropic',
      format: 'openai',
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: 'anthropic/claude-haiku-4-5',
      path: 'hub',
    });
  }
  if (config.anthropicApiKey) {
    anthropicTargets.push({
      name: 'anthropic-direct-c1',
      provider: 'anthropic',
      format: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      key: config.anthropicApiKey,
      model: 'claude-haiku-4-5',
      path: 'direct',
    });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Part 2: Anthropic c=1 补数据 (sequential, 40 requests each)');
  console.log(`${'═'.repeat(60)}`);

  const anthropicResults = new Map<string, BenchmarkResult[]>();
  for (const t of anthropicTargets) {
    console.log(`\n  [${t.name}]`);

    // Warmup
    process.stdout.write(`  Warmup...`);
    const w = await request(t);
    if (w.error) {
      console.log(` FAILED: ${w.error.substring(0, 150)}`);
      anthropicResults.set(t.name, []);
      continue;
    }
    console.log(` ok (${fmt(w.ttfb)})`);

    // Sequential with 800ms delay → ~45 req/min (under 50 limit)
    const results = await runSequential(t, 40, 800);
    const ok = results.filter((r) => !r.error);
    const err = results.filter((r) => r.error);
    const stats = ok.length > 0 ? computeStats(ok.map((r) => r.ttfb)) : null;
    console.log(
      `  Done: ${ok.length} ok, ${err.length} err${
        stats ? ` | p50=${fmt(stats.p50)} p90=${fmt(stats.p90)} p99=${fmt(stats.p99)} cv=${stats.cv.toFixed(2)}` : ''
      }`
    );

    anthropicResults.set(t.name, results);

    const samples = buildSamples(results, ctx, {
      target: { name: t.name, url: t.url, key: t.key, model: t.model },
      provider: t.provider,
      concurrency: 1,
      stream: true,
      payload: 'short',
    });
    appendSamples(samples);

    // Cooldown
    console.log(`  Cooldown 15s (let Anthropic rate limit window clear)...`);
    await new Promise((r) => setTimeout(r, 15_000));
  }

  // ── Summary: OpenAI 三路对比 ─────────────────────────────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Summary: OpenAI gpt-5-nano 三路对比 (TTFB)');
  console.log(`${'═'.repeat(70)}\n`);

  const openaiRows: string[][] = [];
  for (const t of openaiTargets) {
    const r = openaiResults.get(t.name) ?? [];
    const ok = r.filter((x) => !x.error);
    const stats = ok.length > 0 ? computeStats(ok.map((x) => x.ttfb)) : null;
    openaiRows.push([
      t.name,
      t.path,
      String(ok.length),
      stats ? fmt(stats.p50) : 'N/A',
      stats ? fmt(stats.p90) : 'N/A',
      stats ? fmt(stats.p99) : 'N/A',
      stats ? fmt(stats.min) : 'N/A',
      stats ? stats.cv.toFixed(2) : 'N/A',
    ]);
  }
  printTable(['Target', 'Path', 'n', 'p50', 'p90', 'p99', 'min', 'cv'], openaiRows);

  // ── Summary: Anthropic ───────────────────────────────────────────

  console.log(`\n${'─'.repeat(70)}`);
  console.log('  Summary: Anthropic claude-haiku-4-5 (c=1 sequential)');
  console.log(`${'─'.repeat(70)}\n`);

  const anthropicRows: string[][] = [];
  for (const t of anthropicTargets) {
    const r = anthropicResults.get(t.name) ?? [];
    const ok = r.filter((x) => !x.error);
    const stats = ok.length > 0 ? computeStats(ok.map((x) => x.ttfb)) : null;
    anthropicRows.push([
      t.name,
      t.path,
      String(ok.length),
      stats ? fmt(stats.p50) : 'N/A',
      stats ? fmt(stats.p90) : 'N/A',
      stats ? fmt(stats.p99) : 'N/A',
      stats ? stats.cv.toFixed(2) : 'N/A',
    ]);
  }
  printTable(['Target', 'Path', 'n', 'p50', 'p90', 'p99', 'cv'], anthropicRows);

  console.log(`\nRun ID: ${ctx.runId}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
