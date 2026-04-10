/**
 * Head-to-head comparison: Hub vs Direct for each provider.
 *
 * For each (provider, model) pair, runs N concurrent requests on both:
 *   - Hub path (Hub Worker, OpenAI-compat format)
 *   - Direct path (native provider format: OpenAI, Anthropic messages, Gemini)
 *
 * Outputs side-by-side comparison showing how much slower Hub is per provider.
 *
 * Every request is persisted as a sample in data/samples.jsonl.
 *
 * Run: pnpm tsx src/hub-vs-direct.ts
 *
 * Environment variables:
 *   HVD_DURATION    — ms per target (default 60000)
 *   HVD_CONCURRENCY — concurrent workers (default 3, lower than multi-provider
 *                     to avoid Anthropic rate limits at higher concurrency)
 *   HVD_COOLDOWN    — ms between targets (default 15000)
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

// ── Payload ───────────────────────────────────────────────────────────
// Small payload optimized for "connection rate" measurement:
// - Short prompt: avoids provider-side caching differences
// - Small max_tokens: keeps output rate under Anthropic's 10K tokens/min limit
// - TTFB (time to first byte) is the primary metric; output length barely affects it

const SHORT_PAYLOAD = {
  messages: [
    { role: 'system' as const, content: 'You are a helpful assistant. Answer concisely.' },
    { role: 'user' as const, content: 'What is 2+2? Reply in one short sentence.' },
  ],
  maxTokens: 30,
};

// ── Config ────────────────────────────────────────────────────────────

const HUB_URL = config.hubBaseUrl;
const CONCURRENCY = parseInt(process.env.HVD_CONCURRENCY || '3', 10);
const DURATION_MS = parseInt(process.env.HVD_DURATION || '60000', 10);
const COOLDOWN_MS = parseInt(process.env.HVD_COOLDOWN || '15000', 10);

const MODELS = {
  openai: 'gpt-5-nano',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
};

// ── Target types ──────────────────────────────────────────────────────

type Format = 'openai' | 'anthropic' | 'gemini';

interface HvdTarget {
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  format: Format;
  url: string;
  key: string;
  model: string;
  path: 'hub' | 'direct';
  /** Use max_completion_tokens instead of max_tokens (for OpenAI new models) */
  useCompletionTokens?: boolean;
}

function buildTargets(): HvdTarget[] {
  const targets: HvdTarget[] = [];
  const hubKey = config.hubAccessKey || config.comparisonHubAccessKey;

  // ── OpenAI pair ──
  if (hubKey) {
    targets.push({
      name: 'hub-openai',
      provider: 'openai',
      format: 'openai',
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: `openai/${MODELS.openai}`,
      path: 'hub',
    });
  }
  if (config.openaiApiKey) {
    targets.push({
      name: 'openai-direct',
      provider: 'openai',
      format: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      key: config.openaiApiKey,
      model: MODELS.openai,
      path: 'direct',
      useCompletionTokens: true, // gpt-5-nano requires max_completion_tokens
    });
  }

  // ── Anthropic pair ──
  if (hubKey) {
    targets.push({
      name: 'hub-anthropic',
      provider: 'anthropic',
      format: 'openai', // Hub accepts OpenAI format
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: `anthropic/${MODELS.anthropic}`,
      path: 'hub',
    });
  }
  if (config.anthropicApiKey) {
    targets.push({
      name: 'anthropic-direct',
      provider: 'anthropic',
      format: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      key: config.anthropicApiKey,
      model: MODELS.anthropic,
      path: 'direct',
    });
  }

  // ── Google pair ──
  if (hubKey) {
    targets.push({
      name: 'hub-google',
      provider: 'google',
      format: 'openai', // Hub accepts OpenAI format
      url: `${HUB_URL}/api/v2/chat/completions`,
      key: hubKey,
      model: `google/${MODELS.google}`,
      path: 'hub',
    });
  }
  if (config.googleApiKey) {
    targets.push({
      name: 'google-direct',
      provider: 'google',
      format: 'gemini',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.google}:streamGenerateContent?alt=sse&key=${config.googleApiKey}`,
      key: config.googleApiKey,
      model: MODELS.google,
      path: 'direct',
    });
  }

  return targets;
}

// ── Format-specific body builders ────────────────────────────────────

function buildBody(target: HvdTarget, messages: Message[], maxTokens: number): object {
  switch (target.format) {
    case 'openai': {
      const body: Record<string, unknown> = {
        model: target.model,
        messages,
        stream: true,
      };
      if (target.useCompletionTokens) {
        body.max_completion_tokens = maxTokens;
      } else {
        body.max_tokens = maxTokens;
      }
      return body;
    }
    case 'anthropic': {
      const systemMsgs = messages.filter((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
      const body: Record<string, unknown> = {
        model: target.model,
        messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: maxTokens,
        stream: true,
      };
      if (systemMsgs.length > 0) {
        body.system = systemMsgs.map((m) => m.content).join('\n');
      }
      return body;
    }
    case 'gemini': {
      const systemMsgs = messages.filter((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
      const body: Record<string, unknown> = {
        contents: nonSystemMsgs.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      };
      if (systemMsgs.length > 0) {
        body.systemInstruction = { parts: [{ text: systemMsgs.map((m) => m.content).join('\n') }] };
      }
      return body;
    }
  }
}

function buildHeaders(target: HvdTarget): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  switch (target.format) {
    case 'openai':
      headers.Authorization = `Bearer ${target.key}`;
      break;
    case 'anthropic':
      headers['x-api-key'] = target.key;
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'gemini':
      // Key is in URL query string
      break;
  }
  return headers;
}

// ── Format-specific usage extractors ─────────────────────────────────

interface UsageCapture {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Try to extract usage from a single SSE data line based on format.
 * Returns partial usage info that callers can merge.
 */
function extractUsageFromLine(format: Format, line: string, current: Partial<UsageCapture>): Partial<UsageCapture> | null {
  if (!line.startsWith('data: ') || line === 'data: [DONE]') return null;
  let data: any;
  try {
    data = JSON.parse(line.slice(6));
  } catch {
    return null;
  }

  switch (format) {
    case 'openai': {
      // Last chunk before [DONE] has usage
      if (data.usage) {
        return {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        };
      }
      return null;
    }
    case 'anthropic': {
      // Anthropic event types:
      // - message_start: data.message.usage.input_tokens (prompt)
      // - message_delta: data.usage.output_tokens (completion, accumulative)
      if (data.type === 'message_start' && data.message?.usage) {
        return { promptTokens: data.message.usage.input_tokens ?? 0 };
      }
      if (data.type === 'message_delta' && data.usage) {
        const completion = data.usage.output_tokens ?? 0;
        const prompt = current.promptTokens ?? 0;
        return {
          completionTokens: completion,
          totalTokens: prompt + completion,
        };
      }
      return null;
    }
    case 'gemini': {
      // Gemini puts usageMetadata in each chunk, last one is authoritative
      if (data.usageMetadata) {
        const prompt = data.usageMetadata.promptTokenCount ?? 0;
        const completion =
          (data.usageMetadata.candidatesTokenCount ?? 0) +
          (data.usageMetadata.thoughtsTokenCount ?? 0);
        return {
          promptTokens: prompt,
          completionTokens: completion,
          totalTokens: data.usageMetadata.totalTokenCount ?? prompt + completion,
        };
      }
      return null;
    }
  }
}

// ── Core request function ────────────────────────────────────────────

async function benchmarkHvdRequest(
  target: HvdTarget,
  options: { messages: Message[]; maxTokens: number }
): Promise<BenchmarkResult> {
  const start = performance.now();
  const body = buildBody(target, options.messages, options.maxTokens);
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
        error: `HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
      };
    }

    let ttfb: number | undefined;
    let streamServerTiming: string | undefined;
    let usage: Partial<UsageCapture> = {};
    let sseBuffer = '';
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      if (!ttfb) ttfb = performance.now() - start;

      const text = decoder.decode(value, { stream: true });
      sseBuffer += text;

      // Look for Hub's server-timing SSE event
      const stMatch = text.match(/event: server-timing\ndata: (.+)\n/);
      if (stMatch) streamServerTiming = stMatch[1];

      // Process complete SSE lines
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';
      for (const line of lines) {
        const u = extractUsageFromLine(target.format, line, usage);
        if (u) usage = { ...usage, ...u };
      }
    }

    // Process any remaining buffer
    if (sseBuffer.length > 0) {
      const u = extractUsageFromLine(target.format, sseBuffer, usage);
      if (u) usage = { ...usage, ...u };
    }

    const totalTime = performance.now() - start;
    const serverTiming = parseServerTiming(streamServerTiming ?? response.headers.get('Server-Timing'));

    const result: BenchmarkResult = {
      status: response.status,
      ttfb: ttfb ?? totalTime,
      totalTime,
      streamingTime: totalTime - (ttfb ?? totalTime),
      serverTiming,
      rateLimited: response.status === 429,
      requestId: response.headers.get('x-request-id') ?? undefined,
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

// ── Concurrent runner ────────────────────────────────────────────────

async function runConcurrent(
  target: HvdTarget,
  concurrency: number,
  duration: number,
  options: { messages: Message[]; maxTokens: number }
): Promise<{ results: BenchmarkResult[]; elapsed: number }> {
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - startTime < duration) {
      results.push(await benchmarkHvdRequest(target, options));
    }
  });

  await Promise.all(workers);
  return { results, elapsed: Date.now() - startTime };
}

async function warmupTarget(target: HvdTarget, options: { messages: Message[]; maxTokens: number }) {
  for (let i = 0; i < 3; i++) {
    const r = await benchmarkHvdRequest(target, options);
    if (r.error) {
      throw new Error(`Warmup failed for ${target.name}: ${r.error.substring(0, 200)}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Hub vs Direct — Head-to-Head Benchmark');
  console.log('═══════════════════════════════════════════════════════════\n');

  const targets = buildTargets();
  if (targets.length === 0) {
    console.error('No targets configured. Check .env file.');
    process.exit(1);
  }

  const ctx = createRunContext('hub-vs-direct', {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID:      ${ctx.runId}`);
  console.log(`Git:         ${ctx.gitCommit ?? 'N/A'}`);
  console.log(`Hub:         ${HUB_URL}`);
  console.log(`Gateway:     ${ctx.gatewayEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Duration:    ${DURATION_MS / 1000}s per target`);
  console.log(`Cooldown:    ${COOLDOWN_MS / 1000}s between targets`);
  console.log(`Targets:     ${targets.length}`);
  const est = (targets.length * (DURATION_MS + COOLDOWN_MS)) / 1000;
  console.log(`Est. time:   ~${Math.ceil(est / 60)} min\n`);

  const payload = SHORT_PAYLOAD;
  console.log(`Payload:     short (30 max_tokens, minimal prompt)\n`);

  interface Result {
    target: HvdTarget;
    results: BenchmarkResult[];
    elapsed: number;
  }

  const allResults: Result[] = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  [${i + 1}/${targets.length}] ${t.name} (${t.path}, ${t.format} format)`);
    console.log(`${'─'.repeat(60)}`);

    console.log(`  Warmup (3 requests)...`);
    try {
      await warmupTarget(t, {
        messages: [...payload.messages],
        maxTokens: payload.maxTokens,
      });
    } catch (err) {
      console.log(`  Warmup failed: ${err instanceof Error ? err.message : err}`);
      console.log(`  Skipping ${t.name}`);
      continue;
    }

    console.log(`  Running c=${CONCURRENCY}, ${DURATION_MS / 1000}s...`);
    const startWall = Date.now();
    const { results } = await runConcurrent(t, CONCURRENCY, DURATION_MS, {
      messages: [...payload.messages],
      maxTokens: payload.maxTokens,
    });
    const elapsed = Date.now() - startWall;

    const ok = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);
    const ttfbStats = ok.length > 0 ? computeStats(ok.map((r) => r.ttfb)) : null;

    console.log(
      `  Done: ${ok.length} ok, ${errors.length} err (${
        results.length > 0 ? ((errors.length / results.length) * 100).toFixed(1) : 0
      }%)`
    );
    if (ttfbStats) {
      console.log(
        `    TTFB p50=${fmt(ttfbStats.p50)} p90=${fmt(ttfbStats.p90)} p99=${fmt(ttfbStats.p99)} cv=${ttfbStats.cv.toFixed(2)}`
      );
    }
    if (errors.length > 0) {
      console.log(`    First error: ${errors[0].error?.substring(0, 120)}`);
    }

    // Persist samples
    const samples = buildSamples(results, ctx, {
      target: { name: t.name, url: t.url, key: t.key, model: t.model },
      provider: t.provider,
      concurrency: CONCURRENCY,
      stream: true,
      payload: 'short',
    });
    appendSamples(samples);

    allResults.push({ target: t, results, elapsed });

    if (i < targets.length - 1) {
      console.log(`  Cooling down ${COOLDOWN_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
    }
  }

  // ── Head-to-Head Comparison ──────────────────────────────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Head-to-Head: Hub vs Direct (per provider)');
  console.log(`${'═'.repeat(70)}\n`);

  const providers: Array<'openai' | 'anthropic' | 'google'> = ['openai', 'anthropic', 'google'];
  const compareRows: string[][] = [];

  for (const provider of providers) {
    const hubResult = allResults.find((r) => r.target.provider === provider && r.target.path === 'hub');
    const directResult = allResults.find((r) => r.target.provider === provider && r.target.path === 'direct');

    if (!hubResult || !directResult) {
      compareRows.push([provider, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']);
      continue;
    }

    const hubOk = hubResult.results.filter((r) => !r.error);
    const directOk = directResult.results.filter((r) => !r.error);
    if (hubOk.length === 0 || directOk.length === 0) {
      compareRows.push([provider, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']);
      continue;
    }

    const hubStats = computeStats(hubOk.map((r) => r.ttfb));
    const directStats = computeStats(directOk.map((r) => r.ttfb));

    const diff50 = hubStats.p50 - directStats.p50;
    const pct50 = (diff50 / directStats.p50) * 100;
    const sign50 = diff50 >= 0 ? '+' : '';
    const diff90 = hubStats.p90 - directStats.p90;
    const pct90 = (diff90 / directStats.p90) * 100;
    const sign90 = diff90 >= 0 ? '+' : '';

    compareRows.push([
      provider,
      `${fmt(hubStats.p50)} / ${fmt(hubStats.p90)}`,
      `${fmt(directStats.p50)} / ${fmt(directStats.p90)}`,
      `${sign50}${Math.round(diff50)}ms (${sign50}${pct50.toFixed(1)}%)`,
      `${sign90}${Math.round(diff90)}ms (${sign90}${pct90.toFixed(1)}%)`,
      `${hubOk.length} / ${directOk.length}`,
    ]);
  }

  printTable(
    ['Provider', 'Hub p50/p90', 'Direct p50/p90', 'Diff p50', 'Diff p90', 'Samples (h/d)'],
    compareRows
  );

  // ── Hub Processing Overhead (from Server-Timing) ─────────────────

  console.log(`\n${'─'.repeat(70)}`);
  console.log('  Hub Processing Overhead (only measurable via Server-Timing)');
  console.log(`${'─'.repeat(70)}\n`);

  const overheadRows: string[][] = [];
  for (const { target, results } of allResults) {
    if (target.path !== 'hub') continue;
    const ok = results.filter((r) => !r.error && r.serverTiming);
    if (ok.length === 0) continue;
    const overheads = ok.map((r) => {
      const st = r.serverTiming!;
      return Math.max(0, (st.total ?? 0) - (st.providerTtfb ?? 0) - (st.streaming ?? 0));
    });
    const s = computeStats(overheads);
    overheadRows.push([target.name, String(ok.length), fmt(s.p50), fmt(s.p90), fmt(s.p99), fmt(s.min), fmt(s.max)]);
  }
  if (overheadRows.length > 0) {
    printTable(['Target', 'n', 'p50', 'p90', 'p99', 'min', 'max'], overheadRows);
  }

  // ── Final summary ────────────────────────────────────────────────

  const totalSamples = allResults.reduce((sum, r) => sum + r.results.length, 0);
  const totalOk = allResults.reduce((sum, r) => sum + r.results.filter((x) => !x.error).length, 0);
  console.log(`\nTotal: ${totalSamples} samples (${totalOk} ok)`);
  console.log(`Persisted to: benchmarks/data/samples.jsonl`);
  console.log(`Run ID: ${ctx.runId}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
