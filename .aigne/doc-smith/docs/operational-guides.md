# Usage and Analytics

This document provides a detailed overview of the system's architecture for tracking, calculating, and reporting AI model usage and analytics. It is intended for DevOps, SRE, and infrastructure teams responsible for deploying and maintaining the system.

## 1. Core Concepts

The analytics system is built around three primary concepts: tracking every individual API call, calculating its associated cost in credits, and aggregating this data for efficient reporting and analysis.

### 1.1 Model Call Tracking

Every request to an AI model is meticulously logged as a `ModelCall` record in the database. This serves as the single source of truth for all usage data.

#### The Lifecycle of a Model Call

A `ModelCall` record progresses through a distinct lifecycle, managed by the `createModelCallMiddleware`:

1.  **Processing**: When an API request is received, a `ModelCall` entry is immediately created with a `processing` status. A `modelCallContext` object is attached to the request object, allowing downstream services to update the record.
2.  **Completion**: Upon a successful response from the AI model provider, the context's `complete` method is called. This updates the record's status to `success` and populates final usage metrics like token counts, credits consumed, and total duration.
3.  **Failure**: If any error occurs during the process (API error, network issue, internal processing failure), the context's `fail` method is invoked. The status is set to `failed`, and the specific error message is logged. This ensures that even failed requests are tracked for monitoring and debugging.

This lifecycle ensures that no API call is lost, providing complete visibility into both successful and failed operations.

### 1.2 Credit Calculation and Usage Reporting

The system operates on a credit-based billing model where usage (e.g., tokens, image generations) is converted into a standardized `credits` unit.

#### Calculation

Credit calculation is performed by the `createUsageAndCompleteModelCall` function. When a model call is completed, this function:
1.  Retrieves the pricing rates for the specific model and call type (e.g., input/output rates for chat completion, per-image rate for image generation) from the system's configuration.
2.  Calculates the total credits consumed using `BigNumber.js` to ensure high precision and avoid floating-point inaccuracies.
3.  Stores the calculated credits in the corresponding `ModelCall` record.

#### Asynchronous Reporting

To optimize performance and resilience, credit usage is reported to the external billing system asynchronously.

1.  **Throttling**: The `reportUsageV2` function is throttled using `lodash/throttle`. Instead of sending a billing event for every single API call, the system aggregates usage for a user over a configurable time period (`usageReportThrottleTime`) and sends a single, consolidated event. This significantly reduces load on the billing service.
2.  **Atomic Updates**: To prevent data loss or double-counting in a distributed or multi-process environment, the system employs an atomic update strategy. Usage records are first marked as `counted`, then aggregated, and finally marked as `reported` after a successful API call to the billing service. If the reporting fails, the records remain in the `counted` state (or are reset to `null`) for a subsequent retry attempt.

### 1.3 Data Aggregation and Caching

To ensure fast dashboard loading and efficient analytics queries, the system uses a pre-aggregation caching layer.

-   **Raw Data**: The `ModelCall` table contains the granular, row-per-request data. While essential for detailed audits and logs, querying it for time-series analysis over large date ranges can be slow.
-   **Aggregated Data**: The `ModelCallStat` table stores pre-calculated hourly and daily summaries for each user. A cron job (`model.call.stats`) runs periodically to compute these summaries from the raw `ModelCall` data and store them. Dashboards and statistical endpoints primarily query this cached table, resulting in significantly faster response times.

## 2. System Architecture and Data Flow

The following steps outline the data flow from an incoming API request to the final aggregated analytic:

1.  **Request Interception**: An incoming API request (e.g., `/v1/chat/completions`) is intercepted by the `createModelCallMiddleware`.
2.  **Initial Record Creation**: The middleware creates a `ModelCall` record with `status: 'processing'`, capturing initial metadata like the model requested, user DID, and request timestamp.
3.  **Provider Interaction**: The request is forwarded to the appropriate AI provider. The middleware updates the `ModelCall` record with resolved credentials and the final model name.
4.  **Usage Calculation**: Upon receiving a response, the `createUsageAndCompleteModelCall` function is invoked. It calculates the token usage and corresponding credits.
5.  **Usage Record Creation**: A new `Usage` record is created to queue the transaction for the billing system.
6.  **Asynchronous Reporting**: The throttled `reportUsageV2` function is triggered. It aggregates all unreported `Usage` records for the user and sends a single `createMeterEvent` to the payment/billing service.
7.  **Finalize ModelCall**: The `ModelCall` record is updated to either `success` or `failed`, with final metrics like duration, token counts, and credits.
8.  **Scheduled Aggregation**: The `model.call.stats` cron job runs periodically, querying the `ModelCall` table to compute hourly and daily summaries, which are then saved to the `ModelCallStat` table.

## 3. Key Components

### 3.1 API Endpoints

The following endpoints, defined in `routes/user.ts`, provide access to usage and analytics data.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/user/model-calls` | `GET` | Retrieves a paginated list of raw `ModelCall` records. Supports filtering by date, status, model, and user. An `allUsers=true` parameter is available for administrators. |
| `/api/user/model-calls/export` | `GET` | Exports `ModelCall` data to a CSV file, applying the same filters as the list endpoint. |
| `/api/user/usage-stats` | `GET` | Fetches aggregated usage statistics for the current user's dashboard, primarily from the `ModelCallStat` cache. |
| `/api/user/admin/user-stats` | `GET` | (Admin-only) Fetches aggregated usage statistics for all users. |
| `/api/user/recalculate-stats` | `POST` | (Admin-only) Manually triggers a recalculation of a user's statistics for a given time range. This is a critical tool for data correction. |
| `/api/user/cleanup-daily-stats` | `POST` | (Admin-only) Deletes cached daily statistics for a user within a specified time range, forcing a fresh computation on the next query. |

### 3.2 Cron Jobs

Scheduled tasks are essential for maintaining the health and accuracy of the analytics system.

| Job Name | Schedule | Description |
| :--- | :--- | :--- |
| `cleanup.stale.model.calls` | `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` | Scans for `ModelCall` records stuck in the `processing` state for an extended period (e.g., >30 minutes) due to a server crash or unhandled error. It marks them as `failed` to ensure data integrity. |
| `model.call.stats` | `MODEL_CALL_STATS_CRON_TIME` | Populates the `ModelCallStat` table by aggregating data from the `ModelCall` table. This is the core of the analytics caching mechanism. |

## 4. Troubleshooting and Maintenance

### 4.1 Stale or "Stuck" Processing Calls

**Symptom**: `ModelCall` records remain in the `processing` state indefinitely.
**Cause**: This can happen if a server instance terminates unexpectedly after starting a model call but before it can be marked as complete or failed.
**Resolution**: The `cleanup.stale.model.calls` cron job automatically resolves this by marking timed-out calls as failed. The timeout is configurable (default: 30 minutes). Manual intervention is typically not required.

### 4.2 Incorrect Statistics on Dashboards

**Symptom**: User-facing or admin dashboards display incorrect totals for usage, calls, or credits.
**Cause**: This could be due to a past bug in the aggregation logic or a failed cron job run that left the `ModelCallStat` cache in an inconsistent state.
**Resolution**: Use the admin-only `/api/user/recalculate-stats` endpoint.

**Example Request to Recalculate Stats:**

```bash
curl -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "userDid": "z1...userDid",
    "startTime": 1672531200,
    "endTime": 1675209599,
    "dryRun": false
  }' \
  https://your-instance.com/api/user/recalculate-stats
```

-   `userDid`: The DID of the user whose stats need correction.
-   `startTime`/`endTime`: Unix timestamps defining the recalculation period.
-   `dryRun`: Set to `true` to preview the changes without writing to the database.

This process will delete the existing cached stats within the specified range and re-generate them from the raw `ModelCall` data, ensuring accuracy.