# Background Operations

AIGNE Hub relies on a set of automated background tasks, or cron jobs, to ensure system health, data accuracy, and operational efficiency. These tasks run on a predefined schedule to perform essential maintenance and data processing without manual intervention.

## Key Scheduled Tasks

The system utilizes a cron scheduler to manage the following core background operations:

### 1. Usage Statistics Aggregation (`model.call.stats`)

This is one of the most critical background jobs, responsible for processing raw model call data into aggregated hourly statistics. This pre-calculated data is essential for powering the monitoring dashboards and ensuring fast API responses for usage queries.

**How it works:**

1.  **Identify Gaps**: The job first checks the timestamp of the most recently aggregated statistics. It then identifies all the hourly intervals between that last point and the most recent hour that need processing.
2.  **Find Active Users**: To optimize the process, it fetches a list of all users who have made at least one API call in the last 7 days.
3.  **Process in Batches**: For each identified hour and each active user, the system calculates and stores the total token usage, credit consumption, and other relevant metrics.
4.  **Catch-Up Mechanism**: If the system has been offline or the job has failed to run, it will automatically process all missed hours upon the next successful run, ensuring data integrity.

This job ensures that usage data is consistently up-to-date, providing operators with near real-time insights into consumption patterns.

### 2. Stale Call Cleanup (`cleanup.stale.model.calls`)

To maintain system stability, this job identifies and resolves API calls that have become stuck in a `processing` state. This can happen if a client disconnects unexpectedly or if an unhandled error occurs during a request lifecycle.

**How it works:**

1.  **Define Stale**: A call is considered stale if it has been in the `processing` state for longer than a predefined timeout period (e.g., 30 minutes).
2.  **Query and Update**: The job queries the database for all records matching these criteria.
3.  **Mark as Failed**: Each stale call is updated to a `failed` status, with an error reason indicating that it timed out. This action frees up resources and ensures that these calls are not left in an indeterminate state.

This cleanup routine is vital for preventing orphaned records and maintaining an accurate history of API call statuses.

### 3. Model Status Check (`check.model.status`)

This scheduled task is designed to periodically check the health and availability of the configured AI models. However, this feature is currently reserved for future implementation and is not active in the current version.

## Configuration

The schedule for each cron job is defined using standard cron syntax and can be configured via environment variables. This allows operators to adjust the frequency of these tasks based on their specific operational needs and system load.

| Environment Variable                  | Default Schedule | Description                                            |
| ------------------------------------- | ---------------- | ------------------------------------------------------ |
| `MODEL_CALL_STATS_CRON_TIME`          | `0 * * * *`      | Runs at the beginning of every hour.                   |
| `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` | `*/5 * * * *`    | Runs every 5 minutes.                                  |
| `CHECK_MODEL_STATUS_CRON_TIME`        | `0 */6 * * *`    | Runs every 6 hours (currently inactive).               |

## Cluster-Aware Execution

In a multi-instance or clustered deployment, AIGNE Hub ensures that these background tasks do not run concurrently on multiple nodes, which could lead to data corruption or race conditions. The system includes a leadership election mechanism (`shouldExecuteTask()`) that designates a single instance as the primary or master instance. Only this designated instance is permitted to execute the scheduled jobs, guaranteeing that each task runs exactly once per scheduled interval.

## Summary

These automated background operations are fundamental to the reliability and accuracy of AIGNE Hub. They handle routine data aggregation and system cleanup, allowing the platform to operate smoothly and provide precise, up-to-date information for monitoring and billing purposes. Understanding these processes is key for operators responsible for maintaining the system.