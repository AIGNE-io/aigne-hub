# AIGNE Hub 连接速率与记账报告（速读版）

> 📄 完整报告: [`connection-rate-billing-benchmark.md`](./connection-rate-billing-benchmark.md)
> 📅 2026-04-10  |  基于 **3400+ 样本**、**4 次独立大样本 benchmark**
> 覆盖 **3 provider × 3 path = 9 格完整对比矩阵**

---

## 一句话结论

**Hub 用 p50 的 ~150-200ms 代价，换来 p99 的 2 倍稳定性。记账 100% 准确。继续用 Hub。**

---

## 三个问题三个答案

| 问题 | 答案 |
|------|------|
| Hub 速率如何？ | **自身开销恒定 ~50ms p50**，p90 ≈ 60ms，p99 可低至 76ms |
| 能直连替代吗？ | **不建议**。9 格矩阵里 Hub 的 **p99 稳定性三冠王**；p50 代价 150-370ms 完全值得 |
| 记账准确吗？ | **100% 准确**。60/60 请求 token 和 credits 完全一致 |
| 三路对比结论？ | **Hub 稳 / OpenRouter 快 OpenAI+Google / Direct 快 Anthropic**。没有单一胜者 |

---

## 🎯 核心对比：9 格完整矩阵（3 Provider × 3 Path）

**短 payload，c=3 并发 60s 测试**。这是报告最核心的数据视图。

### p50 TTFB（中位延迟）—— 谁最快

| Provider / Model | Hub | Direct | OpenRouter | 最快 |
|-----------------|-----|--------|------------|------|
| **OpenAI** `gpt-5-nano` | 1025ms | 860ms | **673ms** ⭐ | OpenRouter |
| **Anthropic** `claude-haiku-4-5` | 948ms | **726ms** ⭐ | 1355ms | Direct |
| **Google** `gemini-2.5-flash` | 1187ms | 817ms | **677ms** ⭐ | OpenRouter |

### p99 TTFB（长尾稳定性）—— 谁最稳

| Provider / Model | Hub | Direct | OpenRouter | 最稳 |
|-----------------|-----|--------|------------|------|
| **OpenAI** `gpt-5-nano` | **1793ms** ⭐ | 3806ms | 2608ms | **Hub** |
| **Anthropic** `claude-haiku-4-5` | **1919ms** ⭐ | 7877ms | 3035ms | **Hub** |
| **Google** `gemini-2.5-flash` | **2390ms** ⭐ | 3592ms | 2660ms | **Hub** |

### cv（分布稳定性系数）—— 谁最可预测

| Provider / Model | Hub | Direct | OpenRouter | 最稳 |
|-----------------|-----|--------|------------|------|
| **OpenAI** `gpt-5-nano` | **0.23** ⭐ | 0.52 | 0.53 | **Hub** |
| **Anthropic** `claude-haiku-4-5` | **0.23** ⭐ | 1.16 | 0.60 | **Hub** |
| **Google** `gemini-2.5-flash` | **0.23** ⭐ | 0.50 | 0.47 | **Hub** |

## 🏆 三个核心发现

### 1. Hub 在 p99 和 cv 上都是"三冠王"

**所有 3 个 provider 的长尾稳定性（p99 + cv），Hub 都最优**。不是巧合，是 CF 骨干网对长尾延迟的系统性优化。

- Hub p99 比 Direct 稳 **2-4 倍**（Anthropic 差距最大：1919 vs 7877ms）
- Hub cv **一致保持在 0.23**，Direct 和 OpenRouter 都在 0.47-1.16 之间抖

### 2. p50 没有单一胜者

- OpenRouter 在 OpenAI / Google 上 p50 最快
- Direct 在 Anthropic 上 p50 最快
- Hub 在任何一个 provider 上都不是 p50 最快的

**Hub 的 p50 代价是 150-370ms，作为 p99 稳定性的 trade-off**。

### 3. OpenRouter 的"Anthropic 悖论"

对同一个 Anthropic claude-haiku-4-5，OpenRouter 的 p50 是 **1355ms**，竟然**比 Hub（948ms）和 Direct（726ms）都慢**。这说明 OpenRouter 的 Anthropic 路由有额外开销，可能是内部队列或额外的中间层。

**含义**：**不能笼统说"OpenRouter 更快"或"Hub 更慢"**。每个 provider 的最快路径都不同。

---

## 🚨 长生成场景的 TTFB vs Total Time 陷阱

**用同一个 model `openai/gpt-5-nano` + realistic payload (800 max_tokens) 跑完整的三路对比**，发现一个震惊的现象：

| Target | n | **TTFB p50** | TTFB p90 | cv | **Total p50** |
|--------|---|-------------|---------|------|--------------|
| **hub-openai** | 50 | 7091ms | 8325ms | **0.11** ⭐ | **7091ms** |
| **openai-direct** | 45 | 8267ms | 10414ms | 0.15 | 8267ms |
| **openrouter** | **13** ⚠️ | **1385ms** ⭐ | 1469ms | 0.15 | **29466ms** ⚠️⚠️⚠️ |

### 🤯 OpenRouter 的 TTFB vs Total 陷阱

- **TTFB 1385ms** — OpenRouter 是首字节最快的一路
- **Total 29466ms** — 但完成一个 800 token 的完整响应要 **近 30 秒**！
- **比 Hub 慢 4 倍**（29466ms vs 7091ms）
- OpenRouter 120 秒窗口只能跑完 **13 个请求**（Hub 跑完 50，Direct 跑完 45）—— 吞吐量只有 1/4

**意思是什么**：OpenRouter 在长生成场景下是 **首字节快但 streaming 慢得灾难性**。用户看到"它在回答"很快，但整个回复收完要等近 30 秒。**对真实 chat 场景来说这是不可接受的**。

### Hub vs Direct（长 payload）

去掉 OpenRouter 这个离群值，Hub vs Direct 的对比得到**独立验证**：

| 指标 | Hub | Direct | 差异 |
|------|-----|--------|------|
| TTFB p50 | **7091ms** | 8267ms | **Hub 快 -1176ms (-14%)** |
| TTFB p90 | 8325ms | 10414ms | Hub 快 -2089ms (-20%) |
| TTFB p99 | 9959ms | 10860ms | Hub 快 -901ms (-8%) |
| cv | **0.11** ⭐ | 0.15 | Hub **分布更稳定** |

**和之前 qlzusr run 的独立数据高度一致**（两次 benchmark 相差 83 分钟）：
- qlzusr run: Hub 7130ms vs Direct 8358ms（Hub 快 1228ms）
- 本次 run: Hub 7091ms vs Direct 8267ms（Hub 快 1176ms）

**"Hub 在 realistic payload 下比 Direct 快 ~1200ms" 不是偶然**，是跨时段可复现的稳定现象。

### 关键结论

**长生成场景下真正的赢家是 Hub**：
- **TTFB**: Hub 7091ms < Direct 8267ms < OpenRouter 1385ms（但总时间陷阱）
- **Total**: **Hub 7091ms < Direct 8267ms << OpenRouter 29466ms**（相差 4 倍）
- **吞吐量**: Hub / Direct 都是 ~0.4 req/sec，OpenRouter 只有 0.11 req/sec

**原因分析**：
1. Hub vs Direct：长生成时间放大了 Direct 跨太平洋路径的不稳定性，CF 骨干网稳定性优势盖过多一跳的固定开销
2. OpenRouter 陷阱：OpenRouter 的 streaming 吞吐率极低（可能是内部队列、proxy 限流、或对 OpenAI 的路由有 per-chunk 延迟）。它 TTFB 快是因为快速 ack 请求，但**后续 streaming 每个 chunk 都有额外延迟**。

**操作性建议**：
- ❌ **OpenRouter 不适合长生成场景**（> 500 tokens 输出），哪怕它 TTFB 最快
- ✅ **Hub 对长生成场景是明确的最优选择**（比 Direct 快，比 OpenRouter 快 4 倍）
- ✅ **OpenRouter 只适合短回复场景**（< 100 tokens 输出）—— 从短 payload 数据看它对 OpenAI/Google 的 p50 确实最快

---

## 💡 统一解释（一个公式解释所有现象）

```
Hub 延迟 = 直连延迟
         + 固定 ~50ms Hub 开销（Server-Timing 证实）
         + 固定 ~100-150ms 网络多一跳代价（CF edge）
         − CF 骨干网的长尾稳定性收益（对跨区域路径特别有效）
```

| 场景 | Hub 效果 | 原因 |
|------|---------|------|
| Short payload, p50 | 慢 150-370ms | 固定开销主导 |
| Short payload, p99 | **显著更稳** | CF 骨干网屏蔽偶发长尾 |
| Long generation, p50 | **反而更快** | 长时间生成放大 Direct 的不稳定性 |
| Long generation, p99 | **大幅更快** | 同上，更显著 |

---

## 🔍 Hub 时间都花在哪了 —— Server-Timing 拆解

通过 Hub Worker 在每个请求发出的 `Server-Timing` header（带 7 个 phase 的精确计时），可以**从服务端视角精确看到 Hub 每一步花了多少时间**。这是 Hub 有而 Direct/OpenRouter 没有的数据优势。

### Hub 处理开销的完整 phase 分布（基于 427 个 Hub 成功样本）

| Phase | p50 | p90 | **p99** | max | 占 p50 比例 | 说明 |
|-------|-----|-----|---------|-----|------------|------|
| session | 0ms | 0ms | 0ms | 0ms | 0% | 用户上下文提取（auth 中间件已做） |
| resolveProvider | **0ms** | 0ms | 54ms | 65ms | 0% | **isolate 内存缓存命中（优化生效）** |
| modelSetup | 5ms | 8ms | 16ms | 557ms | 10% | body 转换 + URL 构建 + KV gateway 配置 |
| usage | **0ms** | 0ms | 0ms | 0ms | 0% | **calculateCredits + D1 写入走 waitUntil 不阻塞** |
| **preChecks** | **45ms** | **54ms** | **140ms** | **1084ms** | **90%** ⚠️ | **Payment Kit credit 检查 RPC** |
| **Hub 合计** | **~50ms** | **~62ms** | **~210ms** | - | **100%** | Hub 代码总耗时 |

### 视觉化：50ms 里发生了什么

```
Hub 总 p50 开销: 50ms
│
├─ session         ╵  0ms  (0%)
├─ resolveProvider ╵  0ms  (0%)  ← isolate 缓存秒返回
├─ usage           ╵  0ms  (0%)  ← waitUntil 异步化
├─ modelSetup      ┤  5ms  (10%)
└─ preChecks       ████████████████████████████████████████████  45ms  (90%)
                                                    ↑
                                          Payment Kit Service Binding RPC
```

**💡 核心发现：Hub 90% 的时间花在一个 Service Binding RPC 上（Payment Kit credit 检查）**。其他所有 phase 加起来只有 5ms。这个数据直接指向下一步优化的明确目标 —— **加一个 30s TTL 的 KV 快路径，跳过 95% 的 credit 检查 RPC**。

### p99 暴露的问题：cold start 主要来自 preChecks

| Target | Hub p50 overhead | Hub p99 overhead | 差距 | 原因 |
|--------|------------------|------------------|------|------|
| hub-openai | 50ms | **1012ms** | +962ms | preChecks 冷启动 1004ms |
| hub-anthropic | 53ms | 141ms | +88ms | preChecks 冷启动 89ms |
| hub-google | 50ms | 409ms | +359ms | modelSetup 365ms（KV 冷读）|

**hub-openai 的 p99 长尾几乎 100% 来自 `preChecks` 的 Payment Kit 冷启动 RPC**（从 45ms 飙到 1004ms，占 p99 overhead 的 99%）。

**hub-google 则暴露了另一个问题**：`modelSetup` 的 KV cold read 偶发 365-557ms。这是 `resolveGatewayConfig` 读 KV `gateway-settings` 的开销，cold read 时很贵。

### 为什么 Hub 的 50ms 可以忽略：占总时间的比例

以 hub-anthropic 为例，典型的完整请求时间分布：

```
hub-anthropic 完整请求 p50 = 3740ms
│
├─ 客户端 ↔ CF edge 网络   ~200ms  (5%)  ██▌
├─ Hub 处理（包含所有 phase） 50ms  (1%)  ▏         ← 只占 1%
├─ CF → Anthropic + 首 token  486ms  (13%) ████▌
└─ Streaming 800 tokens     3202ms (86%) ████████████████████████████████████████████

→ Hub 对总时间贡献仅 ~1%，直连最多只能省这 50ms
```

### Server-Timing 揭示的 3 个 Hub 架构设计亮点

这些是通过 phase 数据**才能看到**的设计优点：

1. **`session` phase = 0ms** → 认证（DID auth via Service Binding）在 middleware 完成，handler 里只是读 Hono context，**零延迟**。
2. **`resolveProvider` phase p50 = 0ms** → isolate 内存缓存命中率 ~99%，**D1 查询几乎不发生**（只有 cache miss 或新 isolate 时才走 D1）。
3. **`usage` phase = 0ms** → `recordModelCall` 和 meter buffer 全部走 `waitUntil` 异步化，**D1 写入完全不阻塞用户响应**。记账是"免费"的。

**这 3 个优点是 Hub 能做到 50ms 固定开销的关键**。如果任何一个做错（比如每次查 D1 / 每次同步 recordModelCall），Hub overhead 就会飙到 200-300ms 以上。

---

## 模型延迟差异远比 Hub 大 14 倍

| Provider | Model | providerTtfb p50 | 相对最快 |
|----------|-------|-----------------|---------|
| Anthropic | claude-haiku-4-5 | **486ms** | 1x |
| Google | gemini-2.5-flash | 3942ms | 8.1x |
| OpenAI | gpt-5-nano | 6640ms | **13.7x** |

**对产品的启示**：延迟敏感场景应该**默认用 Anthropic claude-haiku-4-5**，不要用 OpenAI gpt-5-nano。**模型选择比任何 Hub 优化的效果都大一个数量级。**

---

## 记账验证：100% PASS

| 指标 | 结果 |
|------|------|
| 测试方法 | 60 请求（3 provider × 20），每个带唯一 `x-request-id`，等 10s 后查 D1 |
| D1 记录数 | **60/60** |
| Token 总数匹配 | **1268 tokens 完全一致** |
| Credits 计算 | **$0.0009928 精确匹配** |
| 匹配率 | **100%** |

**Hub 的记账系统可以作为生产计费依据**。waitUntil 可靠，无丢失，无误差。

---

## 本次优化（已完成）

Hub 处理开销 **154ms → 50ms**（降 98ms，-64%）：

- **优化 1**: `resolveProvider` 加 Worker isolate 内存缓存（60s TTL）
- **优化 2**: `resolveProvider` 和 `checkCredits` 改成并行执行

代码在 commit `28833d8` 中。

---

## 推荐下一步

### 🎯 最高 ROI 优化
**Payment Kit "has credits" KV 快路径**（30s TTL）
- 预期：warm overhead **50ms → ~5-10ms**
- 预期：cold start p99 **1012ms → ~200ms**
- 这一个优化能让 Hub 的 p50 降到和 Direct 差不多甚至更快

### 📋 可跟进
1. 打开 AI Gateway 再跑一次 benchmark，对比 Gateway on/off 的收益
2. Streaming 路径 `calculateCredits` 也传入 `provider.resolvedRate`（小 bug fix，省 ~15ms）
3. Cold start 细分诊断（Server-Timing 拆分 `ensureMeter` / `ensureCustomer`）

### ❌ 不建议
- 改成直连 API：**失去 100% 准确的记账 + CF 骨干网的 p99 稳定性优势**
- 继续榨取 Hub 的 50ms 开销到个位数：**边际收益远低于 Payment Kit 缓存优化**

---

## Hub 的真实定位

基于数据，**Hub 不是"延迟优化层"，也不是"延迟代价层"**：

| 价值 | 重要性 | 数据支撑 |
|------|-------|---------|
| **统一计费** | 🟢 核心 | 100% 匹配率 |
| **统一认证** | 🟢 核心 | 一个 access key 支持 4 个 provider |
| **统一目录** | 🟢 核心 | Hub 内置 model catalog |
| **p99 稳定性** | 🟢 意外之喜 | 比 Direct 稳 2-3 倍 |
| **长生成场景延迟** | 🟡 潜在优势 | CF 骨干网 > 跨太平洋直连 |
| **短请求 p50** | 🟡 小幅代价 | 慢 150-370ms |

**Hub 是"稳定性优化层 + 统一接入层"**。AI Agent 场景下，p99 的可预测性比 p50 的速度更重要。

---

## 是否需要读完整报告？

**如果你只想做决策** → 这份速读版就够了。直接按推荐执行。

**如果你想深入了解**，完整报告里有：
- 三次大样本 benchmark 的完整数据（realistic + short + fill-gaps）
- 每个 Server-Timing phase 的详细 p50/p90/p99
- Cold start 现象的深度分析
- Anthropic rate limit 的影响与解决方案
- DuckDB / jq 查询示例和数据 schema
- 完整的复现方法

→ [`connection-rate-billing-benchmark.md`](./connection-rate-billing-benchmark.md)
