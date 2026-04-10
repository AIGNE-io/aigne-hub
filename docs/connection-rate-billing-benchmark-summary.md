# AIGNE Hub 连接速率与记账报告（速读版）

> 完整报告：[`connection-rate-billing-benchmark.md`](./connection-rate-billing-benchmark.md)
> 日期：2026-04-10
> 数据规模：一共发出 5844 次 API 请求，有效延迟样本 4911 条

---

## 结论摘要

跨时段稳健的结论（在多个时段采集的数据中验证）：

- Hub 自身处理开销：p50 在 42-52ms，跨 12 个 target、n=2000+ 的 Server-Timing 计时稳定。这是本报告最可靠的跨时段不变指标。
- 记账准确性：60/60 请求 token 和 credits 匹配。
- Hub vs Direct 的 p50 关系：在多个时段采集的样本中，Hub 的 p50 一致高于 Direct。差值范围 92-367ms（取决于 provider）。
- Realistic payload 场景 Hub 比 Direct 低约 1200ms：两次独立采集（c=5/180s 和 c=3/120s）结果一致，偏差 <5%。可能与 CF 骨干网对跨太平洋路径的路由质量有关，需要更多时段数据验证。
- OpenRouter `gpt-5-nano` 的 p50 快速峰：多组独立采样 p50 都在 674-685ms。

对时段敏感、不能作为跨时段结论的：

- Hub vs Direct 的 p99 关系：不同时段采集时符号反转，无稳定赢家（见 §时段漂移分析）
- Hub OpenAI 的 cv：不同时段在 0.14-0.53 之间波动
- OpenRouter `gpt-5-nano` 的长尾：约 18% 请求偏离快速峰（>1000ms），约 6% 偏离 >2000ms
- OpenRouter 长生成场景 Total：p50=29.5s，p99=46.5s，不适合 >500 tokens 输出场景

---

## 三个问题三个答案

| 问题 | 答案 |
|------|------|
| Hub 自身处理速率如何？ | p50 42-52ms，p90 50-72ms，跨时段稳定（Server-Timing 直接计时） |
| 能用 Direct 替代 Hub 吗？ | p50 上 Direct 一致快 92-367ms；p99 跨时段胜负不稳定；另需考虑记账、统一接入、长生成场景等因素 |
| 记账准确吗？ | 60/60 请求 token 与 credits 完全一致 |
| 三路对比？ | p50：OpenRouter 最快（OpenAI / Google），Direct 最快（Anthropic），Hub 居中；p99：无跨时段稳定的胜负关系 |

---

## 本报告数据基础

- 总样本：一共发出 5844 次 API 请求（含 933 个错误样本，其中 923 个为 Anthropic 429 限流），有效延迟样本 4911 条
- 覆盖面：3 provider × 3 path × 2 种 payload（short + realistic）
- 采集时段：2026-04-10 的多个时段窗口（04:02-08:49 UTC，跨约 5 小时）
- 有效样本的分类（互不重叠）：
  - 记账准确性验证：60 样本（60/60 匹配）
  - 优化前后 smoke test：48 样本
  - 延迟性能测试（含 OpenRouter 深度补采、Hub vs Direct 稳定性复核等）：4803 样本
- Anthropic 的限流处理：`hub-anthropic` 和 `anthropic-direct` 的错误样本来自早期 c=5 realistic payload 触发的 Anthropic 50 req/min 限流。报告中 Anthropic 的所有统计使用 c=1 sequential + 800ms delay 的干净数据（n=160 样本/path，0 错误）
- 持久化：每条样本都带 Server-Timing phase 数据和 git commit 信息，存于 `benchmarks/data/samples.jsonl`

**关于 n（样本数）的说明**：每个表下面标注的 n 是该 cell 一共发出多少次 API 请求。例如 Hub OpenAI short/c3 的 n=758 表示"这个条件下一共发了 758 次请求"。样本数越大，p50/p90/p99 的统计越稳定。但样本数大不代表结论跨时段稳健——同一个 cell 在不同时段采集的数据可能会漂移（例如 Hub OpenAI 的 p50 在不同时段采集的数据段中可以在 1025-1259ms 之间波动）。本报告会区分"在单次采集窗口内稳定"和"跨多个时段窗口稳健"两种说法。

### 术语速查

| 术语 | 含义 |
|------|------|
| `c=N` | concurrency（并发数）—— benchmark 客户端同时开 N 个 worker 并行发请求 |
| `c=1 sequential` | 单线程顺序发请求（带延时） |
| TTFB | Time To First Byte，从发出请求到收到第一个字节的时间 |
| Total | 从发出请求到完整收完响应的时间（包含 streaming） |
| p50/p90/p99 | 第 50/90/99 百分位 |
| cv | 变异系数 = stddev/avg，数值越大分布越分散 |
| 样本数 (n) | 该 cell 一共发出多少次 API 请求。是本报告衡量数据可靠性的主要指标 |
| short payload | 短 prompt + 30 max_tokens，用于测连接延迟 |
| realistic payload | 1K 系统提示 + 800 max_tokens，模拟真实 chat 场景 |
| Hub / Direct / OpenRouter | 三条路径：Hub 代理 / 客户端直连 Provider / OpenRouter 第三方代理 |
| Server-Timing | W3C 的服务端计时 header，Hub 用它暴露内部各 phase 耗时 |
| 🌟 | 在数据对比表中标注每行的优势单元格（最低延迟、最低 cv、最高吞吐等）。仅反映该表呈现的数字，对 p99/cv 等跨时段不稳定的指标，不代表跨时段稳健结论——需要结合表下的说明判断 |

**跨时段稳健性**：当报告说"跨时段稳健"时，意思是在不同时间窗口采集的样本中观察到同样的方向或结论。例如"Hub vs Direct 的 Δp50 跨时段稳健"表示在多个时间窗口采集的数据里 Hub 都比 Direct 慢一个固定范围（92-367ms）。反之"p99 跨时段不稳定"表示不同时段采集的 p99 甚至可能符号反转。

### Streaming 模式的行为差异

本报告所有延迟 benchmark 都使用 streaming 模式（`stream: true`）。不同 provider 的流式行为不同：

| Provider | providerTtfb p50 | streaming p50 | 行为 |
|----------|-----------------|--------------|------|
| OpenAI `gpt-5-nano` | 6640ms | 30ms | 内部完整生成后一次性返回，非渐进流式 |
| Anthropic `claude-haiku-4-5` | 486ms | 3202ms | 首字节 ~0.5 秒，后续持续输出 token |
| Google `gemini-2.5-flash` | 3942ms | 1046ms | 首字节 ~4 秒，流式持续约 1 秒 |

含义：
- gpt-5-nano 的 TTFB 实际等于完整响应时间，即 TTFB ≈ Total（见 §4.2.2：Hub 7091 / 7091ms，Direct 8267 / 8267ms）
- claude-haiku-4-5 是渐进流式，适合需要"正在输入"反馈的 UI 场景
- OpenRouter 对 gpt-5-nano 的 TTFB 较低（~1385ms），但 Total 达到 29.5 秒，说明其在中间层对流式 chunk 做了延迟处理

---

## 9 格完整矩阵（3 Provider × 3 Path，short payload, c=3）

所有 Hub 和 Direct 的 cell 都来自不同时段窗口采集的样本合并后的大样本统计。OpenRouter cell 同样来自多个时段窗口的采集合并（详见 §OpenRouter 双峰分布分析）。Anthropic 使用 c=1 sequential 以避开 50 req/min 限流。

### 样本数

| Provider | Hub | Direct | OpenRouter |
|----------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 758 | 835 | 225 |
| Anthropic `claude-haiku-4-5` | 160 (c=1) | 160 (c=1) | 103 |
| Google `gemini-2.5-flash` | 568 | 691 | 189 |

### p50 TTFB

| Provider / Model | Hub | Direct | OpenRouter | 最快 |
|-----------------|-----|--------|------------|------|
| OpenAI `gpt-5-nano` | 1108ms | 971ms | 🌟 675ms | OpenRouter |
| Anthropic `claude-haiku-4-5` (c=1) | 985ms | 🌟 807ms | 1354ms | Direct |
| Google `gemini-2.5-flash` | 1196ms | 901ms | 🌟 677ms | OpenRouter（单时段窗口）|

表格中 🌟 标注每行的最低 p50 cell。附加说明：
- OpenAI OpenRouter 675ms：多个时段采集的样本中 p50 都稳定在 674-685ms
- Anthropic Direct 807ms：不同时段采集的 Anthropic 数据中 Direct 一致低于 Hub（Δp50 92-220ms）
- Google OpenRouter 677ms 在单个时段窗口内最快，没有多时段验证数据。Google 的 Hub/Direct 对比在不同时段中 Direct 一致低于 Hub（Δp50 258-367ms）

### p99 TTFB

| Provider / Model | Hub | Direct | OpenRouter |
|-----------------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 3251ms | 3059ms | 🌟 2608ms |
| Anthropic `claude-haiku-4-5` (c=1) | 🌟 2217ms | 3271ms | 3035ms |
| Google `gemini-2.5-flash` | 2755ms | 2670ms | 🌟 2660ms |

> 🌟 仅表示该表合并数据下的最低 p99，**不代表跨时段最优**。p99 对时段敏感：在不同时段采集的数据中，OpenAI 和 Anthropic 的 Hub vs Direct p99 胜负关系会反转。详见 §时段漂移分析。

### cv

| Provider / Model | Hub | Direct | OpenRouter |
|-----------------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 🌟 0.37 | 0.45 | 0.51 |
| Anthropic `claude-haiku-4-5` (c=1) | 🌟 0.27 | 0.67 | 0.60 |
| Google `gemini-2.5-flash` | 🌟 0.26 | 0.38 | 0.47 |

> 🌟 表示该表合并数据下的最低 cv。注意 Hub OpenAI 的 cv 在不同时段采集时波动可在 0.14-0.53 之间，cv 对时段敏感。

## 核心发现

### 1. Hub vs Direct 的 p50 关系跨时段稳健

在不同时段采集的数据中，Hub 的 p50 一致高于 Direct：

| Provider | 不同时段采集的 Δp50 (Hub - Direct) | 范围 |
|----------|----------------------------------|------|
| OpenAI `gpt-5-nano` | +204, +165, +153, +168, +115 | 115-204ms |
| Google `gemini-2.5-flash` | +367, +288, +258, +289 | 258-367ms |
| Anthropic `claude-haiku-4-5` (c=1) | +180, +220, +143, +92 | 92-220ms |

**客观评价**：Hub 在 short payload 下相对 Direct 有一个稳定的 p50 延迟成本：
- OpenAI 约 150ms（跨时段均值）
- Google 约 300ms（跨时段均值）
- Anthropic 约 160ms（跨时段均值）

这个成本在所有测试时段都成立，可以作为容量规划或 SLO 设定的依据。

### 2. Hub vs Direct 的 p99 关系跨时段不稳定

在不同时段采集的数据中，Δp99 的符号和数值变化很大：

| Provider | 不同时段采集的 Δp99 (Hub - Direct) |
|----------|----------------------------------|
| OpenAI | +2065, -2013, +609, -1103, +147 |
| Google | -1202, +256, +272, +123 |
| Anthropic (c=1) | -5958, -1235, +358, +627 |

OpenAI 和 Anthropic 的 Hub vs Direct p99 胜负关系跨时段反转。这意味着单个时段窗口的 p99 数据不能用来声称任一路径的"稳定性优势"。多时段合并后的 p99 反映的是分布宽度，而不是某一方稳定优于另一方。

### 3. Hub 自身处理开销稳健

通过 Server-Timing header 直接测得的 Hub 内部处理时间（去除 provider 和 streaming 部分）：

| Target | n | overhead p50 |
|--------|---|-------------|
| hub-openai（早期数据合并） | 303 | 50ms |
| hub-openai-nano | 169 | 49ms |
| hub-openai-long | 50 | 47ms |
| stab-hub-openai（新采集） | 458 | 42ms |
| hub-anthropic | 299 | 52ms |
| hub-anthropic-c1 | 40 | 51ms |
| stab-hub-anthropic-c1 | 120 | 44ms |
| hub-google | 370 | 50ms |
| stab-hub-google | 425 | 45ms |

**客观评价**：跨 12 个 target、n=2000+ 样本，Hub 自身处理开销 p50 稳定在 **42-52ms** 范围。这是本报告中最可靠的跨时段不变指标。构成：preChecks（Payment Kit RPC）约 45ms，其他 phase 合计约 5ms。

新采集的样本（42-45ms）略低于早期采集的样本（47-52ms），可能来自 Payment Kit 侧的优化或路径改进。两组数据都在 42-52ms 范围内。

### 4. p50 的路径排序（基于合并数据）

| Provider | 最快 | 中间 | 最慢 |
|----------|------|------|------|
| OpenAI `gpt-5-nano` | OpenRouter 675ms | Direct 971ms | Hub 1108ms |
| Anthropic `claude-haiku-4-5` | Direct 807ms | Hub 985ms | OpenRouter 1354ms |
| Google `gemini-2.5-flash` | OpenRouter 677ms | Direct 901ms | Hub 1196ms |

OpenRouter 对 Anthropic 的 p50 比 Direct 慢约 550ms，推测是 OpenRouter 对 Anthropic 的路由层额外开销。**没有单一路径在所有 3 个 provider 上都是 p50 最快**。

### 5. OpenRouter `gpt-5-nano` 的双峰分布

前期 40-42 样本时 OpenRouter × gpt-5-nano 的 cv 表现为 0.34 和 0.53，存在双峰假设。补数据到 n=225 后确认分布结构：

| TTFB 区间 | 样本数 | 占比 |
|----------|-------|------|
| 500-1000ms（快速峰） | 117 | 81.8% |
| 1000-1500ms | 17 | 11.9% |
| 1500-2000ms | 1 | 0.7% |
| 2000-3000ms | 6 | 4.2% |
| >3000ms（尾部） | 2 | 1.4% |

- 不同时段采集的 p50 均在 674-685ms，高度一致
- 约 18% 的请求偏离快速峰进入 1000ms+ 区间，约 6% 进入 2000ms+
- cv 在不同时段采集中稳定在 0.51-0.54
- 可能原因：OpenRouter 后端的冷/热连接池或多路径路由

**注意**：OpenRouter 的 p50=675ms 不代表"所有请求都在 675ms 左右"。实际分布是"约 82% 请求快速、约 18% 请求偏慢"的结构。

---

## 长生成场景（realistic payload）

同一个 model `openai/gpt-5-nano` + realistic payload (800 max_tokens) 的三路对比。

测试条件：c=3 并发。Hub/Direct 来自单个时段窗口采集，OpenRouter 来自两个时段窗口合并。

| 指标 | Hub | Direct | OpenRouter |
|------|-----|--------|------------|
| TTFB p50 | 7091ms | 8267ms | 🌟 1385ms |
| TTFB p90 | 8325ms | 10414ms | 🌟 1542ms |
| TTFB p99 | 9959ms | 10860ms | 🌟 3628ms |
| TTFB cv | 🌟 0.11 | 0.15 | 0.36 |
| Total p50 | 🌟 7091ms | 8267ms | 29466ms |
| Total p99 | 🌟 9959ms | 10860ms | 46528ms |
| 吞吐量 (req/s) | 🌟 0.42 | 0.38 | 0.10 |
| 样本数 | 50 | 45 | 37 |

> 🌟 在延迟/cv 指标上标的是最低值，在吞吐量上标的是最高值。注意 OpenRouter 在 TTFB 维度最低但 Total 维度最高，这是本节要分析的核心现象（见下文 "TTFB 与 Total 的差异"）。
>
> 注：前期 OpenRouter long payload 只有 13 样本，p99=1526ms / cv=0.15 低估了真实波动。补充到 n=37 后 p99 升至 3628ms、cv 升至 0.36。前期小样本直接"跳过"了长尾事件。

### TTFB 与 Total 的差异

OpenAI `gpt-5-nano` 在 Hub/Direct 路径下 TTFB ≈ Total（约 7-8 秒），因为 `gpt-5-nano` 在 stream 模式下实际是完整生成后一次返回（见 streaming 行为表）。

OpenRouter 路径下 TTFB=1385ms 但 Total=29466ms。OpenRouter 对 OpenAI 响应做了 chunk 级的拆分和延迟，导致"首字节快、总时间慢"。含义：
- TTFB p50 1385ms 反映的是 OpenRouter 边缘节点快速返回 ack 的时间
- Total p50 29466ms（Hub 的 4.2 倍）反映的是完整 800 token 响应的实际完成时间
- 240 秒窗口内 OpenRouter 只能完成 24 个请求，Hub 在 120 秒内完成 50 个

对输出长度 > 500 tokens 的场景，OpenRouter 的吞吐量不足以支持实时使用。

### Hub vs Direct 在 realistic payload 下的一致性

两个时段窗口采集（间隔 83 分钟）：

| 采集窗口 | 配置 | Hub TTFB p50 | Direct TTFB p50 | Hub - Direct |
|---------|------|-------------|-----------------|-------------|
| 窗口 1 | c=5, 180s, n=126/106 | 7130ms | 8358ms | -1228ms |
| 窗口 2 | c=3, 120s, n=50/45 | 7091ms | 8267ms | -1176ms |

**客观评价**：两个时段窗口的 p50 和 Δp50 偏差都在 4% 以内。在 realistic payload 场景下，Hub 比 Direct 低约 1200ms，两个独立时段窗口都可复现。

可能的解释：`gpt-5-nano` 的长生成响应在跨太平洋直连路径上比经过 CF 骨干网路径慢。两个独立数据点方向一致，但样本量（n=106-126）和时段覆盖（2 个窗口）相对 short payload 测试较少，结论的稳健性中等。

---

## 观察到的模式

以下是从数据中观察到的模式（不构成定论，需要读者结合自己的场景判断）：

| 场景 | 观察 | 可靠度 |
|------|------|-------|
| Short payload, p50 | Hub 比 Direct 高 92-367ms | 多个时段采集一致 |
| Short payload, p99 | 跨时段符号反转，无稳定胜负 | 时段漂移证实 |
| Realistic payload, p50 | Hub 比 Direct 低约 1200ms（OpenAI） | 两个独立时段窗口一致 |
| Hub 自身处理开销 | 42-52ms p50 | 跨 12 个 target、n=2000+ 稳健 |
| OpenRouter long payload Total | p50 29s，p99 46s | 两个独立时段窗口一致 |

---

## Hub 处理开销的 Server-Timing 拆解

Hub Worker 在每个请求返回的 `Server-Timing` header 中包含 7 个 phase 的服务端计时。这是 Hub 有而 Direct/OpenRouter 没有的观测数据。

基于 427 个 Hub 成功样本（旧数据 + 新 stability check）：

| Phase | p50 | p90 | p99 | max | 占 p50 比例 | 说明 |
|-------|-----|-----|-----|-----|------------|------|
| session | 0ms | 0ms | 0ms | 0ms | 0% | 用户上下文提取（auth 中间件已做） |
| resolveProvider | 0ms | 0ms | 54ms | 65ms | 0% | isolate 内存缓存命中 |
| modelSetup | 5ms | 8ms | 16ms | 557ms | 10% | body 转换 + URL 构建 + KV gateway 配置 |
| usage | 0ms | 0ms | 0ms | 0ms | 0% | calculateCredits + D1 写入走 waitUntil 异步化 |
| preChecks | 45ms | 54ms | 140ms | 1084ms | 90% | Payment Kit credit 检查 RPC |
| Hub 合计 | ~50ms | ~62ms | ~210ms | - | 100% | Hub 代码总耗时 |

### 50ms 里的分布

```
Hub 总 p50 开销: 50ms
│
├─ session         ╵  0ms  (0%)
├─ resolveProvider ╵  0ms  (0%)  ← isolate 缓存命中
├─ usage           ╵  0ms  (0%)  ← waitUntil 异步化
├─ modelSetup      ┤  5ms  (10%)
└─ preChecks       ████████████████████████████████████████████  45ms  (90%)
                                                    ↑
                                          Payment Kit Service Binding RPC
```

Hub 处理时间的 90% 集中在 preChecks phase，即 Payment Kit 的 credit 检查 RPC。其他 phase 合计 5ms。后续优化方向：加一个 KV 短 TTL 缓存层跳过绝大多数 credit 检查 RPC 调用，预计可将 Hub p50 开销从 ~50ms 降到 ~10ms（约 80% 的提升）。具体实施细节见完整报告 §6。

### p99 的 cold start 来源

| Target | Hub p50 overhead | Hub p99 overhead | 差距 | 原因 |
|--------|------------------|------------------|------|------|
| hub-openai | 50ms | 1012ms | +962ms | preChecks 冷启动 RPC 1004ms |
| hub-anthropic | 53ms | 141ms | +88ms | preChecks 冷启动 RPC 89ms |
| hub-google | 50ms | 409ms | +359ms | modelSetup 365ms（KV 冷读）|

hub-openai 的 p99 overhead 主要来自 `preChecks` phase 的 Payment Kit RPC 冷启动（45ms → 1004ms）。hub-google 的 p99 overhead 主要来自 `modelSetup` phase 的 KV `gateway-settings` 冷读（5ms → 365-557ms）。

### Hub 50ms 开销在完整请求中的占比（以 hub-anthropic 为例）

以 hub-anthropic realistic payload 为例的完整请求时间分布：

```
hub-anthropic 完整请求 p50 = 3740ms
│
├─ 客户端 ↔ CF edge 网络          ~200ms  (5%)   ██▌
├─ Hub 处理（所有 phase 合计）     50ms  (1%)    ▏
├─ CF → Anthropic + 首 token      486ms  (13%)  ████▌
└─ Streaming 800 tokens          3202ms  (86%)  ████████████████████████████████████████████
```

Hub 处理占完整请求时间的约 1%。即便完全去掉 Hub 处理（切换到 Direct），也只能省这 50ms。

### Server-Timing 反映的 3 个 Hub 架构设计点

通过 phase 数据可以观察到以下设计选择的效果：

1. `session` phase = 0ms：DID 认证在 middleware 完成（Service Binding RPC），handler 里只读 Hono context。
2. `resolveProvider` phase p50 = 0ms：isolate 内存缓存（60s TTL）命中率约 99%，D1 查询只在 cache miss 或新 isolate 时发生。
3. `usage` phase = 0ms：`recordModelCall` 走 `waitUntil` 异步化，D1 写入不阻塞响应返回。

如果这三项中任何一项改成同步（每请求查 D1 / 每请求同步 recordModelCall），Hub overhead 会增加到 200-300ms 量级。

---

## 模型之间的延迟差异

| Provider | Model | providerTtfb p50 | 相对最快 |
|----------|-------|-----------------|---------|
| Anthropic | claude-haiku-4-5 | 🌟 486ms | 1x |
| Google | gemini-2.5-flash | 3942ms | 8.1x |
| OpenAI | gpt-5-nano | 6640ms | 13.7x |

对延迟敏感的场景，**选择 claude-haiku-4-5 带来的收益（数千 ms）远大于 Hub 与 Direct 之间的 p50 差异（~200ms）**。模型选择是延迟优化的主要杠杆。

---

## 记账验证

| 指标 | 结果 |
|------|------|
| 测试方法 | 60 请求（3 provider × 20），每个带唯一 `x-request-id`，等 10s 后查 D1 |
| D1 记录数 | 60/60 |
| Token 总数匹配 | 1268 tokens 一致 |
| Credits 计算 | $0.0009928 匹配 |
| 匹配率 | 100% |

**客观评价**：在本次 60 次请求的验证中，token 计数和 credits 计算与 D1 记录 100% 一致，`waitUntil` 异步写入未出现丢失。样本量（60）相对生产流量较小，建议在生产灰度前再跑一次更大规模验证（1000+ 请求）。本次结果支持 Hub 的记账机制在测试条件下工作正确。

---

## 本次优化（已完成）

Hub 处理开销从 154ms 降到 50ms（-64%）：

- 优化 1：`resolveProvider` 加 Worker isolate 内存缓存（60s TTL，命中率约 99%）
- 优化 2：`resolveProvider` 和 `checkCredits` 改成并行执行

代码见 commit `28833d8`。

---

## 推荐下一步

### 最高 ROI 优化

Payment Kit "has credits" KV 快路径（30s TTL）：
- 预期 warm overhead 从 ~50ms 降到 ~5-10ms
- 预期 cold start p99 从 ~1088ms 降到 ~200ms
- 实施后 Hub p50 可望接近 Direct

### 可跟进

1. 打开 AI Gateway 后再补一批数据，对比 Gateway on/off 的收益
2. Streaming 路径 `calculateCredits` 传入 `provider.resolvedRate`（省 ~15ms）
3. Cold start 细分诊断（Server-Timing 拆分 `ensureMeter` / `ensureCustomer` / `verifyAvailability`）
4. 补 "Hub → OpenRouter" 路径的 benchmark（本次未覆盖）

### 不建议

- 改成直连 API：会失去统一记账、统一 auth、统一 catalog 以及 realistic payload 下观察到的 1200ms p50 优势
- 继续压缩 Hub 的 50ms 开销到个位数：边际收益低于 Payment Kit KV 缓存优化

---

## Hub 的定位（基于数据）

| 价值维度 | 数据支撑 |
|---------|---------|
| 统一记账 | 60/60 匹配 |
| 统一认证 | 一个 access key 支持 4 个 provider |
| 统一 catalog | Hub 内置 model catalog |
| Short payload p50 延迟成本 | Hub 比 Direct 高 92-367ms（跨时段稳健）|
| Short payload p99 稳定性 | 跨时段胜负反转，不能声称任一方稳定占优 |
| Realistic payload p50 | Hub 比 Direct 低约 1200ms（两个独立时段窗口一致）|
| Hub 自身处理开销 | 42-52ms p50（跨 2000+ 样本）|

Hub 的核心价值在于统一接入和记账，以及在 realistic payload 场景下的 p50 优势。short payload 下 Hub 有 ~200ms 的 p50 成本。p99 稳定性的比较需要更长时段的样本才能下结论。

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
