# V2 API Request Pipeline Performance Optimization

## 1. Overview

- **Product positioning**: AIGNE Hub 是 AI 模型统一代理网关，V2 API 是核心入口
- **Core concept**: 通过“单点校验、并行 preChecks、谨慎缓存、队列化写入”降低 Hub 自身开销和尾延迟
- **Priority**: P0 — 直接影响所有 AI 调用的首字节体验与吞吐
- **Target user**: 所有通过 AIGNE Hub 调用 AI 模型的应用和开发者
- **Project scope**: 仅优化请求前置处理与调用记录写入（preChecks / getCredentials / modelCallCreate），不改变 AI 调用行为和响应格式

## 2. Architecture

### 2.1 当前请求流水线

```
客户端请求
  │
  ├─ requestTimingMiddleware    ≈0ms
  ├─ compression()              ≈0ms
  ├─ session (auth)             [session]     ~20-54ms
  ├─ checkCreditBasedBilling    ≈0ms
  ├─ maxProviderRetries         [maxProviderRetries] ~0.01ms
  │
  ├─ chatCallTracker middleware:
  │   ├─ ensureModelWithProvider [ensureProvider]  ~0.08ms
  │   └─ ModelCall.create()      [modelCallCreate] ~3-21ms  ← 阻塞 DB INSERT
  │
  └─ withModelStatus handler:
      ├─ checkUserCreditBalance  ┐
      │  (3-5 次支付 API 调用)    ├─ [preChecks] ~78-2473ms
      ├─ checkModelRateAvailable ┘
      │  (2 次 DB 查询，且下游流程有重复校验)
      ├─ getProviderCredentials  [getCredentials] ~13-153ms
      │  (3 次 DB 查询 + 2 次 DB 写)
      ├─ AI Provider 调用         [providerTtfb]  ~450-502ms (稳定)
      ├─ 流式转发                  [streaming]     ~2000ms (稳定)
      └─ 计费记录                  [usage]         ~4-432ms
```

### 2.2 目标优化流水线

```
客户端请求
  │
  ├─ requestTimingMiddleware    ≈0ms
  ├─ compression()              ≈0ms
  ├─ session (auth)             [session]  (保持现状)
  ├─ checkCreditBasedBilling    ≈0ms
  ├─ maxProviderRetries         ≈0ms
  │
  ├─ chatCallTracker middleware:
  │   ├─ ensureModelWithProvider               ≈0ms
  │   └─ nextId() + enqueue(ModelCallCreate)   ≈0ms (非阻塞队列)
  │
  └─ withModelStatus handler:
      ├─ Promise.all([
      │   checkUserCreditBalance (命中短 TTL + singleflight)
      │   checkModelRateAvailable (L1 缓存 + 多实例失效信号)
      │ ])
      ├─ getProviderCredentials  (Provider/Credential 缓存)
      ├─ AI Provider 调用         [providerTtfb] (不变)
      ├─ 流式转发                  [streaming]    (不变)
      └─ enqueue(ModelCallUpdate) [usage]        (仅写路径变更)
```

### 2.3 多实例约束

- 线上是多实例部署，**不能把进程内缓存当作强一致来源**
- 缓存策略采用 `L1 本地缓存 + 失效信号 + TTL 兜底`，保证最终一致
- ModelCall 写入改为队列，按“请求主流程不阻塞，写入最终一致可追踪”设计

## 3. Detailed Behavior

### 3.1 P0-A: preChecks 并行化 + 单点费率校验

**位置**:
- `routes/v2.ts` 的 6 个 handler preChecks 段
- `libs/ai-routes.ts` 的 `processChatCompletion/processEmbeddings/processImageGeneration`

**行为变更**:
- 将 `checkUserCreditBalance` 和 `checkModelRateAvailable` 从串行改为 `Promise.all` 并行
- 消除重复费率校验：V2 在 preChecks 完成后，下游流程不再重复执行同一校验
- 保持错误语义：并行校验失败时，仍返回原始错误类型

**兼容策略**:
- 为 `process*` 系列函数增加可选参数（如 `skipModelRateCheck`）
- V2 传 `true`，V1 和其他调用方维持原行为，避免回归

### 3.2 P0-B: ModelRate/Provider 缓存（多实例可用）

**位置**: `providers/index.ts`、`providers/models.ts`、`providers/util.ts`

**读路径**:
- `getProviderByName(name)`：Provider L1 缓存（默认 5 分钟）
- `getCachedModelRates(model, providerId)`：ModelRate L1 缓存（默认 5 分钟）

**多实例一致性**:
- 每次命中前先检查“失效版本号”（轻量轮询，不走每请求强制 DB 查询）
- 版本变化时清本地 key；未变化走本地缓存
- TTL 作为兜底，避免失效消息丢失导致长期陈旧

**避免无意义频繁失效（重点）**:
- 仅“影响路由/计费结果”的字段变更触发失效
- 对高频但不影响选择结果的字段（如统计计数）不触发失效
- 失效发送做合并（debounce），短时间多次变更只广播一次

### 3.3 P0-C: 用户余额缓存 + singleflight（补完整治理）

**位置**: `libs/payment.ts` — `checkUserCreditBalance`

**设计**:
- `userCreditCache[userDid] = { balance, pendingCredit, expiresAt }`
- 仅缓存 `balance > 0` 的结果，避免负余额误放行
- 同一 `userDid` 并发请求使用 inflight promise 合并（singleflight）

**容量与清理**:
- 增加 `maxEntries` 上限，超限时淘汰最旧项
- inflight promise 在 `finally` 中必定清理
- 异常请求不写入缓存，防止错误结果污染

**窗口说明（你问的“窗口”）**:
- “5 秒窗口”指：余额刚从正变零后，最多可能有 5 秒仍使用旧缓存结果
- 该窗口是性能与严格实时性的折中，不是额外扣费窗口
- 调用完成后的真实扣费与账单流程不变

**多实例说明**:
- 用户余额缓存保持本地短 TTL，不做跨实例共享
- 原因：余额查询频繁、变化快，跨实例强一致成本高且收益有限

### 3.4 P1-A: 消除重复 Provider 查询

**位置**:
- `providers/models.ts`（`getProviderCredentials`）
- `providers/util.ts`（`getModelAndProviderId`）
- `providers/index.ts`（`checkModelRateAvailable`）

**行为变更**:
- 引入统一 `resolveProviderContext(model)`，返回 `{ providerId, providerName, modelName }`
- 上述 3 条路径复用同一解析与缓存结果，避免每条路径重复 `AiProvider.findOne`

### 3.5 P1-B: Credential 列表缓存（谨慎失效）

**位置**: `providers/models.ts`、`store/models/ai-credential.ts`

**当前问题**:
- 每请求至少两次 `AiCredential.findAll`
- `updateUsage` 带来热写，若直接全量清缓存会造成抖动

**优化后**:
- `getActiveCredentials(providerId)`：短 TTL 缓存（建议 30-60 秒）
- 新增 `AiCredential.selectFromCached(providerId, credentials)` 在内存数组做轮询
- `usageCount/lastUsedAt` 继续异步更新，但**不触发 credential 列表失效**

**触发失效的字段（仅关键字段）**:
- `active`、`weight`、`credentialValue`、`providerId`
- 对 provider 侧 `enabled`、`baseUrl`、`region` 的变更也触发相关失效

### 3.6 P2-A: ModelCall 写入改为队列（替代后台 Promise）

**位置**: `middlewares/model-call-tracker.ts` + 新增 `queue/model-call.ts`

**为何替代后台 Promise**:
- 后台 Promise 的核心风险：快速失败路径可能在 INSERT 完成前触发 UPDATE
- 队列方案更容易做持久化重试、积压观测和故障恢复

**写入流程**:
1. 请求线程同步生成 `modelCallId = nextId()`
2. 立即 enqueue `CREATE(modelCallId, initialPayload)`，主流程不阻塞
3. `updateCredentials/complete/fail` 不直接写 DB，改 enqueue `UPDATE` 事件
4. Worker 消费队列执行 DB 写入，失败自动重试，超限进入死信记录

**顺序与一致性**:
- 默认按同一队列顺序处理；若出现 `UPDATE` 先于 `CREATE`，worker 延迟重试
- 所有写事件都带 `modelCallId` 和 `eventType`，保证幂等可追踪

**多实例说明**:
- 每实例可有本地持久化队列 worker；最终写入同一 DB
- 即使单实例重启，落盘队列可恢复未完成任务

### 3.7 第 3 条详细说明：ModelCall 更优优化方案比较

**方案 A: 后台 Promise INSERT（原方案）**
- 优点：改动小，最快实现
- 缺点：快失败场景有时序风险；错误恢复与监控能力弱

**方案 B: 队列化写入（本次选择）**
- 优点：非阻塞、可重试、可观测、便于多实例治理
- 缺点：实现复杂度高于 A，需要处理积压和死信

**方案 C: 同步写 + DB 批量优化**
- 优点：一致性最强，实现语义简单
- 缺点：仍在主链路阻塞，难解决高并发尾延迟

**结论**:
- 在“多实例 + 高并发 + 需可追踪”的约束下，B 是更平衡方案

## 4. Decisions Summary

| 决策 | 选择 | 理由 |
|------|------|------|
| preChecks 策略 | Promise.all 并行 + 单点校验 | 降低串行等待并去掉重复校验 |
| Provider/ModelRate 缓存 | L1 本地缓存 + 失效版本 + TTL | 多实例下兼顾性能与最终一致 |
| Credential 缓存 TTL | 30-60 秒短 TTL | active/weight 会变化，TTL 过长风险高 |
| Credential 失效策略 | 字段级失效 + debounce | 避免“高频变更导致缓存无意义” |
| 用户余额缓存 TTL | 5 秒（仅正余额） | 降低支付 API 压力，风险窗口可控 |
| 用户余额并发控制 | singleflight + finally 清理 | 防止并发风暴和 inflight 泄漏 |
| ModelCall 写入 | 队列化 CREATE/UPDATE | 非阻塞 + 可重试 + 可观测 |
| 缓存一致性原则 | 最终一致，不做强一致 | 多实例现实约束下成本可控 |

## 5. MVP Scope

### 包含
- P0: preChecks 并行化 + 去重复费率校验 + 用户余额缓存与合并
- P1: Provider/ModelRate/Credential 缓存优化与谨慎失效
- P2: ModelCall 队列化写入（CREATE + UPDATE）

### 不包含
- Session 验证链路改造（依赖外部 SDK）
- DB 连接池/部署拓扑大改（如 cluster 改造）
- API 响应格式变更

## 6. Risks

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 缓存失效信号延迟 | 短时间命中旧数据 | 失效版本 + TTL 双兜底 |
| 失效过于频繁 | 缓存命中率下降，优化失效 | 字段级触发 + debounce 合并 |
| 用户余额 5 秒窗口 | 极短时间内使用旧余额 | 仅缓存正余额，过期即回源；扣费逻辑不变 |
| 队列积压 | ModelCall 写入延迟 | 监控队列长度/滞留时长，超阈值告警 |
| 队列任务失败 | 调用记录不完整 | 自动重试 + 死信记录 + 人工回补脚本 |
| UPDATE 先于 CREATE | 更新失败或丢失 | worker 检测不存在时延迟重试 |

## 7. Verification Plan

### 7.1 单元测试
- preChecks 并行执行与错误透传
- `skipModelRateCheck` 生效，确保 V2 不重复校验
- Provider/ModelRate/Credential 缓存命中、过期、失效、debounce
- userCreditCache 的 `maxEntries`、singleflight、异常清理
- ModelCall 队列任务的重试与死信路径

### 7.2 集成测试
- 多实例场景下缓存失效最终一致（实例 A 改配置，实例 B 在 TTL 内外行为）
- 高频 credential 状态变更下缓存命中率不塌陷
- 队列 worker 重启后可恢复未完成 ModelCall 写入

### 7.3 基准回归
- 继续使用 `benchmarks/` 三类测试（comparison/stress/isolation）
- 本轮不设硬 KPI，只做前后对比与趋势判断
- 重点观察 `preChecks/getCredentials/modelCallCreate(total)` 的 p50/p90 变化方向
