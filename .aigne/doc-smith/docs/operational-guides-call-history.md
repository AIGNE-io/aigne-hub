# User Service API

## Overview

The User Service API is a foundational component of the system, designed to manage all user-related operations. Its responsibilities include handling user authentication, tracking AI model usage, managing credit-based billing, and providing detailed analytics and reporting. This service is critical for both the end-user experience and for administrative oversight and system maintenance.

From an operational perspective, this service directly interfaces with the database to store and retrieve user data and model call logs. It exposes a set of RESTful endpoints that are consumed by front-end applications and other backend services.

## Architecture and Key Concepts

### Data Models

The service relies on several key data models to function. Understanding these is essential for troubleshooting and maintenance.

*   **`ModelCall`**: This is the central data model for tracking usage. Each record in the `ModelCall` table represents a single, discrete interaction with an AI model. It stores comprehensive details about the call, including:
    *   **Provider and Model**: Which AI provider and specific model was used (e.g., OpenAI, gpt-4).
    *   **Usage Metrics**: Token counts (input/output) or other relevant units of consumption.
    *   **Cost**: The calculated cost in credits for the call.
    *   **Status**: Whether the call was successful, failed, or is still processing.
    *   **Timestamps & Duration**: When the call occurred and how long it took.
    *   **Identifiers**: Links to the user (`userDid`) and application (`appDid`) that initiated the call.

*   **`ModelCallStat`**: To optimize performance for analytics queries, the system pre-aggregates data from the `ModelCall` table into `ModelCallStat`. These records contain summarized statistics for specific time intervals (e.g., hourly, daily), reducing the need for expensive real-time calculations when serving dashboard data. The administrative endpoints for recalculating and cleaning stats operate on this table.

### Authentication & Authorization

Security is managed at the middleware level within the Express.js framework.

*   **Session Middleware**: Most endpoints are protected by a `sessionMiddleware`. This middleware inspects incoming requests for a valid session token, authenticates the user, and attaches the user's information (like `userDid` and `role`) to the request object. Unauthenticated requests are rejected with a `401 Unauthorized` status.
*   **Admin Middleware**: Certain endpoints that provide system-wide data or perform sensitive maintenance tasks are further protected by an `ensureAdmin` middleware. This check ensures that the authenticated user has a role of `admin` or `owner`, returning a `403 Forbidden` error if the permissions are insufficient.

## API Endpoints

This section provides a detailed reference for all endpoints exposed by the User Service.

### User Information

#### GET /info

Retrieves comprehensive information for the currently authenticated user, including their profile and, if enabled, their credit balance.

*   **Permissions**: Authenticated User
*   **Response Body**:
    *   `user`: Object containing user details (`did`, `fullName`, `email`, `avatar`).
    *   `creditBalance`: Object with credit details (`balance`, `total`, `grantCount`, `pendingCredit`). This is `null` if credit-based billing is disabled.
    *   `paymentLink`: A pre-generated short URL for the user to purchase more credits.
    *   `currency`: The currency configuration for payments.
    *   `enableCredit`: A boolean flag indicating if credit-based billing is active.
    *   `profileLink`: A pre-generated short URL to the user's credit usage dashboard.

### Credit Management

These endpoints are only functional when `Config.creditBasedBillingEnabled` is `true`.

#### GET /credit/grants

Fetches a paginated list of credit grants for the user. Grants are additions of credits to a user's account, often from promotional offers or initial sign-ups.

*   **Permissions**: Authenticated User
*   **Query Parameters**:
    *   `page` (number, optional): The page number for pagination.
    *   `pageSize` (number, optional): The number of items per page (max 100).
    *   `start` (number, optional): The start timestamp for the query range.
    *   `end` (number, optional): The end timestamp for the query range.

#### GET /credit/transactions

Fetches a paginated list of credit transactions, such as purchases.

*   **Permissions**: Authenticated User
*   **Query Parameters**:
    *   `page` (number, optional): The page number for pagination.
    *   `pageSize` (number, optional): The number of items per page (max 100).
    *   `start` (number, optional): The start timestamp for the query range.
    *   `end` (number, optional): The end timestamp for the query range.

#### GET /credit/balance

Retrieves the current credit balance for the authenticated user.

*   **Permissions**: Authenticated User

#### GET /credit/payment-link

Generates and returns a short URL that directs the user to a payment page to purchase credits.

*   **Permissions**: Authenticated User

### Model Call History

#### GET /model-calls

Retrieves a paginated history of AI model calls. This is a primary endpoint for displaying usage logs to users and administrators.

*   **Permissions**: Authenticated User. Admin or owner role is required if `allUsers=true`.
*   **Query Parameters**:
    *   `page` (number, optional, default: 1): The page number for pagination.
    *   `pageSize` (number, optional, default: 50): The number of items per page (max 100).
    *   `startTime` (string, optional): The start timestamp (Unix time) for the query range.
    *   `endTime` (string, optional): The end timestamp (Unix time) for the query range.
    *   `search` (string, optional): A search term to filter by model, `appDid`, or `userDid`.
    *   `status` (string, optional): Filter by call status. Can be `success`, `failed`, or `all`.
    *   `model` (string, optional): Filter by a specific model name.
    *   `providerId` (string, optional): Filter by a specific AI provider ID.
    *   `appDid` (string, optional): Filter by a specific application DID.
    *   `allUsers` (boolean, optional): If `true`, retrieves calls for all users. **Requires admin privileges.**

#### GET /model-calls/export

Exports the model call history to a CSV file. This endpoint supports the same filtering capabilities as `GET /model-calls` but is designed for bulk data export and offline analysis.

*   **Permissions**: Authenticated User. Admin or owner role is required if `allUsers=true`.
*   **Query Parameters**: Same as `GET /model-calls`, excluding pagination (`page`, `pageSize`). The export limit is hardcoded to 10,000 records.
*   **Response**: A `text/csv` file with a `Content-Disposition` header to trigger a file download.

### Usage Statistics

#### GET /usage-stats

Provides aggregated usage statistics for a specified time range for the authenticated user. This endpoint powers user-facing analytics dashboards.

*   **Permissions**: Authenticated User
*   **Query Parameters**:
    *   `startTime` (string, required): The start timestamp for the query range.
    *   `endTime` (string, required): The end timestamp for the query range.
*   **Response Body**:
    *   `summary`: An object containing top-level statistics like total calls, total credits consumed, and usage broken down by call type (e.g., `chatCompletion`, `embedding`).
    *   `dailyStats`: An array of objects, each representing a day in the time range with its own summary of usage and credits.
    *   `modelStats`: A list of the most frequently used models in the period.
    *   `trendComparison`: Data comparing the specified period with the preceding period to show growth or decline in usage.

#### GET /weekly-comparison

Calculates and returns a comparison of usage metrics between the current week (to date) and the previous full week.

*   **Permissions**: Authenticated User
*   **Response Body**:
    *   `current`: An object with `totalUsage`, `totalCredits`, and `totalCalls` for the current week.
    *   `previous`: The same metrics for the previous week.
    *   `growth`: The percentage change for each metric.

#### GET /monthly-comparison

Calculates and returns a comparison of usage metrics between the current month (to date) and the previous full month.

*   **Permissions**: Authenticated User
*   **Response Body**:
    *   `current`: An object with `totalUsage`, `totalCredits`, and `totalCalls` for the current month.
    *   `previous`: The same metrics for the previous month.
    *   `growth`: The percentage change for each metric.

### Administrative Endpoints

These endpoints are intended for system maintenance, monitoring, and troubleshooting. Access is restricted to users with `admin` or `owner` roles.

#### GET /admin/user-stats

Provides aggregated usage statistics across all users for a specified time range. This is the administrator's equivalent of `GET /usage-stats`.

*   **Permissions**: Admin or Owner
*   **Query Parameters**:
    *   `startTime` (string, required): The start timestamp for the query range.
    *   `endTime` (string, required): The end timestamp for the query range.

#### POST /recalculate-stats

Manually triggers a recalculation of the aggregated `ModelCallStat` data for a specific user within a given time frame. This is a critical tool for correcting data inconsistencies that may arise from processing failures or bugs.

*   **Permissions**: Admin or Owner
*   **Request Body**:
    *   `userDid` (string, required): The DID of the user whose stats need recalculation.
    *   `startTime` (string, required): The start timestamp for the recalculation window.
    *   `endTime` (string, required): The end timestamp for the recalculation window.
    *   `dryRun` (boolean, optional): If `true`, the endpoint will report the actions it would take (e.g., number of records to delete and hours to recalculate) without actually performing them. This is highly recommended for verifying the scope of an operation before execution.
*   **Operation**:
    1.  Identifies all hourly `ModelCallStat` records for the user within the time range.
    2.  If not a `dryRun`, it deletes these records.
    3.  It then iterates through each hour in the range and re-triggers the aggregation logic to create fresh `ModelCallStat` records from the raw `ModelCall` data.

#### POST /cleanup-daily-stats

Deletes daily aggregated statistics (`ModelCallStat` records where `timeType` is 'day') for a specific user within a time range. This can be used for data lifecycle management or to clear out corrupted daily summaries before a recalculation.

*   **Permissions**: Admin or Owner
*   **Request Body**:
    *   `userDid` (string, required): The DID of the user to perform the cleanup for.
    *   `startTime` (string, required): The start timestamp of the cleanup window.
    *   `endTime` (string, required): The end timestamp of the cleanup window.