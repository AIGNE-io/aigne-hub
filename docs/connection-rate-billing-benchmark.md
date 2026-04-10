# AIGNE Hub: 连接速率与记账验证报告

> 速读版：[`connection-rate-billing-benchmark-summary.md`](./connection-rate-billing-benchmark-summary.md)
> 这是完整技术报告，包含所有数据点和分析细节。
>
> 测试日期: 2026-04-10
> Hub 版本: `43cfa4b` (commit), `c27b75ee` (deployed)
> 测试环境: `aigne-hub-staging.zhuzhuyule-779.workers.dev`
> AI Gateway: **关闭**（本轮基线测试）
> 作者: Pengfei + AI

---

## 执行摘要

### 数据规模

本报告一共发出 5844 次 API 请求（含 923 条 Anthropic 429 限流错误），有效延迟样本 4911 条。详见 §1.4。

### 核心指标

| 指标 | 值 | 数据基础 | 稳健性 |
|------|-----|----------|--------|
| Hub 自身处理开销 p50 | 42-52ms | 跨 12 个 target、n=2000+ Server-Timing 计时 | 跨时段稳健 |
| Hub 自身处理开销 p90 | 50-72ms | 同上 | 跨时段稳健 |
| Hub 自身处理开销 p99（典型） | 177-494ms | short payload 场景 | 跨时段有漂移 |
| Hub 自身处理开销 p99（最差） | 1088ms | realistic payload + cold start | 来自 hub-openai 303 样本合并数据中的 cold start outlier |
| 记账准确性 | 60/60 (100%) | x-request-id tracked，D1 查询验证 | 本次验证一致 |

### Hub vs Direct 的三个观察

> 表格布局：行 = 指标或 provider，列 = 路径（Hub / Direct / OpenRouter）。

**观察 1：p50 关系跨时段稳健**

在不同时段采集的数据中，Hub 的 p50 一致高于 Direct：

| Provider | Δp50 (Hub - Direct) 范围 | 样本 |
|----------|-----|-----|
| OpenAI `gpt-5-nano` | +115 ~ +204ms | n=758/835 合并 |
| Google `gemini-2.5-flash` | +258 ~ +367ms | n=568/691 合并 |
| Anthropic `claude-haiku-4-5` (c=1) | +92 ~ +220ms | n=160/160 合并 |

**客观评价**：在本次测试条件下，short payload 场景下 Direct 的 p50 比 Hub 低 92-367ms，不同时段采集时方向一致。这是可以作为容量规划和 SLO 基线的稳健结论。

**观察 2：p99 关系跨时段不稳定**

在不同时段采集的数据中，Δp99 的符号和数值变化：

| Provider | Δp99 (Hub - Direct) 不同时段采集值 |
|----------|-----------------------------|
| OpenAI | +2065, -2013, +609, -1103, +147 |
| Google | -1202, +256, +272, +123 |
| Anthropic (c=1) | -5958, -1235, +358, +627 |

**客观评价**：OpenAI 和 Anthropic 的 Hub vs Direct p99 胜负关系跨时段反转。单个时段窗口的 p99 不能作为"哪一路更稳"的跨时段结论。这项指标需要更多时段覆盖的数据才能定量化。详见 §4.9 时段漂移分析。

**观察 3：realistic payload 场景 Hub 比 Direct 低约 1200ms**

| 采集窗口 | 配置 | Hub TTFB p50 | Direct TTFB p50 | Δp50 |
|---------|------|-------------|-----------------|------|
| 窗口 1 | c=5, 180s, n=126/106 | 🌟 7130ms | 8358ms | -1228ms |
| 窗口 2 | c=3, 120s, n=50/45 | 🌟 7091ms | 8267ms | -1176ms |

> 🌟 表示该行更低的 p50。两个窗口中 Hub 的 p50 都比 Direct 低约 1200ms。

**客观评价**：两个独立时段窗口偏差在 4% 以内，方向一致。在本次测试条件下 realistic payload 场景下 Hub 比 Direct 更快。可能原因：`gpt-5-nano` 的长生成响应在跨太平洋直连路径上比经 CF 骨干网路径慢。两个独立数据点方向一致，但时段覆盖相对 short payload 测试较少，建议再补采集 1-2 个时段窗口进一步验证。

### 9-cell 矩阵（short payload, c=3）

样本数（基于多时段合并数据）：

| Provider | Hub | Direct | OpenRouter |
|----------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 758 | 835 | 225 |
| Anthropic `claude-haiku-4-5` (c=1) | 160 | 160 | 103 |
| Google `gemini-2.5-flash` | 568 | 691 | 189 |

p50 TTFB：

| Provider | Hub | Direct | OpenRouter | 最快 |
|----------|-----|--------|------------|------|
| OpenAI `gpt-5-nano` | 1108ms | 971ms | 🌟 675ms | OpenRouter（多时段一致）|
| Anthropic `claude-haiku-4-5` (c=1) | 985ms | 🌟 807ms | 1354ms | Direct（多时段一致）|
| Google `gemini-2.5-flash` | 1196ms | 901ms | 🌟 677ms | OpenRouter（单时段）|

表格中 🌟 标注每行的最低 p50。附加说明：
- OpenAI OpenRouter 675ms：在多个时段采集的样本中 p50 都在 674-685ms
- Anthropic Direct 807ms：在不同时段采集时 Direct 一致低于 Hub（Δp50 92-220ms）
- Google OpenRouter 677ms 在单个时段窗口中最快，没有跨时段验证数据
- Google 的 Hub/Direct 对比在不同时段采集时 Direct 一致低于 Hub（Δp50 258-367ms）

p99 TTFB（注意 p99 跨时段漂移见 §4.9）：

| Provider | Hub | Direct | OpenRouter |
|----------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 3251ms | 3059ms | 🌟 2608ms |
| Anthropic `claude-haiku-4-5` (c=1) | 🌟 2217ms | 3271ms | 3035ms |
| Google `gemini-2.5-flash` | 2755ms | 2670ms | 🌟 2660ms |

> 🌟 仅表示该表合并数据下的最低 p99，不代表跨时段最优。p99 对时段敏感：在不同时段采集的数据中，Hub vs Direct 的 p99 胜负关系会反转（详见 §4.9）。

cv：

| Provider | Hub | Direct | OpenRouter |
|----------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 🌟 0.37 | 0.45 | 0.51 |
| Anthropic `claude-haiku-4-5` (c=1) | 🌟 0.27 | 0.67 | 0.60 |
| Google `gemini-2.5-flash` | 🌟 0.26 | 0.38 | 0.47 |

> 🌟 表示该表合并数据下的最低 cv。注意 Hub OpenAI cv 在不同时段采集时在 0.14-0.53 波动，cv 对时段敏感。

### 长 payload 3 路对比（`gpt-5-nano`, realistic 800 max_tokens, c=3）

| 指标 | Hub | Direct | OpenRouter |
|------|-----|--------|------------|
| TTFB p50 | 7091ms | 8267ms | 🌟 1385ms |
| TTFB p99 | 9959ms | 10860ms | 🌟 3628ms |
| Total p50 | 🌟 7091ms | 8267ms | 29466ms |
| Total p99 | 🌟 9959ms | 10860ms | 46528ms |
| cv（TTFB）| 🌟 0.11 | 0.15 | 0.36 |
| 吞吐量（req/s）| 🌟 0.42 | 0.38 | 0.10 |
| 样本数 | 50 | 45 | 37 |

> 🌟 在延迟/cv 上标的是最低值，在吞吐量上标的是最高值。OpenRouter 在 TTFB 维度最低但 Total 维度最高，详见 §4.2.3 的分析。

注：`gpt-5-nano` 在 stream 模式下实际是内部完整生成后一次返回（见 §1.6 streaming 行为分析），所以 Hub/Direct 的 TTFB ≈ Total。OpenRouter 的 TTFB=1385ms 是其边缘节点的快速 ack，但 Total=29466ms 反映完整 800 token 响应的实际完成时间。详见 §4.2.3。

### 决策参考

| 维度 | 数据 |
|------|------|
| short payload p50 | Hub 比 Direct 高 92-367ms（跨时段稳健）|
| short payload p99 | 跨时段胜负反转，无稳定结论 |
| realistic payload p50 | Hub 比 Direct 低约 1200ms（两个独立时段窗口一致）|
| Hub 自身处理开销 | 42-52ms p50（跨 2000+ 样本）|
| 记账准确性 | 60/60 |
| OpenRouter 长生成 | Total p50=29.5s, p99=46.5s，不适合 >500 tokens 输出场景 |
| 统一接入 | 一套 key / catalog / auth |

模型选择是延迟优化的最大杠杆：Anthropic `claude-haiku-4-5` 的 providerTtfb p50 = 486ms，OpenAI `gpt-5-nano` = 6640ms，相差 13.7 倍。Hub 与 Direct 之间约 200ms 的 p50 差异在这个量级面前影响有限。

---

## 一、测试设置

### 1.1 测试矩阵

| Provider | 模型 | 路径 |
|----------|------|------|
| OpenAI | `gpt-5-nano` | Hub + Direct |
| Anthropic | `claude-haiku-4-5` | Hub |
| Google | `gemini-2.5-flash` | Hub |
| OpenRouter | `openai/gpt-oss-20b` | Direct（第三方参照） |

**模型选择原则**：每个 provider 的最便宜/最快档位。我们关心延迟不关心质量。

### 1.2 测试方法

- **客户端测量**：端到端 TTFB + 完整时间（本地运行）
- **服务端测量**：Hub Worker 内的 `Server-Timing` header，精确到各 phase
  - `session` — 用户上下文提取
  - `resolveProvider` — D1 查询 provider/credential/rate
  - `preChecks` — Payment Kit credit 余额检查
  - `modelSetup` — gateway 配置 + body 转换 + URL 构建
  - `providerTtfb` — 发送到 Provider 到收到首字节
  - `streaming` — 首字节到流结束
  - `usage` — calculateCredits + recordModelCall 同步部分
  - `total` — 端到端 wall clock
- **持久化存储**：每个请求都以 JSONL 格式保存在 `benchmarks/data/samples.jsonl`，包含 runId、gitCommit、全部 Server-Timing phase 数据

### 1.3 网络环境基线

从客户端 TTFB 减去 Server-Timing `total`，可以得出客户端 ↔ CF edge 的往返时间：

| Target | 客户端 TTFB (p50) | 服务端 total (p50) | 网络 RTT |
|--------|-----------------|-------------------|---------|
| hub-anthropic (stream) | 1049ms | 674ms | ~375ms |
| hub-google (stream) | 1183ms | 749ms | ~434ms |
| hub-openai (stream) | 1335ms | 896ms | ~439ms |

**客户端 ↔ CF edge 往返约 400ms**（本次测试位置）。这部分跟 Hub 无关。

### 1.4 本报告数据基础

- **总样本**：5844 次 API 请求（含 933 个错误样本，其中 923 个为 Anthropic 429 限流），**有效延迟样本 4911 条**
- **覆盖面**：3 provider × 3 path × 2 种 payload（short + realistic）
- **采集时段**：2026-04-10 的多个时段窗口（04:02-08:49 UTC，跨约 5 小时）
- **有效样本的分类（互不重叠）**：
  - 记账准确性验证：60 样本（60/60 匹配）
  - 优化前后 smoke test：48 样本
  - 延迟性能测试（含 OpenRouter 深度补采、Hub vs Direct 稳定性复核等多个子批次）：4803 样本
- **错误样本说明**：
  - `hub-anthropic` (950 样本，651 个 429)、`anthropic-direct` (332 样本，272 个 429) 主要来自早期 c=5 realistic 采集，踩到了 Anthropic 50 req/min + 10K output tokens/min 的限流
  - 这些 target 的干净替代是 `hub-anthropic-c1` / `anthropic-direct-c1`（c=1 sequential + 800ms delay，合计 n=160 样本/path，0 错误）
  - 报告里 Anthropic Hub/Direct 的所有统计都使用 c=1 版本的干净数据，429 样本不进入 p50/p99/cv 计算
  - 其他错误（10 个）：早期的 `maxTokens` 参数 bug 导致的 HTTP 400，以及 1 个 long payload 的 fetch failed
- **持久化**：每条样本都带 Server-Timing phase 数据、客户端 TTFB、git commit，保存在 `benchmarks/data/samples.jsonl`，可复现。详细的采集窗口 ID 列表见附录 C

每个具体数据表下方都会标注 n（样本数）。读者可以直接判断可信度的经验值：

| 样本数 | p50 可信度 | p90 可信度 | p99 可信度 |
|-------|---------|---------|---------|
| 40-60 | 粗略 | 不稳定 | 仅供参考 |
| 100-200 | 稳定 | 稳定 | 噪声明显 |
| 400+ | 高 | 高 | 相对稳定 |

注：即使 n ≥ 400，p99 仍可能对测试时段敏感，时段漂移见 §4.9。

### 1.5 术语速查

| 术语 | 含义 |
|------|------|
| `c=N` | concurrency（并发数），benchmark 客户端同时开 N 个 worker 并行发请求。源自 wrk / ab / hey 等常见 benchmark 工具 |
| `c=1 sequential` | 单线程顺序发请求（附带 delay），用于规避严格 rate limit |
| TTFB | Time To First Byte，从客户端发出请求到收到第一个字节的时间 |
| Total time | 从发出请求到完整收完响应的时间（包含 streaming 全部字节）。对短 payload 约等于 TTFB，对长 payload 明显大于 TTFB |
| p50 / p90 / p99 | 第 50 / 90 / 99 百分位数。p99 = "99% 的请求都比这个数字快" |
| cv | 变异系数 = 标准差 / 平均值。数值越大分布越分散 |
| min / max | 样本中的最小 / 最大值 |
| 样本数 (n) | 该 cell 一共发出多少次 API 请求。样本数越多，p50/p90/p99 的统计噪声越小。是本报告衡量数据可靠性的主要指标 |
| 时段窗口 | 在某一时段内连续采集的一批样本。本报告在 2026-04-10 的多个时段窗口采集数据（窗口之间间隔 5-60 分钟），用于检测时段漂移 |
| short payload | 短 prompt + 30 max_tokens，用于测"连接开销"，避免 provider 生成时间干扰 |
| realistic payload | 1K system prompt + 800 max_tokens，模拟长生成 chat 场景 |
| Hub / Direct / OpenRouter | 三条路径：Hub 代理 / 客户端直连 Provider / OpenRouter 第三方代理 |
| Server-Timing | HTTP 规范的服务端计时 response header。Hub 用它暴露内部各 phase 耗时 |
| providerTtfb | Server-Timing 的一个 phase，从 Hub Worker 发出请求到收到 Provider 首字节的时间。代表 CF edge → Provider 的网络 + Provider 自身生成时间 |
| cold start | Worker isolate 首次启动的初始化开销。CF Workers 对空闲 isolate 会回收 |
| 🌟 | 在数据对比表中标注每行的优势单元格（最低延迟、最低 cv、最高吞吐等）。仅反映该表呈现的数字，对 p99/cv 等跨时段不稳定的指标，不代表跨时段稳健结论——需要结合表下的说明判断 |

**关于样本量和时段覆盖的权衡**：

考虑两个场景：
- 场景 A：单个时段窗口内采集 5000 样本 → 样本很多，但只覆盖了那个时段
- 场景 B：5 个时段窗口内各采集 100 样本 = 500 样本 → 样本少，但覆盖 5 个时段

本次稳定性复核采用场景 B 的策略，因为前期测试发现"单次大样本采集的 p99 会被当下时段的网络状态绑架"。多个时段合并的统计更能反映真实的分布。例如 Hub OpenAI short/c3 的 p50 在不同时段窗口分别采集到 1025-1259ms 范围（range 234ms），p99 在 1718-4344ms 范围（range 2626ms）—— p99 的"不稳定"只有覆盖多个时段才能看到。

### 1.6 Streaming vs Non-Streaming 与 TTFB / Total 的关系

**本报告所有延迟 benchmark 都用 streaming 模式**（`stream: true`），只有记账验证用 non-streaming。

- **Streaming 模式下**：
  - TTFB = 从发出请求到收到**第一个字节**的时间
  - Total = 从发出请求到收到**最后一个字节**的时间（包含全部 streaming 时间）
  - **TTFB 通常 << Total**，差值就是 streaming 的持续时间

- **Non-streaming 模式下**：
  - Provider 生成完整响应后一次性返回
  - **TTFB ≈ Total**（因为客户端只能在整个 response body 读完后才知道时间）
  - benchmark 客户端里把 ttfb 直接设成 totalTime（见 `index.ts:164-167`）

#### gpt-5-nano 的实际流式行为

Server-Timing 的 `streaming` phase（从收到 provider 第一个字节到最后一个字节的时间）数据：

| Provider | providerTtfb p50 | streaming p50 | 行为 |
|----------|-----------------|---------------|------|
| OpenAI `gpt-5-nano` | 6640ms | 30ms | 内部完整生成后一次返回，非渐进流式 |
| Anthropic `claude-haiku-4-5` | 486ms | 3202ms | 首字节快（0.5s），后续持续 stream 3.2 秒 |
| Google `gemini-2.5-flash` | 3942ms | 1046ms | 首字节 4 秒，streaming 1 秒完成 |

OpenAI `gpt-5-nano` 在 `stream: true` 模式下内部先完整生成再一次性返回。它的 streaming phase 只有 30ms，说明这不是逐字 stream 的行为。这解释了为什么 §4.2.2 里 hub-openai realistic payload 的 TTFB 和 Total 都是 7091ms（两者几乎相同）。

hub-anthropic 的客户端 TTFB p50 = 964ms，Total 包含 3.2 秒的 streaming 过程，TTFB 和 Total 明显不同。这是渐进流式的典型行为。

OpenRouter 的 TTFB 与 Total 差异的解释：
- 对 gpt-5-nano，OpenAI 本身就是一次返回，Hub/Direct 的 TTFB = Total ≈ 7091ms
- OpenRouter 在中间加了一层 proxy，把 OpenAI 一次返回的响应拆成多个 chunk。TTFB 降到 1385ms（快速边缘 ack），但 chunk 之间有额外延迟，Total 升到 29466ms

产品设计的含义：
1. gpt-5-nano 不适合需要"首字节反馈"的 UI 场景（7 秒才返回第一个字节）
2. Anthropic claude-haiku-4-5 是渐进流式，TTFB 约 0.5-1 秒 + streaming 3 秒，适合实时反馈 UI
3. OpenRouter 对 gpt-5-nano 的"低 TTFB"来自 chunk 拆分机制，不代表整体响应更快

---

## 二、Hub 延迟剖析

### 2.1 Hub Processing Overhead（去掉 provider 和 streaming）

定义：`total - providerTtfb - streaming`，代表 Hub 自身代码花的时间。

| Target | n | p50 | p90 | p99 | min | max | cv |
|--------|---|-----|-----|-----|-----|-----|-----|
| hub-openai | 126 | 50ms | 61ms | 1012ms | 41ms | 1088ms | 1.84 |
| hub-anthropic | 132 | 53ms | 65ms | 141ms | 41ms | 904ms | 1.22 |
| hub-google | 169 | 50ms | 59ms | 409ms | 36ms | 600ms | 0.91 |

观察：

1. p50 在 3 个 provider 下相对一致（50-53ms），说明 Hub 处理开销主要独立于 provider
2. p90 稳定在 59-65ms
3. p99 差异较大（141-1012ms），主要来自 cold start outlier。hub-anthropic 的 p99 较低，因其样本密度高、cold start 占比低
4. cv > 1 是被 cold start 尾部拉高的结果；去掉 outlier 后 cv 降到 0.2 以下

跨时段稳健性：本节数据来自 qlzusr 这个时段窗口（realistic payload, c=5）。新采集的稳定性复核（stab-hub-*）也得到 42-45ms 的 p50 overhead，与此一致。详见 §4.8。

### 2.2 Server-Timing 各 Phase 分解

数据源：multi-provider 180s benchmark（时段窗口 qlzusr），realistic payload，c=5。427 个 Hub 成功样本（hub-openai n=126 + hub-anthropic n=132 + hub-google n=169）。

hub-openai (n=126)：

| Phase | p50 | p90 | p99 | max |
|-------|-----|-----|-----|-----|
| session | 0ms | 0ms | 0ms | 0ms |
| resolveProvider | 0ms | 0ms | 37ms | 65ms |
| preChecks | 45ms | 53ms | 1004ms | 1084ms |
| modelSetup | 5ms | 8ms | 13ms | 16ms |
| providerTtfb | 6640ms | 7812ms | 9622ms | 11378ms |
| streaming | 30ms | 52ms | 408ms | 937ms |
| usage | 0ms | 0ms | 0ms | 0ms |
| total | 6757ms | 7910ms | 9729ms | 11443ms |

hub-anthropic (n=132)：

| Phase | p50 | p90 | p99 | max |
|-------|-----|-----|-----|-----|
| session | 0ms | 0ms | 0ms | 0ms |
| resolveProvider | 0ms | 0ms | 46ms | 54ms |
| preChecks | 47ms | 57ms | 89ms | 899ms |
| modelSetup | 5ms | 9ms | 16ms | 97ms |
| providerTtfb | 486ms | 844ms | 1157ms | 1585ms |
| streaming | 3202ms | 3661ms | 4159ms | 5001ms |
| usage | 0ms | 0ms | 0ms | 0ms |
| total | 3740ms | 4319ms | 5107ms | 5555ms |

hub-google (n=169)：

| Phase | p50 | p90 | p99 | max |
|-------|-----|-----|-----|-----|
| session | 0ms | 0ms | 0ms | 0ms |
| resolveProvider | 0ms | 0ms | 50ms | 51ms |
| preChecks | 44ms | 50ms | 68ms | 74ms |
| modelSetup | 5ms | 8ms | 365ms | 557ms |
| providerTtfb | 3942ms | 5089ms | 6509ms | 6599ms |
| streaming | 1046ms | 2266ms | 3113ms | 3160ms |
| usage | 0ms | 0ms | 0ms | 0ms |
| total | 5040ms | 5568ms | 6559ms | 6647ms |

### 2.3 观察

**1. 三个 phase 的 p50 为 0ms**

| Phase | p50 为 0 的原因 |
|-------|---------------|
| `session` | DID 认证在 middleware 完成（Service Binding RPC），handler 只读 Hono context |
| `resolveProvider` | Worker isolate 60s TTL 内存缓存，命中率约 99% |
| `usage` | `recordModelCall` + meter buffer 全部走 `waitUntil` 异步化 |

这三项设计避免了同步 D1 查询或同步 Payment Kit 调用进入请求关键路径。如果改成同步，Hub overhead 估计会升到 200-300ms。

**2. `preChecks` phase 占 Hub p50 的 90%**

- p50 = 44-47ms，跨 3 个 provider 一致
- 这是 Payment Kit Service Binding RPC 的固定成本
- hub-openai 的 p99 = 1004ms 来自 isolate 首次调用 Payment Kit 的 cold start
- 对应的优化方向：加一层 KV "has credits" 快路径跳过大部分 credit 检查 RPC

**3. `modelSetup` 的偶发 KV cold read**

- 正常 p50 = 5ms
- hub-google p99 = 365ms, max = 557ms，是 `resolveGatewayConfig` 读 KV `gateway-settings` 的 cold read
- hub-openai 的 modelSetup p99 = 13ms，相对稳定

两者差异可能因为 hub-google 样本更多（169 vs 126），更容易跨到新 isolate。

**4. Hub 自身在端到端时间中的占比**

以 hub-anthropic realistic payload 为例：total=3740ms，Hub 处理 ~50ms，占比 1.3%。分布：
- CF→Anthropic 网络 + Anthropic 首 token: 486ms (13%)
- Streaming 800 tokens: 3202ms (86%)
- 客户端到 CF edge 网络：约 200ms（未计入 total，只在客户端测量时可见）

即便 Hub 处理开销降到 0ms，端到端用户可见时间只会变快约 1-2%。延迟优化的主要空间在 provider 响应时间和 streaming 时间，不在 Hub 处理。

---

## 三、Provider 延迟对比

### 3.1 providerTtfb 差异（这是关键）

**`providerTtfb` 是从 Hub Worker 向 Provider 发送请求到收到首字节的时间**，直接代表 CF edge → Provider 的网络 + Provider 生成首 token 的时间。它和 Hub 自身无关。

| Provider | Model | n | p50 | p90 | p99 | 相对最快 |
|----------|-------|---|-----|-----|-----|---------|
| Anthropic | claude-haiku-4-5 | 132 | 🌟 486ms | 🌟 844ms | 🌟 1157ms | 1x |
| Google | gemini-2.5-flash | 169 | 3942ms | 5089ms | 6509ms | 8.1x |
| OpenAI | gpt-5-nano | 126 | 6640ms | 7812ms | 9622ms | 13.7x |

> 🌟 表示每列最低的 providerTtfb。Anthropic 在 p50/p90/p99 三个维度都是最快的 provider。

**含义**：

- OpenAI gpt-5-nano 的 providerTtfb 是 Anthropic claude-haiku-4-5 的 14 倍
- 这跟 Hub 无关，来自 provider 自身的差异
- **对产品的启示**：
  - 延迟敏感场景应该优先使用 Anthropic claude-haiku-4-5
  - Google gemini-2.5-flash 延迟中等
  - OpenAI gpt-5-nano 不适合实时场景

### 3.2 为什么 OpenAI gpt-5-nano 这么慢

**观察**：不仅慢，p99 达到 9.6 秒；客户端从本地直连也要 8.4s p50（见 4.1 节）。

**可能原因**：
- gpt-5-nano 可能是 OpenAI 的"轻量但延迟不优化"档位（不像 gpt-5-mini 或 gpt-4o-mini 做过延迟优化）
- 测试时段 OpenAI 自身可能处于高负载期
- 和我们使用的 `realistic` payload（1K system prompt + 几轮对话 + 800 max_tokens）相关，更长输出放大了基础延迟

> 注：不同 prompt 对延迟影响很大。本测试用同一个 "realistic" payload 确保公平性。更短的 prompt 会显著降低延迟。

---

## 四、Hub vs Direct 头对头对比

本节用两组对比 benchmark 覆盖 short 和 realistic 两种 payload。两种 payload 下观察到的 Hub vs Direct 关系不一致：short payload 下 Hub 的 p50 高于 Direct，realistic payload 下 Hub 的 p50 反而低于 Direct。详见 §4.3 的分析。

### 4.1 Short payload 对比（c=3, 30 max_tokens, 短 prompt）

**目的**：测量 Hub 的"纯连接开销"。用最小 payload 把 provider 生成时间降到最低，让网络 + Hub 处理开销成为主导。

**测试条件**：c=3 并发, 60s per target, short payload (30 max_tokens)

| Provider | Model | Hub p50/p90 | Direct p50/p90 | Diff p50 | Diff p90 | 样本 (h/d) |
|----------|-------|------------|----------------|---------|---------|-----------|
| OpenAI | gpt-5-nano | 1258 / 1551ms | 🌟 1055 / 1440ms | +203ms (+19.2%) | +111ms (+7.7%) | 131 / 155 |
| Anthropic | claude-haiku-4-5 | 965 / 1406ms | 🌟 742 / 1196ms | +223ms (+30.1%) | +210ms (+17.6%) | 99 / 60* |
| Google | gemini-2.5-flash | 1187 / 1599ms | 🌟 819 / 1320ms | +368ms (+44.9%) | +279ms (+21.1%) | 143 / 176 |

> 🌟 表示该行 p50/p90 更低的路径。本次短 payload 测试中 Direct 在所有 provider 上 p50 都低于 Hub。

*Anthropic 两边都触发了 50 req/min 限流，成功样本数受影响但 p50/p90 仍然可靠

**结论（short payload）：Hub 比直连慢 204-370ms（+19% ~ +45%）**

拆解：
- **固定的 ~50ms** 是 Hub 自身处理（Server-Timing 证实）
- **额外 150-320ms** 是"客户端 → CF edge → Provider → CF edge → 客户端" vs "客户端 → Provider → 客户端"的网络多一跳代价
- Google 的 +45% 是绝对差值最大的，因为 Google 的基础延迟最短（~800ms），200ms 的网络多跳占比最明显

### 4.2 Realistic payload 对比（800 max_tokens, 1K system prompt）

**目的**：测量 Hub 在"真实用户场景"下的表现。长 prompt + 长输出让 provider 生成时间占主导，更贴近实际 chat 场景。

#### 4.2.1 首次 realistic payload benchmark（Hub vs Direct only）

**测试条件**：c=5 并发, 180s per target, realistic payload (800 max_tokens)

当时 OpenRouter 跑的是 `openai/gpt-oss-20b` 不同 model，不是 apples-to-apples 对比。只有 OpenAI Hub vs Direct 可以比：

| 指标 | hub-openai (n=126) | openai-direct (n=106) | 差异 |
|------|-------------------|----------------------|------|
| p50 TTFB | 🌟 7130ms | 8358ms | Hub 低 1228ms (-14.7%) |
| p90 TTFB | 🌟 8330ms | 9695ms | Hub 低 1365ms (-14.1%) |
| p99 TTFB | 🌟 10104ms | 15664ms | Hub 低 5560ms (-35.5%) |
| min | 5895ms | 🌟 5679ms | +216ms |
| max | 🌟 11797ms | 21502ms | Hub 低 9705ms |
| cv | 🌟 0.12 | 0.22 | Hub 分布相对集中 |

#### 4.2.2 Long-payload 3-way 补充测试（同 model，apples-to-apples）

**测试条件**：c=3 并发，realistic payload (800 max_tokens)。Hub/Direct 来自单个 120s 时段窗口采集；OpenRouter 来自 120s + 240s 两个时段窗口合并，因为前期 13 样本 cv=0.15 低估了波动（详见下文 §4.2.3）。

**目的**：早期的第一批 realistic payload 采集没包含 OpenRouter 用同 model 的数据。这一批补齐，用 `openai/gpt-5-nano` 完成完整 3 路对比。

**结果（保持 Path 在列的统一布局）**：

| 指标 | Hub | Direct | OpenRouter |
|------|-----|--------|------------|
| TTFB p50 | 7091ms | 8267ms | 🌟 1385ms |
| TTFB p90 | 8325ms | 10414ms | 🌟 1542ms |
| TTFB p99 | 9959ms | 10860ms | 🌟 3628ms |
| TTFB cv | 🌟 0.11 | 0.15 | 0.36 |
| Total p50 | 🌟 7091ms | 8267ms | 29466ms |
| Total p99 | 🌟 9959ms | 10860ms | 46528ms |
| 吞吐量 (req/s) | 🌟 0.42 | 0.38 | 0.10 |
| 样本数 | 50 | 45 | 37（补数据后）|

> 🌟 在延迟/cv 上标最低，在吞吐量上标最高。OpenRouter 的 TTFB 三项都最低，但 Total 时间反而最高——这是 §4.2.3 要分析的核心现象。

#### 4.2.3 OpenRouter 的 TTFB 与 Total 差异

OpenRouter 对 `gpt-5-nano` 的 TTFB 和 Total 之间差距很大：
- TTFB p50 = 1385ms（三路中最低）
- TTFB p99 = 3628ms（p99 约为 p50 的 2.6 倍）
- Total p50 = 29466ms（约为 Hub 的 4.2 倍）
- Total p99 = 46528ms（约为 Hub p99 的 4.7 倍）

前期 13 样本的 OpenRouter TTFB p99 = 1526ms / cv = 0.15，低估了真实波动。补到 37 样本后 p99 升到 3628ms，cv 升到 0.36，反映了尾部事件。

可能的解释：OpenRouter 把 OpenAI `gpt-5-nano` 的一次性响应在边缘节点拆成多个 chunk。TTFB 时间反映的是边缘 ack 的快速返回，后续 chunk 之间有额外延迟，因此 Total 时间远大于 Hub/Direct 的直接响应时间。

吞吐量对比：

| Path | 窗口 | 样本数 | 平均每请求总时间 | 吞吐（req/sec） |
|------|------|-------|----------------|-----------------|
| Hub | 120s × c=3 = 360s worker-sec | 50 | 🌟 7.2s | 🌟 0.42 |
| Direct | 120s × c=3 = 360s worker-sec | 45 | 8.0s | 0.38 |
| OpenRouter | 360s + 720s ≈ 1080s worker-sec | 37 | 29.2s | 0.10 |

OpenRouter 在相同 worker-sec 条件下的吞吐量是 Hub / Direct 的约 1/4。

可能原因（未经过证实，仅列出假设）：
1. OpenRouter 的内部队列在 TTFB 之后对每个 chunk 有调度延迟
2. OpenRouter 对 OpenAI 的 streaming 有 proxy 层处理开销
3. OpenRouter 对 streaming 的单请求吞吐做了某种速率控制
4. OpenRouter 可能复用上游连接，引入多路复用开销

对长生成场景（输出 > 500 tokens），OpenRouter 的吞吐量不足以支持 Hub/Direct 相同的请求密度。

#### 4.2.4 Hub vs Direct 的独立验证

两个时段窗口间隔 83 分钟，数据方向一致：

| 指标 | 窗口 1（c=5, 180s） | 窗口 2（c=3, 120s） | 偏差 |
|------|-------------------|-------------------|------|
| Hub TTFB p50 | 7130ms | 🌟 7091ms | -0.5% |
| Direct TTFB p50 | 8358ms | 🌟 8267ms | -1.1% |
| Hub - Direct | -1228ms | -1176ms | 差 52ms |

> 🌟 表示两个窗口中较低的数字。两个窗口偏差都在 1% 左右，说明跨时段稳定。

在这两个独立时段窗口中，realistic payload 场景下 Hub 比 Direct 低约 1200ms，偏差在 5% 以内。两个时段数据一致，方向稳健。这是 §4.9 中 Hub vs Direct 关系里为数不多的跨时段稳定结论之一。

#### 4.2.5 长生成场景的三路汇总

| 维度 | Hub | Direct | OpenRouter |
|------|-----|--------|------------|
| TTFB p50 | 7091ms | 8267ms | 🌟 1385ms |
| Total p50 | 🌟 7091ms | 8267ms | 29466ms |
| TTFB p99 | 9959ms | 10860ms | 🌟 3628ms |
| Total p99 | 🌟 9959ms | 10860ms | 46528ms |
| cv（TTFB）| 🌟 0.11 | 0.15 | 0.36 |
| 吞吐量（req/s）| 🌟 0.42 | 0.38 | 0.10 |
| 样本数 | 50 | 45 | 37 |

观察：
1. Hub 的 Total p50 在本次数据中低于 Direct 1176ms，跨两个独立时段窗口方向一致
2. OpenRouter 的 TTFB p50 最低，但 Total 时间远大于 Hub/Direct（见 §4.2.3）
3. OpenRouter 的吞吐量约为 Hub/Direct 的 1/4，在 240s 窗口内只能跑完 24 个请求
4. 对输出 >500 tokens 的场景，OpenRouter 的单请求完成时间（Total p50=29.5s）不适用于实时交互场景

### 4.3 为什么结果相反？——深度分析

| 维度 | Short payload | Realistic payload |
|------|--------------|-------------------|
| Hub vs Direct | Hub **慢 200-370ms** | Hub **快 1228ms** |
| 原因 | 网络多一跳的代价清晰可见 | 长生成时间下 provider 的路由质量成为主导 |
| 主导因素 | 网络 RTT | Provider 自身延迟 + 网络路径质量 |
| 测试时段 | 05:06 UTC | 04:47 UTC（早 ~20 分钟）|

一个可能的解释：在 realistic payload 测试的 04:47 UTC 时段，OpenAI API 从客户端直连的路径存在网络或队列问题，导致 direct 延迟明显偏高（max 21.5s）。Hub 走 CF 骨干网到 OpenAI，可能规避了这个问题。这只是观察到的现象的一种推测，需要更多时段的数据验证。

Hub 自身的处理开销在两次测试中稳定：

| Target | Realistic p50 overhead | Short p50 overhead |
|--------|----------------------|--------------------|
| hub-openai | 50ms | 50ms |
| hub-anthropic | 53ms | 49ms |
| hub-google | 50ms | 49ms |

Hub 处理开销在跨测试条件下基本不变。外部延迟差异来自 CF→Provider 和 Client→Provider 两条网络路径的相对质量，这个相对质量会随时段、provider 负载、地理位置变化。

### 4.4 综合结论

Hub 的延迟可以近似分解为：

```
Hub TTFB ≈ 固定 Hub 处理开销 (~50ms) + 网络/provider 部分
```

Hub 处理开销稳定在 42-52ms 范围（跨多次测试验证）。网络/provider 部分会随时段、payload 大小、provider 负载变化：

- 短请求场景（agent tool-call、quick Q&A）：Hub 的 TTFB 比 Direct 高 92-367ms（在多个时段采集中观察，见 §4.9）
- 典型 chat 场景（几百 tokens 响应）：Hub 处理开销占总时间约 2-10%
- 长生成场景（realistic payload, 800 tokens）：两个独立时段窗口中 Hub 比 Direct 低约 1200ms

需要注意：在 provider 响应时间本身就是数秒的场景下，Hub 的 50ms 处理开销占比较低（约 1-2%）。

### 4.5 完整 9 格对比矩阵（3 Provider × 3 Path）

本节给出多个时段窗口合并后的 9-cell 统计。所有 Hub/Direct 数据都来自多个时段窗口的合并，OpenRouter 数据也是多个时段窗口合并。样本量足以压制单时段窗口内的采样噪声，但 p99 仍对时段敏感（见 §4.9）。

**测试条件**：
- Hub / Direct 的 OpenAI 和 Google cell：c=3, 每个时段窗口 60s，在不同时段窗口采集后合并
- Hub / Direct 的 Anthropic cell：c=1 sequential + 800ms delay，合并多个时段窗口共 160 样本/path（避开 Anthropic 50 req/min 限流）
- OpenRouter 的 OpenAI cell：c=3 合并多个时段窗口（n=40+42+143=225）
- OpenRouter 的 Anthropic / Google cell：c=3 × 60s × 单时段窗口

#### 9 格矩阵的样本数（3 个子表共用）

| Provider | Hub | Direct | OpenRouter |
|----------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 758 | 835 | 225 |
| Anthropic `claude-haiku-4-5` (c=1) | 160 | 160 | 103 |
| Google `gemini-2.5-flash` | 568 | 691 | 189 |

#### p50 TTFB（中位延迟）

| Provider / Model | Hub | Direct | OpenRouter | 最快 |
|-----------------|-----|--------|------------|------|
| OpenAI `gpt-5-nano` | 1108ms | 971ms | 🌟 675ms | OpenRouter |
| Anthropic `claude-haiku-4-5` (c=1) | 985ms | 🌟 807ms | 1354ms | Direct |
| Google `gemini-2.5-flash` | 1196ms | 901ms | 🌟 677ms | OpenRouter（单时段）|

**客观评价**（基于跨时段稳健程度）：

- OpenAI p50 推荐 OpenRouter：在不同时段采集的数据中 p50 都在 674-685ms，跨时段稳定。比 Direct 快约 300ms，比 Hub 快约 430ms
- Anthropic p50 推荐 Direct：在不同时段采集中 Direct 一致低于 Hub 92-220ms。OpenRouter 反而比 Direct 慢约 550ms，可能是 OpenRouter 对 Anthropic 的路由层有额外开销
- Google p50 OpenRouter 在单个时段窗口中最快 677ms，但没有多时段验证数据，不能声称跨时段稳定；Google 的 Hub/Direct 对比在不同时段中 Direct 一致低于 Hub

没有任何一条路径在 3 个 provider 上都是 p50 最快。路径选择需要按 provider 拆分判断。

#### p99 TTFB

| Provider / Model | Hub | Direct | OpenRouter |
|-----------------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 3251ms | 3059ms | 🌟 2608ms |
| Anthropic `claude-haiku-4-5` (c=1) | 🌟 2217ms | 3271ms | 3035ms |
| Google `gemini-2.5-flash` | 2755ms | 2670ms | 🌟 2660ms |

> 🌟 仅表示该表合并数据下的最低 p99，**不代表跨时段最优**。p99 对测试时段敏感。稳定性复核显示 Hub vs Direct 的 p99 胜负关系会在不同时段之间反转（详见 §4.9）。上表的数值可以作为"整体分布的长尾位置"，但不代表任一时段窗口内的典型值。

Anthropic Direct 的 p99=3271ms 主要受早期时段窗口 (nre1z6) 的一个 7877ms 离群点影响，该离群点在后续 3 个时段窗口中未复现。Hub Anthropic c=1 的 p99 在 4 个时段窗口中相对集中（2036/2598/2217ms）。这说明 Anthropic 直连路径可能存在偶发长尾，但样本量（n=160）不足以定量化。

#### cv

| Provider / Model | Hub | Direct | OpenRouter |
|-----------------|-----|--------|------------|
| OpenAI `gpt-5-nano` | 🌟 0.37 | 0.45 | 0.51 |
| Anthropic `claude-haiku-4-5` (c=1) | 🌟 0.27 | 0.67 | 0.60 |
| Google `gemini-2.5-flash` | 🌟 0.26 | 0.38 | 0.47 |

> 🌟 表示该表合并数据下的最低 cv。cv 也对时段敏感：Hub OpenAI cv 在不同时段采集时可在 0.14-0.53 之间波动。

#### 观察到的模式

**1. Hub vs Direct 的 p50 差值跨时段稳健**

在不同时段采集的 Δp50 (Hub - Direct)：

| Provider | 不同时段采集值 | 范围 |
|----------|---------------|------|
| OpenAI | +204, +165, +153, +168, +115 | 115-204ms |
| Google | +367, +288, +258, +289 | 258-367ms |
| Anthropic (c=1) | +180, +220, +143, +92 | 92-220ms |

所有时段采集中 Hub 一致高于 Direct。差值约 120-370ms，取决于 provider 和时段。

**2. Hub vs Direct 的 p99 关系跨时段不稳定**

| Provider | Δp99 不同时段采集值 | 符号反转？ |
|----------|--------------------|------------|
| OpenAI | +2065, -2013, +609, -1103, +147 | 是（4 次反转）|
| Google | -1202, +256, +272, +123 | 是（1 次反转）|
| Anthropic (c=1) | -5958, -1235, +358, +627 | 是（1 次反转）|

单个时段窗口的 p99 数据不能支撑"Hub p99 更稳"或"Direct p99 更稳"的跨时段结论。详见 §4.9。

**3. OpenRouter 的 TTFB 与 Total 时间差距**

OpenRouter 的短 payload TTFB p50 = 675ms（三路最快），但 Total p50 = 5044ms，Total p99 = 8842ms。Hub/Direct 的 short payload Total p50 约 1.0-1.1s。OpenRouter 的 TTFB 优势反映的是快速边缘 ack，而不是完整响应时间上的优势。

**4. OpenRouter `gpt-5-nano` 的双峰分布 —— 补数据后才看清**

前期 40-42 样本时，OpenRouter × gpt-5-nano 的 cv 在两个独立时段窗口中表现为 0.34 和 0.53，看起来像采样噪声。补数据到 n=225 后确认这是双峰分布：

| TTFB 区间 | 占比 | 累计 |
|----------|------|------|
| **500-1000ms（快速峰）** | **81.8%** | 81.8% |
| 1000-1500ms | 11.9% | 93.7% |
| 1500-2000ms | 0.7% | 94.4% |
| 2000-3000ms | 4.2% | 98.6% |
| >3000ms | 1.4% | 100% |

**关键观察**：
- p50 跨时段稳定：不同时段采集的 p50 都在 674-685ms
- cv 稳定在 0.51-0.54：不是噪声，是结构性特征
- **~18% 的请求会慢到 1000ms+，~6% 慢到 2000ms+，~1.4% 慢到 3000ms+**
- 最可能的原因：OpenRouter 后端的冷/热连接池（热连接 ~680ms、冷连接 ~1500ms、偶发长尾 >3s）

**产品含义**：
- OpenRouter 的 p50=675ms 代表的是"约 82% 请求的快速峰"，不代表所有请求都在该水平
- 约 18% 的请求偏离快速峰进入 1000ms+ 区间，约 6% 进入 2000ms+ 区间
- 产品决策时需要区分"看 p50"和"看 p90/p99 边界"两种场景

### 4.6 同一个 model 的三路对比（focused view of OpenAI cell）

OpenAI `gpt-5-nano` 是三路都使用同一个 model 名的 cell，可以做 apples-to-apples 对比。

**测试条件**：c=3 并发，short payload (30 max_tokens)。Hub/Direct 合并多个时段窗口（窗口 6o4u6u + nre1z6 + 3 个新稳定性复核窗口），OpenRouter 合并多个时段窗口（窗口 nre1z6 + sd3w3h + su608w）。

| 指标 | Hub (n=758) | Direct (n=835) | OpenRouter (n=225) |
|------|-------------|----------------|---------------------|
| p50 | 1108ms | 971ms | 🌟 675ms |
| p90 | 1411ms | 🌟 1304ms | 1447ms |
| p99 | 3251ms | 3059ms | 🌟 2608ms |
| cv | 🌟 0.37 | 0.45 | 0.51 |

> 🌟 表示该表合并数据下每行最低值。注意 p99/cv 跨时段不稳定，见 §4.9。

p50 的路径排序：OpenRouter (675ms) < Direct (971ms) < Hub (1108ms)。

p99 的合并数据上 OpenRouter 最低，但这部分原因是 OpenRouter 数据时段覆盖较集中，而 Hub/Direct 的时段覆盖更广。p99 的跨时段稳定性见 §4.9。

#### 4.6.1 OpenRouter 跨时段漂移（短 payload）

| 指标 | 窗口 nre1z6 (n=40) | 窗口 sd3w3h (n=42) | 窗口 su608w (n=143) | 合并 (n=225) |
|------|-----|-----|-----|-----|
| p50 | 685ms | 🌟 674ms | 675ms | 675ms |
| p99 | 🌟 1538ms | 2608ms | 3134ms | 2608ms |
| cv | 🌟 0.34 | 0.53 | 0.54 | 0.51 |

> 🌟 表示每行在各时段窗口中的最低值。注意该表展示的是"跨时段漂移现象"——p50 基本不变，但 p99/cv 在不同时段窗口差异较大。

p50 在不同时段窗口采集的值都在 674-685ms 范围内，变化小。p99 在小样本时变化较大（1538 → 2608 → 3134ms），随样本量增加逐渐暴露分布的长尾。p99 稳定的经验法则是样本量 ≥500，本报告的 n=225 对 p99 仍有一定不确定性，但足够锁定在 2500-3200ms 区间。

#### 4.6.2 Anthropic c=1 数据

避开 Anthropic 50 req/min 限流的测试方法：c=1 sequential + 800ms delay → 约 45 req/min，每个时段窗口采 40 样本。多个时段窗口合并后共 160 样本/path。

| 指标 | Hub (n=160) | Direct (n=160) |
|------|-------------|----------------|
| p50 | 985ms | 🌟 807ms |
| p90 | 1364ms | 🌟 1113ms |
| p99 | 🌟 2217ms | 3271ms |
| cv | 🌟 0.27 | 0.67 |

> 🌟 表示该表每行的更优值。p50/p90 Direct 更低，p99/cv Hub 更低——但 Direct p99 高主要是单点离群值造成的（见下文分析）。

Direct 的 p50/p90 比 Hub 低 178/251ms。Direct 的 p99 高于 Hub 主要来自时段窗口 nre1z6 中的一个 7877ms 单点离群值（该窗口中的第 24 个请求，前后的请求都在 600-1200ms 范围）。该离群值在后续 3 个时段窗口中未复现。样本量（n=160）不足以判断这是 Anthropic 直连的结构性特征还是单次偶发。

不同时段窗口的数据：

| 时段窗口 | Hub p50 | Direct p50 | Hub p99 | Direct p99 |
|---------|---------|-----------|---------|-----------|
| nre1z6 | 949ms | 🌟 769ms | 🌟 1919ms | 7877ms |
| ctv7n6 | 1023ms | 🌟 803ms | 🌟 2036ms | 3271ms |
| ykpy1f | 1009ms | 🌟 866ms | 2598ms | 🌟 2240ms |
| xsxzwz | 958ms | 🌟 866ms | 2217ms | 🌟 1590ms |

> 🌟 表示每行每个指标组（p50 / p99）的较低值。4 个时段窗口中 Direct p50 始终低于 Hub，但 p99 胜负关系跨时段反转 1 次（窗口 2 → 窗口 3）。

Direct 的 p99 在 4 个时段窗口中从 1590ms 到 7877ms 变化（range 6287ms），不稳定。Hub 的 p99 在 1919-2598ms（range 679ms），相对集中。

### 4.7 核心观察（基于多时段数据）

稳定性复核得到以下观察：

| 维度 | 观察 | 数据支撑 | 稳健性 |
|------|------|---------|-------|
| Short payload p50 | Hub 一致高于 Direct 92-367ms | 多个时段采集符号一致 | 稳健 |
| Short payload p99 | Hub vs Direct 胜负关系跨时段反转 | OpenAI: +2065/-2013/+609/-1103/+147 | 不稳定 |
| Realistic payload p50 | Hub 低于 Direct 约 1200ms | 两个独立时段窗口，偏差 <5% | 中等偏稳健 |
| Hub 自身处理开销 | p50 在 42-52ms | 12 个 target，n=2000+ | 稳健 |
| 记账准确性 | 60/60 匹配 | 单次 60 请求验证 | 样本小但无误差 |

**客观评价**：
- Hub 在 short payload 场景下 p50 的延迟成本是稳健可预期的（多时段一致）
- 在 realistic payload 场景下 Hub 的 p50 反而低于 Direct（两个独立时段窗口一致）
- p99 上 Hub 和 Direct 的关系对时段敏感，单次测量不能作为跨时段结论

一个可能的延迟分解框架（观察到的模式，不是经过验证的因果模型）：

```
Hub TTFB ≈ 直连延迟 + Hub 处理开销 (~50ms) + CF edge 多一跳 − 时段相关的网络因素
```

其中 Hub 处理开销是稳健的（跨多时段、多 target 验证），其他项会随网络时段变化。

### 4.8 Hub 处理开销（跨时段稳定性验证）

Server-Timing 测得的 Hub 自身处理时间（total - providerTtfb - streaming，去除 provider 延迟和 streaming 时间）：

| Target | n | p50 | p90 | p99 |
|--------|---|-----|-----|-----|
| hub-openai（旧数据合并） | 303 | 50ms | 72ms | 1088ms |
| hub-openai-nano（nre1z6） | 169 | 49ms | 59ms | 177ms |
| hub-openai-long（6f3exy） | 50 | 47ms | 53ms | 58ms |
| stab-hub-openai（新采集） | 458 | 42ms | 50ms | 249ms |
| hub-anthropic（旧数据合并） | 299 | 52ms | 71ms | 931ms |
| hub-anthropic-c1（nre1z6） | 40 | 51ms | 56ms | 265ms |
| stab-hub-anthropic-c1（新采集） | 120 | 44ms | 50ms | 427ms |
| hub-google（旧数据合并） | 370 | 50ms | 67ms | 494ms |
| stab-hub-google（新采集） | 425 | 45ms | 51ms | 403ms |

**客观评价**：跨 9 个 target、n=2234 样本（在不同时段采集），Hub 自身处理开销 p50 稳定在 42-52ms 范围。这是本报告中最可靠的跨时段不变指标。新采集的样本（42-45ms）比早期采集的样本（47-52ms）略低，但都在同一范围内。

开销构成：preChecks phase（Payment Kit credit 检查 RPC）占 p50 的约 90%（~45ms），其他 phase 合计约 5ms。

p99 行为：short payload 场景下 p99 通常在 177-494ms，主要来自 preChecks 的偶发冷启动。Realistic payload 场景下 p99 可达 1012ms，因为长生成让 isolate 之间间隔变大，容易触发 cold start。cold start 占整体请求的约 1-2%。

### 4.9 时段漂移分析（稳定性复核结果）

为了验证报告中 Hub vs Direct 的对比结论是否对时段稳健，在不同时段采集了多批新数据（时段间隔 5 分钟），覆盖 OpenAI / Google / Anthropic 三个 provider 的 Hub 和 Direct 路径。合并前期两个时段窗口（6o4u6u 和 nre1z6），共 5 个时段窗口的数据。

#### 不同时段窗口的 Hub vs Direct Δ 值

OpenAI `gpt-5-nano` (short, c=3)：

| 时段窗口 | Hub p50 | Direct p50 | Δp50 | Hub p99 | Direct p99 | Δp99 |
|---------|---------|-----------|------|---------|-----------|------|
| 窗口 1 | 1259 | 🌟 1055 | +204 | 4344 | 🌟 2279 | +2065 |
| 窗口 2 | 1025 | 🌟 860 | +165 | 🌟 1793 | 3806 | -2013 |
| 窗口 3 | 1196 | 🌟 1043 | +153 | 3668 | 🌟 3059 | +609 |
| 窗口 4 | 1062 | 🌟 894 | +168 | 🌟 1718 | 2821 | -1103 |
| 窗口 5 | 1049 | 🌟 934 | +115 | 3341 | 🌟 3194 | +147 |

- Δp50 范围：+115 ~ +204ms，所有时段窗口 Direct 一致低于 Hub（🌟 都在 Direct 列）
- Δp99 范围：-2013 ~ +2065ms，🌟 在 Hub 和 Direct 之间跳动（符号反转 4 次）

Google `gemini-2.5-flash` (short, c=3)：

| 时段窗口 | Hub p50 | Direct p50 | Δp50 | Hub p99 | Direct p99 | Δp99 |
|---------|---------|-----------|------|---------|-----------|------|
| 窗口 1 | 1187 | 🌟 820 | +367 | 🌟 2390 | 3592 | -1202 |
| 窗口 2 | 1187 | 🌟 899 | +288 | 2677 | 🌟 2421 | +256 |
| 窗口 3 | 1183 | 🌟 925 | +258 | 2964 | 🌟 2692 | +272 |
| 窗口 4 | 1219 | 🌟 930 | +289 | 2793 | 🌟 2670 | +123 |

- Δp50 范围：+258 ~ +367ms，4 个时段窗口 Direct 一致低于 Hub
- Δp99 范围：-1202 ~ +272ms，🌟 大部分在 Direct 列，只有窗口 1 反转

Anthropic `claude-haiku-4-5` (short, c=1)：

| 时段窗口 | Hub p50 | Direct p50 | Δp50 | Hub p99 | Direct p99 | Δp99 |
|---------|---------|-----------|------|---------|-----------|------|
| 窗口 1 | 949 | 🌟 769 | +180 | 🌟 1919 | 7877 | -5958 |
| 窗口 2 | 1023 | 🌟 803 | +220 | 🌟 2036 | 3271 | -1235 |
| 窗口 3 | 1009 | 🌟 866 | +143 | 2598 | 🌟 2240 | +358 |
| 窗口 4 | 958 | 🌟 866 | +92 | 2217 | 🌟 1590 | +627 |

- Δp50 范围：+92 ~ +220ms，4 个时段窗口符号一致
- Δp99 范围：-5958 ~ +627ms，符号反转 1 次

#### Hub OpenAI 的 p50 / p99 跨时段分布

| 时段窗口 | n | p50 | p99 | cv |
|---------|---|-----|-----|-----|
| 窗口 1 | 131 | 1259 | 4344 | 0.53 |
| 窗口 2 | 169 | 1025 | 1793 | 0.22 |
| 窗口 3 | 139 | 1196 | 3668 | 0.31 |
| 窗口 4 | 165 | 1062 | 1718 | 0.14 |
| 窗口 5 | 154 | 1049 | 3341 | 0.36 |
| 合并 | 758 | 1108 | 3251 | 0.37 |

- p50 跨时段：1025-1259ms，range 234ms
- p99 跨时段：1718-4344ms，range 2626ms
- cv 跨时段：0.14-0.53

p50 的跨时段变化约 ±12%（相对合并均值）。p99 的跨时段变化约 ±50%，不能作为稳健指标。

#### 结论

- **p50 跨时段稳定**：Hub vs Direct 的 p50 差值在所有时段窗口中符号一致，Hub 比 Direct 高 92-367ms（取决于 provider）。这是可作为容量规划和 SLO 基线的稳健指标
- **p99 跨时段不稳定**：OpenAI 和 Anthropic 的 Hub vs Direct p99 胜负关系跨时段反转，Google 出现 1 次反转。不能作为跨时段结论
- **报告早期版本引用的"Hub p99 更稳"结论不成立**：那是基于单个时段窗口的选择性观察，后续时段窗口的数据不一致

**客观评价**：本节稳定性复核的样本数（Hub/Direct OpenAI 758/835、Google 568/691、Anthropic 160/160）是报告中对 p50 最稳健的统计，可以作为本次测试时段内 Hub vs Direct 延迟关系的可信基线。p99 和 cv 的跨时段定量结论需要更多时段覆盖的数据。

---

## 五、记账准确性验证

### 5.1 测试方法

给每个请求分配唯一的 `x-request-id`（格式：`bverify-{runId}-{provider}-{index}`），发送 60 个请求（3 provider × 20 requests，非 streaming）。等 10 秒让 waitUntil 的 D1 写入完成，然后通过 wrangler 查 D1 的 `ModelCalls` 表，按 requestId 前缀匹配，对比客户端观察的 token 数和 D1 存储的值。

### 5.2 结果

匹配结果：

| 指标 | 客户端观察 | D1 记录 | 差异 |
|------|----------|---------|------|
| 总请求数 | 60 | 60 | 0 |
| 成功数 | 60 | 60 | 0 |
| 总 tokens | 1268 | 1268 | 0 |
| 总 credits | $0.0009928 | $0.0009928 | 0 |
| 匹配率 | - | - | 60/60 (100%) |

验证内容：
- 每个请求都有对应的 `ModelCalls` D1 记录（零丢失）
- token 计数从 provider response 到 D1 完全一致
- credits 按 rate 正确计算并存储
- `userDid` 和 `requestId` 关联正确
- 60 个 `waitUntil` 异步写入在 10s 内全部完成
- meter buffer → Payment Kit 上报链路正常

**单条示例（openai/gpt-5-nano）：**
```json
{
  "id": "47136651-bd75-4705-bc1e-9ff22bc93fab",
  "providerId": "610752306748588032",
  "model": "gpt-5-nano",
  "status": "success",
  "totalUsage": 34,
  "credits": "0.0000087000",
  "userDid": "z3hzurNEMVDCCmEKAXvh2wnQYNuT2xpdvvyg1",
  "requestId": "bverify-2026-04-10T04-31-02-656Z-16u4d2-openai-000",
  "ttfb": "1846.0",
  "providerTtfb": "1846.0",
  "createdAt": "2026-04-10 04:31:08"
}
```

结论：本次 60 次请求的记账验证中，token 计数和 credits 计算与 D1 记录 100% 一致，`waitUntil` 异步写入未出现丢失。

---

## 六、本次优化效果（Before / After）

测试过程中对 Hub 实施了两项优化：

### 6.1 优化 1：`resolveProvider` in-isolate 缓存

问题：每次请求都查 2-3 次 D1（provider / credential / rate），但这些数据变化频率很低。

优化：在 Worker isolate 内存里缓存 provider 信息和 credentials 列表（60s TTL）。weighted credential selection 仍每次请求运行，保证负载均衡不被破坏。

效果：`resolveProvider` phase 从 ~50ms 降到 ~0ms（缓存命中时）。

### 6.2 优化 2：`resolveProvider` 和 `checkCredits` 并行化

问题：这两个操作彼此独立，但原代码是串行 await。

优化：改用 `Promise.all` 并发执行，用 `.finally` 保持 Server-Timing 每个 phase 独立记录。

效果：串行 50 + 60 = 110ms → 并行 max(50, 60) = 60ms。

### 6.3 合并效果

Smoke test 基线（n=18，优化前后对比）：

| | 优化前 | 优化后 | 差值 |
|-|-------|-------|-----|
| Hub warm overhead p50 | 154ms | 56ms | -98ms (-64%) |
| p50 `resolveProvider` | 50ms | 0ms | -50ms（缓存命中） |
| p50 `preChecks` | 60ms | 45ms | -15ms（并行化 overlap） |

大样本 benchmark 验证（n=126-169，优化后数据）：

| Target | n | p50 overhead | p90 | p99 |
|--------|---|-------------|-----|-----|
| hub-openai | 126 | 50ms | 61ms | 1012ms |
| hub-anthropic | 132 | 53ms | 65ms | 141ms |
| hub-google | 169 | 50ms | 59ms | 409ms |

两次独立测量的 p50 结果一致（50-56ms）。两个优化合计约减少 100ms，Hub 处理时间从约 155ms 降到 50-53ms。代码见 commit `28833d8`。

---

## 七、已知问题 & 长尾

### 7.1 Cold start outlier

**现象**：Worker isolate 冷启动时，第一次请求的 Hub 处理时间可能比 warm 请求慢 8-20 倍，主要来自 `preChecks` phase（Payment Kit Service Binding 的首次调用）。

**大样本 benchmark 观察到的尾部数据：**

| Target | n | Hub p50 | Hub p90 | Hub p99 | Hub max | p99/p50 倍率 |
|--------|---|---------|---------|---------|---------|-------------|
| hub-openai | 126 | 50ms | 61ms | 1012ms | 1088ms | **20x** |
| hub-anthropic | 132 | 53ms | 65ms | 141ms | 904ms | 2.7x |
| hub-google | 169 | 50ms | 59ms | 409ms | 600ms | 8.2x |

**规律：**
- **p50 和 p90 几乎无影响**（50ms vs 59-65ms）—— 大多数请求都是 warm
- **p99 出现 cold start 污染**（141-1012ms）
- **max 揭示最坏情况**（600-1088ms）

**为什么 hub-anthropic 的 p99/p50 倍率最小？**
因为 Anthropic 请求最快（~1s），同样时间窗口内产生更多 warm 请求，稀释了 cold start 的比例。Anthropic 132 样本里可能只有 2-3 个 cold start，占比 1.5%；OpenAI 126 样本里 cold start 占比可能 5%+（因为每个请求 ~7s，Worker 更容易被回收重启）。

**原因分析**：Payment Kit Service Binding 的第一次调用需要：
1. 建立 Service Binding 连接
2. `ensureMeter` 首次从 Payment Kit 获取 meter 配置
3. `ensureCustomer` 首次查询用户信息
4. Notification settings 首次检查

每个 isolate 一次性。后续请求命中内存缓存，恢复到正常水平。

**生产影响估算**：
- 假设 cold start 占比 2%（中间值）
- 每 100 个请求有 **2 个会体验到 500-1000ms 额外延迟**
- 非关键路径可以忽略；关键路径建议缓解

**可选缓解手段**（按推荐程度）：
1. **KV 缓存 "has credits" 快路径**（推荐）：高余额用户跳过 Payment Kit RPC，连冷启动时也只查 KV（~5ms）。预计 cold start Hub overhead 从 1000ms → ~20ms
2. **Warming ping cron**：每分钟发一次空请求保持 isolate 热度。简单但不能覆盖所有 CF 区域的 isolate
3. **延迟 Payment Kit 调用**：只在 pre-check 快速判断为可疑时才调用 Payment Kit 完整流程

### 7.2 样本量的局限

**Hub 自身处理开销**（Server-Timing 内部测量）：经过 §4.8 的多时段合并（n=2000+），p50 稳定在 42-52ms，p90 在 50-72ms，这个范围跨时段可靠。p99 (overhead) 在单个时段窗口内可在 58-1088ms 大幅波动，主要来自 cold start，量级判断可靠但精确值不稳定。

**Hub vs Direct 外部对比**：经过 §4.9 的多时段稳定性复核，p50 差值 92-367ms 稳健。p99 差值跨时段符号反转，单时段结论不可靠。

本次数据支持的结论类型：

| 结论类型 | 可靠度 | 依据 |
|---------|-------|------|
| Hub 处理开销 p50 量级 | 高 | n=2000+ 跨多时段稳定在 42-52ms |
| Hub 处理开销 p99 量级 | 中 | 单时段窗口内可到 1000ms，跨时段不稳定 |
| Hub vs Direct p50 差值 | 高 | 多时段采集符号一致，范围集中 |
| Hub vs Direct p99 差值 | 低 | 多时段采集符号反转 |
| p99.9 / 极端长尾 | 不可靠 | 单 target 样本不足 |

若要做 SLO 级的 p99 定量分析（比如要求 99% 请求 < X ms），建议将样本量扩大到 n>1000 且覆盖 10 个以上的时段窗口。

### 7.3 Anthropic rate limit

**现象**：早期采集 hub-anthropic 时，c=5 + realistic payload（800 max_tokens）触发 Anthropic 组织级 rate limit（10K output tokens/minute），566/698 请求返回 429。

**说明**：
- 这是 **Anthropic 对整个 API key 的限流**，和 Hub 无关
- 132 个成功请求的数据仍然可用（成功请求的延迟不受限流影响）
- 生产中使用真实用户量时，不同 user 的请求分散，不容易触发单一 key 限流
- 如果做更高并发 benchmark，需要提升 Anthropic API key 的 rate limit 或分散到多 key

---

## 八、Server-Timing 设施

这份报告的核心数据源是 Hub Worker 的 `Server-Timing` 响应头（非 streaming）和 SSE event（streaming 模式）。代码在 commit `cb80dd0` 中引入：

- **`cloudflare/src/libs/server-timing.ts`** —— `ServerTiming` 工具类
- **`cloudflare/src/routes/v2.ts`** —— `handleChatCompletion` 中各阶段埋点

**Phase 命名和 `benchmarks/src/index.ts:TIMING_PHASES` 完全对齐**，benchmark 客户端无需任何改动就能解析。

### 8.1 如何使用

查任何一个请求的响应头：

```bash
curl -s -D - https://aigne-hub-staging.zhuzhuyule-779.workers.dev/api/v2/chat/completions \
  -H 'Authorization: Bearer $HUB_ACCESS_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-5-nano","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' \
  -o /dev/null 2>&1 | grep -i server-timing
```

输出：
```
Server-Timing: session;dur=0.3,resolveProvider;dur=0.1,preChecks;dur=44.2,modelSetup;dur=5.1,providerTtfb;dur=1072.0,usage;dur=17.0,total;dur=1138.7
```

streaming 模式通过 SSE event 输出：
```
event: server-timing
data: session;dur=0.3,resolveProvider;dur=0.1,...
```

---

## 九、样本数据持久化

所有 benchmark 请求都保存到 `benchmarks/data/samples.jsonl`，包含完整元数据：

```json
{
  "runId": "2026-04-10T04-34-15-646Z-tby4cz",
  "runTimestamp": "2026-04-10T04:34:15.646Z",
  "benchmarkName": "multi-provider",
  "gitCommit": "28833d8",
  "hubBaseUrl": "https://aigne-hub-staging.zhuzhuyule-779.workers.dev",
  "gatewayEnabled": false,
  "target": "hub-anthropic",
  "provider": "anthropic",
  "model": "anthropic/claude-haiku-4-5",
  "concurrency": 5,
  "stream": true,
  "payload": "realistic",
  "ttfb": 996.2,
  "totalTime": 3685.4,
  "usage": { "promptTokens": 245, "completionTokens": 180, "totalTokens": 425 },
  "requestId": "...",
  "serverTiming": {
    "session": 0.3, "resolveProvider": 0.1, "preChecks": 42.1,
    "modelSetup": 4.2, "providerTtfb": 510.0, "streaming": 3052.0,
    "usage": 0.0, "total": 3685.4
  }
}
```

**可以用 DuckDB 直接查询做历史对比：**

```sql
-- p50/p90 TTFB by target across all time windows
SELECT target,
       quantile_cont(ttfb, 0.5) AS p50,
       quantile_cont(ttfb, 0.9) AS p90,
       COUNT(*) AS n
FROM read_json_auto('data/samples.jsonl')
WHERE error IS NULL
GROUP BY target
ORDER BY p50;
```

---

## 十、结论与建议

### 10.1 对原始问题的回答

1. **Hub 连接速率如何？**
   - Hub 自身处理开销 p50 在 42-52ms 之间，跨 12 个 target、n=2000+ 样本稳定
   - Warm 状态下 p90 在 50-72ms
   - Cold start 会将 p99 overhead 拉高到 177-1088ms（取决于 provider 和 payload），影响约 1-2% 请求

2. **是否应该直连 API 替代 Hub？**
   - Short payload 场景：Direct 的 TTFB p50 比 Hub 低 92-367ms（跨时段稳健）
   - Realistic payload 场景：在两个独立时段窗口中 Hub 的 TTFB p50 比 Direct 低约 1200ms
   - p99 胜负关系跨时段反转，不能作为决策依据
   - 决策需要权衡：p50 延迟差距 vs 统一计费（60/60 匹配）、统一 auth、统一 catalog
   - 对典型 chat 场景（响应时间数秒），Hub 处理开销占比 1-5%

3. **记账是否准确？**
   - 本次 60 次请求的验证中 token 和 credits 100% 匹配，`waitUntil` 异步写入未出现丢失
   - 样本量较小，生产前建议再跑一次更大规模的验证（比如 1000+ 请求）

### 10.2 Hub 定位（基于数据）

| 维度 | 数据 | 稳健性 |
|------|------|-------|
| 统一计费 | 60/60 验证匹配 | 本次验证无误差 |
| 统一认证 | 一个 access key 支持 4 个 provider | 功能性事实 |
| 统一 catalog | Hub 内置 model catalog | 功能性事实 |
| Short payload p50 延迟成本 | Hub 比 Direct 高 92-367ms | 跨时段稳健 |
| Realistic payload p50 | Hub 比 Direct 低约 1200ms | 两个独立时段窗口一致 |
| Short payload p99 稳定性 | 跨时段胜负反转 | 不可作为跨时段结论 |
| Hub 自身处理开销 | 42-52ms p50 | n=2000+ 跨时段稳健 |
| 长生成场景与直连比较 | 在本次数据中 Hub 更快 | 两个时段窗口一致，可再验证 |

**客观评价**：Hub 的核心定位有两层：

1. **统一接入层**：统一的计费、认证、catalog。这是功能性价值，不受延迟比较影响
2. **延迟层面**：
   - Short payload 下 Hub 的 p50 比 Direct 高 92-367ms（跨时段稳健成本）
   - Realistic payload 下 Hub 的 p50 比 Direct 低约 1200ms（两个独立时段窗口一致）
   - p99 稳定性跨时段没有稳定胜负关系，单个时段窗口的 p99 数字不能作为决策依据

对真实 chat 场景（response 几百 tokens，总时间数秒），Hub 的 50ms 处理开销占比 1-5%，对整体用户体验影响有限。

### 10.3 优化建议

#### 已完成
- `resolveProvider` isolate 缓存（省 ~50ms per request）
- `resolveProvider` + `checkCredits` 并行化（省 ~50ms per request）

#### 推荐下一步

**Payment Kit "has credits" KV 快路径**：高余额用户 credit 检查结果缓存 30s，大部分请求跳过 Service Binding RPC。
- 预期：Hub warm overhead 从 ~50ms 降到 5-10ms
- 预期：cold start p99 overhead 从 ~1088ms 降到 ~200ms
- 实现：新增 KV 缓存层，30s TTL，fail-open

**Cold start 细分诊断**：在 Server-Timing 里拆分 `ensureMeter` / `ensureCustomer` / `verifyAvailability`，精确定位 cold start 的耗时分布。

#### 中等价值

- Streaming 路径 `calculateCredits` 传入 `provider.resolvedRate`（非 streaming 已经这么做，streaming 漏了，省 ~15ms）
- 合并 `resolveProvider` 的 provider JOIN 和 credentials 查询为单个 SQL

#### 不建议

- 进一步将 Hub 自身处理压到个位数 ms：边际收益低于 KV 快路径
- 改成直连 API：会失去统一计费、认证、catalog，realistic payload 场景的 1200ms 优势也会消失

### 10.4 对产品决策的参考

1. **Provider 选择的影响远大于 Hub 与 Direct 的差异**
   - `gpt-5-nano` providerTtfb p50 = 6640ms
   - `claude-haiku-4-5` providerTtfb p50 = 486ms
   - 两者相差 13.7 倍（数千 ms），Hub vs Direct 的 ~200ms 差异在此量级面前占比有限
   - 延迟敏感场景应该优先考虑切换到更快的 model

2. **Hub 在 short payload 下有 p50 延迟成本**
   - 92-367ms，取决于 provider 和时段
   - 需要对这个代价有明确预期
   - 换来的是统一记账、认证、catalog 以及 realistic payload 场景的 p50 优势

3. **AI Gateway 的下一轮测试**
   - 当前数据是 Gateway 关闭的基线
   - Gateway 开启后：缓存 / fallback / analytics
   - 可能对**非 streaming、重复 prompt** 的场景有显著收益（缓存命中）
   - 对独立 streaming 场景影响应该较小（几乎无缓存机会）

4. **典型使用场景的 Hub 加成量化**
   - **快速 tool-call**（短 prompt, < 1s gen）：Hub 加成 **+200-300ms (+20-30%)**
   - **标准 chat**（几轮对话, 1-3s gen）：Hub 加成 **+100-200ms (+5-10%)**
   - **长生成**（文档生成, 5-10s+ gen）：Hub **持平或更快**（CF 网络优势）

---

## 附录

### A. 代码变更

| Commit | 内容 |
|--------|------|
| `cb80dd0` | Server-Timing header 输出 + JSONL 样本存储基础设施 |
| `28833d8` | Hub 性能优化：resolveProvider isolate 缓存 + resolveProvider/checkCredits 并行化 |
| `43cfa4b` | multi-provider + billing-verify benchmark 脚本 |
| _（本报告）_ | hub-vs-direct 头对头 benchmark 脚本（Anthropic/Google 直连适配器） + 最终报告 |

### B. 复现方法

```bash
cd /path/to/aigne-hub/benchmarks

# Smoke test（~5 min, 24 samples，验证 Server-Timing 和 sample store 工作）
pnpm smoke

# 大样本 multi-provider benchmark（~16 min，~1200 samples）
MULTI_PROVIDER_DURATION=180000 pnpm multi-provider

# Head-to-head Hub vs Direct（~7 min，包含 Anthropic/Google 直连）
HVD_CONCURRENCY=3 HVD_DURATION=60000 pnpm tsx src/hub-vs-direct.ts

# 记账验证（~2 min，含 D1 查询）
pnpm billing-verify
```

所有数据自动保存到 `benchmarks/data/samples.jsonl`。可用 DuckDB 或 jq 查询做跨时段趋势分析。

### C. 数据采集窗口清单

报告中所有样本都可以通过窗口 ID（`runId` 字段）追溯到具体的采集窗口。以下是所有采集窗口的清单：

| 窗口 ID | 类型 | 样本数 | 说明 |
|--------|------|-------|------|
| `sge21z` | smoke | 24 | 首次 smoke test（9 个 bug 失败） |
| `79nxzv` | smoke | 24 | 修 bug 后优化前基线，p50 overhead = 154ms |
| `y3sez9` | smoke | 24 | 优化后 smoke test，p50 overhead = 56ms |
| `16u4d2` | billing-verify | 60 | 记账验证：60/60 匹配 |
| `tby4cz` | multi-provider | 131 | 30s 版，方向性数据 |
| `qlzusr` | multi-provider | 1243 | 180s 大样本，realistic payload；Hub overhead p50=50ms |
| `6o4u6u` | hub-vs-direct | 1121 | 60s 头对头，short payload；Hub vs Direct 对比 |
| `nre1z6` | fill-gaps | 458 | OpenAI gpt-5-nano 三路对比（Hub/Direct/OpenRouter）+ Anthropic c=1 干净数据 |
| `sd3w3h` | openrouter-all | 334 | OpenRouter 全覆盖：OpenAI + Anthropic + Google 三个 provider 通过 OpenRouter 代理（c=3, 60s）|
| `6f3exy` | long-payload-3way | 108 | 长 payload 三路对比：openai/gpt-5-nano 同 model 通过 Hub/Direct/OpenRouter（c=3, 120s, realistic 800 max_tokens）|
| `su608w` | openrouter-nano-deep | 167 | OpenRouter gpt-5-nano 深度补采：short (143) + long (24)，c=3 × 240s。用于验证双峰分布 |
| `ctv7n6` | stability-check | 552 | 稳定性复核批次 1：OpenAI/Google Hub+Direct c=3 × 60s + Anthropic c=1 × 40 |
| `ykpy1f` | stability-check | 697 | 稳定性复核批次 2：同上配置，与批次 1 间隔 5 分钟 |
| `xsxzwz` | stability-check | 675 | 稳定性复核批次 3：同上配置，与批次 2 间隔 5 分钟。稳定性复核合计约 1924 样本 |

**跨时段查询示例（DuckDB）：**

```sql
-- 对比两个时段窗口的 Hub 处理开销
SELECT runId, target,
       quantile_cont(
         GREATEST(0, CAST(serverTiming->>'$.total' AS DOUBLE)
                   - CAST(serverTiming->>'$.providerTtfb' AS DOUBLE)
                   - COALESCE(CAST(serverTiming->>'$.streaming' AS DOUBLE), 0)),
         0.5
       ) AS p50_hub_overhead
FROM read_json_auto('benchmarks/data/samples.jsonl')
WHERE target LIKE 'hub-%' AND error IS NULL
  AND runId IN ('2026-04-10T04-47-15-439Z-qlzusr', '2026-04-10T05-06-01-826Z-6o4u6u')
GROUP BY runId, target
ORDER BY target, runId;
```

### D. 环境信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-04-10 |
| 测试时段 | UTC 04:47 - 05:13 |
| Hub 部署版本 | `c27b75ee-2328-44c7-94f3-e3a22b973768` |
| Hub 代码 commit | `43cfa4b` |
| Hub 环境 | `aigne-hub-staging.zhuzhuyule-779.workers.dev` |
| CF AI Gateway | 关闭 |
| D1 staging DB | `aigne-hub-staging` (ID: `5d0d4eb5-d31f-4e08-acac-721a022198f3`) |
| Payment Kit | `payment-kit-staging` (Service Binding) |
| 测试客户端位置 | 国内（跨太平洋到美国 provider） |
| 客户端→CF edge 网络 RTT | ~400ms p50 |
