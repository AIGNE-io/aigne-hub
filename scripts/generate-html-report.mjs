#!/usr/bin/env node
/**
 * Generate HTML report from pricing analysis JSON output
 * Usage: node scripts/generate-html-report.mjs <input.json> <output.html>
 */

import fs from 'fs';
import path from 'path';

const inputFile = process.argv[2] || '/tmp/pricing-clean.json';
const outputFile = process.argv[3] || 'pricing-analysis-report.html';

// Read JSON data
const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

// Separate drifted and ok models
const drifted = data.filter((m) => m.exceedsThreshold);
const ok = data.filter((m) => !m.exceedsThreshold);

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
      margin-bottom: 10px;
      font-weight: 700;
    }
    .header .subtitle {
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
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .stat-card .number {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .stat-card.danger .number { color: #dc3545; }
    .stat-card.success .number { color: #28a745; }
    .stat-card.info .number { color: #667eea; }
    .stat-card .label {
      color: #6c757d;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .content {
      padding: 40px;
    }
    .section {
      margin-bottom: 50px;
    }
    .section-title {
      font-size: 1.8rem;
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
    .badge.success { background: #28a745; color: white; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-radius: 8px;
      overflow: hidden;
    }
    thead {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
    td {
      padding: 12px 15px;
      border-bottom: 1px solid #e9ecef;
    }
    tbody tr:hover {
      background: #f8f9fa;
    }
    .drift-high { color: #dc3545; font-weight: 700; }
    .drift-medium { color: #fd7e14; font-weight: 600; }
    .drift-low { color: #ffc107; font-weight: 600; }
    .source-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #e9ecef;
      border-radius: 4px;
      font-size: 0.8rem;
      margin-right: 5px;
      color: #495057;
    }
    .price {
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px 40px;
      text-align: center;
      color: #6c757d;
      border-top: 1px solid #e9ecef;
    }
    .alert {
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid;
    }
    .alert.danger {
      background: #f8d7da;
      border-color: #dc3545;
      color: #721c24;
    }
    .alert.warning {
      background: #fff3cd;
      border-color: #ffc107;
      color: #856404;
    }
    .recommendation {
      background: #d1ecf1;
      border: 1px solid #bee5eb;
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
    }
    .recommendation h3 {
      color: #0c5460;
      margin-bottom: 15px;
    }
    .recommendation ol {
      margin-left: 20px;
      color: #0c5460;
    }
    .recommendation li {
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 AIGNE Hub 定价分析报告</h1>
      <div class="subtitle">Staging 环境 | ${new Date().toLocaleString('zh-CN')}</div>
    </div>

    <div class="summary">
      <div class="stat-card danger">
        <div class="number">${drifted.length}</div>
        <div class="label">超过阈值</div>
      </div>
      <div class="stat-card success">
        <div class="number">${ok.length}</div>
        <div class="label">正常模型</div>
      </div>
      <div class="stat-card info">
        <div class="number">${data.length}</div>
        <div class="label">总计检查</div>
      </div>
      <div class="stat-card info">
        <div class="number">10%</div>
        <div class="label">漂移阈值</div>
      </div>
    </div>

    <div class="content">
      ${
        drifted.length > 0
          ? `
      <div class="section">
        <div class="section-title">
          ⚠️ 需要关注的模型
          <span class="badge danger">${drifted.length} 个</span>
        </div>

        ${
          drifted.some((m) => m.maxDrift > 0.99)
            ? `
        <div class="alert danger">
          <strong>🚨 严重警告：</strong> 发现图片生成模型的定价错误高达 <strong>20,000倍</strong>！建议立即修复。
        </div>
        `
            : ''
        }

        ${
          drifted.some((m) => m.maxDrift > 0.5 && m.maxDrift < 0.99)
            ? `
        <div class="alert warning">
          <strong>⚠️ 注意：</strong> 部分模型的定价漂移超过 50%，建议尽快更新。
        </div>
        `
            : ''
        }

        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Model</th>
              <th>Type</th>
              <th>漂移率</th>
              <th>DB Input</th>
              <th>DB Output</th>
              <th>数据源</th>
            </tr>
          </thead>
          <tbody>
            ${drifted
              .map(
                (model) => `
            <tr>
              <td><strong>${model.provider}</strong></td>
              <td><code>${model.model}</code></td>
              <td>${model.type === 'imageGeneration' ? '🖼️ Image' : '💬 Chat'}</td>
              <td class="${model.maxDrift > 0.8 ? 'drift-high' : model.maxDrift > 0.5 ? 'drift-medium' : 'drift-low'}">
                ${(model.maxDrift * 100).toFixed(1)}%
              </td>
              <td class="price">$${model.dbInput.toExponential(3)}</td>
              <td class="price">$${model.dbOutput.toExponential(3)}</td>
              <td>
                ${
                  model.openrouterInput
                    ? `
                  <div style="margin: 3px 0;">
                    <span class="source-tag">OpenRouter</span>
                    <span class="price" style="font-size: 0.85rem;">
                      In: $${model.openrouterInput.toExponential(2)} /
                      Out: $${model.openrouterOutput.toExponential(2)}
                    </span>
                  </div>
                `
                    : ''
                }
                <div style="margin: 3px 0; color: #6c757d; font-size: 0.85rem;">
                  Drift: ${(model.openrouterDrift * 100).toFixed(1)}%
                </div>
              </td>
            </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="recommendation">
          <h3>💡 推荐操作</h3>
          <ol>
            <li><strong>立即修复：</strong>图片生成模型的定价错误（价格差异 20,000倍）</li>
            <li><strong>尽快更新：</strong>漂移率超过 80% 的模型</li>
            <li><strong>建议更新：</strong>漂移率超过 50% 的模型</li>
            <li>使用脚本生成的 bulk-rate-update API 调用进行批量更新</li>
          </ol>
        </div>
      </div>
      `
          : ''
      }

      <div class="section">
        <div class="section-title">
          ✅ 定价正常的模型
          <span class="badge success">${ok.length} 个</span>
        </div>
        <p style="color: #6c757d; margin-bottom: 20px;">
          以下模型的定价与外部数据源（LiteLLM、OpenRouter）的差异在 10% 阈值内，无需调整。
        </p>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Model</th>
              <th>Type</th>
              <th>漂移率</th>
              <th>DB Input</th>
              <th>DB Output</th>
            </tr>
          </thead>
          <tbody>
            ${ok
              .slice(0, 20)
              .map(
                (model) => `
            <tr>
              <td><strong>${model.provider}</strong></td>
              <td><code>${model.model}</code></td>
              <td>${model.type === 'imageGeneration' ? '🖼️ Image' : '💬 Chat'}</td>
              <td style="color: #28a745;">${(model.maxDrift * 100).toFixed(1)}%</td>
              <td class="price">$${model.dbInput.toExponential(3)}</td>
              <td class="price">$${model.dbOutput.toExponential(3)}</td>
            </tr>
            `
              )
              .join('')}
            ${
              ok.length > 20
                ? `
            <tr>
              <td colspan="6" style="text-align: center; color: #6c757d; padding: 20px;">
                ... 还有 ${ok.length - 20} 个模型状态正常 ...
              </td>
            </tr>
            `
                : ''
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">
      <div>生成时间: ${new Date().toLocaleString('zh-CN')}</div>
      <div style="margin-top: 10px;">
        数据源: LiteLLM (2,216 models) | OpenRouter (346 models)
      </div>
      <div style="margin-top: 10px; font-size: 0.9rem;">
        AIGNE Hub Model Pricing Analyzer | Threshold: 10%
      </div>
    </div>
  </div>
</body>
</html>`;

// Write HTML file
fs.writeFileSync(outputFile, html);
console.log(`✅ HTML report generated: ${path.resolve(outputFile)}`);
console.log(`📊 ${drifted.length} models exceed threshold, ${ok.length} models are OK`);
