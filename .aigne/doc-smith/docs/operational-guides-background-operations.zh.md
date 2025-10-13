# 定时任务

系统利用一个定时任务管理器（`@abtnode/cron`）来自动化必要的后台任务。这些任务处理数据聚合、系统维护和状态监控。该定时任务系统设计为集群感知，确保在多节点环境中任务仅由单个实例执行，以防止冗余操作。

## 定时任务初始化

定时任务在 `index.ts` 文件中进行初始化。系统定义了一系列任务，每个任务都有特定的名称、调度安排和执行函数。系统内置了错误处理机制，用于记录任务执行过程中的任何失败。

在分布式环境中，一个关键的设计考量是确保定时任务在同一时间只在一个节点上运行。这由 `shouldExecuteTask` 函数管理，该函数确定当前实例是否是执行给定任务的指定“主”节点。这可以防止集群中的竞争条件和冗余处理。

```typescript
// sourceId: blocklets/core/api/src/crons/index.ts
function init() {
  Cron.init({
    context: {},
    jobs: [
      // 任务定义...
    ],
    onError: (error: Error, name: string) => {
      logger.error('run job failed', { name, error });
    },
  });
}
```

---

## 核心任务

### 1. 模型调用统计 (`model.call.stats`)

此任务负责将模型调用数据聚合成每小时的统计记录。这些统计数据对于监控使用情况、分析趋势以及潜在的计费目的至关重要。

**调度安排：**
执行时间表由 `MODEL_CALL_STATS_CRON_TIME` 环境变量决定。

**机制：**
1.  **识别处理间隙：** 该任务首先确定哪些小时需要进行统计处理。它会找到上一个已处理小时统计数据的时间戳，并创建一个包含此后所有小时直至最近一个完整小时的列表。这种“预热”机制确保即使定时任务在一段时间内未激活，也不会丢失任何数据。如果不存在先前的统计数据，则从上一个小时开始。
2.  **获取活跃用户：** 它会检索在过去 7 天内至少进行过一次模型调用的所有独立用户列表。这使得处理能够集中在相关的活跃用户上。
3.  **聚合数据：** 对于每个确定的小时和每个活跃用户，该任务会调用 `ModelCallStat.getHourlyStats` 来计算并存储聚合数据。这包括令牌计数、图像生成和消耗的积分等指标。

该过程被设计为幂等且具有弹性，能够回填数据并确保提供一致、最新的每小时分析数据。

```typescript
// sourceId: blocklets/core/api/src/crons/model-call-stats.ts
export async function createModelCallStats(hourTimestamp?: number) {
  const hours = hourTimestamp ? [hourTimestamp] : await getHoursToWarmup();

  // 获取所有活跃用户（过去 7 天内有过调用的用户）
  const activeUsers = (await sequelize.query(
    `
    SELECT DISTINCT "userDid" 
    FROM "ModelCalls" 
    WHERE "callTime" >= :sevenDaysAgo
  `,
    {
      type: 'SELECT',
      replacements: {
        sevenDaysAgo: getCurrentUnixTimestamp() - 7 * 24 * 60 * 60,
      },
    }
  )) as any[];

  await Promise.all(
    hours.map(async (hourTimestamp) => {
      await Promise.all(
        activeUsers.map(async (user) => {
          try {
            await ModelCallStat.getHourlyStats(user.userDid, hourTimestamp);
            // ... 日志记录
          } catch (error) {
            // ... 错误日志记录
          }
        })
      );
    })
  );
}
```

### 2. 清理过期的模型调用 (`cleanup.stale.model.calls`)

这是一个关键的维护任务，通过处理孤立或卡住的模型调用记录来确保系统保持稳健。如果服务器实例崩溃或在调用被标记为“成功”或“失败”之前发生未处理的错误，模型调用可能会卡在“处理中”状态。

**调度安排：**
执行时间表通过 `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` 环境变量进行配置。

**机制：**
1.  **识别过期调用：** 该任务查询数据库中 `status` 为 `processing` 且 `callTime` 早于指定超时时间（默认为 30 分钟）的 `ModelCall` 记录。
2.  **标记为失败：** 每个过期调用都会被更新为 `failed` 状态。`errorReason` 被设置为指示超时，`duration` 则根据其开始时间到清理时间计算得出。

这种自动清理可以防止无效的“处理中”记录累积，从而确保系统指标的完整性，并防止在分析或面向用户的状态方面出现下游问题。

```typescript
// sourceId: blocklets/core/api/src/middlewares/model-call-tracker.ts
export async function cleanupStaleProcessingCalls(timeoutMinutes: number = 30): Promise<number> {
  try {
    const cutoffTime = getCurrentUnixTimestamp() - timeoutMinutes * 60;

    const staleCalls = await ModelCall.findAll({
      where: {
        status: 'processing',
        callTime: { [Op.lt]: cutoffTime },
      },
    });

    // ... 更新逻辑，将调用标记为失败
    
    return results.length;
  } catch (error) {
    logger.error('Failed to cleanup stale processing calls', { error });
    return 0;
  }
}
```

### 3. 检查模型状态 (`check.model.status`)

此任务旨在定期检查所有可用 AI 模型的状态。

**调度安排：**
执行时间表由 `CHECK_MODEL_STATUS_CRON_TIME` 环境变量定义。

**当前状态：**
在当前实现中，与此任务相关联的函数已被注释掉。因此，该定时任务**不执行任何操作**。它的存在是为未来功能保留的占位符。