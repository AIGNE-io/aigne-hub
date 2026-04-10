/**
 * Smoke test — verifies Server-Timing + sample store end-to-end.
 *
 * Sends a small number of requests to each (provider × path) target,
 * persists every request as a sample, and prints Server-Timing breakdown
 * for Hub targets so we can see the phase data flowing correctly.
 *
 * Run: pnpm tsx src/smoke.ts
 *
 * This is a sanity-check script, not a benchmark. Use comparison.ts or
 * multi-provider.ts for real performance measurement.
 */
import 'dotenv/config';

import {
  BenchmarkResult,
  Target,
  benchmarkRequest,
  computeStats,
  config,
  fmt,
  parseServerTiming,
  printTable,
} from './index.js';
import {
  appendSamples,
  buildSamples,
  createRunContext,
} from './sample-store.js';

// ── Config ────────────────────────────────────────────────────────────

const HUB_URL = config.hubBaseUrl;
const REQUESTS_PER_TARGET = 3;

const MODELS = {
  openai: 'gpt-5-nano',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-oss-20b', // paid — :free tier has queue noise
};

// ── Targets ────────────────────────────────────────────────────────────

interface SmokeTarget {
  target: Target;
  provider: string;
  stream: boolean;
}

function buildTargets(): SmokeTarget[] {
  const targets: SmokeTarget[] = [];
  const hubKey = config.hubAccessKey || config.comparisonHubAccessKey;

  // Hub targets (3 providers, both streaming and non-streaming)
  if (hubKey) {
    for (const [provider, model] of Object.entries(MODELS)) {
      if (provider === 'openrouter') continue; // Hub likely doesn't have this in catalog
      for (const stream of [false, true]) {
        targets.push({
          target: {
            name: `hub-${provider}${stream ? '-stream' : ''}`,
            url: `${HUB_URL}/api/v2/chat/completions`,
            key: hubKey,
            model: `${provider}/${model}`,
          },
          provider,
          stream,
        });
      }
    }
  }

  // Direct targets (OpenAI-compatible format only, non-streaming for simplicity)
  if (config.openaiApiKey) {
    targets.push({
      target: {
        name: 'openai-direct',
        url: 'https://api.openai.com/v1/chat/completions',
        key: config.openaiApiKey,
        model: MODELS.openai,
      },
      provider: 'openai',
      stream: false,
    });
  }

  if (config.openrouterApiKey) {
    targets.push({
      target: {
        name: 'openrouter-direct',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.openrouterApiKey,
        model: MODELS.openrouter,
      },
      provider: 'openrouter',
      stream: false,
    });
  }

  return targets;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Smoke Test: Server-Timing + Sample Store');
  console.log('═══════════════════════════════════════════════════════════\n');

  const targets = buildTargets();
  if (targets.length === 0) {
    console.error('No targets configured. Check .env file.');
    process.exit(1);
  }

  const ctx = createRunContext('smoke', {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID:  ${ctx.runId}`);
  console.log(`Git:     ${ctx.gitCommit ?? '(not in git)'}`);
  console.log(`Hub:     ${HUB_URL}`);
  console.log(`Gateway: ${ctx.gatewayEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Targets: ${targets.length}`);
  console.log(`Requests per target: ${REQUESTS_PER_TARGET}\n`);

  const options = {
    messages: [
      { role: 'user' as const, content: 'Say hello in exactly 5 words.' },
    ],
    maxTokens: 20,
  };

  const allResults: Array<{ target: SmokeTarget; results: BenchmarkResult[] }> = [];

  for (const t of targets) {
    const modeLabel = t.stream ? 'stream' : 'non-stream';
    process.stdout.write(`  ${t.target.name.padEnd(25)} [${modeLabel}]  `);

    const results: BenchmarkResult[] = [];
    for (let i = 0; i < REQUESTS_PER_TARGET; i++) {
      const r = await benchmarkRequest(t.target, { ...options, stream: t.stream });
      results.push(r);
      process.stdout.write(r.error ? 'X' : '.');
    }

    const ok = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);
    const ttfbStr = ok.length > 0 ? fmt(computeStats(ok.map((r) => r.ttfb)).p50) : 'N/A';
    console.log(`  ${ok.length}/${REQUESTS_PER_TARGET} ok, p50 TTFB=${ttfbStr}`);

    if (errors.length > 0) {
      console.log(`    First error: ${errors[0].error?.substring(0, 150)}`);
    }

    // Persist samples regardless of error — failures are data too
    const samples = buildSamples(results, ctx, {
      target: t.target,
      provider: t.provider,
      concurrency: 1,
      stream: t.stream,
      payload: 'smoke',
    });
    appendSamples(samples);

    allResults.push({ target: t, results });
  }

  // ── Server-Timing breakdown for Hub targets ────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  Server-Timing Breakdown (Hub targets, p50 ms)');
  console.log(`${'─'.repeat(60)}\n`);

  const PHASES = [
    'session',
    'resolveProvider',
    'preChecks',
    'modelSetup',
    'providerTtfb',
    'streaming',
    'usage',
    'total',
  ];

  const hubRows: string[][] = [];
  for (const { target, results } of allResults) {
    if (!target.target.name.startsWith('hub-')) continue;
    const ok = results.filter((r) => !r.error && r.serverTiming);
    if (ok.length === 0) {
      hubRows.push([target.target.name, ...PHASES.map(() => '-')]);
      continue;
    }
    const row = [target.target.name];
    for (const phase of PHASES) {
      const values = ok
        .map((r) => r.serverTiming?.[phase])
        .filter((v): v is number => v !== undefined);
      row.push(values.length > 0 ? fmt(computeStats(values).p50) : '-');
    }
    hubRows.push(row);
  }

  if (hubRows.length > 0) {
    printTable(['Target', ...PHASES], hubRows);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  Client-Side TTFB Summary (all targets, p50 ms)');
  console.log(`${'─'.repeat(60)}\n`);

  const summaryRows: string[][] = [];
  for (const { target, results } of allResults) {
    const ok = results.filter((r) => !r.error);
    const stats = ok.length > 0 ? computeStats(ok.map((r) => r.ttfb)) : null;
    summaryRows.push([
      target.target.name,
      target.stream ? 'stream' : 'non-stream',
      String(ok.length),
      stats ? fmt(stats.p50) : 'N/A',
      stats ? fmt(stats.min) : 'N/A',
      stats ? fmt(stats.max) : 'N/A',
    ]);
  }

  printTable(['Target', 'Mode', 'OK', 'p50', 'min', 'max'], summaryRows);

  // ── Final status ─────────────────────────────────────────────────────
  const totalSamples = allResults.reduce((sum, { results }) => sum + results.length, 0);
  const totalOk = allResults.reduce((sum, { results }) => sum + results.filter((r) => !r.error).length, 0);
  const totalErrors = totalSamples - totalOk;

  console.log(`\nTotal: ${totalSamples} samples (${totalOk} ok, ${totalErrors} errors)`);
  console.log(`Persisted to: benchmarks/data/samples.jsonl`);
  console.log(`Run ID: ${ctx.runId}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
