# 用户服务

## 概述

用户服务是一个核心组件，负责管理所有以用户为中心的数据和操作。它提供了一套 API 端点，用于处理用户信息、基于积分的计费以及详细的使用情况分析。该服务对于个人用户账户管理和整个系统的管理监督都至关重要。

从运营角度来看，该服务旨在实现高性能和数据完整性。其一个关键的架构特性是使用统计数据的缓存机制，该机制会预先计算并存储聚合数据，以便为分析查询提供快速响应，并防止主数据库出现高计算负载。

## 关键概念

### 基于积分的计费

系统与外部支付套件集成，以支持基于积分的计费模型。启用后（`creditBasedBillingEnabled` 为 true），用户服务将处理：
- 获取用户积分余额。
- 检索交易和授予历史记录。
- 为用户提供支付链接以购买更多积分。

如果支付套件未运行或被禁用，该服务会平稳降级，与积分相关的端点将返回错误或指示该功能已禁用。

### 使用统计数据缓存

为确保响应迅速且高效地检索使用数据，用户服务对模型调用统计数据采用了复杂的缓存策略。系统不会在每次请求时都从原始的 `ModelCalls` 表中计算聚合数据（这是一种资源密集型操作），而是预先计算这些统计数据并将其存储在 `ModelCallStat` 表中。

**缓存逻辑：**

1.  **粒度**：统计数据按小时聚合。这在数据新鲜度和计算开销之间取得了良好的平衡。
2.  **按需计算**：当请求过去某个时段的每小时统计数据时，系统首先检查 `ModelCallStat` 缓存。
3.  **缓存未命中**：如果数据不在缓存中（即“缓存未命中”），服务将对 `ModelCalls` 表运行优化的 SQL 查询，以计算该特定小时的统计数据。
4.  **缓存存储**：新计算出的统计数据随后会保存到 `ModelCallStat` 表中，确保后续对同一小时的请求直接从缓存中获取数据。
5.  **实时数据**：对于当前正在进行的小时，统计数据总是实时计算，以提供最新的信息。

这种设计显著降低了所有使用统计数据端点的数据库负载和 API 延迟。它是系统可扩展性和性能的关键组成部分。为了维护和故障排查，我们提供了仅限管理员使用的端点，以便在必要时手动重新计算这些缓存的统计数据。

## API 端点

以下部分详细介绍了可用的 API 端点、它们的参数及其功能。

---

### 用户信息

#### 获取用户信息

检索当前已认证用户的全面信息，包括个人资料详情和积分余额（如果适用）。

-   **Endpoint**: `GET /info`
-   **Permissions**: 已认证用户

**返回**

<x-field-group>
  <x-field data-name="user" data-type="object" data-desc="用户的个人资料信息。">
    <x-field data-name="did" data-type="string" data-desc="用户的分布式身份标识符。"></x-field>
    <x-field data-name="fullName" data-type="string" data-desc="用户的全名。"></x-field>
    <x-field data-name="email" data-type="string" data-desc="用户的电子邮件地址。"></x-field>
    <x-field data-name="avatar" data-type="string" data-desc="用户头像的 URL。"></x-field>
  </x-field>
  <x-field data-name="creditBalance" data-type="object" data-desc="用户的积分余额详情。如果基于积分的计费被禁用，则为 Null。">
    <x-field data-name="balance" data-type="number" data-desc="可用的积分余额。"></x-field>
    <x-field data-name="total" data-type="number" data-desc="授予的总积分。"></x-field>
    <x-field data-name="grantCount" data-type="number" data-desc="收到的积分授予次数。"></x-field>
    <x-field data-name="pendingCredit" data-type="number" data-desc="来自待处理交易的积分。"></x-field>
  </x-field>
  <x-field data-name="paymentLink" data-type="string" data-desc="供用户购买积分的短 URL。"></x-field>
  <x-field data-name="currency" data-type="object" data-desc="用于支付的货币。"></x-field>
  <x-field data-name="enableCredit" data-type="boolean" data-desc="指示基于积分的计费在系统上是否已激活。"></x-field>
  <x-field data-name="profileLink" data-type="string" data-desc="指向用户积分使用情况个人资料页面的短 URL。"></x-field>
</x-field-group>

---

### 积分管理

这些端点仅在启用基于积分的计费时才有效。

#### 获取积分授予记录

检索已认证用户的积分授予记录的分页列表。

-   **Endpoint**: `GET /credit/grants`
-   **Permissions**: 已认证用户

**查询参数**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="分页的页码（从 1 开始）。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="每页的项目数（最多 100）。"></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="时间范围开始的 Unix 时间戳。"></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="时间范围结束的 Unix 时间戳。"></x-field>
</x-field-group>

#### 获取积分交易记录

检索已认证用户的积分交易记录的分页列表。

-   **Endpoint**: `GET /credit/transactions`
-   **Permissions**: 已认证用户

**查询参数**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="分页的页码（从 1 开始）。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="每页的项目数（最多 100）。"></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="时间范围开始的 Unix 时间戳。"></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="时间范围结束的 Unix 时间戳。"></x-field>
</x-field-group>

#### 获取积分余额

检索已认证用户的当前积分余额。

-   **Endpoint**: `GET /credit/balance`
-   **Permissions**: 已认证用户

#### 获取积分支付链接

提供用于购买积分的短 URL。

-   **Endpoint**: `GET /credit/payment-link`
-   **Permissions**: 已认证用户

---

### 模型调用历史

#### 获取模型调用记录

检索模型调用记录的分页列表。支持广泛的筛选功能。

-   **Endpoint**: `GET /model-calls`
-   **Permissions**: 已认证用户。如果 `allUsers=true`，则需要管理员/所有者角色。

**查询参数**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="分页的页码。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="每页的项目数（最多 100）。"></x-field>
    <x-field data-name="startTime" data-type="string" data-required="false" data-desc="时间范围开始的 Unix 时间戳。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="false" data-desc="时间范围结束的 Unix 时间戳。"></x-field>
    <x-field data-name="search" data-type="string" data-required="false" data-desc="对调用记录进行关键词搜索。"></x-field>
    <x-field data-name="status" data-type="string" data-required="false" data-desc="按状态筛选。可以是 'success'、'failed' 或 'all'。"></x-field>
    <x-field data-name="model" data-type="string" data-required="false" data-desc="按特定模型名称筛选。"></x-field>
    <x-field data-name="providerId" data-type="string" data-required="false" data-desc="按特定提供商 ID 筛选。"></x-field>
    <x-field data-name="appDid" data-type="string" data-required="false" data-desc="按调用应用程序的 DID 筛选。"></x-field>
    <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="如果为 true，则返回所有用户的记录。需要管理员/所有者角色。"></x-field>
</x-field-group>

#### 导出模型调用记录

将模型调用记录导出为 CSV 文件。支持与 `/model-calls` 端点相同的筛选功能。

-   **Endpoint**: `GET /model-calls/export`
-   **Permissions**: 已认证用户。如果 `allUsers=true`，则需要管理员/所有者角色。

**查询参数**

支持与 `GET /model-calls` 相同的查询参数，但 `page` 和 `pageSize` 除外。导出限制硬编码为 10,000 条记录。

---

### 使用统计

#### 获取使用统计数据

检索给定时间范围内的聚合使用统计数据。此数据由缓存系统提供。

-   **Endpoint**: `GET /usage-stats`
-   **Permissions**: 已认证用户

**查询参数**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="时间范围开始的 Unix 时间戳。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="时间范围结束的 Unix 时间戳。"></x-field>
</x-field-group>

#### 获取周/月度对比

检索与前一周或前一月的使用指标对比。

-   **Endpoint**: `GET /weekly-comparison`
-   **Endpoint**: `GET /monthly-comparison`
-   **Permissions**: 已认证用户

---

### 管理操作

这些端点用于系统维护和故障排查。

#### 获取所有用户统计数据（管理员）

检索所有用户合计的聚合使用统计数据。

-   **Endpoint**: `GET /admin/user-stats`
-   **Permissions**: 管理员

**查询参数**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="时间范围开始的 Unix 时间戳。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="时间范围结束的 Unix 时间戳。"></x-field>
</x-field-group>

#### 重新计算统计缓存

手动触发对特定用户和时间范围内的每小时使用统计数据进行重新计算。这对于纠正数据差异或在系统变更后回填数据非常有用。

-   **Endpoint**: `POST /recalculate-stats`
-   **Permissions**: 管理员

**请求体**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="需要重新计算统计数据的用户的 DID。"></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="重新计算周期的开始 Unix 时间戳。"></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="重新计算周期的结束 Unix 时间戳。"></x-field>
    <x-field data-name="dryRun" data-type="boolean" data-required="false" data-desc="如果为 true，端点将报告其将要执行的操作，而不会实际执行这些操作。"></x-field>
</x-field-group>

#### 清理每日统计缓存

为特定用户和时间范围从缓存中移除旧的每日统计条目。

-   **Endpoint**: `POST /cleanup-daily-stats`
-   **Permissions**: 管理员

**请求体**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="需要清理统计数据的用户的 DID。"></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="清理周期的开始 Unix 时间戳。"></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="清理周期的结束 Unix 时间戳。"></x-field>
</x-field-group>