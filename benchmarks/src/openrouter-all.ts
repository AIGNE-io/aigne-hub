/**
 * OpenRouter comprehensive comparison: run all 3 providers via OpenRouter
 * to complete the Hub / Direct / OpenRouter 9-cell matrix.
 *
 * Existing data:
 *   - Hub × {OpenAI, Anthropic, Google}  from hub-vs-direct run 6o4u6u
 *   - Direct × {OpenAI, Anthropic, Google}  from hub-vs-direct run 6o4u6u
 *   - OpenRouter × OpenAI  from fill-gaps run nre1z6
 *
 * Missing:
 *   - OpenRouter × Anthropic (claude-haiku-4-5)
 *   - OpenRouter × Google (gemini-2.5-flash)
 *
 * This script fills the gap so we can produce the full 9-cell matrix.
 *
 * Uses the same short payload as hub-vs-direct for consistency.
 *
 * Run: pnpm tsx src/openrouter-all.ts
 */
import 'dotenv/config';

import {
  BenchmarkResult,
  Message,
  computeStats,
  config,
  fmt,
  printTable,
} from './index.js';
import { appendSamples, buildSamples, createRunContext } from './sample-store.js';

// ── Config ────────────────────────────────────────────────────────────

const SHORT_PAYLOAD = {
  messages: [
    { role: 'system' as const, content: 'You are a helpful assistant. Answer concisely.' },
    { role: 'user' as const, content: 'What is 2+2? Reply in one short sentence.' },
  ],
  maxTokens: 30,
};

// OpenRouter always uses OpenAI-compatible format regardless of upstream provider
interface OrTarget {
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  model: string; // in OpenRouter format: "provider/model"
}

const TARGETS: OrTarget[] = [
  { name: 'openrouter-openai-nano', provider: 'openai', model: 'openai/gpt-5-nano' },
  { name: 'openrouter-anthropic-haiku', provider: 'anthropic', model: 'anthropic/claude-haiku-4-5' },
  { name: 'openrouter-google-gemini', provider: 'google', model: 'google/gemini-2.5-flash' },
];

// ── Request function ─────────────────────────────────────────────────

async function request(target: OrTarget): Promise<BenchmarkResult> {
  const start = performance.now();
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const body = {
    model: target.model,
    messages: SHORT_PAYLOAD.messages,
    max_tokens: SHORT_PAYLOAD.maxTokens,
    stream: true,
  };

  try {
    const response = await fetch(url, {
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
        } catch { /* ignore */ }
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
  target: OrTarget,
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
  console.log('  OpenRouter All-Providers Comparison');
  console.log('  Tests OpenAI / Anthropic / Google via OpenRouter');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!config.openrouterApiKey) {
    console.error('OPENROUTER_API_KEY required');
    process.exit(1);
  }

  const ctx = createRunContext('openrouter-all', {
    hubBaseUrl: config.hubBaseUrl,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID: ${ctx.runId}`);
  console.log(`Targets: ${TARGETS.length}\n`);

  const allResults = new Map<string, BenchmarkResult[]>();

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  [${i + 1}/${TARGETS.length}] ${t.name}`);
    console.log(`  Model: ${t.model}`);
    console.log(`${'─'.repeat(60)}`);

    // Warmup
    process.stdout.write(`  Warmup...`);
    const w = await request(t);
    if (w.error) {
      console.log(` FAILED: ${w.error.substring(0, 200)}`);
      console.log(`  Skipping ${t.name}`);
      allResults.set(t.name, []);
      continue;
    }
    console.log(` ok (${fmt(w.ttfb)})`);

    // Main run: c=3, 60s
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

    allResults.set(t.name, results);

    // Persist samples
    const samples = buildSamples(results, ctx, {
      target: {
        name: t.name,
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.openrouterApiKey,
        model: t.model,
      },
      provider: t.provider,
      concurrency: 3,
      stream: true,
      payload: 'short',
    });
    appendSamples(samples);

    // Cooldown
    if (i < TARGETS.length - 1) {
      console.log(`  Cooldown 15s...`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Summary: OpenRouter as Proxy (short payload, c=3, 60s)');
  console.log(`${'═'.repeat(70)}\n`);

  const rows: string[][] = [];
  for (const t of TARGETS) {
    const r = allResults.get(t.name) ?? [];
    const ok = r.filter((x) => !x.error);
    const stats = ok.length > 0 ? computeStats(ok.map((x) => x.ttfb)) : null;
    rows.push([
      t.name,
      String(ok.length),
      stats ? fmt(stats.p50) : 'N/A',
      stats ? fmt(stats.p90) : 'N/A',
      stats ? fmt(stats.p99) : 'N/A',
      stats ? fmt(stats.min) : 'N/A',
      stats ? stats.cv.toFixed(2) : 'N/A',
    ]);
  }
  printTable(['Target', 'n', 'p50', 'p90', 'p99', 'min', 'cv'], rows);

  console.log(`\nRun ID: ${ctx.runId}`);
  console.log(`Combine with fill-gaps (nre1z6) and hub-vs-direct (6o4u6u) data for full 9-cell matrix.\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
