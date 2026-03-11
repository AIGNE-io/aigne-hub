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

let data, outputFile;
if (process.argv[2] && process.argv[2] !== '-') {
  data = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  outputFile = process.argv[3] || null;
} else {
  data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  outputFile = process.argv[2] === '-' ? process.argv[3] || null : null;
}

const PRICING_URLS = {
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  xai: 'https://docs.x.ai/docs/models',
  openai: 'https://platform.openai.com/docs/pricing',
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

function calcMg(sell, cost) {
  if (sell === undefined || sell === null || cost === undefined || cost === null || cost === 0) return undefined;
  return ((sell - cost) / cost) * 100;
}

// --- Categorize ---
const DTH = 2;
const COLS = 7;
const hasDrift = (m) =>
  (m.inputMargin != null && Math.abs(m.inputMargin) > DTH) ||
  (m.outputMargin != null && Math.abs(m.outputMargin) > DTH);
const hasBelowCost = (m) =>
  (m.outputMargin != null && m.outputMargin < -DTH) || (m.inputMargin != null && m.inputMargin < -DTH);
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
// Models with drift, below-cost, not-highest-tier, or no-data → attention section
const _attnDirect = data.filter((m) => hasDrift(m) || hasBelowCost(m) || hasNotHighestTier(m) || hasNoData(m));
const attnModels = new Set(_attnDirect.map((m) => `${m.provider}/${m.model}`));
const attn = data.filter((m) => attnModels.has(`${m.provider}/${m.model}`));
const ok = data.filter((m) => !attn.includes(m));
const driftN = data.filter(hasDrift).length;
const noN = data.filter(hasNoData).length;

let rid = 0;

function buildSection(models) {
  if (!models.length) return `<tr><td colspan="${COLS}" class="empty">无</td></tr>`;
  const g = {};
  for (const m of models) (g[m.provider] ??= []).push(m);

  let rows = '';
  // Sort providers alphabetically, then models by name within each provider
  const sortedProvs = Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [prov, ms] of sortedProvs) {
    ms.sort((a, b) => a.model.localeCompare(b.model));
    rows += `<tr class="prow"><td colspan="${COLS}"><strong>${provName(prov)}</strong><span class="pcnt">${ms.length}</span></td></tr>`;

    for (const m of ms) {
      const id = rid++;
      const icon = m.type === 'imageGeneration' ? '🖼️' : m.type === 'video' ? '🎬' : '💬';
      const pu = m.pricingUnit || 'per-token';
      const isImage = pu === 'per-image';
      const unit = pu === 'per-image' ? '/张' : pu === 'per-second' ? '/秒' : '';

      const drift = hasDrift(m);
      const noD = hasNoData(m);
      const st = noD ? 'no-data' : drift ? 'drift' : 'normal';
      const dsAttr = `data-status="${st}" data-search="${m.provider}/${m.model} ${m.type}"`;

      // Sell values
      const sO = m.outputRate ?? m.dbOutput;
      const sI = m.inputRate ?? m.dbInput;
      const sCW = m.dbCacheWrite;
      const sCR = m.dbCacheRead;

      // Cost values
      const cO = m.bestCostOutput;
      const cI = m.bestCostInput;
      const cCW = m.litellmCacheWrite;
      const cCR = m.litellmCacheRead;

      // Image models: show "—" for input when value is negligible per-token disguised as per-image
      const fmtIn = (v) => {
        if (isImage) {
          if (v == null || v === 0) return '—';
          // If value is extremely small (< $0.0001), it's a per-token value shown as per-image — hide it
          if (v < 0.0001) return '—';
        }
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
      let mI, mO;
      if (hasMultiCost) {
        const highest = costRows[costRows.length - 1];
        mI = calcMg(sI, highest.input);
        mO = calcMg(sO, highest.output);
      } else {
        mI = calcMg(isImage ? (sI ?? 0) : sI, isImage ? (cI ?? 0) : cI);
        mO = calcMg(sO, cO);
      }
      const mCW = calcMg(sCW, cCW);
      const mCR = calcMg(sCR, cCR);

      // Source badges
      const hasPP = m.providerPageInput !== undefined;
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
          badges += `<a href="${ppUrl}" target="_blank" class="sb-link"><span class="sb ${hasPP ? 'sb-pp' : 'sb-off'}">官方</span></a>`;
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
        pop += `<td class="mono">${fmt(m.providerPageInput, pu)}</td><td class="mono">${fmt(m.providerPageOutput, pu)}</td><td class="na">-</td><td class="na">-</td></tr>`;
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
      pop += `</tbody></table></div>`;

      const modelHtml = `<span class="ti">${icon}</span><code class="mname" title="${m.provider}/${m.model}"><strong>${m.model}</strong></code>${unit ? `<span class="utag">${unit}</span>` : ''}`;
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

        // Bordered cost-only sub-table
        let stbl = `<table class="stbl">`;
        for (let i = 0; i < costRows.length; i++) {
          const cr = costRows[i];
          const isMatch = i === matchIdx;
          const hlCls = isMatch ? (isHighest ? ' stbl-match' : ' stbl-warn') : '';
          stbl += `<tr${hlCls ? ` class="${hlCls}"` : ''}>`;
          stbl += `<td class="stbl-lbl">${cr.label}</td>`;
          if (isTier) stbl += `<td class="stbl-v mono">${fmtIn(cr.input)}</td>`;
          stbl += `<td class="stbl-v mono">${fmt(cr.output, pu)}</td>`;
          stbl += `</tr>`;
        }
        stbl += `</table>`;

        // Sell price line below the table
        const warnCls = sellWarn ? ' sell-line-warn' : '';
        const warnIcon = sellWarn ? ' <span class="sell-warn" title="售价未对标最高成本层">⚠</span>' : '';
        let sellLine = `<div class="sell-line${warnCls}">`;
        sellLine += `<span class="sell-label">当前售价</span>`;
        if (isTier) sellLine += `<span class="mono sell-v">${fmtIn(sI)} ${mg(mI)}</span>`;
        sellLine += `<span class="mono sell-v">${fmt(sO, pu)} ${mg(mO)}</span>`;
        sellLine += warnIcon;
        sellLine += `</div>`;

        rows += `<tr class="mrow r1" ${dsAttr}>`;
        rows += `<td class="mcol">${modelHtml}</td>`;
        rows += `<td class="pc" colspan="3">${stbl}${sellLine}</td>`;
        rows += `<td class="pc"><span class="mono">${fmt(sCW, 'per-token')}</span> ${mg(mCW)}</td>`;
        rows += `<td class="pc"><span class="mono">${fmt(sCR, 'per-token')}</span> ${mg(mCR)}</td>`;
        rows += `<td class="scol">${sourcesHtml}</td>`;
        rows += `</tr>`;
      } else {
        // --- Flat: cost row + sell row ---
        rows += `<tr class="mrow r1" ${dsAttr}>`;
        rows += `<td class="mcol" rowspan="2">${modelHtml}</td>`;
        rows += `<td class="lbl lbl-cost">成本</td>`;
        rows += `<td class="pc mono">${fmtIn(cI)}</td>`;
        rows += `<td class="pc mono">${fmt(cO, pu)}</td>`;
        rows += `<td class="pc mono">${fmt(cCW, 'per-token')}</td>`;
        rows += `<td class="pc mono">${fmt(cCR, 'per-token')}</td>`;
        rows += `<td class="scol" rowspan="2">${sourcesHtml}</td>`;
        rows += `</tr>`;

        rows += `<tr class="mrow r2" ${dsAttr}>`;
        rows += `<td class="lbl lbl-sell">售价</td>`;
        rows += `<td class="pc"><span class="mono">${fmtIn(sI)}</span> ${mg(mI)}</td>`;
        rows += `<td class="pc"><span class="mono">${fmt(sO, pu)}</span> ${mg(mO)}</td>`;
        rows += `<td class="pc"><span class="mono">${fmt(sCW, 'per-token')}</span> ${mg(mCW)}</td>`;
        rows += `<td class="pc"><span class="mono">${fmt(sCR, 'per-token')}</span> ${mg(mCR)}</td>`;
        rows += `</tr>`;
      }
    }
  }
  return rows;
}

const THEAD = `<thead><tr>
  <th style="width:20%">模型</th>
  <th style="width:10%"></th>
  <th style="width:12%">Input</th>
  <th style="width:12%">Output</th>
  <th style="width:11%">Cache Write</th>
  <th style="width:11%">Cache Read</th>
  <th style="width:24%">数据源</th>
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

.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.st{background:#fff;padding:20px;border-radius:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid #e2e8f0}
.st .n{font-size:1.85rem;font-weight:700;margin-bottom:2px}
.st .l{color:#718096;font-size:.88rem}
.st.danger .n{color:#e53e3e}.st.warn .n{color:#dd6b20}.st.ok .n{color:#38a169}

.tb{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.sinput{flex:1;min-width:200px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#fff;outline:none}
.sinput:focus{border-color:#4a5568}
.fb{padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;transition:all .12s}
.fb:hover{background:#f7fafc}
.fb.active{background:#2d3748;color:#fff;border-color:#2d3748}

.sec{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid #e2e8f0;margin-bottom:20px;overflow-x:auto}
.sec-h{padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px}
.sec-h h2{font-size:1.1rem;font-weight:600}
.cnt{display:inline-block;padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600}
.cnt.danger{background:#fed7d7;color:#c53030}.cnt.ok{background:#c6f6d5;color:#276749}

/* Main table */
table.mt{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
table.mt thead{background:#f7fafc;border-bottom:2px solid #e2e8f0}
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
.stbl{width:100%;border-collapse:separate;border-spacing:0;border:2px solid #cbd5e0;border-radius:6px;font-size:13px;overflow:hidden}
.stbl td{padding:4px 10px;border-bottom:1px solid #edf2f7}
.stbl tr:last-child td{border-bottom:none}
.stbl-lbl{font-size:11px;font-weight:600;color:#718096;white-space:nowrap;width:35%}
.stbl-v{text-align:left;white-space:nowrap}

/* Match highlighting */
.stbl-match td{background:#f0fff4}
.stbl-match .stbl-lbl{color:#276749}
.stbl-warn td{background:#fffbeb}
.stbl-warn .stbl-lbl{color:#975a16}

/* Sell price line below cost table */
.sell-line{padding:6px 2px 0;font-size:13px;display:flex;align-items:center;gap:4px}
.sell-label{font-size:11px;font-weight:700;color:#4a5568;white-space:nowrap;min-width:35%;text-transform:uppercase;letter-spacing:.2px}
.sell-v{white-space:nowrap}
.sell-line-warn{color:#975a16}
.sell-line-warn .sell-label{color:#c05621}

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
.scol{position:relative;vertical-align:top !important;padding-top:14px !important}
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

/* Popover */
.pop{display:none;position:absolute;z-index:200;right:0;top:100%;margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.16);min-width:520px;overflow:hidden}
.pop.open{display:block}
.parr{position:absolute;top:-6px;right:22px;width:10px;height:10px;background:#fff;border:1px solid #e2e8f0;border-right:none;border-bottom:none;transform:rotate(45deg)}
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

.empty{padding:20px;text-align:center;color:#a0aec0;font-size:14px}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>AIGNE Hub 定价报告</h1>
    <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp; 成本优先级：官方 → OpenRouter → LiteLLM &nbsp;|&nbsp; $/1M tokens &nbsp;|&nbsp; 图片 $/张 &nbsp;|&nbsp; 视频 $/sec</div>
  </div>

  <div class="summary">
    <div class="st danger"><div class="n">${driftN}</div><div class="l">定价漂移</div></div>
    <div class="st warn"><div class="n">${noN}</div><div class="l">无成本数据</div></div>
    <div class="st ok"><div class="n">${ok.length}</div><div class="l">定价正常</div></div>
    <div class="st"><div class="n">${data.length}</div><div class="l">总计</div></div>
  </div>

  <div class="tb">
    <input type="text" class="sinput" placeholder="搜索模型..." id="si"/>
    <button class="fb active" data-f="all">全部</button>
    <button class="fb" data-f="drift">漂移</button>
    <button class="fb" data-f="no-data">无数据</button>
    <button class="fb" data-f="normal">正常</button>
  </div>

  ${
    attn.length > 0
      ? `
  <div class="sec">
    <div class="sec-h"><h2>需要关注</h2><span class="cnt danger">${attn.length}</span></div>
    <table class="mt">${THEAD}<tbody>${buildSection(attn)}</tbody></table>
  </div>`
      : ''
  }

  <div class="sec">
    <div class="sec-h"><h2>定价正常</h2><span class="cnt ok">${ok.length}</span></div>
    <table class="mt">${THEAD}<tbody>${buildSection(ok)}</tbody></table>
  </div>
</div>

<script>
// Popover
let op=null;
document.addEventListener('click',e=>{
  if(e.target.closest('.sb-link'))return;
  const t=e.target.closest('.sarea');
  if(t){e.stopPropagation();const p=document.getElementById(t.dataset.popover);if(!p)return;if(op&&op!==p)op.classList.remove('open');p.classList.toggle('open');op=p.classList.contains('open')?p:null;return}
  if(e.target.closest('.pop'))return;
  if(op){op.classList.remove('open');op=null}
});

// Search & Filter
const si=document.getElementById('si');
let cf='all';
document.querySelectorAll('.fb').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.fb').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');cf=b.dataset.f;go();
}));
si.addEventListener('input',go);

function go(){
  const q=si.value.toLowerCase().trim();
  document.querySelectorAll('.r1').forEach(r1=>{
    const s=r1.dataset.search.toLowerCase();
    const st=r1.dataset.status;
    const vis=(!q||s.includes(q))&&(cf==='all'||st===cf);
    r1.classList.toggle('hidden',!vis);
    const r2=r1.nextElementSibling;
    if(r2&&r2.classList.contains('r2')) r2.classList.toggle('hidden',!vis);
  });
  document.querySelectorAll('.prow').forEach(p=>{
    let n=p.nextElementSibling,v=false;
    while(n&&!n.classList.contains('prow')){
      if(n.classList.contains('r1')&&!n.classList.contains('hidden')){v=true;break}
      n=n.nextElementSibling;
    }
    p.classList.toggle('hidden',!v);
  });
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
console.error(`${driftN} drift, ${noN} no-data, ${ok.length} normal, ${data.length} total`);
