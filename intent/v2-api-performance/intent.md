# V2 API Request Pipeline Performance Optimization

## 1. Overview

- **Product positioning**: AIGNE Hub 是 AI 模型统一代理网关，V2 API 是核心入口
- **Core concept**: 先消除冗余查询，再异步化写操作，最后对剩余热路径加缓存（preChecks 已通过缓存优化至 ≈0ms，无需并行化）
- **Priority**: P0 — 直接影响所有 AI 调用的首字节体验与吞吐
- **Target user**: 所有通过 AIGNE Hub 调用 AI 模型的应用和开发者
- **Project scope**: 仅优化 V2 路由的请求前置处理与调用记录写入（preChecks / getCredentials / modelCallCreate），不改变 AI 调用行为和响应格式。V1 路由不在优化范围内（中间件链简单，无 modelCallTracker / withModelStatus / creditBalance check）。**V1 间接影响**：①§3.1.1 删除 process* 内的 `checkModelRateAvailable` 会同时影响 V1 调用路径（V1 也调用 process*），V1 将失去该校验；②§3.1.2 `createRetryHandler` 重试逻辑依赖 `req.resolvedProvider`，V1 路由需加入 `resolveProviderMiddleware`（不改变 V1 业务逻辑，仅提供 retry 所需数据）。V1 实际已废弃，此影响可接受
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
      ├─ checkUserCreditBalance              (TTL 缓存，拒绝前回源) ≈0ms 命中
      ├─ checkModelRateAvailable             (TTL 缓存，provider 从 req 获取) ≈0ms 命中
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

**优化后主路径 I/O**: preChecks 串行（creditBalance → modelRate），均有 TTL 缓存，命中时 ≈0ms；getProviderCredentials 串行（深嵌在 provider 调用链中，已通过缓存优化）。缓存未命中时 DB 读 2 + Payment API 3，缓存命中 **0 次**。后处理: DB 写 1（Usage 同步） + fire-and-forget DB 写 2 + DB 读写 2。

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
   - `checkModelRateAvailable(modelName, providerId)` → `providerId` 为必填参数，由 `req.resolvedProvider` 提供；函数第一个参数改为 `modelName`（不含 provider 前缀），不再内部解析 `provider/model` 格式
   - `getProviderCredentials(provider)` → 通过 `providerCache`（LRU，10 分钟 TTL）消除冗余 `AiProvider.findOne` 查询，接口签名不变
   - `updateModelStatus` → 从 `req` 获取 provider 信息，不再调用 `getModelAndProviderId`

5. **V1 路由连带改动**: `createRetryHandler` 的重试逻辑依赖 `req.resolvedProvider`（更新 provider 信息、过滤可用 providers），因此 V1 路由也需加入 `resolveProviderMiddleware`。这是 `createRetryHandler` 重构的必要连带影响，不改变 V1 的业务逻辑。

#### 3.1.3 withModelStatus 后处理中的冗余 credential 查询

**现状**: 见 §2.1，`libs/status.ts:371` 重复查询已获取的 credential。

**改法**: 将 credential 对象挂到 `req` 上，后处理直接使用。

### 3.2 后处理异步化

**P0 优先级 — 将所有非必要的阻塞写操作移出主路径**

**位置**: `middlewares/model-call-tracker.ts` + `libs/usage.ts` + `libs/status.ts` + `providers/models.ts`

**改法**:

#### 3.2.1 拆分 `createUsageAndCompleteModelCall`

`createUsageAndCompleteModelCall`（`libs/usage.ts:485`）耦合了 Usage 计费（`getPrice()` + `Usage.create()` + `reportUsageV2()`）和 ModelCall 完成（`modelCallContext.complete()`），且 Usage 失败会连带将 ModelCall 标记为 failed。

**改法**: 拆分为独立操作：
- `getPrice()` 的 DB 读通过 `req.resolvedProvider`（§3.1.2）和 ModelRate 缓存（§3.3.1）消除，credits 在内存计算
- Usage.create 和 ModelCall.create 解耦，各自独立执行（见 §3.2.3）

#### 3.2.2 ModelCall 从两阶段改为单阶段

现有 ModelCall 经历 3 次 DB 操作：`create(processing)` → `updateCredentials()` → `complete/fail`。

**改法**: 内存中初始化 `modelCallContext`，全程积累信息，请求结束后一次性 `ModelCall.create()` 写入完整记录（直接 `success` 或 `failed`）。

- `cleanupStaleProcessingCalls` 不再需要（无 `processing` 中间态）
- ModelCall 用 `nextId()` 预分配 Snowflake ID，在响应中返回（维持 API 契约），请求结束后 fire-and-forget 写入
- 进程 crash 时会丢失 ModelCall 记录（内存 context 丢失），可接受
- **重试场景**：每次 provider 尝试独立记录一条 ModelCall。`createRetryHandler` 重试时会重新执行 `chatCallTracker`，创建新的 `modelCallContext`（新 Snowflake ID）。首次失败的尝试立即写入 `failed` 记录，重试成功后写入 `success` 记录。同一用户请求的多条记录通过 `requestId`（`x-request-id` header）关联。这使用户和运维能看到完整的 provider 尝试链路，也为 provider 质量度量提供准确的逐次失败率数据

#### 3.2.3 后处理分工

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

### 3.3 缓存热路径查询

**P1 优先级 — 对消除冗余后仍然需要的查询加缓存**

新增缓存统一使用 `lru-cache` v11（`@blocklet/sdk` 已用 v11.2.4）。有界 key 空间纯 TTL 驱动，无界 key 空间（用户维度）加 LRU max 上限防内存泄漏。

#### 3.3.1 AiModelRate 查询缓存

**改法**: `providers/index.ts` — `checkModelRateAvailable` 中的 `AiModelRate.findAll` 加 `lru-cache`（max: 200, ttl: 10 分钟）。变更频率约每周一次。

#### 3.3.2 Credential 列表缓存

**改法**: `providers/models.ts` — `getProviderCredentials` 中的 `AiCredential.findAll` 加 `lru-cache`（max: 50, ttl: 10 分钟）。在内存缓存数组中做 credential 轮询。`credential.updateUsage()` 的 DB 写入改为 fire-and-forget，但轮询所需的 `usageCount` 在内存中同步递增，保证本进程内轮询均匀。多实例间的 `usageCount` 在 TTL 刷新时从 DB 重新同步，短时间内可能轮询不完全均匀，但 credential 通常只有 1-3 个，偏差可接受。credential 被禁用时（`sendCredentialInvalidNotification` 设置 `active: false`），同步清除对应 `providerId` 的 Credential 缓存条目（`credentialCache.delete(providerId)`），保证下一次请求立即从 DB 获取最新状态。

#### 3.3.3 用户余额缓存

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
| TTL 窗口内命中旧数据 | 最多 10 分钟使用过期 ModelRate 配置 | ModelRate 变更频率约每周一次，影响可忽略；Credential 禁用时同步清除缓存（见 §3.3.2），不依赖 TTL 过期 |
| 用户余额 TTL 缓存窗口 | 最多 5 分钟使用旧余额（默认配置） | 余额只在上报后变化（默认 10 分钟），TTL 取一半留余量；充值场景靠拒绝前回源兜底 |
| 多实例 credential 轮询偏差 | TTL 窗口内各实例独立计数 usageCount，负载不完全均匀 | credential 通常只有 1-3 个，偏差可接受；TTL 刷新时从 DB 重新同步 |
| fire-and-forget 写入失败 | ModelCall 记录丢失、credential 计数偏差、Dashboard 模型状态过时 | ModelCall 为审计辅助记录，偶尔丢失可接受；credential 计数为软指标；modelStatus 自愈（下次请求刷新） |
| 进程 crash 丢失内存 context | ModelCall 永久丢失（fire-and-forget 尚未执行） | 极罕见场景；Usage 已同步落库不受影响；无 `processing` 中间态残留，数据干净 |
| CreditError 误判 credential 失效 | 用户余额不足时错误禁用 provider credential | `sendCredentialInvalidNotification` 入口加 `instanceof CreditError` 守卫；已确认只有一个 throw 点（`payment.ts:507`） |
| ModelCall ID 异步化后丢失 | 响应中 `modelCallId` 字段为空，破坏 API 契约 | 内存预分配 Snowflake ID（`nextId()`），响应返回 + fire-and-forget create 使用同一 ID |
| V1 路由丢失 checkModelRateAvailable 校验 | V1 调用 process* 时不再做 rate 校验 | V1 实际已废弃，无活跃用户；且 V1 之前也无 preChecks 保护，该校验本身覆盖不完整 |

## 5. Verification Plan

### 5.1 单元测试

仅覆盖**纯逻辑、无外部依赖**的函数，不 mock DB/缓存交互。

- credential 加权轮询算法：`getNextAvailableCredential` 的 smooth weighted round-robin，连续调用应按权重分配，内存 usageCount 递增后轮询结果符合预期
- 余额缓存三分支判断：`checkUserCreditBalance` 的缓存命中余额 >0 放行、缓存命中余额 ≤0 回源重查、缓存未命中正常查询
- 403 错误分类：`classifyNonCredential403` 正确区分 content_violation / region_restriction / temporary_block / 真实 credential 错误
- 重试条件判断：`canRetry` 在达到 maxRetries 时返回 false，CreditError 不重试
- credential 合并更新：`updateCredentialAfterUse(id, providerId, { recover: true })` 生成包含 usageCount+1、lastUsedAt、active=true、weight=DEFAULT 的单条 UPDATE；不带 recover 时只更新 usageCount 和 lastUsedAt

### 5.2 集成测试

**位置**: `api/src/tests/integration/`（首次引入集成测试）

**基础设施**:
- 启动本地 mock provider HTTP 服务器（参考 `benchmarks/src/mock-provider.ts`），支持 JSON 和 SSE streaming 两种响应模式
- mock provider 支持通过配置控制行为：正常响应、返回指定错误码（401/403/429/500）、响应延迟
- **测试数据库**：使用独立的 SQLite 文件（如 `:memory:` 或 tmpdir 下的 `test-integration.db`）。项目本身基于 SQLite + Sequelize（`store/sequelize.ts`），测试前替换 sequelize 实例指向测试库，调用 `sequelize.sync({ force: true })` 建表，无需 mock DB 层。测试后可直接查询 ModelCall、Usage、AiCredential 等表验证写入结果
- **测试数据 seed**：每个测试前插入必要的种子数据 — AiProvider（指向 mock provider 的 baseUrl）、AiCredential（加密的 mock API key）、AiModelRate（模型费率配置）
- mock session 中间件：模拟已认证用户（userDid、appId）
- mock payment API：模拟 ensureCustomer、creditGrants.summary、meterEvents.pendingAmount
- 每个测试用例前清除所有 LRU 缓存（modelRateCache、credentialListCache、providerCache、customerCache、creditCache）

**测试用例**:

#### 5.2.1 成功路径 — 完整请求链路

- **非流式 chat completion**: POST `/api/v2/chat/completions`（stream: false），验证：
  - 响应状态 200，响应体包含 `choices`、`usage`、`modelCallId`
  - `modelCallId` 为有效 Snowflake ID
  - 等待 fire-and-forget 完成后查 DB：ModelCall 表有 1 条记录，status=success，providerId/credentialId/model 与 seed 数据一致
  - Usage 表有 1 条记录，type=chatCompletion，promptTokens/completionTokens 与 mock provider 返回的 usage 一致
  - AiCredential 表对应记录的 usageCount 比初始值 +1

- **流式 chat completion**: POST `/api/v2/chat/completions`（stream: true），验证：
  - 响应 Content-Type 为 text/event-stream
  - SSE 数据包含 `data: [DONE]` 结尾
  - DB 验证与非流式一致（ModelCall 1 条 success、Usage 1 条、credential usageCount +1）

- **Embeddings**: POST `/api/v2/embeddings`，验证响应 200 + DB 中 ModelCall type=embedding + Usage 写入正确

- **Image generation**: POST `/api/v2/images/generations`，验证响应 200 + DB 中 ModelCall type=imageGeneration

#### 5.2.2 失败路径 — provider 错误处理

- **provider 返回 401**: mock provider 返回 401，验证：
  - 响应状态 401
  - DB 中 ModelCall 1 条，status=failed，errorReason 非空
  - AiCredential 表对应记录 active=false（被禁用）
  - credential usageCount 比初始值 +1（失败也计数）

- **provider 返回 403（真实 credential 错误）**: 验证与 401 一致

- **provider 返回 403（content_violation）**: mock provider 返回 403 + "content policy violation" 消息，验证：
  - DB 中 AiCredential 仍然 active=true（未被禁用）

- **provider 返回 429**: 验证响应 429 + DB 中 ModelCall status=failed

- **provider 返回 500**: 验证响应体消息包含 "temporarily unavailable"

#### 5.2.3 重试路径 — provider 切换

- **首次失败 + 重试成功**: seed 2 个 provider（provider-A baseUrl 指向返回 500 的 mock，provider-B 指向正常 mock），验证：
  - 最终响应 200（来自 provider-B）
  - DB 中 ModelCall 2 条：1 条 status=failed（provider-A 的 providerId/credentialId），1 条 status=success（provider-B 的 providerId/credentialId）
  - Usage 表只有 1 条（仅成功路径写入）
  - 两条 ModelCall 的 requestId 相同（同一用户请求）

- **所有 provider 失败**: seed 2 个 provider 都指向返回 500 的 mock，验证：
  - 响应状态 500
  - DB 中 ModelCall 2 条，均为 failed，分别关联不同的 providerId

- **CreditError 不重试**: mock payment API 返回余额 0（触发 CreditError），验证：
  - 响应状态 402
  - DB 中 ModelCall 0 条（CreditError 在 preChecks 阶段，provider 从未被调用）
  - AiCredential usageCount 不变（未消耗 credential）

#### 5.2.4 缓存行为

- **缓存命中减少 DB 查询**: 连续发送 2 次相同请求，用 spy 包装 `AiModelRate.findAll` / `AiCredential.findAll` / `AiProvider.findOne`，验证第 2 次请求这些方法不被调用

- **credential 禁用后缓存清除**: 首次请求成功，然后调用 `AiCredential.disableCredential(credentialId, providerId, 'test')`，再次请求（仅 1 个 credential 时应失败），验证第二次请求因无可用 credential 而报错

- **余额缓存 — 充值即时生效**: mock payment 先返回余额 0，首次请求返回 402，调用 `invalidateCreditCache(userDid)` 后 mock payment 改为返回余额 >0，第二次请求返回 200

#### 5.2.5 后处理解耦

- **Usage 写入失败不影响 ModelCall**: spy `Usage.create` 使其抛出异常，发请求后验证：
  - 响应正常 200
  - DB 中 ModelCall 仍有 1 条 status=success
  - DB 中 Usage 表为空（写入被阻止）

- **ModelCall 写入失败静默处理**: spy `ModelCall.create` 使其抛出异常，发请求后验证：
  - 响应正常 200
  - DB 中 ModelCall 表为空（写入被阻止）
  - Usage 正常写入

- **credential 更新失败不影响其他**: spy `AiCredential.update` 使其抛出异常，发请求后验证：
  - 响应正常 200
  - DB 中 ModelCall 和 Usage 均正常写入

#### 5.2.6 Credit 计费路径

启用 `creditBasedBillingEnabled`，mock payment 组件为 running 状态，覆盖 payment SDK 的 meters/customers/creditGrants/meterEvents 等方法。

- **正余额请求成功**: mock 余额 100，POST chat/completions，验证：
  - 响应状态 200
  - `creditGrants.summary` 被调用（余额检查触发）

- **Usage 记录包含 credit 计算**: mock 余额 100，请求后验证：
  - Usage 表 1 条，`usedCredits > 0`（基于 inputRate=0.001, outputRate=0.002 和 mock token 数）
  - ModelCall 表 1 条，status=success

- **余额缓存命中（正余额不重查）**: 连续 2 次请求，验证第 2 次不再调用 `creditGrants.summary`（正余额使用 TTL 缓存）

- **invalidateCreditCache 强制重查**: 首次请求填充缓存，调用 `invalidateCreditCache(userDid)` 后再次请求，验证 `creditGrants.summary` 被重新调用

- **零余额 + 无自动购买返回 402**: mock 余额 0 + `can_continue=false`，验证：
  - 响应状态 402
  - `verifyAvailability` 被调用（检查自动购买）
  - mock provider 未收到请求（请求在 preChecks 阶段被拒绝）

- **零余额 + 自动购买允许放行**: mock 余额 0 + `can_continue=true`，验证：
  - 响应状态 200
  - mock provider 收到 1 次请求

- **零余额不缓存（每次重查）**: mock 余额 0 + `can_continue=true`，连续 2 次请求，验证每次都调用 `creditGrants.summary`（零余额绕过缓存，确保充值即时生效）

- **Usage 写入失败不阻塞计费响应**: mock 余额 100 + `Usage.create` 抛异常，验证：
  - 响应状态 200
  - ModelCall 表 1 条 status=success（独立于 Usage 写入）

### 5.3 基准回归
- 继续使用 `benchmarks/` 三类测试（comparison/stress/isolation）
- 本轮不设硬 KPI，只做前后对比与趋势判断
- 重点观察 `resolveProvider/preChecks/getCredentials/modelCallCreate(total)` 的 p50/p90 变化方向
