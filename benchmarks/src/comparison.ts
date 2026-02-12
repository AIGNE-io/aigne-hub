import asciichart from 'asciichart';

import {
  BenchmarkResult,
  PAYLOADS,
  Target,
  aggregateServerTimings,
  computeStats,
  config,
  fmt,
  padLeft,
  printServerTimingBreakdown,
  printTable,
  runConcurrent,
  saveReport,
  type,
  type,
  warmup,
} from './index.js';

// ── Targets ────────────────────────────────────────────────────────────

interface ComparisonGroup {
  model: string;
  targets: Target[];
}

function buildGroups(): ComparisonGroup[] {
  const groups: ComparisonGroup[] = [];

  // GPT-4o-mini group
  const gptTargets: Target[] = [];
  if (config.openaiApiKey) {
    gptTargets.push({
      name: 'openai-direct',
      url: 'https://api.openai.com/v1/chat/completions',
      key: config.openaiApiKey,
      model: 'gpt-4o-mini',
    });
  }
  if (config.openrouterApiKey) {
    gptTargets.push({
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: config.openrouterApiKey,
      model: 'openai/gpt-4o-mini',
    });
  }
  if (config.comparisonHubAccessKey) {
    gptTargets.push({
      name: 'hub-openai',
      url: `${config.comparisonHubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model: 'openai/gpt-4o-mini',
    });
  }
  if (gptTargets.length > 0) {
    groups.push({ model: 'gpt-4o-mini', targets: gptTargets });
  }

  // Gemini group
  const geminiTargets: Target[] = [];
  if (config.geminiApiKey) {
    geminiTargets.push({
      name: 'gemini-direct',
      url: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
      key: config.geminiApiKey,
      model: 'gemini-2.0-flash',
    });
  }
  if (config.comparisonHubAccessKey) {
    geminiTargets.push({
      name: 'hub-gemini',
      url: `${config.comparisonHubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model: 'google/gemini-2.0-flash',
    });
  }
  if (geminiTargets.length > 0) {
    groups.push({ model: 'gemini-2.0-flash', targets: geminiTargets });
  }

  return groups;
}

// ── Helpers ─────────────────────────────────────────────────────────────

interface TargetResult {
  ttfb: ReturnType<typeof computeStats>;
  total: ReturnType<typeof computeStats>;
  streaming: ReturnType<typeof computeStats>;
  rps: number;
  errors: number;
  errorRate: number;
  samples: number;
  serverTiming: Map<string, ReturnType<typeof computeStats>>;
}

function overheadStr(hubVal: number, baseVal: number): string {
  const diff = hubVal - baseVal;
  const pct = baseVal > 0 ? (diff / baseVal) * 100 : 0;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${Math.round(diff)}ms (${sign}${pct.toFixed(1)}%)`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Part 1: Comparison — Hub vs Direct vs OpenRouter');
  console.log('═══════════════════════════════════════════════════════════\n');

  const groups = buildGroups();
  if (groups.length === 0) {
    console.log('No comparison groups available. Check your .env configuration.');
    console.log('Need at least Hub + one direct API key for the same model.');
    process.exit(1);
  }

  const levels = config.comparisonConcurrencyLevels;
  const duration = config.comparisonDuration;
  const payload = PAYLOADS.minimal;

  console.log(`Config: concurrency=[${levels.join(',')}], ${duration / 1000}s per level, minimal payload, streaming\n`);

  // Warmup all targets
  console.log('Warmup phase:');
  for (const group of groups) {
    for (const target of group.targets) {
      await warmup(target);
    }
  }
  console.log();

  const reportData: any[] = [];

  for (const group of groups) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  Model: ${group.model}`);
    console.log(`  Targets: ${group.targets.map((t) => t.name).join(', ')}`);
    console.log(`${'═'.repeat(70)}`);

    const targetNames = group.targets.map((t) => t.name);
    const directName = group.targets.find((t) => t.name.endsWith('-direct'))?.name;
    const hubName = group.targets.find((t) => t.name.startsWith('hub-'))?.name;

    // Store results across concurrency levels for scaling summary
    const allLevelResults = new Map<number, Map<string, TargetResult>>();

    for (const concurrency of levels) {
      console.log(`\n┌─ Concurrency: ${concurrency} ${'─'.repeat(Math.max(0, 52 - String(concurrency).length))}┐`);

      const levelResults = new Map<string, TargetResult>();

      for (const target of group.targets) {
        process.stdout.write(`  Running ${target.name} (c=${concurrency}, ${duration / 1000}s)...`);

        const results = await runConcurrent(target, concurrency, duration, {
          messages: [...payload.messages],
          maxTokens: payload.maxTokens,
        });

        const successful = results.filter((r) => !r.error);
        const errors = results.filter((r) => r.error);

        const stats: TargetResult = {
          ttfb: computeStats(successful.map((r) => r.ttfb)),
          total: computeStats(successful.map((r) => r.totalTime)),
          streaming: computeStats(successful.map((r) => r.streamingTime)),
          rps: results.length / (duration / 1000),
          errors: errors.length,
          errorRate: results.length > 0 ? (errors.length / results.length) * 100 : 0,
          samples: successful.length,
          serverTiming: aggregateServerTimings(successful),
        };

        levelResults.set(target.name, stats);
        console.log(` ${successful.length} ok, ${errors.length} err, ${stats.rps.toFixed(1)} rps`);
      }

      allLevelResults.set(concurrency, levelResults);

      // Print comparison table for this concurrency level
      const hasOverhead = !!(directName && hubName);
      const headers = ['Metric', ...targetNames, ...(hasOverhead ? ['Hub Overhead'] : [])];
      const rows: string[][] = [];

      const directStats = directName ? levelResults.get(directName) : undefined;
      const hubStats = hubName ? levelResults.get(hubName) : undefined;

      rows.push(['RPS', ...targetNames.map((n) => levelResults.get(n)!.rps.toFixed(1)), ...(hasOverhead ? [''] : [])]);
      rows.push([
        'TTFB p50',
        ...targetNames.map((n) => fmt(levelResults.get(n)!.ttfb.p50)),
        ...(directStats && hubStats ? [overheadStr(hubStats.ttfb.p50, directStats.ttfb.p50)] : hasOverhead ? [''] : []),
      ]);
      rows.push([
        'TTFB p90',
        ...targetNames.map((n) => fmt(levelResults.get(n)!.ttfb.p90)),
        ...(directStats && hubStats ? [overheadStr(hubStats.ttfb.p90, directStats.ttfb.p90)] : hasOverhead ? [''] : []),
      ]);
      rows.push([
        'TTFB p99',
        ...targetNames.map((n) => fmt(levelResults.get(n)!.ttfb.p99)),
        ...(directStats && hubStats ? [overheadStr(hubStats.ttfb.p99, directStats.ttfb.p99)] : hasOverhead ? [''] : []),
      ]);
      rows.push([
        'Total p50',
        ...targetNames.map((n) => fmt(levelResults.get(n)!.total.p50)),
        ...(directStats && hubStats
          ? [overheadStr(hubStats.total.p50, directStats.total.p50)]
          : hasOverhead
            ? ['']
            : []),
      ]);
      rows.push([
        'Errors',
        ...targetNames.map((n) => String(levelResults.get(n)!.errors)),
        ...(hasOverhead ? [''] : []),
      ]);
      rows.push([
        'Samples',
        ...targetNames.map((n) => String(levelResults.get(n)!.samples)),
        ...(hasOverhead ? [''] : []),
      ]);

      printTable(headers, rows);

      // Summary line
      if (directStats && hubStats) {
        const ratio = hubStats.ttfb.p50 / directStats.ttfb.p50;
        console.log(`  → Hub is ${ratio.toFixed(2)}x vs direct in TTFB p50`);
      } else if (hubStats) {
        // No direct baseline, compare with first non-hub target
        const baselineName = targetNames.find((n) => n !== hubName);
        const baselineStats = baselineName ? levelResults.get(baselineName) : undefined;
        if (baselineStats) {
          const ratio = hubStats.ttfb.p50 / baselineStats.ttfb.p50;
          console.log(`  → Hub is ${ratio.toFixed(2)}x vs ${baselineName} in TTFB p50`);
        }
      }

      // Server-Timing for Hub target
      if (hubName) {
        const hubResults = levelResults.get(hubName)!;
        if (hubResults.serverTiming.size > 0) {
          const totalSt = hubResults.serverTiming.get('total');
          if (totalSt) {
            const preChecks = hubResults.serverTiming.get('preChecks');
            const getCreds = hubResults.serverTiming.get('getCredentials');
            const session = hubResults.serverTiming.get('session');
            const provTtfb = hubResults.serverTiming.get('providerTtfb');
            const parts = [
              preChecks && `preChecks=${fmt(preChecks.p50)}`,
              getCreds && `getCreds=${fmt(getCreds.p50)}`,
              session && `session=${fmt(session.p50)}`,
              provTtfb && `providerTtfb=${fmt(provTtfb.p50)}`,
            ].filter(Boolean);
            console.log(`  → Hub breakdown (p50): ${parts.join(', ')}`);
          }
        }
      }
    }

    // ── Overhead Scaling Summary ──────────────────────────────────────
    const baselineName = directName || targetNames.find((n) => n !== hubName);
    if (hubName && baselineName && levels.length > 1) {
      console.log(
        `\n┌─ Overhead Scaling: ${hubName} vs ${baselineName} ${'─'.repeat(Math.max(0, 35 - hubName.length - baselineName.length))}┐`
      );

      const scaleHeaders = [
        'Concurrency',
        `${baselineName} TTFB p50`,
        `${hubName} TTFB p50`,
        'Overhead',
        'Hub/Base Ratio',
      ];
      const scaleRows: string[][] = [];
      const hubTtfbSeries: number[] = [];
      const baseTtfbSeries: number[] = [];

      for (const level of levels) {
        const lr = allLevelResults.get(level)!;
        const hubS = lr.get(hubName)!;
        const baseS = lr.get(baselineName)!;

        hubTtfbSeries.push(Math.round(hubS.ttfb.p50));
        baseTtfbSeries.push(Math.round(baseS.ttfb.p50));

        scaleRows.push([
          String(level),
          fmt(baseS.ttfb.p50),
          fmt(hubS.ttfb.p50),
          overheadStr(hubS.ttfb.p50, baseS.ttfb.p50),
          `${(hubS.ttfb.p50 / baseS.ttfb.p50).toFixed(2)}x`,
        ]);
      }

      printTable(scaleHeaders, scaleRows);

      // ASCII chart: Hub vs Baseline TTFB scaling
      if (levels.length > 1) {
        const TARGET_WIDTH = 70;
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

        console.log(`\nTTFB p50 Scaling (${hubName} vs ${baselineName}):`);
        console.log(
          asciichart.plot([interpolate(hubTtfbSeries), interpolate(baseTtfbSeries)], {
            height: 12,
            padding: chartPadding,
            colors: [asciichart.red, asciichart.green],
            format: (x: number) => {
              const s = String(Math.round(x));
              return s.length >= 7 ? s : ' '.repeat(7 - s.length) + s;
            },
          })
        );
        console.log(xAxisLabels());
        console.log(`${chartPadding}  Red = ${hubName}, Green = ${baselineName}`);
      }
    }

    // Collect report data
    const groupReport: any = {
      model: group.model,
      levels: levels.map((level) => {
        const lr = allLevelResults.get(level)!;
        const targets: any = {};
        for (const [name, stats] of lr) {
          targets[name] = {
            ttfb: stats.ttfb,
            total: stats.total,
            streaming: stats.streaming,
            rps: stats.rps,
            errors: stats.errors,
            errorRate: stats.errorRate,
            samples: stats.samples,
            serverTiming: Object.fromEntries(stats.serverTiming),
          };
        }
        return { concurrency: level, targets };
      }),
    };
    reportData.push(groupReport);
  }

  saveReport('comparison', reportData);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
