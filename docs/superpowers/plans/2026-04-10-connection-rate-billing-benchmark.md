# Aigne Hub 连接速率 + 记账验证 Benchmark 计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Aigne Hub Worker 加上 Server-Timing header，精确测量每个处理阶段的耗时；然后对比 Hub（经 CF AI Gateway）与直连 Provider API 的连接速率，验证记账/用量统计的正确性，为是否可以直连 API 提供数据支撑。

**Architecture:** 首先在 Hub Worker 的 `v2.ts` 中埋入 Server-Timing 计时点，覆盖认证、provider 解析、credit 检查、Provider 请求、记账等各阶段。然后在已有的 `benchmarks/` 框架上扩展，新增 `billing-verify.ts` 和 `multi-provider.ts`。Benchmark 客户端已有 Server-Timing 解析/聚合能力（`parseServerTiming()` + `aggregateServerTimings()`），无需修改。

**Tech Stack:** TypeScript, Hono (CF Workers), tsx, undici, Cloudflare D1 REST API, 已有 benchmark 框架 (`benchmarks/src/index.ts`)

---

## 背景

当前请求链路：
```
Agent → AIGNE Hub (CF Worker) → CF AI Gateway → Provider (OpenAI/Anthropic/Google...)
```

核心问题：
1. Hub + Gateway 两跳带来多少延迟？**各阶段分别花多少时间？**
2. 记账是否准确？每个请求的 credits 计算、D1 ModelCalls 记录、KV meter buffer、Payment Kit 上报是否一致？
3. 如果绕过 Hub 直连 API，记账怎么办？CF AI Gateway 的 analytics 能否替代？

### 测试矩阵（4 provider × 2-3 路径）

| Provider | 模型 | 为什么选这个 |
|----------|------|-------------|
| **OpenAI** | `gpt-5-nano` | 最新最便宜的 nano 级，latency 基线 |
| **Anthropic** | `claude-haiku-4-5` | 不同 API 格式（messages），最便宜的 Haiku |
| **Google** | `gemini-2.5-flash` | 第三种 API 格式（generateContent），免费额度 |
| **OpenRouter** | `openai/gpt-oss-20b:free` | 第三方代理对照，用免费模型跑不花钱 |

每个 provider 跑 2-3 条路径：
1. **直连** — 从本地机器直接打 Provider API
2. **Hub (gateway off)** — 从本地打 Hub Worker → Worker 直连 Provider
3. **Hub (gateway on)** — 从本地打 Hub Worker → CF AI Gateway → Provider（**第二波再开**，当前 gateway 已关闭）

OpenRouter 作为第三方对照，主要看 `openrouter-direct`，不强制过 Hub（Hub catalog 里可能没有这个 model）。

### 关键发现

Benchmark 客户端（`benchmarks/src/index.ts`）**已完整支持** Server-Timing：
- `parseServerTiming()` 解析 `phase;dur=123.4` 格式
- `aggregateServerTimings()` 聚合 12 个 phase 的 p50/p90/p99
- 支持 HTTP response header 和 SSE event（`event: server-timing`）两种传递方式
- 定义的 phase：`session`, `resolveProvider`, `modelCallCreate`, `preChecks`, `modelSetup`, `getCredentials`, `providerTtfb`, `ttfb`, `streaming`, `usage`, `modelStatus`, `total`

**但 Hub Worker 端（`cloudflare/src/routes/v2.ts`）目前没有发出 Server-Timing header。** 这是 Task 0 的工作。

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `cloudflare/src/libs/server-timing.ts` | ServerTiming 工具类：计时、格式化 header、生成 SSE event |
| Modify | `cloudflare/src/routes/v2.ts` | 在 `handleChatCompletion` 各阶段埋入计时点，输出 Server-Timing |
| Create | `benchmarks/src/sample-store.ts` | JSONL 样本存储：每次请求都作为一条样本持久化 |
| Create | `benchmarks/data/README.md` | 样本数据格式文档 |
| Create | `benchmarks/src/multi-provider.ts` | 多 provider 对比：OpenAI / Anthropic / Google / OpenRouter 各自 Hub vs 直连 |
| Create | `benchmarks/src/billing-verify.ts` | 记账验证：benchmark 后查询 D1 + KV 对比期望值 |
| Create | `benchmarks/src/billing-helpers.ts` | 记账验证工具函数：D1 查询、credits 计算、diff 报告 |
| Modify | `benchmarks/src/index.ts` | 扩展 `BenchmarkResult` + config；集成 sample store 到 `runConcurrent` |
| Modify | `benchmarks/package.json` | 添加 `multi-provider` 和 `billing-verify` 脚本 |
| Create | `benchmarks/.env.example` | 文档化所有需要的环境变量 |
| Modify | `benchmarks/.gitignore` | 忽略 `data/*.jsonl` 防止误提交 |

---

## 样本量与数据准确性

测试的"准确性"要分两类看，因为两类测试的问题本质完全不同。

### A. 延迟 benchmark（latency / TTFB / 各 phase）

这是**统计问题** — 我们要估计一个分布的 p50/p90/p99，样本数决定置信度。

**样本量建议**：

| 目标指标 | 最少样本数 | 说明 |
|---------|-----------|------|
| p50（中位数） | 30 | 快速 sanity check |
| p50 + 稳定 p90 | 100 | 开发决策够用 |
| 可靠 p99 | 500-1000 | 做结论性报告时 |
| 尾延迟分析 | 2000+ | 要区分 p99 vs p99.9 |

**我们的场景**：目标是"做技术决策"，不是写论文，所以 **每 target 100-300 个样本** 足够。

**映射到现有 benchmark 配置**：

已有配置在 `benchmarks/src/index.ts:71-79`：
```typescript
comparisonDuration: 30000,                      // 30s per target
comparisonConcurrencyLevels: [5, 20, 40],       // 3 concurrency levels
targetCooldown: 30000,                          // 30s cooldown between targets
```

假设单次请求 TTFB ~300ms + streaming ~800ms = ~1.1s/request：
- 并发 5 × 30s ≈ 130 样本/level
- 并发 20 × 30s ≈ 540 样本/level
- 并发 40 × 30s ≈ 1080 样本/level

3 个 level 加起来 **每 target ~1750 样本**。p50/p90/p99 全都可靠。

**但是**：concurrency 40 × 4 provider × 3 target = 12 target，每个 target 要 30s × 3 level + 30s cooldown = 约 150s。**完整一轮 ~30 分钟**。

### B. 记账准确性验证（billing verify）

这**不是统计问题**，是**正确性问题** — 我们要验证"每个请求都有正确的 D1 记录和 KV entry"。

**样本量建议**：

| 目的 | 样本数 | 理由 |
|------|--------|------|
| Sanity check | 5-10 | 跑通链路 |
| **决策性验证（推荐）** | **20-50** | 能捕捉 5% 级别的系统性错误 |
| 严格正确性审计 | 100+ | 边界条件 + streaming vs 非 streaming 各跑一轮 |

**为什么 20-50 就够**：我们要抓的是"系统性缺陷"（比如 streaming 模式下 usage 计数为 0，或者某个 provider 的 D1 写入失败），不是"偶发性偏差"。只要有一个 systematic bug，20 个样本里大概率能看到多次。

**实际跑法**：
- 每 provider 20 个请求（总计 60 请求），非 streaming
- 每 provider 再跑 20 个 streaming 请求（总计 60 请求）
- 总共 120 请求，耗时 ~5 分钟
- 然后等 10s 让 waitUntil D1 写入完成
- 查 D1 对比

### C. 跑法推荐（务实版）

鉴于 gateway 目前关闭、要快速拿决策数据，建议分两档跑：

**第一档：快速 smoke test（5-10 分钟）**
- 每 target 并发 5，duration 30s
- 目标：验证 Server-Timing 正常输出 + 基本的 hub overhead 方向性数据
- 3 provider × 3 target = 9 target × 30s = ~8 分钟

**第二档：决策性 benchmark（25-35 分钟）**
- 每 target 并发 [5, 20] 两个 level × 30s
- 目标：p50/p90 稳定数据、scaling 趋势
- 4 provider（含 OpenRouter）× 3 target × 2 level × 30s + cooldown = ~30 分钟

**P99 和高并发（40+）留到第二波**：第一波拿到结果后再决定是否要更深入。

### D. 置信区间的快速参考

经验法则（正态分布近似）：
- 100 样本 → p50 置信区间约 ±5%
- 100 样本 → p90 置信区间约 ±10%
- 100 样本 → p99 置信区间约 ±30%（不可靠）
- 1000 样本 → p99 置信区间约 ±10%

**看 benchmark 输出时注意**：
- 如果 `stddev/avg > 0.3`（`cv > 0.3`），说明数据抖动很大，样本可能不够或环境不稳定
- 如果 `p90 - p50` 非常接近 `p99 - p90`，说明分布有长尾，单纯看 p50 会误判
- 如果两次跑的 p50 差 > 10%，说明环境噪声大，增加样本或 cooldown

现有 benchmark 已经输出 `stddev` 和 `cv`（见 `benchmarks/src/index.ts:272-278`）—— **看报告时先看这两个数字，再看 p 值**。

---

## Task 0: Hub Worker 添加 Server-Timing 输出

**Files:**
- Create: `cloudflare/src/libs/server-timing.ts`
- Modify: `cloudflare/src/routes/v2.ts:91-516`

### 设计思路

Server-Timing 的 benchmark 客户端已经期望 12 个 phase（见 `benchmarks/src/index.ts:298-311`）。我们在 Hub Worker 中按这些 phase 名称输出，确保完全对齐：

```
请求进入 handleChatCompletion
  ├─ session       — 从 middleware 获取 user 信息（已在 auth middleware 完成，此处测量提取耗时）
  ├─ resolveProvider — D1 查询 provider + credential + rate
  ├─ preChecks     — credit 余额检查（Payment Kit 或 D1 fallback）
  ├─ modelSetup    — gateway 配置解析 + body 转换 + URL 构建
  ├─ providerTtfb  — 从发出 fetch 到收到第一个字节
  ├─ streaming     — 从第一个字节到流结束（仅 streaming 模式）
  ├─ usage         — calculateCredits + recordModelCall + bufferMeterEvent
  └─ total         — 整个请求的端到端耗时
```

**非 streaming 模式**：通过 `Server-Timing` response header 输出。
**Streaming 模式**：通过 SSE event `event: server-timing\ndata: ...` 输出（因为 streaming 开始时 header 已发送，无法追加。benchmark 客户端已支持这种方式，见 `index.ts:181-184`）。

- [ ] **Step 1: 创建 server-timing.ts 工具类**

创建 `cloudflare/src/libs/server-timing.ts`：

```typescript
/**
 * Server-Timing utility for measuring request processing phases.
 *
 * Non-streaming: output via Server-Timing response header.
 * Streaming: output via SSE event (event: server-timing\ndata: ...\n\n).
 *
 * Phase names align with benchmarks/src/index.ts TIMING_PHASES.
 */

export class ServerTiming {
  private marks = new Map<string, number>();
  private durations = new Map<string, number>();
  private requestStart: number;

  constructor() {
    this.requestStart = performance.now();
  }

  /** Mark the start of a phase. */
  start(phase: string): void {
    this.marks.set(phase, performance.now());
  }

  /** End a phase and record its duration (ms). */
  end(phase: string): number {
    const startMark = this.marks.get(phase);
    if (startMark === undefined) return 0;
    const dur = performance.now() - startMark;
    this.durations.set(phase, dur);
    this.marks.delete(phase);
    return dur;
  }

  /** Record a duration directly (e.g. from an external measurement). */
  record(phase: string, durationMs: number): void {
    this.durations.set(phase, durationMs);
  }

  /** End the 'total' phase from request start. */
  finalize(): void {
    this.durations.set('total', performance.now() - this.requestStart);
  }

  /** Format as Server-Timing header value: "phase;dur=123.4,phase2;dur=56.7" */
  toHeader(): string {
    return Array.from(this.durations.entries())
      .map(([name, dur]) => `${name};dur=${dur.toFixed(1)}`)
      .join(',');
  }

  /** Format as SSE event for streaming responses. */
  toSSE(): string {
    return `event: server-timing\ndata: ${this.toHeader()}\n\n`;
  }

  /** Get duration of a specific phase (ms), or undefined if not recorded. */
  get(phase: string): number | undefined {
    return this.durations.get(phase);
  }
}
```

- [ ] **Step 2: 确认编译通过**

Run: `cd /Users/zac/work/arcblock/aigne-hub && npx tsc --noEmit cloudflare/src/libs/server-timing.ts 2>&1`

Expected: 无错误

- [ ] **Step 3: 在 handleChatCompletion 非 streaming 路径中埋入计时**

修改 `cloudflare/src/routes/v2.ts`。在 `handleChatCompletion` 函数内，按阶段添加计时。

**3a. 导入 + 初始化 timing**

在文件顶部 import 区域添加：

```typescript
import { ServerTiming } from '../libs/server-timing';
```

在 `handleChatCompletion` 函数体开头（`const db = c.get('db');` 之前），添加：

```typescript
  const timing = new ServerTiming();
```

**3b. session 阶段**

在获取 `userDid` 的代码周围添加：

```typescript
  timing.start('session');
  const db = c.get('db');
  const waitUntil = getWaitUntil(c);
  const startTime = Date.now();
  const userDid = (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';
  const rawAppDid = (c as any).get('apiKeyAppDid') || c.req.header('x-aigne-hub-client-did') || '';
  const appDid = rawAppDid && rawAppDid !== 'undefined' ? rawAppDid : '';
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  timing.end('session');
```

**3c. resolveProvider 阶段**

在 `resolveProvider` 调用前后：

```typescript
  // Resolve provider
  timing.start('resolveProvider');
  const provider = await resolveProvider(db, body.model, c.env.CREDENTIAL_ENCRYPTION_KEY);
  timing.end('resolveProvider');
```

**3d. preChecks 阶段**

在 credit check 前后：

```typescript
  // Check credits before making the call
  timing.start('preChecks');
  if (userDid) {
    const creditCheck = await checkCredits(c, userDid);
    if (!creditCheck.ok) {
      timing.end('preChecks');
      timing.finalize();
      c.header('Server-Timing', timing.toHeader());
      return c.json({
        error: {
          message: 'Insufficient credits',
          type: 'CREDIT_NOT_ENOUGH',
          balance: creditCheck.balance,
          paymentLink: creditCheck.paymentLink || null,
        },
      }, 402);
    }
  }
  timing.end('preChecks');
```

**3e. modelSetup 阶段**

在 gateway 配置 + body 转换 + URL 构建周围：

```typescript
  timing.start('modelSetup');
  const isGoogle = provider.apiFormat === 'gemini';
  const isAnthropic = provider.apiFormat === 'anthropic';
  // ... (existing gateway config + body transform + URL build code) ...
  // ... up to the line before `try { let upstreamResponse = await fetch(...)` ...
  timing.end('modelSetup');
```

**3f. providerTtfb + fetch**

在 upstream fetch 调用周围：

```typescript
  try {
    timing.start('providerTtfb');
    let upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(usedGateway ? gatewayCompatBody : upstreamBody),
    });

    // Gateway failed → fallback to direct provider
    if (usedGateway && !upstreamResponse.ok && provider.apiKey) {
      const directUrl = buildUpstreamUrl(provider, 'chat', { stream: body.stream });
      const directHeaders = buildProviderHeaders(provider);
      upstreamResponse = await fetch(directUrl, {
        method: 'POST',
        headers: directHeaders,
        body: JSON.stringify(upstreamBody),
      });
      usedGateway = false;
    }
    timing.end('providerTtfb');
```

**3g. 非 streaming 响应：usage 阶段 + header 输出**

在非 streaming 路径的 `calculateCredits` + `recordModelCall` 周围：

```typescript
    // Non-streaming response
    providerTtfb = Date.now() - providerStartTime;
    const rawResponse = await upstreamResponse.json<Record<string, unknown>>();
    // ... (existing response conversion) ...

    timing.start('usage');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    // ... (existing calculateCredits + recordModelCall + bufferUsage) ...
    timing.end('usage');

    timing.record('providerTtfb', providerTtfb);
    timing.finalize();
    c.header('Server-Timing', timing.toHeader());

    const prefs = await getPreferences(c.env.AUTH_KV);
    return c.json(buildCompletionResponse({ ... }));
```

**3h. Streaming 响应：传递 timing 对象，在流结束后发 SSE event**

在 streaming 路径中，需要在 `stream(c, async (writable) => { ... })` 的 finally 块之后、response 发送之前，追加 SSE event：

```typescript
    // Streaming response
    if (body.stream && upstreamResponse.body) {
      providerTtfb = Date.now() - providerStartTime;
      timing.end('providerTtfb');

      return stream(c, async (writable) => {
        c.header('Content-Type', 'text/plain; charset=utf-8');
        c.header('Cache-Control', 'no-cache');
        c.header('X-Accel-Buffering', 'no');

        timing.start('streaming');
        // ... (existing stream reading loop) ...
        timing.end('streaming');

        // Record usage after stream completes
        timing.start('usage');
        // ... (existing calculateCredits + recordModelCall + bufferUsage) ...
        timing.end('usage');

        // Emit server-timing as final SSE event
        timing.finalize();
        await writable.write(timing.toSSE());
      });
    }
```

- [ ] **Step 4: 验证修改后 TypeScript 编译通过**

Run: `cd /Users/zac/work/arcblock/aigne-hub/cloudflare && npx tsc --noEmit 2>&1 | head -20`

Expected: 无错误，或只有无关的既有 warning

- [ ] **Step 5: 本地测试 Server-Timing header 输出**

启动本地 dev server 并发送一个测试请求：

Run: `cd /Users/zac/work/arcblock/aigne-hub/cloudflare && npx wrangler dev --port 3030 &`

然后用 curl 发送请求，检查 response header：

Run: `curl -s -D - -o /dev/null http://localhost:3030/api/v2/chat/completions -H 'Content-Type: application/json' -H 'Authorization: Bearer test' -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"max_tokens":5}' 2>&1 | grep -i server-timing`

Expected: 类似 `Server-Timing: session;dur=0.3,resolveProvider;dur=12.5,preChecks;dur=45.2,modelSetup;dur=1.1,providerTtfb;dur=234.8,usage;dur=8.3,total;dur=302.2`

- [ ] **Step 6: 测试 streaming 模式的 SSE event 输出**

Run: `curl -s http://localhost:3030/api/v2/chat/completions -H 'Content-Type: application/json' -H 'Authorization: Bearer test' -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"max_tokens":5,"stream":true}' 2>&1 | grep "event: server-timing"`

Expected: 在流的最后出现 `event: server-timing`，data 行包含各 phase 的 dur 值

- [ ] **Step 7: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add cloudflare/src/libs/server-timing.ts cloudflare/src/routes/v2.ts
git commit -m "feat: add Server-Timing header output to v2 chat completions

Instrument handleChatCompletion with per-phase timing:
session, resolveProvider, preChecks, modelSetup, providerTtfb,
streaming, usage, total.

Non-streaming: output via Server-Timing response header.
Streaming: output via SSE event (event: server-timing).

Phase names align with benchmarks/src/index.ts TIMING_PHASES
so existing benchmark tooling works out of the box."
```

---

## Task 1: 扩展 BenchmarkResult 捕获 token usage（可选优化）

**Files:**
- Modify: `benchmarks/src/index.ts:30-40`

- [ ] **Step 1: 读取现有 BenchmarkResult 接口定义**

确认当前的接口结构。当前定义在 `benchmarks/src/index.ts:30-40`：

```typescript
export interface BenchmarkResult {
  status: number;
  ttfb: number;
  totalTime: number;
  streamingTime: number;
  serverTiming?: Record<string, number>;
  error?: string;
  rateLimited: boolean;
}
```

- [ ] **Step 2: 扩展 BenchmarkResult 接口**

在 `benchmarks/src/index.ts` 中，给 `BenchmarkResult` 新增 usage 相关字段：

```typescript
export interface BenchmarkResult {
  status: number;
  ttfb: number;
  totalTime: number;
  streamingTime: number;
  serverTiming?: Record<string, number>;
  error?: string;
  rateLimited: boolean;
  // New: token usage from response
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  // New: credits info from Hub response headers
  creditsUsed?: number;
  requestId?: string;
}
```

- [ ] **Step 3: 在 streaming 解析中捕获 usage**

找到 `index.ts` 中 `runSingle` 或类似的请求执行函数，在解析 SSE streaming 响应的最后一个 chunk（`data: [DONE]` 之前的那个 chunk）时，提取 `usage` 字段。对于 non-streaming 响应，直接从 JSON body 中提取。

在 streaming 的 SSE 解析循环中，添加：

```typescript
// Parse usage from the last SSE data chunk (before [DONE])
if (parsed.usage) {
  result.usage = {
    promptTokens: parsed.usage.prompt_tokens ?? 0,
    completionTokens: parsed.usage.completion_tokens ?? 0,
    totalTokens: parsed.usage.total_tokens ?? 0,
  };
}
// Capture Hub-specific headers
if (response.headers.get('x-request-id')) {
  result.requestId = response.headers.get('x-request-id')!;
}
```

- [ ] **Step 4: 扩展 config 添加 D1/billing 相关配置**

在 `config` 对象中添加：

```typescript
// D1 REST API config (for billing verification)
d1AccountId: process.env.D1_ACCOUNT_ID || '',
d1DatabaseId: process.env.D1_DATABASE_ID || '',
d1ApiToken: process.env.D1_API_TOKEN || '',
// Anthropic & Google direct API keys
anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
googleApiKey: process.env.GOOGLE_API_KEY || '',
// Billing verification
billingVerifyDelay: parseInt(process.env.BILLING_VERIFY_DELAY || '5000', 10),
```

- [ ] **Step 5: 运行现有 comparison benchmark 确认没有 regression**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npx tsx src/comparison.ts 2>&1 | head -20`

Expected: 正常启动（如果缺少 .env 会提示 "No comparison groups available"，这是正常的）

- [ ] **Step 6: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add benchmarks/src/index.ts
git commit -m "feat(benchmarks): extend BenchmarkResult with usage and credits fields"
```

---

## Task 2: 持久化样本存储（每次请求都是样本）

**Files:**
- Create: `benchmarks/src/sample-store.ts`
- Create: `benchmarks/data/README.md`
- Create: `benchmarks/data/.gitkeep`
- Modify: `benchmarks/src/index.ts` — 集成到 `runConcurrent`
- Modify: `benchmarks/.gitignore` — 忽略 `data/*.jsonl`

### 设计原则

**每一次请求都是一条样本，不丢弃任何数据。**

- **格式**：JSONL（每行一个 JSON 对象）— append-only、可流式、可用 `jq`/`DuckDB` 直接查询
- **位置**：`benchmarks/data/samples.jsonl`（单文件累加，而不是按日期切分 — 便于跨天对比）
- **内容**：每条样本 = 运行元数据（runId、benchmarkName、时间戳等）+ target 信息 + 完整 `BenchmarkResult`（含 serverTiming 各 phase、usage、creditsUsed）
- **提交到 git**：**不提交**。数据可能很大且含 requestId。但 `data/` 目录和 README 提交

### 样本 schema

```typescript
interface Sample {
  // Run metadata
  runId: string;              // 一次 benchmark 运行的唯一 ID，如 "2026-04-10T12:34:56Z-a3f7"
  runTimestamp: string;       // ISO8601 开始时间
  benchmarkName: string;      // "comparison" | "multi-provider" | "billing-verify" | ...
  gitCommit?: string;         // 本次运行对应的 git HEAD（便于溯源）
  hubBaseUrl?: string;        // 当前 Hub 的地址
  gatewayEnabled?: boolean;   // Hub 是否开启了 CF AI Gateway（通过 env var 注入）

  // Target info
  target: string;             // "hub-openai" | "openai-direct" | ...
  provider: string;           // "openai" | "anthropic" | ...
  model: string;              // 实际请求的 model 字符串
  concurrency: number;        // 当前 concurrency level
  stream: boolean;            // 是否 streaming
  payload: string;            // payload 名称，如 "realistic" | "small"

  // Per-request data
  sampleTimestamp: string;    // 这条请求开始的时间
  status: number;
  error?: string;
  rateLimited: boolean;
  ttfb: number;
  totalTime: number;
  streamingTime: number;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  creditsUsed?: number;
  requestId?: string;
  serverTiming?: Record<string, number>;  // session/resolveProvider/.../total
}
```

- [ ] **Step 1: 创建 sample-store.ts**

```typescript
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

import type { BenchmarkResult, Target } from './index.js';

export interface Sample {
  // Run metadata
  runId: string;
  runTimestamp: string;
  benchmarkName: string;
  gitCommit?: string;
  hubBaseUrl?: string;
  gatewayEnabled?: boolean;

  // Target info
  target: string;
  provider: string;
  model: string;
  concurrency: number;
  stream: boolean;
  payload: string;

  // Per-request data
  sampleTimestamp: string;
  status: number;
  error?: string;
  rateLimited: boolean;
  ttfb: number;
  totalTime: number;
  streamingTime: number;
  usage?: BenchmarkResult['usage'];
  creditsUsed?: number;
  requestId?: string;
  serverTiming?: Record<string, number>;
}

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');
const DEFAULT_SAMPLES_FILE = join(DEFAULT_DATA_DIR, 'samples.jsonl');

/** Generate a unique run ID combining timestamp + random suffix. */
export function createRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/** Get the current git HEAD commit hash (short form), or undefined if not in git repo. */
export function getGitCommit(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

/**
 * RunContext is created once per benchmark script invocation.
 * Holds metadata that's shared across all samples in the run.
 */
export interface RunContext {
  runId: string;
  runTimestamp: string;
  benchmarkName: string;
  gitCommit?: string;
  hubBaseUrl?: string;
  gatewayEnabled?: boolean;
}

export function createRunContext(benchmarkName: string, env?: {
  hubBaseUrl?: string;
  gatewayEnabled?: boolean;
}): RunContext {
  return {
    runId: createRunId(),
    runTimestamp: new Date().toISOString(),
    benchmarkName,
    gitCommit: getGitCommit(),
    hubBaseUrl: env?.hubBaseUrl,
    gatewayEnabled: env?.gatewayEnabled,
  };
}

/**
 * Append a batch of samples to the JSONL store.
 * Creates data dir + file if they don't exist.
 */
export function appendSamples(
  samples: Sample[],
  filePath: string = DEFAULT_SAMPLES_FILE
): void {
  if (samples.length === 0) return;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // JSONL: one JSON object per line, append-only
  const lines = samples.map((s) => JSON.stringify(s)).join('\n') + '\n';
  appendFileSync(filePath, lines, { encoding: 'utf8' });
}

/**
 * Build samples from raw benchmark results + run context + target info.
 */
export function buildSamples(
  results: BenchmarkResult[],
  ctx: RunContext,
  targetInfo: {
    target: Target;
    provider: string;
    concurrency: number;
    stream: boolean;
    payload: string;
  }
): Sample[] {
  return results.map((r) => ({
    // Run metadata
    runId: ctx.runId,
    runTimestamp: ctx.runTimestamp,
    benchmarkName: ctx.benchmarkName,
    gitCommit: ctx.gitCommit,
    hubBaseUrl: ctx.hubBaseUrl,
    gatewayEnabled: ctx.gatewayEnabled,

    // Target info
    target: targetInfo.target.name,
    provider: targetInfo.provider,
    model: targetInfo.target.model,
    concurrency: targetInfo.concurrency,
    stream: targetInfo.stream,
    payload: targetInfo.payload,

    // Per-request (we don't have per-request start timestamp from BenchmarkResult,
    // use run timestamp as approximation; precise timing requires adding a field to BenchmarkResult)
    sampleTimestamp: new Date().toISOString(),
    status: r.status,
    error: r.error,
    rateLimited: r.rateLimited,
    ttfb: r.ttfb,
    totalTime: r.totalTime,
    streamingTime: r.streamingTime,
    usage: r.usage,
    creditsUsed: r.creditsUsed,
    requestId: r.requestId,
    serverTiming: r.serverTiming,
  }));
}

/**
 * Read all samples from the store (for analysis scripts).
 * Returns an empty array if the file doesn't exist.
 */
export function readSamples(filePath: string = DEFAULT_SAMPLES_FILE): Sample[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter((l) => l.length > 0);
  return lines.map((line) => JSON.parse(line) as Sample);
}
```

- [ ] **Step 2: 创建 data/ 目录结构**

```bash
mkdir -p /Users/zac/work/arcblock/aigne-hub/benchmarks/data
touch /Users/zac/work/arcblock/aigne-hub/benchmarks/data/.gitkeep
```

创建 `benchmarks/data/README.md`：

```markdown
# Benchmark Samples

This directory stores benchmark sample data in JSONL format.

## Files

- `samples.jsonl` — all benchmark runs, append-only, one request per line

## Format

Each line is a JSON object with the schema defined in `../src/sample-store.ts` (see `Sample` interface).

Key fields:
- `runId` — unique per benchmark script invocation
- `benchmarkName` — which script generated it (comparison / multi-provider / billing-verify)
- `target` — the target being tested (e.g. hub-openai, openai-direct)
- `serverTiming` — full breakdown of server-side phases (from Hub Worker's Server-Timing header)
- `usage` — token counts from response

## Querying

### With jq (simple filters)

```bash
# All hub-openai samples from today
jq 'select(.target == "hub-openai" and (.runTimestamp | startswith("2026-04-10")))' samples.jsonl

# p50 ttfb per target (approximate, sorted)
jq -c '{target, ttfb}' samples.jsonl | sort

# Count samples by target
jq -r '.target' samples.jsonl | sort | uniq -c
```

### With DuckDB (SQL queries)

```bash
duckdb -c "SELECT target, provider, COUNT(*) as n, \
    quantile_cont(ttfb, 0.5) AS p50, \
    quantile_cont(ttfb, 0.9) AS p90 \
  FROM read_json_auto('samples.jsonl') \
  GROUP BY target, provider \
  ORDER BY p50"
```

## Retention

Samples accumulate indefinitely. Rotate or archive manually when needed.

## Privacy

Samples may contain `requestId` and other request metadata. **Do not commit to git.**
The `.gitignore` excludes `*.jsonl` by default.
```

- [ ] **Step 3: 更新 .gitignore**

读当前 `benchmarks/.gitignore`，追加：

```
# Benchmark sample data (may contain request IDs)
data/*.jsonl
```

保留 `data/.gitkeep` 和 `data/README.md` 提交。

- [ ] **Step 4: 集成到 runConcurrent**

修改 `benchmarks/src/index.ts` 中的 `runConcurrent` 函数（或者提供一个 `runConcurrentAndStore` 包装函数），让它在运行结束后自动持久化：

```typescript
import { appendSamples, buildSamples, type RunContext } from './sample-store.js';

/**
 * Run concurrent benchmark and automatically persist samples.
 * Call from benchmark scripts after creating a RunContext.
 */
export async function runAndStore(
  target: Target,
  concurrency: number,
  duration: number,
  ctx: RunContext,
  targetMeta: { provider: string; stream: boolean; payload: string },
  options?: RequestOptions
): Promise<{ results: BenchmarkResult[]; elapsed: number }> {
  const result = await runConcurrent(target, concurrency, duration, options);

  // Persist samples
  const samples = buildSamples(result.results, ctx, {
    target,
    provider: targetMeta.provider,
    concurrency,
    stream: targetMeta.stream,
    payload: targetMeta.payload,
  });
  appendSamples(samples);

  return result;
}
```

**注意**：不要修改 `runConcurrent` 本身 — 保持它的纯函数特性。只在包装层加持久化。

也要在文件顶部 export 这个新函数（如果 index.ts 用 barrel export 的话），并确认它被正常导出。

- [ ] **Step 5: 验证编译和文件结构**

Run: `/Users/zac/work/arcblock/aigne-hub/node_modules/.bin/tsc --noEmit --project /Users/zac/work/arcblock/aigne-hub/benchmarks/tsconfig.json 2>&1 | tail -20`

Expected: 无错误

Run: `ls -la /Users/zac/work/arcblock/aigne-hub/benchmarks/data/`

Expected: 显示 `.gitkeep` 和 `README.md`

- [ ] **Step 6: 快速 smoke test 样本写入**

写一个临时测试脚本或直接在 REPL 中调用：

```typescript
// 临时测试：手工构造几条样本并写入
import { appendSamples, createRunContext } from './sample-store.js';

const ctx = createRunContext('smoke-test', { hubBaseUrl: 'test', gatewayEnabled: false });
appendSamples([
  {
    runId: ctx.runId,
    runTimestamp: ctx.runTimestamp,
    benchmarkName: 'smoke-test',
    target: 'test-target',
    provider: 'test',
    model: 'test-model',
    concurrency: 1,
    stream: false,
    payload: 'realistic',
    sampleTimestamp: new Date().toISOString(),
    status: 200,
    rateLimited: false,
    ttfb: 100,
    totalTime: 500,
    streamingTime: 400,
  },
]);
```

然后检查：

Run: `tail -1 /Users/zac/work/arcblock/aigne-hub/benchmarks/data/samples.jsonl | python3 -m json.tool`

Expected: 格式化的 JSON，字段齐全

运行完后**清理掉测试样本**（或直接 `rm` 重建文件）：

Run: `rm /Users/zac/work/arcblock/aigne-hub/benchmarks/data/samples.jsonl`

- [ ] **Step 7: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add benchmarks/src/sample-store.ts benchmarks/src/index.ts \
  benchmarks/data/.gitkeep benchmarks/data/README.md benchmarks/.gitignore
git commit -m "feat(benchmarks): add JSONL sample store for persistent request data

Every benchmark request is now persisted as a sample in
benchmarks/data/samples.jsonl. Each sample includes run metadata
(runId, git commit, Hub URL), target info, and full BenchmarkResult
with serverTiming phases and token usage.

This enables cross-run analysis with jq/DuckDB without re-running
benchmarks, and ensures no measurement is wasted."
```

---

## Task 3: 多 Provider 对比 Benchmark

**Files:**
- Create: `benchmarks/src/multi-provider.ts`
- Modify: `benchmarks/package.json`

- [ ] **Step 1: 创建 multi-provider.ts**

创建 `benchmarks/src/multi-provider.ts`，结构参考已有的 `comparison.ts`，但覆盖多个 provider：

```typescript
import asciichart from 'asciichart';

import {
  BenchmarkResult,
  PAYLOADS,
  Target,
  aggregateServerTimings,
  computeStats,
  config,
  fmt,
  logErrors,
  printTable,
  runAndStore,
  saveReport,
  warmup,
} from './index.js';
import { createRunContext } from './sample-store.js';

// ── Provider Groups ──────────────────────────────────────────────────

interface ProviderGroup {
  provider: string;
  model: string;
  targets: Target[];
}

/**
 * Model selection criteria:
 * - Cheapest / fastest tier of each provider (we care about latency, not quality)
 * - Consistent "small model" class across providers for fair comparison
 * - OpenRouter uses a truly free model to avoid cost on throughput tests
 */
const MODELS = {
  openai: 'gpt-5-nano',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-oss-20b:free',
} as const;

function buildProviderGroups(): ProviderGroup[] {
  const groups: ProviderGroup[] = [];

  // OpenAI (gpt-5-nano)
  const openaiTargets: Target[] = [];
  if (config.openaiApiKey) {
    openaiTargets.push({
      name: 'openai-direct',
      url: 'https://api.openai.com/v1/chat/completions',
      key: config.openaiApiKey,
      model: MODELS.openai,
    });
  }
  if (config.comparisonHubAccessKey) {
    openaiTargets.push({
      name: 'hub-openai',
      url: `${config.comparisonHubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model: `openai/${MODELS.openai}`,
    });
  }
  if (openaiTargets.length >= 2) {
    groups.push({ provider: 'openai', model: MODELS.openai, targets: openaiTargets });
  }

  // Anthropic (claude-haiku-4-5)
  const anthropicTargets: Target[] = [];
  if (config.anthropicApiKey) {
    anthropicTargets.push({
      name: 'anthropic-direct',
      url: 'https://api.anthropic.com/v1/messages',
      key: config.anthropicApiKey,
      model: MODELS.anthropic,
    });
  }
  if (config.comparisonHubAccessKey) {
    anthropicTargets.push({
      name: 'hub-anthropic',
      url: `${config.comparisonHubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model: `anthropic/${MODELS.anthropic}`,
    });
  }
  if (anthropicTargets.length >= 2) {
    groups.push({ provider: 'anthropic', model: MODELS.anthropic, targets: anthropicTargets });
  }

  // Google Gemini (gemini-2.5-flash)
  const googleTargets: Target[] = [];
  if (config.googleApiKey) {
    googleTargets.push({
      name: 'google-direct',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.google}:generateContent`,
      key: config.googleApiKey,
      model: MODELS.google,
    });
  }
  if (config.comparisonHubAccessKey) {
    googleTargets.push({
      name: 'hub-google',
      url: `${config.comparisonHubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model: `google/${MODELS.google}`,
    });
  }
  if (googleTargets.length >= 2) {
    groups.push({ provider: 'google', model: MODELS.google, targets: googleTargets });
  }

  // OpenRouter (openai/gpt-oss-20b:free) — third-party reference
  // OpenRouter is a Hub-like proxy service; comparing against it tells us whether
  // our Hub overhead is in line with industry baselines or we have optimization room.
  const openrouterTargets: Target[] = [];
  if (config.openrouterApiKey) {
    openrouterTargets.push({
      name: 'openrouter-direct',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: config.openrouterApiKey,
      model: MODELS.openrouter,
    });
  }
  // Note: OpenRouter's free model may not be in Hub's catalog; add only if configured.
  if (config.comparisonHubAccessKey && process.env.HUB_HAS_OPENROUTER_MODEL === '1') {
    openrouterTargets.push({
      name: 'hub-openrouter',
      url: `${config.comparisonHubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model: MODELS.openrouter,
    });
  }
  if (openrouterTargets.length >= 1) {
    groups.push({ provider: 'openrouter', model: MODELS.openrouter, targets: openrouterTargets });
  }

  return groups;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Multi-Provider Comparison: Hub vs Direct');
  console.log('═══════════════════════════════════════════════════════════\n');

  const groups = buildProviderGroups();
  if (groups.length === 0) {
    console.log('No provider groups available. Need Hub access key + at least one provider API key.');
    console.log('Set: COMPARISON_HUB_ACCESS_KEY + (OPENAI_API_KEY | ANTHROPIC_API_KEY | GOOGLE_API_KEY)');
    process.exit(1);
  }

  console.log(`Providers: ${groups.map((g) => g.provider).join(', ')}`);

  const concurrency = 5;
  const duration = config.comparisonDuration;
  const payload = PAYLOADS.realistic;

  console.log(`Config: concurrency=${concurrency}, ${duration / 1000}s per target, realistic payload\n`);

  // Create RunContext — shared metadata for every sample in this run.
  const ctx = createRunContext('multi-provider', {
    hubBaseUrl: config.comparisonHubBaseUrl,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });
  console.log(`Run ID: ${ctx.runId}`);
  console.log(`Git: ${ctx.gitCommit ?? '(not in git repo)'}`);
  console.log(`Gateway: ${ctx.gatewayEnabled ? 'enabled' : 'disabled'}\n`);

  const reportData: any[] = [];
  const summary: Array<{ provider: string; directTtfb: number; hubTtfb: number; ratio: number; hubOverhead: number }> =
    [];

  for (const group of groups) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${group.provider} (${group.model})`);
    console.log(`${'─'.repeat(60)}`);

    // Warmup
    for (const target of group.targets) {
      await warmup(target, undefined, { messages: [...payload.messages], maxTokens: payload.maxTokens });
    }

    const results = new Map<string, { ttfb: ReturnType<typeof computeStats>; total: ReturnType<typeof computeStats>; rps: number; errors: number; samples: number }>();

    for (const target of group.targets) {
      process.stdout.write(`  ${target.name}...`);
      // runAndStore automatically persists each sample to data/samples.jsonl
      const { results: raw, elapsed } = await runAndStore(
        target,
        concurrency,
        duration,
        ctx,
        { provider: group.provider, stream: true, payload: 'realistic' },
        { messages: [...payload.messages], maxTokens: payload.maxTokens }
      );
      const ok = raw.filter((r) => !r.error);
      const stats = {
        ttfb: computeStats(ok.map((r) => r.ttfb)),
        total: computeStats(ok.map((r) => r.totalTime)),
        rps: ok.length / (elapsed / 1000),
        errors: raw.filter((r) => r.error).length,
        samples: ok.length,
      };
      results.set(target.name, stats);
      console.log(` ${ok.length} ok, ${stats.errors} err, TTFB p50=${fmt(stats.ttfb.p50)}`);
    }

    // Find direct and hub targets
    const directName = group.targets.find((t) => t.name.endsWith('-direct'))?.name;
    const hubName = group.targets.find((t) => t.name.startsWith('hub-'))?.name;

    if (directName && hubName) {
      const directStats = results.get(directName)!;
      const hubStats = results.get(hubName)!;
      const ratio = hubStats.ttfb.p50 / directStats.ttfb.p50;
      const overhead = hubStats.ttfb.p50 - directStats.ttfb.p50;
      summary.push({
        provider: group.provider,
        directTtfb: directStats.ttfb.p50,
        hubTtfb: hubStats.ttfb.p50,
        ratio,
        hubOverhead: overhead,
      });
    }

    reportData.push({ provider: group.provider, model: group.model, results: Object.fromEntries(results) });
  }

  // ── Cross-Provider Summary ───────────────────────────────────────
  if (summary.length > 0) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  Cross-Provider Summary (TTFB p50)');
    console.log(`${'═'.repeat(60)}`);

    printTable(
      ['Provider', 'Direct', 'Hub', 'Overhead', 'Ratio'],
      summary.map((s) => [
        s.provider,
        fmt(s.directTtfb),
        fmt(s.hubTtfb),
        `+${Math.round(s.hubOverhead)}ms`,
        `${s.ratio.toFixed(2)}x`,
      ])
    );

    const avgOverhead = summary.reduce((sum, s) => sum + s.hubOverhead, 0) / summary.length;
    const avgRatio = summary.reduce((sum, s) => sum + s.ratio, 0) / summary.length;
    console.log(`\n  Average Hub overhead: +${Math.round(avgOverhead)}ms (${avgRatio.toFixed(2)}x)`);

    // Decision helper
    console.log('\n  Decision Guidance:');
    if (avgOverhead < 50) {
      console.log('  -> Hub overhead < 50ms: negligible, keep Hub for billing benefits');
    } else if (avgOverhead < 200) {
      console.log('  -> Hub overhead 50-200ms: moderate, consider for latency-sensitive use cases');
    } else {
      console.log('  -> Hub overhead > 200ms: significant, investigate bottlenecks or consider direct path');
    }
  }

  saveReport('multi-provider', reportData);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 在 package.json 添加脚本**

在 `benchmarks/package.json` 的 `scripts` 中添加：

```json
"multi-provider": "tsx src/multi-provider.ts",
"billing-verify": "tsx src/billing-verify.ts"
```

- [ ] **Step 3: 运行确认脚本正常加载**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npx tsx src/multi-provider.ts 2>&1 | head -10`

Expected: 显示标题 + 提示缺少 API key（或正常运行）

- [ ] **Step 4: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add benchmarks/src/multi-provider.ts benchmarks/package.json
git commit -m "feat(benchmarks): add multi-provider comparison (OpenAI/Anthropic/Google)"
```

---

## Task 4: 记账验证工具函数

**Files:**
- Create: `benchmarks/src/billing-helpers.ts`

- [ ] **Step 1: 创建 billing-helpers.ts**

这个文件提供 D1 REST API 查询和 credits 计算验证工具：

```typescript
import { config } from './index.js';

// ── D1 REST API ──────────────────────────────────────────────────────

interface D1QueryResult {
  success: boolean;
  result: Array<{
    results: Record<string, unknown>[];
    meta: { changes: number; duration: number; rows_read: number };
  }>;
}

export async function queryD1(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  if (!config.d1AccountId || !config.d1DatabaseId || !config.d1ApiToken) {
    throw new Error('D1 config missing: set D1_ACCOUNT_ID, D1_DATABASE_ID, D1_API_TOKEN');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.d1AccountId}/d1/database/${config.d1DatabaseId}/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.d1ApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`D1 query failed: ${resp.status} ${text.substring(0, 200)}`);
  }

  const data = (await resp.json()) as D1QueryResult;
  return data.result?.[0]?.results ?? [];
}

// ── ModelCalls Queries ───────────────────────────────────────────────

export interface ModelCallRecord {
  id: string;
  providerId: string;
  model: string;
  status: string;
  totalUsage: number;
  credits: string;
  duration: string;
  userDid: string;
  requestId: string;
  ttfb: string;
  providerTtfb: string;
  createdAt: string;
}

/**
 * Get ModelCalls records created after a given timestamp.
 * Used to fetch records created during a benchmark run.
 */
export async function getModelCallsSince(since: string, limit = 500): Promise<ModelCallRecord[]> {
  const rows = await queryD1(
    `SELECT id, providerId, model, status, totalUsage, credits, duration, userDid, requestId, ttfb, providerTtfb, createdAt
     FROM ModelCalls
     WHERE createdAt >= ?
     ORDER BY createdAt ASC
     LIMIT ?`,
    [since, limit]
  );
  return rows as unknown as ModelCallRecord[];
}

/**
 * Get aggregate usage stats for a time window.
 */
export async function getUsageStatsSince(since: string): Promise<{
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalCredits: number;
  totalTokens: number;
  avgDuration: number;
  avgTtfb: number;
}> {
  const rows = await queryD1(
    `SELECT
       COUNT(*) as totalCalls,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCalls,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCalls,
       SUM(CAST(credits AS REAL)) as totalCredits,
       SUM(totalUsage) as totalTokens,
       AVG(CAST(duration AS REAL)) as avgDuration,
       AVG(CAST(ttfb AS REAL)) as avgTtfb
     FROM ModelCalls
     WHERE createdAt >= ?`,
    [since]
  );
  const row = rows[0] ?? {};
  return {
    totalCalls: Number(row.totalCalls ?? 0),
    successCalls: Number(row.successCalls ?? 0),
    failedCalls: Number(row.failedCalls ?? 0),
    totalCredits: Number(row.totalCredits ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
    avgDuration: Number(row.avgDuration ?? 0),
    avgTtfb: Number(row.avgTtfb ?? 0),
  };
}

// ── Billing Verification ─────────────────────────────────────────────

export interface BillingDiff {
  requestId: string;
  model: string;
  expectedTokens: number;
  actualTokens: number;
  tokenDiff: number;
  credits: number;
  status: 'match' | 'mismatch' | 'missing';
}

/**
 * Compare benchmark results (client-side observed usage) against D1 ModelCalls records.
 * Returns a diff report showing matches and mismatches.
 */
export function compareBillingRecords(
  benchmarkUsage: Array<{ requestId?: string; usage?: { totalTokens: number }; creditsUsed?: number }>,
  dbRecords: ModelCallRecord[]
): { diffs: BillingDiff[]; matchRate: number; summary: string } {
  const dbByRequestId = new Map(dbRecords.filter((r) => r.requestId).map((r) => [r.requestId, r]));

  const diffs: BillingDiff[] = [];
  let matches = 0;
  let mismatches = 0;
  let missing = 0;

  for (const bench of benchmarkUsage) {
    if (!bench.requestId) continue;

    const dbRecord = dbByRequestId.get(bench.requestId);
    if (!dbRecord) {
      diffs.push({
        requestId: bench.requestId,
        model: 'unknown',
        expectedTokens: bench.usage?.totalTokens ?? 0,
        actualTokens: 0,
        tokenDiff: bench.usage?.totalTokens ?? 0,
        credits: 0,
        status: 'missing',
      });
      missing++;
      continue;
    }

    const expectedTokens = bench.usage?.totalTokens ?? 0;
    const actualTokens = dbRecord.totalUsage;
    const diff = Math.abs(expectedTokens - actualTokens);
    // Allow 5% tolerance (provider may report slightly different counts)
    const isMatch = diff <= Math.max(expectedTokens * 0.05, 2);

    diffs.push({
      requestId: bench.requestId,
      model: dbRecord.model,
      expectedTokens,
      actualTokens,
      tokenDiff: actualTokens - expectedTokens,
      credits: parseFloat(dbRecord.credits),
      status: isMatch ? 'match' : 'mismatch',
    });

    if (isMatch) matches++;
    else mismatches++;
  }

  const total = matches + mismatches + missing;
  const matchRate = total > 0 ? (matches / total) * 100 : 0;

  const summary = [
    `Total: ${total} requests`,
    `Matches: ${matches} (${matchRate.toFixed(1)}%)`,
    `Mismatches: ${mismatches}`,
    `Missing from DB: ${missing}`,
  ].join(' | ');

  return { diffs, matchRate, summary };
}

// ── Report Formatting ────────────────────────────────────────────────

export function printBillingReport(
  title: string,
  diffs: BillingDiff[],
  stats: Awaited<ReturnType<typeof getUsageStatsSince>>
): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);

  console.log('\n  D1 Aggregate Stats:');
  console.log(`    Total calls:    ${stats.totalCalls}`);
  console.log(`    Success:        ${stats.successCalls}`);
  console.log(`    Failed:         ${stats.failedCalls}`);
  console.log(`    Total credits:  ${stats.totalCredits.toFixed(4)}`);
  console.log(`    Total tokens:   ${stats.totalTokens}`);
  console.log(`    Avg duration:   ${stats.avgDuration.toFixed(0)}ms`);
  console.log(`    Avg TTFB:       ${stats.avgTtfb.toFixed(0)}ms`);

  const mismatches = diffs.filter((d) => d.status !== 'match');
  if (mismatches.length > 0) {
    console.log(`\n  Mismatches (${mismatches.length}):`);
    for (const d of mismatches.slice(0, 10)) {
      console.log(
        `    [${d.status}] ${d.requestId}: expected=${d.expectedTokens} actual=${d.actualTokens} diff=${d.tokenDiff} credits=${d.credits}`
      );
    }
    if (mismatches.length > 10) {
      console.log(`    ... and ${mismatches.length - 10} more`);
    }
  } else {
    console.log('\n  All records match!');
  }
}
```

- [ ] **Step 2: 确认 TypeScript 编译通过**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npx tsx --eval "import './src/billing-helpers.js'" 2>&1`

Expected: 无报错（或只有运行时错误，不应有编译错误）

- [ ] **Step 3: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add benchmarks/src/billing-helpers.ts
git commit -m "feat(benchmarks): add billing verification helpers (D1 query + diff)"
```

---

## Task 5: 记账验证脚本

**Files:**
- Create: `benchmarks/src/billing-verify.ts`

- [ ] **Step 1: 创建 billing-verify.ts**

这是主要的记账验证脚本。流程：
1. 记录开始时间戳
2. 通过 Hub 发送 N 个请求（不同 model），捕获 usage
3. 等待 `billingVerifyDelay`（让 waitUntil 里的 D1 写入完成）
4. 查询 D1 对比

```typescript
import {
  BenchmarkResult,
  PAYLOADS,
  Target,
  config,
  fmt,
  printTable,
  warmup,
} from './index.js';
import {
  compareBillingRecords,
  getModelCallsSince,
  getUsageStatsSince,
  printBillingReport,
} from './billing-helpers.js';
import { appendSamples, buildSamples, createRunContext } from './sample-store.js';

// ── Config ───────────────────────────────────────────────────────────

/**
 * Cheap/fast models aligned with multi-provider.ts.
 * For billing verification we don't need many samples — we want to catch
 * systematic errors (missing records, wrong token counts, wrong rates).
 */
const BILLING_MODELS = [
  'openai/gpt-5-nano',
  'anthropic/claude-haiku-4-5',
  'google/gemini-2.5-flash',
];

/** 20 requests per model × 3 models = 60 total. Enough to catch ~5% error rate with high confidence. */
const REQUESTS_PER_MODEL = 20;

// ── Single request with usage capture ────────────────────────────────

async function sendRequest(
  target: Target,
  payload: { messages: Array<{ role: string; content: string }>; maxTokens: number }
): Promise<BenchmarkResult> {
  const body = {
    model: target.model,
    messages: payload.messages,
    max_tokens: payload.maxTokens,
    stream: false, // Non-streaming for easier usage parsing
  };

  const start = performance.now();
  const resp = await fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.key}`,
    },
    body: JSON.stringify(body),
  });

  const ttfb = performance.now() - start;
  const data = await resp.json() as any;
  const totalTime = performance.now() - start;

  const result: BenchmarkResult = {
    status: resp.status,
    ttfb,
    totalTime,
    streamingTime: 0,
    rateLimited: resp.status === 429,
    error: resp.status !== 200 ? `HTTP ${resp.status}: ${JSON.stringify(data?.error ?? '').substring(0, 100)}` : undefined,
  };

  if (data.usage) {
    result.usage = {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    };
  }

  // Capture request ID from response headers or body
  result.requestId = resp.headers.get('x-request-id') ?? data.id ?? undefined;

  // Capture credits from Hub-specific header
  const creditsHeader = resp.headers.get('x-credits-used');
  if (creditsHeader) {
    result.creditsUsed = parseFloat(creditsHeader);
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Billing Verification: Hub Accounting Accuracy');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!config.comparisonHubAccessKey) {
    console.log('Error: COMPARISON_HUB_ACCESS_KEY is required');
    process.exit(1);
  }

  if (!config.d1AccountId || !config.d1DatabaseId || !config.d1ApiToken) {
    console.log('Warning: D1 config missing. Will run requests but skip DB verification.');
    console.log('Set: D1_ACCOUNT_ID, D1_DATABASE_ID, D1_API_TOKEN for full verification.\n');
  }

  const hubBaseUrl = config.comparisonHubBaseUrl;
  const payload = { messages: PAYLOADS.realistic.messages, maxTokens: PAYLOADS.realistic.maxTokens };
  const startTime = new Date().toISOString();

  // Create RunContext — all samples in this run share this metadata.
  const ctx = createRunContext('billing-verify', {
    hubBaseUrl,
    gatewayEnabled: process.env.HUB_GATEWAY_ENABLED === '1',
  });

  console.log(`Run ID: ${ctx.runId}`);
  console.log(`Hub: ${hubBaseUrl}`);
  console.log(`Models: ${BILLING_MODELS.join(', ')}`);
  console.log(`Requests per model: ${REQUESTS_PER_MODEL}`);
  console.log(`Start time: ${startTime}\n`);

  // ── Phase 1: Send requests and capture usage ─────────────────────

  const allResults: Array<BenchmarkResult & { model: string }> = [];

  for (const model of BILLING_MODELS) {
    const target: Target = {
      name: `hub-${model.split('/')[0]}`,
      url: `${hubBaseUrl}/api/v2/chat/completions`,
      key: config.comparisonHubAccessKey,
      model,
    };

    console.log(`\n  Testing ${model}:`);

    // Warmup
    await warmup(target, undefined, { messages: [...payload.messages], maxTokens: payload.maxTokens });

    const modelResults: BenchmarkResult[] = [];
    for (let i = 0; i < REQUESTS_PER_MODEL; i++) {
      process.stdout.write(`    Request ${i + 1}/${REQUESTS_PER_MODEL}...`);
      const result = await sendRequest(target, payload);

      if (result.error) {
        console.log(` ERROR: ${result.error}`);
      } else {
        const tokens = result.usage?.totalTokens ?? '?';
        const credits = result.creditsUsed ?? '?';
        console.log(` OK (${fmt(result.ttfb)} TTFB, ${tokens} tokens, ${credits} credits)`);
      }

      allResults.push({ ...result, model });
      modelResults.push(result);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Persist samples for this model — every request is saved.
    const samples = buildSamples(modelResults, ctx, {
      target,
      provider: model.split('/')[0],
      concurrency: 1,
      stream: false,
      payload: 'realistic',
    });
    appendSamples(samples);
  }

  // ── Phase 2: Summary of client-side observed data ────────────────

  const successful = allResults.filter((r) => !r.error);
  const totalTokensObserved = successful.reduce((sum, r) => sum + (r.usage?.totalTokens ?? 0), 0);
  const totalCreditsObserved = successful.reduce((sum, r) => sum + (r.creditsUsed ?? 0), 0);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Client-Side Observed');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total requests:  ${allResults.length} (${successful.length} success)`);
  console.log(`  Total tokens:    ${totalTokensObserved}`);
  console.log(`  Total credits:   ${totalCreditsObserved.toFixed(4)}`);

  // Per-model breakdown
  const modelGroups = new Map<string, typeof allResults>();
  for (const r of successful) {
    const group = modelGroups.get(r.model) ?? [];
    group.push(r);
    modelGroups.set(r.model, group);
  }

  printTable(
    ['Model', 'Requests', 'Avg TTFB', 'Avg Tokens', 'Total Credits'],
    Array.from(modelGroups.entries()).map(([model, results]) => [
      model,
      String(results.length),
      fmt(results.reduce((sum, r) => sum + r.ttfb, 0) / results.length),
      String(Math.round(results.reduce((sum, r) => sum + (r.usage?.totalTokens ?? 0), 0) / results.length)),
      results.reduce((sum, r) => sum + (r.creditsUsed ?? 0), 0).toFixed(4),
    ])
  );

  // ── Phase 3: D1 verification ─────────────────────────────────────

  if (!config.d1AccountId || !config.d1DatabaseId || !config.d1ApiToken) {
    console.log('\n  Skipping D1 verification (no D1 config).');
    return;
  }

  const delay = config.billingVerifyDelay;
  console.log(`\n  Waiting ${delay / 1000}s for D1 writes to complete...`);
  await new Promise((r) => setTimeout(r, delay));

  const dbRecords = await getModelCallsSince(startTime);
  const dbStats = await getUsageStatsSince(startTime);
  const { diffs, matchRate, summary } = compareBillingRecords(successful, dbRecords);

  printBillingReport('D1 Billing Verification', diffs, dbStats);
  console.log(`\n  Verification: ${summary}`);

  // ── Phase 4: Gap analysis ────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  Gap Analysis: Client vs D1');
  console.log(`${'═'.repeat(60)}`);

  const dbTokens = dbStats.totalTokens;
  const tokenGap = Math.abs(totalTokensObserved - dbTokens);
  const tokenGapPct = totalTokensObserved > 0 ? (tokenGap / totalTokensObserved) * 100 : 0;

  console.log(`  Client tokens:  ${totalTokensObserved}`);
  console.log(`  D1 tokens:      ${dbTokens}`);
  console.log(`  Gap:            ${tokenGap} (${tokenGapPct.toFixed(1)}%)`);
  console.log(`  Match rate:     ${matchRate.toFixed(1)}%`);

  if (matchRate >= 95) {
    console.log('\n  PASS: Billing accuracy >= 95%');
  } else if (matchRate >= 80) {
    console.log('\n  WARN: Billing accuracy 80-95% — investigate D1 write delays');
  } else {
    console.log('\n  FAIL: Billing accuracy < 80% — billing system has issues');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 确认脚本编译通过**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npx tsx --eval "import './src/billing-verify.js'" 2>&1`

Expected: 编译成功，可能有运行时错误（缺少环境变量），但不应有类型错误

- [ ] **Step 3: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add benchmarks/src/billing-verify.ts
git commit -m "feat(benchmarks): add billing verification script (D1 + usage comparison)"
```

---

## Task 6: 环境变量文档

**Files:**
- Create: `benchmarks/.env.example`

- [ ] **Step 1: 创建 .env.example**

```bash
# ── Hub Configuration ──────────────────────────────────────────
HUB_BASE_URL=http://localhost:3030
COMPARISON_HUB_BASE_URL=https://aigne-hub-staging.arcblock.io
COMPARISON_HUB_ACCESS_KEY=your-hub-api-key

# ── Direct Provider API Keys (for comparison) ─────────────────
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...

# ── D1 REST API (for billing verification) ────────────────────
D1_ACCOUNT_ID=your-cf-account-id
D1_DATABASE_ID=your-d1-database-id
D1_API_TOKEN=your-cf-api-token

# ── Benchmark Settings ────────────────────────────────────────
COMPARISON_DURATION=30000
COMPARISON_CONCURRENCY_LEVELS=5,20,40
BILLING_VERIFY_DELAY=5000
TARGET_COOLDOWN=30000

# ── Proxy (optional, for regions that need it) ────────────────
# HTTPS_PROXY=http://127.0.0.1:7890
```

- [ ] **Step 2: 确认 .gitignore 包含 .env**

Run: `grep -q "^\.env$" /Users/zac/work/arcblock/aigne-hub/benchmarks/.gitignore && echo "OK" || echo "MISSING"`

Expected: "OK"（已有的 .gitignore 应该已经排除 .env）

- [ ] **Step 3: Commit**

```bash
cd /Users/zac/work/arcblock/aigne-hub
git add benchmarks/.env.example
git commit -m "docs(benchmarks): add .env.example with all benchmark config vars"
```

---

## Task 7: 端到端验证

**Files:**
- 无新文件，这是运行验证步骤

- [ ] **Step 1: 配置 .env**

复制 `.env.example` 到 `.env`，填入实际的 API key 和 D1 配置：

```bash
cd /Users/zac/work/arcblock/aigne-hub/benchmarks
cp .env.example .env
# 手动编辑 .env 填入实际值
```

- [ ] **Step 2: 安装依赖**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npm install`

Expected: 安装成功，无报错

- [ ] **Step 3: 运行 multi-provider 对比**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npm run multi-provider`

Expected: 显示每个 provider 的 Hub vs Direct TTFB 对比，以及 Cross-Provider Summary

记录关键数据：
- 每个 provider 的 Hub overhead（ms）
- Hub/Direct TTFB ratio
- 错误率

- [ ] **Step 4: 运行 billing-verify 验证记账**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npm run billing-verify`

Expected: 
- Phase 1: 每个 model 发送请求成功
- Phase 2: 显示 client-side observed tokens/credits
- Phase 3: D1 验证显示 match rate >= 95%
- Phase 4: Gap analysis 显示 token gap < 5%

- [ ] **Step 5: 运行原有 comparison benchmark 确认无 regression**

Run: `cd /Users/zac/work/arcblock/aigne-hub/benchmarks && npm run comparison`

Expected: 正常运行，输出与之前一致

---

## 决策矩阵

运行完 benchmark 后，用以下矩阵做决策：

| 指标 | 保留 Hub | 直连 + 轻量计费 | 直连 + CF Analytics |
|------|----------|----------------|-------------------|
| Hub overhead < 50ms | 推荐 | 不需要 | 不需要 |
| Hub overhead 50-200ms | 可接受 | 考虑 | 考虑 |
| Hub overhead > 200ms | 需优化 | 推荐 | 推荐 |
| 记账准确率 >= 95% | 当前方案 OK | N/A | N/A |
| 记账准确率 < 95% | 需修复 | 可能更好 | 看 CF 数据质量 |

**如果决定直连 API，记账替代方案：**
1. **CF AI Gateway Analytics** — 免费，有 request/token 统计，但粒度较粗（无 per-user breakdown）
2. **轻量计费 Worker** — 一个纯记账的 CF Worker，只做 token 计算 + D1 写入，不做代理
3. **客户端上报** — Agent 侧上报 usage，但不可信（可伪造）
