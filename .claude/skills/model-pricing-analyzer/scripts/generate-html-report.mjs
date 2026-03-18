#!/usr/bin/env node

/**
 * Generate self-contained HTML pricing report.
 * The HTML page fetches all data at runtime and computes comparisons client-side.
 *
 * Usage: node generate-html-report.mjs <outputFile> <hubUrl> [officialPricingPath]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputFile = process.argv[2];
const hubUrl = process.argv[3] || '';
const officialPricingPath = process.argv[4] || '';

if (!outputFile) {
  console.error('Usage: node generate-html-report.mjs <outputFile> <hubUrl> [officialPricingPath]');
  process.exit(1);
}

function stripModuleSyntax(code) {
  return code
    .replace(/^export\s+function\s/gm, 'function ')
    .replace(/^export\s+async\s+function\s/gm, 'async function ')
    .replace(/^export\s+const\s/gm, 'const ')
    .replace(/^export\s+let\s/gm, 'let ')
    .replace(/^import\s+.*$/gm, '// [import removed]');
}

const coreJS = stripModuleSyntax(fs.readFileSync(path.join(__dirname, 'core', 'pricing-core.mjs'), 'utf-8'));
const fetchJS = stripModuleSyntax(fs.readFileSync(path.join(__dirname, 'core', 'fetch-browser.mjs'), 'utf-8'));

let officialPricingData = 'null';
if (officialPricingPath) {
  try {
    officialPricingData = fs.readFileSync(officialPricingPath, 'utf-8').trim();
  } catch (e) {
    console.error(`Warning: Could not read official pricing: ${officialPricingPath}`);
  }
}

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
.quick-prov{border-color:#667eea;color:#667eea;font-size:12px;padding:6px 12px}
.quick-prov.active{background:#667eea;color:#fff;border-color:#667eea}
.pb{padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;transition:all .12s;color:#4a5568}
.pb:hover{background:#edf2f7;border-color:#a0aec0}
.pb.active{background:#4c51bf;color:#fff;border-color:#4c51bf}

.sec{border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid #e2e8f0;margin-bottom:20px;overflow-x:auto}
.sec-h{padding:16px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;transition:background .12s;flex-wrap:wrap}
.sec-h:hover{filter:brightness(.97)}
.sec-h h2{font-size:1.1rem;font-weight:600}
.sec-h .sec-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.sec-h .chevron{font-size:12px;color:#a0aec0;transition:transform .2s}
.sec.collapsed .sec-h .chevron{transform:rotate(-90deg)}
.sec.collapsed .sec-body{display:none}
.cnt{display:inline-block;padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600}
.cnt.critical{background:#fed7d7;color:#9b2c2c}.cnt.danger{background:#feebc8;color:#c05621}.cnt.ok{background:#c6f6d5;color:#276749}

.sec-belowcost{background:#fff0f0;border-color:#fc8181}
.sec-belowcost .sec-h{border-color:#fc8181}
.sec-drift{background:#fff5f5;border-color:#feb2b2}
.sec-drift .sec-h{border-color:#feb2b2}
.sec-nomatch{background:#fffff0;border-color:#fefcbf}
.sec-nomatch .sec-h{border-color:#fefcbf}
.sec-ok{background:#f0fff4;border-color:#c6f6d5}
.sec-ok .sec-h{border-color:#c6f6d5}

.sec table.mt thead{background:rgba(255,255,255,.7)}
.sec .prow td{background:rgba(247,250,252,.7)}
.sec .mrow:hover td,.sec .mrow.r1:hover+.mrow.r2 td{background:rgba(255,255,255,.5)}

table.mt{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
table.mt thead{background:#f7fafc;border-bottom:1px solid #e2e8f0}
table.mt th{padding:11px 14px;text-align:left;font-weight:600;color:#4a5568;font-size:.8rem;text-transform:uppercase;letter-spacing:.3px}

.prow td{padding:9px 14px;background:#f7fafc;border-bottom:1px solid #e2e8f0;font-size:13px;color:#4a5568}
.pcnt{margin-left:6px;font-size:12px;color:#a0aec0;font-weight:400}

.mrow td{padding:4px 14px;vertical-align:middle}
.r1 td{border-top:1px solid #edf2f7;padding-top:10px;padding-bottom:2px}
.r1 .mcol{padding-top:10px;padding-bottom:10px}
.r2 td{border-bottom:1px solid #edf2f7;padding-top:2px;padding-bottom:10px}
.mrow.r1:hover td,.mrow.r1:hover+.mrow.r2 td{background:#f7fafc}
.mrow.r2:hover td{background:#f7fafc}
.mrow.hidden,.prow.hidden{display:none}

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

.mcol{word-break:break-all;vertical-align:top !important;padding-top:14px !important}
.ti{font-size:15px;margin-right:3px}
.mname{font-size:13px;color:#4a5568}
.mname strong{color:#1a202c}
.utag{font-size:10px;padding:2px 5px;background:#ebf8ff;color:#2b6cb0;border-radius:3px;margin-left:3px}

.lbl{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;width:44px}
.lbl-cost{color:#718096}
.lbl-sell{color:#2d3748}
.stbl{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #cbd5e0;border-radius:5px;font-size:13px;overflow:hidden;cursor:pointer}
.stbl:hover{border-color:#a0aec0}
.stbl td{padding:3px 10px;border-bottom:1px solid #e2e8f0}
.stbl tr:last-child td{border-bottom:none}
.stbl-lbl{font-size:11px;font-weight:600;color:#718096;white-space:nowrap}
.stbl-v{text-align:left;white-space:nowrap}

.stbl-cur{display:inline-block;width:8px;height:8px;border-radius:50%;background:#38a169;box-shadow:0 0 0 2px rgba(56,161,105,.25);margin-left:6px;vertical-align:middle;cursor:help}
.stbl-warn .stbl-cur{background:#dd6b20;box-shadow:0 0 0 2px rgba(221,107,32,.25)}

.stbl-match td{background:#f0fff4}
.stbl-match .stbl-lbl{color:#276749}
.stbl-warn td{background:#fffbeb}
.stbl-warn .stbl-lbl{color:#975a16}

.stbl-collapsed .stbl-extra{display:none}
.stbl-toggle{color:#a0aec0;font-size:11px;margin-left:6px;vertical-align:middle}
.stbl-arrow{display:inline-block;transition:transform .15s;font-size:10px}
.stbl:not(.stbl-collapsed) .stbl-arrow{transform:rotate(90deg)}

.cache-dual{padding:0 2px 2px;font-size:13px;display:flex;align-items:center;gap:4px;color:#718096}
.stbl-sell td{border-bottom:none !important}
.stbl-sell .stbl-lbl{color:#2d3748;font-weight:700}
.stbl-sell-warn td{background:#fffbeb}
.stbl-sell-warn .stbl-lbl{color:#c05621}

.sell-warn{color:#dd6b20;margin-left:2px;font-size:14px;cursor:help}

.pc{white-space:nowrap}
.mono{font-family:'SF Mono',Menlo,'Courier New',monospace;font-weight:600;font-size:13.5px}
.na{color:#d0d5dd;font-weight:400}

.mg{display:inline-block;padding:1px 7px;border-radius:8px;font-size:11.5px;font-weight:600;white-space:nowrap;margin-left:4px}
.mg.drift{background:#fed7aa;color:#9a3412}
.mg.loss{background:#fed7d7;color:#c53030}
.mg.even{background:#fefcbf;color:#975a16}

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
.um-ll{margin-top:2px;font-size:11px;color:#7b1fa2}
.um-match{font-size:10px;padding:1px 4px;border-radius:4px;background:#e8f5e9;color:#2e7d32}
.um-close{font-size:10px;padding:1px 4px;border-radius:4px;background:#fff3e0;color:#e65100}
.um-diff{font-size:10px;padding:1px 4px;border-radius:4px;background:#fce4ec;color:#c62828}
.sb-link:hover .sb{opacity:.8;text-decoration:underline}
.sb-ext{font-size:10px;margin-left:2px;opacity:.6}
.sb-link:hover .sb-ext{opacity:1}

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

.pcache{padding:8px 12px;background:#f7fafc;border-top:1px solid #edf2f7;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px}
.pcache-h{font-weight:600;color:#4a5568;white-space:nowrap}
.pcache-item{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px}
.pcache-lbl{color:#718096;font-size:11px}

.sec-unmatched{background:#eff6ff;border-color:#90cdf4}
.sec-unmatched .sec-h{border-color:#90cdf4}
.st.info .n{color:#3182ce}
.cnt.info{background:#bee3f8;color:#2b6cb0}
.type-tag{display:inline-block;padding:1px 7px;border-radius:6px;font-size:11px;font-weight:600;background:#edf2f7;color:#4a5568}
.um-row td{padding:8px 14px;border-bottom:1px solid #edf2f7;vertical-align:middle}
.um-row:hover td{background:rgba(255,255,255,.5)}
.um-row.um-checked td{background:rgba(49,130,206,.06)}
.um-row.um-checked:hover td{background:rgba(49,130,206,.10)}
.sec-sel-bar{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#a0aec0;cursor:pointer;margin-right:8px}
.sec-sel-bar:hover{color:#4a5568}
.sec-sel-bar .sec-sel-label{font-size:11px;white-space:nowrap}
.um-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#f7fafc;border-bottom:1px solid #e2e8f0;gap:10px}
.um-toolbar-left{display:flex;align-items:center;gap:8px}
.um-toolbar-right{display:flex;align-items:center;gap:8px}
.um-btn{padding:3px 10px;border:1px solid #90cdf4;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#2b6cb0;transition:all .12s}
.um-btn:hover{background:#ebf8ff;border-color:#63b3ed}
.um-btn-reset{border-color:#e2e8f0;color:#718096}
.um-btn-reset:hover{background:#f7fafc;border-color:#cbd5e0}
.um-btn-quick{background:#ebf8ff;border-color:#63b3ed;color:#2b6cb0;font-weight:600}
.um-btn-quick:hover{background:#bee3f8}
.um-btn-quick.active{background:#3182ce;color:#fff;border-color:#2b6cb0}
.um-sep{width:1px;height:16px;background:#cbd5e0;margin:0 2px}

.empty{padding:20px;text-align:center;color:#a0aec0;font-size:14px}

.no-official{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fff3cd;color:#856404;border:1px solid #ffc107;margin-left:4px;vertical-align:middle}
.cnt.miss{background:#fff3cd;color:#856404}
.st.miss .n{color:#d69e2e}
.sec-sub{font-size:12px;color:#718096;font-weight:400;margin-left:4px}

/* Loading */
.loading-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh}
.loading-spinner{width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:#4a5568;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:20px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-steps{text-align:left;font-size:14px}
.loading-steps .lstep{padding:6px 0;display:flex;align-items:center;gap:8px;color:#a0aec0}
.loading-steps .lstep.done{color:#38a169}
.loading-steps .lstep.active{color:#2d3748;font-weight:600}
.loading-steps .lstep .lcheck{width:18px;text-align:center}
.loading-error{margin-top:20px;padding:16px 24px;background:#fed7d7;color:#9b2c2c;border-radius:8px;max-width:600px}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>AIGNE Hub 定价报告</h1>
    <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp; 成本优先级：官方 → OpenRouter → LiteLLM &nbsp;|&nbsp; $/1M tokens &nbsp;|&nbsp; 图片 $/张 &nbsp;|&nbsp; 视频 $/sec &nbsp;|&nbsp; 点击数据源列可查看各来源详细对比</div>
  </div>

  <div id="loading-area" class="loading-wrap">
    <div class="loading-spinner"></div>
    <div class="loading-steps">
      <div class="lstep active" id="ls-db"><span class="lcheck">○</span> 加载 DB 数据...</div>
      <div class="lstep" id="ls-ll"><span class="lcheck">○</span> 加载 LiteLLM 数据...</div>
      <div class="lstep" id="ls-or"><span class="lcheck">○</span> 加载 OpenRouter 数据...</div>
      <div class="lstep" id="ls-op"><span class="lcheck">○</span> 加载官方定价数据...</div>
      <div class="lstep" id="ls-calc"><span class="lcheck">○</span> 计算比较结果...</div>
      <div class="lstep" id="ls-render"><span class="lcheck">○</span> 渲染报告...</div>
    </div>
    <div id="loading-error" class="loading-error" style="display:none"></div>
  </div>

  <div id="app-content" style="display:none">
    <div id="db-status" style="display:none;padding:10px 18px;border-radius:8px;font-size:13px;margin-bottom:14px;transition:all .3s"></div>
    <div class="summary" id="summary-cards"></div>
    <div class="tb" id="toolbar"></div>
    <div id="sections"></div>

    <div class="sec" id="sync-panel" style="background:#fff;margin-top:24px">
      <div class="sec-h" style="cursor:default;background:linear-gradient(135deg,#2d3748,#4a5568)">
        <h2 style="color:#fff">API 同步面板</h2>
        <span class="sec-sub" style="color:rgba(255,255,255,.7)">预览变更 / 一键同步到数据库</span>
      </div>
      <div class="sec-body" style="padding:20px 24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          <div>
            <label style="font-size:13px;font-weight:600;color:#4a5568;display:block;margin-bottom:6px">API 地址</label>
            <input type="text" id="sync-url" value="" readonly style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f7fafc;color:#4a5568"/>
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
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#718096">利润率%<input type="number" id="sync-margin" value="0" min="0" max="100" step="0.5" style="width:60px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;text-align:center"/></label>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#718096" title="1 积分等于多少美元">积分单价 <span style="cursor:help;color:#a0aec0">&#9432;</span><input type="number" id="sync-credit-price" value="1" min="0.01" step="0.01" style="width:60px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;text-align:center"/></label>
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
          <button onclick="doRefreshDb()" style="padding:6px 14px;background:#ebf8ff;color:#2b6cb0;border:1px solid #bee3f8;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap">刷新 DB 数据</button>
          <span style="flex:1"></span>
          <button id="sync-preview-btn" onclick="doSync(true)" style="padding:10px 24px;background:#4a5568;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .15s">预览变更</button>
          <button id="sync-execute-btn" onclick="doSync(false)" style="padding:10px 24px;background:#38a169;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .15s;display:none">确认执行同步</button>
        </div>
        <div id="sync-status" style="display:none;padding:14px 18px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>
        <div id="sync-result" style="display:none"></div>
      </div>
    </div>
  </div>
</div>

<script>
// ─── Configuration ───────────────────────────────────────────────────────────
var __hubUrl = ${JSON.stringify(hubUrl)};
var __officialPricingFallback = ${officialPricingData};

// ─── Inlined Core ────────────────────────────────────────────────────────────
${coreJS}

// ─── Inlined Browser Fetchers ────────────────────────────────────────────────
${fetchJS}

// ─── Global State ────────────────────────────────────────────────────────────
var __allEntries=[], __umEntries=[];
var __entryMap=new Map(), __umMap=new Map();
var __allResults=[], __warnings=[];
var rid=0;

// ─── Loading Steps ───────────────────────────────────────────────────────────
function setStep(id,state,info){
  var el=document.getElementById('ls-'+id);if(!el)return;
  el.className='lstep '+state;
  var ck=el.querySelector('.lcheck');
  if(state==='done'){ck.textContent='✓';if(info)el.innerHTML='<span class="lcheck">✓</span> '+el.textContent.split('...')[0]+' ✓ <span style="color:#a0aec0;font-weight:400">'+info+'</span>'}
  else if(state==='active'){ck.textContent='◎'}
  else if(state==='error'){ck.textContent='✗';el.style.color='#e53e3e'}
}

// ─── HTML Helpers ────────────────────────────────────────────────────────────
var COLS=8;
var THEAD='<thead><tr><th style="width:19%">模型</th><th style="width:10%"></th><th style="width:12%">Input</th><th style="width:12%">Output</th><th style="width:12%">Cache Write</th><th style="width:11%">Cache Read</th><th style="width:20%">数据源</th><th style="width:4%" title="勾选已审阅的模型，同步时只更新已勾选的">同步</th></tr></thead>';
var typeOrder={chatCompletion:0,lexicon:0.5,embedding:1,imageGeneration:2,video:3};
var typeLabels={chatCompletion:'对话',lexicon:'词典',embedding:'嵌入',imageGeneration:'图像',audio:'音频',video:'视频',fineTuning:'微调',transcription:'转录',tool:'工具'};
var UM_COLS=7;

function fmt(v,pu){return formatPriceHtml(v,pu)}
function mg(margin,field){
  if(margin===undefined||margin===null)return'';
  if(Math.abs(margin)<0.05)return'';
  var s=margin>=0?'+':'';
  var t=s+margin.toFixed(1)+'%';
  var c=Math.abs(margin)<=2?'even':margin<0?'loss':'drift';
  var dmg=field?' data-mg="'+field+'"':'';
  return'<span class="mg '+c+'"'+dmg+'>'+t+'</span>';
}
function cacheSellCell(sell,cost,margin,field){
  var df=field?' data-field="'+field+'"':'';
  var mgField=field==='sell-cw'?'cache-write':field==='sell-cr'?'cache-read':'';
  if(cost>0&&(!sell||sell<=0))
    return'<span class="mg loss"'+(mgField?' data-mg="'+mgField+'"':'')+' title="未设置 cache 价格，可能存在亏损风险">缺失</span>';
  return'<span class="mono"'+df+'>'+fmt(sell,'per-token')+'</span> '+mg(margin,mgField);
}
function buildCacheTierCol(tiers,dbSellVal,cacheField){
  var sorted=[...tiers].sort(function(a,b){return a.costPerToken-b.costPerToken});
  var lastIdx=sorted.length-1;
  var matchIdx=-1;
  for(var i=0;i<sorted.length;i++){if(closeEnough(dbSellVal,sorted[i].costPerToken)){matchIdx=i;break}}
  var isHighest=matchIdx===lastIdx;
  var h='<table class="stbl stbl-collapsed">';
  for(var i=0;i<sorted.length;i++){
    var t=sorted[i];var isMatch=i===matchIdx;
    var hlCls=isMatch?(isHighest?' stbl-match':' stbl-warn'):'';
    var extraCls=i<lastIdx?' stbl-extra':'';
    var cls=(hlCls+extraCls).trim();
    h+='<tr'+(cls?' class="'+cls+'"':'')+'>';
    h+='<td class="stbl-lbl">'+t.label+'</td>';
    var dotTitle=isHighest?'售价与最高 tier 一致':'售价低于最高 tier';
    var dot=isMatch?' <span class="stbl-cur" title="'+dotTitle+'"></span>':'';
    h+='<td class="stbl-v mono">'+fmt(t.costPerToken,'per-token')+dot+'</td></tr>';
  }
  var highestCost=sorted[lastIdx].costPerToken;
  var sellM=calcMargin(dbSellVal??0,highestCost);
  var sellWarn=matchIdx>=0&&!isHighest;
  var sellRowCls=sellWarn?' stbl-sell-warn':'';
  var dfAttr=cacheField?' data-field="'+cacheField+'"':'';
  var mgFieldName=cacheField==='sell-cw'?'cache-write':cacheField==='sell-cr'?'cache-read':'';
  var sellContent=dbSellVal==null||dbSellVal<=0
    ?'<span class="mg loss"'+(mgFieldName?' data-mg="'+mgFieldName+'"':'')+' title="未设置 cache 价格，可能存在亏损风险">缺失</span>'
    :'<span class="mono"'+dfAttr+'>'+fmt(dbSellVal,'per-token')+'</span> '+mg(sellM,mgFieldName);
  var wIco=sellWarn?' <span class="sell-warn" title="当前使用的价格并非最高 tier 定价，可能导致亏损">⚠</span>':'';
  h+='<tr class="stbl-sell'+sellRowCls+'"><td class="stbl-lbl">售价</td><td class="stbl-v">'+sellContent+wIco+'</td></tr>';
  h+='</table>';
  return h;
}

function buildSection(models){
  if(!models.length)return'<tr><td colspan="'+COLS+'" class="empty">无</td></tr>';
  var g={};
  for(var m of models)(g[m.provider]??=[]).push(m);
  var rows='';
  var sortedProvs=Object.entries(g).sort(function(a,b){return a[0].localeCompare(b[0])});
  for(var[prov,ms]of sortedProvs){
    ms.sort(function(a,b){return(typeOrder[a.type]??9)-(typeOrder[b.type]??9)||a.model.localeCompare(b.model)});
    rows+='<tr class="prow" data-provider="'+prov+'"><td colspan="'+COLS+'"><strong>'+provName(prov)+'</strong><span class="pcnt">'+ms.length+'</span></td></tr>';
    for(var m of ms){
      var id=rid++;
      var icon=m.type==='imageGeneration'?'🖼️':m.type==='video'?'🎬':'💬';
      var pu=m.pricingUnit||'per-token';
      var isImage=pu==='per-image';
      var unit=pu==='per-image'?'/张':pu==='per-second'?'/秒':'';
      var st=hasBelowCost(m)||hasNotHighestTier(m)?'below-cost':hasDrift(m)?'drift':hasNoOfficial(m)||hasNoData(m)?'no-match':'normal';
      var mKey=m.provider+'/'+m.model;
      var noOff=hasNoOfficial(m)||hasNoData(m)?' data-noofficial="1"':'';
      var dsAttr='data-status="'+st+'" data-search="'+mKey+' '+m.type+'" data-key="'+mKey+'" data-provider="'+m.provider+'"'+noOff;
      var sO=m.outputRate??m.dbOutput,sI=m.inputRate??m.dbInput;
      var sCW=m.dbCacheWrite,sCR=m.dbCacheRead;
      var cO=m.bestCostOutput,cI=m.bestCostInput;
      var cCW=m.officialCacheWrite??m.litellmCacheWrite;
      var cCR=m.officialCacheRead??m.litellmCacheRead;
      var fmtIn=function(v){return isPerUnitPricing(m)?'—':fmt(v,pu)};
      var costRows=[];
      var hasTieredPricing=m.tieredPricing&&m.tieredPricing.length>0;
      var hasResVariants=m.resolutionTiers&&m.resolutionTiers.length>0;
      if(hasTieredPricing){
        var lowestThreshold=m.tieredPricing[0].threshold;
        costRows.push({label:'&lt;'+lowestThreshold,input:m.bestCostInput,output:m.bestCostOutput});
        for(var t of m.tieredPricing)costRows.push({label:'≥'+t.threshold,input:t.input,output:t.output});
      }else if(hasResVariants){
        var qOrder={low:0,standard:0,medium:1,high:2,hd:2};
        var sorted=[...m.resolutionTiers].filter(function(v){return v.costPerImage>0}).sort(function(a,b){return(qOrder[a.quality]??0)-(qOrder[b.quality]??0)||a.costPerImage-b.costPerImage});
        var merged=[];
        for(var v of sorted){if(!merged.find(function(e){return e.quality===v.quality&&Math.abs(e.costPerImage-v.costPerImage)<0.0001}))merged.push({...v})}
        var qAbbr={standard:'std',high:'HD',hd:'HD',medium:'med',low:'low'};
        for(var v of merged){var sz=v.size.replace(/x/g,'×');var q=qAbbr[v.quality]||v.quality;costRows.push({label:q+' '+sz,input:undefined,output:v.costPerImage})}
      }
      var hasMultiCost=costRows.length>0;
      var mI,mO;
      if(hasMultiCost){var highest=costRows[costRows.length-1];mI=isPerUnitPricing(m)?undefined:calcMargin(sI,highest.input);mO=calcMargin(sO,highest.output)}
      else{mI=isPerUnitPricing(m)?undefined:calcMargin(sI,cI);mO=calcMargin(sO,cO)}
      var mCW=calcMargin(sCW,cCW),mCR=calcMargin(sCR,cCR);
      var _cwTiers=(m.officialCacheTiers||[]).filter(function(t){return t.label.includes('write')});
      var _crTiers=(m.officialCacheTiers||[]).filter(function(t){return t.label==='read'||t.label==='cached-input'});
      var cwSubTbl=_cwTiers.length>1?buildCacheTierCol(_cwTiers,sCW,'sell-cw'):null;
      var crSubTbl=_crTiers.length>1?buildCacheTierCol(_crTiers,sCR,'sell-cr'):null;
      var hasPP=m.providerPageInput!==undefined||m.providerPageOutput!==undefined;
      var hasLL=m.litellmInput!==undefined||m.litellmOutputPerImage!==undefined||m.litellmOutputPerSecond!==undefined;
      var hasOR=m.openrouterInput!==undefined;
      var isOR=m.provider==='openrouter';
      var ppUrl=m.providerPageUrl||PRICING_URLS[m.provider]||'';
      var badges='';
      if(isOR){badges+='<a href="https://openrouter.ai" target="_blank" class="sb-link"><span class="sb '+(hasOR?'sb-or':'sb-off')+'">OpenRouter</span></a>';badges+='<span class="sb '+(hasLL?'sb-ll':'sb-off')+'">LiteLLM</span>'}
      else{if(ppUrl)badges+='<a href="'+ppUrl+'" target="_blank" class="sb-link"><span class="sb '+(hasPP?'sb-pp':'sb-off')+'">官方<span class="sb-ext">↗</span></span></a>';else badges+='<span class="sb '+(hasPP?'sb-pp':'sb-off')+'">官方</span>';badges+='<span class="sb '+(hasLL?'sb-ll':'sb-off')+'">LiteLLM</span>';badges+='<span class="sb '+(hasOR?'sb-or':'sb-off')+'">OpenRouter</span>'}
      var pop='<div class="pop" id="pop-'+id+'"><div class="parr"></div><div class="phd">'+m.provider+'/'+m.model+'</div>';
      pop+='<table class="ptbl"><thead><tr><th>来源</th><th>Input</th><th>Output</th><th>Cache Write</th><th>Cache Read</th></tr></thead><tbody>';
      if(hasPP){pop+='<tr><td><span class="sb sb-pp">官方</span>'+(m.providerPageUrl?' <a href="'+m.providerPageUrl+'" target="_blank" class="lk">↗</a>':'')+'</td>';pop+='<td class="mono">'+fmt(m.providerPageInput,pu)+'</td><td class="mono">'+fmt(m.providerPageOutput,pu)+'</td>';pop+='<td class="mono">'+(m.officialCacheWrite?fmt(m.officialCacheWrite,'per-token'):'<span class="na">-</span>')+'</td>';pop+='<td class="mono">'+(m.officialCacheRead?fmt(m.officialCacheRead,'per-token'):'<span class="na">-</span>')+'</td></tr>'}
      if(hasLL){pop+='<tr><td><span class="sb sb-ll">LiteLLM</span></td>';if(pu==='per-image')pop+='<td class="mono">'+fmt(m.litellmInput,'per-token')+'</td><td class="mono">'+fmt(m.litellmOutputPerImage,'per-image')+'</td>';else if(pu==='per-second')pop+='<td class="mono">'+fmt(m.litellmInput,'per-token')+'</td><td class="mono">'+fmt(m.litellmOutputPerSecond,'per-second')+'</td>';else pop+='<td class="mono">'+fmt(m.litellmInput,'per-token')+'</td><td class="mono">'+fmt(m.litellmOutput,'per-token')+'</td>';pop+='<td class="mono">'+fmt(m.litellmCacheWrite,'per-token')+'</td><td class="mono">'+fmt(m.litellmCacheRead,'per-token')+'</td></tr>'}
      if(hasOR){pop+='<tr><td><span class="sb sb-or">OpenRouter</span></td><td class="mono">'+fmt(m.openrouterInput,'per-token')+'</td><td class="mono">'+fmt(m.openrouterOutput,'per-token')+'</td><td class="na">-</td><td class="na">-</td></tr>'}
      pop+='<tr class="psell"><td><span class="sb sb-us">Hub</span></td><td class="mono">'+fmtIn(sI)+'</td><td class="mono">'+fmt(sO,pu)+'</td><td class="mono">'+fmt(sCW,'per-token')+'</td><td class="mono">'+fmt(sCR,'per-token')+'</td></tr>';
      pop+='</tbody></table>';
      if(m.officialCacheTiers&&m.officialCacheTiers.length>0){pop+='<div class="pcache"><span class="pcache-h">官方 Cache Tiers</span>';for(var tier of m.officialCacheTiers)pop+='<span class="pcache-item"><span class="pcache-lbl">'+tier.label+'</span><span class="mono">'+fmt(tier.costPerToken,'per-token')+'</span></span>';pop+='</div>'}
      pop+='</div>';
      var modelHtml='<span class="ti">'+icon+'</span><code class="mname" title="'+m.provider+'/'+m.model+'"><strong>'+m.model+'</strong></code>'+(unit?'<span class="utag">'+unit+'</span>':'');
      var checkHtml='<label class="rchk" title="选中同步"><input type="checkbox" class="rchk-in" data-rk="'+mKey+'"/><span class="rchk-box"></span></label>';
      var sourcesHtml='<div class="sarea" data-popover="pop-'+id+'">'+badges+'</div>'+pop;
      if(hasMultiCost){
        var matchIdx_=-1;
        for(var i=0;i<costRows.length;i++){var cr=costRows[i];if(hasTieredPricing){if(closeEnough(sO,cr.output)&&closeEnough(sI,cr.input)){matchIdx_=i;break}}else{if(closeEnough(sO,cr.output)){matchIdx_=i;break}}}
        var isHighest_=matchIdx_===costRows.length-1;
        var isTier=hasTieredPricing;var sellWarn=matchIdx_>=0&&!isHighest_;
        var lastIdx_=costRows.length-1;
        var stbl='<table class="stbl stbl-collapsed">';
        for(var i=0;i<costRows.length;i++){var cr=costRows[i];var isMatch=i===matchIdx_;var hlCls=isMatch?(isHighest_?' stbl-match':' stbl-warn'):'';var extraCls=i<lastIdx_?' stbl-extra':'';var classes=(hlCls+extraCls).trim();stbl+='<tr'+(classes?' class="'+classes+'"':'')+'>';stbl+='<td class="stbl-lbl">'+cr.label+'</td>';if(isTier)stbl+='<td class="stbl-v mono">'+fmtIn(cr.input)+'</td>';var vx='';if(i===lastIdx_&&lastIdx_>0)vx+=' <span class="stbl-toggle"><span class="stbl-arrow">▸</span></span>';var dotTitle=isHighest_?'售价与最高 tier 一致':'售价低于最高 tier';if(isMatch)vx+=' <span class="stbl-cur" title="'+dotTitle+'"></span>';stbl+='<td class="stbl-v mono">'+fmt(cr.output,pu)+vx+'</td></tr>'}
        var sellRowCls=sellWarn?' stbl-sell-warn':'';var sellWarnIco=sellWarn?' <span class="sell-warn" title="当前使用的价格并非最高 tier 定价，可能导致亏损">⚠</span>':'';
        stbl+='<tr class="stbl-sell'+sellRowCls+'"><td class="stbl-lbl">售价</td>';
        if(isTier)stbl+='<td class="stbl-v"><span class="mono" data-field="sell-in">'+fmtIn(sI)+'</span> '+mg(mI,'input')+'</td>';
        stbl+='<td class="stbl-v"><span class="mono" data-field="sell-out">'+fmt(sO,pu)+'</span> '+mg(mO,'output')+sellWarnIco+'</td></tr></table>';
        rows+='<tr class="mrow r1" '+dsAttr+'><td class="mcol">'+modelHtml+'</td><td class="pc" colspan="3">'+stbl+'</td>';
        rows+=cwSubTbl?'<td class="pc">'+cwSubTbl+'</td>':'<td class="pc"><div class="cache-dual mono">'+fmt(cCW,'per-token')+'</div><div class="cache-dual">'+cacheSellCell(sCW,cCW,mCW,'sell-cw')+'</div></td>';
        rows+=crSubTbl?'<td class="pc">'+crSubTbl+'</td>':'<td class="pc"><div class="cache-dual mono">'+fmt(cCR,'per-token')+'</div><div class="cache-dual">'+cacheSellCell(sCR,cCR,mCR,'sell-cr')+'</div></td>';
        rows+='<td class="scol">'+sourcesHtml+'</td><td class="ck-col">'+checkHtml+'</td></tr>';
      }else{
        rows+='<tr class="mrow r1" '+dsAttr+'><td class="mcol" rowspan="2">'+modelHtml+'</td><td class="lbl lbl-cost">成本</td><td class="pc mono">'+fmtIn(cI)+'</td><td class="pc mono">'+fmt(cO,pu)+'</td>';
        rows+=cwSubTbl?'<td class="pc" rowspan="2">'+cwSubTbl+'</td>':'<td class="pc mono">'+fmt(cCW,'per-token')+'</td>';
        rows+=crSubTbl?'<td class="pc" rowspan="2">'+crSubTbl+'</td>':'<td class="pc mono">'+fmt(cCR,'per-token')+'</td>';
        rows+='<td class="scol" rowspan="2">'+sourcesHtml+'</td><td class="ck-col" rowspan="2">'+checkHtml+'</td></tr>';
        rows+='<tr class="mrow r2" '+dsAttr+'><td class="lbl lbl-sell">售价</td><td class="pc"><span class="mono" data-field="sell-in">'+fmtIn(sI)+'</span> '+mg(mI,'input')+'</td><td class="pc"><span class="mono" data-field="sell-out">'+fmt(sO,pu)+'</span> '+mg(mO,'output')+'</td>';
        if(!cwSubTbl)rows+='<td class="pc">'+cacheSellCell(sCW,cCW,mCW,'sell-cw')+'</td>';
        if(!crSubTbl)rows+='<td class="pc">'+cacheSellCell(sCR,cCR,mCR,'sell-cr')+'</td>';
        rows+='</tr>';
      }
    }
  }
  return rows;
}

function fmtMTok(v){if(v===undefined||v===null)return'<span class="na">-</span>';if(v===0)return'$0';var p=v*1e6;if(p<0.0001)return'$'+p.toFixed(7);if(p<0.01)return'$'+p.toFixed(5);if(p<1)return'$'+p.toFixed(3);return'$'+p.toFixed(2)}
function umDiffHtml(official,litellm){if(litellm==null)return'';var llStr=fmtMTok(litellm);if(official==null||official===0)return'<div class="um-ll"><span class="mono">'+llStr+'</span> <span class="sb sb-ll">LL</span></div>';var pct=((litellm-official)/official)*100;var abs=Math.abs(pct);var cls=abs<=2?'um-match':abs<=10?'um-close':'um-diff';var sign=pct>=0?'+':'';return'<div class="um-ll"><span class="mono">'+llStr+'</span> <span class="'+cls+'">'+sign+pct.toFixed(1)+'%</span></div>'}
function buildUnmatchedSection(models){
  if(!models.length)return'<tr><td colspan="'+UM_COLS+'" class="empty">无</td></tr>';
  var g={};for(var m of models)(g[m.provider]??=[]).push(m);
  var rows='';
  var sortedProvs=Object.entries(g).sort(function(a,b){return a[0].localeCompare(b[0])});
  for(var[prov,ms]of sortedProvs){
    ms.sort(function(a,b){return(typeOrder[a.modelType]??9)-(typeOrder[b.modelType]??9)||(a.modelId||'').localeCompare(b.modelId||'')});
    rows+='<tr class="prow" data-provider="'+prov+'"><td colspan="'+UM_COLS+'"><strong>'+provName(prov)+'</strong><span class="pcnt">'+ms.length+'</span></td></tr>';
    for(var m of ms){
      var mKey=m.provider+'/'+m.modelId;
      var umId='um-'+mKey.replace(/[^a-zA-Z0-9]/g,'_');
      var typeLabel=typeLabels[m.modelType]||m.modelType||'-';
      var ppUrl=m.sourceUrl||PRICING_URLS[m.provider]||'';
      var cacheHtml='<span class="na">-</span>';
      if(m.cacheTiers&&m.cacheTiers.length>0){var readTier=m.cacheTiers.find(function(t){return t.label==='read'||t.label==='cached-input'});var readVal=readTier?fmtMTok(readTier.costPerToken):fmtMTok(m.cachedInputCostPerToken);var tierDetails=m.cacheTiers.map(function(t){return t.label+': '+fmtMTok(t.costPerToken)}).join('&#10;');cacheHtml='<span class="mono" title="'+tierDetails+'">'+readVal+'</span>'}
      else if(m.cachedInputCostPerToken!=null)cacheHtml='<span class="mono">'+fmtMTok(m.cachedInputCostPerToken)+'</span>';
      var hasLL=m.litellmInput!=null||m.litellmOutput!=null;
      // Build popover
      var pop='<div class="pop" id="pop-'+umId+'"><div class="parr"></div><div class="phd">'+mKey+'</div>';
      pop+='<table class="ptbl"><thead><tr><th>来源</th><th>Input</th><th>Output</th><th>Cache Write</th><th>Cache Read</th></tr></thead><tbody>';
      pop+='<tr><td><span class="sb sb-pp">官方</span>'+(ppUrl?' <a href="'+ppUrl+'" target="_blank" class="lk">↗</a>':'')+'</td>';
      pop+='<td class="mono">'+fmtMTok(m.inputCostPerToken)+'</td><td class="mono">'+fmtMTok(m.outputCostPerToken)+'</td>';
      var officialCW=m.cacheTiers?.find(function(t){return t.label==='write'})?.costPerToken;
      var officialCR=m.cachedInputCostPerToken??(m.cacheTiers?.find(function(t){return t.label==='read'||t.label==='cached-input'})?.costPerToken);
      pop+='<td class="mono">'+(officialCW?fmtMTok(officialCW):'<span class="na">-</span>')+'</td>';
      pop+='<td class="mono">'+(officialCR?fmtMTok(officialCR):'<span class="na">-</span>')+'</td></tr>';
      if(hasLL){pop+='<tr><td><span class="sb sb-ll">LiteLLM</span></td>';pop+='<td class="mono">'+fmtMTok(m.litellmInput)+'</td><td class="mono">'+fmtMTok(m.litellmOutput)+'</td>';pop+='<td class="mono">'+fmtMTok(m.litellmCacheWrite)+'</td><td class="mono">'+fmtMTok(m.litellmCacheRead)+'</td></tr>'}
      pop+='</tbody></table>';
      if(m.cacheTiers&&m.cacheTiers.length>0){pop+='<div class="pcache"><span class="pcache-h">官方 Cache Tiers</span>';for(var tier of m.cacheTiers)pop+='<span class="pcache-item"><span class="pcache-lbl">'+tier.label+'</span><span class="mono">'+fmtMTok(tier.costPerToken)+'</span></span>';pop+='</div>'}
      pop+='</div>';
      // Build badges
      var badges='';
      if(ppUrl)badges+='<a href="'+ppUrl+'" target="_blank" class="sb-link"><span class="sb sb-pp">官方<span class="sb-ext">↗</span></span></a>';
      else badges+='<span class="sb sb-pp">官方</span>';
      if(hasLL)badges+='<span class="sb sb-ll">LiteLLM</span>';
      var sourcesHtml='<div class="sarea" data-popover="pop-'+umId+'">'+badges+'</div>'+pop;
      var checkHtml='<label class="rchk" title="选中"><input type="checkbox" class="um-chk" data-umk="'+mKey+'"/><span class="rchk-box"></span></label>';
      rows+='<tr class="mrow um-row" data-search="'+mKey+' '+(m.modelType||'')+'" data-provider="'+prov+'" data-umk="'+mKey+'">';
      rows+='<td class="mcol"><code class="mname" title="'+mKey+'"><strong>'+m.modelId+'</strong></code></td>';
      rows+='<td><span class="type-tag">'+typeLabel+'</span></td>';
      rows+='<td class="pc"><span class="mono">'+fmtMTok(m.inputCostPerToken)+'</span></td>';
      rows+='<td class="pc"><span class="mono">'+fmtMTok(m.outputCostPerToken)+'</span></td>';
      rows+='<td class="pc">'+cacheHtml+'</td>';
      rows+='<td class="scol">'+sourcesHtml+'</td>';
      rows+='<td class="ck-col">'+checkHtml+'</td></tr>';
    }
  }
  return rows;
}

// ─── Render Full Report ──────────────────────────────────────────────────────
function renderReport(results,groups,unmatchedModels){
  __allResults=results;
  var allProviders=[...new Set([...results.map(function(m){return m.provider}),...unmatchedModels.map(function(m){return m.provider})])].sort();

  // Build sync data
  __allEntries=results.filter(function(m){return m.bestCostInput!==undefined||m.bestCostOutput!==undefined}).map(function(m){return{
    provider:m.provider,modelId:m.model,
    inputCostPerToken:m.bestCostInput??null,outputCostPerToken:m.bestCostOutput??null,
    cachedInputCostPerToken:m.officialCacheRead??m.litellmCacheRead??null,
    cacheTiers:m.officialCacheTiers??(m.litellmCacheWrite||m.litellmCacheRead?[...(m.litellmCacheWrite?[{label:'write',costPerToken:m.litellmCacheWrite}]:[]),...(m.litellmCacheRead?[{label:'read',costPerToken:m.litellmCacheRead}]:[])]:undefined),
    tieredPricing:m.tieredPricing?.length?m.tieredPricing:undefined,
    resolutionTiers:m.resolutionTiers?.length?m.resolutionTiers:undefined,
    modelType:m.type}});
  __entryMap=new Map(__allEntries.map(function(e){return[e.provider+'/'+e.modelId,e]}));
  __umEntries=unmatchedModels.map(function(m){return{
    provider:m.provider,modelId:m.modelId,
    inputCostPerToken:m.inputCostPerToken??null,outputCostPerToken:m.outputCostPerToken??null,
    cachedInputCostPerToken:m.cachedInputCostPerToken??null,
    cacheTiers:m.cacheTiers??undefined,modelType:m.modelType??'chatCompletion',
    pricingUnit:m.pricingUnit??'per-token',costPerImage:m.costPerImage??undefined,costPerSecond:m.costPerSecond??undefined,
    litellmInput:m.litellmInput??undefined,litellmOutput:m.litellmOutput??undefined,
    litellmCacheWrite:m.litellmCacheWrite??undefined,litellmCacheRead:m.litellmCacheRead??undefined,isNew:true}});
  __umMap=new Map(__umEntries.map(function(e){return[e.provider+'/'+e.modelId,e]}));

  // Summary cards
  document.getElementById('summary-cards').innerHTML=
    '<div class="st critical" data-f="below-cost"><div class="n" id="sum-belowcost">'+groups.belowCost.length+'</div><div class="l">高风险成本亏损</div></div>'+
    '<div class="st danger" data-f="drift"><div class="n" id="sum-drift">'+groups.drift.length+'</div><div class="l">漂移量过大</div></div>'+
    '<div class="st miss" data-f="no-match"><div class="n" id="sum-nomatch">'+groups.noMatch.length+'</div><div class="l">未找到官方数据</div></div>'+
    '<div class="st ok" data-f="normal"><div class="n" id="sum-ok">'+groups.normal.length+'</div><div class="l">定价正常</div></div>'+
    '<div class="st info" data-f="unmatched"><div class="n" id="sum-unmatched">'+unmatchedModels.length+'</div><div class="l">官方未录入</div></div>'+
    '<div class="st" data-f="all"><div class="n" id="sum-total">'+results.length+'</div><div class="l">总计</div></div>';

  // Toolbar
  var tbHtml='<input type="text" class="sinput" placeholder="搜索模型..." id="si"/>';
  tbHtml+='<button class="fb tier-btn" id="tier-toggle" title="展开/折叠所有分层定价">展开变体</button>';
  tbHtml+='<button class="fb" id="read-filter">隐藏已选</button>';
  tbHtml+='<button class="fb" id="read-clear" title="清除所有同步选中标记" style="font-size:11px;color:#a0aec0">清除选中</button>';
  tbHtml+='<span class="tb-sep"></span>';
  tbHtml+='<button class="fb quick-prov" id="quick-prov" title="快速选中 Anthropic, Google, OpenAI, xAI, OpenRouter">主要厂商</button>';
  for(var p of allProviders)tbHtml+='<button class="pb" data-p="'+p+'">'+provName(p)+'</button>';
  document.getElementById('toolbar').innerHTML=tbHtml;

  // Sections
  var secHtml='';
  function secBlock(key,cls,title,cntCls,sub,models,builder){
    if(!models.length)return'';
    return'<div class="sec '+cls+'" data-sec="'+key+'"><div class="sec-h"><h2>'+title+'</h2><span class="cnt '+cntCls+' sec-cnt">'+models.length+'</span><span class="sec-sub">'+sub+'</span><span class="sec-right"><span class="sec-sel-bar" onclick="event.stopPropagation()"><span class="sec-sel-label">全选</span><label class="rchk" style="vertical-align:middle"><input type="checkbox" class="sec-chk-all" onchange="toggleSecSync(\\''+key+'\\',this.checked)"/><span class="rchk-box"></span></label></span><span class="chevron">▼</span></span></div><div class="sec-body"><table class="mt">'+THEAD+'<tbody>'+builder(models)+'</tbody></table></div></div>';
  }
  secHtml+=secBlock('below-cost','sec-belowcost','高风险成本亏损','critical','售价低于成本，存在亏损风险',groups.belowCost,buildSection);
  secHtml+=secBlock('drift','sec-drift','漂移量过大','danger','DB 售价与外部数据源偏差超过阈值，或未对标最高定价层',groups.drift,buildSection);
  secHtml+=secBlock('no-match','sec-nomatch','未找到对应的官方输入输出','miss','未匹配到官方或外部数据源，需人工确认',groups.noMatch,buildSection);
  // Normal always shows
  secHtml+='<div class="sec sec-ok" data-sec="normal"><div class="sec-h"><h2>定价正常</h2><span class="cnt ok sec-cnt">'+groups.normal.length+'</span><span class="sec-sub">定价在合理范围内</span><span class="sec-right"><span class="sec-sel-bar" onclick="event.stopPropagation()"><span class="sec-sel-label">全选</span><label class="rchk" style="vertical-align:middle"><input type="checkbox" class="sec-chk-all" onchange="toggleSecSync(\\'normal\\',this.checked)"/><span class="rchk-box"></span></label></span><span class="chevron">▼</span></span></div><div class="sec-body"><table class="mt">'+THEAD+'<tbody>'+buildSection(groups.normal)+'</tbody></table></div></div>';
  // Unmatched
  if(unmatchedModels.length>0){
    secHtml+='<div class="sec sec-unmatched" data-sec="unmatched"><div class="sec-h"><h2>官方可用但未录入</h2><span class="cnt info sec-cnt">'+unmatchedModels.length+'</span><span class="sec-sub">官方定价 + LiteLLM 双源确认，Hub DB 中尚未录入的模型</span><span class="chevron">▼</span></div><div class="sec-body"><div class="um-toolbar" onclick="event.stopPropagation()"><div class="um-toolbar-left"><button class="um-btn um-btn-quick" onclick="toggleUmQuick()">快速筛选</button><button class="um-btn" onclick="toggleUmAll(true)">全选</button><button class="um-btn um-btn-reset" onclick="toggleUmAll(false)">重置</button></div><div class="um-toolbar-right"><span style="font-size:12px;color:#4a5568">已选 <strong id="um-sel-cnt">0</strong></span></div></div><table class="mt"><thead><tr><th style="width:22%">模型</th><th style="width:8%">类型</th><th style="width:14%" title="官方定价 / LiteLLM 对比">Input</th><th style="width:14%" title="官方定价 / LiteLLM 对比">Output</th><th style="width:13%">Cache</th><th style="width:17%">数据源</th><th style="width:4%" title="勾选要操作的模型"><label class="rchk" style="vertical-align:middle" onclick="event.stopPropagation()"><input type="checkbox" id="um-chk-all" onchange="toggleUmAll(this.checked)"/><span class="rchk-box"></span></label></th></tr></thead><tbody>'+buildUnmatchedSection(unmatchedModels)+'</tbody></table></div></div>';
  }

  // Warnings
  if(__warnings.length>0){
    secHtml+='<div style="padding:12px 18px;background:#fffbeb;border:1px solid #fefcbf;border-radius:8px;font-size:13px;color:#975a16;margin-bottom:16px">'+__warnings.join('<br>')+'</div>';
  }

  document.getElementById('sections').innerHTML=secHtml;
  document.getElementById('sync-url').value=__hubUrl;

  // Init all event handlers
  initEventHandlers();
}

// ─── Event Handlers ──────────────────────────────────────────────────────────
var LS_KEY='aigne-pricing-read';
var UM_LS='aigne-pricing-um-sel';
var readSet,umSelSet,hideRead=false,cf='all',cpSet=new Set();
var op=null;

function initEventHandlers(){
  readSet=new Set(JSON.parse(localStorage.getItem(LS_KEY)||'[]'));
  umSelSet=new Set(JSON.parse(localStorage.getItem(UM_LS)||'[]'));

  // Init read checkboxes
  document.querySelectorAll('.rchk-in').forEach(function(cb){
    var k=cb.dataset.rk;
    if(readSet.has(k)){cb.checked=true;var r1=cb.closest('.r1');if(r1){r1.classList.add('read-done');var r2=r1.nextElementSibling;if(r2&&r2.classList.contains('r2'))r2.classList.add('read-done')}}
    cb.addEventListener('change',function(e){e.stopPropagation();applyRead(k,cb.checked)});
  });

  // Init unmatched checkboxes
  document.querySelectorAll('.um-chk').forEach(function(cb){
    var k=cb.dataset.umk;
    if(umSelSet.has(k)){cb.checked=true;var row=cb.closest('.um-row');if(row)row.classList.add('um-checked')}
    cb.addEventListener('change',function(e){e.stopPropagation();applyUmCheck(k,cb.checked)});
  });

  // Summary card filters
  document.querySelectorAll('.st[data-f]').forEach(function(c){c.addEventListener('click',function(){
    var f=c.dataset.f;
    if(cf===f){cf='all';c.classList.remove('active')}
    else{document.querySelectorAll('.st[data-f]').forEach(function(x){x.classList.remove('active')});c.classList.add('active');cf=f}
    go();
  })});

  // Provider buttons
  document.querySelectorAll('.pb').forEach(function(b){b.addEventListener('click',function(){
    b.classList.toggle('active');var p=b.dataset.p;
    if(cpSet.has(p))cpSet.delete(p);else cpSet.add(p);
    document.getElementById('quick-prov').classList.toggle('active',quickProvMatch());
    go();
  })});

  // Quick provider select
  var QUICK_PROVS=['anthropic','google','openai','xai','openrouter'];
  function quickProvMatch(){return QUICK_PROVS.length===cpSet.size&&QUICK_PROVS.every(function(p){return cpSet.has(p)})}
  document.getElementById('quick-prov').addEventListener('click',function(){
    var isActive=quickProvMatch();
    cpSet.clear();
    document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('active')});
    if(!isActive){
      QUICK_PROVS.forEach(function(p){cpSet.add(p)});
      document.querySelectorAll('.pb').forEach(function(b){if(QUICK_PROVS.indexOf(b.dataset.p)!==-1)b.classList.add('active')});
    }
    document.getElementById('quick-prov').classList.toggle('active',!isActive);
    go();
  });

  // Search
  var si=document.getElementById('si');
  if(si)si.addEventListener('input',go);

  // Section collapse
  document.querySelectorAll('.sec-h').forEach(function(h){h.addEventListener('click',function(e){if(e.target.closest('.sb-link'))return;h.closest('.sec').classList.toggle('collapsed')})});

  // Tier toggle
  var tierBtn=document.getElementById('tier-toggle');
  var tiersExpanded=false;
  if(tierBtn)tierBtn.addEventListener('click',function(){tiersExpanded=!tiersExpanded;document.querySelectorAll('.stbl').forEach(function(t){t.classList.toggle('stbl-collapsed',!tiersExpanded)});tierBtn.textContent=tiersExpanded?'折叠变体':'展开变体';tierBtn.classList.toggle('active',tiersExpanded)});

  // Sub-table tier toggle
  document.addEventListener('click',function(e){var tbl=e.target.closest('.stbl');if(tbl){e.stopPropagation();tbl.classList.toggle('stbl-collapsed');return}});

  // Popover
  document.addEventListener('click',function(e){
    if(e.target.closest('.sb-link'))return;
    var sa=e.target.closest('.sarea');var sc=!sa&&!e.target.closest('.pop')&&e.target.closest('.scol');var t=sa||(sc?sc.querySelector('.sarea'):null);
    if(t){e.stopPropagation();var p=document.getElementById(t.dataset.popover);if(!p)return;if(op&&op!==p)op.classList.remove('open');p.classList.toggle('open');if(p.classList.contains('open')){positionPop(sa||t,p);op=p}else{op=null}return}
    if(e.target.closest('.pop'))return;if(op){op.classList.remove('open');op=null}
  });
  window.addEventListener('scroll',function(){if(op){op.classList.remove('open');op=null}},true);

  // Read filter
  var readBtn=document.getElementById('read-filter');
  if(readBtn)readBtn.addEventListener('click',function(){hideRead=!hideRead;readBtn.classList.toggle('active',hideRead);readBtn.textContent=hideRead?'显示全部':'隐藏已选';go()});
  var readClear=document.getElementById('read-clear');
  if(readClear)readClear.addEventListener('click',function(){readSet.clear();localStorage.removeItem(LS_KEY);document.querySelectorAll('.rchk-in').forEach(function(cb){cb.checked=false});document.querySelectorAll('.read-done').forEach(function(el){el.classList.remove('read-done')});go()});

  // Token persistence
  (function(){var urlEl=document.getElementById('sync-url');var tokEl=document.getElementById('sync-token');try{var domain=new URL(urlEl.value).hostname;var saved=localStorage.getItem('aigne-sync-token:'+domain);if(saved)tokEl.value=saved}catch(e){}tokEl.addEventListener('input',function(){try{var domain=new URL(urlEl.value).hostname;if(tokEl.value)localStorage.setItem('aigne-sync-token:'+domain,tokEl.value);else localStorage.removeItem('aigne-sync-token:'+domain)}catch(e){}})})();

  updSecChkAll();
  updSelCnt();
  updUmCnt();
}

function positionPop(trigger,pop){var r=trigger.getBoundingClientRect();var pw=Math.min(520,window.innerWidth-32);var left=r.right-pw;if(left<16)left=16;var arrowRight=r.right-left-r.width/2-5;var arr=pop.querySelector('.parr');if(arr){arr.style.right=Math.max(8,Math.min(arrowRight,pw-16))+'px'}var spaceBelow=window.innerHeight-r.bottom;if(spaceBelow<300&&r.top>300){pop.style.bottom=(window.innerHeight-r.top+6)+'px';pop.style.top='';if(arr){arr.style.top='';arr.style.bottom='-6px';arr.style.transform='rotate(225deg)'}}else{pop.style.top=(r.bottom+6)+'px';pop.style.bottom='';if(arr){arr.style.top='-6px';arr.style.bottom='';arr.style.transform='rotate(45deg)'}}pop.style.left=left+'px'}

function applyRead(key,checked){if(checked)readSet.add(key);else readSet.delete(key);localStorage.setItem(LS_KEY,JSON.stringify([...readSet]));document.querySelectorAll('.r1').forEach(function(r1){if(r1.dataset.key!==key)return;r1.classList.toggle('read-done',checked);var r2=r1.nextElementSibling;if(r2&&r2.classList.contains('r2'))r2.classList.toggle('read-done',checked)});go();updSecChkAll();updSelCnt()}

function getUmSelected(){var keys=new Set();document.querySelectorAll('.um-chk:checked').forEach(function(cb){keys.add(cb.dataset.umk)});return keys}
function updUmCnt(){var cnt=getUmSelected().size;var el=document.getElementById('um-sel-cnt');if(el)el.textContent=cnt;var syncEl=document.getElementById('sync-um-cnt');if(syncEl)syncEl.textContent=cnt;var allChk=document.getElementById('um-chk-all');if(allChk){var visibleChks=document.querySelectorAll('.um-row:not(.hidden) .um-chk');var visChecked=0;visibleChks.forEach(function(cb){if(cb.checked)visChecked++});allChk.checked=visibleChks.length>0&&visChecked===visibleChks.length;allChk.indeterminate=visChecked>0&&visChecked<visibleChks.length}}
function applyUmCheck(key,checked){if(checked)umSelSet.add(key);else umSelSet.delete(key);localStorage.setItem(UM_LS,JSON.stringify([...umSelSet]));document.querySelectorAll('.um-row[data-umk="'+key+'"]').forEach(function(r){r.classList.toggle('um-checked',checked)});updUmCnt()}
function toggleUmAll(on){document.querySelectorAll('.um-row:not(.hidden) .um-chk').forEach(function(cb){cb.checked=on;applyUmCheck(cb.dataset.umk,on)});var qb=document.querySelector('.um-btn-quick');if(qb)qb.classList.remove('active');updUmCnt()}
var UM_QUICK_PROVS=['anthropic','openai','google','xai'];
function toggleUmQuick(){var btn=document.querySelector('.um-btn-quick');var isActive=btn&&btn.classList.contains('active');toggleUmAll(false);if(!isActive){document.querySelectorAll('.um-row:not(.hidden)').forEach(function(r){if(UM_QUICK_PROVS.indexOf(r.dataset.provider)>=0){var cb=r.querySelector('.um-chk');if(cb){cb.checked=true;applyUmCheck(cb.dataset.umk,true)}}});if(btn)btn.classList.add('active')}updUmCnt()}

function getSyncSelected(){var keys=new Set();document.querySelectorAll('.rchk-in:checked').forEach(function(cb){keys.add(cb.dataset.rk)});return keys}
function updSelCnt(){var el=document.getElementById('sync-sel-cnt');if(el)el.textContent=getSyncSelected().size}
function toggleSyncAll(on){document.querySelectorAll('.mrow:not(.hidden) .rchk-in').forEach(function(cb){cb.checked=on;applyRead(cb.dataset.rk,on)});updSecChkAll();updSelCnt()}
function toggleSecSync(secName,on){var sec=document.querySelector('[data-sec="'+secName+'"]');if(!sec)return;sec.querySelectorAll('.mrow:not(.hidden) .rchk-in').forEach(function(cb){cb.checked=on;applyRead(cb.dataset.rk,on)});updSecChkAll();updSelCnt()}
function updSecChkAll(){document.querySelectorAll('.sec-chk-all').forEach(function(chk){var sec=chk.closest('[data-sec]');if(!sec)return;var all=sec.querySelectorAll('.mrow:not(.hidden) .rchk-in');var checked=0;all.forEach(function(cb){if(cb.checked)checked++});var isAll=all.length>0&&checked===all.length;chk.checked=isAll;chk.indeterminate=checked>0&&checked<all.length;var lbl=sec.querySelector('.sec-sel-label');if(lbl)lbl.textContent=isAll?'取消全选':'全选'})}

function go(){
  var si=document.getElementById('si');var q=si?si.value.toLowerCase().trim():'';
  var counts={'below-cost':0,drift:0,'no-match':0,normal:0,total:0,unmatched:0};
  document.querySelectorAll('.r1').forEach(function(r1){
    var s=r1.dataset.search.toLowerCase();var st=r1.dataset.status;var k=r1.dataset.key;var prov=s.split('/')[0];var isRead=readSet.has(k);
    var vis=(!q||s.includes(q))&&(cf==='all'||st===cf)&&(cpSet.size===0||cpSet.has(prov))&&(!hideRead||!isRead);
    r1.classList.toggle('hidden',!vis);var r2=r1.nextElementSibling;if(r2&&r2.classList.contains('r2'))r2.classList.toggle('hidden',!vis);
    if(vis){counts[st]=(counts[st]||0)+1;counts.total++}
  });
  document.querySelectorAll('.um-row').forEach(function(row){
    var s=row.dataset.search.toLowerCase();var prov=row.dataset.provider;var k=row.dataset.umk;var isChecked=umSelSet.has(k);
    var vis=(!q||s.includes(q))&&(cf==='all'||cf==='unmatched')&&(cpSet.size===0||cpSet.has(prov))&&(!hideRead||!isChecked);
    row.classList.toggle('hidden',!vis);if(vis)counts.unmatched++;
  });
  document.querySelectorAll('.prow').forEach(function(p){var n=p.nextElementSibling,v=false;while(n&&!n.classList.contains('prow')){if((n.classList.contains('r1')||n.classList.contains('um-row'))&&!n.classList.contains('hidden')){v=true;break}n=n.nextElementSibling}p.classList.toggle('hidden',!v)});
  var el=function(id){return document.getElementById(id)};
  el('sum-belowcost').textContent=counts['below-cost'];el('sum-drift').textContent=counts.drift;el('sum-nomatch').textContent=counts['no-match'];el('sum-ok').textContent=counts.normal;el('sum-unmatched').textContent=counts.unmatched;el('sum-total').textContent=counts.total;
  document.querySelectorAll('.sec').forEach(function(sec){var secType=sec.dataset.sec;var cnt=sec.querySelector('.sec-cnt');if(cnt&&secType)cnt.textContent=counts[secType]||0});
  updUmCnt();
}

// ─── Sync Panel ──────────────────────────────────────────────────────────────
function fmtPrice_sync(v,pu){if(v==null)return'-';var n=Number(v);if(isNaN(n))return'-';if(n===0)return'$0';if(pu==='per-image')return'$'+n.toFixed(4)+'/张';if(pu==='per-second')return'$'+n.toFixed(4)+'/sec';var mtok=n*1e6;if(mtok<0.0001)return'$'+mtok.toFixed(7);if(mtok<0.01)return'$'+mtok.toFixed(5);if(mtok<1)return'$'+mtok.toFixed(3);return'$'+mtok.toFixed(2)}
function showStatus(msg,bg,fg){var el=document.getElementById('sync-status');el.style.display='block';el.style.background=bg;el.style.color=fg;el.textContent=msg}

async function doSync(isDryRun){
  var url=document.getElementById('sync-url').value.trim().replace(/\\/$/,'');
  var token=document.getElementById('sync-token').value.trim();
  var deprecate=document.getElementById('sync-deprecate').checked;
  var applyRates=document.getElementById('sync-apply-rates').checked;
  var profitMargin=parseFloat(document.getElementById('sync-margin').value);
  var creditPrice=parseFloat(document.getElementById('sync-credit-price').value);
  var result=document.getElementById('sync-result');var execBtn=document.getElementById('sync-execute-btn');
  if(!url){showStatus('请输入 API 地址','#feebc8','#c05621');return}
  if(!token){showStatus('请输入 Access Token','#feebc8','#c05621');return}
  var checkedKeys=getSyncSelected();
  var selectedEntries=__allEntries.filter(function(e){return checkedKeys.has(e.provider+'/'+e.modelId)}).map(function(e){
    var inp=e.inputCostPerToken,out=e.outputCostPerToken;
    if(e.tieredPricing&&e.tieredPricing.length){var hi=e.tieredPricing[e.tieredPricing.length-1];if(hi.input&&hi.input>inp)inp=hi.input;if(hi.output&&hi.output>out)out=hi.output}
    if(e.resolutionTiers&&e.resolutionTiers.length){var maxCPI=0;e.resolutionTiers.forEach(function(t){if(t.costPerImage>maxCPI)maxCPI=t.costPerImage});if(maxCPI&&maxCPI>out)out=maxCPI}
    return Object.assign({},e,{inputCostPerToken:inp,outputCostPerToken:out});
  });
  var umKeys=getUmSelected();var selectedUm=__umEntries.filter(function(e){return umKeys.has(e.provider+'/'+e.modelId)});
  var allSelected=[...selectedEntries,...selectedUm];
  if(!allSelected.length){showStatus('请先勾选要同步的模型','#feebc8','#c05621');return}
  var isPartial=selectedEntries.length<__allEntries.length;var safeDeprecate=deprecate&&!isPartial;
  var cntMsg=selectedEntries.length+(selectedUm.length?' + '+selectedUm.length+' 新增':'');
  showStatus(isDryRun?'正在预览 '+cntMsg+' 个模型...':'正在执行同步...','#ebf8ff','#2b6cb0');
  execBtn.style.display='none';
  try{
    var body={mode:'sync',entries:allSelected,dryRun:isDryRun,deprecateUnmatched:safeDeprecate,applyRates:applyRates,profitMargin:applyRates?profitMargin:undefined,creditPrice:applyRates?creditPrice:undefined};
    var resp=await fetch(url+'/api/ai-providers/bulk-rate-update',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body)});
    var json=await resp.json();if(!resp.ok)throw new Error(json.error||resp.statusText);
    var s=json.summary||{};var dep=json.deprecated||[];
    var bg=isDryRun?'#ebf8ff':'#c6f6d5';var fg=isDryRun?'#2b6cb0':'#276749';
    var prefix=isDryRun?'[预览] ':'[已执行] ';
    showStatus(prefix+'更新 '+s.updated+(s.created?' / 新增 '+s.created:'')+' / 无变化 '+s.unchanged+' / 未匹配 '+s.unmatched+(dep.length?' / 软删除 '+dep.length:''),bg,fg);
    var h='';
    if(json.updated&&json.updated.length){
      // Build lookup from sent entries to get cache data (API may not return it yet)
      var sentMap=new Map();
      allSelected.forEach(function(e){sentMap.set((e.provider||'')+'/'+e.modelId,e)});
      // diffSpan returns inline HTML (no <td> wrapper)
      function diffSpan(oldV,newV,pu){
        var o=oldV!=null?Number(oldV):NaN,n=newV!=null?Number(newV):NaN;
        if(isNaN(n)||n===0){
          if(!isNaN(o)&&o>0)return'<s style="color:#a0aec0">'+fmtPrice_sync(o,pu)+'</s> <span style="color:#e53e3e;font-size:10px">移除</span>';
          return'<span style="color:#cbd5e0">—</span>';
        }
        if(isNaN(o)||o===0)return'<span style="color:#38a169;font-weight:600">'+fmtPrice_sync(n,pu)+'</span> <span style="color:#a0aec0;font-size:10px">新增</span>';
        if(Math.abs(o-n)/Math.max(o,n)<0.001)return'<span style="color:#a0aec0">'+fmtPrice_sync(n,pu)+'</span>';
        return'<s style="color:#a0aec0">'+fmtPrice_sync(o,pu)+'</s> <span style="margin:0 2px">&rarr;</span> <b>'+fmtPrice_sync(n,pu)+'</b>';
      }
      function isDiff(a,b){var x=a!=null?Number(a):NaN,y=b!=null?Number(b):NaN;if(isNaN(x)&&isNaN(y))return false;if(isNaN(x)||isNaN(y))return true;if(x===0&&y===0)return false;return Math.abs(x-y)/Math.max(Math.abs(x),Math.abs(y))>=0.001}
      // Build cell with cost line + optional rate line
      function buildCell(costOld,costNew,rateOld,rateNew,pu){
        var costHtml=diffSpan(costOld,costNew,pu);
        var rateChanged=isDiff(rateOld,rateNew);
        var td='<td style="padding:4px 10px;text-align:right"><div>'+costHtml+'</div>';
        if(rateChanged){td+='<div style="font-size:10px;color:#718096;margin-top:1px">Rate: '+diffSpan(rateOld,rateNew,pu)+'</div>'}
        td+='</td>';return td;
      }
      h+='<div style="margin-bottom:12px"><strong style="color:#276749">待更新 ('+json.updated.length+')</strong>';
      h+='<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px"><tr style="background:#f7fafc">';
      h+='<th style="padding:6px 10px;text-align:left">Model</th>';
      h+='<th style="padding:6px 10px;text-align:right">Input</th>';
      h+='<th style="padding:6px 10px;text-align:right">Output</th>';
      h+='<th style="padding:6px 10px;text-align:right">Cache Write</th>';
      h+='<th style="padding:6px 10px;text-align:right">Cache Read</th></tr>';
      json.updated.forEach(function(u){
        var oc=u.oldUnitCosts||{},nc=u.newUnitCosts||{};
        var or_=u.oldRates||{},nr=u.newRates||{};
        // Cache: prefer API response fields, fallback to sent entries
        var ocache=u.oldCaching||{},ncache=u.newCaching||{};
        if(!ncache.readRate&&!ncache.writeRate){
          var se=sentMap.get(u.provider+'/'+u.model);
          if(se){
            if(se.cachedInputCostPerToken)ncache={readRate:se.cachedInputCostPerToken,writeRate:ncache.writeRate};
            var wts=(se.cacheTiers||[]).filter(function(t){return t.label&&t.label.indexOf('write')!==-1});
            if(wts.length>0)ncache.writeRate=wts.reduce(function(mx,t){return t.costPerToken>mx.costPerToken?t:mx}).costPerToken;
          }
        }
        h+='<tr style="border-bottom:1px solid #edf2f7">';
        h+='<td style="padding:4px 10px"><span style="color:#a0aec0;font-size:11px">'+u.provider+'/</span>'+u.model+'</td>';
        h+=buildCell(oc.input,nc.input,or_.inputRate,nr.inputRate,'per-token');
        h+=buildCell(oc.output,nc.output,or_.outputRate,nr.outputRate,'per-token');
        h+='<td style="padding:4px 10px;text-align:right">'+diffSpan(ocache.writeRate,ncache.writeRate,'per-token')+'</td>';
        h+='<td style="padding:4px 10px;text-align:right">'+diffSpan(ocache.readRate,ncache.readRate,'per-token')+'</td>';
        h+='</tr>';
      });
      h+='</table></div>';
    }
    if(json.created&&json.created.length){h+='<div style="margin-bottom:12px"><strong style="color:#2b6cb0">待新增 ('+json.created.length+')</strong><table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px"><tr style="background:#ebf8ff"><th style="padding:6px 10px;text-align:left">Model</th><th style="padding:6px 10px;text-align:left">Type</th><th style="padding:6px 10px;text-align:right">Input Cost</th><th style="padding:6px 10px;text-align:right">Output Cost</th><th style="padding:6px 10px;text-align:right">Cache Write</th><th style="padding:6px 10px;text-align:right">Cache Read</th></tr>';json.created.forEach(function(c){var uc=c.unitCosts||{};var cc=c.caching||{};h+='<tr style="border-bottom:1px solid #bee3f8"><td style="padding:4px 10px"><span style="color:#a0aec0;font-size:11px">'+c.provider+'/</span>'+c.model+'</td><td style="padding:4px 10px">'+c.type+'</td><td style="padding:4px 10px;text-align:right;font-weight:600">'+fmtPrice_sync(uc.input,'per-token')+'</td><td style="padding:4px 10px;text-align:right;font-weight:600">'+fmtPrice_sync(uc.output,'per-token')+'</td><td style="padding:4px 10px;text-align:right">'+(cc.writeRate?fmtPrice_sync(cc.writeRate,'per-token'):'<span style="color:#cbd5e0">—</span>')+'</td><td style="padding:4px 10px;text-align:right">'+(cc.readRate?fmtPrice_sync(cc.readRate,'per-token'):'<span style="color:#cbd5e0">—</span>')+'</td></tr>'});h+='</table></div>'}
    if(dep.length){h+='<div style="margin-bottom:12px"><strong style="color:#9b2c2c">待软删除 ('+dep.length+')</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';dep.forEach(function(d){h+='<span style="padding:3px 10px;background:#fed7d7;color:#9b2c2c;border-radius:4px;font-size:12px">'+d.provider+'/'+d.model+'</span>'});h+='</div></div>'}
    result.style.display=h?'block':'none';result.innerHTML=h;
    if(isDryRun&&(s.updated>0||dep.length>0||(s.created&&s.created>0)))execBtn.style.display='inline-block';
    setTimeout(async function(){var rateMap=await fetchLiveDbRates();if(rateMap){refreshSellDisplay(rateMap);recategorizeRows(rateMap)}},isDryRun?200:1500);
  }catch(e){showStatus('错误: '+e.message,'#fed7d7','#9b2c2c');result.style.display='none'}
}

// ─── Live DB Refresh ─────────────────────────────────────────────────────────
async function fetchLiveDbRates(){
  var hubUrl=(document.getElementById('sync-url')?.value||'').trim().replace(/\\/$/, '');
  if(!hubUrl)return null;
  var token=(document.getElementById('sync-token')?.value||'').trim();
  var headers={};if(token)headers['Authorization']='Bearer '+token;
  try{
    var all=[];var page=1;
    while(true){var resp=await fetch(hubUrl+'/api/ai-providers/model-rates?pageSize=100&page='+page,{headers:headers});if(!resp.ok)throw new Error('HTTP '+resp.status);var data=await resp.json();var list=data.list||[];all.push(...list);if(list.length<100)break;page++}
    var map=new Map();for(var r of all){var pName=r.provider?.name||'';var key=pName+'/'+r.model;map.set(key,{inputRate:Number(r.inputRate)||0,outputRate:Number(r.outputRate)||0,unitCosts:{input:Number(r.unitCosts?.input)||0,output:Number(r.unitCosts?.output)||0},cacheWriteRate:Number(r.caching?.writeRate)||0,cacheReadRate:Number(r.caching?.readRate)||0,type:r.type||''})}
    return map;
  }catch(e){console.error('fetchLiveDbRates failed:',e);return null}
}
function updateMarginBadge(el,sell,cost){if(!cost||cost===0){el.textContent='';el.className='mg';return}var pct=(sell-cost)/cost*100;var abs=Math.abs(pct);if(abs<0.05){el.textContent='';el.className='mg';return}el.textContent=(pct>=0?'+':'')+pct.toFixed(1)+'%';el.className='mg '+(pct<-2?'loss':abs<=2?'even':'drift')}
function updateSellRow(row,rate,entry){
  var pu=entry?.modelType==='imageGeneration'?'per-image':entry?.modelType==='video'?'per-second':'per-token';
  var sellIn=rate.inputRate,sellOut=rate.outputRate;
  var siEl=row.querySelector('[data-field="sell-in"]');if(siEl)siEl.textContent=pu==='per-image'||pu==='per-second'?'—':fmtPrice_sync(sellIn,pu);
  var soEl=row.querySelector('[data-field="sell-out"]');if(soEl)soEl.textContent=fmtPrice_sync(sellOut,pu);
  if(entry){var mc=getMarginCosts(entry);var mgIn=row.querySelector('[data-mg="input"]');if(mgIn)updateMarginBadge(mgIn,sellIn,mc.input);var mgOut=row.querySelector('[data-mg="output"]');if(mgOut)updateMarginBadge(mgOut,sellOut,mc.output)}
  var cwEl=row.querySelector('[data-field="sell-cw"]');if(cwEl&&rate.cacheWriteRate)cwEl.textContent=fmtPrice_sync(rate.cacheWriteRate,'per-token');
  var crEl=row.querySelector('[data-field="sell-cr"]');if(crEl&&rate.cacheReadRate)crEl.textContent=fmtPrice_sync(rate.cacheReadRate,'per-token');
}
function refreshSellDisplay(rateMap){
  var updated=0;
  document.querySelectorAll('tr.r2[data-key]').forEach(function(r2){var rate=rateMap.get(r2.dataset.key);if(!rate)return;updateSellRow(r2,rate,__entryMap.get(r2.dataset.key));updated++});
  document.querySelectorAll('tr.r1[data-key]').forEach(function(r1){var rate=rateMap.get(r1.dataset.key);if(!rate)return;var entry=__entryMap.get(r1.dataset.key);r1.querySelectorAll('.stbl-sell').forEach(function(sellRow){updateSellRow(sellRow,rate,entry)});updateSellRow(r1,rate,entry)});
  return updated;
}
function recategorizeRows(rateMap){
  var secCfg={'below-cost':{cls:'sec-belowcost',title:'高风险成本亏损',cnt:'critical',sub:'售价低于成本，存在亏损风险'},'drift':{cls:'sec-drift',title:'漂移量过大',cnt:'danger',sub:'DB 售价与外部数据源偏差超过阈值'},'no-match':{cls:'sec-nomatch',title:'未找到对应的官方输入输出',cnt:'miss',sub:'未匹配到官方或外部数据源，需人工确认'},'normal':{cls:'sec-ok',title:'定价正常',cnt:'ok',sub:'定价在合理范围内'}};
  var moved=0,affected=new Set();
  var theadH='';var et=document.querySelector('.sec table.mt thead');if(et)theadH=et.outerHTML;
  document.querySelectorAll('tr.r1[data-key]').forEach(function(r1){
    var k=r1.dataset.key;var entry=__entryMap.get(k),rate=rateMap.get(k);if(!entry||!rate)return;
    var ns=classifyFromEntryAndRate(entry,rate,r1.dataset.noofficial==='1');
    if(!ns||ns===r1.dataset.status)return;
    var oldSec=r1.closest('[data-sec]');if(oldSec)affected.add(oldSec.dataset.sec);affected.add(ns);
    r1.dataset.status=ns;var r2=r1.nextElementSibling;var has2=r2&&r2.classList.contains('r2');
    var ts=document.querySelector('[data-sec="'+ns+'"]');
    if(!ts){var c=secCfg[ns];if(!c)return;var d=document.createElement('div');d.className='sec '+c.cls;d.dataset.sec=ns;d.innerHTML='<div class="sec-h"><h2>'+c.title+'</h2><span class="cnt '+c.cnt+' sec-cnt">0</span><span class="sec-sub">'+c.sub+'</span><span class="chevron">▼</span></div><div class="sec-body"><table class="mt">'+theadH+'<tbody></tbody></table></div>';var order=['below-cost','drift','no-match','normal','unmatched'];var ti=order.indexOf(ns),ins=false;for(var i=ti+1;i<order.length;i++){var nx=document.querySelector('[data-sec="'+order[i]+'"]');if(nx){nx.parentNode.insertBefore(d,nx);ins=true;break}}if(!ins){var sp=document.getElementById('sync-panel');if(sp)sp.parentNode.insertBefore(d,sp)}ts=d;d.querySelector('.sec-h').addEventListener('click',function(){d.classList.toggle('collapsed')})}
    var ttb=ts.querySelector('.sec-body tbody');var emp=ttb.querySelector('.empty');if(emp)emp.closest('tr').remove();
    ttb.appendChild(r1);if(has2)ttb.appendChild(r2);moved++;
  });
  if(moved>0){affected.forEach(function(sn){var s=document.querySelector('[data-sec="'+sn+'"]');if(!s)return;rebuildSec(s);var hasM=s.querySelector('.sec-body tbody .r1');if(!hasM&&sn!=='normal')s.style.display='none';else s.style.display=''});go()}
  return moved;
}
function rebuildSec(secEl){var tb=secEl.querySelector('.sec-body tbody');if(!tb)return;var pairs=[];Array.from(tb.querySelectorAll('.r1')).forEach(function(r1){var r2=r1.nextElementSibling;pairs.push({r1:r1,r2:r2&&r2.classList.contains('r2')?r2:null,prov:r1.dataset.provider||r1.dataset.key.split('/')[0]})});while(tb.firstChild)tb.removeChild(tb.firstChild);if(!pairs.length){tb.innerHTML='<tr><td colspan="'+COLS+'" class="empty">无</td></tr>';return}var g={};pairs.forEach(function(p){(g[p.prov]=g[p.prov]||[]).push(p)});Object.keys(g).sort().forEach(function(pv){var pr=document.createElement('tr');pr.className='prow';pr.dataset.provider=pv;pr.innerHTML='<td colspan="'+COLS+'"><strong>'+provName(pv)+'</strong><span class="pcnt">'+g[pv].length+'</span></td>';tb.appendChild(pr);g[pv].forEach(function(p){tb.appendChild(p.r1);if(p.r2)tb.appendChild(p.r2)})})}
function showDbStatus(msg,bg,fg){var el=document.getElementById('db-status');el.style.display='block';el.style.background=bg;el.style.color=fg;el.textContent=msg}
async function doRefreshDb(){
  showDbStatus('正在从 Hub API 获取最新售价数据...','#ebf8ff','#2b6cb0');
  var rateMap=await fetchLiveDbRates();
  if(rateMap){var cnt=refreshSellDisplay(rateMap);var moved=recategorizeRows(rateMap);var parts=[rateMap.size+' 条记录，'+cnt+' 行已更新'];if(moved)parts.push(moved+' 项重新分类');showDbStatus('DB 售价已刷新 — '+parts.join(' / ')+' ('+new Date().toLocaleTimeString('zh-CN')+')','#c6f6d5','#276749')}
  else{var hubUrl_=(document.getElementById('sync-url')?.value||'').trim();var token_=(document.getElementById('sync-token')?.value||'').trim();var hint=hubUrl_?'':'API 地址为空';if(hubUrl_&&!token_)hint='可能需要 Access Token';if(hubUrl_&&token_)hint='请检查 API 地址或 Token';showDbStatus('获取 DB 数据失败'+(hint?' — '+hint:''),'#fed7d7','#9b2c2c')}
}

// ─── Main Entry ──────────────────────────────────────────────────────────────
(async function(){
  try{
    // 1. Fetch DB rates
    setStep('db','active');
    var dbRates;
    try{dbRates=await fetchDbRatesBrowser(__hubUrl);setStep('db','done',dbRates.length+' 条')}
    catch(e){setStep('db','error');document.getElementById('loading-error').style.display='block';document.getElementById('loading-error').textContent='无法加载 DB 数据: '+e.message;return}

    // 2. Fetch LiteLLM
    setStep('ll','active');
    var litellm=new Map();
    try{litellm=await fetchLiteLLMBrowser();setStep('ll','done',litellm.size+' 条')}
    catch(e){setStep('ll','error');__warnings.push('LiteLLM 数据加载失败: '+e.message)}

    // 3. Fetch OpenRouter
    setStep('or','active');
    var openrouter=new Map();
    try{openrouter=await fetchOpenRouterBrowser();setStep('or','done',openrouter.size+' 条')}
    catch(e){setStep('or','error');__warnings.push('OpenRouter 数据加载失败 (可能 CORS): '+e.message)}

    // 4. Official pricing
    setStep('op','active');
    var officialMap=new Map();
    if(__officialPricingFallback&&__officialPricingFallback.entries){
      officialMap=buildOfficialPricingMap(__officialPricingFallback.entries);
      setStep('op','done',officialMap.size+' 条 (嵌入)');
    }else{setStep('op','done','无数据')}

    // 5. Compare
    setStep('calc','active');
    var results=compare(dbRates,litellm,openrouter,officialMap,0.1);
    var groups=classifyAndGroup(results);
    var unmatchedModels=officialMap.size>0?findUnmatchedOfficialModels(dbRates,officialMap,litellm):[];
    setStep('calc','done',results.length+' 个模型');

    // 6. Render
    setStep('render','active');
    renderReport(results,groups,unmatchedModels);
    setStep('render','done');

    // Show app
    document.getElementById('loading-area').style.display='none';
    document.getElementById('app-content').style.display='';

    // Auto-refresh DB after a short delay
    setTimeout(function(){doRefreshDb()},800);

  }catch(e){
    document.getElementById('loading-error').style.display='block';
    document.getElementById('loading-error').textContent='致命错误: '+e.message;
    console.error(e);
  }
})();
</script>
</body>
</html>`;

fs.writeFileSync(outputFile, html, 'utf-8');
console.error(`HTML report generated: ${path.resolve(outputFile)}`);
