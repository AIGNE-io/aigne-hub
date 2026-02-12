# V2 API Request Pipeline Performance Optimization

## 1. Overview

- **Product positioning**: AIGNE Hub 是 AI 模型统一代理网关，V2 API 是核心入口
- **Core concept**: 先消除冗余查询，再并行化 preChecks，再异步化写操作，最后对剩余热路径加缓存
- **Priority**: P0 — 直接影响所有 AI 调用的首字节体验与吞吐
- **Target user**: 所有通过 AIGNE Hub 调用 AI 模型的应用和开发者
- **Project scope**: 仅优化 V2 路由的请求前置处理与调用记录写入（preChecks / getCredentials / modelCallCreate），不改变 AI 调用行为和响应格式。V1 路由不在优化范围内（中间件链简单，无 modelCallTracker / withModelStatus / creditBalance check）。**V1 间接影响**：§3.1.1 删除 process* 内的 `checkModelRateAvailable` 会同时影响 V1 调用路径（V1 也调用 process*），V1 将失去该校验。V1 实际已废弃，此影响可接受
- **不包含**: Session 验证链路改造（依赖外部 SDK）；DB 连接池/部署拓扑大改；API 响应格式变更

## 2. Architecture

### 2.1 当前请求流水线（含排查结果）

以 `POST /v2/chat/completions` 为例，标注每步的所有 I/O 操作：

```
客户端请求
  │
  ├─ requestTimingMiddleware              纯内存，无 I/O
  ├─ compression()                        纯内存，无 I/O
  ├─ session (auth)                       [session] ~20-54ms（外部 SDK，不可优化）
  ├─ checkCreditBasedBilling              纯内存检查，无 I/O
  │
  ├─ maxProviderRetries:                   ⚠️ [架构问题：与 chatCallTracker 内的 ensureModelWithProvider 职责重叠]
  │   └─ getProvidersForModel             已有 5 分钟缓存（ProviderRotationManager），大部分命中
  │
  ├─ chatCallTracker middleware:           ⚠️ [架构问题：混入了 provider 解析职责]
  │   ├─ ensureModelWithProvider           ⚠️ [不属于 tracker：provider 解析应在上游完成]
  │   ├─ getModelAndProviderId             ⚠️ AiProvider.findOne [冗余：ensureModelWithProvider 已知 providerId，这里反查]
  │   └─ ModelCall.create()               ⚠️ DB INSERT 阻塞 ~3-21ms [可延迟：此时只写空壳记录]
  │
  └─ withModelStatus handler:
      ├─ checkUserCreditBalance:
      │   ├─ ensureMeter()                24h 缓存，几乎总命中
      │   ├─ ensureCustomer(userDid)      ⚠️ 支付 API [可缓存：用户存在性几乎不变]
      │   ├─ creditGrants.summary()       支付 API [必要，可 singleflight + 短 TTL]
      │   └─ meterEvents.pendingAmount()  支付 API [必要，同上]
      │
      ├─ checkModelRateAvailable:
      │   ├─ AiProvider.findOne           ⚠️ [冗余：第 2 次查同一个 provider]
      │   └─ AiModelRate.findAll          必要 [可缓存]
      │
      ├─ processChatCompletion:
      │   ├─ checkModelRateAvailable      ❌ [完全重复！preChecks 刚查过]
      │   ├─ getModelAndProviderId        ⚠️ AiProvider.findOne [冗余：第 3 次]
      │   ├─ getProviderCredentials:
      │   │   ├─ AiProvider.findOne       ⚠️ [冗余：第 4 次查同一个 provider]
      │   │   ├─ AiCredential.findAll     必要 [可缓存]
      │   │   ├─ getNextAvailableCredential 必要
      │   │   ├─ credential.updateUsage() ⚠️ DB WRITE [可异步：只更新计数器]
      │   │   └─ modelCall.updateCredentials() ⚠️ DB WRITE [可延迟到请求结束]
      │   │
      │   ├─ AI Provider 调用              [providerTtfb] ~450-502ms（不可优化）
      │   └─ 流式转发                      [streaming] ~2000ms（不可优化）
      │
      ├─ usage (onEnd):                     createUsageAndCompleteModelCall()
      │   ├─ getPrice():
      │   │   ├─ getModelRates()
      │   │   │   ├─ AiProvider.findOne   ⚠️ [冗余：第 7 次！]
      │   │   │   └─ AiModelRate.findAll  [与 checkModelRateAvailable 同表重复查]
      │   ├─ Usage.create()               DB WRITE [可异步]
      │   ├─ reportUsageV2()              支付 API（throttled，非每次触发）
      │   └─ modelCall.complete()         DB WRITE [可异步]
      │
      └─ withModelStatus 后处理:
          ├─ updateModelStatus:
          │   ├─ getModelAndProviderId    ⚠️ AiProvider.findOne [冗余：第 5 次]
          │   ├─ AiProvider.findOne       ⚠️ [冗余：第 6 次！和上一行查的一样]
          │   ├─ AiModelStatus.findOne    DB 查询 [可异步]
          │   └─ AiModelStatus.upsert     DB WRITE [可异步]
          ├─ AiCredential.findOne         ⚠️ [冗余：已在 getProviderCredentials 拿过]
          └─ credential.update            DB WRITE 条件 [可异步]
```

**冗余 I/O 统计**: 单次请求 `AiProvider.findOne` 同一 provider **7 次**、`checkModelRateAvailable` 重复 **2 次**、`AiModelRate.findAll` 重复 **2 次**、`getModelAndProviderId` 重复 **3-4 次**、阻塞主路径写操作 **5 次**、可异步后处理 **5+ 次 I/O**。合计主路径 I/O：DB 读 15 + DB 写 7-9 + Payment API 3 = **25-27 次**。

### 2.2 目标优化流水线

```
客户端请求
  │
  ├─ requestTimingMiddleware              ≈0ms
  ├─ compression()                        ≈0ms
  ├─ session (auth)                       [session]（保持现状）
  ├─ checkCreditBasedBilling              ≈0ms
  ├─ resolveProvider middleware:            合并 maxProviderRetries + ensureModelWithProvider
  │   ├─ getProvidersForModel              ≈0ms（已有 5 分钟缓存）
  │   ├─ 选择首选 provider + 改写 req.body.model
  │   └─ req.resolvedProvider = { providerId, providerName, modelName, availableProviders, maxRetries }
  │
  ├─ chatCallTracker middleware:            纯 tracker，不再做 provider 解析
  │   └─ 纯内存初始化 modelCallContext     ≈0ms（不写 DB，不生成记录，只准备内存容器积累调用信息）
  │
  └─ withModelStatus handler:
      ├─ Promise.all([
      │   checkUserCreditBalance            (TTL 缓存，拒绝前回源)
      │   checkModelRateAvailable           (TTL 缓存，provider 从 req 获取)
      │   getProviderCredentials            (TTL 缓存，provider 从 req 获取)
      │ ])
      ├─ AI Provider 调用                    [providerTtfb]（不变）
      ├─ 流式转发                            [streaming]（不变）
      └─ 后处理（response 已发送完毕，不影响用户延迟）:
          [两条路径共用] fire-and-forget credential usageCount+1, lastUsedAt（credential 已被使用，与当前行为一致）
          [仅成功路径] fire-and-forget credential recovery: active=true, weight=DEFAULT（与 usageCount 合并为一条 UPDATE）
          [仅失败路径] sendCredentialInvalidNotification（已在 catch 中同步执行）+ 清除对应 providerId 的 Credential 缓存
          [两条路径共用] fire-and-forget updateModelStatus() + wsServer.broadcast（自愈：下一次请求会刷新）
          [两条路径共用] 同步 await:
          ├─ Usage.create()                   同步写入（保证 ID 落库顺序，兼容现有按 ID 水位推进的上报算法）
          └─ reportUsageV2()                  fire-and-forget（已有 throttle）
          [两条路径共用] fire-and-forget:
          └─ ModelCall.create()               一次性 INSERT 完整记录
```

**优化后主路径 I/O**: 缓存未命中 **5 次**（DB 读 2 + Payment API 3），缓存命中 **0 次**。后处理: DB 写 1（Usage 同步） + fire-and-forget DB 写 2 + DB 读写 2。

### 2.3 多实例约束

- 线上是多实例部署，**不能把进程内缓存当作强一致来源**
- 缓存策略采用 `本地 TTL 缓存`，纯 TTL 过期，保证最终一致
- 后处理写操作分两类：Usage.create 同步 await（保证 ID 落库顺序，兼容上报算法）；其余全部 fire-and-forget（ModelCall.create、credential 更新、updateModelStatus + wsServer.broadcast）。主流程不阻塞

## 3. Detailed Behavior

### 3.1 消除冗余查询（纯删代码 / 传递已有数据）

**P0 优先级 — 零成本，改动最小，收益最大**

#### 3.1.1 去掉 process* 内部重复的 checkModelRateAvailable

**现状**: 见 §2.1，process* 内部重复调用 checkModelRateAvailable（preChecks 已调用）。

**改法**: 删除 `libs/ai-routes.ts` 中 `processChatCompletion`(269)、`processEmbeddings`(396)、`processImageGeneration`(445) 内的 `checkModelRateAvailable` 调用。校验由调用方 preChecks 负责。

#### 3.1.2 合并 resolveProvider middleware + pipeline 传递 provider 信息

**现状**: 见 §2.1，provider 解析分散在两个 middleware，信息丢失后下游反查 AiProvider.findOne 5-6 次。

**改法**:

1. **合并 middleware**: 将 `getMaxProviderRetriesMiddleware` 和 `ensureModelWithProvider` 合并为一个 `resolveProvider` middleware。职责：解析 model → 查可用 providers → 选首选 → 改写 `req.body.model` → 挂完整信息到 `req`。

2. **`req.resolvedProvider`**: 存放 `{ providerId, providerName, modelName, availableProviders, maxRetries }`，下游直接使用。retry 时 `createRetryHandler` 从 `availableProviders` 列表取下一个，直接更新 `req.resolvedProvider` 和 `req.body.model`，不需要重新查询（当前 `req.availableModelsWithProvider` 已是这个模式，合并后更清晰）。

3. **chatCallTracker 瘦身**: 删除 `ensureModelWithProvider` 和 `getModelAndProviderId` 调用，从 `req.resolvedProvider` 获取 provider 信息。

4. **下游函数签名变更**:
   - `checkModelRateAvailable(model)` → 接收 `providerId` 可选参数，有则跳过 AiProvider 查询
   - `getProviderCredentials(provider)` → 接收 `providerId` 可选参数
   - `updateModelStatus` → 从 `req` 获取 provider 信息，不再调用 `getModelAndProviderId`

#### 3.1.3 withModelStatus 后处理中的冗余 credential 查询

**现状**: 见 §2.1，`libs/status.ts:371` 重复查询已获取的 credential。

**改法**: 将 credential 对象挂到 `req` 上，后处理直接使用。

### 3.2 preChecks + getCredentials 并行化

**P0 优先级**

**位置**:
- `routes/v2.ts` 的 6 个 handler preChecks 段（含 `/chat` 路由，其 `getModel` 内部也有 `getModelAndProviderId` + `getProviderCredentials` 同样受益）
- `libs/ai-routes.ts` 的 `processChatCompletion/processEmbeddings/processImageGeneration`

**行为变更**:
- 将 `checkUserCreditBalance`、`checkModelRateAvailable`、`getProviderCredentials` 三者从串行改为 `Promise.all` 并行
- 三者都只依赖 `req.resolvedProvider`，互相无数据依赖
- `/chat` 路由走 `getModel` 的特殊路径需要一并改造，让 `getModel` 也从 `req.resolvedProvider` 获取 provider 信息
- 错误语义：`Promise.all` 并行后哪个先失败就返回哪个错误，对用户体验无影响（credential 白拿的成本可忽略：缓存命中 + 写操作已移至后处理）
- **并行化安全前提 — CreditError 与上游 402 区分**：并行执行时，`getProviderCredentials` 可能在 `checkUserCreditBalance` 抛出 `CreditError` 之前已设置 `req.credentialId`。当 `CreditError` 冒泡到 `withModelStatus` 的 catch 中，`sendCredentialInvalidNotification` 会误判为上游 provider 余额不足（因为 `status===402 && message.includes(NOT_ENOUGH)` 同时匹配），错误地禁用 credential。**修复**：在 `sendCredentialInvalidNotification` 入口加 `if (error instanceof CreditError) return` 守卫。已确认 Hub 侧用户余额不足只有一个 throw 点（`payment.ts:507`），且全部通过 `CreditError` 类型抛出。

### 3.3 后处理异步化

**P0 优先级 — 将所有非必要的阻塞写操作移出主路径**

**位置**: `middlewares/model-call-tracker.ts` + `libs/usage.ts` + `libs/status.ts` + `providers/models.ts`

**改法**:

#### 3.3.1 拆分 `createUsageAndCompleteModelCall`

`createUsageAndCompleteModelCall`（`libs/usage.ts:485`）耦合了 Usage 计费（`getPrice()` + `Usage.create()` + `reportUsageV2()`）和 ModelCall 完成（`modelCallContext.complete()`），且 Usage 失败会连带将 ModelCall 标记为 failed。

**改法**: 拆分为独立操作：
- `getPrice()` 的 DB 读通过 `req.resolvedProvider`（§3.1.2）和 ModelRate 缓存（§3.4.1）消除，credits 在内存计算
- Usage.create 和 ModelCall.create 解耦，各自独立执行（见 §3.3.3）

#### 3.3.2 ModelCall 从两阶段改为单阶段

现有 ModelCall 经历 3 次 DB 操作：`create(processing)` → `updateCredentials()` → `complete/fail`。

**改法**: 内存中初始化 `modelCallContext`，全程积累信息，请求结束后一次性 `ModelCall.create()` 写入完整记录（直接 `success` 或 `failed`）。

- `cleanupStaleProcessingCalls` 不再需要（无 `processing` 中间态）
- ModelCall 用 `nextId()` 预分配 Snowflake ID，在响应中返回（维持 API 契约），请求结束后 fire-and-forget 写入
- 进程 crash 时会丢失 ModelCall 记录（内存 context 丢失），可接受

#### 3.3.3 后处理分工

**credential 更新拆分为 usageCount 和 recovery 两部分**：
- `usageCount += 1, lastUsedAt`：**成功和失败路径都执行**（credential 已被使用，与当前 `getProviderCredentials` 中调用前递增的行为一致）
- `active = true, weight = DEFAULT`（recovery）：**仅成功路径执行**，与 usageCount 合并为一条 UPDATE
- 失败路径的 credential 状态由 `sendCredentialInvalidNotification` 独立处理（可能设置 `active=false, weight=0`），不做 recovery

请求结束后（response 已发送完毕），后处理按成功/失败分支：

```typescript
// === 成功路径 ===
credentialUpdate({ id, usageCount: +1, lastUsedAt, active: true, weight: DEFAULT })
  .catch(log);

// === 失败路径 ===
credentialUpdate({ id, usageCount: +1, lastUsedAt }).catch(log);
// sendCredentialInvalidNotification 已在 withModelStatus catch 中执行

// === 共用 ===
updateModelStatus({ model, providerId, ok }).catch(log);

// Usage 同步写入，保证 ID 落库顺序（兼容 reportUsageV2 按 ID 水位推进的上报算法）
await Usage.create(usageParams);
reportUsageV2({ appId, userDid });  // fire-and-forget（已有 throttle）

ModelCall.create(modelCallParams).catch(log);  // fire-and-forget
```

- 效果：主路径（AI 调用前）零 DB 写操作；后处理仅 Usage.create 一次同步写入

### 3.4 缓存热路径查询

**P1 优先级 — 对消除冗余后仍然需要的查询加缓存**

新增缓存统一使用 `lru-cache` v11（`@blocklet/sdk` 已用 v11.2.4）。有界 key 空间纯 TTL 驱动，无界 key 空间（用户维度）加 LRU max 上限防内存泄漏。

#### 3.4.1 AiModelRate 查询缓存

**改法**: `providers/index.ts` — `checkModelRateAvailable` 中的 `AiModelRate.findAll` 加 `lru-cache`（max: 200, ttl: 10 分钟）。变更频率约每周一次。

#### 3.4.2 Credential 列表缓存

**改法**: `providers/models.ts` — `getProviderCredentials` 中的 `AiCredential.findAll` 加 `lru-cache`（max: 50, ttl: 10 分钟）。在内存缓存数组中做 credential 轮询。`credential.updateUsage()` 的 DB 写入改为 fire-and-forget，但轮询所需的 `usageCount` 在内存中同步递增，保证本进程内轮询均匀。多实例间的 `usageCount` 在 TTL 刷新时从 DB 重新同步，短时间内可能轮询不完全均匀，但 credential 通常只有 1-3 个，偏差可接受。credential 被禁用时（`sendCredentialInvalidNotification` 设置 `active: false`），同步清除对应 `providerId` 的 Credential 缓存条目（`credentialCache.delete(providerId)`），保证下一次请求立即从 DB 获取最新状态。

#### 3.4.3 用户余额缓存

**现状**: 见 §2.1，每请求 3 次支付 API。余额只在 `reportUsageV2` 上报后变化（默认 10 分钟间隔），因此有效缓存窗口 = 上报间隔。

**改法**:
- `ensureCustomer(userDid)` 加 `lru-cache`（max: 10000, ttl: 30 分钟），用户存在性几乎不变，LRU 驱逐冷用户防内存泄漏
- `getUserCredits(userDid)` 加 `lru-cache`（max: 10000, ttl: `USAGE_REPORT_THROTTLE_TIME / 2`，默认 5 分钟），取一半留安全余量
- TTL 从同一个环境变量 `USAGE_REPORT_THROTTLE_TIME` 派生，保证与上报周期联动
- **充值即时生效**：缓存命中但余额不足时，绕过缓存回源重查一次再决定拒绝。逻辑：
  1. 缓存命中且余额 > 0 → 直接放行（大多数请求走这里）
  2. 缓存命中但余额 ≤ 0 → 回源重查（用户可能刚充值），更新缓存，余额仍不足才拒绝
  3. 缓存未命中 → 正常查询，写入缓存

## 4. Risks & Gaps

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| TTL 窗口内命中旧数据 | 最多 10 分钟使用过期 ModelRate 配置 | ModelRate 变更频率约每周一次，影响可忽略；Credential 禁用时同步清除缓存（见 §3.4.2），不依赖 TTL 过期 |
| 用户余额 TTL 缓存窗口 | 最多 5 分钟使用旧余额（默认配置） | 余额只在上报后变化（默认 10 分钟），TTL 取一半留余量；充值场景靠拒绝前回源兜底 |
| 多实例 credential 轮询偏差 | TTL 窗口内各实例独立计数 usageCount，负载不完全均匀 | credential 通常只有 1-3 个，偏差可接受；TTL 刷新时从 DB 重新同步 |
| fire-and-forget 写入失败 | ModelCall 记录丢失、credential 计数偏差、Dashboard 模型状态过时 | ModelCall 为审计辅助记录，偶尔丢失可接受；credential 计数为软指标；modelStatus 自愈（下次请求刷新） |
| 进程 crash 丢失内存 context | ModelCall 永久丢失（fire-and-forget 尚未执行） | 极罕见场景；Usage 已同步落库不受影响；无 `processing` 中间态残留，数据干净 |
| 并行化引入 CreditError 误判 | 用户余额不足时错误禁用 provider credential | `sendCredentialInvalidNotification` 入口加 `instanceof CreditError` 守卫；已确认只有一个 throw 点（`payment.ts:507`） |
| ModelCall ID 异步化后丢失 | 响应中 `modelCallId` 字段为空，破坏 API 契约 | 内存预分配 Snowflake ID（`nextId()`），响应返回 + fire-and-forget create 使用同一 ID |
| V1 路由丢失 checkModelRateAvailable 校验 | V1 调用 process* 时不再做 rate 校验 | V1 实际已废弃，无活跃用户；且 V1 之前也无 preChecks 保护，该校验本身覆盖不完整 |

## 5. Verification Plan

### 5.1 单元测试

**正向用例**:
- 冗余查询消除：resolveProvider 正确传递 provider 信息，下游不再重复查 DB
- retry 切换：createRetryHandler 从 resolvedProvider.availableProviders 取下一个 provider，正确更新 req
- 并行化：preChecks + getProviderCredentials 并行执行，错误正确透传（含 `/chat` 路由的 `getModel` 路径）
- ModelCall 单阶段写入：请求结束后一次性 fire-and-forget INSERT 完整记录（直接 success/failed），无中间态 processing 记录
- ModelCall ID 预分配：Snowflake ID（`nextId()`）在内存中生成，响应返回 + fire-and-forget create 使用同一 ID
- Usage 同步写入后触发 reportUsageV2 fire-and-forget
- fire-and-forget：credential 更新 + updateModelStatus + ModelCall.create 在请求结束回调中执行
- 缓存：TTL 命中与过期回源，余额拒绝前回源重查
- credential 轮询：内存 usageCount 递增后轮询结果符合预期
- credential 合并更新：成功路径 updateUsage + recovery 合并为一条 UPDATE

**负向用例（防回归）**:
- CreditError 不误触 credential 禁用：并行场景下 `checkUserCreditBalance` 抛 `CreditError(402, NOT_ENOUGH)` 时，`sendCredentialInvalidNotification` 不执行（`instanceof CreditError` 守卫生效）
- fire-and-forget 之间互不影响：credential 更新失败后，ModelCall.create 和 updateModelStatus 仍正常执行
- Usage↔ModelCall 错误解耦：AI 调用成功但 Usage.create 失败时，ModelCall 仍记录为 success（不再因 Usage 失败而标记为 failed）

### 5.2 集成测试
- 整条 V2 请求链路的 DB 查询次数符合预期（对比优化前后）
- 缓存 TTL 过期后正确回源
- 后处理正常执行：Usage 同步写入 + reportUsageV2 fire-and-forget + credential 更新 + updateModelStatus + ModelCall.create 全部 fire-and-forget
- cleanupStaleProcessingCalls 不再需要（无 processing 中间态），验证移除后无副作用
- 并行化 + CreditError 场景：用户余额不足时返回 402，credential 未被禁用
- Usage↔ModelCall 解耦：模拟 Usage.create 失败，验证 ModelCall 仍为 success

### 5.3 基准回归
- 继续使用 `benchmarks/` 三类测试（comparison/stress/isolation）
- 本轮不设硬 KPI，只做前后对比与趋势判断
- 重点观察 `preChecks/getCredentials/modelCallCreate(total)` 的 p50/p90 变化方向
