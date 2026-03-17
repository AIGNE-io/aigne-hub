#!/usr/bin/env node
/**
 * Generate HTML pricing report — two-row-per-model layout with nested sub-tables.
 * Row 1 (成本): best-cost prices; when tiered/resolution, embed a bordered sub-table
 * Row 2 (售价): our selling prices + margin badges vs cost row
 * Sources column: badges (官方/LiteLLM/OpenRouter), click → popover comparison table
 *
 * Usage: node generate-html-report.mjs <input.json> [output.html]
 *   or:  cat pricing.json | node generate-html-report.mjs > report.html
 */

import fs from 'fs';
import path from 'path';

let data,
  unmatchedModels = [],
  outputFile,
  apiBaseUrl;
if (process.argv[2] && process.argv[2] !== '-') {
  const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  if (Array.isArray(raw)) {
    data = raw; // backward compat
  } else {
    data = raw.results || raw;
    unmatchedModels = raw.unmatchedModels || [];
  }
  outputFile = process.argv[3] || null;
  apiBaseUrl = process.argv[4] || '';
} else {
  const raw = JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  if (Array.isArray(raw)) {
    data = raw;
  } else {
    data = raw.results || raw;
    unmatchedModels = raw.unmatchedModels || [];
  }
  outputFile = process.argv[2] === '-' ? process.argv[3] || null : null;
  apiBaseUrl = '';
}

const PRICING_URLS = {
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  xai: 'https://docs.x.ai/developers/models',
  openai: 'https://platform.openai.com/docs/pricing',
  doubao: 'https://www.volcengine.com/docs/82379/1544106',
  openrouter: 'https://openrouter.ai/models',
  bedrock: 'https://aws.amazon.com/bedrock/pricing/',
  ideogram: 'https://ideogram.ai/pricing',
  poe: 'https://poe.com/api/models',
};

const PROV_NAMES = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  doubao: 'Doubao',
  ideogram: 'Ideogram',
  minimax: 'MiniMax',
  bedrock: 'Bedrock',
  poe: 'Poe',
};
function provName(p) {
  return PROV_NAMES[p.toLowerCase()] || p.charAt(0).toUpperCase() + p.slice(1);
}

function fmt(v, pricingUnit) {
  if (v === undefined || v === null) return '<span class="na">-</span>';
  if (v === 0) return '$0';
  if (pricingUnit === 'per-image') return '$' + Number(v).toFixed(4) + '/张';
  if (pricingUnit === 'per-second') return '$' + Number(v).toFixed(4) + '/sec';
  const p = v * 1e6;
  if (p < 0.01) return '$' + p.toExponential(2);
  if (p < 1) return '$' + p.toFixed(3);
  return '$' + p.toFixed(2);
}

function mg(margin) {
  if (margin === undefined || margin === null) return '';
  if (Math.abs(margin) < 0.05) return '';
  const s = margin >= 0 ? '+' : '';
  const t = s + margin.toFixed(1) + '%';
  const c = Math.abs(margin) <= 2 ? 'even' : margin < 0 ? 'loss' : 'drift';
  return `<span class="mg ${c}">${t}</span>`;
}
// Cache sell cell: show "缺失" warning when cost exists but sell is missing
function cacheSellCell(sell, cost, margin) {
  if (cost > 0 && (!sell || sell <= 0))
    return '<span class="mg loss" title="未设置 cache 价格，可能存在亏损风险">缺失</span>';
  return `<span class="mono">${fmt(sell, 'per-token')}</span> ${mg(margin)}`;
}

function calcMg(sell, cost) {
  if (sell === undefined || sell === null || cost === undefined || cost === null || cost === 0) return undefined;
  return ((sell - cost) / cost) * 100;
}

// Build a cache tier sub-table (same visual pattern as tiered pricing sub-table)
function buildCacheTierCol(tiers, dbSellVal) {
  const sorted = [...tiers].sort((a, b) => a.costPerToken - b.costPerToken);
  const lastIdx = sorted.length - 1;
  let matchIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (closeEnough(dbSellVal, sorted[i].costPerToken)) {
      matchIdx = i;
      break;
    }
  }
  const isHighest = matchIdx === lastIdx;
  let h = '<table class="stbl stbl-collapsed">';
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const isMatch = i === matchIdx;
    const hlCls = isMatch ? (isHighest ? ' stbl-match' : ' stbl-warn') : '';
    const extraCls = i < lastIdx ? ' stbl-extra' : '';
    const cls = (hlCls + extraCls).trim();
    h += `<tr${cls ? ` class="${cls}"` : ''}>`;
    h += `<td class="stbl-lbl">${t.label}</td>`;
    const dotTitle = isHighest ? '售价与最高 tier 一致' : '售价低于最高 tier';
    const dot = isMatch ? ` <span class="stbl-cur" title="${dotTitle}"></span>` : '';
    h += `<td class="stbl-v mono">${fmt(t.costPerToken, 'per-token')}${dot}</td>`;
    h += '</tr>';
  }
  // Sell row inside the table
  const highestCost = sorted[lastIdx].costPerToken;
  const sellM = calcMg(dbSellVal ?? 0, highestCost);
  const sellWarn = matchIdx >= 0 && !isHighest;
  const sellRowCls = sellWarn ? ' stbl-sell-warn' : '';
  const sellContent =
    dbSellVal == null || dbSellVal <= 0
      ? '<span class="mg loss" title="未设置 cache 价格，可能存在亏损风险">缺失</span>'
      : `<span class="mono">${fmt(dbSellVal, 'per-token')}</span> ${mg(sellM)}`;
  const wIco = sellWarn
    ? ' <span class="sell-warn" title="当前使用的价格并非最高 tier 定价，可能导致亏损">⚠</span>'
    : '';
  h += `<tr class="stbl-sell${sellRowCls}">`;
  h += `<td class="stbl-lbl">售价</td>`;
  h += `<td class="stbl-v">${sellContent}${wIco}</td>`;
  h += `</tr>`;
  h += '</table>';
  return h;
}

// --- Categorize ---
const DTH = 2;
const COLS = 8;
const isPerUnit = (m) => m.pricingUnit === 'per-image' || m.pricingUnit === 'per-second';
const hasDrift = (m) => {
  // DB sell vs best-cost margin check (direct actionable drift)
  const inputOff = !isPerUnit(m) && m.inputMargin != null && Math.abs(m.inputMargin) > DTH;
  const outputOff = m.outputMargin != null && Math.abs(m.outputMargin) > DTH;
  if (inputOff || outputOff) return true;
  // Cache tier drift: DB cache price < official highest tier (actionable)
  if (m.cacheTierWriteDrift > 0 || m.cacheTierReadDrift > 0) return true;
  // If DB margins are within threshold, don't flag drift from external source disagreements
  // (e.g. LiteLLM has stale data but DB matches official — not actionable)
  return false;
};
const hasBelowCost = (m) => {
  if (
    (m.outputMargin != null && m.outputMargin < -DTH) ||
    (!isPerUnit(m) && m.inputMargin != null && m.inputMargin < -DTH)
  )
    return true;
  // Cache write: cost exists but sell missing or below cost
  const cw = m.officialCacheWrite ?? m.litellmCacheWrite;
  const sw = m.dbCacheWrite;
  if (cw > 0 && (!sw || sw <= 0)) return true;
  if (cw > 0 && sw > 0 && ((sw - cw) / cw) * 100 < -DTH) return true;
  // Cache read: cost exists but sell missing or below cost
  const cr = m.officialCacheRead ?? m.litellmCacheRead;
  const sr = m.dbCacheRead;
  if (cr > 0 && (!sr || sr <= 0)) return true;
  if (cr > 0 && sr > 0 && ((sr - cr) / cr) * 100 < -DTH) return true;
  return false;
};
const closeEnough = (a, b) => a != null && b != null && b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.005;
const hasNotHighestTier = (m) => {
  const sO = m.outputRate ?? m.dbOutput;
  const sI = m.inputRate ?? m.dbInput;
  if (m.tieredPricing?.length) {
    const hi = m.tieredPricing[m.tieredPricing.length - 1];
    if (!(closeEnough(sO, hi.output) && closeEnough(sI, hi.input))) return true;
  }
  if (m.resolutionTiers?.length) {
    const maxCost = Math.max(...m.resolutionTiers.map((t) => t.costPerImage));
    if (!closeEnough(sO, maxCost)) return true;
  }
  // Cache write tiers: if multiple write tiers and DB doesn't use highest
  if (m.officialCacheTiers?.length) {
    const writeTiers = m.officialCacheTiers.filter((t) => t.label.includes('write'));
    if (writeTiers.length > 1) {
      const maxWrite = Math.max(...writeTiers.map((t) => t.costPerToken));
      const dbCW = m.dbCacheWrite ?? 0;
      if (!closeEnough(dbCW, maxWrite) && dbCW < maxWrite) return true;
    }
  }
  return false;
};
const hasNoData = (m) =>
  !m.bestCostOutput &&
  !m.bestCostInput &&
  !m.providerPageInput &&
  !m.litellmInput &&
  !m.openrouterInput &&
  !m.litellmOutputPerImage &&
  !m.litellmOutputPerSecond;
const hasNoOfficial = (m) =>
  m.providerPageInput === undefined &&
  m.providerPageOutput === undefined &&
  !(m.provider === 'openrouter' && m.openrouterInput !== undefined);
// Split into 4 sections by priority: belowCost → drift → noMatch → normal
const belowCostModels = data.filter((m) => hasBelowCost(m) || hasNotHighestTier(m));
const belowCostKeys = new Set(belowCostModels.map((m) => `${m.provider}/${m.model}`));

const driftModels = data.filter((m) => !belowCostKeys.has(`${m.provider}/${m.model}`) && hasDrift(m));
const driftKeys = new Set(driftModels.map((m) => `${m.provider}/${m.model}`));

const noMatchModels = data.filter(
  (m) =>
    !belowCostKeys.has(`${m.provider}/${m.model}`) &&
    !driftKeys.has(`${m.provider}/${m.model}`) &&
    (hasNoOfficial(m) || hasNoData(m))
);
const noMatchKeys = new Set(noMatchModels.map((m) => `${m.provider}/${m.model}`));

const ok = data.filter(
  (m) =>
    !belowCostKeys.has(`${m.provider}/${m.model}`) &&
    !driftKeys.has(`${m.provider}/${m.model}`) &&
    !noMatchKeys.has(`${m.provider}/${m.model}`)
);

// Collect unique providers (sorted) for filter buttons — include providers from both DB and unmatched
const allProviders = [...new Set([...data.map((m) => m.provider), ...unmatchedModels.map((m) => m.provider)])].sort(
  (a, b) => a.localeCompare(b)
);

let rid = 0;

function buildSection(models) {
  if (!models.length) return `<tr><td colspan="${COLS}" class="empty">无</td></tr>`;
  const g = {};
  for (const m of models) (g[m.provider] ??= []).push(m);

  let rows = '';
  // Sort providers alphabetically, then models by name within each provider
  const sortedProvs = Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [prov, ms] of sortedProvs) {
    // Sort by type group (text → image → video → other), then alphabetically
    const typeOrder = { chatCompletion: 0, embedding: 1, imageGeneration: 2, video: 3 };
    ms.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.model.localeCompare(b.model));
    rows += `<tr class="prow"><td colspan="${COLS}"><strong>${provName(prov)}</strong><span class="pcnt">${ms.length}</span></td></tr>`;

    for (const m of ms) {
      const id = rid++;
      const icon = m.type === 'imageGeneration' ? '🖼️' : m.type === 'video' ? '🎬' : '💬';
      const pu = m.pricingUnit || 'per-token';
      const isImage = pu === 'per-image';
      const unit = pu === 'per-image' ? '/张' : pu === 'per-second' ? '/秒' : '';

      const st =
        hasBelowCost(m) || hasNotHighestTier(m)
          ? 'below-cost'
          : hasDrift(m)
            ? 'drift'
            : hasNoOfficial(m) || hasNoData(m)
              ? 'no-match'
              : 'normal';
      const mKey = `${m.provider}/${m.model}`;
      const dsAttr = `data-status="${st}" data-search="${mKey} ${m.type}" data-key="${mKey}"`;

      // Sell values
      const sO = m.outputRate ?? m.dbOutput;
      const sI = m.inputRate ?? m.dbInput;
      const sCW = m.dbCacheWrite;
      const sCR = m.dbCacheRead;

      // Cost values
      const cO = m.bestCostOutput;
      const cI = m.bestCostInput;
      // Cache cost: prefer official highest tier over LiteLLM (same priority as input/output)
      const cCW = m.officialCacheWrite ?? m.litellmCacheWrite;
      const cCR = m.officialCacheRead ?? m.litellmCacheRead;

      // Per-image/per-second models: input is not a separate charge, always show "—"
      const fmtIn = (v) => {
        if (isPerUnit(m)) return '—';
        return fmt(v, pu);
      };

      // --- Build cost rows for sub-table ---
      let costRows = [];
      const hasTieredPricing = m.tieredPricing && m.tieredPricing.length > 0;
      const hasResVariants = m.resolutionTiers && m.resolutionTiers.length > 0;

      if (hasTieredPricing) {
        const lowestThreshold = m.tieredPricing[0].threshold;
        costRows.push({ label: '&lt;' + lowestThreshold, input: m.bestCostInput, output: m.bestCostOutput });
        for (const t of m.tieredPricing) {
          costRows.push({ label: '≥' + t.threshold, input: t.input, output: t.output });
        }
      } else if (hasResVariants) {
        const qOrder = { low: 0, standard: 0, medium: 1, high: 2, hd: 2 };
        const sorted = [...m.resolutionTiers]
          .filter((v) => v.costPerImage > 0)
          .sort((a, b) => (qOrder[a.quality] ?? 0) - (qOrder[b.quality] ?? 0) || a.costPerImage - b.costPerImage);
        const merged = [];
        for (const v of sorted) {
          if (!merged.find((e) => e.quality === v.quality && Math.abs(e.costPerImage - v.costPerImage) < 0.0001)) {
            merged.push({ ...v });
          }
        }
        const qAbbr = { standard: 'std', high: 'HD', hd: 'HD', medium: 'med', low: 'low' };
        for (const v of merged) {
          const sz = v.size.replace(/x/g, '×');
          const q = qAbbr[v.quality] || v.quality;
          costRows.push({ label: `${q} ${sz}`, input: undefined, output: v.costPerImage });
        }
      }
      const hasMultiCost = costRows.length > 0;

      // Margins: multi-cost → vs highest row; flat → vs bestCost
      // Per-image/per-second models: skip input margin (input is not separately charged)
      let mI, mO;
      if (hasMultiCost) {
        const highest = costRows[costRows.length - 1];
        mI = isPerUnit(m) ? undefined : calcMg(sI, highest.input);
        mO = calcMg(sO, highest.output);
      } else {
        mI = isPerUnit(m) ? undefined : calcMg(sI, cI);
        mO = calcMg(sO, cO);
      }
      const mCW = calcMg(sCW, cCW);
      const mCR = calcMg(sCR, cCR);

      // Build cache tier sub-tables when multiple write/read tiers exist
      const _cwTiers = (m.officialCacheTiers || []).filter((t) => t.label.includes('write'));
      const _crTiers = (m.officialCacheTiers || []).filter((t) => t.label === 'read' || t.label === 'cached-input');
      const cwSubTbl = _cwTiers.length > 1 ? buildCacheTierCol(_cwTiers, sCW) : null;
      const crSubTbl = _crTiers.length > 1 ? buildCacheTierCol(_crTiers, sCR) : null;

      // Source badges (check both input and output — image/video models only have output)
      const hasPP = m.providerPageInput !== undefined || m.providerPageOutput !== undefined;
      const hasLL =
        m.litellmInput !== undefined || m.litellmOutputPerImage !== undefined || m.litellmOutputPerSecond !== undefined;
      const hasOR = m.openrouterInput !== undefined;
      const isOR = m.provider === 'openrouter';
      const ppUrl = m.providerPageUrl || PRICING_URLS[m.provider] || '';
      let badges = '';
      if (isOR) {
        badges += `<a href="https://openrouter.ai" target="_blank" class="sb-link"><span class="sb ${hasOR ? 'sb-or' : 'sb-off'}">OpenRouter</span></a>`;
        badges += `<span class="sb ${hasLL ? 'sb-ll' : 'sb-off'}">LiteLLM</span>`;
      } else {
        if (ppUrl) {
          badges += `<a href="${ppUrl}" target="_blank" class="sb-link"><span class="sb ${hasPP ? 'sb-pp' : 'sb-off'}">官方<span class="sb-ext">↗</span></span></a>`;
        } else {
          badges += `<span class="sb ${hasPP ? 'sb-pp' : 'sb-off'}">官方</span>`;
        }
        badges += `<span class="sb ${hasLL ? 'sb-ll' : 'sb-off'}">LiteLLM</span>`;
        badges += `<span class="sb ${hasOR ? 'sb-or' : 'sb-off'}">OpenRouter</span>`;
      }

      // Popover
      let pop = `<div class="pop" id="pop-${id}"><div class="parr"></div>`;
      pop += `<div class="phd">${m.provider}/${m.model}</div>`;
      pop += `<table class="ptbl"><thead><tr><th>来源</th><th>Input</th><th>Output</th><th>Cache Write</th><th>Cache Read</th></tr></thead><tbody>`;
      if (hasPP) {
        pop += `<tr><td><span class="sb sb-pp">官方</span>${m.providerPageUrl ? ` <a href="${m.providerPageUrl}" target="_blank" class="lk">↗</a>` : ''}</td>`;
        pop += `<td class="mono">${fmt(m.providerPageInput, pu)}</td><td class="mono">${fmt(m.providerPageOutput, pu)}</td>`;
        pop += `<td class="mono">${m.officialCacheWrite ? fmt(m.officialCacheWrite, 'per-token') : '<span class="na">-</span>'}</td>`;
        pop += `<td class="mono">${m.officialCacheRead ? fmt(m.officialCacheRead, 'per-token') : '<span class="na">-</span>'}</td></tr>`;
      }
      if (hasLL) {
        pop += `<tr><td><span class="sb sb-ll">LiteLLM</span></td>`;
        if (pu === 'per-image') {
          pop += `<td class="mono">${fmt(m.litellmInput, 'per-token')}</td>`;
          pop += `<td class="mono">${fmt(m.litellmOutputPerImage, 'per-image')}</td>`;
        } else if (pu === 'per-second') {
          pop += `<td class="mono">${fmt(m.litellmInput, 'per-token')}</td>`;
          pop += `<td class="mono">${fmt(m.litellmOutputPerSecond, 'per-second')}</td>`;
        } else {
          pop += `<td class="mono">${fmt(m.litellmInput, 'per-token')}</td><td class="mono">${fmt(m.litellmOutput, 'per-token')}</td>`;
        }
        pop += `<td class="mono">${fmt(m.litellmCacheWrite, 'per-token')}</td><td class="mono">${fmt(m.litellmCacheRead, 'per-token')}</td></tr>`;
      }
      if (hasOR) {
        pop += `<tr><td><span class="sb sb-or">OpenRouter</span></td>`;
        pop += `<td class="mono">${fmt(m.openrouterInput, 'per-token')}</td><td class="mono">${fmt(m.openrouterOutput, 'per-token')}</td><td class="na">-</td><td class="na">-</td></tr>`;
      }
      pop += `<tr class="psell"><td><span class="sb sb-us">Hub</span></td>`;
      pop += `<td class="mono">${fmtIn(sI)}</td><td class="mono">${fmt(sO, pu)}</td>`;
      pop += `<td class="mono">${fmt(sCW, 'per-token')}</td><td class="mono">${fmt(sCR, 'per-token')}</td></tr>`;
      pop += `</tbody></table>`;

      // Official cache tiers detail (5min-write / 1h-write / read)
      if (m.officialCacheTiers && m.officialCacheTiers.length > 0) {
        pop += `<div class="pcache"><span class="pcache-h">官方 Cache Tiers</span>`;
        for (const tier of m.officialCacheTiers) {
          pop += `<span class="pcache-item"><span class="pcache-lbl">${tier.label}</span><span class="mono">${fmt(tier.costPerToken, 'per-token')}</span></span>`;
        }
        pop += `</div>`;
      }

      pop += `</div>`;

      const modelHtml = `<span class="ti">${icon}</span><code class="mname" title="${m.provider}/${m.model}"><strong>${m.model}</strong></code>${unit ? `<span class="utag">${unit}</span>` : ''}`;
      const checkHtml = `<label class="rchk" title="选中同步"><input type="checkbox" class="rchk-in" data-rk="${mKey}"/><span class="rchk-box"></span></label>`;
      const sourcesHtml = `<div class="sarea" data-popover="pop-${id}">${badges}</div>${pop}`;

      if (hasMultiCost) {
        // --- Multi-cost: bordered cost table + sell price below ---
        let matchIdx = -1;
        const closeEnough = (a, b) => a != null && b != null && b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.005;
        for (let i = 0; i < costRows.length; i++) {
          const cr = costRows[i];
          if (hasTieredPricing) {
            if (closeEnough(sO, cr.output) && closeEnough(sI, cr.input)) {
              matchIdx = i;
              break;
            }
          } else {
            if (closeEnough(sO, cr.output)) {
              matchIdx = i;
              break;
            }
          }
        }
        const isHighest = matchIdx === costRows.length - 1;
        const isTier = hasTieredPricing;
        const sellWarn = matchIdx >= 0 && !isHighest;

        // Bordered cost-only sub-table (collapsible — only highest row visible when collapsed)
        const lastIdx = costRows.length - 1;
        let stbl = `<table class="stbl stbl-collapsed">`;
        for (let i = 0; i < costRows.length; i++) {
          const cr = costRows[i];
          const isMatch = i === matchIdx;
          const hlCls = isMatch ? (isHighest ? ' stbl-match' : ' stbl-warn') : '';
          const extraCls = i < lastIdx ? ' stbl-extra' : '';
          const classes = (hlCls + extraCls).trim();
          stbl += `<tr${classes ? ` class="${classes}"` : ''}>`;
          stbl += `<td class="stbl-lbl">${cr.label}</td>`;
          if (isTier) stbl += `<td class="stbl-v mono">${fmtIn(cr.input)}</td>`;
          let vx = '';
          if (i === lastIdx && lastIdx > 0) vx += ' <span class="stbl-toggle"><span class="stbl-arrow">▸</span></span>';
          const dotTitle = isHighest ? '售价与最高 tier 一致' : '售价低于最高 tier';
          if (isMatch) vx += ` <span class="stbl-cur" title="${dotTitle}"></span>`;
          stbl += `<td class="stbl-v mono">${fmt(cr.output, pu)}${vx}</td>`;
          stbl += `</tr>`;
        }
        // Sell row inside the sub-table
        const sellRowCls = sellWarn ? ' stbl-sell-warn' : '';
        const sellWarnIco = sellWarn
          ? ' <span class="sell-warn" title="当前使用的价格并非最高 tier 定价，可能导致亏损">⚠</span>'
          : '';
        stbl += `<tr class="stbl-sell${sellRowCls}">`;
        stbl += `<td class="stbl-lbl">售价</td>`;
        if (isTier) stbl += `<td class="stbl-v"><span class="mono">${fmtIn(sI)}</span> ${mg(mI)}</td>`;
        stbl += `<td class="stbl-v"><span class="mono">${fmt(sO, pu)}</span> ${mg(mO)}${sellWarnIco}</td>`;
        stbl += `</tr>`;
        stbl += `</table>`;

        rows += `<tr class="mrow r1" ${dsAttr}>`;
        rows += `<td class="mcol">${modelHtml}</td>`;
        rows += `<td class="pc" colspan="3">${stbl}</td>`;
        rows += cwSubTbl
          ? `<td class="pc">${cwSubTbl}</td>`
          : `<td class="pc"><div class="cache-dual mono">${fmt(cCW, 'per-token')}</div><div class="cache-dual">${cacheSellCell(sCW, cCW, mCW)}</div></td>`;
        rows += crSubTbl
          ? `<td class="pc">${crSubTbl}</td>`
          : `<td class="pc"><div class="cache-dual mono">${fmt(cCR, 'per-token')}</div><div class="cache-dual">${cacheSellCell(sCR, cCR, mCR)}</div></td>`;
        rows += `<td class="scol">${sourcesHtml}</td>`;
        rows += `<td class="ck-col">${checkHtml}</td>`;
        rows += `</tr>`;
      } else {
        // --- Flat: cost row + sell row ---
        rows += `<tr class="mrow r1" ${dsAttr}>`;
        rows += `<td class="mcol" rowspan="2">${modelHtml}</td>`;
        rows += `<td class="lbl lbl-cost">成本</td>`;
        rows += `<td class="pc mono">${fmtIn(cI)}</td>`;
        rows += `<td class="pc mono">${fmt(cO, pu)}</td>`;
        rows += cwSubTbl
          ? `<td class="pc" rowspan="2">${cwSubTbl}</td>`
          : `<td class="pc mono">${fmt(cCW, 'per-token')}</td>`;
        rows += crSubTbl
          ? `<td class="pc" rowspan="2">${crSubTbl}</td>`
          : `<td class="pc mono">${fmt(cCR, 'per-token')}</td>`;
        rows += `<td class="scol" rowspan="2">${sourcesHtml}</td>`;
        rows += `<td class="ck-col" rowspan="2">${checkHtml}</td>`;
        rows += `</tr>`;

        rows += `<tr class="mrow r2" ${dsAttr}>`;
        rows += `<td class="lbl lbl-sell">售价</td>`;
        rows += `<td class="pc"><span class="mono">${fmtIn(sI)}</span> ${mg(mI)}</td>`;
        rows += `<td class="pc"><span class="mono">${fmt(sO, pu)}</span> ${mg(mO)}</td>`;
        if (!cwSubTbl) rows += `<td class="pc">${cacheSellCell(sCW, cCW, mCW)}</td>`;
        if (!crSubTbl) rows += `<td class="pc">${cacheSellCell(sCR, cCR, mCR)}</td>`;
        rows += `</tr>`;
      }
    }
  }
  return rows;
}

// --- Unmatched official models section ---
const typeOrder = {
  chatCompletion: 0,
  embedding: 1,
  imageGeneration: 2,
  audio: 3,
  video: 4,
  fineTuning: 5,
  transcription: 6,
};
const typeLabels = {
  chatCompletion: '对话',
  embedding: '嵌入',
  imageGeneration: '图像',
  audio: '音频',
  video: '视频',
  fineTuning: '微调',
  transcription: '转录',
  tool: '工具',
};
function fmtMTok(v) {
  if (v === undefined || v === null) return '<span class="na">-</span>';
  if (v === 0) return '$0';
  const p = v * 1e6;
  if (p < 0.01) return '$' + p.toExponential(2);
  if (p < 1) return '$' + p.toFixed(3);
  return '$' + p.toFixed(2);
}
const UM_COLS = 7;
function buildUnmatchedSection(models) {
  if (!models.length) return `<tr><td colspan="${UM_COLS}" class="empty">无</td></tr>`;
  // Group by provider
  const g = {};
  for (const m of models) (g[m.provider] ??= []).push(m);
  let rows = '';
  const sortedProvs = Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [prov, ms] of sortedProvs) {
    ms.sort(
      (a, b) =>
        (typeOrder[a.modelType] ?? 9) - (typeOrder[b.modelType] ?? 9) ||
        (a.modelId || '').localeCompare(b.modelId || '')
    );
    rows += `<tr class="prow" data-provider="${prov}"><td colspan="${UM_COLS}"><strong>${provName(prov)}</strong><span class="pcnt">${ms.length}</span></td></tr>`;
    for (const m of ms) {
      const mKey = `${m.provider}/${m.modelId}`;
      const typeLabel = typeLabels[m.modelType] || m.modelType || '-';
      const ppUrl = m.sourceUrl || PRICING_URLS[m.provider] || '';
      const linkStart = ppUrl ? `<a href="${ppUrl}" target="_blank" class="sb-link">` : '';
      const linkEnd = ppUrl ? '</a>' : '';
      // Cache display: show read price, hover shows all tiers
      let cacheHtml = '<span class="na">-</span>';
      if (m.cacheTiers && m.cacheTiers.length > 0) {
        const readTier = m.cacheTiers.find((t) => t.label === 'read' || t.label === 'cached-input');
        const readVal = readTier ? fmtMTok(readTier.costPerToken) : fmtMTok(m.cachedInputCostPerToken);
        const tierDetails = m.cacheTiers.map((t) => `${t.label}: ${fmtMTok(t.costPerToken)}`).join('&#10;');
        cacheHtml = `<span class="mono" title="${tierDetails}">${readVal}</span>`;
      } else if (m.cachedInputCostPerToken != null) {
        cacheHtml = `<span class="mono">${fmtMTok(m.cachedInputCostPerToken)}</span>`;
      }
      const checkHtml = `<label class="rchk" title="选中"><input type="checkbox" class="um-chk" data-umk="${mKey}"/><span class="rchk-box"></span></label>`;
      rows += `<tr class="mrow um-row" data-search="${mKey} ${m.modelType || ''}" data-provider="${prov}" data-umk="${mKey}">`;
      rows += `<td class="mcol"><code class="mname" title="${mKey}"><strong>${m.modelId}</strong></code></td>`;
      rows += `<td><span class="type-tag">${typeLabel}</span></td>`;
      rows += `<td class="pc mono">${fmtMTok(m.inputCostPerToken)}</td>`;
      rows += `<td class="pc mono">${fmtMTok(m.outputCostPerToken)}</td>`;
      rows += `<td class="pc">${cacheHtml}</td>`;
      rows += `<td class="scol">${linkStart}<span class="sb sb-pp">官方<span class="sb-ext">↗</span></span>${linkEnd}</td>`;
      rows += `<td class="ck-col">${checkHtml}</td>`;
      rows += `</tr>`;
    }
  }
  return rows;
}

const THEAD = `<thead><tr>
  <th style="width:19%">模型</th>
  <th style="width:10%"></th>
  <th style="width:12%">Input</th>
  <th style="width:12%">Output</th>
  <th style="width:12%">Cache Write</th>
  <th style="width:11%">Cache Read</th>
  <th style="width:20%">数据源</th>
  <th style="width:4%" title="勾选已审阅的模型，同步时只更新已勾选的">同步</th>
</tr></thead>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIGNE Hub 定价报告 - ${new Date().toLocaleDateString('zh-CN')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC',sans-serif;background:#f5f6f8;padding:24px;color:#1a1a2e;font-size:15px;min-height:100vh;line-height:1.5}
.wrap{max-width:1480px;margin:0 auto}

.hdr{background:linear-gradient(135deg,#2d3748,#4a5568);color:#fff;padding:28px 36px;border-radius:14px;margin-bottom:20px;box-shadow:0 4px 16px rgba(0,0,0,.12)}
.hdr h1{font-size:1.65rem;font-weight:700;margin-bottom:6px}
.hdr .meta{font-size:.9rem;opacity:.78}

.summary{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:20px}
.st{background:#fff;padding:20px;border-radius:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid #e2e8f0}
.st .n{font-size:1.85rem;font-weight:700;margin-bottom:2px}
.st .l{color:#718096;font-size:.88rem}
.st.critical .n{color:#9b2c2c}.st.danger .n{color:#e53e3e}.st.ok .n{color:#38a169}
.st[data-f]{cursor:pointer;transition:all .15s}
.st[data-f]:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1)}
.st[data-f].active{border-color:#2d3748;box-shadow:0 0 0 2px #2d3748}

.tb{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.sinput{flex:1;min-width:200px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#fff;outline:none}
.sinput:focus{border-color:#4a5568}
.fb{padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;transition:all .12s}
.fb:hover{background:#f7fafc}
.fb.active{background:#2d3748;color:#fff;border-color:#2d3748}
.tb-sep{width:1px;height:24px;background:#e2e8f0;margin:0 4px;flex-shrink:0}
.pb{padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;transition:all .12s;color:#4a5568}
.pb:hover{background:#edf2f7;border-color:#a0aec0}
.pb.active{background:#4c51bf;color:#fff;border-color:#4c51bf}

.sec{border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid #e2e8f0;margin-bottom:20px;overflow-x:auto}
.sec-h{padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;transition:background .12s}
.sec-h:hover{filter:brightness(.97)}
.sec-h h2{font-size:1.1rem;font-weight:600}
.sec-h .chevron{margin-left:auto;font-size:12px;color:#a0aec0;transition:transform .2s}
.sec.collapsed .sec-h .chevron{transform:rotate(-90deg)}
.sec.collapsed .sec-body{display:none}
.cnt{display:inline-block;padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600}
.cnt.critical{background:#fed7d7;color:#9b2c2c}.cnt.danger{background:#feebc8;color:#c05621}.cnt.ok{background:#c6f6d5;color:#276749}

/* Section background colors */
.sec-belowcost{background:#fff0f0;border-color:#fc8181}
.sec-belowcost .sec-h{border-color:#fc8181}
.sec-drift{background:#fff5f5;border-color:#feb2b2}
.sec-drift .sec-h{border-color:#feb2b2}
.sec-nomatch{background:#fffff0;border-color:#fefcbf}
.sec-nomatch .sec-h{border-color:#fefcbf}
.sec-ok{background:#f0fff4;border-color:#c6f6d5}
.sec-ok .sec-h{border-color:#c6f6d5}

/* Table rows need white-ish bg for readability */
.sec table.mt thead{background:rgba(255,255,255,.7)}
.sec .prow td{background:rgba(247,250,252,.7)}
.sec .mrow:hover td,.sec .mrow.r1:hover+.mrow.r2 td{background:rgba(255,255,255,.5)}

/* Main table */
table.mt{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
table.mt thead{background:#f7fafc;border-bottom:1px solid #e2e8f0}
table.mt th{padding:11px 14px;text-align:left;font-weight:600;color:#4a5568;font-size:.8rem;text-transform:uppercase;letter-spacing:.3px}

.prow td{padding:9px 14px;background:#f7fafc;border-bottom:1px solid #e2e8f0;font-size:13px;color:#4a5568}
.pcnt{margin-left:6px;font-size:12px;color:#a0aec0;font-weight:400}

/* Model rows */
.mrow td{padding:4px 14px;vertical-align:middle}
.r1 td{border-top:1px solid #edf2f7;padding-top:10px;padding-bottom:2px}
.r1 .mcol{padding-top:10px;padding-bottom:10px}
.r2 td{border-bottom:1px solid #edf2f7;padding-top:2px;padding-bottom:10px}

.mrow.r1:hover td,.mrow.r1:hover+.mrow.r2 td{background:#f7fafc}
.mrow.r2:hover td{background:#f7fafc}

.mrow.hidden,.prow.hidden{display:none}

/* Read checkbox column */
.ck-col{text-align:center;vertical-align:middle !important}
.rchk{display:inline-flex;align-items:center;cursor:pointer;vertical-align:middle;flex-shrink:0}
.rchk input[type="checkbox"]{position:absolute;opacity:0;pointer-events:none}
.rchk-box{width:18px;height:18px;border:2px solid #cbd5e0;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
.rchk-box::after{content:'';display:none;width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg);margin-top:-1px}
.rchk input[type="checkbox"]:checked+.rchk-box{background:#38a169;border-color:#38a169}
.rchk input[type="checkbox"]:checked+.rchk-box::after{display:block}
.rchk:hover .rchk-box{border-color:#a0aec0}
.mrow.read-done td{background:rgba(56,161,105,.06)}
.mrow.read-done:hover td{background:rgba(56,161,105,.10)}
.mrow.read-done .ck-col{opacity:1}

/* Model col */
.mcol{word-break:break-all;vertical-align:top !important;padding-top:14px !important}
.ti{font-size:15px;margin-right:3px}
.mname{font-size:13px;color:#4a5568}
.mname strong{color:#1a202c}
.utag{font-size:10px;padding:2px 5px;background:#ebf8ff;color:#2b6cb0;border-radius:3px;margin-left:3px}

/* Row label col */
.lbl{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;width:44px}
.lbl-cost{color:#718096}
.lbl-sell{color:#2d3748}
/* Bordered cost sub-table */
.stbl{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #cbd5e0;border-radius:5px;font-size:13px;overflow:hidden;cursor:pointer}
.stbl:hover{border-color:#a0aec0}
.stbl td{padding:3px 10px;border-bottom:1px solid #e2e8f0}
.stbl tr:last-child td{border-bottom:none}
.stbl-lbl{font-size:11px;font-weight:600;color:#718096;white-space:nowrap}
.stbl-v{text-align:left;white-space:nowrap}

/* Current tier dot indicator (inline in value cell) */
.stbl-cur{display:inline-block;width:8px;height:8px;border-radius:50%;background:#38a169;box-shadow:0 0 0 2px rgba(56,161,105,.25);margin-left:6px;vertical-align:middle;cursor:help}
.stbl-warn .stbl-cur{background:#dd6b20;box-shadow:0 0 0 2px rgba(221,107,32,.25)}

/* Match highlighting */
.stbl-match td{background:#f0fff4}
.stbl-match .stbl-lbl{color:#276749}
.stbl-warn td{background:#fffbeb}
.stbl-warn .stbl-lbl{color:#975a16}

/* Sub-table collapse */
.stbl-collapsed .stbl-extra{display:none}
.stbl-toggle{color:#a0aec0;font-size:11px;margin-left:6px;vertical-align:middle}
.stbl-arrow{display:inline-block;transition:transform .15s;font-size:10px}
.stbl:not(.stbl-collapsed) .stbl-arrow{transform:rotate(90deg)}

/* Sell row inside sub-table */
.cache-dual{padding:0 2px 2px;font-size:13px;display:flex;align-items:center;gap:4px;color:#718096}
.stbl-sell td{border-bottom:none !important}
.stbl-sell .stbl-lbl{color:#2d3748;font-weight:700}
.stbl-sell-warn td{background:#fffbeb}
.stbl-sell-warn .stbl-lbl{color:#c05621}

/* Sell warning icon */
.sell-warn{color:#dd6b20;margin-left:2px;font-size:14px;cursor:help}

/* Price cols */
.pc{white-space:nowrap}
.mono{font-family:'SF Mono',Menlo,'Courier New',monospace;font-weight:600;font-size:13.5px}
.na{color:#d0d5dd;font-weight:400}

/* Margin badges */
.mg{display:inline-block;padding:1px 7px;border-radius:8px;font-size:11.5px;font-weight:600;white-space:nowrap;margin-left:4px}
.mg.drift{background:#fed7aa;color:#9a3412}
.mg.loss{background:#fed7d7;color:#c53030}
.mg.even{background:#fefcbf;color:#975a16}

/* Source col */
.scol{position:relative;vertical-align:top !important;padding-top:14px !important;cursor:pointer}
.sarea{cursor:pointer;display:inline-flex;gap:4px;flex-wrap:wrap;padding:4px 6px;border-radius:6px;transition:background .12s}
.sarea:hover{background:#f0f2f5}
.sb{display:inline-block;padding:2px 8px;border-radius:7px;font-size:11.5px;font-weight:600;border:1px solid}
.sb-pp{background:#e8f5e9;color:#2e7d32;border-color:#a5d6a7}
.sb-ll{background:#f3e5f5;color:#7b1fa2;border-color:#ce93d8}
.sb-or{background:#e3f2fd;color:#1565c0;border-color:#90caf9}
.sb-us{background:#fff3e0;color:#e65100;border-color:#ffcc80}
.sb-off{background:#f9fafb;color:#dce1e8;border-color:#edf0f4}
.sb-link{text-decoration:none;cursor:pointer}
.sb-link:hover .sb{opacity:.8;text-decoration:underline}
.sb-ext{font-size:10px;margin-left:2px;opacity:.6}
.sb-link:hover .sb-ext{opacity:1}

/* Popover */
.pop{display:none;position:fixed;z-index:200;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.16);min-width:520px;max-width:calc(100vw - 32px);overflow:hidden}
.pop.open{display:block}
.parr{position:absolute;top:-6px;width:10px;height:10px;background:#fff;border:1px solid #e2e8f0;border-right:none;border-bottom:none;transform:rotate(45deg)}
.phd{padding:11px 16px;background:#f7fafc;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:13px;color:#2d3748}
.ptbl{width:100%;border-collapse:collapse;font-size:13px}
.ptbl th{padding:8px 12px;text-align:right;font-weight:600;color:#718096;font-size:11px;background:#f7fafc;border-bottom:1px solid #edf2f7;letter-spacing:.2px}
.ptbl th:first-child{text-align:left}
.ptbl td{padding:8px 12px;border-bottom:1px solid #f5f5f5;text-align:right}
.ptbl td:first-child{text-align:left}
.ptbl tr:last-child td{border-bottom:none}
.psell td{background:#fffbeb}
.lk{color:#4299e1;text-decoration:none;font-size:11px}
.lk:hover{text-decoration:underline}

/* Official cache tiers in popover */
.pcache{padding:8px 12px;background:#f7fafc;border-top:1px solid #edf2f7;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px}
.pcache-h{font-weight:600;color:#4a5568;white-space:nowrap}
.pcache-item{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px}
.pcache-lbl{color:#718096;font-size:11px}

/* Unmatched official section */
.sec-unmatched{background:#eff6ff;border-color:#90cdf4}
.sec-unmatched .sec-h{border-color:#90cdf4}
.st.info .n{color:#3182ce}
.cnt.info{background:#bee3f8;color:#2b6cb0}
.type-tag{display:inline-block;padding:1px 7px;border-radius:6px;font-size:11px;font-weight:600;background:#edf2f7;color:#4a5568}
.um-row td{padding:8px 14px;border-bottom:1px solid #edf2f7;vertical-align:middle}
.um-row:hover td{background:rgba(255,255,255,.5)}
.um-row.um-checked td{background:rgba(49,130,206,.06)}
.um-row.um-checked:hover td{background:rgba(49,130,206,.10)}
.um-sel-bar{display:inline-flex;align-items:center;gap:8px;margin-left:12px;font-size:12px}
.um-btn{padding:3px 10px;border:1px solid #90cdf4;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#2b6cb0;transition:all .12s}
.um-btn:hover{background:#ebf8ff;border-color:#63b3ed}

.empty{padding:20px;text-align:center;color:#a0aec0;font-size:14px}

/* No-official badge */
.no-official{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fff3cd;color:#856404;border:1px solid #ffc107;margin-left:4px;vertical-align:middle}
.cnt.miss{background:#fff3cd;color:#856404}
.st.miss .n{color:#d69e2e}
.sec-sub{font-size:12px;color:#718096;font-weight:400;margin-left:4px}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>AIGNE Hub 定价报告</h1>
    <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp; 成本优先级：官方 → OpenRouter → LiteLLM &nbsp;|&nbsp; $/1M tokens &nbsp;|&nbsp; 图片 $/张 &nbsp;|&nbsp; 视频 $/sec &nbsp;|&nbsp; 点击数据源列可查看各来源详细对比</div>
  </div>

  <div class="summary">
    <div class="st critical" data-f="below-cost"><div class="n" id="sum-belowcost">${belowCostModels.length}</div><div class="l">高风险成本亏损</div></div>
    <div class="st danger" data-f="drift"><div class="n" id="sum-drift">${driftModels.length}</div><div class="l">漂移量过大</div></div>
    <div class="st miss" data-f="no-match"><div class="n" id="sum-nomatch">${noMatchModels.length}</div><div class="l">未找到官方数据</div></div>
    <div class="st ok" data-f="normal"><div class="n" id="sum-ok">${ok.length}</div><div class="l">定价正常</div></div>
    <div class="st info" data-f="unmatched"><div class="n" id="sum-unmatched">${unmatchedModels.length}</div><div class="l">官方未录入</div></div>
    <div class="st" data-f="all"><div class="n" id="sum-total">${data.length}</div><div class="l">总计</div></div>
  </div>

  <div class="tb">
    <input type="text" class="sinput" placeholder="搜索模型..." id="si"/>
    <button class="fb tier-btn" id="tier-toggle" title="展开/折叠所有分层定价">展开变体</button>
    <button class="fb" id="read-filter">隐藏已选</button>
    <button class="fb" id="read-clear" title="清除所有同步选中标记" style="font-size:11px;color:#a0aec0">清除选中</button>
    <span class="tb-sep"></span>
    ${allProviders.map((p) => `<button class="pb" data-p="${p}">${provName(p)}</button>`).join('\n    ')}
  </div>

  ${
    belowCostModels.length > 0
      ? `
  <div class="sec sec-belowcost" data-sec="below-cost">
    <div class="sec-h"><h2>高风险成本亏损</h2><span class="cnt critical sec-cnt">${belowCostModels.length}</span><span class="sec-sub">售价低于成本，存在亏损风险</span><span class="chevron">▼</span></div>
    <div class="sec-body"><table class="mt">${THEAD}<tbody>${buildSection(belowCostModels)}</tbody></table></div>
  </div>`
      : ''
  }

  ${
    driftModels.length > 0
      ? `
  <div class="sec sec-drift" data-sec="drift">
    <div class="sec-h"><h2>漂移量过大</h2><span class="cnt danger sec-cnt">${driftModels.length}</span><span class="sec-sub">DB 售价与外部数据源偏差超过阈值，或未对标最高定价层</span><span class="chevron">▼</span></div>
    <div class="sec-body"><table class="mt">${THEAD}<tbody>${buildSection(driftModels)}</tbody></table></div>
  </div>`
      : ''
  }

  ${
    noMatchModels.length > 0
      ? `
  <div class="sec sec-nomatch" data-sec="no-match">
    <div class="sec-h"><h2>未找到对应的官方输入输出</h2><span class="cnt miss sec-cnt">${noMatchModels.length}</span><span class="sec-sub">未匹配到官方或外部数据源，需人工确认</span><span class="chevron">▼</span></div>
    <div class="sec-body"><table class="mt">${THEAD}<tbody>${buildSection(noMatchModels)}</tbody></table></div>
  </div>`
      : ''
  }

  <div class="sec sec-ok" data-sec="normal">
    <div class="sec-h"><h2>定价正常</h2><span class="cnt ok sec-cnt">${ok.length}</span><span class="sec-sub">定价在合理范围内</span><span class="chevron">▼</span></div>
    <div class="sec-body"><table class="mt">${THEAD}<tbody>${buildSection(ok)}</tbody></table></div>
  </div>

  ${
    unmatchedModels.length > 0
      ? `
  <div class="sec sec-unmatched" data-sec="unmatched">
    <div class="sec-h"><h2>官方可用但未录入</h2><span class="cnt info sec-cnt">${unmatchedModels.length}</span><span class="sec-sub">官方定价页面有数据但 Hub DB 中尚未录入的模型</span>
      <span class="um-sel-bar" onclick="event.stopPropagation()">
        <span style="font-size:12px;color:#4a5568">已选 <strong id="um-sel-cnt">0</strong></span>
        <button class="um-btn" onclick="toggleUmAll(true)">全选</button>
        <button class="um-btn" onclick="toggleUmAll(false)">取消</button>
      </span>
      <span class="chevron">▼</span></div>
    <div class="sec-body"><table class="mt"><thead><tr>
      <th style="width:23%">模型</th>
      <th style="width:9%">类型</th>
      <th style="width:14%">Input</th>
      <th style="width:14%">Output</th>
      <th style="width:14%">Cache</th>
      <th style="width:18%">官方来源</th>
      <th style="width:4%" title="勾选要操作的模型"><label class="rchk" style="vertical-align:middle" onclick="event.stopPropagation()"><input type="checkbox" id="um-chk-all" onchange="toggleUmAll(this.checked)"/><span class="rchk-box"></span></label></th>
    </tr></thead><tbody>${buildUnmatchedSection(unmatchedModels)}</tbody></table></div>
  </div>`
      : ''
  }

  <!-- Sync Panel -->
  <div class="sec" id="sync-panel" style="background:#fff;margin-top:24px">
    <div class="sec-h" style="cursor:default;background:linear-gradient(135deg,#2d3748,#4a5568)">
      <h2 style="color:#fff">API 同步面板</h2>
      <span class="sec-sub" style="color:rgba(255,255,255,.7)">预览变更 / 一键同步到数据库</span>
    </div>
    <div class="sec-body" style="padding:20px 24px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <label style="font-size:13px;font-weight:600;color:#4a5568;display:block;margin-bottom:6px">API 地址</label>
          <input type="text" id="sync-url" value="${apiBaseUrl}" readonly style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f7fafc;color:#4a5568"/>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;color:#4a5568;display:block;margin-bottom:6px">Access Token <span style="font-weight:400;color:#a0aec0;font-size:11px">(按域名自动保存)</span></label>
          <input type="password" id="sync-token" placeholder="输入管理员 Access Token" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px"/>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#4a5568;cursor:pointer">
          <input type="checkbox" id="sync-apply-rates" checked onchange="document.getElementById('sync-rates-opts').style.display=this.checked?'flex':'none'"/> 同时更新售价
        </label>
        <span id="sync-rates-opts" style="display:flex;gap:12px;align-items:center">
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#718096">利润率%<input type="number" id="sync-margin" value="1" min="0" max="100" step="0.5" style="width:60px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;text-align:center"/></label>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#718096" title="1 积分等于多少美元。例如：积分单价=1 表示 1 credit = $1；积分单价=0.01 表示 1 credit = $0.01（售价数值会放大 100 倍）">积分单价 <span style="cursor:help;color:#a0aec0">&#9432;</span><input type="number" id="sync-credit-price" value="1" min="0.01" step="0.01" style="width:60px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;text-align:center"/></label>
        </span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#4a5568;cursor:pointer">
          <input type="checkbox" id="sync-deprecate" checked/> 软删除未匹配模型
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:20px;align-items:center">
        <span style="font-size:13px;color:#4a5568">已录入 <strong id="sync-sel-cnt">0</strong> 个 &nbsp;|&nbsp; 未录入 <strong id="sync-um-cnt" style="color:#3182ce">0</strong> 个<span style="font-size:11px;color:#a0aec0;margin-left:2px">(新增)</span></span>
        <button onclick="toggleSyncAll(true)" style="padding:4px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#4a5568">全选已录入</button>
        <button onclick="toggleSyncAll(false)" style="padding:4px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#4a5568">取消全选</button>
        <span style="flex:1"></span>
        <button id="sync-preview-btn" onclick="doSync(true)" style="padding:10px 24px;background:#4a5568;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .15s">预览变更</button>
        <button id="sync-execute-btn" onclick="doSync(false)" style="padding:10px 24px;background:#38a169;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .15s;display:none">确认执行同步</button>
      </div>
      <div id="sync-status" style="display:none;padding:14px 18px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>
      <div id="sync-result" style="display:none"></div>
    </div>
  </div>
</div>

<script>
// All syncable entries (generated at report time)
const __allEntries=${JSON.stringify(
  data
    .filter((m) => m.bestCostInput !== undefined || m.bestCostOutput !== undefined)
    .map((m) => ({
      provider: m.provider,
      modelId: m.model,
      inputCostPerToken: m.bestCostInput ?? null,
      outputCostPerToken: m.bestCostOutput ?? null,
      cachedInputCostPerToken: m.officialCacheRead ?? m.litellmCacheRead ?? null,
      cacheTiers:
        m.officialCacheTiers ??
        (m.litellmCacheWrite || m.litellmCacheRead
          ? [
              ...(m.litellmCacheWrite ? [{ label: 'write', costPerToken: m.litellmCacheWrite }] : []),
              ...(m.litellmCacheRead ? [{ label: 'read', costPerToken: m.litellmCacheRead }] : []),
            ]
          : undefined),
      modelType: m.type,
    }))
)};
const __entryMap=new Map(__allEntries.map(e=>[e.provider+'/'+e.modelId,e]));

// Unmatched official entries (for sync "add new" operation)
const __umEntries=${JSON.stringify(
  unmatchedModels.map((m) => ({
    provider: m.provider,
    modelId: m.modelId,
    inputCostPerToken: m.inputCostPerToken ?? null,
    outputCostPerToken: m.outputCostPerToken ?? null,
    cachedInputCostPerToken: m.cachedInputCostPerToken ?? null,
    cacheTiers: m.cacheTiers ?? undefined,
    modelType: m.modelType ?? 'chatCompletion',
    pricingUnit: m.pricingUnit ?? 'per-token',
    costPerImage: m.costPerImage ?? undefined,
    costPerSecond: m.costPerSecond ?? undefined,
    isNew: true,
  }))
)};
const __umMap=new Map(__umEntries.map(e=>[e.provider+'/'+e.modelId,e]));

// --- Unmatched selection ---
const UM_LS='aigne-pricing-um-sel';
let umSelSet=new Set(JSON.parse(localStorage.getItem(UM_LS)||'[]'));
function getUmSelected(){
  const keys=new Set();
  document.querySelectorAll('.um-chk:checked').forEach(cb=>keys.add(cb.dataset.umk));
  return keys;
}
function updUmCnt(){
  const cnt=getUmSelected().size;
  const el=document.getElementById('um-sel-cnt');
  if(el)el.textContent=cnt;
  const syncEl=document.getElementById('sync-um-cnt');
  if(syncEl)syncEl.textContent=cnt;
  // Update header "select all" checkbox based on VISIBLE rows only
  const allChk=document.getElementById('um-chk-all');
  if(allChk){
    const visibleChks=document.querySelectorAll('.um-row:not(.hidden) .um-chk');
    let visChecked=0;
    visibleChks.forEach(cb=>{if(cb.checked)visChecked++});
    allChk.checked=visibleChks.length>0&&visChecked===visibleChks.length;
    allChk.indeterminate=visChecked>0&&visChecked<visibleChks.length;
  }
}
function applyUmCheck(key,checked){
  if(checked)umSelSet.add(key);else umSelSet.delete(key);
  localStorage.setItem(UM_LS,JSON.stringify([...umSelSet]));
  document.querySelectorAll('.um-row[data-umk="'+key+'"]').forEach(r=>r.classList.toggle('um-checked',checked));
  updUmCnt();
}
function toggleUmAll(on){
  document.querySelectorAll('.um-row:not(.hidden) .um-chk').forEach(cb=>{
    cb.checked=on;
    applyUmCheck(cb.dataset.umk,on);
  });
  updUmCnt();
}
// Init unmatched checkboxes from localStorage
document.querySelectorAll('.um-chk').forEach(cb=>{
  const k=cb.dataset.umk;
  if(umSelSet.has(k)){
    cb.checked=true;
    const row=cb.closest('.um-row');
    if(row)row.classList.add('um-checked');
  }
  cb.addEventListener('change',e=>{e.stopPropagation();applyUmCheck(k,cb.checked)});
});
updUmCnt();

// Sync selection: read from table row checkboxes (.rchk-in[data-rk])
function getSyncSelected(){
  const keys=new Set();
  document.querySelectorAll('.rchk-in:checked').forEach(cb=>keys.add(cb.dataset.rk));
  return keys;
}
function updSelCnt(){
  document.getElementById('sync-sel-cnt').textContent=getSyncSelected().size;
}
function toggleSyncAll(on){
  document.querySelectorAll('.mrow:not(.hidden) .rchk-in').forEach(cb=>{
    cb.checked=on;
    applyRead(cb.dataset.rk,on);
  });
  updSelCnt();
}

// Token persistence (per domain)
(function(){
  const urlEl=document.getElementById('sync-url');
  const tokEl=document.getElementById('sync-token');
  try{
    const domain=new URL(urlEl.value).hostname;
    const saved=localStorage.getItem('aigne-sync-token:'+domain);
    if(saved)tokEl.value=saved;
  }catch(e){}
  tokEl.addEventListener('input',function(){
    try{
      const domain=new URL(urlEl.value).hostname;
      if(tokEl.value)localStorage.setItem('aigne-sync-token:'+domain,tokEl.value);
      else localStorage.removeItem('aigne-sync-token:'+domain);
    }catch(e){}
  });
})();

// Sync panel logic
async function doSync(isDryRun){
  const url=document.getElementById('sync-url').value.trim().replace(/\\/$/,'');
  const token=document.getElementById('sync-token').value.trim();
  const deprecate=document.getElementById('sync-deprecate').checked;
  const applyRates=document.getElementById('sync-apply-rates').checked;
  const profitMargin=parseFloat(document.getElementById('sync-margin').value);
  const creditPrice=parseFloat(document.getElementById('sync-credit-price').value);
  const status=document.getElementById('sync-status');
  const result=document.getElementById('sync-result');
  const execBtn=document.getElementById('sync-execute-btn');

  if(!url){showStatus('请输入 API 地址','#feebc8','#c05621');return}
  if(!token){showStatus('请输入 Access Token','#feebc8','#c05621');return}

  const checkedKeys=getSyncSelected();
  const selectedEntries=__allEntries.filter(e=>checkedKeys.has(e.provider+'/'+e.modelId));

  // Also include selected unmatched (new) models
  const umKeys=getUmSelected();
  const selectedUm=__umEntries.filter(e=>umKeys.has(e.provider+'/'+e.modelId));
  const allSelected=[...selectedEntries,...selectedUm];

  if(!allSelected.length){showStatus('请先勾选要同步的模型（已录入或未录入）','#feebc8','#c05621');return}

  // Safety: disable deprecate when partially selected (would delete unselected models)
  const isPartial=selectedEntries.length<__allEntries.length;
  const safeDeprecate=deprecate&&!isPartial;
  const cntMsg=selectedEntries.length+(selectedUm.length?' + '+selectedUm.length+' 新增':'');
  if(deprecate&&isPartial){
    showStatus('部分选择（'+cntMsg+'/'+__allEntries.length+'）已自动关闭「软删除」。'+(isDryRun?'正在预览...':'正在同步...'),'#ebf8ff','#2b6cb0');
  }else{
    showStatus(isDryRun?'正在预览 '+cntMsg+' 个模型...':'正在执行同步 '+cntMsg+' 个模型...','#ebf8ff','#2b6cb0');
  }
  execBtn.style.display='none';

  try{
    const body={mode:'sync',entries:allSelected,dryRun:isDryRun,deprecateUnmatched:safeDeprecate,applyRates:applyRates,profitMargin:applyRates?profitMargin:undefined,creditPrice:applyRates?creditPrice:undefined};

    const resp=await fetch(url+'/api/ai-providers/bulk-rate-update',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify(body),
    });
    const json=await resp.json();
    if(!resp.ok)throw new Error(json.error||resp.statusText);

    const s=json.summary||{};
    const dep=json.deprecated||[];
    const bg=isDryRun?'#ebf8ff':'#c6f6d5';
    const fg=isDryRun?'#2b6cb0':'#276749';
    const prefix=isDryRun?'[预览] ':'[已执行] ';
    showStatus(prefix+'更新 '+s.updated+(s.created?' / 新增 '+s.created:'')+' / 无变化 '+s.unchanged+' / 未匹配 '+s.unmatched+(dep.length?' / 软删除 '+dep.length:''),bg,fg);

    // Show details
    let h='';
    if(json.updated&&json.updated.length){
      h+='<div style="margin-bottom:12px"><strong style="color:#276749">待更新 ('+json.updated.length+')</strong>';
      const hasRates=applyRates&&json.updated.some(u=>u.newInputRate!==undefined||u.newOutputRate!==undefined);
      h+='<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px"><tr style="background:#f7fafc"><th style="padding:6px 10px;text-align:left">Provider</th><th style="padding:6px 10px;text-align:left">Model</th><th style="padding:6px 10px;text-align:right">旧 Input Cost</th><th style="padding:6px 10px;text-align:right">新 Input Cost</th><th style="padding:6px 10px;text-align:right">旧 Output Cost</th><th style="padding:6px 10px;text-align:right">新 Output Cost</th>';
      if(hasRates)h+='<th style="padding:6px 10px;text-align:right">旧 InputRate</th><th style="padding:6px 10px;text-align:right">新 InputRate</th><th style="padding:6px 10px;text-align:right">旧 OutputRate</th><th style="padding:6px 10px;text-align:right">新 OutputRate</th>';
      h+='</tr>';
      json.updated.forEach(u=>{
        h+='<tr style="border-bottom:1px solid #edf2f7"><td style="padding:4px 10px">'+u.provider+'</td><td style="padding:4px 10px">'+u.model+'</td>';
        h+='<td style="padding:4px 10px;text-align:right;color:#a0aec0">'+(u.oldUnitCosts?u.oldUnitCosts.input:'-')+'</td>';
        h+='<td style="padding:4px 10px;text-align:right;font-weight:600">'+u.newUnitCosts.input+'</td>';
        h+='<td style="padding:4px 10px;text-align:right;color:#a0aec0">'+(u.oldUnitCosts?u.oldUnitCosts.output:'-')+'</td>';
        h+='<td style="padding:4px 10px;text-align:right;font-weight:600">'+u.newUnitCosts.output+'</td>';
        if(hasRates){
          h+='<td style="padding:4px 10px;text-align:right;color:#a0aec0">'+(u.oldInputRate!=null?u.oldInputRate:'-')+'</td>';
          h+='<td style="padding:4px 10px;text-align:right;font-weight:600;color:#2b6cb0">'+(u.newInputRate!=null?u.newInputRate:'-')+'</td>';
          h+='<td style="padding:4px 10px;text-align:right;color:#a0aec0">'+(u.oldOutputRate!=null?u.oldOutputRate:'-')+'</td>';
          h+='<td style="padding:4px 10px;text-align:right;font-weight:600;color:#2b6cb0">'+(u.newOutputRate!=null?u.newOutputRate:'-')+'</td>';
        }
        h+='</tr>';
      });
      h+='</table></div>';
    }
    if(json.created&&json.created.length){
      h+='<div style="margin-bottom:12px"><strong style="color:#2b6cb0">待新增 ('+json.created.length+')</strong>';
      const hasRates=applyRates&&json.created.some(c=>c.rates);
      h+='<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px"><tr style="background:#ebf8ff"><th style="padding:6px 10px;text-align:left">Provider</th><th style="padding:6px 10px;text-align:left">Model</th><th style="padding:6px 10px;text-align:left">Type</th><th style="padding:6px 10px;text-align:right">Input Cost</th><th style="padding:6px 10px;text-align:right">Output Cost</th>';
      if(hasRates)h+='<th style="padding:6px 10px;text-align:right">InputRate</th><th style="padding:6px 10px;text-align:right">OutputRate</th>';
      h+='</tr>';
      json.created.forEach(c=>{
        h+='<tr style="border-bottom:1px solid #bee3f8"><td style="padding:4px 10px">'+c.provider+'</td><td style="padding:4px 10px">'+c.model+'</td><td style="padding:4px 10px">'+c.type+'</td>';
        h+='<td style="padding:4px 10px;text-align:right;font-weight:600">'+c.unitCosts.input+'</td>';
        h+='<td style="padding:4px 10px;text-align:right;font-weight:600">'+c.unitCosts.output+'</td>';
        if(hasRates){
          h+='<td style="padding:4px 10px;text-align:right;font-weight:600;color:#2b6cb0">'+(c.rates?c.rates.inputRate:'-')+'</td>';
          h+='<td style="padding:4px 10px;text-align:right;font-weight:600;color:#2b6cb0">'+(c.rates?c.rates.outputRate:'-')+'</td>';
        }
        h+='</tr>';
      });
      h+='</table></div>';
    }
    if(dep.length){
      h+='<div style="margin-bottom:12px"><strong style="color:#9b2c2c">待软删除 ('+dep.length+')</strong>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
      dep.forEach(d=>{h+='<span style="padding:3px 10px;background:#fed7d7;color:#9b2c2c;border-radius:4px;font-size:12px">'+d.provider+'/'+d.model+'</span>'});
      h+='</div></div>';
    }
    if(json.unmatched&&json.unmatched.length){
      h+='<details style="margin-bottom:12px"><summary style="cursor:pointer;font-size:13px;color:#718096">未匹配 ('+json.unmatched.length+')</summary>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">';
      json.unmatched.forEach(u=>{h+='<span style="padding:2px 8px;background:#fefcbf;color:#975a16;border-radius:3px;font-size:11px">'+u.provider+'/'+u.model+(u.reason?' ('+u.reason+')':'')+'</span>'});
      h+='</div></details>';
    }
    result.style.display=h?'block':'none';
    result.innerHTML=h;

    if(isDryRun&&(s.updated>0||dep.length>0||(s.created&&s.created>0)))execBtn.style.display='inline-block';
  }catch(e){
    showStatus('错误: '+e.message,'#fed7d7','#9b2c2c');
    result.style.display='none';
  }
}
function showStatus(msg,bg,fg){
  const el=document.getElementById('sync-status');
  el.style.display='block';el.style.background=bg;el.style.color=fg;el.textContent=msg;
}
// Popover (fixed positioning to avoid section overflow clipping)
let op=null;
function positionPop(trigger,pop){
  const r=trigger.getBoundingClientRect();
  const pw=Math.min(520,window.innerWidth-32);
  let left=r.right-pw;
  if(left<16)left=16;
  // Arrow points to trigger center
  const arrowRight=r.right-left-r.width/2-5;
  const arr=pop.querySelector('.parr');
  if(arr){arr.style.right=Math.max(8,Math.min(arrowRight,pw-16))+'px'}
  // Position below trigger; flip above if not enough space
  const spaceBelow=window.innerHeight-r.bottom;
  if(spaceBelow<300&&r.top>300){
    pop.style.bottom=(window.innerHeight-r.top+6)+'px';
    pop.style.top='';
    if(arr){arr.style.top='';arr.style.bottom='-6px';arr.style.transform='rotate(225deg)'}
  } else {
    pop.style.top=(r.bottom+6)+'px';
    pop.style.bottom='';
    if(arr){arr.style.top='-6px';arr.style.bottom='';arr.style.transform='rotate(45deg)'}
  }
  pop.style.left=left+'px';
}
document.addEventListener('click',e=>{
  if(e.target.closest('.sb-link'))return;
  // Click anywhere in .scol (or .sarea) triggers popover
  const sa=e.target.closest('.sarea');
  const sc=!sa&&!e.target.closest('.pop')&&e.target.closest('.scol');
  const t=sa||(sc?sc.querySelector('.sarea'):null);
  if(t){
    e.stopPropagation();
    const p=document.getElementById(t.dataset.popover);
    if(!p)return;
    if(op&&op!==p)op.classList.remove('open');
    p.classList.toggle('open');
    if(p.classList.contains('open')){positionPop(sa||t,p);op=p}else{op=null}
    return;
  }
  if(e.target.closest('.pop'))return;
  if(op){op.classList.remove('open');op=null}
});
window.addEventListener('scroll',()=>{if(op){op.classList.remove('open');op=null}},true);

// Section collapse
document.querySelectorAll('.sec-h').forEach(h=>h.addEventListener('click',e=>{
  if(e.target.closest('.sb-link'))return;
  h.closest('.sec').classList.toggle('collapsed');
}));

// Sub-table tier toggle (click anywhere on the stbl)
document.addEventListener('click',e=>{
  const tbl=e.target.closest('.stbl');
  if(tbl){e.stopPropagation();tbl.classList.toggle('stbl-collapsed');return}
});

// Global tier toggle
const tierBtn=document.getElementById('tier-toggle');
let tiersExpanded=false;
tierBtn.addEventListener('click',()=>{
  tiersExpanded=!tiersExpanded;
  document.querySelectorAll('.stbl').forEach(t=>t.classList.toggle('stbl-collapsed',!tiersExpanded));
  tierBtn.textContent=tiersExpanded?'折叠变体':'展开变体';
  tierBtn.classList.toggle('active',tiersExpanded);
});

// Search & Filter (summary cards as filter)
const si=document.getElementById('si');
let cf='all',cp='';
document.querySelectorAll('.st[data-f]').forEach(c=>c.addEventListener('click',()=>{
  const f=c.dataset.f;
  if(cf===f){cf='all';c.classList.remove('active')}
  else{document.querySelectorAll('.st[data-f]').forEach(x=>x.classList.remove('active'));c.classList.add('active');cf=f}
  go();
}));
document.querySelectorAll('.pb').forEach(b=>b.addEventListener('click',()=>{
  if(b.classList.contains('active')){b.classList.remove('active');cp=''}
  else{document.querySelectorAll('.pb').forEach(x=>x.classList.remove('active'));b.classList.add('active');cp=b.dataset.p}
  go();
}));
si.addEventListener('input',go);

// --- Read/reviewed state (localStorage) ---
const LS_KEY='aigne-pricing-read';
let readSet=new Set(JSON.parse(localStorage.getItem(LS_KEY)||'[]'));
let hideRead=false;

function applyRead(key,checked){
  if(checked)readSet.add(key);else readSet.delete(key);
  localStorage.setItem(LS_KEY,JSON.stringify([...readSet]));
  document.querySelectorAll('.r1').forEach(r1=>{
    if(r1.dataset.key!==key)return;
    r1.classList.toggle('read-done',checked);
    const r2=r1.nextElementSibling;
    if(r2&&r2.classList.contains('r2'))r2.classList.toggle('read-done',checked);
  });
  go();
  updSelCnt();
}
// Init checkboxes from localStorage
document.querySelectorAll('.rchk-in').forEach(cb=>{
  const k=cb.dataset.rk;
  if(readSet.has(k)){
    cb.checked=true;
    const r1=cb.closest('.r1');
    if(r1){r1.classList.add('read-done');const r2=r1.nextElementSibling;if(r2&&r2.classList.contains('r2'))r2.classList.add('read-done')}
  }
  cb.addEventListener('change',e=>{e.stopPropagation();applyRead(k,cb.checked)});
});
updSelCnt();
// Filter & clear buttons
const readBtn=document.getElementById('read-filter');
readBtn.addEventListener('click',()=>{hideRead=!hideRead;readBtn.classList.toggle('active',hideRead);readBtn.textContent=hideRead?'显示全部':'隐藏已选';go()});
document.getElementById('read-clear').addEventListener('click',()=>{
  readSet.clear();localStorage.removeItem(LS_KEY);
  document.querySelectorAll('.rchk-in').forEach(cb=>{cb.checked=false});
  document.querySelectorAll('.read-done').forEach(el=>el.classList.remove('read-done'));
  go();
});

function go(){
  const q=si.value.toLowerCase().trim();
  const counts={'below-cost':0,drift:0,'no-match':0,normal:0,total:0,unmatched:0};
  document.querySelectorAll('.r1').forEach(r1=>{
    const s=r1.dataset.search.toLowerCase();
    const st=r1.dataset.status;
    const k=r1.dataset.key;
    const prov=s.split('/')[0];
    const isRead=readSet.has(k);
    const vis=(!q||s.includes(q))&&(cf==='all'||st===cf)&&(!cp||prov===cp)&&(!hideRead||!isRead);
    r1.classList.toggle('hidden',!vis);
    const r2=r1.nextElementSibling;
    if(r2&&r2.classList.contains('r2')) r2.classList.toggle('hidden',!vis);
    if(vis){counts[st]=(counts[st]||0)+1;counts.total++}
  });
  // Filter unmatched section rows
  document.querySelectorAll('.um-row').forEach(row=>{
    const s=row.dataset.search.toLowerCase();
    const prov=row.dataset.provider;
    const k=row.dataset.umk;
    const isChecked=umSelSet.has(k);
    const vis=(!q||s.includes(q))&&(cf==='all'||cf==='unmatched')&&(!cp||prov===cp)&&(!hideRead||!isChecked);
    row.classList.toggle('hidden',!vis);
    if(vis)counts.unmatched++;
  });
  // Update provider headers visibility for all sections (including unmatched)
  document.querySelectorAll('.prow').forEach(p=>{
    let n=p.nextElementSibling,v=false;
    while(n&&!n.classList.contains('prow')){
      if((n.classList.contains('r1')||n.classList.contains('um-row'))&&!n.classList.contains('hidden')){v=true;break}
      n=n.nextElementSibling;
    }
    p.classList.toggle('hidden',!v);
  });
  const el=id=>document.getElementById(id);
  el('sum-belowcost').textContent=counts['below-cost'];
  el('sum-drift').textContent=counts.drift;
  el('sum-nomatch').textContent=counts['no-match'];
  el('sum-ok').textContent=counts.normal;
  el('sum-unmatched').textContent=counts.unmatched;
  el('sum-total').textContent=counts.total;
  document.querySelectorAll('.sec').forEach(sec=>{
    const secType=sec.dataset.sec;
    const cnt=sec.querySelector('.sec-cnt');
    if(cnt&&secType)cnt.textContent=counts[secType]||0;
  });
  // Refresh header checkbox state after visibility change
  updUmCnt();
}
</script>
</body>
</html>`;

if (outputFile) {
  fs.writeFileSync(outputFile, html, 'utf-8');
  console.error(`HTML report generated: ${path.resolve(outputFile)}`);
} else {
  process.stdout.write(html);
}
console.error(
  `${belowCostModels.length} below-cost, ${driftModels.length} drift, ${noMatchModels.length} no-match, ${ok.length} normal, ${unmatchedModels.length} unmatched-official, ${data.length} total`
);
