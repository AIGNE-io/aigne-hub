# AIGNE Hub 报价自动化增强设计

> 日期: 2026-03-16
> 方案: 增量增强现有系统（方案 A）
> 约束: 半周交付核心能力

## 背景

AIGNE Hub 已有一套价格监控基础设施：

| 能力 | 现状 |
|------|------|
| 官方价格爬虫 | 5 个提供商的专用爬虫 + LLM fallback |
| 漂移检测 cron | `model-rate-check.ts` 定时对比 LiteLLM/OpenRouter/官方页面 |
| 历史记录表 | `AiModelRateHistory` 自动记录 rate 变更 |
| 通知系统 | `NotificationManager` 已集成漂移报警 |
| 批量更新 API | `bulk-rate-update` 仅支持 margin 计算模式 |
| 模型名映射 | `provider-aliases.ts` 基础映射 |

**核心问题**：各组件各自独立，缺乏"检测漂移 → 审批 → 批量更新 → 通知变更"的端到端流程。

## 决策记录

| 决策项 | 结论 |
|--------|------|
| 运行方式 | 混合模式：CI 自动检测 + 管理界面/API 审批 |
| 旧模型处理 | 软删除（deprecated 标签） |
| 映射规则存储 | 代码中的静态映射（provider-aliases.ts） |
| 二级提供商定价 | 自动继承一级提供商价格 |
| 建设方式 | 在现有基础上增强，不另起炉灶 |
| 迭代范围 | 用户根据方案自行决定优先级 |

## 设计

### Section 1: 模型名映射增强

**文件**: `scripts/provider-aliases.ts`

**改动内容**:

#### 1.1 扩展 modelNameFallbacks()

增加通用的名称归一化规则：

- 去尾部版本号: `claude-sonnet-4-0` → `claude-sonnet-4`
- 去日期后缀: `gpt-4o-2024-08-06` → `gpt-4o`
- 标准化分隔符: 确保一致性

#### 1.2 新增 MODEL_NAME_OVERRIDES 静态映射表

处理无法通过规则推导的特例：

```typescript
const MODEL_NAME_OVERRIDES: Record<string, string> = {
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  "gemini-flash-2.5": "gemini-2.5-flash",  // 修复已知拼写错误
  // ... 其他特例
};
```

#### 1.3 新增 PROVIDER_TIERS 常量

```typescript
const PROVIDER_TIERS = {
  tier1: ["openai", "anthropic", "google", "xai", "deepseek", "doubao"],
  tier2: ["poe", "openrouter", "rock"],
};
```

#### 1.4 新增 resolveModelMapping()

```typescript
function resolveModelMapping(
  dbModel: string,
  dbProvider: string
): { primaryProvider: string; primaryModel: string }
```

- 二级提供商模型映射到一级提供商
- OpenRouter: `anthropic/claude-sonnet-4` → provider=anthropic, model=claude-sonnet-4
- Poe: 按模型名匹配一级提供商

**匹配优先级**:
1. `MODEL_NAME_OVERRIDES` 精确匹配
2. `modelNameFallbacks()` 规则推导
3. 原始名直接匹配

---

### Section 2: Bulk Update API 增强

**文件**: `api/src/routes/ai-providers.ts`

**改动**: 增强 `POST /api/ai-providers/bulk-rate-update`，支持两种模式。

#### 模式 1（现有，不变）: margin 计算模式

```json
{
  "mode": "margin",
  "profitMargin": 20,
  "creditPrice": 0.001
}
```

#### 模式 2（新增）: 直接更新 unitCosts 模式

```json
{
  "mode": "sync",
  "updates": [
    {
      "providerId": "openai",
      "model": "gpt-4o",
      "unitCosts": { "input": 0.0000025, "output": 0.00001 },
      "caching": { "readRate": 0.00000125, "writeRate": 0.00000375 },
      "source": "official-page"
    }
  ],
  "applyRates": true,
  "profitMargin": 20,
  "creditPrice": 0.001
}
```

**处理流程**:

1. 遍历 updates 数组
2. 通过 `resolveModelMapping()` 匹配 DB 中的 model rate 记录
3. 更新 unitCosts（成本价）
4. 如果 `applyRates=true`，同时按 margin 重算 inputRate/outputRate（售价）
5. 匹配不到的模型收集到 `unmatched[]`
6. 更新失败的模型（DB 错误等）收集到 `errors[]`
7. 已有的 `afterUpdate` hook 自动写入 `AiModelRateHistory`

**返回值**:

```json
{
  "updated": [],
  "unchanged": [],
  "unmatched": [],
  "errors": [],
  "summary": { "total": 0, "updated": 0, "unchanged": 0, "unmatched": 0, "errors": 0 }
}
```

---

### Section 3: Cron 检测增强（漂移 → 待审批）

**文件**: `api/src/crons/model-rate-check.ts`, `api/src/libs/pricing-comparison.ts`

**现状**: cron 检测到漂移后，只记录 `source_drift` history 并发通知。无法直接从通知触发更新。

**改动**:

#### 3.1 漂移检测结果持久化

在 `AiModelRateHistory` 中增加 `status` 字段:

```
status: 'detected' | 'approved' | 'applied' | 'dismissed'
```

- cron 检测到漂移时，创建 `status=detected` 的记录
- 管理员审批后，标记为 `approved`
- 批量更新执行后，标记为 `applied`
- 忽略不处理的，标记为 `dismissed`

#### 3.2 通知中包含操作链接

通知增加 action button，链接到管理后台的 model-rates 页面，方便管理员快速跳转 review。

#### 3.3 新增审批 API

```
POST /api/ai-providers/model-rate-history/:id/approve
POST /api/ai-providers/model-rate-history/:id/dismiss
POST /api/ai-providers/model-rate-history/batch-apply
```

- `batch-apply`: 将所有 `status=approved` 的漂移记录应用到 model rates
- 内部调用 Section 2 的 sync 模式完成实际更新
- 原子性更新 history 记录的 status 为 `applied`
- 部分失败时：成功的标记 `applied`，失败的保持 `approved` 并在返回值中标注

---

### Section 4: 历史记录与变更报告

**文件**: `api/src/store/models/ai-model-rate-history.ts`, `api/src/libs/notifications/manager.ts`

**现状**: history 表已存在，`afterUpdate` hook 自动记录。但 `bulk_update` 类型支持不完整，无变更报告。

**改动**:

#### 4.1 完善 bulk_update 记录

bulk-rate-update (sync 模式) 执行后:

- 每个模型的变更单独记录（已有 hook 自动完成）
- 额外创建一条汇总记录:
  - `changeType`: `bulk_update`
  - `metadata`: `{ source, totalUpdated, totalUnchanged, totalUnmatched, timestamp }`

#### 4.2 变更报告通知

批量更新完成后，发送通知:

```
标题: "模型价格批量更新完成"
内容:
  - 更新了 N 个模型的成本价
  - 其中 M 个同时更新了售价
  - K 个模型未匹配到（附列表）
  - 变更详情链接
```

#### 4.3 变更报告 API

```
GET /api/ai-providers/model-rate-history?changeType=bulk_update&limit=10
```

返回最近的批量更新记录，含每次更新的详细 diff。

---

### Section 5: 模型软删除

**文件**: `api/src/store/models/ai-model-rate.ts`, migration

**改动**:

#### 5.1 新增 deprecated 字段

```typescript
deprecated: {
  type: DataTypes.BOOLEAN,
  defaultValue: false,
}
deprecatedAt: {
  type: DataTypes.DATE,
  allowNull: true,
}
deprecatedReason: {
  type: DataTypes.STRING,
  allowNull: true,  // e.g. "unmatched_after_sync", "manual"
}
```

#### 5.2 自动标记逻辑

在 bulk-rate-update (sync 模式) 中:

- `unmatched` 列表中的模型，如果连续 N 次未匹配，自动标记为 `deprecated`
- N 为可配置常量 `DEPRECATION_THRESHOLD = 3`
- `deprecatedReason = "unmatched_after_sync"`
- 当一级模型被 deprecated 时，关联的二级模型也应同步标记

#### 5.3 查询过滤

- 公开的 `/api/ai-providers/models` 端点默认排除 deprecated 模型
- 管理端点可通过 `?includeDeprecated=true` 查看全部

---

### Section 6: 二级提供商价格继承

**文件**: `api/src/crons/model-rate-check.ts`, bulk-rate-update 逻辑

**改动**:

#### 6.1 继承逻辑

在批量更新流程中:

1. 先更新所有一级提供商的 unitCosts
2. 遍历二级提供商的模型
3. 通过 `resolveModelMapping()` 找到对应的一级模型
4. 将一级模型的 unitCosts 复制到二级模型
5. 二级模型按自己的 margin 重算售价

#### 6.2 标记来源

二级模型更新时，history 记录中 `source` 标记为 `inherited:<primaryProvider>`，便于追溯。

---

## 实施优先级建议

按依赖关系和价值排序:

| 阶段 | 内容 | 依赖 | 预估 |
|------|------|------|------|
| P0 | Section 1: 模型名映射增强 | 无 | 0.5d |
| P0 | Section 2: Bulk Update API sync 模式 | Section 1 | 1d |
| P1 | Section 4: 历史记录与变更报告 | Section 2 | 0.5d |
| P1 | Section 5: 模型软删除 | Section 2 | 0.5d |
| P1 | Section 6: 二级提供商价格继承 | Section 1, 2 | 0.5d |
| P2 | Section 3: Cron 检测增强（审批流） | Section 2 | 1d |

**P0（核心）**: 映射 + 批量更新 = 解决"一次性更新所有价格"的需求
**P1（增强）**: 历史 + 软删除 + 二级继承 = 完善运营能力
**P2（流程）**: 审批流 = 完整的自动化闭环

## 涉及文件清单

```
修改:
  scripts/provider-aliases.ts          — 映射规则增强
  api/src/routes/ai-providers.ts       — bulk-rate-update 增强 + 审批 API
  api/src/crons/model-rate-check.ts    — cron 增强
  api/src/libs/pricing-comparison.ts   — 对比逻辑增强
  api/src/store/models/ai-model-rate.ts         — 软删除字段
  api/src/store/models/ai-model-rate-history.ts — status 字段
  api/src/libs/notifications/manager.ts          — 变更报告通知

新增:
  api/src/store/migrations/YYYYMMDD-add-deprecated-fields.ts
  api/src/store/migrations/YYYYMMDD-add-history-status.ts
```
