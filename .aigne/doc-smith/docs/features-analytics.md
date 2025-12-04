# Usage & Cost Analytics

Understanding AI model consumption is crucial for managing costs, monitoring performance, and ensuring fair resource allocation. This document provides a detailed guide on how to query usage statistics, track costs, and interpret the data models AIGNE Hub uses for analytics and reporting.

## Overview

AIGNE Hub records every API interaction as a `ModelCall` entry. These records form the basis for all usage analytics. The system provides several API endpoints to query and aggregate this data, allowing you to monitor consumption for the entire system or on a per-user basis. This enables detailed tracking of token usage, credit consumption, and overall API call volume.

## Data Models

Understanding the underlying data structures is essential for effectively querying and interpreting analytics data. The following diagram illustrates how a `ModelCall` record is generated and used by the analytics endpoints.

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Usage & Cost Analytics](assets/diagram/analytics-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

### The `ModelCall` Object

Every request made to an AI provider through the hub is logged as a `ModelCall`. This object contains detailed information about the request, its execution, and the associated costs.

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="A unique identifier for the model call record."></x-field>
  <x-field data-name="providerId" data-type="string" data-required="true" data-desc="The identifier of the AI provider used for the call."></x-field>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The specific model that was called (e.g., 'gpt-4o-mini')."></x-field>
  <x-field data-name="credentialId" data-type="string" data-required="true" data-desc="The ID of the credential used for authentication with the provider."></x-field>
  <x-field data-name="type" data-type="string" data-required="true" data-desc="The type of the API call. Possible values include 'chatCompletion', 'embedding', 'imageGeneration', 'audioGeneration', 'video', or 'custom'."></x-field>
  <x-field data-name="totalUsage" data-type="number" data-required="true" data-desc="A normalized usage metric. For text models, this is typically the total number of tokens (input + output)."></x-field>
  <x-field data-name="usageMetrics" data-type="object" data-required="false" data-desc="A detailed breakdown of usage, such as input and output tokens.">
    <x-field data-name="inputTokens" data-type="number" data-desc="The number of tokens in the input prompt."></x-field>
    <x-field data-name="outputTokens" data-type="number" data-desc="The number of tokens in the generated response."></x-field>
  </x-field>
  <x-field data-name="credits" data-type="number" data-required="true" data-desc="The number of credits consumed by the call, based on the configured model rates."></x-field>
  <x-field data-name="status" data-type="string" data-required="true" data-desc="The final status of the call. Can be 'success' or 'failed'."></x-field>
  <x-field data-name="duration" data-type="number" data-required="false" data-desc="The duration of the API call in seconds."></x-field>
  <x-field data-name="errorReason" data-type="string" data-required="false" data-desc="If the call failed, this field contains the reason for the failure."></x-field>
  <x-field data-name="appDid" data-type="string" data-required="false" data-desc="The DID of the application that initiated the call."></x-field>
  <x-field data-name="userDid" data-type="string" data-required="true" data-desc="The DID of the user who made the call."></x-field>
  <x-field data-name="requestId" data-type="string" data-required="false" data-desc="An optional client-side request identifier for tracing."></x-field>
  <x-field data-name="callTime" data-type="number" data-required="true" data-desc="The Unix timestamp when the call was made."></x-field>
  <x-field data-name="createdAt" data-type="string" data-required="true" data-desc="The timestamp when the record was created in the database."></x-field>
</x-field-group>

## Querying Usage Data

You can retrieve analytics data through several REST API endpoints. These endpoints require authentication.

### Fetching Usage Statistics

To get a summarized and aggregated view of usage over a specific period, use the `GET /api/user/usage-stats` endpoint. For system-wide analytics, administrators can use `GET /api/user/admin/user-stats`.

**Request Parameters**

<x-field-group>
  <x-field data-name="startTime" data-type="string" data-required="true" data-desc="The start of the time range as a Unix timestamp."></x-field>
  <x-field data-name="endTime" data-type="string" data-required="true" data-desc="The end of the time range as a Unix timestamp."></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-required="false">
    <x-field-desc markdown>When using `/api/user/model-calls`, set to `true` to fetch data for all users. This is restricted to admin users.</x-field-desc>
  </x-field>
</x-field-group>

**Example Request**

```bash Requesting user stats icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/usage-stats?startTime=1672531200&endTime=1675228799' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

**Response Body**

The endpoint returns a comprehensive object containing a summary, daily breakdowns, model statistics, and trend comparisons.

<x-field-group>
  <x-field data-name="summary" data-type="object" data-desc="An object containing aggregated totals for the specified period.">
    <x-field data-name="totalCredits" data-type="number" data-desc="Total credits consumed."></x-field>
    <x-field data-name="totalCalls" data-type="number" data-desc="Total number of API calls."></x-field>
    <x-field data-name="modelCount" data-type="number" data-desc="Total number of unique models used."></x-field>
    <x-field data-name="byType" data-type="object" data-desc="An object with usage statistics broken down by call type (e.g., 'chatCompletion').">
      <x-field data-name="[callType]" data-type="object">
        <x-field data-name="totalUsage" data-type="number" data-desc="Total usage (e.g., tokens) for this type."></x-field>
        <x-field data-name="totalCredits" data-type="number" data-desc="Total credits consumed by this type."></x-field>
        <x-field data-name="totalCalls" data-type="number" data-desc="Total calls of this type."></x-field>
        <x-field data-name="successCalls" data-type="number" data-desc="Number of successful calls of this type."></x-field>
      </x-field>
    </x-field>
  </x-field>
  <x-field data-name="dailyStats" data-type="array" data-desc="An array of objects, each representing a day's usage statistics.">
    <x-field data-name="date" data-type="string" data-desc="The date in 'YYYY-MM-DD' format."></x-field>
    <x-field data-name="credits" data-type="number" data-desc="Total credits consumed on this day."></x-field>
    <x-field data-name="tokens" data-type="number" data-desc="Total tokens processed on this day."></x-field>
    <x-field data-name="requests" data-type="number" data-desc="Total API calls made on this day."></x-field>
  </x-field>
  <x-field data-name="modelStats" data-type="array" data-desc="An array listing the most frequently used models.">
    <x-field data-name="providerId" data-type="string" data-desc="The ID of the provider for the model."></x-field>
    <x-field data-name="model" data-type="string" data-desc="The name of the model."></x-field>
    <x-field data-name="totalCalls" data-type="number" data-desc="Total number of calls made to this model."></x-field>
  </x-field>
  <x-field data-name="trendComparison" data-type="object" data-desc="Comparison of usage between the current and previous period.">
    <x-field data-name="current" data-type="object" data-desc="Statistics for the current period."></x-field>
    <x-field data-name="previous" data-type="object" data-desc="Statistics for the equivalent previous period."></x-field>
    <x-field data-name="growth" data-type="object" data-desc="Growth rates between the two periods."></x-field>
  </x-field>
</x-field-group>

### Listing Model Calls

For a detailed, chronological log of individual API requests, use the `GET /api/user/model-calls` endpoint. This provides access to the raw `ModelCall` records with pagination and filtering.

**Request Parameters**

<x-field-group>
  <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="The page number for pagination."></x-field>
  <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="The number of items to return per page. Maximum is 100."></x-field>
  <x-field data-name="startTime" data-type="string" data-required="false" data-desc="The start of the time range as a Unix timestamp."></x-field>
  <x-field data-name="endTime" data-type="string" data-required="false" data-desc="The end of the time range as a Unix timestamp."></x-field>
  <x-field data-name="search" data-type="string" data-required="false" data-desc="A search term to filter results by model name, application DID, or user DID."></x-field>
  <x-field data-name="status" data-type="string" data-required="false" data-desc="Filter by call status. Can be 'success', 'failed', or 'all'."></x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="Filter by a specific model name."></x-field>
  <x-field data-name="providerId" data-type="string" data-required="false" data-desc="Filter by a specific provider ID."></x-field>
  <x-field data-name="appDid" data-type="string" data-required="false" data-desc="Filter by a specific application DID."></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="If true, returns model calls for all users (admin only)."></x-field>
</x-field-group>

**Example Request**

```bash Listing model calls icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/model-calls?page=1&pageSize=10&status=failed' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

**Response Body**

The response is a paginated list of `ModelCall` objects.

```json response.json
{
  "count": 1,
  "list": [
    {
      "id": "z8VwXGf6k3qN...",
      "providerId": "openai",
      "model": "gpt-4o-mini",
      "credentialId": "z3tXy..._default",
      "type": "chatCompletion",
      "totalUsage": 150,
      "usageMetrics": {
        "inputTokens": 100,
        "outputTokens": 50
      },
      "credits": 0.0002,
      "status": "failed",
      "duration": 2,
      "errorReason": "API key is invalid.",
      "appDid": "z2qa9sD2tFAP...",
      "userDid": "z1...",
      "requestId": null,
      "callTime": 1675228799,
      "createdAt": "2023-01-31T23:59:59.000Z",
      "updatedAt": "2023-01-31T23:59:59.000Z",
      "traceId": null,
      "provider": {
        "id": "openai",
        "name": "openai",
        "displayName": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "region": null,
        "enabled": true
      },
      "appInfo": {
        "appName": "My AI App",
        "appDid": "z2qa9sD2tFAP...",
        "appLogo": "...",
        "appUrl": "..."
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "..."
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 10
  }
}
```

### Exporting Model Calls

You can export the model call history to a CSV file for offline analysis or reporting using the `GET /api/user/model-calls/export` endpoint. This endpoint accepts the same filtering parameters as the listing endpoint.

**Example Request**

```bash Exporting model calls icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/model-calls/export?startTime=1672531200&endTime=1675228799' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>' \
-o model-calls-export.csv
```

The server will respond with a `text/csv` file containing the requested data.

## Summary

The analytics features in AIGNE Hub provide powerful tools for monitoring and understanding AI model usage. By leveraging the `ModelCall` data model and the associated API endpoints, you can build dashboards, generate reports, and gain critical insights into your operational costs and performance.

For details on how credits are configured and billed, refer to the [Service Provider Mode](./deployment-scenarios-service-provider.md) documentation.
