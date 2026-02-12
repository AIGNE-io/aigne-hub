import asciichart from 'asciichart';

import {
  BenchmarkResult,
  PAYLOADS,
  Target,
  aggregateServerTimings,
  computeStats,
  config,
  fmt,
  printServerTimingBreakdown,
  printTable,
  runConcurrent,
  saveReport,
  type,
  type,
  warmup,
} from './index.js';

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Part 2: Stress — Real-world Concurrency Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!config.stressHubAccessKey) {
    console.log('STRESS_HUB_ACCESS_KEY (or HUB_ACCESS_KEY) is required. Check your .env configuration.');
    process.exit(1);
  }

  const hubTarget: Target = {
    name: 'hub',
    url: `${config.stressHubBaseUrl}/api/v2/chat/completions`,
    key: config.stressHubAccessKey,
    model: 'openai/gpt-4o-mini',
  };

  const levels = config.stressConcurrencyLevels;
  const duration = config.stressDuration;
  const payload = PAYLOADS.minimal;

  console.log(`Config: levels=[${levels.join(',')}], ${duration / 1000}s per level, minimal payload, streaming`);
  console.log(`Target: ${hubTarget.url} (model: ${hubTarget.model})\n`);

  // Warmup
  console.log('Warmup phase:');
  await warmup(hubTarget);
  console.log();

  // Run stress test
  const headers = ['Concurrency', 'RPS', 'TTFB p50', 'TTFB p90', 'TTFB p99', 'stddev', 'Err%', '429s'];
  const rows: string[][] = [];
  const reportData: any[] = [];
  const ttfbP50Series: number[] = [];

  for (const concurrency of levels) {
    console.log(`  Running concurrency=${concurrency} for ${duration / 1000}s...`);
    const results = await runConcurrent(hubTarget, concurrency, duration, {
      messages: [...payload.messages],
      maxTokens: payload.maxTokens,
    });

    const successful = results.filter((r) => !r.error);
    const errors = results.filter((r) => r.error);
    const rateLimited = results.filter((r) => r.rateLimited);
    const ttfbStats = computeStats(successful.map((r) => r.ttfb));
    const rps = results.length / (duration / 1000);
    const errPct = results.length > 0 ? (errors.length / results.length) * 100 : 0;

    ttfbP50Series.push(Math.round(ttfbStats.p50));

    rows.push([
      String(concurrency),
      rps.toFixed(1),
      fmt(ttfbStats.p50),
      fmt(ttfbStats.p90),
      fmt(ttfbStats.p99),
      fmt(ttfbStats.stddev),
      `${errPct.toFixed(0)}%`,
      String(rateLimited.length),
    ]);

    // Server-Timing breakdown
    printServerTimingBreakdown(`concurrency=${concurrency}`, successful);

    reportData.push({
      concurrency,
      totalRequests: results.length,
      rps,
      ttfb: ttfbStats,
      total: computeStats(successful.map((r) => r.totalTime)),
      errors: errors.length,
      rateLimited: rateLimited.length,
      errorRate: errPct,
      serverTiming: Object.fromEntries(aggregateServerTimings(successful)),
    });
  }

  console.log('\nResults:');
  printTable(headers, rows);

  // ASCII chart
  if (ttfbP50Series.length > 1) {
    const TARGET_WIDTH = 80;
    const POINTS_PER_SEGMENT = Math.max(1, Math.round(TARGET_WIDTH / (levels.length - 1)));
    const chartPadding = '        ';

    const interpolate = (data: number[]): number[] => {
      if (data.length <= 1) return data;
      const result: number[] = [];
      for (let i = 0; i < data.length - 1; i++) {
        for (let j = 0; j < POINTS_PER_SEGMENT; j++) {
          const t = j / POINTS_PER_SEGMENT;
          result.push(data[i] + (data[i + 1] - data[i]) * t);
        }
      }
      result.push(data[data.length - 1]);
      return result;
    };

    const xAxisLabels = (): string => {
      const totalWidth = (levels.length - 1) * POINTS_PER_SEGMENT + 1;
      const line = new Array(totalWidth).fill(' ');
      for (let i = 0; i < levels.length; i++) {
        const pos = i * POINTS_PER_SEGMENT;
        const label = String(levels[i]);
        for (let j = 0; j < label.length && pos + j < totalWidth; j++) {
          line[pos + j] = label[j];
        }
      }
      return `${chartPadding}${line.join('')}\n${chartPadding}${'Concurrency →'}`;
    };

    console.log('\nTTFB p50 vs Concurrency:');
    console.log(
      asciichart.plot(interpolate(ttfbP50Series), {
        height: 10,
        padding: chartPadding,
        format: (x: number) => padNum(x, 7),
      })
    );
    console.log(xAxisLabels());
  }

  saveReport('stress', reportData);
}

function padNum(n: number, width: number): string {
  const s = String(Math.round(n));
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
