# ai-model-pricing-data: AI 模型定价的 LiteLLM 替代方案

## 一句话

从 6 个 AI provider 官方页面每日自动抓取定价数据，输出标准化 JSON，通过 GitHub raw URL 对外提供。

## Why?

目前 AIGNE Hub 依赖 LiteLLM 的 `model_prices_and_context_window.json` 作为定价参考，但 LiteLLM 数据有滞后且不包含缓存/阶梯定价等细节。我们已有成熟的官方页面 scraper（regex + LLM fallback），需要将其从 Claude Code skill 抽取为独立的自动化数据服务。

## Core Experience

```
每天 UTC 02:00 (北京时间 10:00)
         │
         ▼
  GitHub Actions 触发
         │
         ├── scrape OpenAI     ──┐
         ├── scrape Anthropic  ──┤
         ├── scrape Google     ──┤ 并行
         ├── scrape xAI        ──┤
         ├── scrape DeepSeek   ──┤
         └── fetch OpenRouter  ──┘
                    │
                    ▼
            merge + normalize
                    │
              ┌─────┼─────┐
              ▼     ▼     ▼
          pricing  litellm  per-provider
          .json    .json    /*.json
                    │
                    ▼
             git diff → commit + push
                    │
                    ▼
          raw.githubusercontent.com/arcblock/ai-model-pricing-data/main/data/pricing.json
```

## Key Decisions

| 问题 | 选择 | 原因 |
|------|------|------|
| 运行在哪？ | GitHub Actions daily cron | 免维护，公开透明 |
| 数据去哪？ | 独立 repo，raw URL 分发 | 类似 LiteLLM 模式，解耦 |
| LLM fallback？ | 始终启用 | CI 配 API key，确保数据完整 |
| 输出格式？ | 双格式 (完整 + LiteLLM 兼容) | 兼顾自有系统和生态兼容 |
| 技术栈？ | 纯 Node.js ESM | 零编译，直接复用现有 scraper |
| 变更处理？ | 自动 commit + push | 减少人工干预 |

## Scope

**In**: 6 provider scraper 迁移、LLM fallback、双格式输出、daily cron、自动 commit、README

**Out**: npm 发包、GitHub Pages 报告、Hub DB sync、通知、历史趋势

## Risk + Mitigation

| 风险 | 缓解 |
|------|------|
| 官方页面结构变化 | LLM fallback + 保留上次数据 |
| xAI TLS 不稳定 | 重试 + 容错 |
| LLM 成本 | 每天一次，消耗极低 |

## Next Steps

1. 创建 `arcblock/ai-model-pricing-data` repo
2. 从现有 skill 迁移 scraper 代码（~5500 行）
3. 编写 `scripts/index.mjs` 编排入口
4. 配置 GitHub Actions workflow + secrets
5. 验证首次运行，确认数据完整
