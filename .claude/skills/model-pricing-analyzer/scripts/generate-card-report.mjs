#!/usr/bin/env node
/**
 * Generate card-style HTML pricing report.
 * Coexists with generate-html-report.mjs (table layout).
 * Same data source: analyze-pricing.ts --json
 *
 * Usage: node generate-card-report.mjs <input.json> [output.html]
 *   or:  cat pricing.json | node generate-card-report.mjs - [output.html]
 */

import fs from 'fs';
import path from 'path';

let data, outputFile;
if (process.argv[2] && process.argv[2] !== '-') {
  data = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  outputFile = process.argv[3] || null;
} else {
  data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  outputFile = process.argv[2] === '-' ? process.argv[3] || null : null;
}

// --- Constants ---
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
  if (pricingUnit === 'per-image') return '$' + Number(v).toFixed(4) + '/img';
  if (pricingUnit === 'per-second') return '$' + Number(v).toFixed(4) + '/sec';
  const p = v * 1e6;
  if (p < 0.01) return '$' + p.toExponential(2);
  if (p < 1) return '$' + p.toFixed(3);
  return '$' + p.toFixed(2);
}

function fmtPlain(v, pricingUnit) {
  if (v === undefined || v === null) return '-';
  if (v === 0) return '$0';
  if (pricingUnit === 'per-image') return '$' + Number(v).toFixed(4) + '/img';
  if (pricingUnit === 'per-second') return '$' + Number(v).toFixed(4) + '/sec';
  const p = v * 1e6;
  if (p < 0.01) return '$' + p.toExponential(2);
  if (p < 1) return '$' + p.toFixed(3);
  return '$' + p.toFixed(2);
}

function calcMg(sell, cost) {
  if (sell == null || cost == null || cost === 0) return undefined;
  return ((sell - cost) / cost) * 100;
}

function mgBadge(margin) {
  if (margin === undefined || margin === null) return '';
  if (Math.abs(margin) < 0.05) return '';
  const s = margin >= 0 ? '+' : '';
  const t = s + margin.toFixed(1) + '%';
  const c = Math.abs(margin) <= 2 ? 'mg-even' : margin < 0 ? 'mg-loss' : 'mg-up';
  return `<span class="mg ${c}">${t}</span>`;
}

// --- Categorize (replicated from generate-html-report.mjs) ---
const DTH = 2;
const isPerUnit = (m) => m.pricingUnit === 'per-image' || m.pricingUnit === 'per-second';
const hasDrift = (m) =>
  (!isPerUnit(m) && m.inputMargin != null && Math.abs(m.inputMargin) > DTH) ||
  (m.outputMargin != null && Math.abs(m.outputMargin) > DTH) ||
  (m.exceedsThreshold &&
    m.maxDrift > 0 &&
    !(isPerUnit(m) && m.outputMargin != null && Math.abs(m.outputMargin) <= DTH));
const hasBelowCost = (m) =>
  (m.outputMargin != null && m.outputMargin < -DTH) || (!isPerUnit(m) && m.inputMargin != null && m.inputMargin < -DTH);
const closeEnough = (a, b) => a != null && b != null && b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.005;
const hasNotHighestTier = (m) => {
  const sO = m.outputRate ?? m.dbOutput;
  const sI = m.inputRate ?? m.dbInput;
  if (m.tieredPricing?.length) {
    const hi = m.tieredPricing[m.tieredPricing.length - 1];
    return !(closeEnough(sO, hi.output) && closeEnough(sI, hi.input));
  }
  if (m.resolutionTiers?.length) {
    const maxCost = Math.max(...m.resolutionTiers.map((t) => t.costPerImage));
    return !closeEnough(sO, maxCost);
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

// Split into 4 sections by priority (same logic as generate-html-report.mjs)
// Uses provider/model keys so both reports show identical counts.
const driftModels = data.filter((m) => hasDrift(m));
const driftKeys = new Set(driftModels.map((m) => `${m.provider}/${m.model}`));
const findings = data.filter(
  (m) => !driftKeys.has(`${m.provider}/${m.model}`) && (hasBelowCost(m) || hasNotHighestTier(m) || hasNoData(m))
);
const findingsKeys = new Set(findings.map((m) => `${m.provider}/${m.model}`));
const noOfficial = data.filter(
  (m) => hasNoOfficial(m) && !driftKeys.has(`${m.provider}/${m.model}`) && !findingsKeys.has(`${m.provider}/${m.model}`)
);
const noOfficialKeys = new Set(noOfficial.map((m) => `${m.provider}/${m.model}`));
const ok = data.filter(
  (m) =>
    !driftKeys.has(`${m.provider}/${m.model}`) &&
    !findingsKeys.has(`${m.provider}/${m.model}`) &&
    !noOfficialKeys.has(`${m.provider}/${m.model}`)
);

const allProviders = [...new Set(data.map((m) => m.provider))].sort((a, b) => a.localeCompare(b));

// Assign status to each model
function getStatus(m) {
  const key = `${m.provider}/${m.model}`;
  if (driftKeys.has(key)) return 'drift';
  if (findingsKeys.has(key)) return 'finding';
  if (noOfficialKeys.has(key)) return 'no-official';
  return 'normal';
}

// Count by card status (may differ from array lengths when a provider/model has
// multiple entries, e.g. chatCompletion + imageGeneration for the same model)
const cardCounts = { drift: 0, finding: 0, 'no-official': 0, normal: 0 };
for (const m of data) cardCounts[getStatus(m)]++;

// --- Build card HTML for a single model ---
function buildCard(m) {
  const st = getStatus(m);
  const pu = m.pricingUnit || 'per-token';
  const icon = m.type === 'imageGeneration' ? '🖼️' : m.type === 'video' ? '🎬' : '💬';
  const unit = pu === 'per-image' ? '/img' : pu === 'per-second' ? '/sec' : '';
  const isImg = isPerUnit(m);

  const sO = m.outputRate ?? m.dbOutput;
  const sI = m.inputRate ?? m.dbInput;
  const cO = m.bestCostOutput;
  const cI = m.bestCostInput;

  // Cost source
  const srcLabel = m.bestCostSourceLabel || m.bestCostSource || '';

  // Margins
  const hasTiered = m.tieredPricing?.length > 0;
  const hasRes = m.resolutionTiers?.length > 0;
  let mI, mO;
  if (hasTiered) {
    const hi = m.tieredPricing[m.tieredPricing.length - 1];
    mI = isImg ? undefined : calcMg(sI, hi.input);
    mO = calcMg(sO, hi.output);
  } else if (hasRes) {
    const maxCost = Math.max(...m.resolutionTiers.map((t) => t.costPerImage));
    mI = undefined;
    mO = calcMg(sO, maxCost);
  } else {
    mI = isImg ? undefined : calcMg(sI, cI);
    mO = calcMg(sO, cO);
  }

  // Drift bar
  const drift = m.maxDrift ?? 0;
  const driftPct = Math.min(drift, 100);
  const driftColor = drift > 10 ? '#e53e3e' : drift > 5 ? '#dd6b20' : drift > 2 ? '#d69e2e' : '#38a169';

  // Source badges
  const hasPP = m.providerPageInput !== undefined || m.providerPageOutput !== undefined;
  const hasLL = m.litellmInput !== undefined || m.litellmOutputPerImage !== undefined || m.litellmOutputPerSecond !== undefined;
  const hasOR = m.openrouterInput !== undefined;
  const ppUrl = m.providerPageUrl || PRICING_URLS[m.provider] || '';

  // Detail: data source comparison rows
  let srcRows = '';
  if (hasPP) {
    srcRows += `<tr><td><span class="d-badge d-pp">官方</span></td>`;
    srcRows += `<td class="mono">${isImg ? '-' : fmtPlain(m.providerPageInput, pu)}</td>`;
    srcRows += `<td class="mono">${fmtPlain(m.providerPageOutput, pu)}</td></tr>`;
  }
  if (hasLL) {
    srcRows += `<tr><td><span class="d-badge d-ll">LiteLLM</span></td>`;
    if (pu === 'per-image') {
      srcRows += `<td class="mono">${fmtPlain(m.litellmInput, 'per-token')}</td>`;
      srcRows += `<td class="mono">${fmtPlain(m.litellmOutputPerImage, 'per-image')}</td>`;
    } else if (pu === 'per-second') {
      srcRows += `<td class="mono">${fmtPlain(m.litellmInput, 'per-token')}</td>`;
      srcRows += `<td class="mono">${fmtPlain(m.litellmOutputPerSecond, 'per-second')}</td>`;
    } else {
      srcRows += `<td class="mono">${fmtPlain(m.litellmInput, 'per-token')}</td>`;
      srcRows += `<td class="mono">${fmtPlain(m.litellmOutput, 'per-token')}</td>`;
    }
    srcRows += `</tr>`;
  }
  if (hasOR) {
    srcRows += `<tr><td><span class="d-badge d-or">OpenRouter</span></td>`;
    srcRows += `<td class="mono">${fmtPlain(m.openrouterInput, 'per-token')}</td>`;
    srcRows += `<td class="mono">${fmtPlain(m.openrouterOutput, 'per-token')}</td></tr>`;
  }
  srcRows += `<tr class="d-hub"><td><span class="d-badge d-us">Hub</span></td>`;
  srcRows += `<td class="mono">${isImg ? '-' : fmtPlain(sI, pu)}</td>`;
  srcRows += `<td class="mono">${fmtPlain(sO, pu)}</td></tr>`;

  // Cache info
  let cacheHtml = '';
  const cCW = m.litellmCacheWrite ?? m.officialCacheWrite;
  const cCR = m.litellmCacheRead ?? m.officialCacheRead;
  if (cCW || cCR) {
    cacheHtml = `<div class="d-cache"><span class="d-cache-label">Cache:</span>`;
    if (cCW) cacheHtml += `<span>Write ${fmtPlain(cCW, 'per-token')}</span>`;
    if (cCR) cacheHtml += `<span>Read ${fmtPlain(cCR, 'per-token')}</span>`;
    cacheHtml += `</div>`;
  }
  if (m.officialCacheTiers?.length > 0) {
    cacheHtml += `<div class="d-cache-tiers"><span class="d-cache-label">Cache Tiers:</span>`;
    for (const tier of m.officialCacheTiers) {
      cacheHtml += `<span class="d-tier-item">${tier.label}: <span class="mono">${fmtPlain(tier.costPerToken, 'per-token')}</span></span>`;
    }
    cacheHtml += `</div>`;
  }

  // Tiered pricing
  let tieredHtml = '';
  if (hasTiered) {
    tieredHtml = `<div class="d-tiered"><div class="d-section-title">分层定价</div><table class="d-tbl"><thead><tr><th>阈值</th>${isImg ? '' : '<th>Input</th>'}<th>Output</th></tr></thead><tbody>`;
    const lowestThreshold = m.tieredPricing[0].threshold;
    tieredHtml += `<tr><td>&lt;${lowestThreshold}</td>${isImg ? '' : `<td class="mono">${fmtPlain(cI, pu)}</td>`}<td class="mono">${fmtPlain(cO, pu)}</td></tr>`;
    for (const t of m.tieredPricing) {
      tieredHtml += `<tr><td>&ge;${t.threshold}</td>${isImg ? '' : `<td class="mono">${fmtPlain(t.input, pu)}</td>`}<td class="mono">${fmtPlain(t.output, pu)}</td></tr>`;
    }
    tieredHtml += `</tbody></table></div>`;
  }

  // Resolution tiers
  let resHtml = '';
  if (hasRes) {
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
    resHtml = `<div class="d-tiered"><div class="d-section-title">分辨率定价</div><table class="d-tbl"><thead><tr><th>规格</th><th>费用</th></tr></thead><tbody>`;
    for (const v of merged) {
      const sz = v.size.replace(/x/g, '\u00d7');
      const q = qAbbr[v.quality] || v.quality;
      resHtml += `<tr><td>${q} ${sz}</td><td class="mono">${fmtPlain(v.costPerImage, 'per-image')}</td></tr>`;
    }
    resHtml += `</tbody></table></div>`;
  }

  // Provider page link
  let linkHtml = '';
  if (ppUrl) {
    linkHtml = `<div class="d-link"><a href="${ppUrl}" target="_blank" rel="noopener">官方定价页 &rarr;</a></div>`;
  }

  const driftVal = drift.toFixed(1);

  return `<div class="card card-${st}" data-status="${st}" data-provider="${m.provider}" data-search="${m.provider}/${m.model} ${m.type} ${provName(m.provider)}" data-drift="${drift}" data-model="${m.model}">
  <div class="card-bar bar-${st}"></div>
  <div class="card-body">
    <div class="card-header">
      <div class="card-title">
        <span class="card-icon">${icon}</span>
        <span class="card-model">${m.model}</span>
      </div>
      <div class="card-meta">
        <span class="card-provider">${provName(m.provider)}</span>
        ${hasPP ? '<span class="card-official">官方\u2713</span>' : '<span class="card-no-official">未收录</span>'}
      </div>
    </div>
    <div class="card-unit">${pu}${unit ? ' (' + unit + ')' : ''}</div>

    <div class="card-pricing">
      <div class="card-col card-col-cost">
        <div class="card-col-label">成本</div>
        ${isImg ? '' : `<div class="card-row"><span class="card-row-label">Input</span><span class="mono">${fmt(cI, pu)}</span></div>`}
        <div class="card-row"><span class="card-row-label">Output</span><span class="mono">${fmt(cO, pu)}</span></div>
        ${srcLabel ? `<div class="card-source-label">${srcLabel}</div>` : ''}
      </div>
      <div class="card-col card-col-sell">
        <div class="card-col-label">售价</div>
        ${isImg ? '' : `<div class="card-row"><span class="card-row-label">Input</span><span class="mono">${fmt(sI, pu)}</span>${mgBadge(mI)}</div>`}
        <div class="card-row"><span class="card-row-label">Output</span><span class="mono">${fmt(sO, pu)}</span>${mgBadge(mO)}</div>
      </div>
    </div>

    ${drift > 0 ? `
    <div class="card-drift">
      <div class="card-drift-header">
        <span>Drift</span>
        <span class="mono" style="color:${driftColor}">${driftVal}%</span>
      </div>
      <div class="drift-bar-bg">
        <div class="drift-bar-fill" style="width:${driftPct}%;background:${driftColor}"></div>
      </div>
    </div>` : ''}

    <button class="card-expand-btn" onclick="this.closest('.card').classList.toggle('expanded')">
      <span class="expand-icon">\u25BC</span> <span class="expand-text">展开详情</span>
    </button>
  </div>

  <div class="card-detail">
    <div class="d-section-title">数据源对比</div>
    <table class="d-tbl">
      <thead><tr><th>来源</th><th>Input</th><th>Output</th></tr></thead>
      <tbody>${srcRows}</tbody>
    </table>
    ${cacheHtml}
    ${tieredHtml}
    ${resHtml}
    ${linkHtml}
  </div>
</div>`;
}

// Build cards grouped by status
const groups = [
  { key: 'drift', label: '漂移过大', sub: 'DB 售价与外部数据源偏差超过阈值', color: '#e53e3e', bg: '#fff5f5', border: '#feb2b2', models: data.filter((m) => getStatus(m) === 'drift') },
  { key: 'finding', label: '需关注', sub: '售价低于成本、未对标最高定价层、或完全无外部数据', color: '#dd6b20', bg: '#fffaf0', border: '#fbd38d', models: data.filter((m) => getStatus(m) === 'finding') },
  { key: 'no-official', label: '官方未收录', sub: '未在官方定价页找到，请自行查阅官网确认', color: '#d69e2e', bg: '#fffff0', border: '#fefcbf', models: data.filter((m) => getStatus(m) === 'no-official') },
  { key: 'normal', label: '定价正常', sub: '定价在合理范围内', color: '#38a169', bg: '#f0fff4', border: '#c6f6d5', models: data.filter((m) => getStatus(m) === 'normal') },
];

function buildGroupSection(g) {
  if (!g.models.length) return '';
  const cards = g.models.map((m) => buildCard(m)).join('\n');
  return `
  <div class="group-section" data-group="${g.key}" style="background:${g.bg};border-color:${g.border}">
    <div class="group-header" style="border-color:${g.border}">
      <div class="group-header-left">
        <span class="group-dot" style="background:${g.color}"></span>
        <h2 class="group-title">${g.label}</h2>
        <span class="group-cnt" style="background:${g.color}">${g.models.length}</span>
        <span class="group-sub">${g.sub}</span>
      </div>
      <span class="group-chevron">&#9660;</span>
    </div>
    <div class="group-body">
      <div class="card-grid">${cards}</div>
    </div>
  </div>`;
}

const allSections = groups.map((g) => buildGroupSection(g)).join('\n');

// Provider chips
const provChips = allProviders.map((p) => `<button class="chip chip-prov" data-p="${p}">${provName(p)}</button>`).join('\n      ');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIGNE Hub 定价报告 (卡片) - ${new Date().toLocaleDateString('zh-CN')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC',sans-serif;background:#f0f2f5;color:#2d3748;font-size:15px;line-height:1.5;min-height:100vh}

.wrap{max-width:1600px;margin:0 auto;padding:24px}

/* Header */
.hdr{background:linear-gradient(135deg,#2d3748 0%,#4a5568 100%);color:#fff;padding:32px 40px;border-radius:16px;margin-bottom:24px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
.hdr h1{font-size:1.8rem;font-weight:700;margin-bottom:6px}
.hdr .sub{font-size:.92rem;opacity:.8;line-height:1.6}

/* Summary */
.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:24px}
@media(max-width:800px){.summary{grid-template-columns:repeat(3,1fr)}}
@media(max-width:500px){.summary{grid-template-columns:repeat(2,1fr)}}
.sum-card{background:#fff;padding:20px;border-radius:12px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;transition:transform .15s,box-shadow .15s;cursor:default}
.sum-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1)}
.sum-n{font-size:2rem;font-weight:700;margin-bottom:2px}
.sum-l{color:#718096;font-size:.88rem}
.sum-drift .sum-n{color:#e53e3e}
.sum-finding .sum-n{color:#dd6b20}
.sum-nooff .sum-n{color:#d69e2e}
.sum-ok .sum-n{color:#38a169}

/* Toolbar */
.toolbar{background:#fff;padding:16px 20px;border-radius:12px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;position:sticky;top:0;z-index:100;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.search-input{flex:1;min-width:180px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;outline:none;background:#f7fafc;transition:border-color .15s}
.search-input:focus{border-color:#4a5568;background:#fff}
.tb-sep{width:1px;height:28px;background:#e2e8f0;flex-shrink:0}
.chip{padding:7px 14px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;white-space:nowrap;user-select:none}
.chip:hover{background:#f7fafc;border-color:#cbd5e0}
.chip.active{background:#2d3748;color:#fff;border-color:#2d3748}
.chip-status[data-f="drift"].active{background:#e53e3e;border-color:#e53e3e}
.chip-status[data-f="finding"].active{background:#dd6b20;border-color:#dd6b20}
.chip-status[data-f="no-official"].active{background:#d69e2e;border-color:#d69e2e}
.chip-status[data-f="normal"].active{background:#38a169;border-color:#38a169}
.chip-prov.active{background:#4c51bf;color:#fff;border-color:#4c51bf}
.sort-select{padding:7px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;outline:none}
.tb-label{font-size:12px;color:#718096;font-weight:600;text-transform:uppercase;letter-spacing:.3px}

/* Group Sections */
.group-section{border-radius:14px;border:1px solid #e2e8f0;margin-bottom:20px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)}
.group-section.g-hidden{display:none}
.group-header{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid #e2e8f0;cursor:pointer;user-select:none;transition:filter .12s}
.group-header:hover{filter:brightness(.97)}
.group-header-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.group-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.group-title{font-size:1.1rem;font-weight:700;color:#2d3748;margin:0}
.group-cnt{display:inline-block;padding:2px 10px;border-radius:10px;font-size:.8rem;font-weight:700;color:#fff;min-width:28px;text-align:center}
.group-sub{font-size:12px;color:#718096;font-weight:400}
.group-chevron{font-size:12px;color:#a0aec0;transition:transform .2s;flex-shrink:0}
.group-section.collapsed .group-chevron{transform:rotate(-90deg)}
.group-section.collapsed .group-body{display:none}
.group-body{padding:20px}

/* Card Grid */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px}
@media(max-width:420px){.card-grid{grid-template-columns:1fr}}

/* Card */
.card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;overflow:hidden;transition:transform .18s,box-shadow .18s;position:relative}
.card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.1)}
.card.hidden{display:none}

.card-bar{height:4px;width:100%}
.bar-drift{background:#e53e3e}
.bar-finding{background:#dd6b20}
.bar-no-official{background:#d69e2e}
.bar-normal{background:#38a169}

.card-drift{background:rgba(255,255,255,.95)} .card-finding{background:rgba(255,255,255,.95)}
.card-no-official{background:rgba(255,255,255,.95)} .card-normal{background:rgba(255,255,255,.95)}

.card-body{padding:18px 20px 14px}

.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
.card-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.card-icon{font-size:16px;flex-shrink:0}
.card-model{font-family:'SF Mono',Menlo,'Courier New',monospace;font-size:14px;font-weight:700;color:#1a202c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;margin-left:8px}
.card-provider{font-size:13px;color:#4a5568;font-weight:600}
.card-official{font-size:11px;color:#38a169;font-weight:600;padding:1px 6px;background:#f0fff4;border:1px solid #c6f6d5;border-radius:4px}
.card-no-official{font-size:11px;color:#d69e2e;font-weight:600;padding:1px 6px;background:#fffff0;border:1px solid #fefcbf;border-radius:4px}
.card-unit{font-size:12px;color:#a0aec0;margin-bottom:12px}

.card-pricing{display:flex;gap:1px;background:#e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:10px}
.card-col{flex:1;padding:10px 12px;background:#f7fafc}
.card-col-sell{background:#fafcff}
.card-col-label{font-size:11px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
.card-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.card-row:last-child{margin-bottom:0}
.card-row-label{font-size:12px;color:#a0aec0;font-weight:500;min-width:42px}
.card-source-label{font-size:10px;color:#b0b8c4;margin-top:4px}

.mono{font-family:'SF Mono',Menlo,'Courier New',monospace;font-weight:600;font-size:13.5px}
.na{color:#d0d5dd;font-weight:400}

/* Margin badges */
.mg{display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:600;white-space:nowrap;margin-left:3px}
.mg-up{background:#fed7aa;color:#9a3412}
.mg-loss{background:#fed7d7;color:#c53030}
.mg-even{background:#fefcbf;color:#975a16}

/* Drift bar */
.card-drift{padding:0 0 4px;margin-bottom:6px}
.card-drift-header{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;color:#4a5568;margin-bottom:4px}
.drift-bar-bg{height:6px;background:#edf2f7;border-radius:3px;overflow:hidden}
.drift-bar-fill{height:100%;border-radius:3px;transition:width .3s}

/* Expand button */
.card-expand-btn{width:100%;padding:8px;border:none;background:transparent;color:#718096;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;border-top:1px solid #edf2f7;margin-top:6px;transition:color .15s}
.card-expand-btn:hover{color:#2d3748}
.expand-icon{font-size:10px;transition:transform .2s}
.card.expanded .expand-icon{transform:rotate(180deg)}
.card.expanded .expand-text::after{content:'收起详情'}
.card:not(.expanded) .expand-text::after{content:'展开详情'}
.expand-text{font-size:0}

/* Detail panel */
.card-detail{max-height:0;overflow:hidden;transition:max-height .35s ease;border-top:0 solid #edf2f7;padding:0 20px}
.card.expanded .card-detail{max-height:800px;padding:14px 20px 18px;border-top-width:1px}

.d-section-title{font-size:12px;font-weight:700;color:#4a5568;margin-bottom:6px;text-transform:uppercase;letter-spacing:.3px}
.d-tbl{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px}
.d-tbl th{padding:5px 8px;text-align:left;font-size:11px;font-weight:600;color:#718096;border-bottom:1px solid #edf2f7;background:#f7fafc}
.d-tbl td{padding:5px 8px;border-bottom:1px solid #f5f5f5}
.d-tbl tr:last-child td{border-bottom:none}
.d-hub td{background:#fffbeb}

.d-badge{display:inline-block;padding:1px 7px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid}
.d-pp{background:#e8f5e9;color:#2e7d32;border-color:#a5d6a7}
.d-ll{background:#f3e5f5;color:#7b1fa2;border-color:#ce93d8}
.d-or{background:#e3f2fd;color:#1565c0;border-color:#90caf9}
.d-us{background:#fff3e0;color:#e65100;border-color:#ffcc80}

.d-cache,.d-cache-tiers{font-size:12px;color:#4a5568;margin-bottom:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.d-cache-label{font-weight:600;color:#718096}
.d-tier-item{padding:2px 8px;background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:12px}

.d-tiered{margin-bottom:10px}
.d-link{margin-top:6px}
.d-link a{color:#4299e1;text-decoration:none;font-size:13px;font-weight:500}
.d-link a:hover{text-decoration:underline}

/* Footer */
.footer{text-align:center;padding:24px;color:#a0aec0;font-size:13px}

/* Empty state */
.empty-state{grid-column:1/-1;text-align:center;padding:60px 20px;color:#a0aec0;font-size:16px}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>AIGNE Hub 定价报告</h1>
    <div class="sub">
      生成时间: ${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp;
      成本优先级: 官方 &rarr; OpenRouter &rarr; LiteLLM &nbsp;|&nbsp;
      价格单位: $/1M tokens &middot; 图片 $/img &middot; 视频 $/sec
    </div>
  </div>

  <div class="summary">
    <div class="sum-card sum-drift"><div class="sum-n" id="sn-drift">${cardCounts.drift}</div><div class="sum-l">漂移过大</div></div>
    <div class="sum-card sum-finding"><div class="sum-n" id="sn-finding">${cardCounts.finding}</div><div class="sum-l">需关注</div></div>
    <div class="sum-card sum-nooff"><div class="sum-n" id="sn-nooff">${cardCounts['no-official']}</div><div class="sum-l">官方未收录</div></div>
    <div class="sum-card sum-ok"><div class="sum-n" id="sn-ok">${cardCounts.normal}</div><div class="sum-l">定价正常</div></div>
    <div class="sum-card"><div class="sum-n" id="sn-total">${data.length}</div><div class="sum-l">总计</div></div>
  </div>

  <div class="toolbar">
    <input type="text" class="search-input" placeholder="搜索模型名或 Provider..." id="search-input"/>
    <span class="tb-sep"></span>
    <button class="chip chip-status active" data-f="all">全部</button>
    <button class="chip chip-status" data-f="drift">漂移</button>
    <button class="chip chip-status" data-f="finding">需关注</button>
    <button class="chip chip-status" data-f="no-official">未收录</button>
    <button class="chip chip-status" data-f="normal">正常</button>
    <span class="tb-sep"></span>
    ${provChips}
    <span class="tb-sep"></span>
    <span class="tb-label">排序</span>
    <select class="sort-select" id="sort-select">
      <option value="drift-desc">漂移量 \u2193</option>
      <option value="name-asc">名称 A-Z</option>
      <option value="provider">Provider 分组</option>
    </select>
  </div>

  <div id="sections-container">
    ${allSections}
  </div>

  <div class="footer">
    共 ${data.length} 个模型 &nbsp;|&nbsp;
    ${cardCounts.drift} 漂移 &middot; ${cardCounts.finding} 需关注 &middot; ${cardCounts['no-official']} 未收录 &middot; ${cardCounts.normal} 正常 &nbsp;|&nbsp;
    AIGNE Hub Pricing Analyzer
  </div>
</div>

<script>
const container = document.getElementById('sections-container');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
let currentFilter = 'all';
let currentProvider = '';

// Section collapse toggle
document.querySelectorAll('.group-header').forEach(h => {
  h.addEventListener('click', () => h.closest('.group-section').classList.toggle('collapsed'));
});

// Status filter chips
document.querySelectorAll('.chip-status').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip-status').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.f;
    applyFilters();
  });
});

// Provider filter chips
document.querySelectorAll('.chip-prov').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      currentProvider = '';
    } else {
      document.querySelectorAll('.chip-prov').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentProvider = btn.dataset.p;
    }
    applyFilters();
  });
});

// Search
searchInput.addEventListener('input', applyFilters);

// Sort
sortSelect.addEventListener('change', () => {
  sortCards();
});

function sortCards() {
  const mode = sortSelect.value;
  document.querySelectorAll('.group-section').forEach(sec => {
    const grid = sec.querySelector('.card-grid');
    const cards = [...grid.querySelectorAll('.card')];
    cards.sort((a, b) => {
      if (mode === 'drift-desc') {
        return (parseFloat(b.dataset.drift) || 0) - (parseFloat(a.dataset.drift) || 0);
      } else if (mode === 'name-asc') {
        return a.dataset.model.localeCompare(b.dataset.model);
      } else {
        const pc = a.dataset.provider.localeCompare(b.dataset.provider);
        return pc !== 0 ? pc : a.dataset.model.localeCompare(b.dataset.model);
      }
    });
    for (const c of cards) grid.appendChild(c);
  });
}

function applyFilters() {
  const q = searchInput.value.toLowerCase().trim();
  const counts = { drift: 0, finding: 0, 'no-official': 0, normal: 0, total: 0 };

  document.querySelectorAll('.group-section').forEach(sec => {
    const groupKey = sec.dataset.group;
    let groupVisible = 0;
    const cards = sec.querySelectorAll('.card');
    cards.forEach(card => {
      const search = card.dataset.search.toLowerCase();
      const status = card.dataset.status;
      const prov = card.dataset.provider;
      const vis = (!q || search.includes(q)) &&
        (currentFilter === 'all' || status === currentFilter) &&
        (!currentProvider || prov === currentProvider);
      card.classList.toggle('hidden', !vis);
      if (vis) {
        counts[status] = (counts[status] || 0) + 1;
        counts.total++;
        groupVisible++;
      }
    });
    // Hide entire section if no visible cards
    sec.classList.toggle('g-hidden', groupVisible === 0);
    // Update section header count
    const cnt = sec.querySelector('.group-cnt');
    if (cnt) cnt.textContent = groupVisible;
  });

  document.getElementById('sn-drift').textContent = counts.drift;
  document.getElementById('sn-finding').textContent = counts.finding;
  document.getElementById('sn-nooff').textContent = counts['no-official'];
  document.getElementById('sn-ok').textContent = counts.normal;
  document.getElementById('sn-total').textContent = counts.total;
}

// Initial sort
sortCards();
</script>
</body>
</html>`;

if (outputFile) {
  fs.writeFileSync(outputFile, html, 'utf-8');
  console.error(`Card report generated: ${path.resolve(outputFile)}`);
} else {
  process.stdout.write(html);
}
console.error(
  `${driftModels.length} drift, ${findings.length} findings, ${noOfficial.length} no-official, ${ok.length} normal, ${data.length} total`
);
