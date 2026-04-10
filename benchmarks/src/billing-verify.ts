/**
 * Billing verification — verifies Hub's accounting accuracy.
 *
 * Flow:
 *   1. Send N non-streaming requests per Hub target, each with a tracked
 *      x-request-id header so we can find them in D1 later
 *   2. Capture client-side usage (tokens, credits) from each response
 *   3. Wait for waitUntil-buffered D1 writes to settle
 *   4. Query D1 ModelCalls by requestId prefix and compare with client observations
 *   5. Report match rate and mismatches
 *
 * Every request is also persisted as a sample in data/samples.jsonl.
 *
 * Run: pnpm tsx src/billing-verify.ts
 */
import 'dotenv/config';

import {
  compareBillingRecords,
  getAggregateStats,
  getModelCallsByRequestIdPrefix,
  type ClientObservation,
} from './billing-helpers.js';
import {
  BenchmarkResult,
  config,
  fmt,
  printTable,
} from './index.js';
import {
  appendSamples,
  buildSamples,
  createRunContext,
} from './sample-store.js';

// ── Config ────────────────────────────────────────────────────────────

const HUB_URL = config.hubBaseUrl;
const HUB_KEY = config.hubAccessKey || config.comparisonHubAccessKey;
const REQUESTS_PER_MODEL = 20;
const D1_SETTLE_DELAY_MS = 10_000;

const MODELS = [
  { provider: 'openai', model: 'openai/gpt-5-nano' },
  { provider: 'anthropic', model: 'anthropic/claude-haiku-4-5' },
  { provider: 'google', model: 'google/gemini-2.5-flash' },
];

// ── Single request with tracked requestId ────────────────────────────

async function sendTrackedRequest(
  model: string,
  requestId: string
): Promise<BenchmarkResult & { model: string; requestId: string }> {
  const url = `${HUB_URL}/api/v2/chat/completions`;
  const body = {
    model,
    messages: [{ role: 'user', content: 'Reply with exactly: "hello world"' }],
    max_tokens: 20,
    stream: false,
  };

  const start = performance.now();
  let resp: Response;
  let data: any = {};
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HUB_KEY}`,
        'x-request-id': requestId,
      },
      body: JSON.stringify(body),
    });
    data = await resp.json();
  } catch (err) {
    const totalTime = performance.now() - start;
    return {
      status: 0,
      ttfb: totalTime,
      totalTime,
      streamingTime: 0,
      rateLimited: false,
      error: err instanceof Error ? err.message : String(err),
      model,
      requestId,
    };
  }

  const totalTime = performance.now() - start;

  const result: BenchmarkResult & { model: string; requestId: string } = {
    status: resp.status,
    ttfb: totalTime,
    totalTime,
    streamingTime: 0,
    rateLimited: resp.status === 429,
    error: resp.status !== 200
      ? `HTTP ${resp.status}: ${JSON.stringify(data?.error ?? '').substring(0, 150)}`
      : undefined,
    requestId,
    model,
  };

  if (data?.usage) {
    result.usage = {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    };
  }

  // Parse Server-Timing from header
  const st = resp.headers.get('Server-Timing');
  if (st) {
    const parsed: Record<string, number> = {};
    for (const part of st.split(',')) {
      const m = part.trim().match(/^(\w+);dur=([\d.]+)$/);
      if (m) parsed[m[1]] = parseFloat(m[2]);
    }
    if (Object.keys(parsed).length > 0) result.serverTiming = parsed;
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Billing Verification: Hub Accounting Accuracy');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!HUB_KEY) {
    console.error('Error: HUB_ACCESS_KEY or COMPARISON_HUB_ACCESS_KEY required');
    process.exit(1);
  }

  const ctx = createRunContext('billing-verify', {
    hubBaseUrl: HUB_URL,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });
  const requestIdPrefix = `bverify-${ctx.runId}`;

  console.log(`Run ID: ${ctx.runId}`);
  console.log(`Request ID prefix: ${requestIdPrefix}`);
  console.log(`Hub: ${HUB_URL}`);
  console.log(`Models: ${MODELS.map((m) => m.model).join(', ')}`);
  console.log(`Requests per model: ${REQUESTS_PER_MODEL}\n`);

  // ── Phase 1: Send requests with tracked IDs ──────────────────────

  const allResults: Array<BenchmarkResult & { model: string; requestId: string; provider: string }> = [];

  for (const { provider, model } of MODELS) {
    console.log(`\n  Testing ${model}:`);

    for (let i = 0; i < REQUESTS_PER_MODEL; i++) {
      const requestId = `${requestIdPrefix}-${provider}-${i.toString().padStart(3, '0')}`;
      process.stdout.write(`    ${i + 1}/${REQUESTS_PER_MODEL}...`);

      const result = await sendTrackedRequest(model, requestId);
      allResults.push({ ...result, provider });

      if (result.error) {
        console.log(` ERROR: ${result.error.substring(0, 80)}`);
      } else {
        const tokens = result.usage?.totalTokens ?? '?';
        const credits = result.creditsUsed ?? '?';
        console.log(` OK (${fmt(result.ttfb)}, ${tokens} tokens, ${credits} credits)`);
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }

    // Persist samples for this model
    const samples = buildSamples(
      allResults
        .filter((r) => r.model === model)
        .map(({ provider: _p, model: _m, requestId: _r, ...rest }) => ({
          ...rest,
          requestId: _r, // keep requestId for correlation
        })),
      ctx,
      {
        target: { name: `hub-${provider}`, url: HUB_URL, key: HUB_KEY, model },
        provider,
        concurrency: 1,
        stream: false,
        payload: 'billing-verify',
      }
    );
    appendSamples(samples);
  }

  // ── Phase 2: Client-side summary ─────────────────────────────────

  const successful = allResults.filter((r) => !r.error);
  const clientObs: ClientObservation[] = successful.map((r) => ({
    requestId: r.requestId,
    model: r.model,
    promptTokens: r.usage?.promptTokens ?? 0,
    completionTokens: r.usage?.completionTokens ?? 0,
    totalTokens: r.usage?.totalTokens ?? 0,
    creditsUsed: r.creditsUsed,
  }));

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Client-Side Observed (${successful.length}/${allResults.length} success)`);
  console.log(`${'═'.repeat(60)}`);
  const totalClientTokens = clientObs.reduce((sum, o) => sum + o.totalTokens, 0);
  const totalClientCredits = clientObs.reduce((sum, o) => sum + (o.creditsUsed ?? 0), 0);
  console.log(`  Total tokens:   ${totalClientTokens}`);
  console.log(`  Total credits:  ${totalClientCredits.toFixed(6)}`);

  // ── Phase 3: Wait for D1 writes to settle ────────────────────────

  console.log(`\n  Waiting ${D1_SETTLE_DELAY_MS / 1000}s for waitUntil D1 writes to settle...`);
  await new Promise((r) => setTimeout(r, D1_SETTLE_DELAY_MS));

  // ── Phase 4: Query D1 and compare ────────────────────────────────

  console.log(`\n  Querying D1 staging (this may take a few seconds)...`);

  let dbRecords;
  let aggStats;
  try {
    dbRecords = getModelCallsByRequestIdPrefix(requestIdPrefix);
    aggStats = getAggregateStats(requestIdPrefix);
  } catch (err) {
    console.error(`  D1 query failed: ${err instanceof Error ? err.message : err}`);
    console.error(`  Samples still persisted — can analyze later via sample store.`);
    return;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  D1 Aggregate');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total records:  ${aggStats.totalCalls}`);
  console.log(`  Success:        ${aggStats.successCalls}`);
  console.log(`  Failed:         ${aggStats.failedCalls}`);
  console.log(`  Total tokens:   ${aggStats.totalTokens}`);
  console.log(`  Total credits:  ${aggStats.totalCredits.toFixed(6)}`);

  // ── Phase 5: Diff ────────────────────────────────────────────────

  const { diffs, matchRate } = compareBillingRecords(clientObs, dbRecords);
  const matches = diffs.filter((d) => d.status === 'match');
  const mismatches = diffs.filter((d) => d.status === 'token-mismatch');
  const missing = diffs.filter((d) => d.status === 'missing');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Per-Request Diff');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Match:          ${matches.length}/${clientObs.length} (${matchRate.toFixed(1)}%)`);
  console.log(`  Token mismatch: ${mismatches.length}`);
  console.log(`  Missing from D1: ${missing.length}`);

  if (mismatches.length > 0) {
    console.log('\n  First 10 token mismatches:');
    for (const d of mismatches.slice(0, 10)) {
      console.log(`    ${d.requestId}  client=${d.clientTokens}  d1=${d.dbTokens}  diff=${d.tokenDiff}`);
    }
  }

  if (missing.length > 0) {
    console.log('\n  First 10 missing records:');
    for (const d of missing.slice(0, 10)) {
      console.log(`    ${d.requestId}  expected_tokens=${d.clientTokens}`);
    }
  }

  // ── Final verdict ────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  if (matchRate >= 95) {
    console.log(`  PASS: Billing accuracy ${matchRate.toFixed(1)}% (>= 95%)`);
  } else if (matchRate >= 80) {
    console.log(`  WARN: Billing accuracy ${matchRate.toFixed(1)}% (80-95%) — investigate`);
  } else {
    console.log(`  FAIL: Billing accuracy ${matchRate.toFixed(1)}% (< 80%) — broken`);
  }
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
