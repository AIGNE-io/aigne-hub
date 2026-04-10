# AIGNE Hub 连接速率与记账报告（速读版）

> 📄 完整报告: [`connection-rate-billing-benchmark.md`](./connection-rate-billing-benchmark.md)（651 行）
> 📅 2026-04-10  |  基于 **2600+ 样本**、**2 次独立 benchmark**

---

## 一句话结论

**继续用 Hub，不用直连。** Hub 加 50ms 固定开销，换来 100% 准确的记账 + 统一接入 + 长生成场景下比直连更快更稳。

---

## 三个问题三个答案

| 问题 | 答案 |
|------|------|
| Hub 速率如何？ | **自身开销恒定 50ms p50**，占典型 AI 请求的 1-5%（可忽略）|
| 能直连替代吗？ | **不建议**。短请求直连快 200-370ms，长请求 Hub 反而快 1228ms |
| 记账准确吗？ | **100% 准确**。60/60 请求 token 和 credits 完全一致 |

---

## 一张图看懂 Hub 的真实延迟成本

**场景 A：短请求（agent tool-call，30 token 输出）**

```
OpenAI:    [Direct ▇▇▇▇▇▇▇▇▇▇▇ 1055ms]  [Hub ▇▇▇▇▇▇▇▇▇▇▇▇▇ 1259ms]  Hub 慢 +204ms (+19%)
Anthropic: [Direct ▇▇▇▇▇▇▇▇ 726ms]       [Hub ▇▇▇▇▇▇▇▇▇▇ 965ms]     Hub 慢 +239ms (+33%)
Google:    [Direct ▇▇▇▇▇▇▇▇▇ 817ms]      [Hub ▇▇▇▇▇▇▇▇▇▇▇▇ 1187ms]  Hub 慢 +370ms (+45%)
```

**场景 B：真实 chat（800 token 输出，typical usage）**

```
OpenAI p50:  [Hub ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 7130ms]  [Direct ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 8358ms]
                                                                Hub 快 -1228ms (-15%) ⭐

OpenAI p99:  [Hub ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 10104ms]
             [Direct ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 15664ms]
                                                                Hub 快 -5560ms (-36%) ⭐⭐
```

**为什么两个场景结果相反？** Hub 自身始终是 50ms 固定开销。变化的是网络路径：短请求下网络多一跳的代价清晰可见；长请求下 CF 骨干网的稳定性优势盖过多一跳的代价，尤其对跨太平洋访问美国 provider。

---

## Hub 处理开销（两次 benchmark 一致）

| Phase | p50 | p90 | p99（最优） | 说明 |
|-------|-----|-----|-----------|------|
| session | 0ms | 0ms | 0ms | 用户上下文提取 |
| resolveProvider | **0ms** | 0ms | 0ms | 缓存命中（优化效果） |
| preChecks | 45ms | 50ms | 60ms | Payment Kit credit 检查（主要瓶颈） |
| modelSetup | 5ms | 6ms | 10ms | body 转换 + URL 构建 |
| **合计** | **~50ms** | **~60ms** | **~80ms** | Hub 全部代码花的时间 |

**结论**: Hub 自身 95% 的时间花在 Payment Kit credit 检查这一个 RPC 上。下一步优化目标明确。

---

## 模型延迟差异远比 Hub 大 14 倍

| Provider | Model | providerTtfb p50 | 相对最快 |
|----------|-------|-----------------|---------|
| Anthropic | claude-haiku-4-5 | **486ms** | 1x |
| Google | gemini-2.5-flash | 3942ms | 8.1x |
| OpenAI | gpt-5-nano | **6640ms** | **13.7x** |

**对产品的启示**：延迟敏感场景应该默认用 **Anthropic claude-haiku-4-5**，不要用 OpenAI gpt-5-nano。模型选择比任何 Hub 优化的效果都大一个数量级。

---

## 记账验证：100% PASS

| 指标 | 结果 |
|------|------|
| 测试方法 | 60 请求（3 provider × 20），每个带唯一 `x-request-id`，等 10s 后查 D1 |
| D1 记录数 | **60/60** |
| Token 总数匹配 | **1268 tokens 完全一致** |
| Credits 计算 | **$0.0009928 精确匹配** |
| 匹配率 | **100%** |

**Hub 的记账系统可以作为生产计费依据。** waitUntil 可靠，无丢失，无误差。

---

## 本次优化（已完成）

Hub 处理开销 **154ms → 50ms**（降 98ms，-64%）：

- **优化 1**: `resolveProvider` 加 Worker isolate 内存缓存（60s TTL）→ D1 查询从 50ms → 0ms
- **优化 2**: `resolveProvider` 和 `checkCredits` 改成并行执行 → 省另外 50ms

代码在 commit `28833d8` 中。

---

## 推荐下一步

### 🎯 最高 ROI 优化
**Payment Kit "has credits" KV 快路径**（30s TTL）
- 预期：warm overhead 50ms → **~5-10ms**
- 预期：cold start p99 1012ms → **~200ms**

### 📋 可跟进
1. Streaming 路径 `calculateCredits` 也传入 `provider.resolvedRate`（小 bug fix）
2. 打开 AI Gateway 再跑一次 benchmark，对比 Gateway on/off 的收益
3. Cold start 的 Server-Timing 细分（定位 cold start 的具体瓶颈）

### ❌ 不建议
- 继续压榨 Hub 的 50ms 开销（边际收益太低）
- 改成直连 API（失去统一计费和 CF 网络优势）

---

## 是否需要读完整报告？

**如果你只想做决策** → 这份速读版就够了。直接按推荐执行。

**如果你想深入了解**，完整报告里有：
- 每个 Server-Timing phase 的详细数据
- Cold start 现象的深度分析
- 两次 benchmark 的完整对比
- Anthropic rate limit 的影响分析
- DuckDB 查询示例和数据 schema
- 完整的复现方法

→ [`connection-rate-billing-benchmark.md`](./connection-rate-billing-benchmark.md)
