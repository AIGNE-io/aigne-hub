# 用户服务 API

## 概述

用户服务 API 是系统的基础组件，旨在管理所有与用户相关的操作。其职责包括处理用户认证、跟踪 AI 模型使用情况、管理基于积分的计费，以及提供详细的分析和报告。该服务对于最终用户体验以及管理监督和系统维护都至关重要。

从操作角度来看，该服务直接与数据库交互，以存储和检索用户数据及模型调用日志。它公开了一组 RESTful 端点，供前端应用程序和其他后端服务使用。

## 架构与关键概念

### 数据模型

该服务依赖几个关键的数据模型来运行。理解这些模型对于故障排查和维护至关重要。

*   **`ModelCall`**：这是用于跟踪使用情况的核心数据模型。`ModelCall` 表中的每条记录代表与 AI 模型的一次独立的交互。它存储了有关调用的全面详细信息，包括：
    *   **提供商和模型**：使用了哪个 AI 提供商和具体模型（例如，OpenAI、gpt-4）。
    *   **使用指标**：令牌计数（输入/输出）或其他相关的消耗单位。
    *   **成本**：该次调用所计算出的积分成本。
    *   **状态**：调用是成功、失败还是仍在处理中。
    *   **时间戳和持续时间**：调用发生的时间以及持续时长。
    *   **标识符**：链接到发起调用的用户（`userDid`）和应用程序（`appDid`）。

*   **`ModelCallStat`**：为优化分析查询的性能，系统将 `ModelCall` 表中的数据预聚合到 `ModelCallStat` 中。这些记录包含特定时间间隔（例如，每小时、每天）的汇总统计信息，从而减少了在提供仪表盘数据时进行昂贵的实时计算的需求。用于重新计算和清理统计数据的管理端点操作此表。

### 认证与授权

安全性在 Express.js 框架的中间件层进行管理。

*   **会话中间件**：大多数端点受 `sessionMiddleware` 保护。此中间件检查传入请求中是否包含有效的会话令牌，对用户进行身份验证，并将用户信息（如 `userDid` 和 `role`）附加到请求对象上。未经认证的请求将被拒绝，并返回 `401 Unauthorized` 状态。
*   **管理员中间件**：某些提供全系统数据或执行敏感维护任务的端点会受到 `ensureAdmin` 中间件的进一步保护。此检查确保已认证用户的角色为 `admin` 或 `owner`，如果权限不足，则返回 `403 Forbidden` 错误。

## API 端点

本节提供了用户服务公开的所有端点的详细参考。

### 用户信息

#### GET /info

检索当前已认证用户的全面信息，包括其个人资料以及（如果启用）其积分余额。

*   **权限**：已认证用户
*   **响应体**：
    *   `user`：包含用户详细信息（`did`、`fullName`、`email`、`avatar`）的对象。
    *   `creditBalance`：包含积分详细信息（`balance`、`total`、`grantCount`、`pendingCredit`）的对象。如果禁用了基于积分的计费，则此值为 `null`。
    *   `paymentLink`：为用户预先生成的短 URL，用于购买更多积分。
    *   `currency`：用于支付的货币配置。
    *   `enableCredit`：一个布尔标志，指示基于积分的计费是否已激活。
    *   `profileLink`：一个预先生成的短 URL，指向用户的积分使用情况仪表盘。

### 积分管理

仅当 `Config.creditBasedBillingEnabled` 为 `true` 时，这些端点才可用。

#### GET /credit/grants

获取用户的积分赠款分页列表。赠款是指向用户账户中增加积分，通常来自促销活动或初始注册。

*   **权限**：已认证用户
*   **查询参数**：
    *   `page` (number, optional)：分页的页码。
    *   `pageSize` (number, optional)：每页的项目数（最大 100）。
    *   `start` (number, optional)：查询范围的开始时间戳。
    *   `end` (number, optional)：查询范围的结束时间戳。

#### GET /credit/transactions

获取积分交易（如购买）的分页列表。

*   **权限**：已认证用户
*   **查询参数**：
    *   `page` (number, optional)：分页的页码。
    *   `pageSize` (number, optional)：每页的项目数（最大 100）。
    *   `start` (number, optional)：查询范围的开始时间戳。
    *   `end` (number, optional)：查询范围的结束时间戳。

#### GET /credit/balance

检索当前已认证用户的积分余额。

*   **权限**：已认证用户

#### GET /credit/payment-link

生成并返回一个短 URL，该 URL 将用户引导至支付页面以购买积分。

*   **权限**：已认证用户

### 模型调用历史

#### GET /model-calls

检索 AI 模型调用的分页历史记录。这是向用户和管理员显示使用日志的主要端点。

*   **权限**：已认证用户。如果 `allUsers=true`，则需要管理员或所有者角色。
*   **查询参数**：
    *   `page` (number, optional, default: 1)：分页的页码。
    *   `pageSize` (number, optional, default: 50)：每页的项目数（最大 100）。
    *   `startTime` (string, optional)：查询范围的开始时间戳（Unix 时间）。
    *   `endTime` (string, optional)：查询范围的结束时间戳（Unix 时间）。
    *   `search` (string, optional)：用于按模型、`appDid` 或 `userDid` 筛选的搜索词。
    *   `status` (string, optional)：按调用状态筛选。可以是 `success`、`failed` 或 `all`。
    *   `model` (string, optional)：按特定模型名称筛选。
    *   `providerId` (string, optional)：按特定 AI 提供商 ID 筛选。
    *   `appDid` (string, optional)：按特定应用程序 DID 筛选。
    *   `allUsers` (boolean, optional)：如果为 `true`，则检索所有用户的调用。**需要管理员权限。**

#### GET /model-calls/export

将模型调用历史记录导出为 CSV 文件。此端点支持与 `GET /model-calls` 相同的筛选功能，但专为批量数据导出和离线分析而设计。

*   **权限**：已认证用户。如果 `allUsers=true`，则需要管理员或所有者角色。
*   **查询参数**：与 `GET /model-calls` 相同，但不包括分页参数（`page`、`pageSize`）。导出限制硬编码为 10,000 条记录。
*   **响应**：一个 `text/csv` 文件，带有 `Content-Disposition` 标头以触发文件下载。

### 使用情况统计

#### GET /usage-stats

为已认证用户提供指定时间范围内的汇总使用情况统计信息。此端点为面向用户的分析仪表盘提供支持。

*   **权限**：已认证用户
*   **查询参数**：
    *   `startTime` (string, required)：查询范围的开始时间戳。
    *   `endTime` (string, required)：查询范围的结束时间戳。
*   **响应体**：
    *   `summary`：一个包含顶层统计数据的对象，如总调用次数、总积分消耗以及按调用类型（例如 `chatCompletion`、`embedding`）细分的使用情况。
    *   `dailyStats`：一个对象数组，每个对象代表时间范围内的某一天及其使用情况和积分的摘要。
    *   `modelStats`：该时间段内最常用模型的列表。
    *   `trendComparison`：将指定时期与前一时期进行比较的数据，以显示使用量的增长或下降。

#### GET /weekly-comparison

计算并返回当前周（至今）与上一个完整周之间的使用指标比较。

*   **权限**：已认证用户
*   **响应体**：
    *   `current`：一个包含当前周 `totalUsage`、`totalCredits` 和 `totalCalls` 的对象。
    *   `previous`：上一周的相同指标。
    *   `growth`：每个指标的百分比变化。

#### GET /monthly-comparison

计算并返回当前月（至今）与上一个完整月之间的使用指标比较。

*   **权限**：已认证用户
*   **响应体**：
    *   `current`：一个包含当前月 `totalUsage`、`totalCredits` 和 `totalCalls` 的对象。
    *   `previous`：上一月的相同指标。
    *   `growth`：每个指标的百分比变化。

### 管理端点

这些端点用于系统维护、监控和故障排查。访问权限仅限于具有 `admin` 或 `owner` 角色的用户。

#### GET /admin/user-stats

提供指定时间范围内所有用户的汇总使用情况统计信息。这是 `GET /usage-stats` 的管理员版本。

*   **权限**：管理员或所有者
*   **查询参数**：
    *   `startTime` (string, required)：查询范围的开始时间戳。
    *   `endTime` (string, required)：查询范围的结束时间戳。

#### POST /recalculate-stats

手动触发对特定用户在给定时间范围内的汇总 `ModelCallStat` 数据进行重新计算。这是一个关键工具，用于纠正可能因处理失败或错误而导致的数据不一致问题。

*   **权限**：管理员或所有者
*   **请求体**：
    *   `userDid` (string, required)：需要重新计算统计数据的用户的 DID。
    *   `startTime` (string, required)：重新计算窗口的开始时间戳。
    *   `endTime` (string, required)：重新计算窗口的结束时间戳。
    *   `dryRun` (boolean, optional)：如果为 `true`，该端点将报告它将要执行的操作（例如，要删除的记录数和要重新计算的小时数），而不会实际执行这些操作。强烈建议在执行操作前使用此选项来验证操作范围。
*   **操作**：
    1.  识别时间范围内该用户的所有每小时 `ModelCallStat` 记录。
    2.  如果不是 `dryRun`，则删除这些记录。
    3.  然后，它会遍历该范围内的每个小时，并重新触发聚合逻辑，以从原始 `ModelCall` 数据创建新的 `ModelCallStat` 记录。

#### POST /cleanup-daily-stats

删除特定用户在时间范围内的每日汇总统计信息（`timeType` 为 'day' 的 `ModelCallStat` 记录）。这可用于数据生命周期管理或在重新计算前清除损坏的每日摘要。

*   **权限**：管理员或所有者
*   **请求体**：
    *   `userDid` (string, required)：要为其执行清理操作的用户的 DID。
    *   `startTime` (string, required)：清理窗口的开始时间戳。
    *   `endTime` (string, required)：清理窗口的结束时间戳。