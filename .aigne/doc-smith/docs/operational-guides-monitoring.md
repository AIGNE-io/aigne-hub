# Monitoring Usage and Costs

AIGNE Hub provides a comprehensive set of tools for monitoring AI model usage and associated costs. Operators can track token consumption, credit expenditure, and API call volumes through both user-facing and administrative APIs. This allows for detailed analysis, cost management, and operational oversight across all users and applications interacting with the gateway.

## Usage Statistics

Aggregated usage data provides a high-level overview of system activity. These statistics are cached on an hourly basis to ensure fast query performance while providing near real-time insights. Both individual users and administrators can access these metrics, with administrators having a system-wide view.

### User-Facing Statistics

Authenticated users can retrieve detailed statistics about their own activity. This is useful for personal monitoring and understanding individual consumption patterns.

**Endpoint:** `GET /api/user/usage-stats`

This endpoint returns a comprehensive summary of a user's activity within a specified time range.

**Query Parameters**

<x-field-group>
  <x-field data-name="startTime" data-type="string" data-required="true" data-desc="The start of the time range as a Unix timestamp."></x-field>
  <x-field data-name="endTime" data-type="string" data-required="true" data-desc="The end of the time range as a Unix timestamp."></x-field>
</x-field-group>

**Example Response**

```json Response for GET /api/user/usage-stats
{
  "summary": {
    "byType": {
      "completion": {
        "totalUsage": 150000,
        "totalCredits": 75,
        "totalCalls": 120,
        "successCalls": 118
      },
      "embedding": {
        "totalUsage": 300000,
        "totalCredits": 30,
        "totalCalls": 50,
        "successCalls": 50
      }
    },
    "totalCalls": 170,
    "totalCredits": 105,
    "modelCount": 5,
    "totalUsage": 450000
  },
  "dailyStats": [
    {
      "date": "2023-10-26",
      "totalCredits": 50,
      "totalCalls": 80
    },
    {
      "date": "2023-10-27",
      "totalCredits": 55,
      "totalCalls": 90
    }
  ],
  "modelStats": [
    {
      "model": "gpt-4",
      "totalCalls": 100,
      "totalCredits": 90
    },
    {
      "model": "text-embedding-ada-002",
      "totalCalls": 50,
      "totalCredits": 15
    }
  ],
  "trendComparison": {
    "currentPeriod": {
      "totalCredits": 105,
      "totalCalls": 170
    },
    "previousPeriod": {
      "totalCredits": 95,
      "totalCalls": 160
    },
    "creditsChangePercentage": 10.53,
    "callsChangePercentage": 6.25
  }
}
```

The response includes a summary of usage by type, total calls, total credits, a breakdown of daily statistics, top models used, and a trend comparison against the previous period.

### Admin-Level Statistics

Administrators can access aggregated statistics for the entire system, providing a complete picture of platform-wide usage.

**Endpoint:** `GET /api/user/admin/user-stats`

This endpoint requires administrator privileges and returns the same data structure as the user-facing endpoint, but the metrics are aggregated across all users.

**Query Parameters**

<x-field-group>
  <x-field data-name="startTime" data-type="string" data-required="true" data-desc="The start of the time range as a Unix timestamp."></x-field>
  <x-field data-name="endTime" data-type="string" data-required="true" data-desc="The end of the time range as a Unix timestamp."></x-field>
</x-field-group>

## Call History

For more granular analysis, debugging, or auditing, AIGNE Hub provides access to the complete history of individual model API calls.

### Viewing Call History

This endpoint retrieves a paginated list of all model calls, with powerful filtering capabilities. Administrators can view calls from all users, while regular users are restricted to their own history.

**Endpoint:** `GET /api/user/model-calls`

**Query Parameters**

<x-field-group>
  <x-field data-name="page" data-type="number" data-default="1" data-desc="Page number for pagination."></x-field>
  <x-field data-name="pageSize" data-type="number" data-default="50" data-desc="Number of items per page (max 100)."></x-field>
  <x-field data-name="startTime" data-type="string" data-desc="Optional. Filter calls after this Unix timestamp."></x-field>
  <x-field data-name="endTime" data-type="string" data-desc="Optional. Filter calls before this Unix timestamp."></x-field>
  <x-field data-name="search" data-type="string" data-desc="Optional. Free-text search across various call fields."></x-field>
  <x-field data-name="status" data-type="string" data-desc="Optional. Filter by call status. Can be 'success', 'failed', or 'all'."></x-field>
  <x-field data-name="model" data-type="string" data-desc="Optional. Filter by a specific model name."></x-field>
  <x-field data-name="providerId" data-type="string" data-desc="Optional. Filter by a specific provider ID."></x-field>
  <x-field data-name="appDid" data-type="string" data-desc="Optional. Filter by the DID of the consuming application."></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-default="false" data-desc="Optional. If true, retrieves calls for all users. Requires admin/owner role."></x-field>
</x-field-group>

### Exporting Call History

To facilitate offline analysis and reporting, the entire filtered call history can be exported as a CSV file.

**Endpoint:** `GET /api/user/model-calls/export`

This endpoint accepts the same query parameters as the `/model-calls` endpoint (excluding pagination) and returns a CSV file. The `allUsers=true` parameter is also available for administrators.

The exported CSV file contains the following columns:

| Column         | Description                                        |
|----------------|----------------------------------------------------|
| `Timestamp`    | The date and time the call was made (ISO 8601).    |
| `Request ID`   | A unique identifier for the API call.              |
| `User DID`     | The DID of the user who made the call.             |
| `User Name`    | The full name of the user.                         |
| `User Email`   | The email address of the user.                     |
| `Model`        | The AI model that was invoked.                     |
| `Provider`     | The display name of the AI provider.               |
| `Type`         | The type of call (e.g., 'completion', 'embedding').|
| `Status`       | The final status of the call ('success' or 'failed').|
| `Input Tokens` | The number of tokens in the input/prompt.          |
| `Output Tokens`| The number of tokens in the output/response.       |
| `Total Usage`  | The total tokens consumed by the call.             |
| `Credits`      | The number of credits charged for the call.        |
| `Duration(ms)` | The duration of the API call in milliseconds.      |
| `App DID`      | The DID of the application that initiated the call.|

## Data Recalculation (Admin)

Usage statistics are cached hourly in the `ModelCallStat` table to optimize performance. In rare cases of data inconsistency, administrators have the ability to manually trigger a recalculation of these cached statistics for a specific user over a given time period.

**Endpoint:** `POST /api/user/recalculate-stats`

This is a protected administrative endpoint used for maintenance and data integrity checks.

**Request Body**

<x-field-group>
  <x-field data-name="userDid" data-type="string" data-required="true" data-desc="The DID of the user whose stats need to be recalculated."></x-field>
  <x-field data-name="startTime" data-type="number" data-required="true" data-desc="The start of the time range as a Unix timestamp."></x-field>
  <x-field data-name="endTime" data-type="number" data-required="true" data-desc="The end of the time range as a Unix timestamp."></x-field>
  <x-field data-name="dryRun" data-type="boolean" data-default="false" data-desc="If true, the endpoint will preview the changes without actually deleting or rebuilding stats."></x-field>
</x-field-group>

Using this endpoint will delete the cached hourly and daily statistics within the specified range for the user and then re-compute them from the raw `ModelCalls` data.
