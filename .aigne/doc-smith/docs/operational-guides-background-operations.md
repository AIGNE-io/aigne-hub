# Cron Jobs

The system utilizes a scheduled job manager (`@abtnode/cron`) to automate essential background tasks. These jobs handle data aggregation, system maintenance, and status monitoring. The cron system is designed to be cluster-aware, ensuring that tasks are executed by a single instance in a multi-node environment to prevent redundant operations.

## Cron Job Initialization

Cron jobs are initialized in the `index.ts` file. The system defines a series of jobs, each with a specific name, schedule, and function. An error handling mechanism is in place to log any failures during job execution.

A key design consideration for a distributed environment is ensuring that scheduled tasks run on only one node at a time. This is managed by the `shouldExecuteTask` function, which determines if the current instance is the designated "master" for executing a given task. This prevents race conditions and redundant processing across the cluster.

```typescript
// sourceId: blocklets/core/api/src/crons/index.ts
function init() {
  Cron.init({
    context: {},
    jobs: [
      // Job definitions...
    ],
    onError: (error: Error, name: string) => {
      logger.error('run job failed', { name, error });
    },
  });
}
```

---

## Core Jobs

### 1. Model Call Statistics (`model.call.stats`)

This job is responsible for aggregating model call data into hourly statistical records. These statistics are crucial for monitoring usage, analyzing trends, and potentially for billing purposes.

**Scheduling:**
The execution schedule is determined by the `MODEL_CALL_STATS_CRON_TIME` environment variable.

**Mechanism:**
1.  **Identify Processing Gaps:** The job first determines which hours require statistical processing. It finds the timestamp of the last processed hourly stat and creates a list of all subsequent hours up to the most recently completed hour. This "warm-up" mechanism ensures that no data is missed, even if the cron job was inactive for a period. If no prior stats exist, it starts with the previous hour.
2.  **Fetch Active Users:** It retrieves a list of all unique users who have made at least one model call in the last 7 days. This focuses processing on relevant, active users.
3.  **Aggregate Data:** For each identified hour and each active user, the job invokes `ModelCallStat.getHourlyStats` to calculate and store the aggregated data. This includes metrics like token counts, image generations, and credits consumed.

The process is designed to be idempotent and resilient, capable of backfilling data and ensuring consistent, up-to-date hourly analytics.

```typescript
// sourceId: blocklets/core/api/src/crons/model-call-stats.ts
export async function createModelCallStats(hourTimestamp?: number) {
  const hours = hourTimestamp ? [hourTimestamp] : await getHoursToWarmup();

  // Get all active users (users with calls in the last 7 days)
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
            // ... logging
          } catch (error) {
            // ... error logging
          }
        })
      );
    })
  );
}
```

### 2. Stale Model Call Cleanup (`cleanup.stale.model.calls`)

This is a critical maintenance job that ensures the system remains robust by handling orphaned or stuck model call records. A model call might get stuck in a "processing" state if a server instance crashes or an unhandled error occurs before the call can be marked as "success" or "failed".

**Scheduling:**
The execution schedule is configured via the `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` environment variable.

**Mechanism:**
1.  **Identify Stale Calls:** The job queries the database for `ModelCall` records that have a `status` of `processing` and a `callTime` older than a specified timeout (defaulting to 30 minutes).
2.  **Mark as Failed:** Each stale call is updated to a `status` of `failed`. The `errorReason` is set to indicate a timeout, and the `duration` is calculated from its start time to the cleanup time.

This automated cleanup prevents an accumulation of invalid "processing" records, ensuring the integrity of system metrics and preventing downstream issues with analytics or user-facing state.

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

    // ... update logic to mark calls as failed
    
    return results.length;
  } catch (error) {
    logger.error('Failed to cleanup stale processing calls', { error });
    return 0;
  }
}
```

### 3. Check Model Status (`check.model.status`)

This job is intended to periodically check the status of all available AI models.

**Scheduling:**
The schedule is defined by the `CHECK_MODEL_STATUS_CRON_TIME` environment variable.

**Current Status:**
As of the current implementation, the function associated with this job is commented out. Therefore, this cron job **performs no action**. It exists as a placeholder for future functionality.