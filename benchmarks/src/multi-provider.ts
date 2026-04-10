/**
 * Multi-provider latency benchmark.
 *
 * For each (provider × path) target, runs concurrent requests for a
 * fixed duration and persists every request as a sample.
 *
 * Targets:
 *   - hub-openai, hub-anthropic, hub-google  (Hub path, streaming)
 *   - openai-direct, openrouter-direct       (Direct, for comparison)
 *
 * Goal: collect enough samples (~100 per target) for stable p50/p90 data
 * on Hub processing overhead vs direct provider latency.
 *
 * Run: pnpm tsx src/multi-provider.ts
 */
import 'dotenv/config';

import {
  BenchmarkResult,
  PAYLOADS,
  Target,
  aggregateServerTimings,
  computeStats,
  config,
  fmt,
  printTable,
  runAndStore,
  warmup,
} from './index.js';
import { createRunContext } from './sample-store.js';

// ── Config ────────────────────────────────────────────────────────────

const HUB_URL = config.hubBaseUrl;
const CONCURRENCY = parseInt(process.env.MULTI_PROVIDER_CONCURRENCY || '5', 10);
const DURATION_MS = parseInt(process.env.MULTI_PROVIDER_DURATION || '30000', 10);
const COOLDOWN_MS = parseInt(process.env.MULTI_PROVIDER_COOLDOWN || '10000', 10);

const MODELS = {
  openai: 'gpt-5-nano',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-oss-20b',
};

// ── Targets ───────────────────────────────────────────────────────────

interface MultiProviderTarget {
  target: Target;
  provider: string;
  stream: boolean;
}

function buildTargets(): MultiProviderTarget[] {
  const targets: MultiProviderTarget[] = [];
  const hubKey = config.hubAccessKey || config.comparisonHubAccessKey;

  // Hub targets — streaming (real user path)
  if (hubKey) {
    targets.push({
      target: {
        name: 'hub-openai',
        url: `${HUB_URL}/api/v2/chat/completions`,
        key: hubKey,
        model: `openai/${MODELS.openai}`,
      },
      provider: 'openai',
      stream: true,
    });
    targets.push({
      target: {
        name: 'hub-anthropic',
        url: `${HUB_URL}/api/v2/chat/completions`,
        key: hubKey,
        model: `anthropic/${MODELS.anthropic}`,
      },
      provider: 'anthropic',
      stream: true,
    });
    targets.push({
      target: {
        name: 'hub-google',
        url: `${HUB_URL}/api/v2/chat/completions`,
        key: hubKey,
        model: `google/${MODELS.google}`,
      },
      provider: 'google',
      stream: true,
    });
  }

  // Direct targets — OpenAI-format only (non-streaming for simpler usage capture)
  if (config.openaiApiKey) {
    targets.push({
      target: {
        name: 'openai-direct',
        url: 'https://api.openai.com/v1/chat/completions',
        key: config.openaiApiKey,
        model: MODELS.openai,
      },
      provider: 'openai',
      stream: true,
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
      stream: true,
    });
  }

  return targets;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Multi-Provider Benchmark: Hub vs Direct');
  console.log('═══════════════════════════════════════════════════════════\n');

  const targets = buildTargets();
  if (targets.length === 0) {
    console.error('No targets configured. Check .env file.');
    process.exit(1);
  }

  const ctx = createRunContext('multi-provider', {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID:      ${ctx.runId}`);
  console.log(`Git:         ${ctx.gitCommit ?? '(not in git)'}`);
  console.log(`Hub:         ${HUB_URL}`);
  console.log(`Gateway:     ${ctx.gatewayEnabled ? 'enabled' : 'disabled'}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Duration:    ${DURATION_MS / 1000}s per target`);
  console.log(`Targets:     ${targets.length}`);
  const totalTime = targets.length * (DURATION_MS + COOLDOWN_MS) / 1000;
  console.log(`Est. time:   ~${Math.ceil(totalTime / 60)} min\n`);

  const payload = PAYLOADS.realistic;

  interface Result {
    target: MultiProviderTarget;
    results: BenchmarkResult[];
    elapsed: number;
  }

  const allResults: Result[] = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  [${i + 1}/${targets.length}] ${t.target.name}`);
    console.log(`${'─'.repeat(60)}`);

    // Warmup
    console.log(`  Warmup (3 requests)...`);
    try {
      await warmup(t.target, 3, {
        messages: [...payload.messages],
        maxTokens: payload.maxTokens,
        stream: t.stream,
      });
    } catch (err) {
      console.log(`  Warmup failed: ${err instanceof Error ? err.message : err}`);
      console.log(`  Skipping ${t.target.name}`);
      continue;
    }

    // Run benchmark
    console.log(`  Running c=${CONCURRENCY}, ${DURATION_MS / 1000}s...`);
    const startTime = Date.now();
    const { results, elapsed } = await runAndStore(
      t.target,
      CONCURRENCY,
      DURATION_MS,
      ctx,
      { provider: t.provider, stream: t.stream, payload: 'realistic' },
      { messages: [...payload.messages], maxTokens: payload.maxTokens, stream: t.stream }
    );
    const wallTime = Date.now() - startTime;

    const ok = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);
    const errorRate = results.length > 0 ? (errors.length / results.length) * 100 : 0;

    const ttfbStats = computeStats(ok.map((r) => r.ttfb));
    const totalStats = computeStats(ok.map((r) => r.totalTime));
    const rps = ok.length / (wallTime / 1000);

    console.log(`  Done: ${ok.length} ok, ${errors.length} err (${errorRate.toFixed(1)}%)`);
    console.log(`    TTFB   p50=${fmt(ttfbStats.p50)} p90=${fmt(ttfbStats.p90)} p99=${fmt(ttfbStats.p99)}`);
    console.log(`    Total  p50=${fmt(totalStats.p50)} p90=${fmt(totalStats.p90)} p99=${fmt(totalStats.p99)}`);
    console.log(`    RPS=${rps.toFixed(1)}  cv(ttfb)=${ttfbStats.cv.toFixed(2)}`);

    if (errors.length > 0) {
      console.log(`    First error: ${errors[0].error?.substring(0, 120)}`);
    }

    allResults.push({ target: t, results, elapsed: wallTime });

    // Cooldown between targets
    if (i < targets.length - 1) {
      console.log(`  Cooling down ${COOLDOWN_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
    }
  }

  // ── Summary: Server-Timing breakdown (Hub targets) ───────────────

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  Summary: Server-Timing Breakdown (Hub targets)');
  console.log(`${'═'.repeat(70)}\n`);

  const hubRows: string[][] = [];
  for (const { target: t, results } of allResults) {
    if (!t.target.name.startsWith('hub-')) continue;
    const ok = results.filter((r) => !r.error && r.serverTiming);
    if (ok.length === 0) continue;

    const stMap = aggregateServerTimings(ok);
    const getP50 = (phase: string) => {
      const s = stMap.get(phase);
      return s ? fmt(s.p50) : '-';
    };
    hubRows.push([
      t.target.name,
      String(ok.length),
      getP50('session'),
      getP50('resolveProvider'),
      getP50('preChecks'),
      getP50('modelSetup'),
      getP50('providerTtfb'),
      getP50('streaming'),
      getP50('usage'),
      getP50('total'),
    ]);
  }
  if (hubRows.length > 0) {
    printTable(
      ['Target', 'n', 'session', 'resolveProv', 'preChecks', 'modelSetup', 'providerTtfb', 'streaming', 'usage', 'total'],
      hubRows
    );
  }

  // ── Summary: Hub processing overhead ─────────────────────────────

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  Hub Processing Overhead (total - providerTtfb - streaming)');
  console.log(`${'─'.repeat(60)}\n`);

  const overheadRows: string[][] = [];
  for (const { target: t, results } of allResults) {
    if (!t.target.name.startsWith('hub-')) continue;
    const ok = results.filter((r) => !r.error && r.serverTiming);
    if (ok.length === 0) continue;
    const overheads = ok.map((r) => {
      const st = r.serverTiming!;
      return Math.max(0, (st.total ?? 0) - (st.providerTtfb ?? 0) - (st.streaming ?? 0));
    });
    const s = computeStats(overheads);
    overheadRows.push([
      t.target.name,
      String(ok.length),
      fmt(s.p50),
      fmt(s.p90),
      fmt(s.p99),
      fmt(s.min),
      fmt(s.max),
      s.cv.toFixed(2),
    ]);
  }
  if (overheadRows.length > 0) {
    printTable(['Target', 'n', 'p50', 'p90', 'p99', 'min', 'max', 'cv'], overheadRows);
  }

  // ── Summary: All targets TTFB ────────────────────────────────────

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  All Targets — Client-Side TTFB');
  console.log(`${'─'.repeat(60)}\n`);

  const summaryRows: string[][] = [];
  for (const { target: t, results } of allResults) {
    const ok = results.filter((r) => !r.error);
    if (ok.length === 0) {
      summaryRows.push([t.target.name, '0', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']);
      continue;
    }
    const s = computeStats(ok.map((r) => r.ttfb));
    summaryRows.push([
      t.target.name,
      String(ok.length),
      fmt(s.p50),
      fmt(s.p90),
      fmt(s.p99),
      fmt(s.min),
      s.cv.toFixed(2),
    ]);
  }
  printTable(['Target', 'n', 'p50', 'p90', 'p99', 'min', 'cv'], summaryRows);

  // ── Final ─────────────────────────────────────────────────────────

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
