# 数据保留策略(Data Retention Policy)规格说明

## 1. 概述

### 产品定位
为 AI Kit 系统添加自动数据保留和归档功能,通过将旧数据迁移到归档表来控制主数据库的数据量增长。

### 核心概念
- 定期自动归档:每天在低峰时段自动执行归档任务
- 按年份分表:归档数据按年份创建不同的表,便于管理
- 事务保证:使用数据库事务确保数据一致性
- 失败重试:归档失败时自动重试并记录日志

### 优先级
高优先级。当前数据量已达到万级别并持续增长,需要尽快实施归档策略。

### 目标用户
最终用户(间接受益,系统性能提升)和系统管理员(直接管理归档配置)。

### 项目范围
MVP 范围包括:
- ModelCall 和 ModelCallStats 表的自动归档
- 按年份创建归档表
- 定时任务自动执行
- 失败重试机制
- 基础日志记录

不包括:
- UI 配置界面(后续补充)
- 归档数据恢复功能
- 归档数据在线查询界面

::: locked
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

// ModelCallStats 表 (现有)
- id: string (主键)
- userDid: string | null
- appDid: string | null
- timestamp: integer (Unix timestamp, 用于判断归档)
- timeType: enum('day', 'hour')
- stats: JSON
- createdAt: Date
- updatedAt: Date
```

#### 归档表结构
```typescript
// 按年份分表,每年一个归档表
// model_calls_archive_2024
// model_calls_archive_2025
// 结构与 ModelCalls 完全相同

// model_call_stats_archive_2024
// model_call_stats_archive_2025
// 结构与 ModelCallStats 完全相同
```

#### 数据库
- 使用 SQLite
- 归档表位于同一数据库中
- 使用 Sequelize ORM

### 配置层

#### 环境变量
```bash
# ModelCall 表保留期限(月)
RETENTION_MODEL_CALL_MONTHS=6

# ModelCallStats 表保留期限(月)
RETENTION_MODEL_CALL_STATS_MONTHS=6
```

### 执行层

#### Cron 任务
```typescript
// 添加到 blocklets/core/api/src/crons/index.ts
{
  name: 'archive.model.calls',
  time: '0 2 * * *', // 每天凌晨2点执行
  fn: async () => {
    if (shouldExecuteTask('archive.model.calls cron')) {
      await executeArchiveTask();
    }
  },
  options: { runOnInit: false }
}
```

#### 归档服务
```typescript
// blocklets/core/api/src/services/data-archive.ts

interface ArchiveResult {
  success: boolean;
  archivedCount: number;
  deletedCount: number;
  errorMessage?: string;
  duration: number;
}

class DataArchiveService {
  // 批量大小常量
  private static readonly BATCH_SIZE = 1000;

  // 归档 ModelCall 表
  async archiveModelCalls(): Promise<ArchiveResult>

  // 归档 ModelCallStats 表
  async archiveModelCallStats(): Promise<ArchiveResult>

  // 创建归档表(如果不存在)
  private async ensureArchiveTable(
    year: number,
    sourceTable: string,
    archiveTablePrefix: string
  ): Promise<string>

  // 计算截止时间戳
  private calculateCutoffTimestamp(retentionMonths: number): number
}
```
:::

::: reviewed
## 3. 详细行为

### 归档流程

#### 主流程
```
1. 定时任务触发(每天凌晨2点)
2. 串行执行 ModelCall 和 ModelCallStats 的归档
3. 记录执行结果到日志
4. 如果失败,记录错误日志,明天重新尝试
5. 所有任务完成后记录总体统计
```

#### 单表归档流程
```
1. 读取环境变量中的保留期限
2. 计算截止时间戳 = 当前时间 - 保留期限
3. 查询需要归档的数据并按年份分组
4. 对每个年份:
   a. 确保归档表存在(不存在则创建)
   b. 按批次迁移数据(每批1000条)
   c. 每批次使用事务:
      - 插入数据到归档表
      - 从主表删除数据
      - 提交事务
   d. 记录迁移统计
5. 返回归档结果(成功/失败、总数、耗时)
```

#### 批量迁移逻辑
```typescript
async function migrateBatch(
  sourceTable: string,
  targetTable: string,
  timestampField: string,
  cutoffTimestamp: number
): Promise<number> {
  const BATCH_SIZE = 1000;
  const transaction = await sequelize.transaction();

  try {
    // 1. 查询一批需要归档的记录
    const records = await sequelize.query(
      `SELECT * FROM "${sourceTable}"
       WHERE "${timestampField}" < :cutoff
       LIMIT :limit`,
      {
        replacements: { cutoff: cutoffTimestamp, limit: BATCH_SIZE },
        type: QueryTypes.SELECT,
        transaction
      }
    );

    if (records.length === 0) {
      await transaction.rollback();
      return 0;
    }

    // 2. 插入到归档表
    await sequelize.queryInterface.bulkInsert(
      targetTable,
      records,
      { transaction }
    );

    // 3. 从主表删除
    const ids = records.map(r => r.id);
    await sequelize.query(
      `DELETE FROM "${sourceTable}" WHERE id IN (:ids)`,
      {
        replacements: { ids },
        transaction
      }
    );

    // 4. 提交事务
    await transaction.commit();

    logger.info('Batch migration completed', {
      sourceTable,
      targetTable,
      count: records.length
    });

    return records.length;
  } catch (error) {
    await transaction.rollback();
    logger.error('Batch migration failed', { error, sourceTable, targetTable });
    throw error;
  }
}
```

### 归档表创建

#### 动态建表
```typescript
async function ensureArchiveTable(
  year: number,
  sourceTable: string,
  archiveTablePrefix: string
): Promise<string> {
  const archiveTableName = `${archiveTablePrefix}_${year}`;

  // 检查表是否存在
  const [tables] = await sequelize.query(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name=:tableName`,
    { replacements: { tableName: archiveTableName } }
  );

  if (tables.length > 0) {
    return archiveTableName; // 表已存在
  }

  // 创建归档表(复制主表结构)
  await sequelize.query(`
    CREATE TABLE "${archiveTableName}" AS
    SELECT * FROM "${sourceTable}" WHERE 0
  `);

  logger.info('Archive table created', {
    archiveTableName,
    year
  });

  return archiveTableName;
}
```

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
  targetTable: 'model_calls_archive_2024'
});

// 表归档完成
logger.info('Table archive completed', {
  tableName: 'ModelCalls',
  totalArchived: 5000,
  totalDeleted: 5000,
  duration: 12.5, // seconds
  success: true
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
    modelCalls: { archived: 5000, deleted: 5000 },
    modelCallStats: { archived: 2000, deleted: 2000 }
  },
  totalDuration: 25.3 // seconds
});
```
:::

::: reviewed
## 4. 用户体验

### 用户无感知
- 归档在低峰时段自动执行
- 不影响正常业务操作
- 归档数据仍可通过直接查询归档表访问(需要手动 SQL)

### 管理员配置
MVP 阶段通过环境变量配置:
```bash
# .env 文件
RETENTION_MODEL_CALL_MONTHS=6
RETENTION_MODEL_CALL_STATS_MONTHS=6
```

注意:
- 批量大小固定为 1000 条/批,在代码中硬编码
- 失败不重试,依赖明天的定时任务自动重新尝试

### 后续 UI (不在 MVP 范围)
未来可添加管理后台页面:
- 配置保留期限
- 手动触发归档
- 查看归档历史
- 查询归档数据
:::

::: reviewed
## 5. 技术实现指南

### 项目结构
```
blocklets/core/api/src/
├── services/
│   └── data-archive.ts          # 归档服务核心逻辑
├── crons/
│   ├── index.ts                 # 添加归档定时任务
│   └── archive-task.ts          # 归档任务执行器
├── libs/
│   └── env.ts                   # 添加环境变量定义
└── store/
    └── migrations/
        └── 20260128000000-create-archive-infrastructure.ts
```

### 核心代码示例

#### 环境变量定义
```typescript
// blocklets/core/api/src/libs/env.ts

export const RETENTION_MODEL_CALL_MONTHS = parseInt(
  process.env.RETENTION_MODEL_CALL_MONTHS || '6',
  10
);

export const RETENTION_MODEL_CALL_STATS_MONTHS = parseInt(
  process.env.RETENTION_MODEL_CALL_STATS_MONTHS || '6',
  10
);
```

#### 归档服务接口
```typescript
// blocklets/core/api/src/services/data-archive.ts

import { sequelize } from '../store/sequelize';
import { QueryTypes } from 'sequelize';
import logger from '../libs/logger';
import {
  RETENTION_MODEL_CALL_MONTHS,
  RETENTION_MODEL_CALL_STATS_MONTHS
} from '../libs/env';

export interface ArchiveResult {
  success: boolean;
  archivedCount: number;
  deletedCount: number;
  errorMessage?: string;
  duration: number;
}

export class DataArchiveService {
  private static readonly BATCH_SIZE = 1000;

  /**
   * 归档 ModelCalls 表
   */
  async archiveModelCalls(): Promise<ArchiveResult> {
    const startTime = Date.now();
    const cutoffTimestamp = this.calculateCutoffTimestamp(
      RETENTION_MODEL_CALL_MONTHS
    );

    try {
      let totalArchived = 0;

      // 查询需要归档的数据并按年份分组
      const yearsResult = await sequelize.query(
        `SELECT DISTINCT strftime('%Y', datetime(callTime, 'unixepoch')) as year
         FROM ModelCalls
         WHERE callTime < :cutoff`,
        {
          replacements: { cutoff: cutoffTimestamp },
          type: QueryTypes.SELECT
        }
      ) as Array<{ year: string }>;

      // 对每个年份执行归档
      for (const { year } of yearsResult) {
        const archiveTable = await this.ensureArchiveTable(
          parseInt(year),
          'ModelCalls',
          'model_calls_archive'
        );

        // 批量迁移该年份的数据
        let batchCount = 0;
        while (true) {
          const count = await this.migrateBatch(
            'ModelCalls',
            archiveTable,
            'callTime',
            cutoffTimestamp,
            parseInt(year)
          );

          if (count === 0) break;

          totalArchived += count;
          batchCount++;

          logger.info('Batch archived', {
            table: 'ModelCalls',
            year,
            batchNumber: batchCount,
            recordsArchived: count
          });
        }
      }

      return {
        success: true,
        archivedCount: totalArchived,
        deletedCount: totalArchived,
        duration: (Date.now() - startTime) / 1000
      };
    } catch (error) {
      logger.error('Failed to archive ModelCalls', { error });
      return {
        success: false,
        archivedCount: 0,
        deletedCount: 0,
        errorMessage: (error as Error).message,
        duration: (Date.now() - startTime) / 1000
      };
    }
  }

  /**
   * 归档 ModelCallStats 表
   */
  async archiveModelCallStats(): Promise<ArchiveResult> {
    const startTime = Date.now();
    const cutoffTimestamp = this.calculateCutoffTimestamp(
      RETENTION_MODEL_CALL_STATS_MONTHS
    );

    try {
      let totalArchived = 0;

      // 查询需要归档的数据并按年份分组
      const yearsResult = await sequelize.query(
        `SELECT DISTINCT strftime('%Y', datetime(timestamp, 'unixepoch')) as year
         FROM ModelCallStats
         WHERE timestamp < :cutoff`,
        {
          replacements: { cutoff: cutoffTimestamp },
          type: QueryTypes.SELECT
        }
      ) as Array<{ year: string }>;

      // 对每个年份执行归档
      for (const { year } of yearsResult) {
        const archiveTable = await this.ensureArchiveTable(
          parseInt(year),
          'ModelCallStats',
          'model_call_stats_archive'
        );

        // 批量迁移该年份的数据
        let batchCount = 0;
        while (true) {
          const count = await this.migrateBatch(
            'ModelCallStats',
            archiveTable,
            'timestamp',
            cutoffTimestamp,
            parseInt(year)
          );

          if (count === 0) break;

          totalArchived += count;
          batchCount++;

          logger.info('Batch archived', {
            table: 'ModelCallStats',
            year,
            batchNumber: batchCount,
            recordsArchived: count
          });
        }
      }

      return {
        success: true,
        archivedCount: totalArchived,
        deletedCount: totalArchived,
        duration: (Date.now() - startTime) / 1000
      };
    } catch (error) {
      logger.error('Failed to archive ModelCallStats', { error });
      return {
        success: false,
        archivedCount: 0,
        deletedCount: 0,
        errorMessage: (error as Error).message,
        duration: (Date.now() - startTime) / 1000
      };
    }
  }

  /**
   * 计算截止时间戳
   */
  private calculateCutoffTimestamp(retentionMonths: number): number {
    const now = Math.floor(Date.now() / 1000);
    const secondsPerMonth = 30 * 24 * 60 * 60; // 近似30天/月
    return now - (retentionMonths * secondsPerMonth);
  }

  /**
   * 批量迁移数据
   */
  private async migrateBatch(
    sourceTable: string,
    targetTable: string,
    timestampField: string,
    cutoffTimestamp: number,
    year: number
  ): Promise<number> {
    const transaction = await sequelize.transaction();

    try {
      // 查询一批该年份需要归档的记录
      const records = await sequelize.query(
        `SELECT * FROM "${sourceTable}"
         WHERE "${timestampField}" < :cutoff
           AND strftime('%Y', datetime("${timestampField}", 'unixepoch')) = :year
         LIMIT :limit`,
        {
          replacements: {
            cutoff: cutoffTimestamp,
            year: year.toString(),
            limit: DataArchiveService.BATCH_SIZE
          },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      if (records.length === 0) {
        await transaction.rollback();
        return 0;
      }

      // 插入到归档表
      await sequelize.queryInterface.bulkInsert(
        targetTable,
        records,
        { transaction }
      );

      // 从主表删除
      const ids = records.map((r: any) => r.id);
      await sequelize.query(
        `DELETE FROM "${sourceTable}" WHERE id IN (:ids)`,
        {
          replacements: { ids },
          transaction
        }
      );

      await transaction.commit();
      return records.length;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * 确保归档表存在
   */
  private async ensureArchiveTable(
    year: number,
    sourceTable: string,
    archiveTablePrefix: string
  ): Promise<string> {
    const archiveTableName = `${archiveTablePrefix}_${year}`;

    // 检查表是否存在
    const [tables] = await sequelize.query(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name=:tableName`,
      { replacements: { tableName: archiveTableName } }
    );

    if (tables.length > 0) {
      return archiveTableName;
    }

    // 创建归档表(复制主表结构)
    await sequelize.query(`
      CREATE TABLE "${archiveTableName}" AS
      SELECT * FROM "${sourceTable}" WHERE 0
    `);

    logger.info('Archive table created', { archiveTableName, year });

    return archiveTableName;
  }
}

export const dataArchiveService = new DataArchiveService();
```

#### Cron 任务注册
```typescript
// blocklets/core/api/src/crons/index.ts

import { executeArchiveTask } from './archive-task';

// 在 jobs 数组中添加:
{
  name: 'archive.model.data',
  time: '0 2 * * *', // 每天凌晨2点
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

import logger from '../libs/logger';
import { dataArchiveService } from '../services/data-archive';

export async function executeArchiveTask(): Promise<void> {
  const startTime = Date.now();

  logger.info('Archive task started');

  // 串行执行两个表的归档(SQLite 单线程,串行更安全)
  const modelCallsResult = await dataArchiveService.archiveModelCalls();
  const modelCallStatsResult = await dataArchiveService.archiveModelCallStats();

  const totalDuration = (Date.now() - startTime) / 1000;

  logger.info('Archive task completed', {
    totalDuration,
    results: {
      modelCalls: {
        success: modelCallsResult.success,
        archived: modelCallsResult.archivedCount,
        duration: modelCallsResult.duration
      },
      modelCallStats: {
        success: modelCallStatsResult.success,
        archived: modelCallStatsResult.archivedCount,
        duration: modelCallStatsResult.duration
      }
    }
  });
}
```

### 查询归档数据

#### 手动查询示例
```sql
-- 查询 2024 年的归档数据
SELECT * FROM model_calls_archive_2024
WHERE userDid = 'xxx'
ORDER BY callTime DESC
LIMIT 100;

-- 统计归档数据量
SELECT
  COUNT(*) as count,
  MIN(callTime) as earliest,
  MAX(callTime) as latest
FROM model_calls_archive_2024;

-- 联合查询当前和归档数据
SELECT * FROM ModelCalls
WHERE userDid = 'xxx'
UNION ALL
SELECT * FROM model_calls_archive_2024
WHERE userDid = 'xxx'
UNION ALL
SELECT * FROM model_calls_archive_2025
WHERE userDid = 'xxx'
ORDER BY callTime DESC;
```
:::

::: locked
## 6. 决策总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 存储位置 | 同一数据库的归档表 | SQLite 不支持跨数据库查询,同库更简单 |
| 分表策略 | 按年份分表 | 数据量级为万级,按年分表足够;便于后续删除整年数据 |
| 归档时机 | 定时任务自动执行 | 无需人工干预,在低峰期自动运行 |
| 执行方式 | 串行执行 | SQLite 单线程数据库,串行更安全可靠 |
| 事务策略 | 批量事务(1000条/批) | 平衡性能和数据安全,避免长事务锁表 |
| 删除时机 | 归档成功后立即删除 | 减少存储压力,事务保证不会丢失数据 |
| 配置方式 | 环境变量 | MVP 快速实现,无需 UI;后续可扩展 |
| 保留期限 | ModelCall: 6个月<br>ModelCallStats: 6个月 | 统一保留6个月,便于管理和理解 |
| 失败处理 | 记录日志,明天重试 | 定时任务每天运行,无需即时重试 |
| 查询方式 | 手动 SQL 查询 | MVP 不提供 UI,降低复杂度 |
| 监控方式 | 日志记录 | 记录关键指标,后续可接入监控系统 |
| 归档表结构 | 与主表完全相同 | 不添加额外字段,保持简单 |
:::

::: reviewed
## 7. MVP 范围

### 包含功能
✅ ModelCall 表自动归档
✅ ModelCallStats 表自动归档
✅ 按年份创建归档表
✅ 定时任务每天凌晨执行
✅ 串行执行保证安全
✅ 批量事务处理(1000条/批)
✅ 基础日志记录
✅ 环境变量配置(保留期限)

### 不包含功能
❌ UI 配置界面
❌ 手动触发归档按钮
❌ 归档历史记录表
❌ 归档数据在线查询界面
❌ 归档数据恢复功能
❌ 详细监控指标(Prometheus/Grafana)
❌ 归档进度显示
❌ 邮件/Webhook 报警
:::

::: reviewed
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

### 风险2: 归档表查询复杂
**描述**: 数据分散在多个年份的表中,查询历史数据需要 UNION 多表

**缓解措施**:
- MVP 阶段只支持手动查询
- 后续可提供统一查询接口或视图
- 文档中提供查询示例

**残余风险**: 需要开发者理解表结构,非技术人员无法查询

### 风险3: 性能影响
**描述**: 归档任务可能占用数据库资源,影响正常业务

**缓解措施**:
- 在凌晨2点执行,通常为业务低峰期
- 批量处理,每批1000条,避免长时间锁表
- SQLite 数据量不大(万级),影响可控

**残余风险**: 如果凌晨2点仍有高峰流量,可能需要调整执行时间

### 风险4: SQLite 文件增长
**描述**: 归档表仍在同一 SQLite 文件中,文件大小持续增长

**缓解措施**:
- 归档后主表数据减少,增长速度变慢
- 后续可考虑 VACUUM 操作回收空间
- 未来可考虑将归档表迁移到独立数据库或对象存储

**残余风险**: 长期来看仍需要更彻底的解决方案(如云存储)
:::

## 9. 开放问题

### 问题1: 是否需要在归档前通知用户?
**现状**: MVP 不通知用户
**待决**: 后续是否需要在归档前X天发送通知?

### 问题2: 归档表的数据如何定期清理?
**现状**: 归档表永久保留
**待决**: 是否需要定期删除N年前的归档表?还是依赖手动清理?

### 问题3: 是否需要归档执行历史表?
**现状**: 只有日志,无结构化历史记录
**待决**: 后续是否需要创建 ArchiveExecutionHistory 表?

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
| deletedCount | 删除的记录数 | 验证数据一致性 |
| duration | 归档耗时(秒) | 监控性能 |
| success | 是否成功 | 了解可靠性 |
| errorMessage | 错误信息 | 故障排查 |
| batchNumber | 批次编号 | 了解处理进度 |
| retryAttempt | 重试次数 | 了解稳定性 |

::: reviewed
## 12. 设计简化说明

本 Intent 经过 critique 审查后进行了以下简化:

### 简化1: 删除重试机制
- **原设计**: 完整的重试逻辑(3次重试 + 递增延迟)
- **简化为**: 失败记录日志,依赖明天的定时任务自动重试
- **理由**: 归档是每天运行的任务,失败后24小时会自动重试,无需即时重试

### 简化2: 删除抽象层
- **原设计**: 通用的 `ArchiveConfig` 接口和 `archiveTable()` 方法
- **简化为**: 直接在 `archiveModelCalls()` 和 `archiveModelCallStats()` 中实现
- **理由**: 只有2个调用方,不需要过早抽象

### 简化3: 删除 archivedAt 字段
- **原设计**: 每条归档记录添加 `archivedAt: Date` 字段
- **简化为**: 归档表结构与主表完全相同
- **理由**: 日志已记录归档时间,无需在每条记录中冗余存储

### 简化4: 硬编码批量大小
- **原设计**: `ARCHIVE_BATCH_SIZE` 环境变量
- **简化为**: 代码中 `const BATCH_SIZE = 1000`
- **理由**: 没有具体场景需要调整,真需要时再改成可配置

### 简化5: 改为串行执行
- **原设计**: `Promise.all` 并行归档两个表
- **简化为**: 串行执行 `await archiveModelCalls(); await archiveModelCallStats();`
- **理由**: SQLite 单线程数据库,串行更安全,凌晨执行不需要争时间

### 简化效果
- 环境变量: 4个 → 2个 (-50%)
- 核心方法: 6个 → 4个 (-33%)
- 预估代码行数: ~150行减少 (~20%)
- 预估实施时间: 7-10天 → 6-8天
:::

## 13. 参考文档

- [Sequelize 事务文档](https://sequelize.org/docs/v6/other-topics/transactions/)
- [SQLite ALTER TABLE 限制](https://www.sqlite.org/lang_altertable.html)
- [Node Cron 表达式](https://www.npmjs.com/package/node-cron)
- [现有 Cron 实现](blocklets/core/api/src/crons/index.ts)
- [ModelCall 模型](blocklets/core/api/src/store/models/model-call.ts)
- [ModelCallStat 模型](blocklets/core/api/src/store/models/model-call-stat.ts)
