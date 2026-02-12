# AIGNE Hub Performance Benchmark Specification

## 1. Overview

- **Product**: AIGNE Hub 性能基准测试工具
- **Core Concept**: 自写 TypeScript benchmark，三部分测试覆盖对比/真实压测/隔离压测，用 fetch + ReadableStream 采集 TTFB/总耗时/Server-Timing
- **Priority**: High — 为 feat-performance 分支的性能优化提供数据支撑
- **Target User**: AIGNE Hub 开发者
- **Project Scope**: `benchmarks/` 目录

## 2. Architecture

### 2.1 项目结构

```
benchmarks/
├── src/
│   ├── index.ts            # 配置加载 + 公共类型/工具（benchmarkRequest、stats、Server-Timing 解析）
│   ├── comparison.ts       # Part 1: Hub vs 直连 vs OpenRouter 对比
│   ├── stress.ts           # Part 2: 真实场景并发压测
│   ├── isolation.ts        # Part 3: 隔离压测（Mock Provider，解析 Server-Timing）
│   └── mock-provider.ts    # 本地 OpenAI 兼容 Mock 服务
├── .env.example
├── package.json
└── tsconfig.json
```

- 三个入口是**独立命令**，分别运行
- `index.ts` 导出公共部分：配置加载、`benchmarkRequest()`、统计计算、Server-Timing 解析
- `mock-provider.ts` 是 Part 3 依赖的本地 mock 服务，由 `isolation.ts` 自动启动/关闭

### 2.2 三部分测试的定位

| 测试 | 目的 | 调用目标 | 核心指标 |
|------|------|----------|----------|
| **Part 1: Comparison** | Hub 实现有没有问题？与直连/OpenRouter 对比 | Direct API + OpenRouter + Hub | TTFB 差值、总耗时差值 |
| **Part 2: Stress** | 真实场景下 Hub 能撑多大并发 | Hub（真实 Provider） | RPS、TTFB 退化曲线、错误率 |
| **Part 3: Isolation** | Hub 自身有没有性能阻塞 | Hub（Mock Provider） | Server-Timing 各阶段、Hub overhead |

### 2.3 依赖

- `tsx` — 运行 TypeScript
- `dotenv` — 加载 .env
- `asciichart` — 终端 ASCII 折线图（~3kb，零依赖）

### 2.4 无 client 抽象

所有 provider（OpenAI、Gemini、OpenRouter、Hub）都走 OpenAI 兼容格式，唯一区别是 URL 和 key。用配置数组 + 一个通用 `benchmarkRequest()` 处理。

## 3. Detailed Behavior

### 3.1 benchmarkRequest() — 核心采集函数

```typescript
interface BenchmarkResult {
  status: number;
  ttfb: number;              // 首字节时间 (ms)
  totalTime: number;         // 总完成时间 (ms)
  streamingTime: number;     // streaming 耗时 = totalTime - ttfb
  serverTiming?: Record<string, number>;  // Hub 内部各阶段（仅非 streaming 可获取）
  error?: string;
  rateLimited: boolean;
}

interface RequestOptions {
  stream?: boolean;           // 默认 true
  messages?: Message[];       // 自定义 messages（用于不同 payload 大小）
  maxTokens?: number;
}

async function benchmarkRequest(target: Target, options?: RequestOptions): Promise<BenchmarkResult> {
  const start = performance.now();
  const stream = options?.stream ?? true;

  const response = await fetch(target.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.key}` },
    body: JSON.stringify({
      messages: options?.messages ?? [{ role: 'user', content: 'Say hello' }],
      model: target.model,
      stream,
      max_tokens: options?.maxTokens ?? 50,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  // Server-Timing 仅在非 streaming 模式下可用（streaming 时 headers 已在 flushHeaders 时发送）
  const serverTiming = !stream ? parseServerTiming(response.headers.get('Server-Timing')) : undefined;

  if (!stream) {
    await response.json();
    const totalTime = performance.now() - start;
    return { status: response.status, ttfb: totalTime, totalTime, streamingTime: 0, serverTiming, rateLimited: response.status === 429, error: response.ok ? undefined : `HTTP ${response.status}` };
  }

  let ttfb: number | undefined;
  const reader = response.body!.getReader();

  while (true) {
    const { done } = await reader.read();
    if (done) break;
    if (!ttfb) ttfb = performance.now() - start;
  }

  const totalTime = performance.now() - start;

  return {
    status: response.status,
    ttfb: ttfb ?? totalTime,
    totalTime,
    streamingTime: totalTime - (ttfb ?? totalTime),
    serverTiming,
    rateLimited: response.status === 429,
    error: response.ok ? undefined : `HTTP ${response.status}`,
  };
}
```

### 3.2 Warmup 机制

所有测试在正式采集前执行 warmup 请求，**不计入统计**。目的：
- 预热 DB 连接池
- 预热 Provider credential 缓存（`getProvidersForModel` 首次查询）
- 预热 Sequelize 查询编译（`ModelCall.create` 等）
- 建立 HTTP keep-alive 连接

```typescript
async function warmup(target: Target, count: number = 3): Promise<void> {
  console.log(`  Warming up ${target.name} (${count} requests)...`);
  for (let i = 0; i < count; i++) {
    await benchmarkRequest(target).catch(() => {});
  }
}
```

默认 3 次，通过 `WARMUP_COUNT` 配置。

### 3.3 统计计算

百分位数计算 + stddev/CV，放在 `index.ts` 里：

```typescript
interface MetricsResult {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  stddev: number;       // 标准差
  cv: number;           // 变异系数 (stddev / avg)，衡量稳定性
  samples: number;
}

function percentile(sorted: number[], p: number): number {
  const i = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, i)];
}

function computeStats(values: number[]): MetricsResult {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  return {
    min: sorted[0], max: sorted.at(-1)!,
    avg,
    p50: percentile(sorted, 50), p75: percentile(sorted, 75),
    p90: percentile(sorted, 90), p99: percentile(sorted, 99),
    stddev: Math.round(stddev * 100) / 100,
    cv: avg > 0 ? Math.round((stddev / avg) * 1000) / 1000 : 0,
    samples: values.length,
  };
}
```

CV（变异系数）说明：
- CV < 0.1 → 非常稳定
- CV 0.1~0.3 → 正常波动
- CV > 0.3 → 不稳定，需关注

### 3.4 Payload 变体

定义多种 payload 大小，用于不同测试场景：

```typescript
const PAYLOADS = {
  // 最小 payload，聚焦系统开销
  minimal: {
    messages: [{ role: 'user', content: 'Say hello' }],
    maxTokens: 50,
  },
  // 模拟真实对话（~2k tokens input）
  realistic: {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_1K },              // ~1k tokens 的 system prompt
      { role: 'user', content: 'What is the meaning of life?' },
      { role: 'assistant', content: ASSISTANT_REPLY_500 },         // ~500 tokens 的回复
      { role: 'user', content: 'Can you elaborate on that point?' },
    ],
    maxTokens: 200,
  },
  // 大 payload（~8k tokens input），包含 tool definitions
  large: {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_1K },
      ...CONVERSATION_HISTORY_6K,                                  // ~6k tokens 的多轮对话
      { role: 'user', content: 'Summarize our conversation' },
    ],
    maxTokens: 500,
    tools: TOOL_DEFINITIONS,                                       // 4-5 个 tool 定义
  },
} as const;
```

- Part 1 (Comparison): 使用 `minimal`（最小化变量，聚焦 overhead 对比）
- Part 2 (Stress): 使用 `minimal`（避免 token 费用过高）
- Part 3 (Isolation): 使用 `minimal` + `realistic` + `large` 三种（Mock 无费用，测试 Hub 对不同 payload 的处理开销）

### 3.5 Server-Timing 解析

```
Server-Timing: session;dur=12.3, maxProviderRetries;dur=2.1, ensureProvider;dur=5.0, modelCallCreate;dur=8.5, preChecks;dur=3.2, getCredentials;dur=28.1, ttfb;dur=0.5, streaming;dur=0.0, usage;dur=15.3, modelStatus;dur=6.2, total;dur=82.5
```

Hub 代码中实际记录的全部阶段（来自 `request-timing.ts` + 各 middleware）：

| Phase | 来源 | 说明 |
|-------|------|------|
| `session` | v2.ts:89 | Session / AccessKey 验证 |
| `maxProviderRetries` | model-call-tracker.ts:63 | 查询可用 provider 列表 |
| `ensureProvider` | model-call-tracker.ts:109 | 确保 model 有对应 provider |
| `modelCallCreate` | model-call-tracker.ts:153 | DB 写入 ModelCall 记录 |
| `preChecks` | v2.ts:222 | Credit 余额检查 + ModelRate 检查 |
| `getCredentials` | v2.ts:278 / ai-routes.ts:278 | 获取实际 AI 凭证并初始化 client |
| `ttfb` | ai-routes.ts:298 | 等待 provider 首 chunk（Mock 下 ≈0） |
| `streaming` | ai-routes.ts:304 | 流式传输阶段（Mock 下 ≈0） |
| `usage` | v2.ts:232 | 创建 usage 记录 + ModelCall.update |
| `modelStatus` | status.ts:361 | 更新模型状态 + credential 恢复 |
| `total` | request-timing.ts:84 | 请求总耗时 |

解析函数（~10 行正则），放在 `index.ts` 里。

### 3.6 错误处理

- **429**: 记录，不重试，纳入统计
- **5xx / 网络错误 / 超时**: 记录，纳入失败率统计
- 所有错误不中断后续测试

---

## 4. Part 1: Comparison — Hub vs 直连 vs OpenRouter

**目的**: 分析 AIGNE Hub 的实现有没有问题——与直连 provider 和 OpenRouter 对比，量化 Hub 代理层引入的额外延迟

**核心指标**: TTFB 为主（Hub 开销全在首字节前），总耗时为辅

**测试目标**:
```typescript
const targets = [
  { name: 'openai-direct',    url: 'https://api.openai.com/v1/chat/completions',                          key: OPENAI_KEY,     model: 'gpt-4o-mini' },
  { name: 'openrouter',       url: 'https://openrouter.ai/api/v1/chat/completions',                       key: OPENROUTER_KEY, model: 'openai/gpt-4o-mini' },
  { name: 'hub-openai',       url: `${HUB_URL}/api/v2/chat/completions`,                                  key: HUB_KEY,        model: 'openai/gpt-4o-mini' },
  { name: 'gemini-direct',    url: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',   key: GEMINI_KEY,     model: 'gemini-2.0-flash' },
  { name: 'hub-gemini',       url: `${HUB_URL}/api/v2/chat/completions`,                                  key: HUB_KEY,        model: 'google/gemini-2.0-flash' },
];
```

**执行流程**:
1. Warmup 所有 targets（每个 3 次）
2. 按模型分组（如 gpt-4o-mini 组 = openai-direct + openrouter + hub-openai）
3. 每组内交替执行请求 N 次（默认 10 次）
4. 使用 `minimal` payload，streaming 模式

**输出**:
```
Warmup: 3 requests per target (not counted)...

┌─ gpt-4o-mini ──────────────────────────────────────────────────────────────┐
│              │  Direct    │  OpenRouter │  Hub       │  Hub Overhead        │
│  TTFB (p50)  │  320ms     │  355ms      │  365ms     │  +45ms (+14.1%)     │
│  TTFB (p90)  │  450ms     │  500ms      │  510ms     │  +60ms (+13.3%)     │
│  Total (p50) │  1250ms    │  1300ms     │  1310ms    │  +60ms (+4.8%)      │
│  stddev      │  42ms      │  58ms       │  55ms      │                     │
│  CV          │  0.12      │  0.15       │  0.14      │                     │
│  samples     │  10        │  10         │  10        │                     │
└────────────────────────────────────────────────────────────────────────────┘
  → hub is 1.14x slower in TTFB vs direct, comparable to openrouter (+10ms)

┌─ gemini-2.0-flash ─── (同上格式) ──────────────────────────────────────────┐
```

**分析价值**: 如果 Hub overhead 与 OpenRouter 接近 → 实现合理；如果远大于 OpenRouter → 需要排查

---

## 5. Part 2: Stress — 真实场景并发压测

**目的**: 模拟真实使用场景下 Hub 能撑多大并发，找到性能拐点

**策略**: 阶梯式加压，每档持续 15 秒
```
并发数:  1 → 5 → 10 → 25 → 50
每档持续: 15秒
总耗时: ~75秒（不含 warmup）
```

高并发档位（100、200）通过 .env 的 `STRESS_CONCURRENCY_LEVELS` 配置。

**执行流程**:
1. Warmup Hub target（3 次）
2. 对每个并发档位：
   - 启动 N 个 worker 并发循环请求
   - 持续 STRESS_DURATION 毫秒
   - 收集所有结果
3. 使用 `minimal` payload，streaming 模式

**执行逻辑**:
```typescript
for (const concurrency of levels) {
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

  const workers = Array(concurrency).fill(null).map(async () => {
    while (Date.now() - startTime < STRESS_DURATION) {
      results.push(await benchmarkRequest(hubTarget));
    }
  });

  await Promise.all(workers);
  printStressRow(concurrency, results);
}
```

**每档输出**:
```
┌─────────────┬───────┬──────────┬──────────┬──────────┬────────┬──────┬──────┐
│ Concurrency │  RPS  │ TTFB p50 │ TTFB p90 │ TTFB p99 │ stddev │ Err% │ 429s │
├─────────────┼───────┼──────────┼──────────┼──────────┼────────┼──────┼──────┤
│           1 │  0.8  │   350ms  │   450ms  │   580ms  │  45ms  │   0% │    0 │
│           5 │  3.2  │   380ms  │   520ms  │   620ms  │  62ms  │   0% │    0 │
│          10 │  5.8  │   420ms  │   600ms  │   750ms  │  85ms  │   0% │    0 │
│          25 │  9.5  │   680ms  │  1100ms  │  1500ms  │ 210ms  │   3% │    5 │
│          50 │ 12.1  │   920ms  │  1800ms  │  2500ms  │ 380ms  │   8% │   15 │
└─────────────┴───────┴──────────┴──────────┴──────────┴────────┴──────┴──────┘
```

压测后用 asciichart 绘制 TTFB p50 趋势折线图。

---

## 6. Part 3: Isolation — 隔离压测（Mock Provider + Server-Timing）

**目的**: 排除 Provider 延迟干扰，只测 Hub 自身管线的性能。通过 Mock Provider 让 AI 调用耗时 ≈0，所有可观测延迟都来自 Hub 代码（middleware、DB 操作、鉴权等）。**只在这部分解析 Server-Timing。**

### 6.1 Mock Provider

本地启动一个轻量 HTTP 服务，实现 OpenAI 兼容的 `/v1/chat/completions`：

```typescript
// mock-provider.ts
import { createServer } from 'http';

const MOCK_PORT = 9876;

// 非 streaming 响应
function jsonResponse() {
  return JSON.stringify({
    id: 'mock-001',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  });
}

// streaming 响应
function streamResponse() {
  const chunk1 = `data: ${JSON.stringify({ id: 'mock-001', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello!' }, finish_reason: null }] })}\n\n`;
  const chunk2 = `data: ${JSON.stringify({ id: 'mock-001', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\n`;
  const done = 'data: [DONE]\n\n';
  return [chunk1, chunk2, done];
}

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body);
    if (parsed.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const chunk of streamResponse()) res.write(chunk);
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(jsonResponse());
    }
  });
});

export function startMockProvider(): Promise<void> { /* listen on MOCK_PORT */ }
export function stopMockProvider(): Promise<void> { /* close server */ }
```

**前置条件**: Hub 需要配置一个 provider 指向 `http://localhost:9876/v1`，使用任意 credential。这是手动步骤，在 .env.example 中说明。

### 6.2 测试策略

**使用非 streaming 模式**采集 Server-Timing（streaming 下 `res.flushHeaders()` 导致 Server-Timing header 不可用）。

Mock 响应接近即时，所以 Server-Timing 中的 `ttfb`、`streaming` 阶段 ≈0ms，其余阶段的值就是 Hub 自身开销。

**三种 payload 都测**（Mock 无费用）：

```typescript
for (const [payloadName, payload] of Object.entries(PAYLOADS)) {
  console.log(`\n--- Payload: ${payloadName} ---`);

  await warmup(mockHubTarget, 3);

  for (const concurrency of levels) {
    const results = await runConcurrent(mockHubTarget, concurrency, ISOLATION_DURATION, {
      stream: false,  // 非 streaming 以获取 Server-Timing
      ...payload,
    });
    printIsolationRow(concurrency, results);
  }
}
```

**并发档位**: `1 → 5 → 10 → 25 → 50 → 100 → 200`（Mock 无 rate limit，可以推到更高）

每档持续 10 秒（Mock 响应快，10 秒能采集大量样本）。

### 6.3 输出

**每档输出**:
```
--- Payload: minimal ---
┌─────────────┬───────┬──────────┬──────────┬──────────┬────────┬──────┐
│ Concurrency │  RPS  │ Resp p50 │ Resp p90 │ Resp p99 │ stddev │ Err% │
├─────────────┼───────┼──────────┼──────────┼──────────┼────────┼──────┤
│           1 │  45   │    22ms  │    28ms  │    35ms  │   4ms  │   0% │
│           5 │ 180   │    27ms  │    38ms  │    52ms  │   8ms  │   0% │
│          10 │ 320   │    31ms  │    45ms  │    65ms  │  11ms  │   0% │
│          25 │ 550   │    45ms  │    72ms  │   110ms  │  18ms  │   0% │
│          50 │ 680   │    73ms  │   120ms  │   200ms  │  35ms  │   0% │
│         100 │ 750   │   130ms  │   220ms  │   380ms  │  65ms  │   1% │
│         200 │ 720   │   275ms  │   450ms  │   680ms  │ 120ms  │   5% │
└─────────────┴───────┴──────────┴──────────┴──────────┴────────┴──────┘
```

**Server-Timing 阶段细分（p50）**:
```
┌─ Server-Timing Breakdown (concurrency=1, payload=minimal) ──────────────────────┐
│ Phase              │  p50   │  p90   │  p99   │  % of total │                    │
├────────────────────┼────────┼────────┼────────┼─────────────┤                    │
│ session            │  3.2ms │  4.1ms │  5.8ms │   14.5%     │ ████▍              │
│ maxProviderRetries │  1.5ms │  2.0ms │  3.1ms │    6.8%     │ ██                 │
│ ensureProvider     │  1.8ms │  2.5ms │  4.0ms │    8.2%     │ ██▍                │
│ modelCallCreate    │  5.2ms │  7.8ms │ 12.0ms │   23.6%     │ ███████            │
│ preChecks          │  2.1ms │  3.0ms │  5.5ms │    9.5%     │ ██▊                │
│ getCredentials     │  4.5ms │  6.2ms │  9.8ms │   20.5%     │ ██████             │
│ ttfb               │  0.1ms │  0.2ms │  0.3ms │    0.5%     │                    │
│ streaming          │  0.0ms │  0.0ms │  0.1ms │    0.0%     │                    │
│ usage              │  2.8ms │  4.5ms │  8.2ms │   12.7%     │ ███▊               │
│ modelStatus        │  0.8ms │  1.2ms │  2.5ms │    3.6%     │ █                  │
│ total              │ 22.0ms │ 28.0ms │ 35.0ms │  100.0%     │                    │
└────────────────────┴────────┴────────┴────────┴─────────────┴────────────────────┘
  → Top 3 bottlenecks: modelCallCreate (23.6%), getCredentials (20.5%), session (14.5%)
```

**不同 payload 大小对比**:
```
┌─ Payload Size Impact (concurrency=10) ──────────────────────────────┐
│ Payload   │  Resp p50 │  Resp p90 │ RPS  │ vs minimal              │
├───────────┼───────────┼───────────┼──────┼─────────────────────────┤
│ minimal   │    31ms   │    45ms   │  320 │  baseline               │
│ realistic │    38ms   │    55ms   │  260 │  +22.6%                 │
│ large     │    52ms   │    78ms   │  190 │  +67.7%                 │
└───────────┴───────────┴───────────┴──────┴─────────────────────────┘
```

压测后用 asciichart 绘制：
1. TTFB p50 vs 并发数 趋势图（每种 payload 一条线）
2. RPS vs 并发数 趋势图

---

## 7. Configuration

### .env

```bash
# AIGNE Hub
HUB_BASE_URL=http://localhost:3030
HUB_ACCESS_KEY=ak_xxxx

# 直连 API Keys
OPENAI_API_KEY=sk-xxxx
GEMINI_API_KEY=xxxx
OPENROUTER_API_KEY=sk-or-xxxx

# Mock Provider（Part 3 隔离测试用）
# 需要在 Hub 中配置一个 provider 指向此地址
MOCK_PROVIDER_PORT=9876
MOCK_HUB_MODEL=mock/gpt-4o-mini           # Hub 中配置的 mock provider 对应的 model 名

# 测试参数（可选，有默认值）
WARMUP_COUNT=3                              # warmup 请求次数
COMPARISON_ITERATIONS=10                    # Part 1 每组迭代次数
STRESS_DURATION=15000                       # Part 2 每档持续时间（ms）
STRESS_CONCURRENCY_LEVELS=1,5,10,25,50      # Part 2 并发档位
ISOLATION_DURATION=10000                    # Part 3 每档持续时间（ms）
ISOLATION_CONCURRENCY_LEVELS=1,5,10,25,50,100,200  # Part 3 并发档位
REQUEST_TIMEOUT=60000                       # 请求超时（ms）
```

### 运行方式

```bash
# Part 1: 对比测试
npx tsx benchmarks/src/comparison.ts

# Part 2: 真实压测
npx tsx benchmarks/src/stress.ts

# Part 3: 隔离压测（自动启动/关闭 mock provider）
npx tsx benchmarks/src/isolation.ts
```

无 CLI 参数解析，全部通过 .env 配置。

---

## 8. JSON 报告

三个入口都在执行结束后输出 JSON 到 `benchmarks/results/` 目录：

```typescript
interface BenchmarkReport {
  timestamp: string;
  type: 'comparison' | 'stress' | 'isolation';
  config: Record<string, any>;
  results: any;
}
```

---

## 9. Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 测试结构 | 三部分（对比 / 真实压测 / 隔离压测） | 各有明确目的，互相补充 |
| 文件结构 | 5 个源文件 | index + 3 入口 + mock |
| Server-Timing | 仅在 Part 3 非 streaming 下解析 | streaming 时 flushHeaders 导致 header 不可用 |
| Mock Provider | 本地 HTTP 服务，OpenAI 兼容 | 排除 provider 延迟，隔离 Hub 开销 |
| Warmup | 所有测试前 3 次 warmup | 避免冷启动偏差（DB 连接池、缓存） |
| 统计指标 | p50/p75/p90/p99 + stddev + CV | CV 衡量稳定性，比单纯百分位更有信息量 |
| Payload 变体 | minimal / realistic / large | Part 3 覆盖不同大小，发现 body parsing/validation 瓶颈 |
| OpenRouter 对比 | 纳入 Part 1 | 作为"另一个代理层"的参照，判断 Hub overhead 是否合理 |
| Part 3 并发上限 | 200 | Mock 无 rate limit，可推到更高 |
| Comparison 迭代 | 10 次 | 5 次 p99 无意义，10 次可提供更可靠的统计 |
| Client | Node.js 原生 fetch | 与 Hub 调用方式一致 |
| 配置 | 纯 .env | 无 CLI 参数解析 |
| 图表 | asciichart | ~3kb 零依赖 |

---

## 10. MVP Scope

### Included
- Part 1: Hub vs Direct vs OpenRouter TTFB 对比（streaming）
- Part 2: 阶梯式真实并发压测（streaming）
- Part 3: 隔离压测 + Server-Timing 全阶段分析 + 多 payload 大小（非 streaming）
- Warmup 机制
- p50/p90/p99 + stddev + CV 统计
- 对比表格 + 压测表格 + Server-Timing breakdown + asciichart 趋势图 + JSON

### Excluded (Phase 2)
- Embedding / Image / Audio 接口
- HTML 报告
- 历史趋势对比
- CI/CD 集成
- Provider retry 路径测试

---

## 11. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider rate limit | Part 1/2 高并发多 429 | 记录事件，报告中标注 |
| API 费用 | Part 1/2 调用消耗 token | gpt-4o-mini + 短 prompt + 限制迭代 |
| 网络波动 | Part 1/2 数据不稳定 | 多次迭代 + 百分位统计 + CV |
| Mock 与真实 Provider 行为差异 | Part 3 不能反映真实 streaming 行为 | Part 3 只关注 Hub overhead，不关注 streaming |
| 429 副作用影响后续请求 | Hub 内部 credential 降权，影响后续测试 | Part 2 压测注意观察 429 分布 |

---

## 12. Open Items

- [ ] 确认 Gemini 直连 OpenAI 兼容 endpoint 是否可用
- [ ] 选择 OpenRouter 测试的具体模型（应与直连模型一致以便对比）
- [ ] 确认 Hub accessKey 的传递方式（Authorization: Bearer?）
- [ ] 在 Hub 中配置 mock provider 指向 localhost:9876 的具体步骤
