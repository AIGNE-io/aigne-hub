# 数据保留策略(Data Retention Policy)规格说明

## 1. 概述

### 产品定位
为 AI Kit 系统添加自动数据保留和归档功能,通过将旧数据迁移到归档表来控制主数据库的数据量增长。

### 核心概念
- 定期自动归档:每天在低峰时段自动执行归档任务
- 按季度分库:归档数据按季度创建独立的 SQLite 文件,便于管理和细粒度清理
- ATTACH 跨库事务:使用 SQLite ATTACH DATABASE 实现跨库原子操作
- 自动清理:超过保留季度数的旧归档库自动删除
- 失败重试:归档失败时依赖下次定时任务自动重试

### 优先级
高优先级。当前数据量已达到万级别并持续增长,需要尽快实施归档策略。

### 目标用户
最终用户(间接受益,系统性能提升)和系统管理员(直接管理归档配置)。

### 项目范围
- ModelCall 和 ModelCallStats 表和 Usage 表的自动归档
- 按季度创建归档库
- 定时任务自动执行
- 自动清理旧归档库
- 基础日志记录

不包括:
- UI 配置界面(后续补充)
- 归档数据恢复功能
- 归档数据在线查询界面

## 2. 架构设计

### 数据层

#### 主表结构
```typescript
// ModelCalls 表 (现有)
- id: string (主键)
- providerId: string
- model: string
- credentialId: string
- type: CallType
- totalUsage: number
- credits: decimal(20,8)
- status: enum('processing', 'success', 'failed')
- duration: decimal(10,1)
- userDid: string
- appDid: string | null
- callTime: integer (Unix timestamp, 用于判断归档)
- createdAt: Date
- updatedAt: Date
- traceId: string
- ...其他字段
// (无需 archived 字段，使用 ATTACH 跨库事务保证一致性)

// ModelCallStats 表 (现有)
- id: string (主键)
- userDid: string | null
- appDid: string | null
- timestamp: integer (Unix timestamp, 用于判断归档)
- timeType: enum('day', 'hour')
- stats: JSON
- createdAt: Date
- updatedAt: Date
// (无需 archived 字段)

// Usage 表 (现有)
- id: string (主键)
- promptTokens: integer
- completionTokens: integer
- cacheCreationInputTokens: integer | null
- cacheReadInputTokens: integer | null
- numberOfImageGeneration: integer | null
- mediaDuration: integer | null
- apiKey: string | null
- type: string | null
- model: string | null
- modelParams: JSON | null
- appId: string | null
- userDid: string | null
- usageReportStatus: enum(null, 'counted', 'reported')
- usedCredits: decimal | null
- createdAt: Date (用于判断归档)
- updatedAt: Date
// (无需 archived 字段)
```

#### 归档表结构
```typescript
// 按季度分库，每季度一个独立的 SQLite 文件
// archive_2025_Q1.db 中包含: ModelCalls, ModelCallStats, Usage
// archive_2025_Q2.db 中包含: ModelCalls, ModelCallStats, Usage
// 表结构与主库中的源表完全相同（表名大小写保持一致）
```

#### 归档执行记录表
```typescript
// ArchiveExecutionLog 表 (新增，存储在主库)
// 记录每次归档任务的执行明细
- id: string (主键, UUID)
- tableName: string ('ModelCalls' | 'ModelCallStats' | 'Usage')
- status: enum('success', 'failed')
- archivedCount: integer (归档记录数)
- dataRangeStart: integer (归档数据范围起始时间戳)
- dataRangeEnd: integer (归档数据范围结束时间戳)
- targetArchiveDb: string (目标归档库，如 'archive_2024_Q1.db'，多库时用逗号分隔)
- duration: decimal(10,3) (执行耗时，秒)
- errorMessage: text | null (失败时的错误信息)
- createdAt: Date
- updatedAt: Date
```

#### 数据库
- 主库: SQLite (存储当前活跃数据)
- 归档库: 按季度分库，每季度一个独立的 SQLite 文件
  - 命名格式: `archive_YYYY_QN.db` (如 `archive_2025_Q1.db`)
  - 表名与源表相同: `ModelCalls`, `ModelCallStats`, `Usage`
- 使用 SQLite ATTACH DATABASE 实现跨库事务
- 归档库目录固定为: `{DATA_DIR}/archives/`
- **自动清理**: 超过保留季度数的归档库自动删除

#### 归档数据库管理

归档表创建使用独立连接；归档数据迁移使用 SQLite ATTACH 跨库事务：

```typescript
// 归档数据库工具类
class ArchiveDatabase {
  /**
   * 获取季度标识: "2025_Q1", "2025_Q2" 等（UTC）
   */
  static getQuarterKey(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
    return `${year}_Q${quarter}`;
  }

  /**
   * 获取归档库文件路径
   */
  static getArchivePath(quarterKey: string): string {
    const archiveDir = path.join(Config.dataDir, 'archives');
    return path.join(archiveDir, `archive_${quarterKey}.db`);
  }

  /**
   * 清理超过保留期限的旧归档库
   */
  static async cleanupOldArchives(): Promise<string[]> {
    const archiveDir = path.join(Config.dataDir, 'archives');
    const retentionQuarters = parseInt(process.env.ARCHIVE_RETENTION_QUARTERS || '6', 10);

    if (retentionQuarters === 0) {
      logger.info('Archive cleanup disabled (ARCHIVE_RETENTION_QUARTERS=0)');
      return [];
    }

    const files = await fs.readdir(archiveDir);
    const archiveFiles = files
      .filter((f) => f.match(/^archive_\d{4}_Q[1-4]\.db$/))
      .sort()
      .reverse();

    const toDelete = archiveFiles.slice(retentionQuarters);
    const deleted: string[] = [];

    for (const file of toDelete) {
      const filePath = path.join(archiveDir, file);
      await fs.unlink(filePath);
      deleted.push(file);
      logger.info('Old archive deleted', { file });
    }

    return deleted;
  }

  /**
   * 在独立归档库中创建/补齐表结构（如不存在）
   */
  static async ensureArchiveDbAndTable(
    archivePath: string,
    tableName: string,
    mainSequelize: Sequelize
  ): Promise<void> {
    // 1) 独立连接到归档库
    // 2) 若表不存在：复制主库列结构（跳过动态默认值）并复制索引
    // 3) 若表已存在：只补齐新增列
    // 4) 关闭连接
  }
}
```

### 配置层

#### 环境变量
```bash
# ModelCall 表保留期限(月)
RETENTION_MODEL_CALL_MONTHS=3

# ModelCallStats 表保留期限(月)
RETENTION_MODEL_CALL_STATS_MONTHS=6

# Usage 表保留期限(月)
RETENTION_USAGE_MONTHS=3

# 归档任务 Cron（默认每天 02:00:00，6 段 Cron）
ARCHIVE_MODEL_DATA_CRON_TIME="0 0 2 * * *"

# 归档库保留季度数(默认 6，即保留 1.5 年的归档数据)
ARCHIVE_RETENTION_QUARTERS=6
```

**硬编码常量** (无需配置):
- `BATCH_SIZE = 500` - 每批处理 500 条
- `BATCH_DELAY_MS = 200` - 批间延迟 200ms
- `ARCHIVE_DIR = {DATA_DIR}/archives/` - 归档库目录

### 执行层

#### Cron 任务
```typescript
// 添加到 blocklets/core/api/src/crons/index.ts
{
  name: 'archive.model.data',
  time: ARCHIVE_MODEL_DATA_CRON_TIME, // 默认 0 0 2 * * *（含秒）
  fn: async () => {
    if (shouldExecuteTask('archive.model.data cron')) {
      logger.info('Executing archive task on cluster:', { instanceId: process.env.BLOCKLET_INSTANCE_ID });
      await executeArchiveTask();
    }
  },
  options: { runOnInit: false }
}
```

#### 并发控制

使用文件锁防止多进程并发执行归档任务：

- 使用 `proper-lockfile` 库实现文件锁
- 锁文件路径: `{DATA_DIR}/archive.lock`
- 获取锁失败时直接退出，不阻塞等待
- 进程崩溃后锁自动释放

```typescript
// 伪代码
const lockfile = require('proper-lockfile');

async function runArchive() {
  try {
    await lockfile.lock(LOCK_FILE_PATH, { stale: 3600000 }); // 1小时超时
    // 执行归档逻辑
  } catch (err) {
    if (err.code === 'ELOCKED') {
      logger.info('Another archive process is running, skip');
      return;
    }
    throw err;
  } finally {
    await lockfile.unlock(LOCK_FILE_PATH);
  }
}
```

#### 归档服务
```typescript
// blocklets/core/api/src/libs/data-archive.ts

interface ArchiveResult {
  success: boolean;
  archivedCount: number;
  errorMessage?: string;
  duration: number;
  dataRangeStart?: number;
  dataRangeEnd?: number;
  targetArchiveDbs?: string[];
}

class DataArchiveService {
  // 硬编码常量
  private static readonly BATCH_SIZE = 500;
  private static readonly BATCH_DELAY_MS = 200;

  // 归档 ModelCall 表
  async archiveModelCalls(): Promise<ArchiveResult>

  // 归档 ModelCallStats 表
  async archiveModelCallStats(): Promise<ArchiveResult>

  // 归档 Usage 表
  async archiveUsage(): Promise<ArchiveResult>

  // 通用归档：按季度范围归档
  private async archiveTable(config: TableConfig): Promise<ArchiveResult>

  // 使用 ATTACH 执行跨库事务迁移（按季度范围）
  private async migrateBatchWithAttach(
    tableName: string,
    timeField: string,
    fieldType: 'timestamp' | 'date',
    range: { key: string; start: Date; end: Date },
    txLike: { connection: unknown }
  ): Promise<number>

  // 计算截止日期（按日历月）
  private calculateCutoffDate(retentionMonths: number): Date
}
```



## 3. 详细行为

### 归档流程 (ATTACH 跨库事务)

使用 SQLite `ATTACH DATABASE` 实现跨库原子操作：

```
┌──────────┐    ┌─────────────────────┐    ┌─────┐
│  ATTACH  │───>│ BEGIN IMMEDIATE    │───>│ LOG │
│ 归档库    │    │  INSERT + DELETE    │    │     │
└──────────┘    │ COMMIT / ROLLBACK   │    └─────┘
                └─────────────────────┘
                    ↑
                    └── 事务保证原子性，无需中间状态
```

#### 步骤详解

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1. ATTACH | 挂载归档库到主连接 | `ATTACH DATABASE 'archive_YYYY_QN.db' AS archive` |
| 2. 事务 | INSERT + DELETE 在同一事务 | 要么都成功，要么都回滚 |
| 3. LOG | 写入 ArchiveExecutionLog | 记录归档明细 |
| 4. DETACH | 卸载归档库 | `DETACH DATABASE archive` |

#### 核心 SQL

```sql
-- 1. 挂载归档库
ATTACH DATABASE '/path/to/archive_2025_Q1.db' AS archive;

-- 2. 跨库事务
BEGIN IMMEDIATE;

-- 2a. 插入到归档库
-- 先取一批要归档的 ID（按季度范围）
SELECT id FROM main."ModelCalls"
WHERE callTime >= :start AND callTime < :end
LIMIT :batchSize;

-- 再插入归档库
INSERT INTO archive."ModelCalls"
SELECT * FROM main."ModelCalls" WHERE id IN (:ids);

-- 2b. 删除主库数据 (同一事务!)
DELETE FROM main."ModelCalls"
WHERE id IN (
  SELECT id FROM main."ModelCalls"
  WHERE callTime >= :start AND callTime < :end
  LIMIT :batchSize
);

COMMIT;

-- 3. 卸载
DETACH DATABASE archive;
```

#### 失败处理

- 事务失败: 自动回滚，数据保持原状，下次重试
- ATTACH 失败: 记录错误，跳过该批次
- 无需 `archived` 中间状态，事务保证一致性

#### 主流程
```
1. 定时任务触发(默认每天 02:00:00，可通过 ARCHIVE_MODEL_DATA_CRON_TIME 配置)
2. 获取文件锁，防止并发执行
3. 串行执行 ModelCall、ModelCallStats、Usage 的归档
4. 自动清理超期的旧归档库
5. 记录执行结果到 ArchiveExecutionLog
6. 如果失败,记录错误日志,明天重新尝试
7. 释放文件锁
```

#### 单表归档流程
```
1. 读取环境变量中的保留期限
2. 计算截止时间戳 = 当前时间 - 保留期限
3. 确定目标季度的归档库文件路径
4. ATTACH 归档库到主连接
5. 确保归档表存在(如不存在则从主库复制结构)
6. 按批次执行归档(每批500条):
   a. BEGIN TRANSACTION
   b. INSERT 到归档库
   c. DELETE 主库数据
   d. COMMIT
   e. 写入 ArchiveExecutionLog
   f. 批间延迟(200ms)
7. DETACH 归档库
8. 返回归档结果(成功/失败、总数、耗时)
```

#### 批间延迟

为避免归档任务占用过多资源影响用户请求，每批处理后添加延迟：

- 固定延迟: 200ms (硬编码，无需配置)
- 延迟在每个批次的 INSERT + DELETE 完成后执行
- 配合凌晨 2 点执行窗口，对用户影响极小

```typescript
const BATCH_DELAY_MS = 200;

for (const batch of batches) {
  await archiveBatch(batch);
  await sleep(BATCH_DELAY_MS);
}
```

### 自动清理旧归档

归档任务完成后自动清理超过保留期限的旧归档库：

```
归档完成
    ↓
┌───────────────────────────────┐
│  扫描 archives/ 目录           │
│  按季度排序所有归档文件         │
└─────────────┬─────────────────┘
              ↓
┌───────────────────────────────┐
│  保留最新 N 个季度             │
│  (N = ARCHIVE_RETENTION_QUARTERS) │
└─────────────┬─────────────────┘
              ↓
┌───────────────────────────────┐
│  删除超期的归档库文件          │
│  记录删除日志                  │
└───────────────────────────────┘
```

**配置项:**
- `ARCHIVE_RETENTION_QUARTERS`: 保留的季度数，默认 6（即 1.5 年）
- 设为 0 表示不自动清理（满足特殊合规需求）

**执行时机:**
- 每次归档任务完成后执行
- 独立于归档逻辑，清理失败不影响归档结果

### 归档表创建

归档表创建使用独立连接完成（不依赖 ATTACH），若表已存在则补齐新增列并复制索引。

关键点：
- 表名与源表相同（如 `ModelCalls`）
- 表结构从主库复制
- 跳过动态默认值（如 CURRENT_TIMESTAMP）
- 已存在表只补齐新增列
- 复制非 sqlite_autoindex 的索引
- 每季度一个独立的 SQLite 文件（如 `archive_2025_Q1.db`）

### 失败处理

#### 失败策略
归档任务失败时的处理方式:

1. **记录详细日志**: 记录错误信息、堆栈跟踪、失败时的上下文
2. **不中断流程**: 一个表归档失败不影响另一个表
3. **自然重试**: 归档是每天运行的定时任务,失败的数据明天会自动重新尝试
4. **监控告警**: 通过日志监控系统发现持续失败的情况

**不需要即时重试**的理由:
- 归档是每天执行的定时任务,24小时后会自动重试
- 临时性错误(如网络波动)第二天大概率已恢复
- 持久性错误(如数据库损坏)即时重试也无法解决,需要人工介入

```typescript
// 示例:简单的错误处理
try {
  const result = await dataArchiveService.archiveModelCalls();
  logger.info('ModelCalls archive completed', result);
} catch (error) {
  logger.error('ModelCalls archive failed', {
    error: error.message,
    stack: error.stack
  });
  // 继续执行下一个表的归档
}
```

### 日志记录

#### 日志内容
```typescript
// 任务开始
logger.info('Archive task started', {
  timestamp: new Date().toISOString(),
  retentionMonths: 6
});

// 单表归档开始
logger.info('Archiving table', {
  tableName: 'ModelCalls',
  cutoffTimestamp,
  cutoffDate: new Date(cutoffTimestamp * 1000).toISOString(),
  batchSize: ARCHIVE_BATCH_SIZE
});

// 批次完成
logger.info('Batch archived', {
  tableName: 'ModelCalls',
  batchNumber: 5,
  recordsArchived: 1000,
  targetDb: 'archive_2024_Q1.db'
});

// 表归档完成
logger.info('Table archive completed', {
  tableName: 'ModelCalls',
  totalArchived: 5000,
  duration: 12.5, // seconds
  success: true,
  targetArchiveDbs: ['archive_2025_Q1.db']
});

// 归档失败
logger.error('Archive failed', {
  tableName: 'ModelCalls',
  attempt: 2,
  error: error.message,
  stack: error.stack
});

// 任务完成
logger.info('Archive task completed', {
  timestamp: new Date().toISOString(),
  results: {
    modelCalls: { archived: 5000, duration: 12.5 },
    modelCallStats: { archived: 2000, duration: 6.1 }
  },
  totalDuration: 25.3 // seconds
});
```



## 4. 用户体验

### 用户无感知
- 归档在低峰时段自动执行
- 不影响正常业务操作
- 归档数据仍可通过直接查询归档表访问(需要手动 SQL)

### 管理员配置
MVP 阶段通过环境变量配置:
```bash
# .env 文件
RETENTION_MODEL_CALL_MONTHS=3
RETENTION_MODEL_CALL_STATS_MONTHS=6
RETENTION_USAGE_MONTHS=3
ARCHIVE_RETENTION_QUARTERS=6
```

注意:
- 批量大小固定为 500 条/批,在代码中硬编码
- 批间延迟固定为 200ms,在代码中硬编码
- 归档库目录固定为 `{DATA_DIR}/archives/`
- 失败不重试,依赖明天的定时任务自动重新尝试

### 后续 UI (不在 MVP 范围)
未来可添加管理后台页面:
- 配置保留期限
- 手动触发归档
- 查看归档历史
- 查询归档数据



## 5. 技术实现指南

### 项目结构
```
blocklets/core/api/src/
├── libs/
│   ├── data-archive.ts          # 归档服务核心逻辑
│   ├── archive-database.ts      # 归档库管理/建表/清理
│   └── env.ts                   # 环境变量定义
├── crons/
│   ├── index.ts                 # 添加归档定时任务
│   └── archive-task.ts          # 归档任务执行器
└── store/
    ├── models/
    │   └── archive-execution-log.ts
    └── migrations/
        └── 20260130000000-add-archived-field-and-execution-log.ts
```

### 核心代码示例

#### 环境变量定义
```typescript
// blocklets/core/api/src/libs/env.ts

export const RETENTION_MODEL_CALL_MONTHS = parseInt(
  process.env.RETENTION_MODEL_CALL_MONTHS || '3',
  10
);

export const RETENTION_MODEL_CALL_STATS_MONTHS = parseInt(
  process.env.RETENTION_MODEL_CALL_STATS_MONTHS || '6',
  10
);

export const RETENTION_USAGE_MONTHS = parseInt(
  process.env.RETENTION_USAGE_MONTHS || '3',
  10
);

export const ARCHIVE_MODEL_DATA_CRON_TIME = process.env.ARCHIVE_MODEL_DATA_CRON_TIME || '0 0 2 * * *';

export const ARCHIVE_RETENTION_QUARTERS = parseInt(
  process.env.ARCHIVE_RETENTION_QUARTERS || '6',
  10
);

// 以下为硬编码常量，不通过环境变量配置
// ARCHIVE_DIR: 固定为 {DATA_DIR}/archives/
// BATCH_SIZE: 固定为 500
// BATCH_DELAY_MS: 固定为 200
```

#### 归档服务接口

归档服务使用 SQLite ATTACH DATABASE 实现跨库事务操作。

```typescript
// blocklets/core/api/src/libs/data-archive.ts

import { sequelize } from '../store/sequelize';
import { ArchiveDatabase } from './archive-database';
import dayjs from './dayjs';
import { RETENTION_MODEL_CALL_MONTHS, RETENTION_MODEL_CALL_STATS_MONTHS, RETENTION_USAGE_MONTHS } from './env';

export interface ArchiveResult {
  success: boolean;
  archivedCount: number;
  errorMessage?: string;
  duration: number;
  dataRangeStart?: number;
  dataRangeEnd?: number;
  targetArchiveDbs?: string[];
}

type FieldType = 'timestamp' | 'date';

interface TableConfig {
  tableName: string;
  timeField: string;
  retentionMonths: number;
  fieldType: FieldType;
}

export class DataArchiveService {
  // 硬编码常量
  private static readonly BATCH_SIZE = 500;
  private static readonly BATCH_DELAY_MS = 200;

  private static readonly TABLE_CONFIGS: Record<string, TableConfig> = {
    ModelCalls: {
      tableName: 'ModelCalls',
      timeField: 'callTime',
      retentionMonths: RETENTION_MODEL_CALL_MONTHS,
      fieldType: 'timestamp',
    },
    ModelCallStats: {
      tableName: 'ModelCallStats',
      timeField: 'timestamp',
      retentionMonths: RETENTION_MODEL_CALL_STATS_MONTHS,
      fieldType: 'timestamp',
    },
    Usage: {
      tableName: 'Usage',
      timeField: 'createdAt',
      retentionMonths: RETENTION_USAGE_MONTHS,
      fieldType: 'date',
    },
  };

  async archiveModelCalls(): Promise<ArchiveResult> {
    return this.archiveTable(DataArchiveService.TABLE_CONFIGS.ModelCalls);
  }

  async archiveModelCallStats(): Promise<ArchiveResult> {
    return this.archiveTable(DataArchiveService.TABLE_CONFIGS.ModelCallStats);
  }

  async archiveUsage(): Promise<ArchiveResult> {
    return this.archiveTable(DataArchiveService.TABLE_CONFIGS.Usage);
  }

  /**
   * 通用归档方法：先计算 cutoff，再按季度范围逐库归档
   */
  private async archiveTable(config: TableConfig): Promise<ArchiveResult> {
    // ... 计算 cutoffDate 与季度范围，逐季度 archiveQuarter
  }

  private async archiveQuarter(
    tableName: string,
    timeField: string,
    fieldType: FieldType,
    range: { key: string; start: Date; end: Date }
  ): Promise<number> {
    // ATTACH -> BEGIN IMMEDIATE -> 批量 INSERT/DELETE -> COMMIT/ROLLBACK -> DETACH
  }

  /**
   * 批量迁移（ATTACH 跨库事务）
   */
  private async migrateBatchWithAttach(): Promise<number> {
    // SELECT ids -> INSERT archive -> DELETE main
  }

  /**
   * 使用日历月计算截止时间
   */
  private calculateCutoffDate(retentionMonths: number): Date {
    const months = Number.isFinite(retentionMonths) && retentionMonths >= 0 ? retentionMonths : 6;
    return dayjs().subtract(months, 'month').toDate();
  }
}

export const dataArchiveService = new DataArchiveService();
```

#### Cron 任务注册
```typescript
// blocklets/core/api/src/crons/index.ts

import { ARCHIVE_MODEL_DATA_CRON_TIME } from '@api/libs/env';
import { executeArchiveTask } from './archive-task';

// 在 jobs 数组中添加:
{
  name: 'archive.model.data',
  time: ARCHIVE_MODEL_DATA_CRON_TIME, // 默认 0 0 2 * * *（含秒）
  fn: async () => {
    if (shouldExecuteTask('archive.model.data cron')) {
      logger.info('Executing archive task on cluster:', {
        instanceId: process.env.BLOCKLET_INSTANCE_ID
      });
      await executeArchiveTask();
    }
  },
  options: { runOnInit: false }
}
```

#### 任务执行器
```typescript
// blocklets/core/api/src/crons/archive-task.ts

import path from 'path';
import lockfile from 'proper-lockfile';

import { Config } from '../libs/env';
import logger from '../libs/logger';
import { ArchiveDatabase } from '../libs/archive-database';
import { ArchiveResult, dataArchiveService } from '../libs/data-archive';
import ArchiveExecutionLog, { ArchiveTableName } from '../store/models/archive-execution-log';

function getLockFilePath(): string {
  const dataDir = Config.dataDir || process.cwd();
  return path.join(dataDir, 'archive.lock');
}

async function logArchiveResult(tableName: ArchiveTableName, result: ArchiveResult): Promise<void> {
  await ArchiveExecutionLog.create({
    tableName,
    status: result.success ? 'success' : 'failed',
    archivedCount: result.archivedCount,
    dataRangeStart: result.dataRangeStart ?? null,
    dataRangeEnd: result.dataRangeEnd ?? null,
    targetArchiveDb: result.targetArchiveDbs?.join(', ') ?? null,
    duration: result.duration,
    errorMessage: result.errorMessage ?? null,
  });
}

export async function executeArchiveTask(): Promise<void> {
  // 获取文件锁（stale=1h，retries=0），ENOENT 时先创建锁文件再重试
  // 串行执行归档，记录 ArchiveExecutionLogs
  // 清理旧归档库，释放锁
}
```

### 查询归档数据

#### 手动查询示例
```sql
-- 连接到归档库 archive_2024_Q1.db 后查询
-- (需要先 ATTACH DATABASE 或直接打开归档库文件)
SELECT * FROM "ModelCalls"
WHERE userDid = 'xxx'
ORDER BY callTime DESC
LIMIT 100;

-- 统计归档数据量 (在 archive_2024_Q1.db 中)
SELECT
  COUNT(*) as count,
  MIN(callTime) as earliest,
  MAX(callTime) as latest
FROM "ModelCalls";

-- 联合查询需要先 ATTACH 归档库
-- ATTACH DATABASE 'archives/archive_2024_Q1.db' AS archive_2024_q1;
-- ATTACH DATABASE 'archives/archive_2025_Q1.db' AS archive_2025_q1;
SELECT * FROM "ModelCalls" WHERE userDid = 'xxx'
UNION ALL
SELECT * FROM archive_2024_q1."ModelCalls" WHERE userDid = 'xxx'
UNION ALL
SELECT * FROM archive_2025_q1."ModelCalls" WHERE userDid = 'xxx'
ORDER BY callTime DESC;
```


## 6. 决策总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 存储位置 | 按季度分库 (archive_2025_Q1.db, ...) | 冷热数据分离,更细粒度清理,自动删除超期数据 |
| 分库策略 | 按季度分库 + 自动清理 | 清理粒度细(季度),自动化程度高,零运维 |
| 归档时机 | 定时任务自动执行 | 无需人工干预,在低峰期自动运行 |
| 执行方式 | 串行执行 | SQLite 单线程数据库,串行更安全可靠 |
| 事务策略 | ATTACH 跨库事务 | INSERT + DELETE 在同一事务,原子操作 |
| 并发控制 | 文件锁(proper-lockfile) | 防止多进程并发,简单可靠 |
| 批间延迟 | 200ms (固定) | 避免影响用户请求,无需配置 |
| 批量大小 | 500 条/批 (固定) | 减少单批处理量,降低锁定时间 |
| 配置方式 | 环境变量 (共 5 个，含归档 Cron) | MVP 快速实现,无需 UI;后续可扩展 |
| 保留期限 | ModelCall: 3个月<br>ModelCallStats: 6个月<br>Usage: 3个月 | ModelCall/Usage增长快保留3个月,Stats聚合数据保留6个月 |
| 归档保留 | 默认 6 季度 (1.5年) | 自动清理超期归档库,空间可控 |
| 失败处理 | 记录日志+ArchiveExecutionLog,明天重试 | 定时任务每天运行,无需即时重试 |
| 查询方式 | 手动 SQL 查询 | MVP 不提供 UI,降低复杂度 |
| 监控方式 | 日志记录 + ArchiveExecutionLog | 记录关键指标,结构化历史记录 |
| 归档表结构 | 与主表完全相同 | 不添加额外字段,保持简单 |
| 磁盘校验 | MVP 不校验 | SQLite 自动报错,监控预警更实用 |
| 磁盘不足 | 通过自动清理预防 | 超期归档自动删除,空间可控 |

### 冷存储库分库策略

**决策**: 按季度分库 + 自动清理，每季度一个独立的 SQLite 文件（如 `archive_2025_Q1.db`）

**考虑的方案**:
1. 按年分库 (原方案)
2. 按季度分库 + 自动清理 ✓ (当前方案)
3. 按月分库
4. 滚动窗口（固定槽位）

**选择理由**:
- 清理粒度更细: 按季度删除比按年删除风险低 75%
- 磁盘空间可控: 自动清理确保空间不会无限增长
- 零运维: 超期数据自动删除，无需人工干预
- 时间语义清晰: 季度比滚动槽位更易理解和审计
- 文件数量适中: 保留 6 季度 = 6 个文件，不会过多

### 跨库操作方案

**决策**: 使用 SQLite ATTACH DATABASE 实现跨库事务

**考虑的方案**:
1. 独立连接 + 分阶段归档 (原方案)
2. ATTACH DATABASE + 跨库事务 ✓ (当前方案)

**选择理由**:
- 事务原子性: INSERT + DELETE 在同一事务，无需中间状态
- 代码更简单: 移除 `archived` 字段和 VERIFY 步骤
- 更可靠: 事务失败自动回滚，无数据不一致风险
- 性能相当: ATTACH 开销很小，SQLite 原生支持

### 磁盘空间校验

**决策**: MVP 阶段不主动校验磁盘空间

**理由**:
- SQLite 磁盘不足时会自动报错并回滚事务
- 预估"足够"空间困难，可能误判
- 通过监控磁盘使用率提前预警更实用
- 错误信息记录到 ArchiveExecutionLog 便于排查

**后续优化**:
- 可在监控指标中加入归档库大小趋势
- 磁盘使用率超过阈值（如 80%）时发送告警

### 磁盘空间不足处理

**决策**: 通过自动清理预防，超期归档自动删除

**考虑的方案**:
1. 报错 + 人工清理 (原方案)
2. 自动删除最旧归档数据 ✓ (当前方案)

**选择理由**:
- 按季度分库后，清理粒度更细，自动删除风险可控
- 配置 `ARCHIVE_RETENTION_QUARTERS` 明确保留期限
- 仍可设为 0 禁用自动清理，满足特殊合规需求

**运维建议**:
- 默认保留 6 季度 (1.5 年)，可根据需要调整
- 设为 0 可禁用自动清理
- 设置磁盘使用率监控告警（建议 80%）



## 7. MVP 范围

### 包含功能
✅ ModelCall 表自动归档
✅ ModelCallStats 表自动归档
✅ Usage 表自动归档
✅ 按季度创建归档库
✅ 定时任务每天凌晨执行
✅ 串行执行保证安全
✅ 批量事务处理(500条/批)
✅ ATTACH 跨库事务保证原子性
✅ 自动清理超期归档库
✅ 基础日志记录
✅ 环境变量配置(保留期限)

### 不包含功能
❌ UI 配置界面
❌ 手动触发归档按钮
❌ 归档数据在线查询界面
❌ 归档数据恢复功能
❌ 详细监控指标(Prometheus/Grafana)
❌ 归档进度显示
❌ 邮件/Webhook 报警



## 8. 风险与缓解

### 风险1: 数据丢失
**描述**: 归档过程中可能因异常导致数据既没在主表也没在归档表

**缓解措施**:
- 使用数据库事务,确保原子性
- 先插入归档表,成功后再删除主表
- 事务失败时自动回滚
- 重试机制处理临时错误
- 详细日志记录每个批次操作

**残余风险**: 极端情况(如磁盘故障)可能仍会丢失数据,建议定期备份数据库

### 风险2: 归档库查询复杂
**描述**: 数据分散在多个季度的独立数据库文件中,查询历史数据需要 ATTACH 多库

**缓解措施**:
- MVP 阶段只支持手动查询
- 后续可提供统一查询接口
- 文档中提供 ATTACH DATABASE 查询示例

**残余风险**: 需要开发者理解分库结构,非技术人员无法查询

### 风险3: 性能影响
**描述**: 归档任务可能占用数据库资源,影响正常业务

**缓解措施**:
- 默认在 02:00:00 执行,通常为业务低峰期（可通过 ARCHIVE_MODEL_DATA_CRON_TIME 调整）
- 批量处理,每批500条,避免长时间锁表
- 批间延迟200ms,减少资源争用
- SQLite 数据量不大(万级),影响可控

**残余风险**: 如果默认 02:00:00 仍有高峰流量,可能需要调整执行时间

### 风险4: 归档库文件管理
**描述**: 每季度产生一个独立的归档库文件,长期积累后文件数量增多

**缓解措施**:
- 主库数据减少,增长速度变慢
- 按季度分库便于直接删除整季度数据（删除文件即可）
- 可对旧归档库执行 VACUUM 压缩

**残余风险**: 需要定期清理过期归档库,建议制定归档数据保留策略


## 9. 开放问题

### 问题1: 是否需要在归档前通知用户?
**现状**: MVP 不通知用户
**待决**: 后续是否需要在归档前X天发送通知?

### 问题2: 归档表的数据如何定期清理?
**现状**: 归档表永久保留
**待决**: 是否需要定期删除N年前的归档表?还是依赖手动清理?

### 问题3: 是否需要归档执行历史表?
**现状**: 已实现 ArchiveExecutionLogs（结构化历史记录）
**待决**: 是否需要额外的聚合视图或更丰富的历史字段?

### 问题4: 归档数据是否需要压缩?
**现状**: 不压缩,保持原始结构
**待决**: 数据量进一步增长时是否需要压缩存储(如导出为 Parquet)?

## 10. 实施计划

### Phase 1: 基础设施 (1-2天)
- [ ] 添加环境变量定义
- [ ] 创建 DataArchiveService 类
- [ ] 实现动态建表逻辑
- [ ] 编写单元测试

### Phase 2: 核心归档逻辑 (2-3天)
- [ ] 实现批量迁移逻辑
- [ ] 实现事务处理
- [ ] 实现 ModelCall 归档
- [ ] 实现 ModelCallStats 归档
- [ ] 编写集成测试

### Phase 3: 定时任务集成 (0.5天)
- [ ] 注册 Cron 任务
- [ ] 实现任务执行器(串行执行)
- [ ] 测试定时触发

### Phase 4: 日志与监控 (1天)
- [ ] 添加详细日志记录
- [ ] 测试日志输出格式
- [ ] 文档化日志字段

### Phase 5: 测试与上线 (2-3天)
- [ ] 在测试环境验证
- [ ] 模拟失败场景测试
- [ ] 性能测试(万级数据)
- [ ] 编写运维文档
- [ ] 生产环境部署

**总预估时间**: 6-8天 (简化后减少约1-2天)

## 11. 监控指标

虽然 MVP 不包含监控系统集成,但日志中会记录以下关键指标:

| 指标 | 含义 | 用途 |
|------|------|------|
| archivedCount | 归档的记录数 | 了解归档数据量 |
| dataRangeStart | 归档数据起始时间戳 | 了解归档时间范围 |
| dataRangeEnd | 归档数据结束时间戳 | 了解归档时间范围 |
| targetArchiveDb | 目标归档库文件名 | 追踪数据落库位置 |
| duration | 归档耗时(秒) | 监控性能 |
| success | 是否成功 | 了解可靠性 |
| errorMessage | 错误信息 | 故障排查 |
| batchNumber | 批次编号 | 了解处理进度 |


## 12. 设计简化说明

本 Intent 经过 critique 审查后进行了以下简化:

### 简化1: 删除重试机制
- **原设计**: 完整的重试逻辑(3次重试 + 递增延迟)
- **简化为**: 失败记录日志,依赖明天的定时任务自动重试
- **理由**: 归档是每天运行的任务,失败后24小时会自动重试,无需即时重试

### 简化2: 删除抽象层
- **原设计**: 通用的 `ArchiveConfig` 接口和 `archiveTable()` 方法
- **简化为**: 保留一个通用 `archiveTable()` + `TABLE_CONFIGS`
- **理由**: 仅 3 个表配置，避免过度抽象但保留可维护性

### 简化3: 删除 archivedAt 字段
- **原设计**: 每条归档记录添加 `archivedAt: Date` 字段
- **简化为**: 归档表结构与主表完全相同
- **理由**: 日志已记录归档时间,无需在每条记录中冗余存储

### 简化4: 硬编码批量大小
- **原设计**: `ARCHIVE_BATCH_SIZE` 环境变量
- **简化为**: 代码中 `const BATCH_SIZE = 500`
- **理由**: 没有具体场景需要调整,真需要时再改成可配置

### 简化5: 改为串行执行
- **原设计**: `Promise.all` 并行归档两个表
- **简化为**: 串行执行 `await archiveModelCalls(); await archiveModelCallStats();`
- **理由**: SQLite 单线程数据库,串行更安全,凌晨执行不需要争时间

### 简化效果
- 环境变量保持少量（保留期限 3 个 + 归档 Cron + 保留季度）
- 核心逻辑集中在 `DataArchiveService` 与 `ArchiveDatabase`
- 归档流程保持串行与批处理，降低并发复杂度


## 13. Finalized Implementation Details

> [!SYNCED] Last synced: 2026-02-02 from commit bb506eded61479071b229d5c32cd7b6725152495

### 归档执行与范围切分
- 先查询 cutoff 之前的 `MIN/MAX`，按 UTC 季度边界拆分范围，可能跨多个归档库
- `Usage.createdAt` 使用 UTC 字符串 `YYYY-MM-DD HH:mm:ss.SSS Z` 比较

### 事务与批处理
- 每个季度执行 `ATTACH` + `BEGIN IMMEDIATE` + `INSERT/DELETE` + `COMMIT/ROLLBACK`，失败则回滚
- 批大小 `BATCH_SIZE=500`（规避 SQLite 999 参数上限），批间延迟 `BATCH_DELAY_MS=200`

### 归档库管理
- 归档目录：`{Config.dataDir}/archives`，文件名 `archive_YYYY_QN.db`（UTC 季度）
- `ensureArchiveDbAndTable` 使用独立连接建表/补列，复制索引并跳过动态默认值
- `cleanupOldArchives` 按 `ARCHIVE_RETENTION_QUARTERS` 保留最新 N 个季度

### 任务调度与锁
- Cron：`ARCHIVE_MODEL_DATA_CRON_TIME`，默认 `0 0 2 * * *`（6 段 Cron）
- 锁文件：`{Config.dataDir}/archive.lock`，`proper-lockfile`，`stale=1h`，`retries=0`，`ENOENT` 时先创建锁文件再重试

### 归档执行日志
- 表：`ArchiveExecutionLogs`（`ArchiveExecutionLog` 模型）
- 字段：`tableName/status/archivedCount/dataRangeStart/dataRangeEnd/targetArchiveDb/duration/errorMessage/createdAt/updatedAt`
- 索引：`idx_archive_execution_logs_table_status_time`

### 实现位置
- `blocklets/core/api/src/libs/data-archive.ts`
- `blocklets/core/api/src/libs/archive-database.ts`
- `blocklets/core/api/src/crons/archive-task.ts`
- `blocklets/core/api/src/crons/index.ts`
- `blocklets/core/api/src/store/models/archive-execution-log.ts`
- `blocklets/core/api/src/store/migrations/20260130000000-add-archived-field-and-execution-log.ts`

## 14. 参考文档

- [Sequelize 事务文档](https://sequelize.org/docs/v6/other-topics/transactions/)
- [SQLite ALTER TABLE 限制](https://www.sqlite.org/lang_altertable.html)
- [Node Cron 表达式](https://www.npmjs.com/package/node-cron)
- [现有 Cron 实现](blocklets/core/api/src/crons/index.ts)
- [ModelCall 模型](blocklets/core/api/src/store/models/model-call.ts)
- [ModelCallStat 模型](blocklets/core/api/src/store/models/model-call-stat.ts)
