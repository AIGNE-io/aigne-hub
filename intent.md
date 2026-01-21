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

2. **ModelCallStat** - 预聚合统计数据（⚠️ 需要修改）
   - **现有字段**：`userDid`, `timestamp`, `timeType`, `stats`
   - **需要新增**：
     - `appDid` (可为 null，null 表示用户级聚合)
     - `modelId` (可为 null，用于模型级聚合查询优化)
   - `stats` 包含：`totalUsage`, `totalCredits`, `totalCalls`, `successCalls`, `byType`
   - **现有方法**：`getHourlyStats(userDid, hourTimestamp)` - 获取用户级小时聚合
   - **需要新增**：`getHourlyStatsByApp(userDid, appDid, hourTimestamp)` - 获取项目级小时聚合
   - **聚合维度**：
     - 用户级：`(userDid, timestamp, timeType)` where `appDid IS NULL AND modelId IS NULL`
     - 项目级：`(userDid, appDid, timestamp, timeType)` where `appDid IS NOT NULL AND modelId IS NULL`
     - 模型级：可按 `modelId` 快速聚合统计

3. **Usage** - 用量上报记录
   - 字段：`appId`, `model`, `type`, `promptTokens`, `completionTokens`, `usedCredits`, `userDid`, `createdAt`

#### 数据聚合策略（重要）
**明确的查询规则**：

1. **调用明细列表（CallHistory）**
   - 数据源：ModelCall 表
   - 查询方式：**实时查询**（支持分页、筛选、排序）
   - 场景：Project Detail 的调用历史列表
   - 理由：需要展示每一条调用的详细信息，无法预聚合
   - **数据刷新**：轮询（polling）

2. **额度信息和明细**
   - 数据源：payment-kit API
   - 查询方式：**实时查询**
   - 场景：Dashboard 的额度信息区域、额度明细列表
   - 理由：额度变动需要实时反映
   - **数据刷新**：轮询（polling）

3. **汇总统计数据（Overview/Stats）**
   - 数据源：ModelCallStat 表
   - 查询方式：**预聚合**（按小时预先计算）
   - 场景：
     - Dashboard 的总览卡片（总调用数、总 tokens、总 credits、成功率）
     - Project Detail 的统计卡片（项目总调用数、成功率、平均延时、**P95延时**）
   - 理由：汇总数据计算量大，适合预聚合
   - **关键指标**：P95延时应从 ModelCallStat 预聚合计算，**不需要实时统计**

4. **趋势图表数据（Trends/Charts）**
   - 数据源：ModelCallStat 表
   - 查询方式：**预聚合**（按小时或天聚合）
   - 场景：
     - Dashboard 的趋势图（最近 30 天调用量趋势）
     - Project Detail 的趋势图（请求数 + 延时，双Y轴）
   - 理由：时序数据适合预聚合，查询性能好

5. **模型分布数据**
   - 数据源：ModelCallStat 表（通过 modelId 快速聚合）
   - 查询方式：**预聚合**
   - 场景：Project Detail 的模型分布饼图和表格
   - 理由：通过新增的 modelId 字段快速聚合

**数据一致性保证**：
- 预聚合任务应该每小时执行一次（cron job）
- 当前小时的数据实时计算，历史小时的数据从 ModelCallStat 读取
- 前端展示时，合并当前小时实时数据 + 历史预聚合数据

**重要说明**：
- **只有额度变化、额度明细和调用历史明细需要实时查询**
- **其他所有汇总数据（包括 P95 延时）都应该从 ModelCallStat 预聚合获取**
- **不使用手动刷新按钮，调用历史列表和额度信息采用轮询方式自动刷新**

#### 新增 API 接口需求
需要创建以下 API 端点（在 `/blocklets/core/api/src/routes/` 下）：

**重要设计原则**：
- **拆分成多个小接口，避免单个接口返回过多数据**
- 每个接口只负责单一职责
- 前端可以并行请求多个接口以提高性能

**Dashboard 相关接口**：

1. **GET /api/usage/quota**
   - Query params: `userDid`
   - 调用 payment-kit 的额度接口
   - **新增计算**：预计剩余天数（从最近30天的日均消耗和当前余额计算）
   - Response:
     ```typescript
     {
       total: number,
       remaining: number,
       used: number,
       estimatedDaysRemaining: number  // 新增：预计剩余天数
     }
     ```

2. **GET /api/usage/overview**
   - Query params: `userDid`, `timeRange` (可选，默认最近30天)
   - 从 ModelCallStat 预聚合（用户级）
   - Response:
     ```typescript
     {
       totalCalls: number,
       totalTokens: number,
       totalCredits: number,
       successRate: number
     }
     ```

3. **GET /api/usage/projects**
   - Query params: `userDid`, `timeRange` (可选，默认最近30天)
   - 从 ModelCallStat 预聚合
   - Response:
     ```typescript
     {
       projects: Array<{
         appDid: string,
         totalCalls: number,
         totalCredits: number,
         successRate: number,
         lastCallTime: number
       }>
     }
     ```

4. **GET /api/usage/trends**
   - Query params: `userDid`, `timeRange` (可选，默认最近30天), `granularity` ('hour' | 'day')
   - 从 ModelCallStat 预聚合（按小时/天）
   - Response:
     ```typescript
     {
       trends: Array<{
         timestamp: number,
         calls: number,
         successRate: number,
         avgDuration: number
       }>
     }
     ```

5. **GET /api/usage/quota-details** (⚠️ 最后实现)
   - Query params: `userDid`, `page`, `pageSize`, `type` (可选)
   - 调用 payment-kit 的额度变动明细接口
   - **注意**：type 的详细类型需要先从 payment-kit 了解，此功能放到最后实现
   - Response:
     ```typescript
     {
       list: Array<{
         id: string,
         amount: number,
         type: string,  // 具体类型待确认
         createdAt: number,
         description: string,
         metadata?: Record<string, any>
       }>,
       count: number,
       page: number,
       pageSize: number
     }
     ```

**Project Detail 相关接口**：

6. **GET /api/usage/projects/:appDid/stats**
   - Query params: `userDid`, `startTime`, `endTime`
   - 从 ModelCallStat 预聚合（项目级）
   - **关键指标**：P95延时从预聚合计算，**不需要实时统计**
   - Response:
     ```typescript
     {
       appDid: string,
       totalCalls: number,
       totalTokens: number,
       totalCredits: number,
       successRate: number,
       avgDuration: number,
       p95Duration: number  // 从 ModelCallStat 预聚合
     }
     ```

7. **GET /api/usage/projects/:appDid/trends**
   - Query params: `userDid`, `startTime`, `endTime`, `granularity` ('hour' | 'day')
   - 从 ModelCallStat 预聚合（项目级 + 小时/天）
   - **展示指标**：请求数和延时（双Y轴）
   - Response:
     ```typescript
     {
       trends: Array<{
         timestamp: number,
         calls: number,
         avgDuration: number,
         totalCredits: number  // hover 时显示更详细的聚合数据
       }>
     }
     ```

8. **GET /api/usage/projects/:appDid/models**
   - Query params: `userDid`, `startTime`, `endTime`
   - 从 ModelCallStat 通过 modelId 快速聚合
   - Response:
     ```typescript
     {
       modelDistribution: Array<{
         model: string,
         calls: number,
         percentage: number
       }>
     }
     ```

9. **GET /api/usage/projects/:appDid/calls**
   - Query params: `userDid`, `startTime`, `endTime`, `page`, `pageSize`, `model`, `status`
   - 从 ModelCall 实时查询（分页）
   - **数据刷新**：轮询
   - Response:
     ```typescript
     {
       list: Array<{
         id: string,
         callTime: number,
         model: string,  // 只显示模型名，不显示提供商
         type: string,
         status: 'success' | 'failed' | 'processing',
         duration: number,
         totalUsage: number,  // tokens
         credits: number,
         errorReason?: string
       }>,
       count: number,
       page: number,
       pageSize: number
     }
     ```

### 渲染层
#### 前端技术栈
- React 19
- @mui/material v7
- TypeScript
- ahooks (状态管理和请求)
- recharts (图表库)

#### 页面路由
```
/usage/dashboard          -> Dashboard 页面
/usage/projects/:appDid   -> Project Detail 页面
```

#### 组件架构
```
pages/
  usage/
    dashboard/
      index.tsx              # Dashboard 路由入口
      dashboard-page.tsx     # Dashboard 主页面
      components/
        quota-section.tsx    # 额度信息区域（总额度、剩余、进度条、自动充值按钮）
        project-list.tsx     # 项目列表（按 appDid 聚合）
        overview-cards.tsx   # 总览卡片（总调用、总 tokens 等）
        trend-chart.tsx      # 趋势图表（基于 ModelCallStat 预聚合）
        quota-details-list.tsx # 额度明细列表（⚠️ 最后实现，从 payment-kit）
    projects/
      index.tsx              # Project Detail 路由入口
      project-detail-page.tsx # Project Detail 主页面
      components/
        project-stats.tsx    # 项目统计卡片（基于 ModelCallStat 预聚合，包含P95）
        project-trend-chart.tsx # 项目趋势图（双Y轴：请求数+延时）
        model-distribution.tsx # 模型分布饼图（右侧小块区域）
        call-history.tsx     # 调用历史列表（实时查询 ModelCall，分页，轮询）
```

**重要布局说明**：
- Project Detail 页面：趋势图和模型分布饼图展示在同一行，饼图在趋势图右边一小块区域
- 趋势图下面直接展示 call list，不需要错误率统计和延时统计的区域

## 3. 详细功能设计

### Dashboard 页面

#### 3.1 额度信息区域 (QuotaSection)
- **位置**：页面顶部
- **数据来源**：`/api/usage/quota` (payment-kit)
- **数据刷新**：轮询
- **展示内容**：
  - 总额度、已用额度、剩余额度（大数字展示）
  - **预计剩余天数**（新增，从最近30天日均消耗计算）
  - 额度使用百分比（进度条）
  - 最近7天额度消耗趋势（迷你折线图）
  - **自动充值按钮**（新增，点击后打开 payment-kit 提供的弹窗）
- **UI 设计**：
  - 使用 @mui/material Card 组件
  - 响应式布局（移动端垂直堆叠）
  - 颜色指示：绿色（充足）、橙色（<30%）、红色（<10%）
- **交互**：
  - 点击自动充值按钮，使用 payment-kit 的 modal 组件打开充值弹窗

#### 3.2 总览卡片 (OverviewCards)
- **位置**：额度信息下方
- **数据来源**：`/api/usage/overview`（**从 ModelCallStat 预聚合**）
- **展示内容**：
  - 卡片1：总调用次数
  - 卡片2：总 Token 数
  - 卡片3：总 Credits
  - 卡片4：平均成功率
- **UI 设计**：
  - 4个并排的小卡片（移动端 2x2）
  - 每个卡片包含：图标、标题、数值、对比趋势（↑↓）

#### 3.3 趋势图表 (TrendChart)
- **位置**：总览卡片下方
- **数据来源**：`/api/usage/trends`（**从 ModelCallStat 预聚合**）
- **展示内容**：
  - 折线图：显示最近 30 天的调用量趋势
  - 柱状图：显示成功率变化
  - X 轴：时间戳（小时或天），Y 轴：调用次数 / 成功率
- **交互**：
  - 时间范围选择：7天、30天、90天
  - 指标切换：调用量、成功率、平均延时
  - Hover 显示详细数值
- **数据处理**：
  - 合并当前小时的实时数据 + 历史预聚合数据
  - 自动按粒度显示（7天用小时，30天用天）
- **图表库**：使用 recharts

#### 3.4 项目列表 (ProjectList)
- **位置**：趋势图下方
- **数据来源**：`/api/usage/projects`（**从 ModelCallStat 预聚合**）
- **展示内容**：
  - 表格列：
    1. 项目 ID (appDid) - 可点击跳转到详情页
    2. 总调用次数
    3. 总 Credits
    4. 成功率
    5. 最近调用时间
  - 支持按调用次数、Credits 排序
  - 支持搜索过滤（按 appDid）
  - 分页（每页 20 条）
- **交互**：
  - 点击项目行跳转到 Project Detail 页面
  - Hover 显示更多信息（tooltip）

#### 3.5 额度明细列表 (QuotaDetailsList) 【⚠️ 最后实现】
- **位置**：项目列表下方
- **数据来源**：`/api/usage/quota-details` (payment-kit)（**实时查询，分页，轮询**）
- **重要说明**：
  - type 的详细类型需要先从 payment-kit 了解
  - 此功能放到最后实现
- **展示内容**：
  - 表格列：
    1. 时间 (createdAt)
    2. 类型 (type) - 用不同颜色的 Chip 显示
    3. 金额 (amount) - 正数/负数显示
    4. 说明 (description)
    5. 关联信息 (metadata)
  - 支持按类型筛选
  - 支持按时间排序（默认倒序）
  - 分页（每页 20 条）
- **UI 设计**：
  - 使用 @mui/material Table 组件
  - 金额字段右对齐，带货币符号
  - 类型用彩色 Chip 标识

#### 3.6 空状态处理
当用户没有任何调用记录时：
- 显示引导卡片
- 文案："还没有任何调用记录，立即开始使用 AIGNE Hub！"
- 提供快速开始链接（跳转到 API 文档或 Playground）
- 示例代码片段

### Project Detail 页面

#### 3.7 项目统计卡片 (ProjectStats)
- **位置**：页面顶部
- **数据来源**：`/api/usage/projects/:appDid/stats`（**从 ModelCallStat 预聚合，包括P95**）
- **展示内容**：
  - 6个关键指标卡片：
    1. 总调用次数（预聚合）
    2. 总 Token 数（预聚合）
    3. 总 Credits（预聚合）
    4. 平均成功率（预聚合）
    5. 平均延时（预聚合）
    6. **P95 延时**（预聚合，**从 ModelCallStat 计算，不需要实时统计**）
  - 每个卡片显示：当前值、环比变化
- **UI 设计**：
  - 6个卡片横向排列（移动端 2x3）
  - 与 Dashboard 的卡片风格一致
- **重要说明**：
  - 只需要 P95，不需要 P99
  - P95 从预聚合数据计算，不是实时统计

#### 3.8 项目趋势图和模型分布 (ProjectTrendChart & ModelDistribution)
- **位置**：统计卡片下方，**同一行展示**
- **布局**：
  - 左侧：项目趋势图（占据大部分宽度）
  - 右侧：模型分布饼图（一小块区域）

**项目趋势图 (ProjectTrendChart)**：
- **数据来源**：`/api/usage/projects/:appDid/trends`（**从 ModelCallStat 预聚合，项目级 + 小时/天**）
- **展示指标**：请求数和延时（**双Y轴图表**）
- **展示内容**：
  - 双Y轴折线图：左Y轴显示请求数，右Y轴显示延时
  - X 轴：时间戳（小时或天）
  - Hover 显示详细的聚合数据（例如消费等）
- **交互**：
  - 时间范围选择：7天、30天、90天
- **图表库**：使用 recharts

**模型分布 (ModelDistribution)**：
- **数据来源**：`/api/usage/projects/:appDid/models`（**从 ModelCallStat 通过 modelId 快速聚合**）
- **展示内容**：
  - 饼图：不同模型的调用占比
  - 可选：简单的模型名称和百分比标签
- **交互**：
  - Hover 显示详细信息

#### 3.9 调用历史列表 (CallHistory)
- **位置**：趋势图和饼图下方（**不需要错误率统计和延时统计的区域**）
- **数据来源**：`/api/usage/projects/:appDid/calls`（**从 ModelCall 实时查询，分页**）
- **数据刷新**：轮询
- **展示内容**：
  - 表格列：
    1. **状态 (status)**：红绿黄圆点（成功/失败/处理中）
    2. 时间 (callTime)
    3. ID (id)
    4. **模型 (model)**：只显示模型名，**不显示提供商**
    5. 类型 (type) - 使用 Chip 组件
    6. Tokens (totalUsage)
    7. 延时 (duration) - 单位 ms (latency)
    8. 成本 (credits) - cost
  - 分页（每页 20 条）
  - 筛选器：
    - 时间范围选择器
    - 模型筛选（下拉）
    - 状态筛选（全部/成功/失败）
  - 支持按时间、延时排序
- **交互**：
  - 点击行展开查看完整的 metadata 和错误原因
  - 失败记录高亮显示（淡红色背景）
  - 延时过高的记录标记警告图标
- **UI 设计**：
  - 使用 @mui/material Table 组件
  - 状态列使用彩色圆点图标
- **重要说明**：
  - 这是需要实时查询并轮询的列表
  - 趋势图下面直接展示 call list，**不需要错误率统计和延时统计的区域**

## 4. 用户体验设计

### 4.1 权限控制
- 所有 API 请求都基于当前登录用户的 `userDid` 进行数据过滤
- 不同用户只能看到自己的项目和调用记录
- 后端验证：从 session 中获取 `userDid`，不信任前端传参

### 4.2 数据刷新策略
- **不使用手动刷新按钮**
- **轮询策略**：
  - **调用历史列表 (CallHistory)**：使用轮询自动刷新（例如每30秒）
  - **额度信息 (QuotaSection)**：使用轮询自动刷新（例如每60秒）
  - **统计数据和趋势图**：不轮询（基于预聚合，更新频率低）
- 使用 ahooks 的 `useRequest` 配合 `pollingInterval` 实现轮询
- 轮询时使用静默更新，不显示 loading 状态

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
      usage/
        dashboard/...
        projects/...
  api/
    src/
      routes/
        usage.ts           # 新增路由文件
      libs/
        usage-stats.ts     # 统计计算工具函数
      store/
        models/
          model-call-stat.ts  # 需要修改：增加 appDid 字段
      jobs/
        aggregate-stats.ts  # 新增：预聚合任务（cron job）
```

### 5.2 ModelCallStat 数据模型修改（⚠️ 重要）

#### 5.2.1 数据库 Schema 修改
需要修改 `ModelCallStat` 表的结构：

```typescript
// blocklets/core/api/src/store/models/model-call-stat.ts

export default class ModelCallStat extends Model {
  declare id: CreationOptional<string>;
  declare userDid: string;
  declare appDid: CreationOptional<string | null>;  // 新增字段
  declare modelId: CreationOptional<string | null>;  // 新增字段
  declare timestamp: number;
  declare timeType: 'day' | 'hour';
  declare stats: DailyStats;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // 修改后的 GENESIS_ATTRIBUTES
  public static readonly GENESIS_ATTRIBUTES = {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false, defaultValue: nextId },
    userDid: { type: DataTypes.STRING, allowNull: false },
    appDid: {  // 新增
      type: DataTypes.STRING,
      allowNull: true,  // 允许为 null
      comment: 'Project ID - null for user-level aggregation'
    },
    modelId: {  // 新增
      type: DataTypes.STRING,
      allowNull: true,  // 允许为 null
      comment: 'Model ID - for quick model aggregation queries'
    },
    timestamp: { type: DataTypes.INTEGER, allowNull: false },
    timeType: { type: DataTypes.ENUM('day', 'hour'), allowNull: false, defaultValue: 'day' },
    stats: { type: DataTypes.JSON, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false }
  };
}

// 需要创建复合索引
// 迁移脚本中添加：
// CREATE INDEX idx_model_call_stat_user_app_time
//   ON "ModelCallStats" ("userDid", "appDid", "timestamp", "timeType");
// CREATE INDEX idx_model_call_stat_model
//   ON "ModelCallStats" ("userDid", "modelId", "timestamp");
```

#### 5.2.2 新增查询方法

```typescript
// blocklets/core/api/src/store/models/model-call-stat.ts

class ModelCallStat extends Model {
  // ... 现有方法 ...

  /**
   * 获取用户级别的小时统计（appDid = null）
   */
  static async getHourlyStats(userDid: string, hourTimestamp: number): Promise<DailyStats> {
    // 现有实现，保持不变
    return this.getHourlyStatsInternal(userDid, null, hourTimestamp);
  }

  /**
   * 获取项目级别的小时统计（appDid = specific value）【新增】
   */
  static async getHourlyStatsByApp(
    userDid: string,
    appDid: string,
    hourTimestamp: number
  ): Promise<DailyStats> {
    return this.getHourlyStatsInternal(userDid, appDid, hourTimestamp);
  }

  /**
   * 内部方法：统一处理用户级和项目级聚合
   */
  private static async getHourlyStatsInternal(
    userDid: string,
    appDid: string | null,
    hourTimestamp: number
  ): Promise<DailyStats> {
    // 检查当前小时 - 实时计算
    if (this.isCurrentHour(hourTimestamp)) {
      return this.computeHourlyStats(userDid, appDid, hourTimestamp);
    }

    // 尝试获取已聚合的数据
    const existingStat = await ModelCallStat.findOne({
      where: {
        userDid,
        appDid: appDid || null,  // 处理 null
        timestamp: hourTimestamp,
        timeType: 'hour'
      }
    });

    if (existingStat) {
      return existingStat.stats;
    }

    // 计算并保存
    return this.computeAndSaveHourlyStats(userDid, appDid, hourTimestamp);
  }

  /**
   * 计算小时统计（支持用户级和项目级）
   */
  private static async computeHourlyStats(
    userDid: string,
    appDid: string | null,
    hourTimestamp: number
  ): Promise<DailyStats> {
    const startOfHour = hourTimestamp;
    const endOfHour = hourTimestamp + 3600 - 1;

    const whereClause = appDid
      ? `WHERE "userDid" = :userDid AND "appDid" = :appDid AND "callTime" >= :startTime AND "callTime" <= :endTime`
      : `WHERE "userDid" = :userDid AND "callTime" >= :startTime AND "callTime" <= :endTime`;

    const replacements = {
      userDid,
      appDid,
      startTime: startOfHour,
      endTime: endOfHour
    };

    return this.executeStatsQueries(whereClause, replacements);
  }

  /**
   * 获取时间范围内的聚合统计（合并多个小时）【新增】
   */
  static async getAggregatedStats(
    userDid: string,
    appDid: string | null,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    // 计算涉及的小时范围
    const startHour = Math.floor(startTime / 3600) * 3600;
    const endHour = Math.floor(endTime / 3600) * 3600;
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    // 获取所有小时的预聚合数据
    const hourlyStats = await ModelCallStat.findAll({
      where: {
        userDid,
        appDid: appDid || null,
        timestamp: { [Op.between]: [startHour, endHour] },
        timeType: 'hour'
      },
      order: [['timestamp', 'ASC']]
    });

    // 如果时间范围包含当前小时，需要实时计算当前小时的数据
    let currentHourStats: DailyStats | null = null;
    if (endHour >= currentHour) {
      currentHourStats = await this.computeHourlyStats(userDid, appDid, currentHour);
    }

    // 合并所有小时的统计数据
    return this.mergeStats([
      ...hourlyStats.map(s => s.stats),
      ...(currentHourStats ? [currentHourStats] : [])
    ]);
  }

  /**
   * 合并多个统计数据
   */
  private static mergeStats(statsList: DailyStats[]): DailyStats {
    if (statsList.length === 0) {
      return this.getEmptyStats();
    }

    const merged: DailyStats = this.getEmptyStats();

    statsList.forEach(stats => {
      merged.totalUsage += stats.totalUsage;
      merged.totalCredits += stats.totalCredits;
      merged.totalCalls += stats.totalCalls;
      merged.successCalls += stats.successCalls;

      // 合并 byType
      Object.keys(stats.byType).forEach(type => {
        if (!merged.byType[type]) {
          merged.byType[type] = { totalUsage: 0, totalCredits: 0, totalCalls: 0, successCalls: 0 };
        }
        merged.byType[type].totalUsage += stats.byType[type].totalUsage;
        merged.byType[type].totalCredits += stats.byType[type].totalCredits;
        merged.byType[type].totalCalls += stats.byType[type].totalCalls;
        merged.byType[type].successCalls += stats.byType[type].successCalls;
      });
    });

    return merged;
  }
}
```

#### 5.2.3 预聚合任务（Cron Job）

创建定时任务，每小时执行一次聚合：

```typescript
// blocklets/core/api/src/jobs/aggregate-stats.ts

import { CronJob } from 'cron';
import ModelCall from '../store/models/model-call';
import ModelCallStat from '../store/models/model-call-stat';
import logger from '../libs/logger';

/**
 * 每小时执行一次，聚合上一个小时的数据
 * Cron 表达式: '5 * * * *' - 每小时第5分钟执行
 */
export const aggregateStatsJob = new CronJob('5 * * * *', async () => {
  const now = Math.floor(Date.now() / 1000);
  const lastHour = Math.floor(now / 3600) * 3600 - 3600;  // 上一个小时的起始时间戳

  try {
    logger.info('Starting hourly stats aggregation', { hour: lastHour });

    // 1. 获取所有有数据的用户
    const users = await ModelCall.findAll({
      attributes: ['userDid'],
      where: {
        callTime: { [Op.between]: [lastHour, lastHour + 3599] }
      },
      group: ['userDid'],
      raw: true
    });

    for (const { userDid } of users) {
      // 2. 用户级聚合（appDid = null）
      await ModelCallStat.computeAndSaveHourlyStats(userDid, null, lastHour);

      // 3. 获取该用户下所有项目
      const projects = await ModelCall.findAll({
        attributes: ['appDid'],
        where: {
          userDid,
          callTime: { [Op.between]: [lastHour, lastHour + 3599] }
        },
        group: ['appDid'],
        raw: true
      });

      // 4. 项目级聚合
      for (const { appDid } of projects) {
        if (appDid) {  // 跳过 null
          await ModelCallStat.computeAndSaveHourlyStats(userDid, appDid, lastHour);
        }
      }
    }

    logger.info('Hourly stats aggregation completed', {
      hour: lastHour,
      userCount: users.length
    });
  } catch (error) {
    logger.error('Hourly stats aggregation failed', { error, hour: lastHour });
  }
});

// 启动定时任务
export function startAggregationJobs() {
  aggregateStatsJob.start();
  logger.info('Stats aggregation jobs started');
}
```

#### 5.2.4 数据库迁移

```sql
-- 迁移脚本：add_fields_to_model_call_stat.sql

-- 1. 添加 appDid 列
ALTER TABLE "ModelCallStats"
ADD COLUMN "appDid" VARCHAR(255) NULL
COMMENT 'Project ID - null for user-level aggregation';

-- 2. 添加 modelId 列
ALTER TABLE "ModelCallStats"
ADD COLUMN "modelId" VARCHAR(255) NULL
COMMENT 'Model ID - for quick model aggregation queries';

-- 3. 创建复合索引
CREATE INDEX idx_model_call_stat_user_app_time
ON "ModelCallStats" ("userDid", "appDid", "timestamp", "timeType");

CREATE INDEX idx_model_call_stat_model
ON "ModelCallStats" ("userDid", "modelId", "timestamp");

-- 4. 可选：删除旧的单一索引（如果存在）
-- DROP INDEX IF EXISTS idx_model_call_stat_user_time;
```

### 5.3 复用现有代码
参考 `ai-model-rates/index.tsx` 的实现：
- Table 组件用法
- 筛选器设计
- 分页逻辑
- API 请求封装（useRequest from ahooks）
- 响应式布局

### 5.3 关键代码示例

#### API 路由实现 (usage.ts)
```typescript
import { Router } from 'express';
import { asyncMiddleware } from '../middlewares/async';
import ModelCall from '../store/models/model-call';
import payment from '@blocklet/payment-js';

const router = Router();

// Dashboard API
router.get('/dashboard', asyncMiddleware(async (req, res) => {
  const { userDid } = req.session.user;
  const { timeRange = 30 } = req.query;

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - (timeRange * 24 * 3600);

  // 获取项目列表
  const projects = await ModelCall.findAll({
    attributes: [
      'appDid',
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalCalls'],
      [sequelize.fn('SUM', sequelize.col('credits')), 'totalCredits'],
      [sequelize.fn('AVG', sequelize.literal(
        `CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END`
      )), 'successRate'],
      [sequelize.fn('MAX', sequelize.col('callTime')), 'lastCallTime']
    ],
    where: {
      userDid,
      callTime: { [Op.between]: [startTime, endTime] }
    },
    group: ['appDid'],
    raw: true
  });

  // 获取总览数据
  const overview = await ModelCall.findOne({
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalCalls'],
      [sequelize.fn('SUM', sequelize.col('totalUsage')), 'totalTokens'],
      [sequelize.fn('SUM', sequelize.col('credits')), 'totalCredits'],
      [sequelize.fn('AVG', sequelize.literal(
        `CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END`
      )), 'successRate']
    ],
    where: { userDid, callTime: { [Op.between]: [startTime, endTime] } },
    raw: true
  });

  // 获取趋势数据（按天聚合）
  const trends = await ModelCall.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'calls'],
      [sequelize.fn('AVG', sequelize.literal(
        `CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END`
      )), 'successRate'],
      [sequelize.fn('AVG', sequelize.col('duration')), 'avgDuration']
    ],
    where: { userDid, callTime: { [Op.between]: [startTime, endTime] } },
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // 获取额度信息（从 payment-kit）
  const quota = await payment.credits.get({ userDid });

  res.json({
    quota,
    projects,
    overview,
    trends
  });
}));

// Project Detail API
router.get('/projects/:appDid', asyncMiddleware(async (req, res) => {
  const { userDid } = req.session.user;
  const { appDid } = req.params;
  const { startTime, endTime, page = 1, pageSize = 20 } = req.query;

  // 权限检查：确保 appDid 属于当前用户
  const accessCheck = await ModelCall.findOne({
    where: { userDid, appDid }
  });
  if (!accessCheck) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // 获取项目统计（包含延时分位数）
  const durations = await ModelCall.findAll({
    attributes: ['duration'],
    where: {
      userDid,
      appDid,
      callTime: { [Op.between]: [startTime, endTime] },
      status: 'success'
    },
    order: [['duration', 'ASC']],
    raw: true
  });

  const project = {
    appDid,
    ...await ModelCall.findOne({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalCalls'],
        [sequelize.fn('SUM', sequelize.col('totalUsage')), 'totalTokens'],
        [sequelize.fn('SUM', sequelize.col('credits')), 'totalCredits'],
        [sequelize.fn('AVG', sequelize.literal(
          `CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END`
        )), 'successRate'],
        [sequelize.fn('AVG', sequelize.col('duration')), 'avgDuration']
      ],
      where: { userDid, appDid, callTime: { [Op.between]: [startTime, endTime] } },
      raw: true
    }),
    p95Duration: durations[Math.floor(durations.length * 0.95)]?.duration || 0,
    p99Duration: durations[Math.floor(durations.length * 0.99)]?.duration || 0
  };

  // 按模型分布
  const modelDistribution = await ModelCall.findAll({
    attributes: [
      'model',
      'providerId',
      [sequelize.fn('COUNT', sequelize.col('id')), 'calls']
    ],
    where: { userDid, appDid, callTime: { [Op.between]: [startTime, endTime] } },
    include: [{
      model: AiProvider,
      as: 'provider',
      attributes: ['name', 'displayName']
    }],
    group: ['model', 'providerId'],
    order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
  });

  // 调用历史列表
  const calls = await ModelCall.getCallsByDateRange({
    userDid,
    appDid,
    startTime,
    endTime,
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  res.json({
    project,
    modelDistribution,
    calls
  });
}));

export default router;
```

#### 前端 Dashboard 实现
```typescript
// dashboard-page.tsx
import { useRequest } from 'ahooks';
import { useSessionContext } from '@app/contexts/session';

export default function DashboardPage() {
  const { api, session } = useSessionContext();
  const userDid = session.user.did;

  const { data, loading, refresh } = useRequest(
    () => api.get('/api/usage/dashboard').then(res => res.data),
    {
      onError: (error) => {
        Toast.error(formatError(error));
      }
    }
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data || data.projects.length === 0) {
    return <EmptyState />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h4">使用统计</Typography>
          <Button onClick={refresh} startIcon={<RefreshIcon />}>
            刷新
          </Button>
        </Box>

        <QuotaSection quota={data.quota} />

        <OverviewCards overview={data.overview} />

        <TrendChart trends={data.trends} />

        <ProjectList projects={data.projects} />
      </Stack>
    </Container>
  );
}
```

### 5.4 性能优化
- 使用 React.memo 避免不必要的重渲染
- 虚拟滚动（如果列表超过 100 条）
- 图表使用懒加载（React.lazy）
- API 响应缓存（SWR 或 ahooks 的缓存策略）

## 6. 决策总结

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 页面数量 | 2个独立页面 | Dashboard 和 Project Detail 功能明确分离，避免单页过于复杂 |
| 数据聚合 | 预聚合为主 + 少量实时 | **只有调用明细列表和额度数据实时查询**，其他所有汇总数据（包括P95）从预聚合获取 |
| API 架构 | 拆分成多个小接口 | 每个接口单一职责，前端可以并行请求，提高性能 |
| 延时统计 | 只需 P95，从预聚合 | P95 从 ModelCallStat 预聚合计算，不需要 P99，不需要实时统计 |
| 项目定义 | 按 appDid 聚合 | 用户调用时传入 appDid，直接使用 ModelCall 表的 appDid 字段 |
| 额度来源 | payment-kit API | 复用现有的支付系统，避免重复开发，增加预计剩余天数计算 |
| 刷新策略 | 轮询，无手动刷新按钮 | 调用列表和额度信息使用轮询自动刷新，统计数据不轮询 |
| 分页策略 | 传统分页 | 数据量小（<1000条），不需要虚拟滚动 |
| 权限控制 | 基于 userDid | 后端验证，不同用户数据隔离 |
| UI 框架 | @mui/material v7 | 与现有代码保持一致 |
| 图表库 | recharts | 用于趋势图和饼图，支持双Y轴 |

## 7. MVP 范围

### 必须包含（MVP）
- ✅ Dashboard 基础展示：额度信息（含预计剩余天数、自动充值按钮）、项目列表、总体统计
- ✅ Dashboard 趋势图（基于预聚合）
- ✅ Project Detail 页面：项目统计（包括 P95 延时，**从预聚合**）
- ✅ Project Detail 趋势图：双Y轴（请求数 + 延时）
- ✅ 模型分布饼图（与趋势图同行）
- ✅ 调用历史列表（实时查询，轮询）
- ✅ 按项目筛选和分页
- ✅ 时间范围选择（7天/30天/90天）
- ✅ 权限控制（按 userDid 过滤）
- ✅ 空状态引导页面
- ✅ ModelCallStat 数据库改造（增加 appDid 和 modelId 字段）
- ✅ 预聚合 cron job（每小时执行）

### 后续迭代（V2）
- 📋 **额度明细列表**（⚠️ 最后实现，需要先了解 payment-kit 的 type 详情）
- 📋 数据导出功能（CSV/Excel）
- 📋 更多图表类型（热力图、散点图）
- 📋 告警设置（延时过高、错误率异常）
- 📋 成本预测和优化建议
- 📋 自定义时间范围选择器
- 📋 高级筛选（多条件组合）

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

## 9. 实施步骤

1. **数据库改造**（1天）
   - ModelCallStat 增加 appDid 和 modelId 字段（数据库迁移）
   - 创建复合索引
   - 测试数据迁移脚本

2. **后端开发**（4-6天）
   - 修改 ModelCallStat 模型：新增项目级和模型级聚合方法
   - 创建预聚合 cron job（每小时执行）
   - 创建拆分后的 API 端点（9个端点）：
     - `/api/usage/quota` - 额度信息（含预计剩余天数）
     - `/api/usage/overview` - 总览统计
     - `/api/usage/projects` - 项目列表
     - `/api/usage/trends` - 趋势数据
     - `/api/usage/projects/:appDid/stats` - 项目统计（含P95）
     - `/api/usage/projects/:appDid/trends` - 项目趋势
     - `/api/usage/projects/:appDid/models` - 模型分布
     - `/api/usage/projects/:appDid/calls` - 调用列表
     - `/api/usage/quota-details` - 额度明细（⚠️ 最后实现）
   - 实现 P95 延时预聚合计算
   - 集成 payment-kit API（额度和自动充值）

3. **前端开发**（5-7天）
   - 实现 Dashboard 页面及组件
     - QuotaSection（含预计剩余天数、自动充值按钮）
     - OverviewCards
     - TrendChart
     - ProjectList
   - 实现 Project Detail 页面及组件
     - ProjectStats（6个卡片，含P95）
     - ProjectTrendChart（双Y轴：请求数+延时）
     - ModelDistribution（饼图，与趋势图同行）
     - CallHistory（轮询，状态圆点，无提供商）
   - 接入拆分后的 API
   - 实现轮询逻辑（ahooks useRequest + pollingInterval）
   - 响应式适配

4. **测试与优化**（2-3天）
   - 功能测试（权限、筛选、分页）
   - 预聚合准确性验证
   - 性能测试（大数据量场景）
   - 轮询性能测试
   - UI/UX 测试（移动端适配）
   - 边界情况测试（空状态、错误处理）

5. **部署与监控**（1天）
   - 数据库迁移（生产环境）
   - 启动预聚合 cron job
   - 灰度发布
   - 监控预聚合任务执行情况
   - 监控 API 错误率和性能
   - 收集用户反馈

6. **额度明细功能**（1-2天，⚠️ 最后实现）
   - 了解 payment-kit 的额度明细 type 详情
   - 实现 `/api/usage/quota-details` 端点
   - 实现 QuotaDetailsList 组件

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
- [ ] 用户能看到当前的额度信息、预计剩余天数和自动充值按钮
- [ ] 用户能看到所有项目的列表和概要信息
- [ ] 用户能点击项目查看详细的调用历史（带轮询）
- [ ] 用户能看到每个项目的延时统计（平均、P95，**从预聚合**）
- [ ] 用户能看到项目趋势图（双Y轴：请求数+延时）和模型分布饼图（同一行）
- [ ] 用户能看到调用列表的字段（状态圆点、时间、ID、模型、类型、tokens、延时、成本）
- [ ] 用户能筛选时间范围、模型、状态
- [ ] 用户能对列表进行分页浏览
- [ ] 不同用户只能看到自己的数据
- [ ] 调用列表和额度信息自动轮询更新

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
