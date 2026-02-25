import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────────────────────

interface MetricsResult {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  stddev: number;
  cv: number;
  samples: number;
}

interface ComparisonTarget {
  ttfb: MetricsResult;
  total: MetricsResult;
  rps: number;
  errors: number;
  errorRate: number;
  samples: number;
  serverTiming: Record<string, MetricsResult>;
  hubOverhead?: MetricsResult;
}

interface ComparisonLevel {
  concurrency: number;
  targets: Record<string, ComparisonTarget>;
}

interface ComparisonGroup {
  model: string;
  levels: ComparisonLevel[];
}

interface ComparisonReport {
  timestamp: string;
  type: 'comparison';
  config: Record<string, any>;
  results: ComparisonGroup[];
}

interface IsolationLevel {
  concurrency: number;
  totalRequests: number;
  rps: number;
  ttfb: MetricsResult;
  totalTime: MetricsResult;
  errors: number;
  errorRate: number;
  serverTiming: Record<string, MetricsResult>;
}

interface IsolationReport {
  timestamp: string;
  type: 'isolation';
  config: Record<string, any>;
  results: IsolationLevel[];
}

// ── File discovery ─────────────────────────────────────────────────────

const resultsDir = join(import.meta.dirname, '..', 'results');

function findLatest(prefix: string): string | null {
  const files = readdirSync(resultsDir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  if (files.length === 0) return null;

  // Sort by the timestamp field inside each JSON (most reliable)
  files.sort((a, b) => {
    const tsA = JSON.parse(readFileSync(join(resultsDir, a), 'utf-8')).timestamp ?? '';
    const tsB = JSON.parse(readFileSync(join(resultsDir, b), 'utf-8')).timestamp ?? '';
    return tsA < tsB ? -1 : tsA > tsB ? 1 : 0;
  });
  return files[files.length - 1];
}

// ── HTML helpers ───────────────────────────────────────────────────────

function ms(v: number): string {
  return `${Math.round(v)}ms`;
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function diffClass(hubVal: number, baseVal: number): string {
  const diff = hubVal - baseVal;
  if (Math.abs(diff) < 1) return 'text-slate-400';
  return diff > 0 ? 'text-red-500' : 'text-green-500';
}

function diffStr(hubVal: number, baseVal: number): string {
  const diff = hubVal - baseVal;
  const pctVal = baseVal > 0 ? (diff / baseVal) * 100 : 0;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${Math.round(diff)}ms (${sign}${pctVal.toFixed(1)}%)`;
}

function barHtml(value: number, max: number, color: string): string {
  const widthPct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return `<div class="h-5 rounded ${color}" style="width: ${widthPct.toFixed(1)}%"></div>`;
}

function phaseBarHtml(phases: { name: string; value: number; color: string }[], total: number): string {
  if (total <= 0) return '';
  const segments = phases
    .filter((p) => p.value > 0)
    .map((p) => {
      const w = ((p.value / total) * 100).toFixed(1);
      return `<div class="${p.color} h-full" style="width: ${w}%" title="${p.name}: ${ms(p.value)} (${pct((p.value / total) * 100)})"></div>`;
    })
    .join('');
  return `<div class="flex h-5 rounded overflow-hidden bg-slate-700">${segments}</div>`;
}

// ── Chart helpers ───────────────────────────────────────────────────────

let chartCounter = 0;

/** Get hub overhead: prefer hubOverhead.p50, fall back to serverTiming total - providerTtfb */
function getOverhead(target: ComparisonTarget): number | null {
  if (target.hubOverhead?.p50 != null) return Math.round(target.hubOverhead.p50);
  const total = target.serverTiming?.total?.p50;
  const provider = target.serverTiming?.providerTtfb?.p50;
  if (total != null && provider != null) return Math.round(total - provider);
  return null;
}

function renderComparisonCharts(group: ComparisonGroup): string {
  const levels = group.levels;
  const sampleLevel = levels[0];
  const targetNames = Object.keys(sampleLevel.targets);
  const directName = targetNames.find((n) => n.endsWith('-direct'));
  const hubName = targetNames.find((n) => n.startsWith('hub-'));

  if (!hubName) return '';

  const chartId = `comp-chart-${++chartCounter}`;
  const labels = JSON.stringify(levels.map((l) => l.concurrency));

  const hubTtfb = JSON.stringify(levels.map((l) => l.targets[hubName]?.ttfb.p50 ?? null));
  const hubTtfb90 = JSON.stringify(levels.map((l) => l.targets[hubName]?.ttfb.p90 ?? null));
  const hubTotal = JSON.stringify(levels.map((l) => l.targets[hubName]?.total.p50 ?? null));
  const hubRps = JSON.stringify(levels.map((l) => l.targets[hubName]?.rps ?? null));

  const directTtfb = directName ? JSON.stringify(levels.map((l) => l.targets[directName]?.ttfb.p50 ?? null)) : 'null';
  const directTtfb90 = directName ? JSON.stringify(levels.map((l) => l.targets[directName]?.ttfb.p90 ?? null)) : 'null';
  const directTotal = directName ? JSON.stringify(levels.map((l) => l.targets[directName]?.total.p50 ?? null)) : 'null';
  const directRps = directName ? JSON.stringify(levels.map((l) => l.targets[directName]?.rps ?? null)) : 'null';

  const hubOverhead = JSON.stringify(
    levels.map((l) => {
      const t = l.targets[hubName];
      return t ? getOverhead(t) : null;
    })
  );

  const directDatasets = directName
    ? `
      { label: '${directName} TTFB p50', data: ${directTtfb}, borderColor: '#3b82f6', backgroundColor: '#3b82f680', borderWidth: 2, tension: 0.3, pointRadius: 4 },
      { label: '${directName} TTFB p90', data: ${directTtfb90}, borderColor: '#3b82f6', borderDash: [5,3], borderWidth: 1.5, tension: 0.3, pointRadius: 3 },
    `
    : '';

  const directTotalDs = directName
    ? `{ label: '${directName} Total p50', data: ${directTotal}, borderColor: '#3b82f6', backgroundColor: '#3b82f680', borderWidth: 2, tension: 0.3, pointRadius: 4 },`
    : '';

  const directRpsDs = directName
    ? `{ label: '${directName}', data: ${directRps}, borderColor: '#3b82f6', backgroundColor: '#3b82f680', borderWidth: 2, tension: 0.3, pointRadius: 4 },`
    : '';

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">TTFB vs Concurrency</h4>
        <canvas id="${chartId}-ttfb" height="220"></canvas>
      </div>
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">Total Latency vs Concurrency</h4>
        <canvas id="${chartId}-total" height="220"></canvas>
      </div>
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">RPS vs Concurrency</h4>
        <canvas id="${chartId}-rps" height="220"></canvas>
      </div>
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">Hub Overhead vs Concurrency</h4>
        <canvas id="${chartId}-overhead" height="220"></canvas>
      </div>
    </div>
    <script>
    (function() {
      const labels = ${labels};
      const gridColor = 'rgba(148,163,184,0.1)';
      const tickColor = '#94a3b8';
      const commonOpts = (yTitle) => ({
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: tickColor, boxWidth: 12, padding: 10 } } },
        scales: {
          x: { title: { display: true, text: 'Concurrency', color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor } },
          y: { title: { display: true, text: yTitle, color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      });

      new Chart(document.getElementById('${chartId}-ttfb'), {
        type: 'line', data: { labels, datasets: [
          { label: '${hubName} TTFB p50', data: ${hubTtfb}, borderColor: '#34d399', backgroundColor: '#34d39980', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          { label: '${hubName} TTFB p90', data: ${hubTtfb90}, borderColor: '#34d399', borderDash: [5,3], borderWidth: 1.5, tension: 0.3, pointRadius: 3 },
          ${directDatasets}
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-total'), {
        type: 'line', data: { labels, datasets: [
          { label: '${hubName} Total p50', data: ${hubTotal}, borderColor: '#34d399', backgroundColor: '#34d39980', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          ${directTotalDs}
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-rps'), {
        type: 'line', data: { labels, datasets: [
          { label: '${hubName}', data: ${hubRps}, borderColor: '#34d399', backgroundColor: '#34d39980', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          ${directRpsDs}
        ]}, options: commonOpts('req/s')
      });

      new Chart(document.getElementById('${chartId}-overhead'), {
        type: 'bar', data: { labels, datasets: [
          { label: 'Hub Overhead p50', data: ${hubOverhead}, backgroundColor: '#fbbf2480', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 4 },
        ]}, options: commonOpts('ms')
      });
    })();
    </script>
  `;
}

// ── Section: Comparison ────────────────────────────────────────────────

function renderComparison(data: ComparisonReport): string {
  const sections: string[] = [];

  for (const group of data.results) {
    // Identify target roles
    const sampleLevel = group.levels[0];
    const targetNames = Object.keys(sampleLevel.targets);
    const directName = targetNames.find((n) => n.endsWith('-direct'));
    const hubName = targetNames.find((n) => n.startsWith('hub-'));

    // Pick a representative concurrency level for summary cards
    // Prefer ~40, fall back to middle level, then first
    const PREFERRED_CONC = 40;
    const repLevel =
      group.levels.find((l) => l.concurrency === PREFERRED_CONC) ||
      group.levels[Math.floor(group.levels.length / 2)] ||
      group.levels[0];

    let summaryCards = '';
    if (directName && hubName) {
      const hubRep = repLevel.targets[hubName];
      const directRep = repLevel.targets[directName];

      const ttfbDiff = hubRep.ttfb.p50 - directRep.ttfb.p50;
      const totalDiff = hubRep.total.p50 - directRep.total.p50;
      const overhead = getOverhead(hubRep);

      summaryCards = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="bg-slate-800 rounded-lg p-5">
            <div class="text-sm text-slate-400 mb-1">TTFB p50 Overhead (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-bold ${ttfbDiff > 50 ? 'text-red-400' : 'text-green-400'}">${diffStr(hubRep.ttfb.p50, directRep.ttfb.p50)}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-5">
            <div class="text-sm text-slate-400 mb-1">Total p50 Overhead (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-bold ${totalDiff > 100 ? 'text-red-400' : 'text-green-400'}">${diffStr(hubRep.total.p50, directRep.total.p50)}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-5">
            <div class="text-sm text-slate-400 mb-1">Hub Server Overhead p50 (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-bold text-emerald-400">${overhead !== null ? ms(overhead) : 'N/A'}</div>
          </div>
        </div>`;
    } else if (hubName) {
      // No direct baseline — show Hub-only summary
      const hubRep = repLevel.targets[hubName];
      const overhead = getOverhead(hubRep);
      summaryCards = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="bg-slate-800 rounded-lg p-5">
            <div class="text-sm text-slate-400 mb-1">Hub TTFB p50 (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-bold text-emerald-400">${ms(hubRep.ttfb.p50)}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-5">
            <div class="text-sm text-slate-400 mb-1">Hub RPS (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-bold text-emerald-400">${hubRep.rps.toFixed(1)}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-5">
            <div class="text-sm text-slate-400 mb-1">Hub Server Overhead p50 (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-bold text-emerald-400">${overhead !== null ? ms(overhead) : 'N/A'}</div>
          </div>
        </div>`;
    }

    // Trend charts
    const trendCharts = renderComparisonCharts(group);

    // Per-concurrency table
    const hasVsDirect = !!(directName && hubName);
    const maxTtfb = Math.max(...group.levels.flatMap((l) => targetNames.map((n) => l.targets[n]?.ttfb.p50 ?? 0)));

    let tableRows = '';
    for (const level of group.levels) {
      const rowCells: string[] = [`<td class="px-4 py-3 font-medium">${level.concurrency}</td>`];

      for (const name of targetNames) {
        const t = level.targets[name];
        if (!t) {
          rowCells.push('<td colspan="5" class="px-4 py-3 text-slate-500">—</td>');
          continue;
        }
        rowCells.push(`
          <td class="px-4 py-3">${ms(t.ttfb.p50)}</td>
          <td class="px-4 py-3">${ms(t.ttfb.p90)}</td>
          <td class="px-4 py-3">${ms(t.total.p50)}</td>
          <td class="px-4 py-3">${t.rps.toFixed(1)}</td>
          <td class="px-4 py-3 ${t.errorRate > 0 ? 'text-red-400' : 'text-green-400'}">${pct(t.errorRate)}</td>
        `);
      }

      if (hasVsDirect) {
        const hubT = level.targets[hubName!];
        const directT = level.targets[directName!];
        if (hubT && directT) {
          rowCells.push(`
            <td class="px-4 py-3 ${diffClass(hubT.ttfb.p50, directT.ttfb.p50)} font-medium">${diffStr(hubT.ttfb.p50, directT.ttfb.p50)}</td>
            <td class="px-4 py-3 text-slate-300">${(hubT.ttfb.p50 / directT.ttfb.p50).toFixed(2)}x</td>
          `);
        } else {
          rowCells.push('<td class="px-4 py-3">—</td><td class="px-4 py-3">—</td>');
        }
      }

      // Visual bar
      const barCells = targetNames
        .map((name) => {
          const t = level.targets[name];
          if (!t) return '';
          const color = name.startsWith('hub-') ? 'bg-emerald-500' : 'bg-blue-500';
          return barHtml(t.ttfb.p50, maxTtfb, color);
        })
        .join('');
      rowCells.push(`<td class="px-4 py-3 w-40"><div class="space-y-1">${barCells}</div></td>`);

      tableRows += `<tr class="border-b border-slate-700 hover:bg-slate-800/50">${rowCells.join('')}</tr>`;
    }

    // Build header columns per target
    const targetHeaders = targetNames
      .map((name) => {
        const color = name.startsWith('hub-') ? 'text-emerald-400' : 'text-blue-400';
        return `<th colspan="5" class="px-4 py-3 ${color} text-center border-b border-slate-600">${name}</th>`;
      })
      .join('');
    const subHeaders = targetNames
      .map(
        () => `
        <th class="px-4 py-2 text-xs text-slate-400">TTFB p50</th>
        <th class="px-4 py-2 text-xs text-slate-400">TTFB p90</th>
        <th class="px-4 py-2 text-xs text-slate-400">Total p50</th>
        <th class="px-4 py-2 text-xs text-slate-400">RPS</th>
        <th class="px-4 py-2 text-xs text-slate-400">Err%</th>
      `
      )
      .join('');

    const deltaHeaders = hasVsDirect
      ? '<th colspan="2" class="px-4 py-3 text-slate-300 text-center border-b border-slate-600">Delta</th>'
      : '';
    const deltaSubHeaders = hasVsDirect
      ? '<th class="px-4 py-2 text-xs text-slate-400">TTFB Diff</th><th class="px-4 py-2 text-xs text-slate-400">Ratio</th>'
      : '';

    sections.push(`
      <div class="mb-12">
        <h3 class="text-lg font-semibold text-slate-200 mb-4">Model: ${group.model}</h3>
        ${summaryCards}
        ${trendCharts}
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="border-b border-slate-600">
                <th rowspan="2" class="px-4 py-3 text-slate-300">Conc.</th>
                ${targetHeaders}
                ${deltaHeaders}
                <th rowspan="2" class="px-4 py-3 text-slate-300">TTFB Visual</th>
              </tr>
              <tr class="border-b border-slate-700">
                ${subHeaders}
                ${deltaSubHeaders}
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `);
  }

  return `
    <section class="mb-16">
      <h2 class="text-2xl font-bold text-white mb-2">Hub vs OpenAI Direct</h2>
      <p class="text-slate-400 mb-6">Comparison of AIGNE Hub proxy against direct provider APIs under varying concurrency.</p>
      ${sections.join('')}
    </section>
  `;
}

// ── Section: Isolation ─────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  session: 'bg-violet-500',
  resolveProvider: 'bg-sky-500',
  modelCallCreate: 'bg-cyan-500',
  preChecks: 'bg-teal-500',
  modelSetup: 'bg-amber-500',
  getCredentials: 'bg-orange-500',
  providerTtfb: 'bg-blue-500',
  ttfb: 'bg-indigo-500',
  streaming: 'bg-pink-500',
  usage: 'bg-rose-500',
  modelStatus: 'bg-fuchsia-500',
  total: 'bg-slate-500',
};

const OVERHEAD_PHASES = ['session', 'resolveProvider', 'modelCallCreate', 'preChecks', 'modelSetup', 'getCredentials'];

function renderIsolationCharts(levels: IsolationLevel[]): string {
  const chartId = `iso-chart-${++chartCounter}`;
  const labels = JSON.stringify(levels.map((l) => l.concurrency));

  const rpsData = JSON.stringify(levels.map((l) => l.rps));
  const ttfbP50 = JSON.stringify(levels.map((l) => l.ttfb.p50));
  const ttfbP90 = JSON.stringify(levels.map((l) => l.ttfb.p90));
  const totalP50 = JSON.stringify(levels.map((l) => l.totalTime.p50));
  const overheadData = JSON.stringify(
    levels.map((l) => {
      const total = l.serverTiming.total?.p50 ?? 0;
      const provider = l.serverTiming.providerTtfb?.p50 ?? 0;
      return total > 0 ? Math.round(total - provider) : null;
    })
  );

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">TTFB & Total Latency vs Concurrency</h4>
        <canvas id="${chartId}-latency" height="220"></canvas>
      </div>
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">RPS vs Concurrency</h4>
        <canvas id="${chartId}-rps" height="220"></canvas>
      </div>
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">Hub Overhead vs Concurrency</h4>
        <canvas id="${chartId}-overhead" height="220"></canvas>
      </div>
      <div class="bg-slate-800 rounded-lg p-5">
        <h4 class="text-sm font-medium text-slate-300 mb-3">Error Rate vs Concurrency</h4>
        <canvas id="${chartId}-errors" height="220"></canvas>
      </div>
    </div>
    <script>
    (function() {
      const labels = ${labels};
      const gridColor = 'rgba(148,163,184,0.1)';
      const tickColor = '#94a3b8';
      const commonOpts = (yTitle) => ({
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: tickColor, boxWidth: 12, padding: 10 } } },
        scales: {
          x: { title: { display: true, text: 'Concurrency', color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor } },
          y: { title: { display: true, text: yTitle, color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      });

      new Chart(document.getElementById('${chartId}-latency'), {
        type: 'line', data: { labels, datasets: [
          { label: 'TTFB p50', data: ${ttfbP50}, borderColor: '#34d399', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          { label: 'TTFB p90', data: ${ttfbP90}, borderColor: '#34d399', borderDash: [5,3], borderWidth: 1.5, tension: 0.3, pointRadius: 3 },
          { label: 'Total p50', data: ${totalP50}, borderColor: '#a78bfa', borderWidth: 2, tension: 0.3, pointRadius: 4 },
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-rps'), {
        type: 'line', data: { labels, datasets: [
          { label: 'RPS', data: ${rpsData}, borderColor: '#34d399', borderWidth: 2, tension: 0.3, pointRadius: 4 },
        ]}, options: commonOpts('req/s')
      });

      new Chart(document.getElementById('${chartId}-overhead'), {
        type: 'bar', data: { labels, datasets: [
          { label: 'Hub Overhead p50', data: ${overheadData}, backgroundColor: '#fbbf2480', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 4 },
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-errors'), {
        type: 'line', data: { labels, datasets: [
          { label: 'Error Rate', data: ${JSON.stringify(levels.map((l) => l.errorRate))}, borderColor: '#f87171', borderWidth: 2, tension: 0.3, pointRadius: 4 },
        ]}, options: commonOpts('%')
      });
    })();
    </script>
  `;
}

function renderIsolation(data: IsolationReport): string {
  const levels = data.results;

  // Summary cards
  const peakRps = Math.max(...levels.map((l) => l.rps));
  const peakRpsLevel = levels.find((l) => l.rps === peakRps)!;
  const minOverhead = Math.min(
    ...levels.map((l) => {
      const total = l.serverTiming.total?.p50 ?? 0;
      const provider = l.serverTiming.providerTtfb?.p50 ?? 0;
      return total > 0 ? total - provider : Infinity;
    })
  );
  const maxZeroErrorConc = levels.filter((l) => l.errorRate === 0).reduce((max, l) => Math.max(max, l.concurrency), 0);

  // Main metrics table
  const maxRps = peakRps;
  let metricsRows = '';
  for (const level of levels) {
    metricsRows += `
      <tr class="border-b border-slate-700 hover:bg-slate-800/50">
        <td class="px-4 py-3 font-medium">${level.concurrency}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span>${level.rps.toFixed(1)}</span>
            <div class="flex-1 max-w-[80px]">${barHtml(level.rps, maxRps, 'bg-emerald-500')}</div>
          </div>
        </td>
        <td class="px-4 py-3">${ms(level.ttfb.p50)}</td>
        <td class="px-4 py-3">${ms(level.ttfb.p90)}</td>
        <td class="px-4 py-3">${ms(level.totalTime.p50)}</td>
        <td class="px-4 py-3 ${level.errorRate > 0 ? 'text-red-400' : 'text-green-400'}">${pct(level.errorRate)}</td>
        <td class="px-4 py-3 text-slate-400">${level.totalRequests ?? level.ttfb.samples}</td>
      </tr>`;
  }

  // Server-Timing breakdown table
  const displayPhases = [
    'session',
    'resolveProvider',
    'modelCallCreate',
    'preChecks',
    'modelSetup',
    'getCredentials',
    'providerTtfb',
  ];
  let timingRows = '';
  for (const level of levels) {
    const totalP50 = level.serverTiming.total?.p50 ?? 0;
    const phases = displayPhases
      .filter((p) => level.serverTiming[p])
      .map((p) => ({
        name: p,
        value: level.serverTiming[p].p50,
        color: PHASE_COLORS[p] || 'bg-slate-500',
      }));

    const overheadMs = OVERHEAD_PHASES.reduce((sum, p) => sum + (level.serverTiming[p]?.p50 ?? 0), 0);

    const phaseCells = displayPhases
      .map((p) => {
        const s = level.serverTiming[p];
        if (!s) return '<td class="px-3 py-2 text-slate-600">—</td>';
        const pctOfTotal = totalP50 > 0 ? (s.p50 / totalP50) * 100 : 0;
        return `<td class="px-3 py-2"><span class="text-slate-200">${ms(s.p50)}</span> <span class="text-slate-500 text-xs">${pct(pctOfTotal)}</span></td>`;
      })
      .join('');

    timingRows += `
      <tr class="border-b border-slate-700 hover:bg-slate-800/50">
        <td class="px-3 py-2 font-medium">${level.concurrency}</td>
        ${phaseCells}
        <td class="px-3 py-2 font-medium text-emerald-400">${ms(totalP50)}</td>
        <td class="px-3 py-2 text-amber-400">${ms(overheadMs)}</td>
        <td class="px-3 py-2 w-48">${phaseBarHtml(phases, totalP50)}</td>
      </tr>`;
  }

  const phaseHeaders = displayPhases
    .map((p) => {
      const dotColor = PHASE_COLORS[p]?.replace('bg-', 'text-') || 'text-slate-500';
      return `<th class="px-3 py-2 text-xs text-slate-400"><span class="${dotColor}">●</span> ${p}</th>`;
    })
    .join('');

  return `
    <section class="mb-16">
      <h2 class="text-2xl font-bold text-white mb-2">Hub Internal Performance</h2>
      <p class="text-slate-400 mb-6">Isolation test using a mock provider to measure pure Hub overhead across concurrency levels.</p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="bg-slate-800 rounded-lg p-5">
          <div class="text-sm text-slate-400 mb-1">Peak RPS (c=${peakRpsLevel.concurrency})</div>
          <div class="text-2xl font-bold text-emerald-400">${peakRps.toFixed(1)}</div>
        </div>
        <div class="bg-slate-800 rounded-lg p-5">
          <div class="text-sm text-slate-400 mb-1">Min Hub Overhead (p50)</div>
          <div class="text-2xl font-bold text-emerald-400">${minOverhead === Infinity ? 'N/A' : ms(minOverhead)}</div>
        </div>
        <div class="bg-slate-800 rounded-lg p-5">
          <div class="text-sm text-slate-400 mb-1">Max Concurrency (0% errors)</div>
          <div class="text-2xl font-bold text-emerald-400">${maxZeroErrorConc || 'N/A'}</div>
        </div>
      </div>

      ${renderIsolationCharts(levels)}

      <h3 class="text-lg font-semibold text-slate-200 mb-4">Throughput & Latency</h3>
      <div class="overflow-x-auto mb-10">
        <table class="w-full text-sm text-left">
          <thead>
            <tr class="border-b border-slate-600">
              <th class="px-4 py-3 text-slate-300">Conc.</th>
              <th class="px-4 py-3 text-slate-300">RPS</th>
              <th class="px-4 py-3 text-slate-300">TTFB p50</th>
              <th class="px-4 py-3 text-slate-300">TTFB p90</th>
              <th class="px-4 py-3 text-slate-300">Total p50</th>
              <th class="px-4 py-3 text-slate-300">Err%</th>
              <th class="px-4 py-3 text-slate-300">Samples</th>
            </tr>
          </thead>
          <tbody>${metricsRows}</tbody>
        </table>
      </div>

      <h3 class="text-lg font-semibold text-slate-200 mb-4">Server-Timing Breakdown (p50)</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead>
            <tr class="border-b border-slate-600">
              <th class="px-3 py-2 text-slate-300">Conc.</th>
              ${phaseHeaders}
              <th class="px-3 py-2 text-slate-300">Total</th>
              <th class="px-3 py-2 text-slate-300">Overhead</th>
              <th class="px-3 py-2 text-slate-300">Phase Distribution</th>
            </tr>
          </thead>
          <tbody>${timingRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const compFile = findLatest('comparison-');
  const isoFile = findLatest('isolation-');

  if (!compFile && !isoFile) {
    console.error('No benchmark results found in benchmarks/results/');
    console.error('Run `npm run comparison` and/or `npm run isolation` first.');
    process.exit(1);
  }

  let compSection = '';
  let isoSection = '';
  let compTimestamp = '';
  let isoTimestamp = '';

  if (compFile) {
    const data: ComparisonReport = JSON.parse(readFileSync(join(resultsDir, compFile), 'utf-8'));
    compSection = renderComparison(data);
    compTimestamp = data.timestamp;
    console.log(`Comparison data: ${compFile}`);
  }

  if (isoFile) {
    const data: IsolationReport = JSON.parse(readFileSync(join(resultsDir, isoFile), 'utf-8'));
    isoSection = renderIsolation(data);
    isoTimestamp = data.timestamp;
    console.log(`Isolation data: ${isoFile}`);
  }

  const timestamp = compTimestamp || isoTimestamp;
  const dateStr = timestamp
    ? new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown';

  const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIGNE Hub — Benchmark Report</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    @media print { body { background: white; color: black; } }
  </style>
</head>
<body class="bg-slate-900 text-slate-300 min-h-screen">
  <div class="max-w-7xl mx-auto px-6 py-10">
    <header class="mb-12">
      <h1 class="text-3xl font-bold text-white mb-2">AIGNE Hub Benchmark Report</h1>
      <p class="text-slate-400">Generated ${dateStr}</p>
    </header>

    ${compSection}
    ${isoSection}

    <footer class="border-t border-slate-700 pt-6 mt-12 text-sm text-slate-500">
      <p>Report generated by <code>benchmarks/src/report.ts</code></p>
      ${compFile ? `<p>Comparison: <code>${compFile}</code></p>` : ''}
      ${isoFile ? `<p>Isolation: <code>${isoFile}</code></p>` : ''}
    </footer>
  </div>
</body>
</html>`;

  const outPath = join(resultsDir, 'report.html');
  writeFileSync(outPath, html);
  console.log(`\nReport written to: results/report.html`);
}

main();
