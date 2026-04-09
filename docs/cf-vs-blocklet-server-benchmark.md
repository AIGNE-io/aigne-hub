# AIGNE Hub: Cloudflare Workers vs Blocklet Server 性能基准测试报告

> 测试日期: 2026-04-09
> 测试模型: GPT 系列 (OpenAI)
> 每组测试: 10 轮串行请求

---

## 测试环境

| | Blocklet Server (BS) | Cloudflare Workers (CF) |
|--|--|--|
| 地址 | `staging-hub.aigne.io` | `aigne-hub-staging.zhuzhuyule-779.workers.dev` |
| 部署方式 | Blocklet Server on VM | CF Workers (边缘计算) |
| 到上游路径 | 直连 Provider API | 直连 / 可选 AI Gateway |
| 认证 | blocklet-service Access Key | 同左 (Service Binding RPC) |
| 计费 | Payment Kit SDK | Payment Kit Service Binding |

### CF 代理模式说明

CF Workers 支持两种上游代理模式，可通过配置切换：

```
模式 A — 自建代理（直连）
  用户 → CF Worker → Provider API (OpenAI / Anthropic / Google)
  特点: 低延迟、Worker 自带凭证直连上游

模式 B — AI Gateway 代理
  用户 → CF Worker → Cloudflare AI Gateway → Provider API
  特点: 支持缓存、日志聚合、限流，但多一跳
```

当前代码逻辑：
- **Streaming 请求**: 自动使用模式 A（直连），因为 streaming 几乎无缓存收益
- **非 Streaming 请求**: 当 AI Gateway 开启时使用模式 B，关闭时使用模式 A
- **无凭证的 Custom Provider**: 强制使用模式 B（Gateway 托管凭证）

---

## 一、GPT 模型性能对比

### 1. 非 Streaming 模式

**CF 使用: 模式 A（自建代理直连，AI Gateway 关闭）**
BS 使用: 直连

| 模型 | BS 平均 | CF 平均 | 差异 | BS 成功 | CF 成功 |
|------|---------|---------|------|---------|---------|
| gpt-3.5-turbo | 2.40s | 2.04s | **CF 快 15%** | 10/10 | 10/10 |
| gpt-5.4-mini | 2.14s | 2.29s | CF 慢 7% | 10/10 | 10/10 |
| gpt-5.4-nano | 2.17s | 1.91s | **CF 快 12%** | 10/10 | 10/10 |
| **平均** | **2.24s** | **2.08s** | **CF 快 7%** | **30/30** | **30/30** |

### 2. Streaming 模式

**CF 使用: 模式 A（自建代理直连，自动跳过 AI Gateway）**
BS 使用: 直连
测量 TTFB（首字节时间）和总耗时。

| 模型 | BS TTFB | CF TTFB | TTFB 差异 | BS 总耗时 | CF 总耗时 | 总耗时差异 |
|------|---------|---------|----------|----------|----------|----------|
| gpt-3.5-turbo | 1.92s | 1.75s | **CF 快 9%** | 1.94s | 1.79s | **CF 快 8%** |
| gpt-5.4-mini | 2.13s | 1.83s | **CF 快 14%** | 2.15s | 1.87s | **CF 快 13%** |
| gpt-5.4-nano | 2.23s | 1.70s | **CF 快 24%** | 2.28s | 1.75s | **CF 快 23%** |
| **平均** | **2.09s** | **1.76s** | **CF 快 16%** | **2.12s** | **1.80s** | **CF 快 15%** |

### 3. 逐轮明细

#### gpt-3.5-turbo (Streaming, CF 模式 A)

| 轮次 | BS | CF | 更快方 |
|------|----|----|--------|
| 1 | 2.51s | 1.62s | CF |
| 2 | 2.20s | 2.43s | BS |
| 3 | 2.07s | 1.54s | CF |
| 4 | 1.84s | 1.57s | CF |
| 5 | 1.42s | 1.54s | BS |
| 6 | 2.15s | 1.75s | CF |
| 7 | 1.77s | 1.59s | CF |
| 8 | 1.67s | 2.50s | BS |
| 9 | 1.74s | 1.56s | CF |
| 10 | 2.00s | 1.75s | CF |
| **CF 胜率** | | | **7/10** |

#### gpt-5.4-mini (Streaming, CF 模式 A)

| 轮次 | BS | CF | 更快方 |
|------|----|----|--------|
| 1 | 2.01s | 2.10s | BS |
| 2 | 1.92s | 1.85s | CF |
| 3 | 2.21s | 1.96s | CF |
| 4 | 1.88s | 1.88s | 持平 |
| 5 | 1.85s | 1.77s | CF |
| 6 | 1.85s | 1.87s | BS |
| 7 | 3.47s | 1.94s | CF |
| 8 | 1.88s | 1.61s | CF |
| 9 | 2.38s | 1.97s | CF |
| 10 | 2.00s | 1.77s | CF |
| **CF 胜率** | | | **7/10** |

#### gpt-5.4-nano (Streaming, CF 模式 A)

| 轮次 | BS | CF | 更快方 |
|------|----|----|--------|
| 1 | 2.04s | 2.03s | CF |
| 2 | 2.43s | 2.22s | CF |
| 3 | 4.01s | 1.59s | CF |
| 4 | 1.72s | 1.79s | BS |
| 5 | 2.31s | 1.60s | CF |
| 6 | 1.74s | 1.58s | CF |
| 7 | 2.84s | 1.64s | CF |
| 8 | 1.88s | 1.54s | CF |
| 9 | 1.85s | 1.66s | CF |
| 10 | 1.97s | 1.80s | CF |
| **CF 胜率** | | | **9/10** |

---

## 二、CF 自建代理 vs AI Gateway 代理

同一 CF Workers 环境下，对比模式 A（直连）和模式 B（AI Gateway）的差异。

### 非 Streaming

| 模型 | CF 模式 A (直连) | CF 模式 B (Gateway) | Gateway 额外开销 | 模式 B 成功率 |
|------|:---------------:|:------------------:|:---------------:|:------------:|
| gpt-3.5-turbo | 2.04s | 2.04s | 0ms | 10/10 |
| gpt-5.4-mini | 2.29s | 3.03s | +740ms | **3/10** |
| gpt-5.4-nano | 1.91s | 2.39s | +480ms | 10/10 |
| **平均** | **2.08s** | **2.49s** | **+407ms** | **23/30 (77%)** |

### Streaming

Streaming 模式下 CF 自动使用模式 A（直连），不经过 AI Gateway，因此无模式 B 数据。

这是设计决策：streaming 请求的 messages 每次不同，Gateway 缓存命中率接近零，多一跳只增加延迟无收益。

### AI Gateway 的价值场景

AI Gateway（模式 B）虽然增加延迟，但在以下场景有价值：

| 场景 | 是否推荐 Gateway |
|------|:---------------:|
| 非 Streaming + 可能有重复请求（缓存命中） | 推荐 |
| Streaming（每次内容不同） | 不推荐 |
| 需要 Gateway 控制台日志聚合 | 推荐 |
| 无凭证的 Custom Provider（Gateway 托管 Key） | 必须 |
| 高稳定性要求（避免间歇性 502） | 不推荐 |

---

## 三、稳定性对比

| 模式 | BS 成功率 | CF 成功率 |
|------|----------|----------|
| 非 Streaming — CF 模式 A (直连) | 30/30 (100%) | 30/30 (100%) |
| Streaming — CF 模式 A (直连) | 30/30 (100%) | 30/30 (100%) |
| 非 Streaming — CF 模式 B (Gateway) | — | 23/30 (77%) |
| **模式 A 总计** | **60/60 (100%)** | **60/60 (100%)** |

模式 A（直连）下两边稳定性完全一致。模式 B（Gateway）存在间歇性 500/502 错误，主要影响 gpt-5.4-mini。

---

## 四、结论

### CF Workers 自建代理整体优于 Blocklet Server

| 指标 | Blocklet Server | CF 模式 A (直连) | 提升 |
|------|----------------|-----------------|------|
| 非 Streaming 平均延迟 | 2.24s | 2.08s | **快 7%** |
| Streaming 平均 TTFB | 2.09s | 1.76s | **快 16%** |
| Streaming 平均总耗时 | 2.12s | 1.80s | **快 15%** |
| Streaming CF 胜率 | — | — | **23/30 (77%)** |
| 稳定性 | 100% | 100% | 持平 |

### CF 自建代理 vs AI Gateway

| 指标 | CF 模式 A (直连) | CF 模式 B (Gateway) | 差异 |
|------|-----------------|-------------------|------|
| 非 Streaming 平均延迟 | 2.08s | 2.49s | Gateway 慢 407ms |
| 稳定性 | 100% | 77% | Gateway 间歇失败 |

### 快在哪里

1. **边缘网络优势**: CF Workers 运行在离用户和 Provider 都更近的边缘节点，减少了网络往返延迟
2. **轻量级运行时**: CF Workers 的 V8 isolate 启动和执行比 Blocklet Server 的 Node.js + Express 更轻量
3. **Streaming 场景收益最大**: 首字节到达时间（TTFB）快 16%，用户感知的"响应速度"有明显提升
4. **自建代理优于 Gateway**: 直连模式避免了 Gateway 的额外跳转（+407ms）和间歇性错误（23% 失败率）

### 建议配置

| 场景 | 推荐模式 |
|------|---------|
| 生产环境日常使用 | **模式 A（自建代理直连）** — 低延迟、高稳定 |
| 需要请求缓存/日志聚合 | 模式 B（AI Gateway）— 仅非 Streaming |
| 无自有凭证的 Provider | 模式 B（AI Gateway）— 必须 |

### 未纳入测试

- Google Gemini 模型: 免费层 API 配额限制 (20 RPM) 导致 CF 端大面积 429，升级为付费 Key 后可补测
- gpt-5: CF 端 Provider 凭证失效，需重新配置后补测

---

*测试脚本: `tests/ab-compare.sh`*
*数据基于单请求串行测试，未做并发压测*
