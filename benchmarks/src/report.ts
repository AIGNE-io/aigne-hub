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
  return diff > 0 ? 'text-red-600' : 'text-emerald-600';
}

function diffStr(hubVal: number, baseVal: number): string {
  const diff = hubVal - baseVal;
  const pctVal = baseVal > 0 ? (diff / baseVal) * 100 : 0;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${Math.round(diff)}ms (${sign}${pctVal.toFixed(1)}%)`;
}

function barHtml(value: number, max: number, color: string): string {
  const widthPct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return `<div class="h-5 rounded-sm ${color}" style="width: ${widthPct.toFixed(1)}%"></div>`;
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
  return `<div class="flex h-5 rounded-sm overflow-hidden bg-slate-100">${segments}</div>`;
}

// ── Chart helpers ───────────────────────────────────────────────────────

let chartCounter = 0;

/** Chart.js color constants for light theme */
const CHART_GRID = 'rgba(0,0,0,0.06)';
const CHART_TICK = '#64748b';

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
      { label: '${directName} TTFB p50', data: ${directTtfb}, borderColor: '#3b82f6', backgroundColor: '#3b82f620', borderWidth: 2, tension: 0.3, pointRadius: 4 },
      { label: '${directName} TTFB p90', data: ${directTtfb90}, borderColor: '#93bbfd', borderDash: [5,3], borderWidth: 1.5, tension: 0.3, pointRadius: 3 },
    `
    : '';

  const directTotalDs = directName
    ? `{ label: '${directName} Total p50', data: ${directTotal}, borderColor: '#3b82f6', backgroundColor: '#3b82f620', borderWidth: 2, tension: 0.3, pointRadius: 4 },`
    : '';

  const directRpsDs = directName
    ? `{ label: '${directName}', data: ${directRps}, borderColor: '#3b82f6', backgroundColor: '#3b82f620', borderWidth: 2, tension: 0.3, pointRadius: 4 },`
    : '';

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
      <div class="card">
        <h4 class="chart-title">TTFB vs Concurrency</h4>
        <canvas id="${chartId}-ttfb" height="220"></canvas>
      </div>
      <div class="card">
        <h4 class="chart-title">Total Latency vs Concurrency</h4>
        <canvas id="${chartId}-total" height="220"></canvas>
      </div>
      <div class="card">
        <h4 class="chart-title">RPS vs Concurrency</h4>
        <canvas id="${chartId}-rps" height="220"></canvas>
      </div>
      <div class="card">
        <h4 class="chart-title">Hub Overhead vs Concurrency</h4>
        <canvas id="${chartId}-overhead" height="220"></canvas>
      </div>
    </div>
    <script>
    (function() {
      const labels = ${labels};
      const gridColor = '${CHART_GRID}';
      const tickColor = '${CHART_TICK}';
      const commonOpts = (yTitle) => ({
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: tickColor, boxWidth: 12, padding: 10, font: { size: 12 } } } },
        scales: {
          x: { title: { display: true, text: 'Concurrency', color: tickColor, font: { size: 12 } }, ticks: { color: tickColor }, grid: { color: gridColor } },
          y: { title: { display: true, text: yTitle, color: tickColor, font: { size: 12 } }, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      });

      new Chart(document.getElementById('${chartId}-ttfb'), {
        type: 'line', data: { labels, datasets: [
          { label: '${hubName} TTFB p50', data: ${hubTtfb}, borderColor: '#10b981', backgroundColor: '#10b98120', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          { label: '${hubName} TTFB p90', data: ${hubTtfb90}, borderColor: '#6ee7b7', borderDash: [5,3], borderWidth: 1.5, tension: 0.3, pointRadius: 3 },
          ${directDatasets}
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-total'), {
        type: 'line', data: { labels, datasets: [
          { label: '${hubName} Total p50', data: ${hubTotal}, borderColor: '#10b981', backgroundColor: '#10b98120', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          ${directTotalDs}
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-rps'), {
        type: 'line', data: { labels, datasets: [
          { label: '${hubName}', data: ${hubRps}, borderColor: '#10b981', backgroundColor: '#10b98120', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          ${directRpsDs}
        ]}, options: commonOpts('req/s')
      });

      new Chart(document.getElementById('${chartId}-overhead'), {
        type: 'bar', data: { labels, datasets: [
          { label: 'Hub Overhead p50', data: ${hubOverhead}, backgroundColor: '#f59e0b30', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4 },
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
          <div class="metric-card">
            <div class="metric-label">TTFB p50 Overhead (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-semibold tracking-tight ${ttfbDiff > 50 ? 'text-red-600' : 'text-emerald-600'}">${diffStr(hubRep.ttfb.p50, directRep.ttfb.p50)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Total p50 Overhead (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-semibold tracking-tight ${totalDiff > 100 ? 'text-red-600' : 'text-emerald-600'}">${diffStr(hubRep.total.p50, directRep.total.p50)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Hub Server Overhead p50 (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-semibold tracking-tight text-emerald-600">${overhead !== null ? ms(overhead) : 'N/A'}</div>
          </div>
        </div>`;
    } else if (hubName) {
      const hubRep = repLevel.targets[hubName];
      const overhead = getOverhead(hubRep);
      summaryCards = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="metric-card">
            <div class="metric-label">Hub TTFB p50 (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-semibold tracking-tight text-emerald-600">${ms(hubRep.ttfb.p50)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Hub RPS (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-semibold tracking-tight text-emerald-600">${hubRep.rps.toFixed(1)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Hub Server Overhead p50 (c=${repLevel.concurrency})</div>
            <div class="text-2xl font-semibold tracking-tight text-emerald-600">${overhead !== null ? ms(overhead) : 'N/A'}</div>
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
      const rowCells: string[] = [`<td class="px-4 py-3 font-medium text-slate-900">${level.concurrency}</td>`];

      for (const name of targetNames) {
        const t = level.targets[name];
        if (!t) {
          rowCells.push('<td colspan="5" class="px-4 py-3 text-slate-300">—</td>');
          continue;
        }
        rowCells.push(`
          <td class="px-4 py-3">${ms(t.ttfb.p50)}</td>
          <td class="px-4 py-3 text-slate-500">${ms(t.ttfb.p90)}</td>
          <td class="px-4 py-3">${ms(t.total.p50)}</td>
          <td class="px-4 py-3">${t.rps.toFixed(1)}</td>
          <td class="px-4 py-3 ${t.errorRate > 0 ? 'text-red-600' : 'text-emerald-600'}">${pct(t.errorRate)}</td>
        `);
      }

      if (hasVsDirect) {
        const hubT = level.targets[hubName!];
        const directT = level.targets[directName!];
        if (hubT && directT) {
          rowCells.push(`
            <td class="px-4 py-3 ${diffClass(hubT.ttfb.p50, directT.ttfb.p50)} font-medium">${diffStr(hubT.ttfb.p50, directT.ttfb.p50)}</td>
            <td class="px-4 py-3 text-slate-500">${(hubT.ttfb.p50 / directT.ttfb.p50).toFixed(2)}x</td>
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

      tableRows += `<tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">${rowCells.join('')}</tr>`;
    }

    // Build header columns per target
    const targetHeaders = targetNames
      .map((name) => {
        const color = name.startsWith('hub-') ? 'text-emerald-700' : 'text-blue-700';
        return `<th colspan="5" class="px-4 py-3 ${color} text-center font-semibold border-b border-slate-200">${name}</th>`;
      })
      .join('');
    const subHeaders = targetNames
      .map(
        () => `
        <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">TTFB p50</th>
        <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">TTFB p90</th>
        <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Total p50</th>
        <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">RPS</th>
        <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Err%</th>
      `
      )
      .join('');

    const deltaHeaders = hasVsDirect
      ? '<th colspan="2" class="px-4 py-3 text-slate-700 text-center font-semibold border-b border-slate-200">Delta</th>'
      : '';
    const deltaSubHeaders = hasVsDirect
      ? '<th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">TTFB Diff</th><th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Ratio</th>'
      : '';

    // Server-Timing breakdown table for hub targets
    let timingSection = '';
    if (hubName) {
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
      for (const level of group.levels) {
        const hubT = level.targets[hubName];
        if (!hubT?.serverTiming) continue;

        const totalP50 = hubT.serverTiming.total?.p50 ?? 0;
        const phases = displayPhases
          .filter((p) => hubT.serverTiming[p])
          .map((p) => ({
            name: p,
            value: hubT.serverTiming[p].p50,
            color: PHASE_COLORS[p] || 'bg-slate-400',
          }));

        const overheadMs = OVERHEAD_PHASES.reduce((sum, p) => sum + (hubT.serverTiming[p]?.p50 ?? 0), 0);

        const phaseCells = displayPhases
          .map((p) => {
            const s = hubT.serverTiming[p];
            if (!s) return '<td class="px-3 py-2.5 text-slate-300">—</td>';
            const pctOfTotal = totalP50 > 0 ? (s.p50 / totalP50) * 100 : 0;
            return `<td class="px-3 py-2.5"><span class="text-slate-800 font-medium">${ms(s.p50)}</span> <span class="text-slate-400 text-xs">${pct(pctOfTotal)}</span></td>`;
          })
          .join('');

        timingRows += `
          <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
            <td class="px-3 py-2.5 font-medium text-slate-900">${level.concurrency}</td>
            ${phaseCells}
            <td class="px-3 py-2.5 font-semibold text-emerald-700">${ms(totalP50)}</td>
            <td class="px-3 py-2.5 font-semibold text-amber-600">${ms(overheadMs)}</td>
            <td class="px-3 py-2.5 w-48">${phaseBarHtml(phases, totalP50)}</td>
          </tr>`;
      }

      const phaseHeaders = displayPhases
        .map((p) => {
          const dotColor = PHASE_DOT_COLORS[p] || 'text-slate-400';
          return `<th class="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider"><span class="${dotColor} text-sm">●</span> ${p}</th>`;
        })
        .join('');

      // Stacked bar chart for server timing phases
      const timingChartId = `comp-timing-${++chartCounter}`;
      const timingLabels = JSON.stringify(group.levels.map((l) => l.concurrency));
      const phaseDatasets = displayPhases
        .map((p) => {
          const data = JSON.stringify(
            group.levels.map((l) => {
              const hubT = l.targets[hubName!];
              return hubT?.serverTiming?.[p]?.p50 != null ? Math.round(hubT.serverTiming[p].p50) : null;
            })
          );
          const color =
            {
              session: '#8b5cf6',
              resolveProvider: '#0ea5e9',
              modelCallCreate: '#06b6d4',
              preChecks: '#14b8a6',
              modelSetup: '#f59e0b',
              getCredentials: '#f97316',
              providerTtfb: '#3b82f6',
            }[p] || '#94a3b8';
          return `{ label: '${p}', data: ${data}, backgroundColor: '${color}cc', borderRadius: 2 }`;
        })
        .join(',\n          ');

      timingSection = `
        <h3 class="section-title mt-12">Server-Timing Breakdown — ${hubName} (p50)</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
          <div class="card">
            <h4 class="chart-title">Phase Breakdown vs Concurrency (stacked)</h4>
            <canvas id="${timingChartId}-stacked" height="260"></canvas>
          </div>
          <div class="card">
            <h4 class="chart-title">Hub Overhead vs Provider TTFB</h4>
            <canvas id="${timingChartId}-split" height="260"></canvas>
          </div>
        </div>
        <script>
        (function() {
          const labels = ${timingLabels};
          const gridColor = '${CHART_GRID}';
          const tickColor = '${CHART_TICK}';

          new Chart(document.getElementById('${timingChartId}-stacked'), {
            type: 'bar', data: { labels, datasets: [
              ${phaseDatasets}
            ]}, options: {
              responsive: true,
              plugins: { legend: { labels: { color: tickColor, boxWidth: 12, padding: 8, font: { size: 11 } } } },
              scales: {
                x: { stacked: true, title: { display: true, text: 'Concurrency', color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor } },
                y: { stacked: true, title: { display: true, text: 'ms', color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
              }
            }
          });

          const overheadData = ${JSON.stringify(
            group.levels.map((l) => {
              const hubT = l.targets[hubName!];
              if (!hubT?.serverTiming) return null;
              return Math.round(OVERHEAD_PHASES.reduce((sum, p) => sum + (hubT.serverTiming[p]?.p50 ?? 0), 0));
            })
          )};
          const providerData = ${JSON.stringify(
            group.levels.map((l) => {
              const hubT = l.targets[hubName!];
              return hubT?.serverTiming?.providerTtfb?.p50 != null
                ? Math.round(hubT.serverTiming.providerTtfb.p50)
                : null;
            })
          )};

          new Chart(document.getElementById('${timingChartId}-split'), {
            type: 'bar', data: { labels, datasets: [
              { label: 'Hub Overhead', data: overheadData, backgroundColor: '#f59e0b50', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4 },
              { label: 'Provider TTFB', data: providerData, backgroundColor: '#3b82f650', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 },
            ]}, options: {
              responsive: true,
              plugins: { legend: { labels: { color: tickColor, boxWidth: 12, padding: 8, font: { size: 11 } } } },
              scales: {
                x: { stacked: true, title: { display: true, text: 'Concurrency', color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor } },
                y: { stacked: true, title: { display: true, text: 'ms', color: tickColor }, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
              }
            }
          });
        })();
        </script>

        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr class="border-b border-slate-200">
                <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Conc.</th>
                ${phaseHeaders}
                <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Total</th>
                <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Overhead</th>
                <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Phase Distribution</th>
              </tr>
            </thead>
            <tbody>${timingRows}</tbody>
          </table>
        </div>`;
    }

    sections.push(`
      <div class="mb-12">
        <h3 class="section-title">Model: ${group.model}</h3>
        ${summaryCards}
        ${trendCharts}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr class="border-b border-slate-200">
                <th rowspan="2" class="px-4 py-3 text-slate-700 font-semibold text-left">Conc.</th>
                ${targetHeaders}
                ${deltaHeaders}
                <th rowspan="2" class="px-4 py-3 text-slate-700 font-semibold text-left">TTFB Visual</th>
              </tr>
              <tr class="border-b border-slate-200 bg-slate-50/50">
                ${subHeaders}
                ${deltaSubHeaders}
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        ${timingSection}
      </div>
    `);
  }

  return `
    <section class="mb-16">
      <h2 class="text-2xl font-bold text-slate-900 tracking-tight mb-1">Hub vs OpenAI Direct</h2>
      <p class="text-slate-500 mb-8">Comparison of AIGNE Hub proxy against direct provider APIs under varying concurrency.</p>
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
  total: 'bg-slate-400',
};

const PHASE_DOT_COLORS: Record<string, string> = {
  session: 'text-violet-500',
  resolveProvider: 'text-sky-500',
  modelCallCreate: 'text-cyan-500',
  preChecks: 'text-teal-500',
  modelSetup: 'text-amber-500',
  getCredentials: 'text-orange-500',
  providerTtfb: 'text-blue-500',
  ttfb: 'text-indigo-500',
  streaming: 'text-pink-500',
  usage: 'text-rose-500',
  modelStatus: 'text-fuchsia-500',
  total: 'text-slate-400',
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
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
      <div class="card">
        <h4 class="chart-title">TTFB & Total Latency vs Concurrency</h4>
        <canvas id="${chartId}-latency" height="220"></canvas>
      </div>
      <div class="card">
        <h4 class="chart-title">RPS vs Concurrency</h4>
        <canvas id="${chartId}-rps" height="220"></canvas>
      </div>
      <div class="card">
        <h4 class="chart-title">Hub Overhead vs Concurrency</h4>
        <canvas id="${chartId}-overhead" height="220"></canvas>
      </div>
      <div class="card">
        <h4 class="chart-title">Error Rate vs Concurrency</h4>
        <canvas id="${chartId}-errors" height="220"></canvas>
      </div>
    </div>
    <script>
    (function() {
      const labels = ${labels};
      const gridColor = '${CHART_GRID}';
      const tickColor = '${CHART_TICK}';
      const commonOpts = (yTitle) => ({
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: tickColor, boxWidth: 12, padding: 10, font: { size: 12 } } } },
        scales: {
          x: { title: { display: true, text: 'Concurrency', color: tickColor, font: { size: 12 } }, ticks: { color: tickColor }, grid: { color: gridColor } },
          y: { title: { display: true, text: yTitle, color: tickColor, font: { size: 12 } }, ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      });

      new Chart(document.getElementById('${chartId}-latency'), {
        type: 'line', data: { labels, datasets: [
          { label: 'TTFB p50', data: ${ttfbP50}, borderColor: '#10b981', borderWidth: 2, tension: 0.3, pointRadius: 4 },
          { label: 'TTFB p90', data: ${ttfbP90}, borderColor: '#6ee7b7', borderDash: [5,3], borderWidth: 1.5, tension: 0.3, pointRadius: 3 },
          { label: 'Total p50', data: ${totalP50}, borderColor: '#8b5cf6', borderWidth: 2, tension: 0.3, pointRadius: 4 },
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-rps'), {
        type: 'line', data: { labels, datasets: [
          { label: 'RPS', data: ${rpsData}, borderColor: '#10b981', borderWidth: 2, tension: 0.3, pointRadius: 4 },
        ]}, options: commonOpts('req/s')
      });

      new Chart(document.getElementById('${chartId}-overhead'), {
        type: 'bar', data: { labels, datasets: [
          { label: 'Hub Overhead p50', data: ${overheadData}, backgroundColor: '#f59e0b30', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4 },
        ]}, options: commonOpts('ms')
      });

      new Chart(document.getElementById('${chartId}-errors'), {
        type: 'line', data: { labels, datasets: [
          { label: 'Error Rate', data: ${JSON.stringify(levels.map((l) => l.errorRate))}, borderColor: '#ef4444', borderWidth: 2, tension: 0.3, pointRadius: 4 },
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
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="px-4 py-3 font-medium text-slate-900">${level.concurrency}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="font-medium">${level.rps.toFixed(1)}</span>
            <div class="flex-1 max-w-[80px]">${barHtml(level.rps, maxRps, 'bg-emerald-500')}</div>
          </div>
        </td>
        <td class="px-4 py-3">${ms(level.ttfb.p50)}</td>
        <td class="px-4 py-3 text-slate-500">${ms(level.ttfb.p90)}</td>
        <td class="px-4 py-3">${ms(level.totalTime.p50)}</td>
        <td class="px-4 py-3 ${level.errorRate > 0 ? 'text-red-600' : 'text-emerald-600'}">${pct(level.errorRate)}</td>
        <td class="px-4 py-3 text-slate-500">${level.totalRequests ?? level.ttfb.samples}</td>
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
        color: PHASE_COLORS[p] || 'bg-slate-400',
      }));

    const overheadMs = OVERHEAD_PHASES.reduce((sum, p) => sum + (level.serverTiming[p]?.p50 ?? 0), 0);

    const phaseCells = displayPhases
      .map((p) => {
        const s = level.serverTiming[p];
        if (!s) return '<td class="px-3 py-2.5 text-slate-300">—</td>';
        const pctOfTotal = totalP50 > 0 ? (s.p50 / totalP50) * 100 : 0;
        return `<td class="px-3 py-2.5"><span class="text-slate-800 font-medium">${ms(s.p50)}</span> <span class="text-slate-400 text-xs">${pct(pctOfTotal)}</span></td>`;
      })
      .join('');

    timingRows += `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="px-3 py-2.5 font-medium text-slate-900">${level.concurrency}</td>
        ${phaseCells}
        <td class="px-3 py-2.5 font-semibold text-emerald-700">${ms(totalP50)}</td>
        <td class="px-3 py-2.5 font-semibold text-amber-600">${ms(overheadMs)}</td>
        <td class="px-3 py-2.5 w-48">${phaseBarHtml(phases, totalP50)}</td>
      </tr>`;
  }

  const phaseHeaders = displayPhases
    .map((p) => {
      const dotColor = PHASE_DOT_COLORS[p] || 'text-slate-400';
      return `<th class="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider"><span class="${dotColor} text-sm">●</span> ${p}</th>`;
    })
    .join('');

  return `
    <section class="mb-16">
      <h2 class="text-2xl font-bold text-slate-900 tracking-tight mb-1">Hub Internal Performance</h2>
      <p class="text-slate-500 mb-8">Isolation test using a mock provider to measure pure Hub overhead across concurrency levels.</p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="metric-card">
          <div class="metric-label">Peak RPS (c=${peakRpsLevel.concurrency})</div>
          <div class="text-2xl font-semibold tracking-tight text-emerald-600">${peakRps.toFixed(1)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Min Hub Overhead (p50)</div>
          <div class="text-2xl font-semibold tracking-tight text-emerald-600">${minOverhead === Infinity ? 'N/A' : ms(minOverhead)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Max Concurrency (0% errors)</div>
          <div class="text-2xl font-semibold tracking-tight text-emerald-600">${maxZeroErrorConc || 'N/A'}</div>
        </div>
      </div>

      ${renderIsolationCharts(levels)}

      <h3 class="section-title">Throughput & Latency</h3>
      <div class="overflow-x-auto mb-10">
        <table class="data-table">
          <thead>
            <tr class="border-b border-slate-200">
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">Conc.</th>
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">RPS</th>
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">TTFB p50</th>
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">TTFB p90</th>
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">Total p50</th>
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">Err%</th>
              <th class="px-4 py-3 text-slate-700 font-semibold text-left">Samples</th>
            </tr>
          </thead>
          <tbody>${metricsRows}</tbody>
        </table>
      </div>

      <h3 class="section-title">Server-Timing Breakdown (p50)</h3>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr class="border-b border-slate-200">
              <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Conc.</th>
              ${phaseHeaders}
              <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Total</th>
              <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Overhead</th>
              <th class="px-3 py-2.5 text-slate-700 font-semibold text-left">Phase Distribution</th>
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
  const args = process.argv.slice(2);

  // Support: tsx src/report.ts [compFile] [isoFile]
  // Files can be basenames (looked up in results/) or full/relative paths.
  let compFile: string | null = null;
  let isoFile: string | null = null;

  if (args.length >= 1) {
    for (const arg of args) {
      const basename = arg.includes('/') ? arg.split('/').pop()! : arg;
      if (basename.startsWith('comparison-')) compFile = basename;
      else if (basename.startsWith('isolation-')) isoFile = basename;
      else {
        console.error(`Unknown file type: ${arg} (expected filename starting with "comparison-" or "isolation-")`);
        process.exit(1);
      }
    }
  } else {
    compFile = findLatest('comparison-');
    isoFile = findLatest('isolation-');
  }

  if (!compFile && !isoFile) {
    console.error('No benchmark results found in benchmarks/results/');
    console.error('Run `npm run comparison` and/or `npm run isolation` first.');
    console.error('Or specify files: tsx src/report.ts <comparison-xxx.json> <isolation-xxx.json>');
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIGNE Hub — Benchmark Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid rgba(0,0,0,0.06);
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .metric-card {
      background: white;
      border-radius: 12px;
      padding: 20px 24px;
      border: 1px solid rgba(0,0,0,0.06);
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .metric-label {
      font-size: 0.8125rem;
      color: #64748b;
      margin-bottom: 4px;
      letter-spacing: 0.01em;
    }
    .chart-title {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 16px;
    }
    .data-table {
      width: 100%;
      font-size: 0.8125rem;
      text-align: left;
      border-collapse: collapse;
    }
    .data-table td {
      color: #334155;
    }
    @media print {
      body { background: white; }
      .card, .metric-card { box-shadow: none; border: 1px solid #e2e8f0; }
    }
  </style>
</head>
<body class="bg-[#f8f9fb] text-slate-700 min-h-screen antialiased">
  <div class="max-w-7xl mx-auto px-6 py-10">
    <header class="mb-12">
      <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-1">AIGNE Hub Benchmark Report</h1>
      <p class="text-slate-500">${dateStr}</p>
    </header>

    ${compSection}
    ${isoSection}

    <footer class="border-t border-slate-200 pt-6 mt-12 text-sm text-slate-400">
      <p>Generated by <code class="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-xs">benchmarks/src/report.ts</code></p>
      ${compFile ? `<p class="mt-1">Comparison: <code class="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-xs">${compFile}</code></p>` : ''}
      ${isoFile ? `<p class="mt-1">Isolation: <code class="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-xs">${isoFile}</code></p>` : ''}
    </footer>
  </div>
</body>
</html>`;

  const ts = (timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
  const outPath = join(resultsDir, `report-${ts}.html`);
  writeFileSync(outPath, html);
  console.log(`\nReport written to: results/report-${ts}.html`);
}

main();
