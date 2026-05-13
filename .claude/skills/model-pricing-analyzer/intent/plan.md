# Execution Plan: ai-model-pricing-data

## Overview

将现有 model-pricing-analyzer skill 中的官方定价抓取逻辑抽取为独立 GitHub repo `arcblock/ai-model-pricing-data`，每日自动通过 GitHub Actions 抓取 6 个 provider 的定价数据，输出标准化 JSON（按 provider 分组的新格式 + LiteLLM 兼容格式）。

## Prerequisites

- GitHub org `arcblock` 下可创建新 repo
- CI secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- 现有 scraper 代码可用：`official-pricing-catalog.mjs`, `scrape-openai-pricing.mjs`, `scrape-anthropic-pricing.mjs`, `core/pricing-core.mjs`

---

## Phase 0: Repo 初始化 + Schema + 基础设施

### Description

创建新 repo 骨架，定义 TypeScript 类型（新的按 provider 分组格式），配置构建工具链。这是所有后续 phase 的基础。

### Tests

#### Happy Path
- [ ] `npm install` 成功，无报错
- [ ] `npx tsx scripts/index.ts --help` 输出使用说明
- [ ] TypeScript 编译通过（`npx tsc --noEmit`）
- [ ] Schema 类型定义完整（PricingData, ModelPricing, CachingKey 等）

#### Bad Path
- [ ] 缺少 tsconfig.json 时 tsc 报错
- [ ] 导入不存在的模块时编译失败

#### Edge Cases
- [ ] 空的 providers 对象序列化为 `{}`
- [ ] _meta.failedProviders 为空数组时正确处理

#### Security
- [ ] package.json 不包含私有凭证
- [ ] .gitignore 排除 node_modules、.env、.cache

#### Data Leak
- [ ] 类型定义中无 API key 相关字段

#### Data Damage
- [ ] 写入 JSON 使用 atomic write（先写 .tmp 再 rename）

### E2E Gate

```bash
cd ai-model-pricing-data
npx tsc --noEmit && echo "✅ TypeScript OK"
node -e "const s = require('./scripts/lib/schema'); console.log('Schema exports:', Object.keys(s).length)"
```

### Acceptance Criteria

- [ ] repo 初始化完成，目录结构符合 intent
- [ ] TypeScript + tsx 工具链就绪
- [ ] Schema 类型定义完整且编译通过
- [ ] package.json 配置 scripts: `scrape`, `build`, `typecheck`

---

## Phase 1: HTTP 工具 + LLM Fallback 迁移

### Description

迁移共享基础设施：HTTP fetch 工具（支持重定向）和 LLM fallback 逻辑。这是所有 scraper 的公共依赖。

### Tests

#### Happy Path
- [ ] `httpFetch(url)` 返回页面内容
- [ ] 301/302 重定向自动跟随（最多 5 次）
- [ ] LLM fallback 在 regex 失败时调用 API 修复
- [ ] LLM cache 文件正确读写（1h TTL）

#### Bad Path
- [ ] 超时后抛出错误（30s timeout）
- [ ] 超过最大重定向次数抛出错误
- [ ] 无效 URL 抛出错误
- [ ] LLM API key 缺失时跳过 fallback 并记录 warning
- [ ] LLM API 返回非 JSON 时 graceful 失败

#### Edge Cases
- [ ] HTTPS → HTTP 重定向处理
- [ ] 响应 body 为空时返回空字符串
- [ ] LLM cache TTL 刚好过期时重新请求
- [ ] 并发请求同一 URL 时不重复发起

#### Security
- [ ] User-Agent 使用简单标识，不伪造浏览器
- [ ] 不在日志中打印完整 API key

#### Data Leak
- [ ] HTTP 错误响应不包含请求 headers
- [ ] LLM 请求不泄露本地路径信息

#### Data Damage
- [ ] LLM cache 写入失败不影响主流程
- [ ] cache 文件损坏时 graceful 降级（删除重建）

### E2E Gate

```bash
# 测试 HTTP fetch
npx tsx scripts/lib/http.ts --test-url "https://httpbin.org/get"
# 测试 LLM fallback（dry-run）
npx tsx scripts/lib/llm-fallback.ts --dry-run
```

### Acceptance Criteria

- [ ] HTTP 工具支持 GET + 重定向 + 超时
- [ ] LLM fallback 支持 OpenAI + Anthropic 双 provider
- [ ] LLM cache 读写 + TTL 过期机制
- [ ] 所有测试通过

---

## Phase 2: Scraper 迁移（5 家官方 provider）

### Description

迁移 5 个官方 provider scraper，每个返回 `ModelPricing[]`。从现有 `.mjs` 转为 `.ts`，适配新的 schema 格式（caching 对象替代 cacheTiers 数组）。

**迁移映射：**
- `official-pricing-catalog.mjs` (Google/xAI/DeepSeek 部分) → `scrape-google.ts`, `scrape-xai.ts`, `scrape-deepseek.ts`
- `scrape-openai-pricing.mjs` → `scrape-openai.ts`
- `scrape-anthropic-pricing.mjs` → `scrape-anthropic.ts`

### Tests

#### Happy Path
- [ ] OpenAI scraper 提取 ≥50 个模型（含 text/image/audio/embedding）
- [ ] Anthropic scraper 提取 ≥10 个模型（含 cache tier 和 batch pricing）
- [ ] Google scraper 提取 ≥20 个模型
- [ ] xAI scraper 从 Next.js RSC JSON 提取 ≥10 个模型
- [ ] DeepSeek scraper 提取 ≥2 个模型（deepseek-chat, deepseek-reasoner）
- [ ] 每个 scraper 返回结果符合 ModelPricing 类型
- [ ] caching 字段使用枚举 key（write-5min, write-1h, write, read）

#### Bad Path
- [ ] 目标 URL 404 时返回空数组 + 错误日志
- [ ] HTML 结构变化导致 regex 匹配 0 个模型时触发 LLM fallback
- [ ] 网络超时时在 30s 内返回错误
- [ ] xAI TLS 连接失败时 retry 一次后 graceful 失败

#### Edge Cases
- [ ] Google pricing 页面有 markdown 格式变化时仍能提取
- [ ] OpenAI 新增未知模型类型时 graceful 跳过
- [ ] xAI `$n` 值格式变化时正确解析
- [ ] DeepSeek "CACHE MISS" vs "CACHE HIT" 行区分正确
- [ ] Anthropic 301 重定向到 platform.claude.com 时正确跟随

#### Security
- [ ] 不执行页面中的任何 JavaScript
- [ ] 不跟随非 HTTPS 重定向（除 localhost）

#### Data Leak
- [ ] scraper 错误信息不包含完整页面 HTML

#### Data Damage
- [ ] 单个模型解析失败不影响其他模型
- [ ] 价格为 0 或负数时标记为异常但不入库

### E2E Gate

```bash
# 逐个测试每个 scraper
npx tsx scripts/scrape-openai.ts --json | jq '.length'
npx tsx scripts/scrape-anthropic.ts --json | jq '.length'
npx tsx scripts/scrape-google.ts --json | jq '.length'
npx tsx scripts/scrape-xai.ts --json | jq '.length'
npx tsx scripts/scrape-deepseek.ts --json | jq '.length'
```

### Acceptance Criteria

- [ ] 5 个 scraper 独立可运行，输出 ModelPricing[]
- [ ] 所有 scraper 使用新的 caching 枚举格式
- [ ] LLM fallback 集成到 OpenAI + Anthropic scraper
- [ ] isSuspicious() 检查每个 scraper 结果

---

## Phase 3: OpenRouter Fetcher + Merge 引擎

### Description

迁移 OpenRouter API 数据获取，实现 merge 引擎将 6 个数据源合并为按 provider 分组的 `PricingData` 结构。

### Tests

#### Happy Path
- [ ] OpenRouter API 返回 ≥300 个模型
- [ ] merge 引擎正确按 provider 分组
- [ ] 同模型多 type 时 base key 指向 chatCompletion
- [ ] type-qualified key（`model::fineTuning`）正确生成
- [ ] _meta 包含正确的 source 统计

#### Bad Path
- [ ] OpenRouter API 不可达时返回空 + 错误日志
- [ ] merge 时遇到重复 key 时官方数据优先于 OpenRouter
- [ ] entry 缺少 modelId 时跳过并记录 warning

#### Edge Cases
- [ ] OpenRouter 模型名包含 `/`（如 `anthropic/claude-opus-4-6`）时作为完整 modelId
- [ ] 相同模型在官方和 OpenRouter 中价格不同时保留官方版本
- [ ] provider 抓取全部失败时 _meta.failedProviders 正确标记

#### Security
- [ ] OpenRouter API 不需要 key（公开 endpoint）
- [ ] merge 不执行任何动态代码

#### Data Leak
- [ ] merge 结果不包含抓取过程中间状态

#### Data Damage
- [ ] merge 是纯函数，不修改输入数据
- [ ] 单个 provider 失败不影响其他 provider 的数据

### E2E Gate

```bash
# 测试完整 merge 流程
npx tsx scripts/index.ts --dry-run | jq '._meta.totalModels'
# 验证输出结构
npx tsx scripts/index.ts --dry-run | jq 'keys'
# 应输出: ["_meta", "providers"]
```

### Acceptance Criteria

- [ ] OpenRouter fetcher 独立可运行
- [ ] merge 引擎输出符合 PricingData 类型
- [ ] 按 provider 分组结构正确
- [ ] _meta 统计信息准确

---

## Phase 4: 输出格式 + Diff Summary

### Description

实现三种输出：
1. `data/pricing.json` — 按 provider 分组的主格式
2. `data/pricing-litellm.json` — LiteLLM 兼容格式
3. `data/providers/*.json` — 按 provider 拆分

加上 `diff-summary.ts` 用于检测数据变更。

### Tests

#### Happy Path
- [ ] pricing.json 写入正确的 PricingData 结构
- [ ] pricing-litellm.json 写入 LiteLLM key-value 格式
- [ ] 6 个 provider 各自有独立 JSON 文件
- [ ] diff summary 正确检测新增/删除/价格变化的模型
- [ ] JSON 使用 2-space indent 格式化

#### Bad Path
- [ ] 输出目录不存在时自动创建
- [ ] 磁盘空间不足时报错（不写入部分文件）
- [ ] diff summary 在无历史数据时输出 "Initial data" 摘要

#### Edge Cases
- [ ] pricing 值使用 toPrecision(10) 消除 IEEE 754 噪音
- [ ] 空 provider（0 个模型）不创建对应 JSON 文件
- [ ] LiteLLM 格式中 caching 映射到 `cache_creation/read_input_token_cost`
- [ ] 图片/视频模型在 LiteLLM 格式中的处理

#### Security
- [ ] 输出路径不允许目录穿越（../）
- [ ] JSON 不包含 __proto__ 等危险 key

#### Data Leak
- [ ] 输出不包含 LLM API key 或中间调试信息

#### Data Damage
- [ ] 使用 atomic write（write .tmp → rename）
- [ ] 写入失败时保留上一版本文件

### E2E Gate

```bash
# 完整运行并验证输出
npx tsx scripts/index.ts
ls -la data/pricing.json data/pricing-litellm.json data/providers/
# 验证 JSON 格式正确
python3 -m json.tool data/pricing.json > /dev/null && echo "✅ Valid JSON"
# 验证 provider 分组
node -e "const d=require('./data/pricing.json'); console.log('Providers:', Object.keys(d.providers))"
```

### Acceptance Criteria

- [ ] 三种输出格式全部正确生成
- [ ] diff summary 可生成变更摘要文本
- [ ] atomic write 机制就绪
- [ ] 所有 JSON 可被 `JSON.parse()` 正确解析

---

## Phase 5: GitHub Actions Workflow + 首次运行

### Description

配置 CI 自动化：daily cron + workflow_dispatch + 变更检测 + 自动 commit。验证端到端流程。

### Tests

#### Happy Path
- [ ] workflow 文件语法正确（`actionlint` 通过）
- [ ] 手动触发 workflow_dispatch 成功执行
- [ ] 数据变化时自动 commit + push
- [ ] commit message 包含日期和变更摘要
- [ ] 无变化时跳过 commit

#### Bad Path
- [ ] CI secrets 缺失时脚本报错但不崩溃
- [ ] 单个 provider 失败时仍 commit 成功的部分
- [ ] 全部 provider 失败时 workflow 失败（exit 1）

#### Edge Cases
- [ ] 首次运行（无历史 data/）时正确初始化
- [ ] git diff 检测只关注 data/ 目录
- [ ] concurrent workflow 运行时 git push 冲突处理

#### Security
- [ ] secrets 不在 workflow 日志中打印
- [ ] push 权限仅限 `contents: write`

#### Data Leak
- [ ] workflow 日志不包含完整 API response
- [ ] commit diff 不包含 secrets

#### Data Damage
- [ ] commit 前验证 JSON 有效性
- [ ] push 失败时不丢失本地数据

### E2E Gate

```bash
# 验证 workflow 语法
actionlint .github/workflows/update-pricing.yml
# 本地模拟完整流程
npx tsx scripts/index.ts
git diff --stat data/
node scripts/utils/diff-summary.ts
```

### Acceptance Criteria

- [ ] GitHub Actions workflow 配置完成
- [ ] 首次手动触发成功执行 + commit
- [ ] Daily cron schedule 正确设置 (UTC 02:00)
- [ ] README.md 包含使用说明和数据格式文档

---

## Final E2E Verification

```bash
# 1. 完整抓取 + 输出
npx tsx scripts/index.ts

# 2. 验证输出完整性
node -e "
const d = require('./data/pricing.json');
const p = Object.keys(d.providers);
console.log('Providers:', p);
console.log('Total models:', d._meta.totalModels);
console.log('Failed:', d._meta.failedProviders);
p.forEach(prov => {
  const models = Object.keys(d.providers[prov]);
  console.log(\`  \${prov}: \${models.length} models\`);
});
"

# 3. 验证 LiteLLM 格式
node -e "
const d = require('./data/pricing-litellm.json');
console.log('LiteLLM entries:', Object.keys(d).length);
const sample = Object.entries(d)[0];
console.log('Sample:', sample[0], JSON.stringify(sample[1], null, 2));
"

# 4. TypeScript 编译
npx tsc --noEmit

# 5. 验证 per-provider 文件
ls data/providers/ | wc -l
```

## Risk Mitigation

| Risk | Mitigation | Contingency |
|------|------------|-------------|
| 官方页面结构变化 | LLM fallback + isSuspicious() 检测 | 保留上次成功数据，CI 不失败 |
| xAI TLS 间歇失败 | 单次 retry + 30s timeout | 标记为 failedProvider |
| LLM API 限额 | 每天仅跑一次，消耗极低 | 降级为纯 regex 模式 |
| .mjs → .ts 迁移引入 bug | 对比新旧输出数据 | 首次运行后人工审核 diff |
| Schema 变更破坏下游消费 | 同时输出旧格式 entries[] 作为过渡 | 通知下游系统适配 |

## References

- [Intent](./intent.md)
- [Overview](./overview.md)
- 现有代码: `.claude/skills/model-pricing-analyzer/scripts/`
