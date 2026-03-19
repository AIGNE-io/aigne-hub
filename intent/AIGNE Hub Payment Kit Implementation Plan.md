# AIGNE Hub & Payment Kit 实施计划


## 执行摘要

AIGNE Hub（ai-kit）作为 AI Provider Hub 平台，已具备 11 个 AI 提供商统一接入、基于 Credit 的计费系统、V2 API 性能优化（RPS >= 100）、Dashboard + Project Detail 等核心能力。Payment Kit 作为支付底盘，已实现完整的支付基础设施，包括 Stripe/ArcBlock/EVM 三通道、动态定价（Quote Final Freeze）、Credit 计量消费管道、数据归档等。

当前阶段核心目标：在已有功能基础上，提升 **计费精确性**、**性能可观测性** 和 **快速响应 AI 行业变化的能力**。

---

## 规划总览

### 推荐执行顺序

> **原则**: 先可观测、再优化（有前后对比数据）、安全项前置。

1. **可观测与基线**（先做）: Task 18 → Task 3 → Task 4/5
2. **性能优化**（有数据后做）: Task 1/2（有前后对比数据）
3. **安全项前置**: Task 6 提前到第一阶段靠前位置
4. **费率链路**: Task 7（拉取）→ Task 8（history 持久化 + cron+告警）→ Task 9（Skill）
5. **其余任务**按依赖关系灵活安排

### 第一阶段：计费精确性 + 性能基线

| # | 任务 | 仓库 | 核心价值 | 风险 |
|---|------|------|---------|------|
| 1 | Credit 消费队列并发度提升 | payment-kit | 消除全局串行瓶颈，concurrency 1→5 | 中 |
| 2 | 减少单次消费 DB 操作 | payment-kit | 降低单次处理延迟，19-25次→优化4处 | 中 |
| 3 | Payment Kit Benchmark 框架搭建 | payment-kit | 建立性能度量基础，复用 ai-kit 70% 工具 | 低 |
| 4 | Meter Event 摄入压测 | payment-kit | 获取摄入 RPS baseline | 低 |
| 5 | Credit 消费管道压测 | payment-kit | 获取消费吞吐 baseline | 低 |
| 6 | Delegation 校验补全 | payment-kit | 支付安全，补全 4 个缺失校验 | 高 |

### 第二阶段：费率同步 + 财务可见性

| # | 任务 | 仓库 | 核心价值 | 风险 |
|---|------|------|---------|------|
| 7 | 接入 OpenRouter Pricing API | ai-kit | 第二数据源，交叉验证费率准确性 | 低 |
| 8 | 费率变更检测与告警 | ai-kit | 自动化监控，6h 周期检测 + 告警 | 低 |
| 9 | model-pricing-analyzer Skill | ai-kit | Agent 辅助费率分析，覆盖无 API 的 Provider | 低 |
| 10 | 真实成本记录 + 财务仪表盘 | ai-kit | 收入/成本/利润可视化 | 中 |
| 11 | ModelCall TTFB 持久化 | ai-kit | 性能可观测性，趋势分析 | 低 |
| 12 | 端到端延迟测量 + Throttle 评估 | 双仓库 | 量化计费延迟，优化超额风险窗口 | 低 |

### 第三阶段：能力扩展 + 体验优化

| # | 任务 | 仓库 | 核心价值 | 风险 |
|---|------|------|---------|------|
| 13 | WebSocket 代理支持 | ai-kit | 支持 OpenAI Realtime API | 高 |
| 14 | 各档位定价支持 | ai-kit | batch/realtime 差异化定价 | 中 |
| 15 | UX 优化（支付切换/退款/文案） | payment-kit | 用户体验提升 | 低 |
| 16 | Meter Events 查询性能 | payment-kit | N+1 修复 + JSON 字段索引优化 | 中 |
| 17 | 音频 API 计费 | ai-kit | 开放音频 API 前置条件 | 中 |
| 18 | Payment Kit Server-Timing | payment-kit | 性能埋点，支撑 Benchmark | 低 |
| 19 | 模型定价盈亏验证测试 | ai-kit | 逐模型逐场景验证不亏损 | 中 |

### 依赖关系

```
推荐执行顺序（先观测 → 再优化 → 安全前置）:

任务 18 (Server-Timing) ──┐
                           ├── 任务 3 (Benchmark 框架) ── 任务 4,5 (压测)
任务 6 (Delegation) ────── 安全项前置（注: 须先完成 DelegationUsage 数据源决策）
任务 1,2 (优化) ──────── 压测后做（有前后对比）── 任务 12 (E2E + Throttle)
任务 7 (OpenRouter) ──── 任务 8 (history 持久化 → cron+告警) ── 任务 9 (Skill)
任务 10 ── 任务 19 (盈亏验证) 依赖
任务 11 ── 独立
任务 13-17 ── 大多独立，按优先级灵活安排
```

**隐性前置条件汇总**:
- 任务 6: 须先定"已用次数/已用总额"数据源（链上索引 or 本地账本），见详细章节
- 任务 13: 须避免与现有 `/websocket`（`ws.ts`）路径/职责冲突
- 任务 14: SQLite 不支持直接改 UNIQUE 约束，须用重建表方式迁移
- 任务 17: 须先解决"可计费单位来源"（转写时长无法从 proxy 直通模式获取）
- 任务 19: Provider 不返回 usage 时的估算策略须先定义（尤其图片 token 估算）；费率数据源优先级须明确

**共 19 个任务** | 涉及 2 个仓库

---

## 目录

- [推荐执行顺序](#推荐执行顺序)
- [第一阶段：计费精确性 + 性能基线（详细）](#第一阶段计费精确性--性能基线详细)
- [第二阶段：费率同步 + 财务可见性（详细）](#第二阶段费率同步--财务可见性详细)
- [第三阶段：能力扩展 + 体验优化（详细）](#第三阶段能力扩展--体验优化详细)
- [附录：代码分析发现](#附录代码分析发现)
- [验收标准模板](#验收标准模板)

---

## 第一阶段：计费精确性 + 性能基线（详细）

### 任务 1: Credit 消费队列并发度提升

**仓库**: payment-kit
**文件**: `blocklets/core/api/src/queues/credit-consume.ts:643-651`
**风险**: 中

#### 现状分析

```typescript
// credit-consume.ts:643-651 — 当前配置
export const creditQueue = createQueue<CreditConsumptionJob>({
  name: 'credit-consumption',
  onJob: handleCreditConsumption,
  options: {
    concurrency: 1,              // ← 全局串行，所有用户排队
    maxRetries: 0,
    enableScheduledJob: true,
  },
});
```

队列基于 `fastq`（内存异步队列）+ DB 持久层（`Job` 模型）。`concurrency: 1` 导致不同用户的 credit 消费也必须排队。但 `handleCreditConsumption` 内部已有 per-customer 锁：

```typescript
// credit-consume.ts:490+ — 已有 per-customer lock
const lock = getLock(`credit-consumption-customer-${customerId}`);
await lock.acquire();
try {
  // ... consume credits ...
} finally {
  lock.release();
}
```

Lock 实现（`libs/lock.ts`）基于内存 `Map<string, Lock>` + EventEmitter，确保同一 customer 的消费串行化。

#### 实施步骤

1. **修改 concurrency 配置**
   - 文件: `credit-consume.ts:647`
   - 将 `concurrency: 1` 改为 `concurrency: 5`
   - 建议通过环境变量控制: `parseInt(process.env.CREDIT_QUEUE_CONCURRENCY || '5', 10)`

2. **验证 Lock 机制在并发下的正确性**
   - `libs/lock.ts` 当前实现有 "thundering herd" 问题：`release()` 时所有等待者都被唤醒，但只有一个能获得锁
   - 当 concurrency > 1 时，同一 customer 的多个 job 可能同时到达 `lock.acquire()`
   - **需确认**: EventEmitter 默认 maxListeners = 10，高并发单客户场景可能触发 `MaxListenersExceededWarning`
   - 建议在 Lock 构造函数中增加 `this.events.setMaxListeners(50)`

3. **增加 concurrency 上限保护**
   - 添加范围校验: `Math.min(Math.max(concurrency, 1), 20)`

4. **测试场景**
   - 多个不同 customer 的 meter event 同时消费 → 应并行处理
   - 同一 customer 的多个 meter event → 应串行（lock 保护）
   - Lock release 时多个等待者 → 只有一个应获得锁

#### 关注点

- Lock 是进程内的，多副本部署时同一 customer 可能在不同实例上并发消费，这是已知限制
- `retryFailedEventsForCustomer` 也使用独立锁 `retry-failed-events-${customerId}-${currencyId}`，不受影响

---

### 任务 2: 减少单次消费 DB 操作

**仓库**: payment-kit
**风险**: 中
#### 2a: 并行化 validateAndLoadData 中的独立查询

**文件**: `credit-consume.ts:81-171`

```typescript
// 当前：顺序执行
const meterEvent = await MeterEvent.findByPk(meterEventId);       // DB 1
const meter = await Meter.findOne({ where: { event_name } });      // DB 2
const customer = await Customer.findByPk(customerId);              // DB 3
const subscription = await Subscription.findByPk(subscriptionId);  // DB 4
```

**改为**:
```typescript
// meter / customer / subscription 三个查询相互独立（都只依赖 meterEvent 的字段）
const [meter, customer, subscription] = await Promise.all([
  Meter.findOne({ where: { event_name: meterEvent.event_name } }),
  Customer.findByPk(meterEvent.payload.customer_id),
  meterEvent.payload.subscription_id
    ? Subscription.findByPk(meterEvent.payload.subscription_id)
    : Promise.resolve(null),
]);
```

**注意**: meterEvent 必须先查出来（后续查询依赖它的字段），所以第一个查询不能并行。

预估节省: 2 次 DB 往返延迟（约 2-4ms per query on SQLite）。

#### 2b: 优化 checkAndTriggerAutoRecharge 的无条件查询

**文件**: `auto-recharge.ts:593-681`

```typescript
// 当前：每次消费后都执行 3 次 DB 查询，即使用户未配置 auto-recharge
export async function checkAndTriggerAutoRecharge(customer, currencyId, currentBalance) {
  const meter = await Meter.findOne({ where: { currency_id: currencyId } });  // DB 1
  if (meter?.status === 'inactive') return;

  const config = await AutoRechargeConfig.findOne({                           // DB 2
    where: { customer_id: customer.id, currency_id: currencyId, enabled: true },
  });
  if (!config) return;  // ← 大多数用户在这里返回，前两次查询浪费了

  if (new BN(currentBalance).gte(new BN(config.threshold))) return;
  // ... push to autoRechargeQueue
}
```

**优化方案**:
1. **快速判断**: 先查 `AutoRechargeConfig`（通常不存在），不存在则跳过 meter 查询
2. **并行化**: meter 和 config 查询相互独立，改为 `Promise.all`

```typescript
export async function checkAndTriggerAutoRecharge(customer, currencyId, currentBalance) {
  const [meter, config] = await Promise.all([
    Meter.findOne({ where: { currency_id: currencyId } }),
    AutoRechargeConfig.findOne({
      where: { customer_id: customer.id, currency_id: currencyId, enabled: true },
    }),
  ]);

  if (!config || meter?.status === 'inactive') return;
  if (new BN(currentBalance).gte(new BN(config.threshold))) return;
  // ... push to autoRechargeQueue
}
```

或更激进的优化：为 `AutoRechargeConfig` 加一个 LRU 缓存（TTL=5min），大多数请求变成内存查找。

#### 2c: 减少 Audit Event 写放大

**文件**: `credit-grant.ts:265,317`、`credit-transaction.ts:129`、`audit.ts`

当前每次 grant 消费会产生:
- `customer.credit_grant.updated` — afterUpdate hook（`credit-grant.ts`）
- `customer.credit_grant.consumed` — 在 consumeCredit 中手动触发
- `customer.credit_grant.depleted` — 如果余额归零，afterUpdate hook 中触发
- `customer.credit_transaction.created` — afterCreate hook

N 个 grant 消费 → 2N-3N 条 Event 记录，每条都是独立的 `Event.create()`。

**优化方案**:
1. 在 `handleCreditConsumption` 中收集所有 audit events
2. 消费循环结束后批量写入: `Event.bulkCreate(collectedEvents)`
3. 需要修改 `createEvent` 支持 deferred 模式（返回 event 数据但不立即写入）
4. **风险**: 批量写入后再发 event bus 事件，时序可能与现有 webhook 消费者预期不同

#### 2d: 消除冗余 MeterEvent 查询

**文件**: `credit-consume.ts:664-719`

```typescript
// addCreditConsumptionJob 中重新查询了 MeterEvent
const meterEvent = await MeterEvent.findByPk(meterEventId);  // ← 冗余
if (!meterEvent || ['completed', 'canceled'].includes(meterEvent.status)) return;
```

在 `afterCreate` hook 触发时，MeterEvent 实例已在内存中。优化:

```typescript
// 在 events.on('billing.meter_event.created') 回调中直接传递 status
events.on('billing.meter_event.created', (meterEvent) => {
  // 直接使用 meterEvent.status 判断，跳过 DB 查询
  if (['completed', 'canceled'].includes(meterEvent.status)) return;
  creditQueue.push({
    id: `meter-event-${meterEvent.id}`,
    job: { meterEventId: meterEvent.id },
  });
});
```

**注意**: 只能优化 `afterCreate` 路径。`replace=true` 场景（retry）仍需 DB 查询确认最新状态。

---

### 任务 3: Payment Kit Benchmark 框架搭建

**仓库**: payment-kit
**风险**: 低
#### ai-kit Benchmark 架构参考

ai-kit 已有完整的 benchmark 套件:

```
ai-kit/benchmarks/src/
  index.ts       — 核心函数: computeStats, benchmarkRequest, warmup, printTable, bar, fmt
  comparison.ts  — 多目标对比 (Hub vs OpenAI vs OpenRouter)
  isolation.ts   — 单目标并发扫描
  mock-provider.ts — 本地 mock server
  report.ts      — HTML 报告生成
```

核心函数（可直接复用）:

| 函数 | 用途 | 复用方式 |
|------|------|---------|
| `computeStats(numbers[])` | 计算 min/max/avg/p50/p75/p90/p99/stddev/cv | 直接复制 |
| `runConcurrent(fn, concurrency, duration)` | 并发执行 + 计时 | 直接复制 |
| `warmup(fn, count)` | 预热 | 直接复制 |
| `printTable(data)` | 终端表格输出 | 直接复制 |
| `bar(value, max, width)` | ASCII 进度条 | 直接复制 |
| `fmt(number)` | 数字格式化 | 直接复制 |
| `saveReport(html)` | HTML 保存 | 直接复制 |

#### 新建目录结构

```
payment-kit/benchmarks/
  src/
    index.ts              — 复用 ai-kit 核心函数 + 新增 paymentRequest()
    payloads.ts           — 测试数据: product/price/customer/meter/subscription 配置
    meter-ingestion.ts    — POST /api/meter-events 压测
    credit-consume.ts     — Credit 消费管道压测
    balance-query.ts      — Credit Balance 查询延迟测试
    e2e-latency.ts        — 端到端延迟: meter event → credit 扣减
    isolation.ts          — 纯 DB 操作基准
    report.ts             — HTML 报告 (复用 ai-kit 框架)
  results/
  package.json
  tsconfig.json
```

#### 核心差异点

| 维度 | ai-kit benchmark | payment-kit benchmark |
|------|-----------------|---------------------|
| 请求模式 | SSE streaming | JSON request/response |
| 认证方式 | Bearer token (session/accessKey) | Component auth header |
| 核心指标 | TTFB, streaming time | RPS, queue throughput, e2e latency |
| Server-Timing phases | session, resolveProvider, providerTtfb, streaming... | auth, dbQuery, exchangeRate, creditCheck... |

#### paymentRequest() 函数设计

```typescript
interface PaymentBenchmarkResult {
  status: number;
  totalTime: number;
  serverTiming?: Record<string, number>;
  error?: string;
}

async function paymentRequest(
  method: string,
  path: string,
  body?: object,
  options?: { headers?: Record<string, string> }
): Promise<PaymentBenchmarkResult> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-component-did': AUTH_COMPONENT_DID,
      'x-component-sig': AUTH_COMPONENT_SIG,  // 注意: 是 sig 而非 pk，见 security.ts:43
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const totalTime = performance.now() - start;
  const serverTiming = parseServerTiming(res.headers.get('Server-Timing'));
  return { status: res.status, totalTime, serverTiming };
}
```

#### 配置体系

```typescript
const config = {
  hubBaseUrl: process.env.HUB_BASE_URL || 'http://localhost:3030',
  duration: parseInt(process.env.DURATION || '30000'),
  concurrencyLevels: (process.env.CONCURRENCY_LEVELS || '1,5,10,25,50').split(',').map(Number),
  authComponentDid: process.env.AUTH_COMPONENT_DID,
  authComponentSig: process.env.AUTH_COMPONENT_SIG,  // 签名而非公钥
  warmupRequests: parseInt(process.env.WARMUP_REQUESTS || '5'),
};
```

---

### 任务 4: Meter Event 摄入压测

**仓库**: payment-kit
**依赖**: 任务 3（Benchmark 框架）
**风险**: 低
#### 测试目标

`POST /api/meter-events` 在不同并发度下的 RPS 和延迟分布。

#### 当前请求处理链路（`routes/meter-events.ts:227-325`）

```
Joi validation
  → MeterEvent.isEventExists(identifier)        // DB 查询 1
  → Meter.getMeterByEventName(event_name)        // DB 查询 2
  → PaymentCurrency.findByPk(meter.currency_id)  // DB 查询 3
  → [if subscription_id] Subscription.findByPk   // DB 查询 4
  → Customer.findByPkOrDid(customer_id)          // DB 查询 5
  → MeterEvent.create(eventData)                  // DB 写入
    → afterCreate hook → events.emit → addCreditConsumptionJob
```

5 个顺序 DB 查询 + 1 次写入 + hook 触发。

#### 测试用例

```typescript
// meter-ingestion.ts
const testCases = config.concurrencyLevels.map(concurrency => ({
  concurrency,
  duration: config.duration,
  fn: async () => {
    const identifier = `bench-${nanoid()}`;
    return paymentRequest('POST', '/api/meter-events', {
      event_name: METER_EVENT_NAME,  // 预创建的 meter
      payload: {
        customer_id: TEST_CUSTOMER_ID,
        value: '0.001',
      },
      identifier,
    });
  },
}));
```

#### 关注指标

| 指标 | 目标 | 备注 |
|------|------|------|
| RPS (concurrency=1) | baseline | 单线程吞吐 |
| RPS (concurrency=50) | 10x+ baseline | SQLite 写并发限制 |
| P95 延迟 | < 100ms | 包含 afterCreate hook |
| 错误率 | < 0.1% | 关注 SQLite busy 错误 |

#### 预置数据需求

测试前需预创建:
- 1 个 PaymentCurrency
- 1 个 Meter（status=active, currency_id 指向上述 currency）
- 1 个 Customer
- 1 个 Subscription（绑定 customer 和 meter）
- 若干 CreditGrant（用于消费测试）

---

### 任务 5: Credit 消费管道压测

**仓库**: payment-kit
**依赖**: 任务 3
**风险**: 低
#### 测试方法

```
1. 创建 N 条 pending 状态的 MeterEvent（不通过 API，直接 DB 插入，跳过 afterCreate hook）
2. 记录开始时间
3. 手动触发 startCreditConsumeQueue()
4. 轮询直到所有 event 变为 completed 状态
5. 计算总处理时间和吞吐量
```

#### 对比测试矩阵

| 场景 | concurrency | 预期表现 |
|------|-------------|---------|
| 基线 | 1 | 当前表现 |
| 轻并发 | 5 | 不同 customer 并行，相同 customer 串行 |
| 中并发 | 10 | 观察 lock 争用和 SQLite 写压力 |

#### 关键验证

- 同一 customer 的 events 严格串行消费（lock 正确性）
- 不同 customer 的 events 真正并行（并发度生效）
- 无 credit 超额消费（grant remaining_amount 正确性）
- Event 状态最终一致（全部 completed 或 requires_action）

---

### 任务 6: Delegation 校验补全

**仓库**: payment-kit
**文件**: `blocklets/core/api/src/libs/payment.ts:315`
**风险**: 高（支付安全）
#### 现状

```typescript
// payment.ts:315 — FIXME 注释
// FIXME: @wangshijun check other conditions in the token limit:
//   txCount, totalAllowance, validUntil, rateLimit
```

当前 `isDelegationSufficientForPayment` 只检查:
- `txAllowance` — 单笔交易限额
- `to` — 接收地址列表

缺失检查:
| 字段 | 含义 | 风险 |
|------|------|------|
| `txCount` | 总交易次数限制 | 超过次数的交易会链上失败 |
| `totalAllowance` | 总金额限制 | 超过总额的交易会链上失败 |
| `validUntil` | delegation 过期时间 | 过期 delegation 的交易会链上失败 |
| `rateLimit` | 频率限制 | 高频交易可能被拒 |

#### 隐性前置条件

> **⚠️ 阻塞风险**: 仓库内没有现成的"已用次数/已用总额"读取能力。`getUsedTransactionCount` 和 `getUsedTotalAmount` 均不存在，必须先确定数据源。

| 方案 | 说明 | 优缺点 |
|------|------|--------|
| 链上索引 | 从 ArcBlock 链查询 delegation 地址的历史交易 | 准确但依赖链上服务可用性，延迟较高 |
| 本地账本 | 在 payment-kit DB 新增 `DelegationUsage` 表，每次 delegation 支付后记录 | 快速但需确保不漏记（失败重试、crash recovery） |
| 混合模式 | 本地账本为主 + 定期与链上对账 | 最可靠，但复杂度最高 |

**推荐**: 先用本地账本方案（新增 `DelegationUsage` 表），后续补充链上对账。

#### 实施步骤

1. **（前置）建立 delegation 用量追踪**
   - 新增 `DelegationUsage` 模型：`delegationAddress`, `txCount`, `totalAmountUsed`, `lastTxHash`, `updatedAt`
   - 在每次 delegation 支付成功后更新计数
   - 对比 `txCount` 和 `totalAllowance` 限制

2. **检查 validUntil**
   ```typescript
   if (tokenLimit.validUntil && tokenLimit.validUntil < Math.floor(Date.now() / 1000)) {
     return { sufficient: false, reason: 'Delegation expired' };
   }
   ```

3. **检查 txCount**
   ```typescript
   const usedTxCount = await getUsedTransactionCount(delegationAddress);
   if (tokenLimit.txCount && usedTxCount >= tokenLimit.txCount) {
     return { sufficient: false, reason: 'Transaction count limit reached' };
   }
   ```

4. **检查 totalAllowance**
   ```typescript
   const usedTotal = await getUsedTotalAmount(delegationAddress);
   if (tokenLimit.totalAllowance && new BN(usedTotal).add(new BN(amount)).gt(new BN(tokenLimit.totalAllowance))) {
     return { sufficient: false, reason: 'Total allowance exceeded' };
   }
   ```

#### 额外发现

- `payment.ts:522` 另一个 FIXME: `getTokenLimitsForDelegation` 创建 delegation 时只包含 `wallet.address`，未考虑 vault/迁移地址
- `payment.ts:566` 第三个 FIXME: EVM `totalAllowance` 硬编码为 `amount × 12`，无业务依据

---

## 第二阶段：费率同步 + 财务可见性

### 任务 7: 接入 OpenRouter Pricing API

**仓库**: ai-kit
**风险**: 低
#### OpenRouter API

```
GET https://openrouter.ai/api/v1/models
```

返回格式:
```json
{
  "data": [{
    "id": "openai/gpt-4o",
    "pricing": {
      "prompt": "0.0000025",    // $/token
      "completion": "0.00001"   // $/token
    },
    "context_length": 128000,
    ...
  }]
}
```

#### 实施方案

**新增文件**: `blocklets/core/api/src/libs/openrouter-pricing.ts`

```typescript
import { LRUCache } from 'lru-cache';

interface OpenRouterModel {
  id: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
}

const cache = new LRUCache<string, Map<string, OpenRouterModel>>({
  max: 1,
  ttl: 6 * 60 * 60 * 1000,  // 6 小时
});

export async function getOpenRouterPricing(): Promise<Map<string, OpenRouterModel>> {
  const cached = cache.get('models');
  if (cached) return cached;

  const res = await fetch('https://openrouter.ai/api/v1/models');
  const { data } = await res.json();

  const modelMap = new Map<string, OpenRouterModel>();
  for (const model of data) {
    // 标准化 model ID: "openai/gpt-4o" → provider="openai", model="gpt-4o"
    modelMap.set(model.id, model);
  }

  cache.set('models', modelMap);
  return modelMap;
}
```

#### 交叉对比逻辑

```typescript
export async function compareDataSources(): Promise<PricingDiscrepancy[]> {
  const [litellm, openrouter] = await Promise.all([
    modelRegistry.getAllModels(),  // 注意: fetchModelData() 是 private，须用 getAllModels()
    getOpenRouterPricing(),
  ]);

  const discrepancies: PricingDiscrepancy[] = [];

  for (const [modelId, orModel] of openrouter) {
    const litellmModel = litellm.get(normalizeModelId(modelId));
    if (!litellmModel) continue;

    const inputDiff = Math.abs(
      (parseFloat(orModel.pricing.prompt) - litellmModel.input_cost_per_token)
      / litellmModel.input_cost_per_token
    );

    if (inputDiff > 0.10) {  // 10% 阈值
      discrepancies.push({
        modelId,
        field: 'input_cost',
        litellmValue: litellmModel.input_cost_per_token,
        openrouterValue: parseFloat(orModel.pricing.prompt),
        diffPercent: inputDiff * 100,
      });
    }
    // ... output cost 同理
  }

  return discrepancies;
}
```

---

### 任务 8: 费率变更检测与告警

**仓库**: ai-kit
**风险**: 低
#### 利用现有 cron 框架

```typescript
// crons/index.ts — 新增 cron
{
  name: 'model.rate.check',
  time: process.env.MODEL_RATE_CHECK_CRON_TIME || '0 0 */6 * * *',  // 每 6 小时
  fn: () => checkModelRateChanges(),
  options: { runOnInit: false },
}
```

#### 对比逻辑

```typescript
async function checkModelRateChanges() {
  if (!shouldExecuteTask()) return;  // 集群内只执行一次

  const [litellm, openrouter] = await Promise.all([
    modelRegistry.refreshModelData(),  // 公开方法，内部调用 private fetchModelData(true)
    getOpenRouterPricing(),
  ]);
  // refreshModelData() 后通过 getAllModels() 获取数据
  const allModels = await modelRegistry.getAllModels();

  const dbRates = await AiModelRate.findAll();
  const alerts: RateChangeAlert[] = [];

  for (const rate of dbRates) {
    const sourceData = findBestSourceMatch(rate.model, rate.providerId, litellm, openrouter);
    if (!sourceData) continue;

    const currentInput = parseFloat(rate.unitCosts?.input || '0');
    const newInput = sourceData.inputCostPerToken;

    if (currentInput > 0) {
      const diff = Math.abs(newInput - currentInput) / currentInput;
      if (diff > RATE_SOURCE_DRIFT_THRESHOLD) {  // 默认 0.1 (10%)，与任务 19 共用常量
        alerts.push({
          model: rate.model,
          provider: rate.providerId,
          field: 'inputCost',
          currentValue: currentInput,
          newValue: newInput,
          diffPercent: diff * 100,
          source: sourceData.source,
        });
      }
    }
  }

  if (alerts.length > 0) {
    // 使用现有 NotificationManager（libs/notifications/manager.ts）
    await NotificationManager.sendCustomNotificationByRoles('owner', {
      title: `模型费率变更检测: ${alerts.length} 个模型价格异常`,
      body: formatAlertBody(alerts),
    });
  }
}
```

#### 新增 AiModelRateHistory 表

**新增迁移文件**: `store/migrations/YYYYMMDD-create-ai-model-rate-history.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | STRING PK | nanoid |
| modelRateId | STRING FK | 关联 AiModelRate |
| model | STRING | 模型名 |
| providerId | STRING | provider ID |
| changeType | ENUM | 'auto_detected' \| 'manual_update' \| 'bulk_update' |
| oldUnitCosts | JSON | 变更前的 unitCosts |
| newUnitCosts | JSON | 变更后的 unitCosts |
| oldInputRate | DECIMAL | 变更前 inputRate |
| newInputRate | DECIMAL | 变更后 inputRate |
| oldOutputRate | DECIMAL | 变更前 outputRate |
| newOutputRate | DECIMAL | 变更后 outputRate |
| source | STRING | 'litellm' \| 'openrouter' \| 'manual' |
| changedBy | STRING | 操作者 DID 或 'system' |
| createdAt | DATE | |

在 `AiModelRate` 的 `afterUpdate` hook 中记录变更历史。

---

### 任务 9: model-pricing-analyzer Agent Skill

**仓库**: ai-kit
**风险**: 低
#### Skill 定义

**新增文件**: `~/.claude/skills/model-pricing-analyzer.md` 或项目内 `.claude/skills/`

```markdown
---
name: model-pricing-analyzer
trigger:
  - /model-pricing
  - 分析模型定价
  - 更新费率
  - pricing analysis
---

## 模型定价分析器

### 能力

1. 从 LiteLLM + OpenRouter 获取机器可读数据
2. 使用 WebFetch 抓取各 Provider 官方 pricing 页面
3. 与当前 DB 费率对比，输出差异报告
4. 生成 bulk-rate-update API 调用建议

### 数据源

| 源 | 方式 | 优先级 |
|----|------|--------|
| LiteLLM | JSON fetch | 1（主数据源） |
| OpenRouter | API call | 2（交叉验证） |
| 官方页面 | WebFetch 提取 | 3（补充验证） |

### 执行流程

1. 获取当前 DB 中的 AiModelRate 列表
2. 拉取 LiteLLM + OpenRouter 数据
3. 对比差异，标记超过 `RATE_SOURCE_DRIFT_THRESHOLD`（默认 10%）的变更
4. 对于差异项，使用 WebFetch 访问官方 pricing 页面二次确认
5. 输出差异报告表格
6. 生成 API 调用建议（管理员确认后执行）
```

#### 官方 Pricing 页面 URL

| Provider | URL |
|----------|-----|
| OpenAI | https://platform.openai.com/docs/pricing |
| Anthropic | https://anthropic.com/pricing |
| Google | https://ai.google.dev/pricing |
| DeepSeek | https://platform.deepseek.com/api-docs/pricing |
| xAI | https://docs.x.ai/docs/models |

---

### 任务 10: 真实成本记录 + 财务仪表盘

**仓库**: ai-kit
**风险**: 中
#### ModelCall 增加 providerCost 字段

**迁移文件**: `store/migrations/YYYYMMDD-add-provider-cost-to-model-call.ts`

```typescript
await queryInterface.addColumn('ModelCalls', 'providerCost', {
  type: DataTypes.DECIMAL(20, 10),
  allowNull: true,
  defaultValue: null,
  comment: '实际采购成本 (USD)',
});
```

**计算逻辑**: 在 `createAndReportUsageV2` 中，基于 `AiModelRate.unitCosts` 计算:

```typescript
const providerCost = new BigNumber(inputTokens)
  .times(unitCosts.input)
  .plus(new BigNumber(outputTokens).times(unitCosts.output))
  .toFixed(10);
```

写入 `ModelCall.complete()` 时一并保存。

#### ModelCallStat 扩展成本维度

在 `createHourlyModelCallStats` 中增加:
- `totalProviderCost` — 汇总采购成本
- `totalCreditsCharged` — 汇总收费 credits
- `avgProviderCost` — 平均单次成本
- `profitMargin` — (credits - providerCost) / credits

#### Admin 财务页面

- 收入/成本/利润趋势图（按天/周/月）
- 模型维度成本排行 TOP 10
- 用户维度消耗排行 TOP 10
- 利润率告警（低于阈值标红）

---

### 任务 11: ModelCall TTFB 持久化

**仓库**: ai-kit
**风险**: 低
#### 现状

存在两个不同口径的 TTFB 指标，需明确区分：

| 指标 | 定义位置 | 含义 |
|------|---------|------|
| `ttfb` | `request-timing.ts:103` | **客户端感知 TTFB**: 从请求到达 Hub 到第一个字节写回客户端 |
| `providerTtfb` | `ai-routes.ts:311` | **Provider 侧 TTFB**: 从请求发送到 Provider 到收到第一个 chunk |

差值 `ttfb - providerTtfb` = Hub 内部处理开销（session/preChecks/modelSetup/getCredentials）。

当 `ENABLE_SERVER_TIMING=true` 时，Server-Timing header 包含这两个数据，但均未持久化到 DB。

#### 实施

1. **迁移**: `ModelCalls` 表新增两个字段:
   - `ttfb` (DECIMAL(10,1)，毫秒) — 客户端感知 TTFB
   - `providerTtfb` (DECIMAL(10,1)，毫秒) — Provider 侧 TTFB
2. **写入**: `modelCallContext.complete()` 时从 `req.timings` 获取两个值
3. **聚合**: `ModelCallStat` 增加 `avgTtfb`, `p50Ttfb`, `p95Ttfb`, `avgProviderTtfb` 字段
4. **展示**: Admin Dashboard 各模型 TTFB 趋势图，区分 Hub 开销和 Provider 延迟

---

### 任务 12: 端到端延迟测量 + 评估 Throttle 窗口

**仓库**: 双仓库
**依赖**: 任务 3（Benchmark 框架）
**风险**: 低
#### 端到端延迟测量

```
POST /api/meter-events (记录 t0)
  → creditQueue 入队
  → handleCreditConsumption 开始 (记录 t1)
  → credit 扣减完成
  → MeterEvent status = completed (记录 t2)

e2e_latency = t2 - t0
queue_wait = t1 - t0
processing = t2 - t1
```

测量方式:
1. 通过 API 创建 meter event，记录请求时间 t0
2. 轮询 `GET /api/meter-events/:id` 直到 status=completed，记录 t2
3. 从 MeterEvent metadata 或 updated_at 推算处理时间

#### Throttle 窗口评估

当前 ai-kit 配置:
- `usageReportThrottleTime`: 默认 10 分钟（`leading: false, trailing: true`）
- `creditCache TTL`: throttleTime / 2 = 5 分钟

**超额风险窗口**: 用户首次使用后，最长约 5 分钟内可能过度消费（credit 缓存显示有余额但实际已消耗）。

评估缩短到 2-3 分钟的影响:
- meter event 摄入 RPS 增加约 3-5x（需要压测数据支撑）
- ai-kit 本地 DB 写入频率增加
- 权衡: 计费及时性 ↑ vs 系统负载 ↑

---

## 第三阶段：能力扩展 + 体验优化

### 任务 13: WebSocket 代理支持

**仓库**: ai-kit
**风险**: 高
#### 隐性前置条件

> **⚠️ 路径冲突风险**: ai-kit 已有 WebSocket 服务（`ws.ts`），基于 `@arcblock/ws` 在 `/websocket` 路径。新增 Realtime API 代理必须避免路径和职责冲突。

现有 `ws.ts`:
```typescript
// ai-kit/blocklets/core/api/src/ws.ts
import { WsServer } from '@arcblock/ws';
const wsServer = new WsServer({ logger, pathname: '/websocket' });
```

**建议**: Realtime API 代理使用独立路径（如 `/v1/realtime`），不复用现有 `/websocket`。

#### 架构设计

```
Client WS ──upgrade──→ AIGNE Hub (/v1/realtime) ──upgrade──→ Provider WS
         ←─ messages ──                          ←─ messages ──
```

#### 关键设计决策

1. **认证**: WS 升级前通过 HTTP headers 验证 session/accessKey（复用现有 auth middleware）
2. **Provider 解析**: 复用 `resolveProvider` + credential rotation
3. **计费**: WebSocket 会话粒度 — 连接建立时创建 ModelCall，断开时汇总 token 并上报
4. **协议**: 支持 OpenAI Realtime API 格式（JSON over WS）

#### 实施模块

| 模块 | 说明 |
|------|------|
| `ws-proxy.ts` | WS 代理核心（upgrade handler, message relay） |
| `ws-auth.ts` | WS 连接认证（复用 session/accessKey 逻辑） |
| `ws-usage.ts` | WS 会话用量统计（token 累加 + 结算） |
| `ws-benchmark.ts` | WS 并发连接 + 消息延迟 benchmark |

---

### 任务 14: 各档位定价支持

**仓库**: ai-kit
**风险**: 中
#### 现状

`AiModelRate` UNIQUE 约束: `(providerId, model, type)`。不支持同一模型不同档位（如 batch API、realtime API）。

#### 方案评估

| 方案 | 优点 | 缺点 |
|------|------|------|
| 新增 `tier` 字段 | 语义清晰 | 需要修改 UNIQUE 约束、所有查询、缓存 key |
| 命名约定 (`gpt-4o-realtime`) | 无需改 schema | model 名不规范，匹配逻辑复杂 |
| 新增 `pricingTier` ENUM | 显式枚举 | ENUM 扩展需迁移 |

**推荐**: 新增 `tier` 字段（STRING，default='standard'），UNIQUE 约束改为 `(providerId, model, type, tier)`。

> **⚠️ SQLite 迁移复杂度**: SQLite 不支持 `ALTER TABLE ... DROP CONSTRAINT` 或 `ALTER TABLE ... ADD CONSTRAINT`。修改 UNIQUE 约束需要：
> 1. 创建新表（含新约束）
> 2. 迁移数据
> 3. 删除旧表
> 4. 重命名新表
>
> **必须单列迁移与回滚方案**，测试环境先验证数据完整性。

#### 已知需要的 tier

- `standard` — 默认
- `batch` — Batch API（通常 50% 折扣）
- `realtime` — Realtime/WebSocket API
- `cached` — 带缓存的调用（部分 provider 区分定价）

---

### 任务 15: UX 优化

**仓库**: payment-kit
**风险**: 低
#### 16a: 支付方式切换追溯

新增 `PaymentMethodHistory` 表:

| 字段 | 说明 |
|------|------|
| customerId | 客户 ID |
| oldMethodType | 旧支付方式 (stripe/arcblock/evm) |
| newMethodType | 新支付方式 |
| oldDetails | 旧支付详情 (JSON) |
| newDetails | 新支付详情 (JSON) |
| reason | 切换原因 |
| changedBy | 操作者 |
| createdAt | 切换时间 |

#### 16b: 退款退还 Credits

当前退款只退 token/法币。增加 Credit Grant 回补:

```typescript
// refund 流程中新增
if (refund.creditAmount > 0) {
  await CreditGrant.create({
    customer_id: refund.customerId,
    amount: refund.creditAmount,
    remaining_amount: refund.creditAmount,
    currency_id: refund.currencyId,
    category: 'refund',
    source: `refund-${refund.id}`,
    effective_at: new Date(),
    status: 'granted',
  });
}
```

#### 16c: 订单金额不一致告警

Invoice 支付完成 webhook 回调中:

```typescript
if (invoice.amount_paid !== invoice.amount_due) {
  const diff = Math.abs(invoice.amount_paid - invoice.amount_due);
  const threshold = invoice.amount_due * 0.01; // 1%
  if (diff > threshold) {
    await createFlexibleEvent('Invoice', 'billing.invoice.amount_mismatch', {
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      diff,
    });
    await NotificationManager.sendCustomNotificationByRoles('owner', { ... });
  }
}
```

---

### 任务 16: Meter Events 查询性能

**仓库**: payment-kit
**风险**: 中
#### 17a: getPendingAmounts N+1 修复

**文件**: `meter-event.ts:368-424`

当前: 查出 events → 批量查 meters → 批量查 currencies（已经不是 N+1，但可以用 JOIN 减少查询）

```sql
-- 改为单个 JOIN 查询
SELECT me.*, m.currency_id, pc.decimal
FROM meter_events me
JOIN meters m ON me.event_name = m.event_name
JOIN payment_currencies pc ON m.currency_id = pc.id
WHERE me.status IN ('pending', 'requires_capture', 'requires_action')
  AND me.livemode = :livemode
  [AND me.subscription_id = :subscriptionId]
  [AND me.payload->>'customer_id' = :customerId]
```

#### 17b: payload->>'value' 索引优化

`getEventStats` 使用 `payload->>'value'` JSON 提取做聚合，无索引。

**方案**: 在 MeterEvent 表新增 `value` 列（DECIMAL），创建时从 payload 提取写入。`credit_pending` 已有类似逻辑，可参考。

---

### 任务 17: 音频 API 计费

**仓库**: ai-kit
**风险**: 中
**现状**: `usage.ts:37` TODO 标注，V1/V2 均无音频计费逻辑。音频路由使用 `express-http-proxy` 直通（`v2.ts:870-901`），直接代理到 `api.openai.com`，无 response 解析。

#### 隐性前置条件：可计费单位来源设计

当前 proxy 直通模式下，**转写时长和字符数无法直接获取**，必须先解决数据采集问题：

| 类型 | 计费单位 | 获取方式 | 难度 |
|------|---------|---------|------|
| Transcription | 音频时长（秒） | 方案A: 请求时解析 multipart body 中的音频文件，用 `ffprobe` 等获取时长 | 高 |
| | | 方案B: 改为非 proxy 模式，Hub 调用 OpenAI 后从 response headers/metadata 提取 | 中 |
| | | 方案C: 基于文件大小估算时长（不精确，仅作兜底） | 低 |
| Speech (TTS) | 输入字符数 | 从请求 body 的 `input` 字段提取，相对简单 | 低 |

**推荐路径**:
1. Speech (TTS) 先行 — `input` 字符数可直接从请求体获取
2. Transcription 改为 **非 proxy 模式**（Hub 发起请求 → 解析响应 → 记录用量 → 返回客户端），因为 proxy 模式无法拦截响应

**实施**:
1. Speech: 在 proxy 的 `proxyReqOptDecorator` 中提取 `input` 字段长度，写入用量
2. Transcription: 从 `express-http-proxy` 改为 `fetch` 调用模式，获取 response 后提取 `duration` 字段
3. `usage.ts` 增加 `audioTranscription` 和 `audioSpeech` 分支
4. `AiModelRate` 支持 `type: 'audioTranscription' | 'audioSpeech'`
5. 计费模型: transcription 按时长计费（$/秒），speech 按字符数计费（$/千字符）

---

### 任务 18: Payment Kit Server-Timing 支持

**仓库**: payment-kit
**风险**: 低
参考 ai-kit `request-timing.ts` 实现。

**关键路由**:
- `POST /api/meter-events` — phases: `auth`, `validation`, `dbQuery`, `total`
- `GET /api/credit-grants/summary` — phases: `auth`, `dbQuery`, `calculation`, `total`
- `GET /api/credit-grants/verify-availability` — phases: `auth`, `dbQuery`, `creditCheck`, `total`

---

### 任务 19: 模型定价盈亏验证测试套件

**仓库**: ai-kit
**依赖**: 任务 7（费率数据源）、任务 10（providerCost 字段）
**风险**: 中
#### 核心目标

逐模型、逐场景验证定价不亏损：**收取的 Credits ≥ 真实 Provider 成本**。

> **计量口径**: Credits 与 USD 严格 1:1，无需汇率换算。`chargedCredits` 和 `providerCost` 均以 USD 为单位，可直接比较。
>
> **精度与舍入策略**: 计算阶段使用默认 BigNumber（`DECIMAL_PLACES: 20`）保持高精度；仅在最终比较/断言阶段，用 `BigNumber.clone({ DECIMAL_PLACES: 8, ROUNDING_MODE: BigNumber.ROUND_DOWN })` 创建局部实例做定点截断，避免计算过程中提前丢精度，也避免全局 config 副作用。margin 计算公式: `margin = (chargedCredits - providerCost) / providerCost`。若 `providerCost = 0`（如免费模型），margin 视为 +∞，跳过亏损断言。
>
> **估算场景例外**: `usageSource: 'estimated'` 的测试用例允许负 margin（见 `expectedMinMargin: -0.1 / -0.2`），不计入"零亏损红线"。门禁规则: 仅 `usageSource !== 'estimated'` 的场景适用 `margin < 0 即失败`。

#### 现状分析

当前计费逻辑（`usage.ts`）按 CallType 分支处理：

```typescript
// usage.ts — V2 计费逻辑
if (type === 'imageGeneration') {
  credits = numberOfImageGeneration × price.outputRate;  // 按图片数量
} else if (type === 'video') {
  credits = mediaDuration × price.outputRate;             // 按时长
} else {
  credits = completionTokens × price.outputRate;          // 按 output token
}
credits += promptTokens × price.inputRate;                // + input token（所有类型）
credits += cacheCreationTokens × caching.writeRate;       // + 缓存写入
credits += cacheReadTokens × caching.readRate;            // + 缓存读取
```

**亏损风险场景**：

| 场景 | 风险 | 原因 |
|------|------|------|
| 多模态输入（图片+文本） | **高** | 图片被 Provider 按 token 计费（如 GPT-4o 每张图 ~85-170 token），但 Hub 的 inputRate 可能未覆盖图片 token 的成本溢价 |
| 纯图片生成（DALL-E 等） | **低** | 当前 outputRate 按最高规格（HD/大尺寸）定价，低规格用户实际多付。**风险方向是"低规格用户体验差"而非亏损**。但需验证新模型上线时 outputRate 是否及时更新 |
| 缓存 token（Anthropic） | **中** | caching.writeRate/readRate 可能未配置或为 0，导致缓存 token 不收费 |
| 长上下文输入 | **低** | inputRate 通常正确，但超长 context 可能触发 Provider 的分级定价 |
| Provider 不返回 usage | **中** | 部分 Provider 可能不返回 `usage` 字段，代码会走本地 token 估算，对图片输入估算不可靠（`ai-routes.ts:383`） |
| 费率源漂移 | **中** | LiteLLM/OpenRouter/手工费率不一致时，`calculateProviderCost` 结果不稳定，需明确优先级与回退策略 |

#### 测试矩阵设计

```typescript
// model-pricing-verification.test.ts
interface PricingTestCase {
  model: string;           // e.g., 'openai/gpt-4o'
  provider: string;        // e.g., 'openai'
  type: CallType;          // 'chatCompletion' | 'imageGeneration' | 'embedding' | ...
  tier?: string;           // 'standard' | 'batch' | 'realtime' | 'cached'（Task 14 后扩展）
  scenario: string;        // 描述
  input: TestInput;        // 测试输入
  expectedMinMargin: number; // 最低利润率（如 0.1 = 10%）
  usageSource?: 'provider' | 'estimated'; // 验证 usage 缺失时的估算路径
}

const testMatrix: PricingTestCase[] = [
  // === 文本场景 ===
  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'text-only-short',
    input: { messages: [{ role: 'user', content: 'Hello' }] },
    expectedMinMargin: 0.1 },

  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'text-only-long-context',
    input: { messages: [{ role: 'user', content: LONG_TEXT_10K }] },
    expectedMinMargin: 0.1 },

  // === 多模态场景（图片+文本） ===
  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'multimodal-single-image',
    input: { messages: [{ role: 'user', content: [
      { type: 'text', text: 'Describe this image' },
      { type: 'image_url', image_url: { url: TEST_IMAGE_URL } }
    ]}] },
    expectedMinMargin: 0.05 },  // 图片 token 成本更高，margin 可以低一些

  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'multimodal-multiple-images',
    input: { messages: [{ role: 'user', content: [
      { type: 'text', text: 'Compare these images' },
      { type: 'image_url', image_url: { url: TEST_IMAGE_1 } },
      { type: 'image_url', image_url: { url: TEST_IMAGE_2 } },
      { type: 'image_url', image_url: { url: TEST_IMAGE_3 } },
    ]}] },
    expectedMinMargin: 0.0 },  // 多图场景 margin 可能极低

  // === 纯图片生成（outputRate 按最高规格定价，低规格有正 margin） ===
  { model: 'openai/dall-e-3', type: 'imageGeneration', scenario: 'image-gen-standard',
    input: { prompt: 'A cat', size: '1024x1024', quality: 'standard' },
    expectedMinMargin: 0.1 },  // 低规格，margin 应较高

  { model: 'openai/dall-e-3', type: 'imageGeneration', scenario: 'image-gen-hd-max-size',
    input: { prompt: 'A cat', size: '1024x1792', quality: 'hd' },
    expectedMinMargin: 0.0 },  // 最高规格，margin 接近 0 但不应为负

  // === 缓存 token（Anthropic） ===
  { model: 'anthropic/claude-sonnet-4-20250514', type: 'chatCompletion',
    scenario: 'with-cache-creation',
    input: { messages: [...], cacheControl: true },
    expectedMinMargin: 0.05 },

  { model: 'anthropic/claude-sonnet-4-20250514', type: 'chatCompletion',
    scenario: 'cache-read-only',
    input: { messages: [...], cacheControl: true },  // 第二次调用，全部 cache hit
    expectedMinMargin: 0.0 },  // cache read 极便宜，验证 readRate 配置正确

  // === Embedding ===
  { model: 'openai/text-embedding-3-small', type: 'embedding', scenario: 'embedding-short',
    input: { input: 'Hello world' },
    expectedMinMargin: 0.1 },

  // === Provider 不返回 usage（估算路径验证） ===
  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'usage-missing-text',
    input: { messages: [{ role: 'user', content: 'Hello' }] },
    usageSource: 'estimated',  // 模拟 provider 不返回 usage
    expectedMinMargin: -0.1 }, // 估算允许 10% 误差

  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'usage-missing-multimodal',
    input: { messages: [{ role: 'user', content: [
      { type: 'text', text: 'Describe' },
      { type: 'image_url', image_url: { url: TEST_IMAGE_URL } }
    ]}] },
    usageSource: 'estimated',  // 图片 token 估算风险最高
    expectedMinMargin: -0.2 }, // 图片估算误差更大

  // === 跨 Provider 同模型费率一致性 ===
  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'rate-source-litellm',
    input: { messages: [{ role: 'user', content: 'Hello' }] },
    expectedMinMargin: 0.1 },  // 以 LiteLLM 费率计算

  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'rate-source-openrouter',
    input: { messages: [{ role: 'user', content: 'Hello' }] },
    expectedMinMargin: 0.1 },  // 以 OpenRouter 费率交叉验证

  // === 权威源冲突解决验证 ===
  { model: 'openai/gpt-4o', type: 'chatCompletion', scenario: 'source-conflict-resolution',
    input: { messages: [{ role: 'user', content: 'Hello' }] },
    expectedMinMargin: 0.0 },
    // 模拟: DB 手工配置 vs LiteLLM vs OpenRouter 三源费率不一致
    // 硬断言:
    //   assert(usedSource === 'db')  // 优先级 DB > LiteLLM > OpenRouter
    //   assert(auditLog.includes({ source: 'db', overridden: ['litellm', 'openrouter'] }))
    //   assert(alertTriggered === (drift > RATE_SOURCE_DRIFT_THRESHOLD))  // 复用常量
];
```

#### 测试执行逻辑

```typescript
for (const testCase of testMatrix) {
  // 1. 获取当前 AiModelRate
  const rate = await AiModelRate.findOne({
    where: { model: testCase.model, type: testCase.type }
  });
  if (!rate) { reportMissing(testCase); continue; }

  // 2. 调用 Provider API（真实调用或 mock）
  const result = await callProvider(testCase);
  // result = { inputTokens, outputTokens, cacheTokens, imageCount, providerCost }

  // 3. 按 Hub 计费逻辑计算收取的 Credits
  const chargedCredits = calculateCredits(rate, result);

  // 4. 计算真实 Provider 成本（从 LiteLLM/OpenRouter 数据源）
  const providerCost = calculateProviderCost(testCase, result);

  // 5. 验证 margin
  const margin = (chargedCredits - providerCost) / providerCost;
  assert(margin >= testCase.expectedMinMargin,
    `${testCase.model}/${testCase.scenario}: margin ${(margin*100).toFixed(1)}% < min ${(testCase.expectedMinMargin*100).toFixed(1)}%`
  );

  // 6. 记录结果到报告
  report.push({ ...testCase, chargedCredits, providerCost, margin });
}

// 7. 生成盈亏分析报告
generateProfitReport(report);
```

#### 关键技术点

1. **多模态图片 token 计算**
   - OpenAI: 图片按分辨率转 token（low=85, high=170+tiles×85）
   - Anthropic: 图片按像素数计算 token（`(width×height)/750`）
   - Google: 图片固定 258 token
   - Hub 侧的 `promptTokens` 已包含图片 token，但需确认 `inputRate` 是否覆盖图片 token 的更高成本

2. **图片生成的分辨率/质量差异**
   - DALL-E 3: standard 1024×1024 = $0.040, HD 1024×1792 = $0.120
   - 当前 `outputRate` 按最高规格定价，**不区分分辨率**。低规格用户多付（正 margin），最高规格接近盈亏平衡
   - **关注点**: 新模型上线时 outputRate 是否及时按最高规格设置，否则可能短暂亏损

3. **缓存 token 的费率覆盖**
   - Anthropic cache write = 1.25× input cost, cache read = 0.1× input cost
   - 检查 `AiModelRate.caching.writeRate/readRate` 是否正确配置

4. **Provider 不返回 usage 时的估算策略**
   - 部分 Provider（尤其代理型）可能不返回 `usage` 字段
   - 代码会走本地 token 估算（`ai-routes.ts:383`），文本场景尚可，但图片 token 估算不可靠
   - **测试须覆盖**: 模拟 `usage=null` 场景，验证估算与实际的偏差在可接受范围内

5. **费率数据源优先级与冲突解决**
   - 多源费率可能不一致（LiteLLM vs OpenRouter vs 手工配置）
   - `calculateProviderCost` 应明确优先级: DB 手工配置 > LiteLLM > OpenRouter
   - 测试应以每个源分别计算，验证差异不超过阈值（如 10%）
   - **冲突解决规则**: 当多源费率差异超过 `RATE_SOURCE_DRIFT_THRESHOLD`（默认 0.1 即 10%，任务 8 告警与任务 19 验证共用此常量）时: ① 按优先级选定确定性赢家; ② 将选用源和被覆盖源记入审计日志; ③ 触发费率差异告警
   - 测试需覆盖"权威源冲突解决"场景（见 `source-conflict-resolution` test case）

6. **运行模式**
   - **CI 模式**: 使用 mock provider response（不花钱），验证计算逻辑
   - **集成模式**: 使用真实 API 调用（花少量钱），验证端到端
   - **定期模式**: 接入 cron，每日/每周自动跑一轮，费率变化时自动告警
   - **告警后动作**: 发现 margin < 0 时发送告警到 owner；是否自动禁用模型由运营决定（建议先只告警，不自动禁用）

#### 与现有任务的关系

```
任务 7 (OpenRouter) ── 提供第二费率数据源 ──┐
                                              ├── 任务 19 (盈亏验证)
任务 10 (providerCost) ── 提供真实成本数据 ──┘      │
任务 8 (费率告警) ── 费率变更时触发重新验证 ─────────┤
任务 14 (档位定价) ── 新增 tier 后需扩展测试矩阵 ───┘
```

#### 验收标准

| 字段 | 内容 |
|------|------|
| **Owner** | @xiaofang |
| **Metrics** | 所有已配置模型的测试覆盖率 ≥ 90%; 零亏损场景（margin < 0 即失败）; 低利润告警（margin < 5%）; 跨源费率差异 < 10% |
| **Observability** | CI 报告：模型×场景利润率矩阵; 定期 cron 告警通道（Slack/邮件）; `pricing.verification.margin` histogram 指标 |
| **Verification Window** | CI: 每次 PR 自动运行; Cron: 每日 02:00 UTC 运行，统计窗口 24h; 数据源: `ModelCallStat` + `AiModelRateHistory` 表 |
| **Rollback** | Cron 模式: 环境变量 `PRICING_VERIFICATION_CRON_ENABLED=false` 即可关闭定期验证; CI 模式: 环境变量 `SKIP_PRICING_VERIFICATION=true` 跳过该 suite; 告警误报时 30min 内关闭 cron |
| **Data Migration** | 无 |

---

## 附录：代码分析发现

### Payment-Kit 发现

| # | 文件 | 发现 | 严重性 |
|---|------|------|--------|
| 1 | `lock.ts` | 进程内锁，多副本部署无法保护同一 customer | 已知限制 |
| 2 | `lock.ts` | Thundering herd: release 时所有等待者被唤醒 | 低 |
| 3 | `lock.ts` | EventEmitter maxListeners 未设置，高并发可能告警 | 低 |
| 4 | `queue/store.ts:63` | `retry_count` 初始化为 1，`maxRetries: 3` 实际只重试 2 次 | 中 |
| 5 | `payment.ts:315` | Delegation 校验缺 txCount/totalAllowance/validUntil/rateLimit | 高 |
| 6 | `payment.ts:522` | 新建 delegation 不包含 vault/迁移地址 | 中 |
| 7 | `payment.ts:566` | EVM totalAllowance 硬编码 amount×12 | 中 |
| 8 | `auto-recharge.ts:663` | Job ID 有多余的 `}` 字符 | 低 |
| 9 | `audit.ts:27-28` | Event 的 request.id 和 idempotency_key 永远为空 | 低 |
| 10 | `audit.ts:33` | `pending_webhooks: 99` 硬编码，所有事件强制进 webhook 队列 | 低 |
| 11 | `meter-events.ts:165-175` | minute 和 hour 粒度产生相同 SQL | 低 |

### AI-Kit 发现

| # | 文件 | 发现 | 严重性 |
|---|------|------|--------|
| 1 | V2 路由 | 无任何速率限制中间件 | 高 |
| 2 | `usage.ts:37` | 音频 transcription/speech 用量未记录 | 中 |
| 3 | `model-call.ts:323` | `MIN(providerId)` 在多 provider 场景下不准确 | 低 |
| 4 | `crons/index.ts:57-60` | `check.model.status` cron 注册但实现已注释 | 低 |
| 5 | `model-registry.ts` | 过期缓存被继续使用而非触发后台刷新 | 低 |
| 6 | `model-rate-cache.ts` | afterUpdate 未清除 rotation cache | 低 |
| 7 | ModelCall | 无 UNIQUE 约束，重复记录理论上可能 | 低 |

---

## 依赖关系图（推荐执行路径）

```
Phase 0: 可观测基础
  任务 20 (Server-Timing) ─────────────────────────┐
                                                    │
Phase 1: 基线建立 + 安全                            │
  任务 3 (Benchmark 框架) ─── 任务 4/5 (压测) ─────┤
  任务 6 (Delegation) ─── 前置: 建立 DelegationUsage 数据源 │
                                                    │
Phase 2: 优化（有前后对比数据）                     │
  任务 1 (Queue 并发) ─────────────────────────────┤
  任务 2 (减少 DB 操作) ───────────────────────────┤
                                  ├── 任务 12 (E2E 延迟 + Throttle)
                                                    │
Phase 3: 费率链路 + 盈亏验证                         │
  任务 7 (OpenRouter) ─── 任务 8 (history + 告警) ──┤
                                  ├── 任务 9 (Skill)
  任务 10 (成本记录) ──┐                             │
  任务 7 (费率数据) ───┴── 任务 19 (盈亏验证测试)   │
  任务 11 (TTFB) ── 独立                            │
                                                    │
Phase 4: 能力扩展                                   │
  任务 13 (WebSocket) ── 注意 ws.ts 冲突            │
  任务 14 (档位定价) ── 注意 SQLite 迁移            │
  任务 15 (UX) ── 独立                              │
  任务 16 (查询性能) ── 独立                        │
  任务 17 (音频计费) ── 前置: 可计费单位设计        │
```

---

## 工作量估算

| 任务 | 工作量 | 主要改动文件数 |
|------|--------|---------------|
| 1. Queue 并发 | 0.5 天 | 2 |
| 2. 减少 DB 操作 | 2 天 | 4 |
| 3. Benchmark 框架 | 3 天 | 8+ (新建) |
| 4. Meter 摄入压测 | 1 天 | 2 (新建) |
| 5. Credit 消费压测 | 1 天 | 2 (新建) |
| 6. AI 速率限制 | 1.5 天 | 3 |
| 7. Delegation 校验 | 1 天 | 1 |
| 8. OpenRouter 接入 | 1 天 | 2 (新建) |
| 9. 费率告警 | 2 天 | 4 (含迁移) |
| 10. Pricing Skill | 1 天 | 1 (新建) |
| 11. 成本记录 + 仪表盘 | 3 天 | 6+ (含前端) |
| 12. TTFB 持久化 | 0.5 天 | 3 (含迁移) |
| 13. E2E 延迟 + Throttle | 2 天 | 3 |
| 14. WebSocket 代理 | 5 天 | 6+ (新建) |
| 15. 档位定价 | 2 天 | 4 (含迁移+管理界面) |
| 16. UX 优化 | 3 天 | 5+ (前端为主) |
| 17. 查询性能 | 1.5 天 | 2 |
| 18. Payment 速率限制 | 0.5 天 | 2 |
| 19. 音频计费 | 2 天 | 4 |
| 20. Server-Timing | 1 天 | 3 |
| 21. 模型定价盈亏验证 | 2 天 | 4 (新建) |

**总计约 36 人天**

- 第一阶段（任务 1-7）: ~10 人天
- 第二阶段（任务 8-13 + 21）: ~12 人天
- 第三阶段（任务 14-20）: ~14 人天

---

## 验收标准模板

> 每个任务在执行前须填写以下字段，确保不仅"实现了"，还能安全上线。

| 字段 | 说明 | 示例 |
|------|------|------|
| **Owner** | 负责人 | @xiaofang |
| **Metrics** | 量化验收指标 + 失败阈值 | P95 延迟 < 100ms; RPS >= 50; 错误率 < 0.1%; margin < 0 即失败 |
| **Observability** | 新增的日志/指标/告警 | 新增 `credit.consume.duration` histogram; 新增 Slack 告警通道 |
| **Verification Window** | 验证的统计窗口和数据来源 | 上线后 24h; 数据源: `ModelCallStat` 表; 查询: `SELECT avg(margin) ...` |
| **Rollback** | 功能开关、回退命令和时限 | 环境变量 `CREDIT_QUEUE_CONCURRENCY=1` 即可回退; 迁移有 `down()` 方法; 发现异常 30min 内回滚 |
| **Data Migration** | 是否影响历史数据 | 新增列有默认值，不影响历史; 需回填 N 条记录 |

### 示例：任务 1 验收标准

| 字段 | 内容 |
|------|------|
| Metrics | 不同 customer 的 events 并行处理（观察日志时间戳）; 同一 customer 的 events 仍串行; 无 credit 超额消费 |
| Observability | Lock 争用日志; MaxListenersExceededWarning 监控 |
| Rollback | `CREDIT_QUEUE_CONCURRENCY=1` 即可回退到串行模式 |
| Data Migration | 无，仅改运行时配置 |
