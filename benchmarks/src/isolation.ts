import asciichart from 'asciichart';

import {
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
  warmup,
} from './index.js';
import { startMockProvider, stopMockProvider } from './mock-provider.js';

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Part 3: Isolation — Mock Provider + Server-Timing');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!config.isolationHubAccessKey) {
    console.log('ISOLATION_HUB_ACCESS_KEY (or HUB_ACCESS_KEY) is required. Check your .env configuration.');
    process.exit(1);
  }

  const mockTarget: Target = {
    name: 'hub-mock',
    url: `${config.isolationHubBaseUrl}/api/v2/chat/completions`,
    key: config.isolationHubAccessKey,
    model: config.mockHubModel,
  };

  const levels = config.isolationConcurrencyLevels;
  const duration = config.isolationDuration;

  console.log(`Config: levels=[${levels.join(',')}], ${duration / 1000}s per level, non-streaming`);
  console.log(`Target: ${mockTarget.url} (model: ${mockTarget.model})`);
  console.log(`Mock provider port: ${config.mockProviderPort}\n`);

  // Start mock provider
  console.log('Starting mock provider...');
  await startMockProvider(config.mockProviderPort);

  const reportData: any[] = [];

  try {
    const payload = PAYLOADS.realistic;

    // Warmup
    await warmup(mockTarget, config.warmupCount, {
      stream: false,
      messages: [...payload.messages],
      maxTokens: payload.maxTokens,
    });

    const headers = ['Concurrency', 'RPS', 'Resp p50', 'Resp p90', 'Resp p99', 'stddev', 'Err%'];
    const rows: string[][] = [];
    const ttfbP50Series: number[] = [];
    const rpsSeries: number[] = [];

    for (const concurrency of levels) {
      console.log(`\n  Running concurrency=${concurrency} for ${duration / 1000}s...`);
      const results = await runConcurrent(mockTarget, concurrency, duration, {
        stream: false,
        messages: [...payload.messages],
        maxTokens: payload.maxTokens,
      });

      const successful = results.filter((r) => !r.error);
      const errors = results.filter((r) => r.error);
      const respStats = computeStats(successful.map((r) => r.totalTime));
      const rps = results.length / (duration / 1000);
      const errPct = results.length > 0 ? (errors.length / results.length) * 100 : 0;

      ttfbP50Series.push(Math.round(respStats.p50));
      rpsSeries.push(Math.round(rps));

      rows.push([
        String(concurrency),
        rps.toFixed(0),
        fmt(respStats.p50),
        fmt(respStats.p90),
        fmt(respStats.p99),
        fmt(respStats.stddev),
        `${errPct.toFixed(0)}%`,
      ]);

      printServerTimingBreakdown(`concurrency=${concurrency}`, successful);

      reportData.push({
        concurrency,
        totalRequests: results.length,
        rps,
        responseTime: respStats,
        errors: errors.length,
        errorRate: errPct,
        serverTiming: Object.fromEntries(aggregateServerTimings(successful)),
      });
    }

    console.log('\n  Summary:');
    printTable(headers, rows);

    // ASCII charts
    if (levels.length > 1) {
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

      console.log('\nResponse Time p50 vs Concurrency:');
      console.log(
        asciichart.plot(interpolate(ttfbP50Series), {
          height: 15,
          padding: chartPadding,
        })
      );
      console.log(xAxisLabels());

      console.log('\nRPS vs Concurrency:');
      console.log(
        asciichart.plot(interpolate(rpsSeries), {
          height: 15,
          padding: chartPadding,
        })
      );
      console.log(xAxisLabels());
    }

    saveReport('isolation', reportData);
  } finally {
    console.log('\nStopping mock provider...');
    await stopMockProvider();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
