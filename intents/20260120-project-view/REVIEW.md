# Code Review Document

## 📋 改动概览 (Change Summary)

**变更类型：** Feature / Performance / Refactor

**影响范围：**
- 修改文件数：36 个
- 新增文件数：15 个
- 删除文件数：0 个
- 代码行变更：+6390 -1490

**关键文件：**
- `blocklets/core/api/src/routes/usage.ts` - 新增使用量与项目维度 API
- `blocklets/core/api/src/store/models/model-call-stat.ts` - 按天+项目维度预聚合与趋势统计
- `blocklets/core/api/src/crons/model-call-stats.ts` - 日级聚合任务与回填能力
- `blocklets/core/api/src/store/migrations/20260122000000-usage-tracking-schema.ts` - schema 与索引迁移
- `blocklets/core/src/components/analytics/*` / `blocklets/core/src/pages/usage/projects/*` - 新的使用量 Dashboard 与 Project Detail 页面

**依赖变更：**
- [x] 新增依赖：`@blocklet/env`（`blocklets/core/package.json`）
- [x] 更新版本：`0.7.20 -> 0.8.0`（`package.json` / `blocklets/core/package.json` / `blocklets/core/blocklet.yml` / `version`）
- [x] 配置变更：ESLint 规则调整（`no-await-in-loop`、`no-continue` 等关闭）

---

## 🔄 业务流程分析 (Business Flow Analysis)

### 功能描述
新增“使用量/项目分析”能力：通过 ModelCallStat 预聚合+实时补齐，向前端提供项目级趋势、明细与额度估算；同时引入项目元数据缓存与后台获取队列。

### 业务流程
```
模型调用 → 记录 ModelCall(含 appDid) → 拉取项目元信息 → 日级预聚合 → API 输出 → 前端 Dashboard/项目详情展示
```

**详细流程：**
1. **模型调用记录与项目识别**
   - 涉及组件/模块：`model-call-tracker`、`normalizeProjectAppDid`、`Project` + `projectsQueue`
   - 数据流：请求头 appDid → 归一化 → 写入 ModelCalls → 触发项目元信息拉取

2. **日级预聚合与回填**
   - 涉及组件/模块：`crons/model-call-stats.ts`、`ModelCallStat.calcDailyStats`
   - 数据流：按天提取 (userDid, appDid) → 统计写入 ModelCallStats

3. **使用量 API 输出与前端展示**
   - 涉及组件/模块：`routes/usage.ts`、`ModelCallStat` 聚合查询、前端 Usage/Project 页面
   - 数据流：API 读取预聚合 + 当前日实时补齐 → 前端卡片/趋势图/列表渲染

### 数据流图
```
ModelCalls (实时) + ModelCallStats (预聚合) + Projects (元信息) → Usage APIs → 前端 Dashboard
```

---

## 🔍 关键代码详解 (Key Code Analysis)

### 1. `blocklets/core/api/src/crons/model-call-stats.ts`

**改动类型：** 修改
**改动行数：** +186 -46

#### 改动内容
```diff
-const HOUR_IN_SECONDS = 3600;
+const DAY_IN_SECONDS = 86400;
+const CALC_DAILY_STATS_CONCURRENCY = 10;

-export async function getHoursToWarmup(): Promise<number[]> {
+export async function getDaysToWarmup(): Promise<number[]> {
   const item = await ModelCallStat.findOne({
+    where: { timeType: 'day', userDid: { [Op.not]: null } },
     order: [['timestamp', 'DESC']],
@@
-  const currentHour = Math.floor(now / HOUR_IN_SECONDS) * HOUR_IN_SECONDS;
-  const previousHour = currentHour - HOUR_IN_SECONDS;
+  const currentDay = Math.floor(now / DAY_IN_SECONDS) * DAY_IN_SECONDS;
+  const previousDay = currentDay - DAY_IN_SECONDS;
@@
-export async function createModelCallStats(hourTimestamp?: number) {
-  const hours = hourTimestamp ? [hourTimestamp] : await getHoursToWarmup();
+export async function createModelCallStats(dayTimestamp?: number) {
+  const days = dayTimestamp ? [dayTimestamp] : await getDaysToWarmup();
@@
+      const calls = (await sequelize.query(
+        `
+        SELECT DISTINCT "userDid", "appDid"
+        FROM "ModelCalls"
+        WHERE "callTime" >= :startTime
+          AND "callTime" <= :endTime
+      `,
+        {
+          type: QueryTypes.SELECT,
+          replacements: { startTime, endTime },
+        }
+      )) as Array<{ userDid: string | null; appDid: string | null }>;
```

#### 代码说明
- 由“按小时聚合”调整为“按天聚合”，并引入 `p-all` 控制并发，按 (userDid, appDid) 粒度生成缓存统计。
- 新增 `backfillModelCallStats*` 供管理员手动回填。

#### 关注点
- [ ] **逻辑正确性：** 日级聚合边界以 UTC day 对齐（`dayjs.utc()`），确保跨时区一致。
- [ ] **边界处理：** 当前日不写缓存，依赖实时补齐。
- [ ] **错误处理：** `stopOnError: false` 能避免单个失败阻塞。
- [ ] **性能影响：** 每日 `SELECT DISTINCT` + 多并发计算，需关注大型数据集压力。

参考位置：`blocklets/core/api/src/crons/model-call-stats.ts:12`、`blocklets/core/api/src/crons/model-call-stats.ts:47`、`blocklets/core/api/src/crons/model-call-stats.ts:100`

---

### 2. `blocklets/core/api/src/routes/usage.ts`

**改动类型：** 新增
**改动行数：** +488

#### 改动内容
```diff
+router.get('/quota', user, async (req, res) => {
+  const credits = await getUserCredits({ userDid });
+  const { startTime, endTime, timeRange } = getTimeRange(req.query, 30);
+  const stats = await ModelCallStat.getStatsByCalls(userDid, undefined, startTime, endTime);
+  const daysInRange = 30;
+  const dailyAvgCredits = stats.totalCredits / daysInRange;
+  ...
+});
+
+router.get('/projects', user, async (req, res) => {
+  const result = await ModelCallStat.getProjects(allUsers ? null : userDid, startTime, endTime, {
+    page,
+    pageSize,
+    sortBy,
+    sortOrder,
+    rangeDays,
+  });
+  ...
+});
```

#### 代码说明
- 增加 usage 相关 API：额度估算、项目列表、趋势、项目详情趋势、项目调用列表、统计回填。
- 管理员/owner 通过 `allUsers` 可跨用户聚合。

#### 关注点
- [ ] **逻辑正确性：** `daysInRange = 30` 固定值，可能与 `timeRange` 不一致，估算偏差。
- [ ] **边界处理：** 参数解析/分页/排序默认值齐全。
- [ ] **错误处理：** 统一 try/catch 返回 500。
- [ ] **性能影响：** 列表与趋势使用预聚合 + 当前日实时补齐。

参考位置：`blocklets/core/api/src/routes/usage.ts:81`、`blocklets/core/api/src/routes/usage.ts:138`、`blocklets/core/api/src/routes/usage.ts:266`

---

### 3. `blocklets/core/api/src/store/models/model-call-stat.ts`

**改动类型：** 修改
**改动行数：** +824 -110

#### 改动内容
```diff
-  static async getHourlyStats(userDid: string, hourTimestamp: number): Promise<DailyStats> {
-    // Part 1: Check if current hour - compute in real-time
-    if (ModelCallStat.isCurrentHour(hourTimestamp)) {
-      return ModelCallStat.computeHourlyStats(userDid, hourTimestamp);
+  static async calcDailyStats(userDid: string, appDid: string, dayTimestamp: number): Promise<void> {
+    const currentDay = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
+    if (dayTimestamp >= currentDay) {
+      return;
+    }
+    const stats = await ModelCallStat.getStatsByCalls(
+      userDid,
+      appDid,
+      dayTimestamp,
+      dayTimestamp + SECONDS_PER_DAY - 1
+    );
+    const dayKey = `${userDid}-${appDid}-day-${dayTimestamp}`;
+    await ModelCallStat.upsert({ id: dayKey, userDid, appDid, timestamp: dayTimestamp, timeType: 'day', stats });
+  }
```

#### 代码说明
- 统计维度从“小时用户”扩展为“天 + 项目”；新增项目趋势、全局趋势与项目列表聚合查询。
- 当前日趋势通过 ModelCalls 实时补齐，避免“半日数据”写入缓存。

#### 关注点
- [ ] **逻辑正确性：** 当前日不落库，依赖实时聚合补齐，需确保趋势/列表均处理当前日。
- [ ] **边界处理：** appDid 为空时的聚合行为需一致。
- [ ] **错误处理：** 解析 stats 使用兜底，整体可控。
- [ ] **性能影响：** 使用 `json_extract` 聚合，需确认生产数据库方言兼容性。

参考位置：`blocklets/core/api/src/store/models/model-call-stat.ts:84`、`blocklets/core/api/src/store/models/model-call-stat.ts:224`、`blocklets/core/api/src/store/models/model-call-stat.ts:520`

---

### 4. `blocklets/core/api/src/middlewares/model-call-tracker.ts`

**改动类型：** 修改
**改动行数：** +17 -7

#### 改动内容
```diff
-    const appDid = (req.headers['x-aigne-hub-client-did'] as string) || '';
+    const rawAppDid = req.headers['x-aigne-hub-client-did'];
+    const normalizedAppDid = normalizeProjectAppDid(typeof rawAppDid === 'string' ? rawAppDid : null);
     req.appClient = {
-      appId: appDid,
+      appId: normalizedAppDid || '',
       userDid,
     };
@@
+    if (appDid) {
+      pushProjectFetchJob(appDid);
+    }
@@
-        const duration = getCurrentUnixTimestamp() - startTime;
+        const duration = formatDurationSeconds(Date.now() - startTimeMs);
```

#### 代码说明
- appDid 归一化并写入 ModelCall；新增项目元信息队列触发；duration 精度提升到 0.1 秒。

#### 关注点
- [ ] **逻辑正确性：** appDid 归一化后与迁移脚本一致。
- [ ] **边界处理：** 空 appDid 落为默认 appPid。
- [ ] **错误处理：** 原有日志保留。
- [ ] **性能影响：** 队列触发为非阻塞。

参考位置：`blocklets/core/api/src/middlewares/model-call-tracker.ts:124`、`blocklets/core/api/src/middlewares/model-call-tracker.ts:200`

---

### 5. `blocklets/core/api/src/queue/projects.ts`

**改动类型：** 新增
**改动行数：** +94

#### 改动内容
```diff
+const projectsQueue = getQueue<ProjectQueueJob>({
+  name: 'fetch-project-info',
+  options: { concurrency: 5, maxRetries: 1, maxTimeout: 30000, retryDelay: 5000 },
+  onJob: async (data: ProjectQueueJob) => {
+    const existingProject = await Project.getByAppDid(appDid);
+    ...
+    const appInfo = await getAppName(appDid);
+    await Project.upsertProject(appDid, appInfo.appName, appInfo.appLogo, appInfo.appUrl);
+  },
+});
```

#### 代码说明
- 通过队列拉取 blocklet metadata，并对同一 appDid 做去重与过期刷新控制。

#### 关注点
- [ ] **逻辑正确性：** stale 规则（2/7 天）合理，避免频繁请求。
- [ ] **边界处理：** appDid 为空直接返回。
- [ ] **错误处理：** 失败会触发一次重试。
- [ ] **性能影响：** 并发=5，需关注高峰期外部请求耗时。

参考位置：`blocklets/core/api/src/queue/projects.ts:13`、`blocklets/core/api/src/queue/projects.ts:66`

---

## ⚠️ 风险评估 (Risk Assessment)

### 高风险项 (High Risk)
- [ ] 无明显高风险项。

### 中风险项 (Medium Risk)
- [ ] **额度估算时间范围不一致**
  - **影响范围：** `/api/usage/quota`
  - **潜在问题：** `daysInRange = 30` 固定，若前端传 `timeRange` 或 `start/end`，估算会偏差。
  - **建议措施：** 使用 `timeRange` 或 `(endTime-startTime)` 动态计算天数。

- [ ] **回填并发缺乏限制**
  - **影响范围：** `/api/usage/stats/backfill`、`backfillModelCallStats`
  - **潜在问题：** 大范围日期或大项目数时 `Promise.all` 可能造成 DB/CPU 峰值。
  - **建议措施：** 引入 `p-all`/队列分批，或限制日级并发。

- [ ] **数据库方言兼容性**
  - **影响范围：** `ModelCallStat.getProjects` 使用 `json_extract`
  - **潜在问题：** 若生产环境非 SQLite，SQL 可能不兼容。
  - **建议措施：** 确认 dialect；必要时使用 Sequelize JSON 运算或按 dialect 分支。

### 低风险项 (Low Risk)
- [ ] **ESLint 规则放宽**（`no-await-in-loop` 等关闭）可能降低静态约束，需要代码评审更谨慎。
- [ ] **项目元信息拉取无本地缓存**（改为队列+DB），需关注外部接口不可用时的体验降级。

---

## 🎯 重点关注 (Focus Areas)

### 大文件改动
> **标准：** 单文件 >200 行或核心业务逻辑文件

#### `blocklets/core/api/src/store/models/model-call-stat.ts` (±934 行)
- **改动原因：** 新增按天/项目聚合与趋势计算
- **主要变更：** 新统计维度、实时补齐、项目列表聚合
- **测试情况：** 未见新增测试
- **建议：** 增加单元测试覆盖聚合与边界（当前日/空数据/权限）

#### `blocklets/core/src/pages/usage/projects/components/project-call-history.tsx` (+707 行)
- **改动原因：** 新增项目调用历史 UI
- **主要变更：** 表格/筛选/抽屉详情
- **测试情况：** 未见新增测试
- **建议：** 至少补充关键交互与筛选逻辑测试

#### `blocklets/core/src/components/analytics/usage-overview-card.tsx` (+438 行)
- **改动原因：** Dashboard 统计卡片与趋势图
- **主要变更：** 新组件与交互
- **建议：** 检查移动端布局与指标切换

### 后端关键改动
> **特别关注：** API变更、数据库操作、权限逻辑、第三方集成

#### API 变更
- [x] 新增接口 `/api/usage/*`
- [ ] 请求参数变更
- [ ] 响应格式变更
- [ ] 错误码变更

#### 数据库操作
- [x] Schema 变更（新增 Projects、ModelCallStats 增 appDid）
- [x] 查询优化（预聚合 + 索引）
- [x] 索引变更
- [x] 迁移脚本

#### 权限逻辑
- [x] `allUsers` 仅 admin/owner
- [ ] 角色定义变更
- [ ] 访问控制变更

---

## ✅ Review 建议 (Review Recommendations)

### 代码质量 (Code Quality)
**评分：** ⭐⭐⭐⭐☆ (4/5)

**优点：**
- ✅ API/模型/前端职责拆分清晰
- ✅ 辅助函数（时间范围、权限校验）集中复用

**需要改进：**
- ⚠️ 估算天数与时间范围不一致（硬编码 30）
- ⚠️ 回填逻辑并发控制不足

**建议：**
- 💡 将 `daysInRange` 改为动态计算并加单测覆盖
- 💡 为 backfill 引入并发限制或分批处理

---

### 架构设计 (Architecture)
**评分：** ⭐⭐⭐⭐☆ (4/5)

**优点：**
- ✅ 预聚合 + 实时补齐降低查询成本
- ✅ Project 元信息通过队列异步更新，降低主链路耗时

**需要改进：**
- ⚠️ `json_extract` 依赖数据库方言

**建议：**
- 💡 确认生产 DB 方言与 JSON 聚合兼容性，必要时加分支处理

---

### 功能验证 (Functionality)
**评分：** ⭐⭐⭐⭐☆ (4/5)

**已验证：**
- ✅ `/api/usage/projects` 支持分页、排序
- ✅ 项目趋势支持 `hour/day` 粒度切换

**需要验证：**
- ❓ 额度估算在非 30 天时间范围的准确性
- ❓ 回填接口在大数据量下的稳定性
- ❓ Project Detail 页面在 appDid 为空/缺失元信息时的 UI 表现

**建议：**
- 💡 增加后端单元测试与前端关键 UI 场景测试

---

### 安全性 (Security)
**评分：** ⭐⭐⭐⭐☆ (4/5)

**安全措施：**
- ✅ `allUsers` 权限校验（admin/owner）
- ✅ session 中读取 `userDid`

**潜在风险：**
- 🔒 `allUsers` 默认关闭，但建议增加审计日志（谁在看全量数据）

**建议：**
- 💡 对 `allUsers` 访问记录做日志/审计

---

### 性能 (Performance)
**评分：** ⭐⭐⭐⭐☆ (4/5)

**性能优化：**
- ✅ 日级预聚合 + 当前日实时补齐
- ✅ 新增索引（ModelCallStats / ModelCalls）

**潜在问题：**
- ⚡ 大范围回填可能造成高峰负载

**建议：**
- 💡 将回填任务分批化，或接入队列/限流

---

## 📝 总体评价 (Overall Assessment)

### 综合评分
**总分：** ⭐⭐⭐⭐☆ (4/5)

### 核心优点
1. 预聚合架构清晰，减少实时统计成本
2. 后端 API 分层合理，权限控制明确
3. 前端页面拆分合理，支持 Dashboard + Project Detail

### 主要问题
1. 额度估算的时间范围硬编码可能导致偏差
2. 回填与聚合在大数据量场景可能存在负载压力
3. SQL JSON 聚合需确认数据库兼容性

### 最终建议
- **Must Fix (必须修复)：**
  - [ ] 无

- **Should Fix (建议修复)：**
  - [ ] `/api/usage/quota` 使用动态 `daysInRange`
  - [ ] 回填并发限制或分批处理
  - [ ] 确认 `json_extract` 在目标 DB 的可用性

- **Nice to Have (可选改进)：**
  - [ ] 为全量视角添加审计日志
  - [ ] 为关键统计逻辑补充单测

### 是否建议合并
- [ ] ✅ **批准合并** - 代码质量良好，可以合并
- [x] ⚠️ **条件批准** - 修复关键问题后可以合并
- [ ] ❌ **需要修改** - 存在重大问题，需要重新审查

---

## 📚 附加信息 (Additional Information)

### 测试覆盖
- 单元测试：未见新增
- 集成测试：未见新增
- E2E 测试：未见新增

### 文档更新
- [ ] API 文档
- [ ] 用户手册
- [ ] 开发文档
- [x] 变更日志（`blocklets/core/CHANGELOG.md`）

### 部署注意事项
- [x] 配置变更（新增 `@blocklet/env` 依赖）
- [x] 数据迁移（新增 Projects 表、ModelCallStats 增 appDid）
- [x] 服务重启
- [ ] 回滚方案

---

**生成时间：** 2026-01-27 11:31:56
**审查人：** Code Review Assistant
**版本：** 1.0
