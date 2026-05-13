# ai-model-pricing-data — 独立 Repo 规格说明

::: locked {reason="核心定位"}
## 1. Overview

- **定位**：独立的 AI 模型定价数据仓库，类似 [BerriAI/litellm 的 model_prices_and_context_window.json](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json)，但数据直接从各 provider 官方页面抓取
- **核心概念**：每天自动从 6 个数据源（OpenAI, Anthropic, Google, xAI, DeepSeek, OpenRouter）抓取最新定价，生成标准化 JSON 文件，通过 GitHub raw URL 对外提供服务
- **优先级**：中等 — 替换目前手动/skill 驱动的抓取流程
- **目标用户**：AIGNE Hub 及任何需要 AI 模型定价数据的下游系统
- **项目范围**：新建独立 GitHub repo `arcblock/ai-model-pricing-data`
:::

::: locked {reason="核心架构"}
## 2. Architecture

### 2.1 数据流

```
                                    GitHub Actions (daily cron)
                                              │
                   ┌──────────────────────────┼──────────────────────────┐
                   │                          │                          │
                   ▼                          ▼                          ▼
           ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
           │  OpenAI      │          │  Anthropic   │          │  Google      │
           │  scraper     │          │  scraper     │          │  scraper     │
           └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
                  │                          │                          │
                  │    ┌──────────────┐      │    ┌──────────────┐      │
                  │    │  xAI         │      │    │  DeepSeek    │      │
                  │    │  scraper     │      │    │  scraper     │      │
                  │    └──────┬───────┘      │    └──────┬───────┘      │
                  │           │              │           │              │
                  ▼           ▼              ▼           ▼              ▼
              ┌─────────────────────────────────────────────────────────┐
              │                  merge & normalize                      │
              └──────────────────────┬──────────────────────────────────┘
                                     │
                          ┌──────────┼──────────┐
                          ▼          ▼          ▼
                    pricing.json  litellm.json  per-provider/
                    (完整格式)    (兼容格式)     ├── openai.json
                                                ├── anthropic.json
                                                ├── google.json
                                                ├── xai.json
                                                ├── deepseek.json
                                                └── openrouter.json
                          │
                          ▼
                   git commit + push (if changed)
                          │
                          ▼
               raw.githubusercontent.com URL
```

### 2.2 Repo 目录结构

```
ai-model-pricing-data/
├── data/
│   ├── pricing.json                    # 主文件：OfficialPricingEntry[] 完整格式
│   ├── pricing-litellm.json            # LiteLLM 兼容 key-value 格式
│   └── providers/                      # 按 provider 拆分
│       ├── openai.json
│       ├── anthropic.json
│       ├── google.json
│       ├── xai.json
│       ├── deepseek.json
│       └── openrouter.json
├── scripts/
│   ├── index.ts                        # 主入口：orchestrate 所有 scraper
│   ├── scrape-openai.ts                # OpenAI scraper (从现有代码迁移)
│   ├── scrape-anthropic.ts             # Anthropic scraper (从现有代码迁移)
│   ├── scrape-google.ts                # Google scraper (从 catalog 抽取)
│   ├── scrape-xai.ts                   # xAI scraper (从 catalog 抽取)
│   ├── scrape-deepseek.ts              # DeepSeek scraper (从 catalog 抽取)
│   ├── fetch-openrouter.ts             # OpenRouter API 拉取
│   ├── lib/
│   │   ├── pricing-core.ts             # 共享纯函数 (normalize, aliases)
│   │   ├── schema.ts                   # TypeScript 类型定义 (直接迁移)
│   │   ├── http.ts                     # HTTP 工具 (fetch with redirect)
│   │   └── llm-fallback.ts             # LLM fallback 逻辑
│   └── utils/
│       ├── to-litellm-format.ts        # 转换为 LiteLLM 兼容格式
│       └── diff-summary.ts             # 数据变更摘要生成
├── tsconfig.json
├── .github/
│   └── workflows/
│       └── update-pricing.yml          # Daily cron workflow
├── package.json
├── package-lock.json
└── README.md
```

### 2.3 关键子系统

| 子系统 | 职责 | 来源 |
|--------|------|------|
| Provider Scrapers | 从各官方页面 regex+LLM 提取定价 | 迁移自 `official-pricing-catalog.mjs` |
| OpenAI Scraper | 专用 OpenAI 抓取器 | 迁移自 `scrape-openai-pricing.mjs` |
| Anthropic Scraper | 专用 Anthropic 抓取器 | 迁移自 `scrape-anthropic-pricing.mjs` |
| OpenRouter Fetcher | API 拉取 OpenRouter 全量模型定价 | 迁移自 `fetch-sources.ts:fetchOpenRouter` |
| Pricing Core | 纯函数：normalize, alias, merge | 迁移自 `core/pricing-core.mjs` |
| LLM Fallback | regex 失败时用 LLM 修复 | 迁移自现有 scraper 内的 LLM 逻辑 |
| Format Converter | 转换为 LiteLLM 兼容格式 | 迁移自 catalog 的 `toLiteLLMFormat()` |
| CI Workflow | 定时触发 + diff 检测 + auto commit | 新建 |
:::

::: locked {reason="核心行为规范"}
## 3. Detailed Behavior

### 3.1 抓取流程 (`scripts/index.mjs`)

```
1. 并行抓取所有 6 个数据源
   - OpenAI: developers.openai.com (regex-first + LLM fallback)
   - Anthropic: platform.claude.com (regex-first + LLM fallback)
   - Google: ai.google.dev/gemini-api/docs/pricing (markdown regex)
   - xAI: docs.x.ai (Next.js RSC JSON 解析)
   - DeepSeek: api-docs.deepseek.com (HTML table regex)
   - OpenRouter: openrouter.ai/api/v1/models (JSON API)

2. 各 scraper 返回 OfficialPricingEntry[]

3. Merge 所有结果为 unified array
   - 按 provider + modelId + modelType 去重
   - 官方数据优先，OpenRouter 作为补充

4. 输出 3 种格式：
   - data/pricing.json — OfficialPricingEntry[] 完整版
   - data/pricing-litellm.json — LiteLLM 兼容格式
   - data/providers/{provider}.json — 按 provider 拆分

5. 生成 changeSummary 对象（新增/删除/价格变化的模型列表）
```

### 3.2 LLM Fallback 逻辑

```
环境变量检测：
  - OPENAI_API_KEY → 启用 OpenAI LLM fallback (gpt-4o-mini)
  - ANTHROPIC_API_KEY → 启用 Anthropic LLM fallback (claude-haiku-4-5)
  - 两者都没有 → 仅使用 regex（CI 中强制要求至少配一个）

触发条件：
  - isSuspicious(result) 返回 true（模型数量不足或关键字段缺失）

LLM Cache：
  - 文件缓存 data/.cache/llm-{provider}.json
  - TTL: 1 小时（CI 每天跑一次，不会命中缓存，本地开发有用）
```

### 3.3 错误处理

```
单个 provider 失败时：
  1. 记录错误到 stderr
  2. 该 provider 数据保持上一次成功的版本（不删除）
  3. commit message 中标注失败的 provider
  4. CI workflow 不失败（exit 0），但设置 output 变量标记

全部 provider 失败时：
  1. CI workflow 失败（exit 1）
  2. 不做任何 commit
```

### 3.4 数据变更检测

```javascript
// diff-summary.mjs
function generateChangeSummary(oldData, newData) {
  return {
    added: [],      // 新增模型 [{provider, modelId, input, output}]
    removed: [],    // 删除的模型
    priceChanged: [], // 价格变化 [{provider, modelId, field, old, new, changePercent}]
    unchanged: count,
    timestamp: ISO string
  };
}
```
:::

::: locked {reason="下游系统依赖此 schema，使用 TypeScript 实现"}
## 4. Data Schema

### 4.1 pricing.json (主格式 — 按 provider 分组)

结构优化：从 `entries[]` 数组改为 `providers.{provider}.{model}` 嵌套 Map，消费方无需建 Map 直接查询。

```json
{
  "_meta": {
    "generatedAt": "2026-03-18T04:30:00Z",
    "version": "2.0.0",
    "sources": {
      "openai": { "url": "...", "modelCount": 114, "method": "regex" },
      "anthropic": { "url": "...", "modelCount": 12, "method": "regex" }
    },
    "totalModels": 400,
    "failedProviders": []
  },
  "providers": {
    "anthropic": {
      "claude-opus-4-6": {
        "displayName": "Claude Opus 4.6",
        "modelType": "chatCompletion",
        "pricingUnit": "per-token",
        "inputCostPerToken": 5e-6,
        "outputCostPerToken": 2.5e-5,
        "caching": {
          "write-5min": 6.25e-6,
          "write-1h": 1e-5,
          "read": 5e-7
        },
        "contextTiers": [
          { "threshold": ">200K", "inputCostPerToken": 1e-5, "outputCostPerToken": 3.75e-5 }
        ],
        "batchPricing": { "inputCostPerToken": 2.5e-6, "outputCostPerToken": 1.25e-5 },
        "specialModes": [
          { "mode": "fast-mode", "inputCostPerToken": 3e-5, "outputCostPerToken": 1.5e-4 }
        ],
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
        "extractionMethod": "regex"
      },
      "claude-opus-4-6::fineTuning": {
        "modelType": "fineTuning",
        "pricingUnit": "per-token",
        "inputCostPerToken": 7.5e-6,
        "outputCostPerToken": 3.75e-5,
        "sourceUrl": "..."
      }
    },
    "openai": {
      "gpt-4.1": { ... },
      "gpt-image-1": {
        "modelType": "imageGeneration",
        "pricingUnit": "per-image",
        "costPerImage": 0.04,
        "imageVariants": [
          { "quality": "high", "size": "1024x1024", "costPerImage": 0.167 }
        ],
        "sourceUrl": "..."
      }
    },
    "openrouter": {
      "anthropic/claude-opus-4-6": { ... },
      "openai/gpt-4.1": { ... }
    }
  }
}
```

**关键设计决策**：

- **按 provider 分组**：消费方可直接 `data.providers[provider][model]` 查询，无需 Array→Map 转换
- **同模型多 type**：用 `modelId::type` 作为 key（如 `claude-opus-4-6::fineTuning`），默认 key 为最高优先级 type（chatCompletion）
- **OpenRouter 独立 provider**：key 格式为 `anthropic/claude-opus-4-6`（含原始 provider 前缀）

### 4.2 Cache Tier 枚举规范

将自由文本 label 改为固定枚举值，消除硬编码字符串匹配：

```typescript
// 缓存定价字段从 cacheTiers[] 数组改为 caching 对象
type CachingKey =
  | 'write-5min'    // Anthropic: 5-minute prompt caching write
  | 'write-1h'      // Anthropic: 1-hour prompt caching write
  | 'write'         // 通用 cache write (Google, OpenAI)
  | 'read'          // Cache read / cached input
  ;

interface ModelPricing {
  // ...
  caching?: Partial<Record<CachingKey, number>>; // key → $/token
}
```

对比旧格式：
```
// 旧: cacheTiers[] 数组 + 自由文本 label
"cacheTiers": [
  { "label": "5min-write", "costPerToken": 6.25e-6 },
  { "label": "read", "costPerToken": 5e-7 }
]

// 新: caching 对象 + 枚举 key
"caching": {
  "write-5min": 6.25e-6,
  "read": 5e-7
}
```

消费方从 `cacheTiers.find(t => t.label.includes('write'))` 变为 `caching['write-5min'] ?? caching['write']`。

### 4.3 pricing-litellm.json (兼容格式)

```json
{
  "gpt-4.1": {
    "input_cost_per_token": 2e-6,
    "output_cost_per_token": 8e-6,
    "cache_creation_input_token_cost": 1e-6,
    "cache_read_input_token_cost": 5e-7,
    "litellm_provider": "openai",
    "source": "official"
  }
}
```

### 4.4 图片/视频定价优先级

明确定价字段优先级（消除三源歧义）：
1. `costPerImage` / `costPerSecond` — 有此字段直接用
2. `imageVariants[]` / `videoVariants[]` — 按分辨率/质量的细分定价
3. Token 级字段（`inputCostPerToken`）— 仅作备用参考

### 4.5 TypeScript 类型定义

基于现有 `pricing-schema.ts` 迁移并优化：

```typescript
interface PricingData {
  _meta: PricingMeta;
  providers: Record<string, Record<string, ModelPricing>>;
}

interface PricingMeta {
  generatedAt: string;
  version: string;
  sources: Record<string, ProviderSource>;
  totalModels: number;
  failedProviders: string[];
}

interface ModelPricing {
  displayName?: string;
  modelType?: ModelType;
  pricingUnit: PricingUnit;
  // Token pricing
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  // Caching (枚举 key)
  caching?: Partial<Record<CachingKey, number>>;
  // Context tiers
  contextTiers?: ContextTier[];
  // Batch
  batchPricing?: BatchPricing;
  // Special modes
  specialModes?: SpecialModePricing[];
  // Image
  costPerImage?: number;
  imageVariants?: ImageVariant[];
  // Video
  costPerSecond?: number;
  videoVariants?: VideoVariant[];
  // Audio
  costPerMinute?: number;
  // Fine-tuning
  trainingCostPerToken?: number;
  // Metadata
  sourceUrl: string;
  extractionMethod?: string;
  deprecated?: boolean;
}
```
:::

::: reviewed {by=zac date=2026-03-18}
## 5. GitHub Actions Workflow

### 5.1 update-pricing.yml

```yaml
name: Update Pricing Data

on:
  schedule:
    - cron: '0 2 * * *'    # 每天 UTC 02:00 (北京时间 10:00)
  workflow_dispatch:         # 支持手动触发

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Scrape pricing data
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node scripts/index.mjs

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet data/; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit and push
        if: steps.changes.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          # 生成变更摘要
          SUMMARY=$(node scripts/utils/diff-summary.mjs)
          git add data/
          git commit -m "chore: update pricing data $(date -u +%Y-%m-%d)

          ${SUMMARY}"
          git push
```

### 5.2 CI Secrets 要求

| Secret | 用途 | 必须 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI LLM fallback + Anthropic scraper 备用 | 是 |
| `ANTHROPIC_API_KEY` | Anthropic LLM fallback | 是 |
:::

::: reviewed {by=zac date=2026-03-18}
## 6. 代码迁移映射

从现有 skill 代码到新 repo 的映射关系：

| 现有文件 | 新 repo 文件 | 迁移方式 |
|----------|-------------|----------|
| `official-pricing-catalog.mjs` (Google/xAI/DeepSeek 部分) | `scripts/scrape-google.mjs`, `scrape-xai.mjs`, `scrape-deepseek.mjs` | 拆分为独立文件 |
| `scrape-openai-pricing.mjs` | `scripts/scrape-openai.mjs` | 直接迁移，移除 skill 特定路径 |
| `scrape-anthropic-pricing.mjs` | `scripts/scrape-anthropic.mjs` | 直接迁移，移除 skill 特定路径 |
| `core/pricing-core.mjs` | `scripts/lib/pricing-core.mjs` | 直接迁移 |
| `pricing-schema.ts` | `scripts/lib/schema.mjs` (JSDoc) | TS → JSDoc 转换 |
| `fetch-sources.ts:fetchOpenRouter` | `scripts/fetch-openrouter.mjs` | 提取并转为 .mjs |
| `official-pricing-catalog.mjs:toLiteLLMFormat` | `scripts/utils/to-litellm-format.mjs` | 提取 |
| `official-pricing-catalog.mjs:HTTP helpers` | `scripts/lib/http.mjs` | 提取共享 |
| (新建) | `scripts/index.mjs` | 新编排入口 |
| (新建) | `scripts/utils/diff-summary.mjs` | 新建 |
| (新建) | `.github/workflows/update-pricing.yml` | 新建 |
:::

::: locked {reason="关键决策"}
## 7. Decisions Summary

| 决策 | 选择 | 原因 |
|------|------|------|
| 运行环境 | GitHub Actions CI/CD | 无需本地服务器，公开透明 |
| 数据用途 | 独立 repo（类似 LiteLLM） | 解耦定价数据与 AIGNE Hub 代码 |
| 执行频率 | 每天一次 (UTC 02:00) | 足以跟踪大部分价格变动 |
| 抓取范围 | 5 家官方 + OpenRouter API | 覆盖主流 provider |
| LLM fallback | 始终启用 | 确保数据完整性最高 |
| 技术栈 | TypeScript (.ts) + tsx 运行 | 类型安全，复用现有 schema |
| JSON 格式 | 双格式输出 | 满足自有系统和 LiteLLM 生态 |
| 分发方式 | raw.githubusercontent URL | 最简单，无需发包 |
| 变更处理 | 自动 commit + push | 减少人工干预 |
| Repo 名 | `ai-model-pricing-data` | 通用命名，不绑 AIGNE 品牌 |
:::

::: reviewed {by=zac date=2026-03-18}
## 8. MVP Scope

### 包含

- [x] 6 个 provider scraper 迁移
- [x] LLM fallback 机制
- [x] 双格式 JSON 输出（完整 + LiteLLM）
- [x] 按 provider 拆分输出
- [x] GitHub Actions daily cron
- [x] 变更检测 + 自动 commit
- [x] commit message 包含变更摘要
- [x] README 文档

### 不包含（后续可选）

- [ ] npm 包发布
- [ ] GitHub Pages 可视化报告
- [ ] 与 Hub DB 的 compare/sync 功能
- [ ] Webhook/Slack 通知
- [ ] PR 审核模式（大幅变更时）
- [ ] 历史趋势分析

## 9. Risks

| 风险 | 影响 | 缓解 |
|------|------|------|
| 官方页面结构变化导致 regex 失败 | 该 provider 数据缺失 | LLM fallback 兜底 + 保留上次成功数据 |
| xAI TLS 间歇性连接失败 | xAI 数据偶尔缺失 | 重试机制 + 容错 |
| LLM API 限额/成本 | fallback 失败 | 每天仅跑一次，消耗极低 |
| GitHub Actions 运行时间 | 超时 | 并行抓取，预计 < 2 分钟 |

## 10. Open Items

- [ ] 确认 GitHub org/repo 是 `arcblock/ai-model-pricing-data` 还是其他
- [ ] 确认 CI secrets 的配置方式（org secret 还是 repo secret）
- [ ] 是否需要 CODEOWNERS 审核保护
:::
