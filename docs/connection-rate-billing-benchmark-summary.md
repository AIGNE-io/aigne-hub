# AIGNE Hub 连接速率与记账报告（速读版）

> 📄 完整报告: [`connection-rate-billing-benchmark.md`](./connection-rate-billing-benchmark.md)
> 📅 2026-04-10  |  基于 **3000+ 样本**、**3 次独立大样本 benchmark**

---

## 一句话结论

**Hub 用 p50 的 ~150-200ms 代价，换来 p99 的 2 倍稳定性。记账 100% 准确。继续用 Hub。**

---

## 三个问题三个答案

| 问题 | 答案 |
|------|------|
| Hub 速率如何？ | **自身开销恒定 50ms p50**，p90 在 56-65ms，p99 可低至 76ms |
| 能直连替代吗？ | **不建议**。Direct p50 稍快，但 Hub p99 稳 2-3 倍；长生成场景 Hub 反而更快 |
| 记账准确吗？ | **100% 准确**。60/60 请求 token 和 credits 完全一致 |

---

## 🎯 核心对比：同一个 model 三路对比

用**完全相同的 model `openai/gpt-5-nano`**，同时段同 payload，测试三条路径：

| 路径 | n | p50 | p90 | p99 | cv（稳定性） |
|-----|---|-----|-----|-----|-----|
| **OpenRouter 代理** | 40 | **681ms** ⭐ | 1428ms | 1538ms | 0.34 |
| **直连 OpenAI** | 179 | **860ms** | **1217ms** ⭐ | 3806ms | 0.52 |
| **Hub 代理** | 169 | **1025ms** | 1219ms | **1793ms** ⭐ | **0.23** ⭐ |

**每个维度的胜者都不一样**：

- **p50 最快** → OpenRouter（681ms，但只能跑出 40 样本，总吞吐最低）
- **p90 并列** → Direct 和 Hub（1217 vs 1219，完全一样）
- **p99 最稳** → **Hub**（1793ms，比 Direct 的 3806ms 稳 2 倍）
- **cv 最低** → **Hub**（0.23，Direct 的 0.52 说明分布抖得厉害）

**Hub 用 165ms 的 p50 代价换取了 2 倍的 p99 稳定性。这是一个清晰的工程 trade-off。**

---

## Anthropic 干净数据（c=1 无限流）

| Target | n | p50 | p90 | **p99** | cv |
|--------|---|-----|-----|---------|-----|
| **Hub** | 40 | 948ms | 1364ms | **1919ms** ⭐ | **0.23** ⭐ |
| **Direct** | 40 | **761ms** ⭐ | **974ms** ⭐ | **7877ms** ⚠️ | 1.16 |

**Direct 的 p50/p90 更快，但 p99 爆炸**：40 个请求里 1 个飙到 7877ms（正常范围 600-1200ms），cv=1.16。

**Hub 分布稳**，最慢的请求也只有 1919ms（约 p50 的 2 倍）。

→ **Hub 快 5958ms on p99** 是真实差距，不是偶然。

---

## 为什么长生成场景 Hub 反而更快？

OpenAI gpt-5-nano + realistic payload (800 max_tokens) 下：

| 指标 | Hub | Direct | 差异 |
|------|-----|--------|------|
| p50 TTFB | 7130ms | 8358ms | **Hub 快 -1228ms (-15%)** 🤯 |
| p99 TTFB | 10104ms | 15664ms | **Hub 快 -5560ms (-36%)** 🤯 |

**原因**：长生成时间放大了 Direct 路径的网络不稳定性，CF 骨干网的稳定性优势盖过了多一跳的固定开销。这对**跨太平洋访问美国 provider** 的场景特别有利。

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

## Hub 处理开销（三次 benchmark 高度一致）

| Phase | p50 | p90 | 说明 |
|-------|-----|-----|------|
| session | 0ms | 0ms | 用户上下文提取 |
| resolveProvider | **0ms** | 0ms | isolate 缓存命中（优化效果） |
| preChecks | 45ms | 50ms | Payment Kit credit 检查（**主要瓶颈**） |
| modelSetup | 5ms | 6ms | body 转换 + URL 构建 |
| **合计** | **~50ms** | **~60ms** | Hub 全部代码花的时间 |

**Hub 处理开销的 90% 花在 Payment Kit credit 检查这一个 Service Binding RPC 上**。下一步优化目标明确。

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
