#!/usr/bin/env node
/**
 * Generate HTML report from pricing analysis JSON output
 * Usage: node scripts/generate-html-report.mjs <input.json> <output.html>
 */

import fs from 'fs';
import path from 'path';

const inputFile = process.argv[2] || '/tmp/pricing-clean.json';
const outputFile = process.argv[3] || 'pricing-analysis-report.html';

// Check if model type uses per-unit (per-image/per-video) pricing instead of per-token
function isPerUnitType(type) {
  return type === 'imageGeneration' || type === 'video';
}

// Calculate drift percentage: abs(db - source) / abs(source) * 100
function calcDriftPct(db, source) {
  if (source === 0) return db === 0 ? 0 : 100;
  return Math.abs((db - source) / source) * 100;
}

// Format cost — per-1M-tokens for chat, raw $ for image/video
function formatCost(cost, perUnit = false) {
  if (cost === 0) return '$0.00';
  if (perUnit) return `$${Number(cost).toFixed(4)}`;
  const perMillion = cost * 1000000;
  return `$${perMillion.toFixed(2)}`;
}

// Format selling price with profit margin (售价 + 利润额 + 加价比例)
// Only show margin when cost and rate actually differ
function formatRateWithMargin(cost, rate, perUnit = false) {
  if (rate === undefined) return '<span style="color: #999;">-</span>';
  const rateStr = formatCost(rate, perUnit);
  if (cost === undefined || cost === 0) return rateStr;
  const margin = ((rate - cost) / cost) * 100;
  // If rate ≈ cost (within 1%), just show the price
  if (Math.abs(margin) < 1) return rateStr;
  const multiplier = perUnit ? 1 : 1000000;
  const profit = (rate - cost) * multiplier;
  const color = profit >= 0 ? '#388e3c' : '#d32f2f';
  const sign = profit >= 0 ? '+' : '';
  return `${rateStr} <span style="color: ${color}; font-size: 11px; font-weight: 600;">(${sign}$${profit.toFixed(perUnit ? 4 : 2)}, ${sign}${margin.toFixed(1)}%)</span>`;
}

// Format source comparison (外部源 vs 成本价)
// Only show diff when there IS a meaningful difference
function formatSourceVsCost(dbPrice, sourcePrice, perUnit = false) {
  if (sourcePrice === undefined) return '<span style="color: #999;">-</span>';
  const pct = sourcePrice !== 0 ? ((dbPrice - sourcePrice) / sourcePrice) * 100 : 0;
  // Consistent — just show the price, no annotation
  if (Math.abs(pct) < 1) return formatCost(sourcePrice, perUnit);
  const color = pct > 0 ? '#d32f2f' : '#388e3c';
  const sign = pct > 0 ? '+' : '';
  return `${formatCost(sourcePrice, perUnit)} <span style="color: ${color}; font-weight: 600; font-size: 11px;">(${sign}${pct.toFixed(1)}%)</span>`;
}

// Format source comparison (外部源 vs 售价)
// Only show diff when there IS a meaningful difference
function formatSourceVsRate(rate, sourcePrice, perUnit = false) {
  if (sourcePrice === undefined) return '<span style="color: #999;">-</span>';
  if (rate === undefined) return '<span style="color: #999;">-</span>';
  const pct = sourcePrice !== 0 ? ((rate - sourcePrice) / sourcePrice) * 100 : 0;
  // Consistent — just show the price, no annotation
  if (Math.abs(pct) < 1) return formatCost(sourcePrice, perUnit);
  const color = pct > 0 ? '#388e3c' : '#d32f2f';
  const sign = pct > 0 ? '+' : '';
  return `${formatCost(sourcePrice, perUnit)} <span style="color: ${color}; font-weight: 600; font-size: 11px;">(${sign}${pct.toFixed(1)}%)</span>`;
}

// Read JSON data
const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

// Categorize: models can appear in multiple categories
const PRICING_TOLERANCE = 2;
const costDriftErrors = data.filter((m) => m.exceedsThreshold);
const pricingErrors = data.filter(
  (m) =>
    (m.inputRateIssue !== undefined && m.inputRateIssue < -PRICING_TOLERANCE) ||
    (m.outputRateIssue !== undefined && m.outputRateIssue < -PRICING_TOLERANCE)
);
// Models with missing unitCosts get their own marker
const missingCostModels = data.filter((m) => m.missingUnitCosts);
// "Fully correct" = not in cost drift, not in pricing loss, and not missing unit costs
const fullyCorrect = data.filter(
  (m) =>
    !m.exceedsThreshold &&
    !m.missingUnitCosts &&
    !(m.inputRateIssue !== undefined && m.inputRateIssue < -PRICING_TOLERANCE) &&
    !(m.outputRateIssue !== undefined && m.outputRateIssue < -PRICING_TOLERANCE)
);

// Generate HTML
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIGNE Hub 定价分析报告 - ${new Date().toLocaleDateString('zh-CN')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      color: #333;
      font-size: 14px;
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .header .meta {
      font-size: 1.1rem;
      opacity: 0.9;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 40px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    .stat {
      background: white;
      padding: 25px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .stat:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .stat .number {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .stat.danger .number { color: #dc3545; }
    .stat.warning .number { color: #fd7e14; }
    .stat.success .number { color: #28a745; }
    .stat .label {
      color: #6c757d;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 40px;
    }
    .section-title {
      font-size: 1.8rem;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .badge.danger { background: #dc3545; color: white; }
    .badge.warning { background: #ffc107; color: #000; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-radius: 8px;
      overflow: hidden;
      table-layout: fixed;
    }
    thead {
      background: #667eea;
      color: white;
    }
    th {
      padding: 15px;
      text-align: left;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    tbody tr {
      border-bottom: 1px solid #e9ecef;
      transition: background 0.15s;
    }
    tbody tr:hover {
      background: #f8f9fa;
    }
    td {
      padding: 12px 15px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    td code {
      word-break: break-all;
      white-space: normal;
    }

    .model-type {
      font-size: 16px;
      margin-right: 5px;
    }

    .price-cell {
      line-height: 1.6;
    }
    .price-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 2px 0;
    }
    .price-label {
      color: #666;
      min-width: 35px;
      font-size: 12px;
    }
    .price-value {
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }
    .price-diff {
      font-size: 12px;
    }
    .price-diff.positive { color: #388e3c; }
    .price-diff.negative { color: #d32f2f; }
    .price-diff.neutral { color: #666; }

    .drift-value {
      font-family: 'Courier New', monospace;
      font-weight: 700;
      font-size: 16px;
    }
    .drift-high { color: #d32f2f; }
    .drift-medium { color: #f57c00; }
    .drift-low { color: #fbc02d; }

    .alert {
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid;
      font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .alert.warning {
      background: #fff3cd;
      border-color: #ffc107;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ AIGNE Hub 定价分析报告</h1>
      <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')} | 阈值：成本漂移 10%，售价偏差 ±2%</div>
      <div class="meta" style="margin-top: 5px; font-size: 0.9rem; opacity: 0.8;">数据源：LiteLLM | OpenRouter | Provider 官方定价页</div>
    </div>

    <div class="summary">
      <div class="stat danger">
        <div class="number">${costDriftErrors.length}</div>
        <div class="label">成本漂移问题</div>
      </div>
      <div class="stat warning">
        <div class="number">${pricingErrors.length}</div>
        <div class="label">售价亏损警告</div>
      </div>
      ${
        missingCostModels.length > 0
          ? `<div class="stat" style="border: 2px solid #fd7e14;">
        <div class="number" style="color: #fd7e14;">${missingCostModels.length}</div>
        <div class="label">成本未配置</div>
      </div>`
          : ''
      }
      <div class="stat success">
        <div class="number">${fullyCorrect.length}</div>
        <div class="label">定价正常</div>
      </div>
      <div class="stat">
        <div class="number">${data.length}</div>
        <div class="label">总计检查</div>
      </div>
    </div>

    <div class="content">
      ${
        costDriftErrors.length > 0
          ? `
      <div class="section">
        <div class="section-title">
          ⚠️ 成本漂移问题
          <span class="badge danger">${costDriftErrors.length} 个模型</span>
        </div>
        <p style="color: #666; margin-bottom: 15px; font-size: 13px;">
          以下模型的数据库成本价与外部数据源存在显著差异（超过 10% 阈值）。点击行展开查看详细对比。
        </p>

        <table>
          <thead>
            <tr>
              <th style="width: 18%;">Model</th>
              <th style="width: 9%;">成本价</th>
              <th style="width: 18%;">售价</th>
              <th style="width: 15%;">LiteLLM</th>
              <th style="width: 15%;">OpenRouter</th>
              <th style="width: 15%;">官方定价</th>
              <th style="width: 10%; text-align: center;">最大漂移</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const groupedByProvider = costDriftErrors.reduce((acc, model) => {
                if (!acc[model.provider]) acc[model.provider] = [];
                acc[model.provider].push(model);
                return acc;
              }, {});

              return Object.entries(groupedByProvider)
                .map(([provider, models]) => {
                  const providerRow = `
            <tr style="background: #f0f1f3;">
              <td colspan="7" style="padding: 10px 15px; border-bottom: 2px solid #dee2e6;">
                <strong style="font-size: 13px; color: #495057;">${provider.toUpperCase()}</strong>
                <span style="margin-left: 8px; color: #6c757d; font-size: 12px;">${models.length} 个模型</span>
              </td>
            </tr>`;

                  const modelRows = models
                    .map((model) => {
                      const typeIcon = model.type === 'imageGeneration' ? '🖼️' : model.type === 'video' ? '🎬' : '💬';
                      const pu = isPerUnitType(model.type);
                      const unitLabel =
                        model.pricingUnit === 'per-image' ? '/张' : model.pricingUnit === 'per-second' ? '/秒' : '';

                      let maxTotalDrift = model.maxDrift ? model.maxDrift * 100 : 0;

                      if (maxTotalDrift === 0) {
                        if (model.litellmInput !== undefined) {
                          maxTotalDrift = Math.max(
                            maxTotalDrift,
                            calcDriftPct(model.dbInput, model.litellmInput),
                            pu ? 0 : calcDriftPct(model.dbOutput, model.litellmOutput)
                          );
                        }
                        if (model.openrouterInput !== undefined) {
                          maxTotalDrift = Math.max(
                            maxTotalDrift,
                            calcDriftPct(model.dbInput, model.openrouterInput),
                            pu ? 0 : calcDriftPct(model.dbOutput, model.openrouterOutput)
                          );
                        }
                        if (model.providerPageInput !== undefined) {
                          maxTotalDrift = Math.max(
                            maxTotalDrift,
                            calcDriftPct(model.dbInput, model.providerPageInput),
                            pu ? 0 : calcDriftPct(model.dbOutput, model.providerPageOutput)
                          );
                        }
                        if (model.cacheDrift) maxTotalDrift = Math.max(maxTotalDrift, model.cacheDrift * 100);
                      }

                      const driftClass =
                        maxTotalDrift > 50 ? 'drift-high' : maxTotalDrift > 20 ? 'drift-medium' : 'drift-low';
                      const hasLoss =
                        (model.inputRateIssue !== undefined && model.inputRateIssue < -PRICING_TOLERANCE) ||
                        (model.outputRateIssue !== undefined && model.outputRateIssue < -PRICING_TOLERANCE);
                      const lossBadge = hasLoss
                        ? ' <span class="badge danger" style="font-size: 10px; padding: 2px 6px;">亏损</span>'
                        : '';
                      const unitBadge = unitLabel
                        ? ` <span style="font-size: 10px; padding: 2px 5px; background: #e3f2fd; color: #1565c0; border-radius: 3px;">${unitLabel}</span>`
                        : '';
                      const cacheBadge =
                        model.cacheDrift && model.cacheDrift > 0.1
                          ? ' <span style="font-size: 10px; padding: 2px 5px; background: #fff3e0; color: #e65100; border-radius: 3px;">缓存</span>'
                          : '';

                      // Cache pricing row
                      const cacheRow =
                        model.dbCacheWrite || model.dbCacheRead
                          ? `
                <div style="margin: 4px 0 0; padding-top: 3px; border-top: 1px dashed #e0e0e0;">
                  <div style="margin: 1px 0;"><span style="font-size: 10px; color: #9575cd;">写入:</span> ${formatCost(model.dbCacheWrite || 0)}${model.litellmCacheWrite !== undefined ? ` <span style="font-size: 10px; color: #666;">← LiteLLM: ${formatCost(model.litellmCacheWrite)}</span>` : ''}</div>
                  <div style="margin: 1px 0;"><span style="font-size: 10px; color: #9575cd;">读取:</span> ${formatCost(model.dbCacheRead || 0)}${model.litellmCacheRead !== undefined ? ` <span style="font-size: 10px; color: #666;">← LiteLLM: ${formatCost(model.litellmCacheRead)}</span>` : ''}</div>
                </div>`
                          : '';

                      return `
            <tr>
              <td><span class="model-type">${typeIcon}</span><code>${model.model}</code>${unitBadge}${cacheBadge}${lossBadge}</td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatCost(model.dbInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatCost(model.dbOutput, pu)}</div>
                ${cacheRow}
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatRateWithMargin(model.dbInput, model.inputRate, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatRateWithMargin(model.dbOutput, model.outputRate, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsCost(model.dbInput, model.litellmInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsCost(model.dbOutput, model.litellmOutput, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsCost(model.dbInput, model.openrouterInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsCost(model.dbOutput, model.openrouterOutput, pu)}</div>
              </td>
              <td>
                ${
                  model.providerPageInput !== undefined
                    ? `
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsCost(model.dbInput, model.providerPageInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsCost(model.dbOutput, model.providerPageOutput, pu)}</div>
                ${model.providerPageUrl ? `<div style="margin-top: 3px;"><a href="${model.providerPageUrl}" target="_blank" style="font-size: 10px; color: #667eea; text-decoration: none;">官方页面</a></div>` : ''}
                `
                    : '<div style="color: #999; font-size: 12px; text-align: center;">-</div>'
                }
              </td>
              <td style="text-align: center;">
                <div class="drift-value ${driftClass}">${maxTotalDrift.toFixed(1)}%</div>
              </td>
            </tr>
              `;
                    })
                    .join('');

                  return providerRow + modelRows;
                })
                .join('');
            })()}
          </tbody>
        </table>
      </div>
      `
          : ''
      }

      ${
        pricingErrors.length > 0
          ? `
      <div class="section">
        <div class="section-title">
          🔴 定价亏损警告
          <span class="badge warning">${pricingErrors.length} 个模型</span>
        </div>

        ${(() => {
          const severeCount = pricingErrors.filter(
            (m) =>
              (m.inputRateIssue !== undefined && m.inputRateIssue < -50) ||
              (m.outputRateIssue !== undefined && m.outputRateIssue < -50)
          ).length;
          return severeCount > 0
            ? `
        <div class="alert warning">
          <strong>⚠️ 严重问题：</strong> ${severeCount} 个模型的实际费率低于成本价，系统正在亏本运行！
        </div>
          `
            : '';
        })()}

        <p style="color: #666; margin-bottom: 15px; font-size: 13px;">
          以下模型的售价低于成本价超过 2%，存在亏损风险。
        </p>

        <table>
          <thead>
            <tr>
              <th style="width: 18%;">Model</th>
              <th style="width: 9%;">成本价</th>
              <th style="width: 19%;">售价</th>
              <th style="width: 15%;">LiteLLM</th>
              <th style="width: 15%;">OpenRouter</th>
              <th style="width: 15%;">官方定价</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const groupedByProvider = pricingErrors.reduce((acc, model) => {
                if (!acc[model.provider]) acc[model.provider] = [];
                acc[model.provider].push(model);
                return acc;
              }, {});

              return Object.entries(groupedByProvider)
                .map(([provider, models]) => {
                  const providerRow = `
            <tr style="background: #f0f1f3;">
              <td colspan="6" style="padding: 10px 15px; border-bottom: 2px solid #dee2e6;">
                <strong style="font-size: 13px; color: #495057;">${provider.toUpperCase()}</strong>
                <span style="margin-left: 8px; color: #6c757d; font-size: 12px;">${models.length} 个模型</span>
              </td>
            </tr>`;

                  const modelRows = models
                    .map((model) => {
                      const typeIcon = model.type === 'imageGeneration' ? '🖼️' : model.type === 'video' ? '🎬' : '💬';
                      const pu = isPerUnitType(model.type);

                      return `
            <tr>
              <td><span class="model-type">${typeIcon}</span><code>${model.model}</code></td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatCost(model.dbInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatCost(model.dbOutput, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatRateWithMargin(model.dbInput, model.inputRate, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatRateWithMargin(model.dbOutput, model.outputRate, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsRate(model.inputRate, model.litellmInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsRate(model.outputRate, model.litellmOutput, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsRate(model.inputRate, model.openrouterInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsRate(model.outputRate, model.openrouterOutput, pu)}</div>
              </td>
              <td>
                ${
                  model.providerPageInput !== undefined
                    ? `
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsRate(model.inputRate, model.providerPageInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsRate(model.outputRate, model.providerPageOutput, pu)}</div>
                ${model.providerPageUrl ? `<div style="margin-top: 3px;"><a href="${model.providerPageUrl}" target="_blank" style="font-size: 10px; color: #667eea; text-decoration: none;">官方页面</a></div>` : ''}
                `
                    : '<div style="color: #999; font-size: 12px; text-align: center;">-</div>'
                }
              </td>
            </tr>
              `;
                    })
                    .join('');

                  return providerRow + modelRows;
                })
                .join('');
            })()}
          </tbody>
        </table>

        <p style="margin-top: 15px; color: #666; font-size: 12px;">
          <strong>说明：</strong>此处仅列出售价低于成本价超过 2% 的模型（亏损风险）。括号内显示利润额和加价比例。
        </p>
      </div>
      `
          : ''
      }

      ${
        fullyCorrect.length > 0
          ? `
      <div class="section">
        <div class="section-title">
          ✅ 定价正常
          <span class="badge success" style="background: #e8f5e9; color: #388e3c;">${fullyCorrect.length} 个模型</span>
        </div>
        <p style="color: #666; margin-bottom: 15px; font-size: 13px;">
          以下模型的成本设置准确且售价偏差在 ±2% 范围内。所有定价与外部数据源一致。
        </p>

        <table>
          <thead>
            <tr>
              <th style="width: 18%;">Model</th>
              <th style="width: 9%;">成本价</th>
              <th style="width: 19%;">售价</th>
              <th style="width: 15%;">LiteLLM</th>
              <th style="width: 15%;">OpenRouter</th>
              <th style="width: 15%;">官方定价</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const groupedByProvider = fullyCorrect.reduce((acc, model) => {
                if (!acc[model.provider]) acc[model.provider] = [];
                acc[model.provider].push(model);
                return acc;
              }, {});

              return Object.entries(groupedByProvider)
                .map(([provider, models]) => {
                  const providerRow = `
            <tr style="background: #f0f1f3;">
              <td colspan="6" style="padding: 10px 15px; border-bottom: 2px solid #dee2e6;">
                <strong style="font-size: 13px; color: #495057;">${provider.toUpperCase()}</strong>
                <span style="margin-left: 8px; color: #6c757d; font-size: 12px;">${models.length} 个模型</span>
              </td>
            </tr>`;

                  const modelRows = models
                    .map((model) => {
                      const typeIcon = model.type === 'imageGeneration' ? '🖼️' : model.type === 'video' ? '🎬' : '💬';
                      const pu = isPerUnitType(model.type);

                      return `
            <tr>
              <td><span class="model-type">${typeIcon}</span><code>${model.model}</code></td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatCost(model.dbInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatCost(model.dbOutput, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatRateWithMargin(model.dbInput, model.inputRate, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatRateWithMargin(model.dbOutput, model.outputRate, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsCost(model.dbInput, model.litellmInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsCost(model.dbOutput, model.litellmOutput, pu)}</div>
              </td>
              <td>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsCost(model.dbInput, model.openrouterInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsCost(model.dbOutput, model.openrouterOutput, pu)}</div>
              </td>
              <td>
                ${
                  model.providerPageInput !== undefined
                    ? `
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输入:</span> ${formatSourceVsCost(model.dbInput, model.providerPageInput, pu)}</div>
                <div style="margin: 2px 0;"><span style="font-size: 11px; color: #666;">输出:</span> ${formatSourceVsCost(model.dbOutput, model.providerPageOutput, pu)}</div>
                ${model.providerPageUrl ? `<div style="margin-top: 3px;"><a href="${model.providerPageUrl}" target="_blank" style="font-size: 10px; color: #667eea; text-decoration: none;">官方页面</a></div>` : ''}
                `
                    : '<div style="color: #999; font-size: 12px; text-align: center;">-</div>'
                }
              </td>
            </tr>
              `;
                    })
                    .join('');

                  return providerRow + modelRows;
                })
                .join('');
            })()}
          </tbody>
        </table>
      </div>
      `
          : ''
      }
    </div>
  </div>
</body>
</html>
`;

// Write HTML file
fs.writeFileSync(outputFile, html, 'utf-8');
console.log(`✅ HTML report generated: ${path.resolve(outputFile)}`);
console.log(
  `📊 ${costDriftErrors.length} cost drift, ${pricingErrors.length} pricing loss, ${missingCostModels.length} missing costs, ${fullyCorrect.length} fully correct`
);
