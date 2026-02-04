# AIGNE Hub 用户页面重构规格说明

## 1. 概述

### 产品定位
为 AIGNE Hub 的企业用户提供全面的 AI 使用量监控和管理平台，重点解决当前用户页面在数据维度、额度管理和调用监控方面的不足。

### 核心概念
将当前集成在个人中心的用户页面重构为两个独立页面：
1. **Dashboard** - 总览页面：展示额度信息、项目列表、总体统计和趋势图
2. **Project Detail** - 项目详情页面：展示单个项目的详细使用情况和调用历史

### 优先级
重要（近期规划）- 属于产品功能增强

### 目标用户
- B 端企业用户
- 需要按项目（appId）维度查看 AI 使用情况的用户
- 需要监控调用延时、错误率等可用性指标的技术人员
- 不同用户有权限隔离，只能看到自己的数据（基于 userDid）

### 项目范围
从现有个人中心的用户页面重构为两个独立的功能页面，提供更友好的数据展示和更细粒度的监控能力。

## 2. 架构设计

### 数据层
#### 现有数据模型
1. **ModelCall** - 完整的调用记录表
   - 字段：`id`, `providerId`, `model`, `type`, `status`, `duration`, `errorReason`, `appDid`, `userDid`, `totalUsage`, `credits`, `usageMetrics`, `callTime`, `metadata`
   - 已有查询方法：
     - `getCallsByDateRange(params)` - 按时间范围、appDid、model、status 筛选调用记录
     - `getUsageStatsByDateRange(params)` - 按类型聚合统计
     - `getTotalCreditsByDateRange(params)` - 统计总 credits
     - `getModelUsageStats(params)` - 按模型统计使用量

2. **ModelCallStat** - 预聚合统计数据（已实现）
   - 字段：`userDid`(可为 null), `appDid`, `timestamp`, `timeType`, `stats`
   - `stats` 包含：`totalUsage`, `totalCredits`, `totalCalls`, `successCalls`, `avgDuration`, `byType`
   - 聚合维度：
     - 项目级：`(userDid, appDid, timestamp, timeType)`
     - 全局汇总：`userDid` 为空时按全局统计聚合

3. **Usage** - 用量上报记录
   - 字段：`appId`, `model`, `type`, `promptTokens`, `completionTokens`, `usedCredits`, `userDid`, `createdAt`

#### 数据聚合策略（重要）
**明确的查询规则**：

1. **调用明细列表（CallHistory）**
   - 数据源：ModelCall 表
   - 查询方式：**实时查询**（支持分页、筛选、排序）
   - 场景：Project Detail 的调用历史列表
   - 理由：需要展示每一条调用的详细信息，无法预聚合
   - **数据刷新**：随筛选/分页变化刷新

2. **额度信息**
   - 数据源：payment-kit API
   - 查询方式：**实时查询**
   - 场景：Dashboard 的额度信息区域
   - 理由：额度变动需要实时反映
   - **数据刷新**：轮询（polling）

3. **汇总统计数据（Overview/Stats）**
   - 数据源：ModelCallStat 表
   - 查询方式：**预聚合**（按天预先计算）
   - 场景：
     - Dashboard 概览卡片（总 Credits、总 Usage、总 Requests）
     - Project Detail 概览卡片（总 Credits、总 Usage、总 Requests、平均延时）
   - 理由：汇总数据计算量大，适合预聚合

4. **趋势图表数据（Trends/Charts）**
   - 数据源：ModelCallStat 表
   - 查询方式：**预聚合**（按小时或天聚合）
   - 场景：
     - Dashboard 趋势图（按项目堆叠）
     - Project Detail 趋势图（与上一周期对比）
   - 理由：时序数据适合预聚合，查询性能好

**数据一致性保证**：
- 预聚合任务按天执行（cron job）
- 当前统计桶的数据实时计算，历史桶的数据从 ModelCallStat 读取
- 前端展示时，合并当前桶实时数据 + 历史预聚合数据

**重要说明**：
- **只有额度信息与调用历史明细需要实时查询**
- **其他所有汇总数据都从 ModelCallStat 预聚合获取**
- **不使用手动刷新按钮：额度信息轮询更新，调用历史随筛选/分页刷新**

#### 已实现 API 接口（最终落地）
> [!SYNCED] Last synced: 2026-01-27

以下端点已在 `/blocklets/core/api/src/routes/usage.ts` 实现并上线使用：

1. **GET /api/usage/quota**
   - Query params: `startTime`, `endTime`, `timeRange`（可选，默认最近30天）
   - 认证：从 session 获取 `userDid`，不接受前端传参
   - 调用 payment-kit 的额度接口，并计算预计剩余天数
   - Response:
     ```typescript
     {
       total: number,
       remaining: number,
       used: number,
       pendingCredit: number,
       estimatedDaysRemaining: number,
       dailyAvgCredits?: number,
       currency: string
     }
     ```

2. **GET /api/usage/projects**
   - Query params: `startTime`, `endTime`, `timeRange`, `page`, `pageSize`, `sortBy`, `sortOrder`, `allUsers`(仅 admin/owner)
   - 数据源：ModelCallStat 预聚合
   - Response:
     ```typescript
     {
       projects: Array<{
         appDid: string | null,
         appName?: string,
         appLogo?: string,
         appUrl?: string,
         totalCalls: number,
         totalCredits: number,
         avgDuration: number,
         successRate: number,
         lastCallTime: number
       }>,
       total: number,
       page: number,
       pageSize: number
     }
     ```

3. **GET /api/usage/projects/trends**
   - Query params: `startTime`, `endTime`, `granularity`, `allUsers`(仅 admin/owner)
   - Response:
     ```typescript
     {
       projects: Array<{ appDid: string; appName?: string; appLogo?: string; appUrl?: string; lastCallTime: number }>,
       trends: Array<{
         timestamp: number,
         byProject: Record<string, { totalUsage: number; totalCredits: number; totalCalls: number; successCalls: number; avgDuration: number }>
       }>,
       granularity: 'hour' | 'day'
     }
     ```

4. **GET /api/usage/trends**（仅 admin/owner）
   - Query params: `startTime`, `endTime`, `timeRange`
   - Response:
     ```typescript
     {
       trends: Array<{
         timestamp: number,
         calls: number,
         successCalls: number,
         successRate: number,
         avgDuration: number,
         totalCredits: number,
         totalUsage: number
       }>
     }
     ```

5. **GET /api/usage/projects/:appDid/trends**
   - Query params: `startTime`, `endTime`, `granularity`, `allUsers`(仅 admin/owner)
   - Response:
     ```typescript
     {
       project: { appDid: string | null; appName?: string; appLogo?: string; appUrl?: string },
       trends: Array<{
         timestamp: number,
         calls: number,
         successCalls: number,
         avgDuration: number,
         totalCredits: number,
         totalUsage: number
       }>
     }
     ```

6. **GET /api/usage/projects/:appDid/calls**
   - Query params: `startTime`, `endTime`, `page`, `pageSize`, `model`, `status`, `search`, `searchFields`, `minDurationSeconds`, `allUsers`(仅 admin/owner)
   - 数据源：ModelCall 实时查询（分页）
   - Response:
     ```typescript
     {
       list: Array<{
         id: string,
         callTime: number,
         createdAt: string,
         traceId?: string,
         model: string,
         providerId?: string,
         type: string,
         status: 'success' | 'failed' | 'processing',
         duration?: number,
         totalUsage: number,
         usageMetrics?: Record<string, any>,
         credits: number,
         errorReason?: string,
         appDid?: string,
         userDid?: string
       }>,
       count: number,
       page: number,
       pageSize: number
     }
     ```

7. **POST /api/usage/stats/backfill**（仅 admin/owner）
   - Body/Query: `startDate`, `endDate`, `appDid?`, `userDid?`
   - Response: `{ processed: number, dayTimestamps: number[] }`

### 渲染层
#### 前端技术栈
- React 19
- @mui/material v7
- TypeScript
- ahooks (状态管理和请求)
- recharts (图表库)

#### 页面路由
```
/credit-usage             -> 用户使用量 Dashboard
/config/usage             -> 管理员使用量 Dashboard
/usage/projects/:appDid   -> Project Detail 页面
```

#### 组件架构
```
pages/
  admin/
    usage.tsx                 # 管理员使用量 Dashboard
  customer/
    usage.tsx                 # 用户使用量 Dashboard
    credits-balance.tsx       # 额度信息卡片
  usage/
    projects/
      project-page.tsx        # Project Detail 页面
      components/
        project-usage-overview-card.tsx # 项目概览卡片 + 趋势图
        project-call-history.tsx        # 调用历史列表
components/
  analytics/
    usage-overview-card.tsx   # Dashboard 概览卡片 + 趋势图
    project-usage-charts.tsx  # 项目趋势图组件
    project-list.tsx          # 项目列表
    model-usage-stats.tsx     # 模型使用统计（复用旧接口）
```

**重要布局说明**：
- Project Detail 页面：顶部为项目概览卡片（含趋势图），下方直接展示调用历史列表

## 3. 详细功能设计

### Dashboard 页面

#### 3.1 额度信息区域 (CreditsBalance)
- **位置**：页面顶部
- **数据来源**：`/api/user/info` + `/api/usage/quota`（payment-kit）
- **数据刷新**：轮询（30s）
- **展示内容**：
  - 总额度、已用额度、剩余额度
  - **预计剩余天数** 与 **日均消耗** 提示
  - 余额状态提示（不足/逾期）
  - 操作按钮：**充值**、**查看账单**
  - **AutoTopup** 自动充值入口（若启用）

#### 3.2 总览卡片 + 趋势图 (UsageOverviewCard)
- **位置**：额度信息下方
- **数据来源**：`/api/usage/projects/trends`（ModelCallStat 预聚合）
- **展示内容**：
  - 指标卡片：总 Credits、总 Usage、总 Requests
  - 与上一周期对比趋势（↑↓）
  - 趋势图：按项目堆叠面积图（小时/天粒度自动切换）
- **交互**：
  - 时间范围选择（支持快速范围）
  - 点击指标切换趋势图度量

#### 3.3 模型使用统计 (ModelUsageStats)
- **数据来源**：`/api/user/usage-stats`（复用现有接口）
- **展示内容**：模型列表、调用量与成本分布

#### 3.4 项目列表 (ProjectList)
- **位置**：概览卡片下方
- **数据来源**：
  - 用户视角默认使用 `/api/usage/projects/trends` 聚合结果
  - 管理员视角使用 `/api/usage/projects` 分页接口
- **展示内容**：
  - 表格列：项目、总调用、总 Credits、成功率、平均延时、最近调用
  - 分页（每页 20 条）
- **交互**：
  - 点击项目行跳转到 Project Detail 页面

#### 3.5 空状态处理
当用户没有任何调用记录时：
- 显示引导卡片
- 文案："还没有任何调用记录，立即开始使用 AIGNE Hub！"
- 提供快速开始链接（跳转到 API 文档或 Playground）
- 示例代码片段

### Project Detail 页面

#### 3.6 项目概览卡片 (ProjectUsageOverviewCard)
- **位置**：页面顶部
- **数据来源**：`/api/usage/projects/:appDid/trends`（ModelCallStat 预聚合）
- **展示内容**：
  - 指标卡片：总 Credits、总 Usage、总 Requests、平均延时
  - 成功率作为副标题提示
  - 趋势图：与上一周期对比
- **交互**：
  - 时间范围选择器（支持快捷范围）

#### 3.7 调用历史列表 (ProjectCallHistory)
- **位置**：项目概览卡片下方
- **数据来源**：`/api/usage/projects/:appDid/calls`（ModelCall 实时分页）
- **展示内容**：
  - 表格列：状态圆点、时间、Trace ID、模型、类型、Tokens、延时、成本
  - 筛选：搜索（traceId/model/id/userDid）、错误/慢请求筛选
  - 分页（每页 20 条）
- **交互**：
  - 点击行打开抽屉，查看 `usageMetrics`、`metadata`、错误原因等

## 4. 用户体验设计

### 4.1 权限控制
- 所有 API 请求都基于当前登录用户的 `userDid` 进行数据过滤
- 不同用户只能看到自己的项目和调用记录
- 后端验证：从 session 中获取 `userDid`，不信任前端传参

### 4.2 数据刷新策略
- **不使用手动刷新按钮**
- **轮询策略（已实现）**：
  - **额度信息 (CreditsBalance)**：使用 `pollingInterval` 自动刷新（30s）
  - **调用历史列表 (ProjectCallHistory)**：不轮询，仅在筛选/分页/时间范围变化时刷新
  - **统计数据和趋势图**：不轮询（基于预聚合，更新频率低）

### 4.3 加载状态
- 首次加载：显示 Skeleton 占位符
- 刷新数据：显示顶部进度条
- 表格加载：显示 loading 遮罩

### 4.4 错误处理
- API 错误：显示 Toast 错误提示，提供重试按钮
- 网络错误：显示友好的错误页面，带"重新加载"按钮
- 权限错误：跳转到 403 页面

### 4.5 响应式设计
- 移动端：
  - 表格切换为卡片列表
  - 图表简化为关键指标
  - 筛选器折叠到抽屉中
- 平板：适配中等屏幕布局
- 桌面：完整功能展示

## 5. 技术实现指南

### 5.1 项目结构
```
blocklets/core/
  src/
    pages/
      admin/
        usage.tsx                 # 管理员使用量 Dashboard
      customer/
        usage.tsx                 # 用户使用量 Dashboard
        credits-balance.tsx       # 额度信息卡片
      usage/
        projects/
          project-page.tsx        # Project Detail 页面
          components/
            project-usage-overview-card.tsx
            project-call-history.tsx
    components/
      analytics/
        usage-overview-card.tsx
        project-usage-charts.tsx
        project-list.tsx
        model-usage-stats.tsx
  api/
    src/
      routes/
        usage.ts           # 使用量 API
      store/
        models/
          model-call-stat.ts  # 预聚合统计模型
      crons/
        model-call-stats.ts   # 每日预聚合任务
```

### 5.2 ModelCallStat 数据模型（最终落地）
> [!SYNCED] Last synced: 2026-01-27

- 数据表字段（`blocklets/core/api/src/store/models/model-call-stat.ts`）：
  - `userDid: string | null`（管理员汇总场景允许为空）
  - `appDid: string | null`
  - `timestamp: number`（秒）
  - `timeType: 'day' | 'hour'`
  - `stats: DailyStats`（包含 `totalUsage/totalCredits/totalCalls/successCalls/avgDuration/totalDuration?` 与 `byType`）
- **不包含 `modelId` 字段**；模型维度统计继续复用现有 `/api/user/usage-stats`（前端 `ModelUsageStats` 依赖）。
- 预聚合策略：按天生成历史统计；当前统计桶内实时补算并与历史合并。

### 5.3 复用现有代码
参考 `ai-model-rates/index.tsx` 的实现：
- Table 组件用法
- 筛选器设计
- 分页逻辑
- API 请求封装（useRequest from ahooks）
- 响应式布局

### 5.4 性能优化
- 使用 React.memo 避免不必要的重渲染
- 虚拟滚动（如果列表超过 100 条）
- 图表使用懒加载（React.lazy）
- API 响应缓存（SWR 或 ahooks 的缓存策略）

## 6. 决策总结

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 页面数量 | 2个独立页面 | Dashboard 和 Project Detail 功能明确分离，避免单页过于复杂 |
| 数据聚合 | 预聚合为主 + 少量实时 | **调用明细实时查询**、**额度信息轮询**，其他汇总数据从预聚合获取 |
| API 架构 | 拆分成多个小接口 | 每个接口单一职责，前端可以并行请求，提高性能 |
| 延时统计 | 平均延时（avgDuration） | 来自 ModelCallStat 预聚合统计 |
| 项目定义 | 按 appDid 聚合 | 用户调用时传入 appDid，直接使用 ModelCall 表的 appDid 字段 |
| 额度来源 | payment-kit API | 复用现有的支付系统，避免重复开发，增加预计剩余天数计算 |
| 刷新策略 | 无手动刷新按钮 | 额度信息轮询；调用历史随筛选/分页刷新；统计数据不轮询 |
| 分页策略 | 传统分页 | 数据量小（<1000条），不需要虚拟滚动 |
| 权限控制 | 基于 userDid | 后端验证，不同用户数据隔离 |
| UI 框架 | @mui/material v7 | 与现有代码保持一致 |
| 图表库 | recharts | 用于趋势图展示 |

## Finalized Implementation Details
> Synced on: 2026-01-27

### API Interfaces
- `GET /api/usage/quota`
- `GET /api/usage/projects`
- `GET /api/usage/projects/trends`
- `GET /api/usage/trends`（admin/owner）
- `GET /api/usage/projects/:appDid/trends`
- `GET /api/usage/projects/:appDid/calls`
- `POST /api/usage/stats/backfill`（admin/owner）

### Data Structures
- `UsageQuota`：包含 `pendingCredit`、`dailyAvgCredits`、`currency`
- `DailyStats`：包含 `avgDuration` 与 `successCalls`

### Module Structure
- `blocklets/core/src/pages/customer/usage.tsx`
- `blocklets/core/src/pages/usage/projects/project-page.tsx`
- `blocklets/core/api/src/routes/usage.ts`
- `blocklets/core/api/src/crons/model-call-stats.ts`

### Confirmed Scope Adjustments
- 项目详情不包含模型分布与 P95 指标
- 额度明细列表不在当前范围内

## 7. MVP 范围

### 必须包含（MVP）
- ✅ Dashboard 基础展示：额度信息（含预计剩余天数、充值/自动充值）、项目列表、总体统计
- ✅ Dashboard 趋势图（基于预聚合）
- ✅ Project Detail 页面：项目概览（指标 + 趋势图）
- ✅ 调用历史列表（实时查询）
- ✅ 项目列表分页
- ✅ 时间范围选择
- ✅ 权限控制（按 userDid 过滤）
- ✅ 空状态引导页面
- ✅ ModelCallStat 数据库改造（增加 appDid 字段）
- ✅ 预聚合 cron job（按天执行）

## 8. 风险与挑战

### 技术风险
1. **预聚合数据准确性**
   - 风险：预聚合任务失败可能导致统计数据不准确
   - 缓解：添加任务监控和告警，失败时自动重试，保留详细日志

2. **payment-kit 集成稳定性**
   - 风险：依赖第三方服务，可能不稳定
   - 缓解：添加重试机制和降级方案（显示缓存数据）

3. **权限验证遗漏**
   - 风险：可能泄露其他用户的数据
   - 缓解：所有 API 强制加上 userDid 过滤，单元测试覆盖

4. **轮询对服务器压力**
   - 风险：大量用户同时轮询可能增加服务器负载
   - 缓解：合理设置轮询间隔（30-60秒），使用静默更新，添加防抖

### 业务风险
1. **用户理解成本**
   - 风险：新页面结构可能导致用户困惑
   - 缓解：提供引导页面和文档，逐步迁移

2. **性能问题**
   - 风险：大数据量用户可能遇到加载慢的问题
   - 缓解：分阶段加载，优先展示关键指标

## 9. 实施结果（已完成）

1. **数据层与预聚合**
   - ModelCallStat 已支持 `appDid` 维度
   - 预聚合任务按天执行（`crons/model-call-stats.ts`）

2. **后端 API（usage.ts）**
   - `/api/usage/quota`
   - `/api/usage/projects`
   - `/api/usage/projects/trends`
   - `/api/usage/trends`（admin/owner）
   - `/api/usage/projects/:appDid/trends`
   - `/api/usage/projects/:appDid/calls`
   - `/api/usage/stats/backfill`（admin/owner）

3. **前端页面**
   - 用户 Dashboard：`CreditsBalance`、`UsageOverviewCard`、`ModelUsageStats`、`ProjectList`
   - Project Detail：`ProjectUsageOverviewCard`、`ProjectCallHistory`

## 10. 开放问题

1. **appDid 的友好名称**
   - 问题：appDid 是 DID 格式，不够友好
   - 建议：允许用户为项目设置别名？

2. **历史数据保留策略**
   - 问题：ModelCall 表会无限增长
   - 建议：定期归档或删除旧数据？保留多久？

3. **多租户支持**
   - 问题：未来是否需要团队级别的数据聚合？
   - 建议：预留扩展点，但 MVP 暂不实现

4. **轮询间隔优化**
   - 问题：固定轮询间隔可能不够灵活
   - 建议：根据页面活跃度动态调整轮询间隔？

## 11. 验收标准

### 功能验收
- [ ] 用户能看到当前的额度信息、预计剩余天数与充值/自动充值入口
- [ ] 用户能看到所有项目的列表和概要信息
- [ ] 用户能点击项目查看详细的调用历史
- [ ] 用户能看到每个项目的平均延时统计（从预聚合）
- [ ] 用户能看到项目概览趋势图
- [ ] 用户能看到调用列表的字段（状态圆点、时间、Trace ID、模型、类型、tokens、延时、成本）
- [ ] 用户能筛选时间范围、搜索关键词、错误/慢请求
- [ ] 用户能对列表进行分页浏览
- [ ] 不同用户只能看到自己的数据
- [ ] 额度信息自动轮询更新

### 性能验收
- [ ] Dashboard 首次加载时间 < 2秒
- [ ] Project Detail 首次加载时间 < 3秒
- [ ] 列表分页切换响应时间 < 500ms
- [ ] 支持至少 1000 条调用记录的流畅浏览

### UI 验收
- [ ] 移动端适配正常
- [ ] 空状态显示友好的引导信息
- [ ] 错误状态有明确的提示和重试入口
- [ ] 加载状态显示 Skeleton 或进度条
- [ ] 与现有 AIGNE Hub 页面风格一致
