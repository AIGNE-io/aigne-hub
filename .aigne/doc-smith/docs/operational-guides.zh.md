# 用量与分析

本文档详细概述了用于跟踪、计算和报告 AI 模型用量与分析的系统架构，旨在为负责部署和维护该系统的 DevOps、SRE 和基础设施团队提供参考。

## 1. 核心概念

该分析系统围绕三个主要概念构建：跟踪每一次独立的 API 调用，计算其相关的点数成本，以及聚合这些数据以实现高效的报告和分析。

### 1.1 模型调用跟踪

对 AI 模型的每一次请求都会作为一条 `ModelCall` 记录被 meticulously 记录在数据库中。这成为所有用量数据的唯一真实来源。

#### 模型调用的生命周期

一个 `ModelCall` 记录会经历一个明确的生命周期，由 `createModelCallMiddleware` 管理：

1.  **处理中 (Processing)**：当收到一个 API 请求时，系统会立即创建一个状态为 `processing` 的 `ModelCall` 条目。一个 `modelCallContext` 对象会被附加到请求对象上，允许下游服务更新该记录。
2.  **完成 (Completion)**：从 AI 模型提供商处成功获得响应后，会调用上下文的 `complete` 方法。这会将记录的状态更新为 `success`，并填充最终的用量指标，如令牌数、消耗的点数和总时长。
3.  **失败 (Failure)**：如果在此过程中发生任何错误（API 错误、网络问题、内部处理失败），则会调用上下文的 `fail` 方法。状态会被设置为 `failed`，并记录具体的错误信息。这确保了即使是失败的请求也能被跟踪，以便进行监控和调试。

这个生命周期确保了没有任何 API 调用会丢失，从而为成功和失败的操作提供了完整的可见性。

### 1.2 点数计算与用量报告

该系统基于点数的计费模型运作，其中用量（例如，令牌、图像生成）被转换为一个标准化的 `credits` 单位。

#### 计算

点数计算由 `createUsageAndCompleteModelCall` 函数执行。当一个模型调用完成时，该函数会：
1.  从系统配置中检索特定模型和调用类型的定价费率（例如，聊天补全的输入/输出费率，图像生成的单张图片费率）。
2.  使用 `BigNumber.js` 计算消耗的总点数，以确保高精度并避免浮点数不准确的问题。
3.  将计算出的点数存储在相应的 `ModelCall` 记录中。

#### 异步报告

为优化性能和弹性，点数用量会异步报告给外部计费系统。

1.  **节流 (Throttling)**：`reportUsageV2` 函数使用 `lodash/throttle` 进行节流。系统不会为每一次 API 调用都发送一个计费事件，而是在一个可配置的时间段内（`usageReportThrottleTime`）聚合用户的用量，并发送一个单一的、合并的事件。这显著减少了计费服务的负载。
2.  **原子更新 (Atomic Updates)**：为防止在分布式或多进程环境中出现数据丢失或重复计算，系统采用原子更新策略。用量记录首先被标记为 `counted`，然后进行聚合，在成功调用计费服务的 API 后，最终被标记为 `reported`。如果报告失败，记录将保持 `counted` 状态（或被重置为 `null`），以便后续重试。

### 1.3 数据聚合与缓存

为确保仪表盘加载快速和分析查询高效，系统使用了一个预聚合的缓存层。

-   **原始数据**：`ModelCall` 表包含粒度级的、每次请求一行的原始数据。虽然这对于详细审计和日志至关重要，但在大日期范围内对其进行时间序列分析可能会很慢。
-   **聚合数据**：`ModelCallStat` 表存储了为每个用户预先计算的每小时和每日摘要。一个 cron 作业（`model.call.stats`）会定期运行，从原始 `ModelCall` 数据中计算这些摘要并存储它们。仪表盘和统计端点主要查询这个缓存表，从而显著加快响应时间。

## 2. 系统架构与数据流

以下步骤概述了从接收 API 请求到生成最终聚合分析的数据流：

1.  **请求拦截**：一个传入的 API 请求（例如 `/v1/chat/completions`）被 `createModelCallMiddleware` 拦截。
2.  **初始记录创建**：中间件创建一个 `status: 'processing'` 的 `ModelCall` 记录，捕获初始元数据，如请求的模型、用户 DID 和请求时间戳。
3.  **提供商交互**：请求被转发给相应的 AI 提供商。中间件用解析出的凭证和最终的模型名称更新 `ModelCall` 记录。
4.  **用量计算**：收到响应后，调用 `createUsageAndCompleteModelCall` 函数。它会计算令牌用量和相应的点数。
5.  **用量记录创建**：创建一个新的 `Usage` 记录，将该交易排队等待计费系统处理。
6.  **异步报告**：触发经过节流的 `reportUsageV2` 函数。它会聚合该用户所有未报告的 `Usage` 记录，并向支付/计费服务发送一个 `createMeterEvent` 请求。
7.  **最终化 ModelCall**：`ModelCall` 记录的状态被更新为 `success` 或 `failed`，并附上最终指标，如持续时间、令牌数和点数。
8.  **计划聚合**：`model.call.stats` cron 作业定期运行，查询 `ModelCall` 表以计算每小时和每日的摘要，然后保存到 `ModelCallStat` 表中。

## 3. 关键组件

### 3.1 API 端点

以下在 `routes/user.ts` 中定义的端点提供了对用量和分析数据的访问。

| 端点 | 方法 | 描述 |
| :--- | :--- | :--- |
| `/api/user/model-calls` | `GET` | 检索 `ModelCall` 原始记录的分页列表。支持按日期、状态、模型和用户进行筛选。管理员可使用 `allUsers=true` 参数。 |
| `/api/user/model-calls/export` | `GET` | 将 `ModelCall` 数据导出为 CSV 文件，应用与列表端点相同的筛选条件。 |
| `/api/user/usage-stats` | `GET` | 获取当前用户仪表盘的聚合用量统计数据，主要来自 `ModelCallStat` 缓存。 |
| `/api/user/admin/user-stats` | `GET` | （仅限管理员）获取所有用户的聚合用量统计数据。 |
| `/api/user/recalculate-stats` | `POST` | （仅限管理员）手动触发对指定时间范围内用户统计数据的重新计算。这是数据校正的关键工具。 |
| `/api/user/cleanup-daily-stats` | `POST` | （仅限管理员）删除指定时间范围内用户的缓存每日统计数据，强制在下次查询时重新计算。 |

### 3.2 Cron 作业

计划任务对于维护分析系统的健康和准确性至关重要。

| 作业名称 | 计划 | 描述 |
| :--- | :--- | :--- |
| `cleanup.stale.model.calls` | `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` | 扫描因服务器崩溃或未处理错误而长时间（例如 >30 分钟）卡在 `processing` 状态的 `ModelCall` 记录。它会将这些记录标记为 `failed` 以确保数据完整性。 |
| `model.call.stats` | `MODEL_CALL_STATS_CRON_TIME` | 通过聚合 `ModelCall` 表中的数据来填充 `ModelCallStat` 表。这是分析缓存机制的核心。 |

## 4. 故障排除与维护

### 4.1 过期或“卡住”的处理中调用

**症状**：`ModelCall` 记录无限期地保持在 `processing` 状态。
**原因**：如果服务器实例在开始一个模型调用之后，但在将其标记为完成或失败之前意外终止，就可能发生这种情况。
**解决方案**：`cleanup.stale.model.calls` cron 作业通过将超时的调用标记为失败来自动解决此问题。超时时间是可配置的（默认为 30 分钟）。通常不需要手动干预。

### 4.2 仪表盘统计数据不正确

**症状**：面向用户或管理员的仪表盘显示的用量、调用次数或点数总计不正确。
**原因**：这可能是由于聚合逻辑中过去的错误，或失败的 cron 作业运行导致 `ModelCallStat` 缓存处于不一致状态。
**解决方案**：使用仅限管理员的 `/api/user/recalculate-stats` 端点。

**重新计算统计数据的请求示例：**

```bash
curl -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "userDid": "z1...userDid",
    "startTime": 1672531200,
    "endTime": 1675209599,
    "dryRun": false
  }' \
  https://your-instance.com/api/user/recalculate-stats
```

-   `userDid`：需要校正统计数据的用户的 DID。
-   `startTime`/`endTime`：定义重新计算周期的 Unix 时间戳。
-   `dryRun`：设置为 `true` 可预览更改而不写入数据库。

此过程将删除指定范围内的现有缓存统计数据，并从 `ModelCall` 原始数据中重新生成，以确保准确性。