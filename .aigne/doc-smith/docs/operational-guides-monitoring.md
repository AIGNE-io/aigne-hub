# User Service

## Overview

The User Service is a core component responsible for managing all user-centric data and operations. It provides a suite of API endpoints for handling user information, credit-based billing, and detailed usage analytics. This service is critical for both individual user account management and administrative oversight of the entire system.

From an operational perspective, this service is designed for high performance and data integrity. A key architectural feature is its caching mechanism for usage statistics, which pre-calculates and stores aggregated data to deliver fast responses for analytics queries and prevent heavy computational loads on the primary database.

## Key Concepts

### Credit-Based Billing

The system integrates with an external Payment Kit to support a credit-based billing model. When enabled (`creditBasedBillingEnabled` is true), the User Service handles:
- Fetching user credit balances.
- Retrieving transaction and grant histories.
- Providing payment links for users to purchase more credits.

If the Payment Kit is not running or is disabled, the service gracefully degrades, and credit-related endpoints will return errors or indicate that the feature is disabled.

### Usage Statistics Caching

To ensure responsive and efficient retrieval of usage data, the User Service employs a sophisticated caching strategy for model call statistics. Instead of calculating aggregates from the raw `ModelCalls` table on every request, which is resource-intensive, the system pre-computes and stores these statistics in the `ModelCallStat` table.

**Caching Logic:**

1.  **Granularity**: Statistics are aggregated on an hourly basis. This provides a good balance between data freshness and computational overhead.
2.  **On-Demand Computation**: When hourly stats are requested for a past period, the system first checks the `ModelCallStat` cache.
3.  **Cache Miss**: If the data is not in the cache (a "cache miss"), the service runs optimized SQL queries against the `ModelCalls` table to compute the statistics for that specific hour.
4.  **Cache Storage**: The newly computed stats are then saved to the `ModelCallStat` table, ensuring subsequent requests for the same hour are served directly from the cache.
5.  **Real-time Data**: For the current, ongoing hour, statistics are always computed in real-time to provide the most up-to-date information.

This design significantly reduces database load and API latency for all usage statistics endpoints. It is a critical component for system scalability and performance. For maintenance and troubleshooting, admin-only endpoints are provided to manually recalculate these cached statistics if necessary.

## API Endpoints

The following section details the available API endpoints, their parameters, and their functions.

---

### User Information

#### Get User Info

Retrieves comprehensive information for the currently authenticated user, including profile details and credit balance (if applicable).

-   **Endpoint**: `GET /info`
-   **Permissions**: Authenticated User

**Returns**

<x-field-group>
  <x-field data-name="user" data-type="object" data-desc="User's profile information.">
    <x-field data-name="did" data-type="string" data-desc="User's decentralized identifier."></x-field>
    <x-field data-name="fullName" data-type="string" data-desc="User's full name."></x-field>
    <x-field data-name="email" data-type="string" data-desc="User's email address."></x-field>
    <x-field data-name="avatar" data-type="string" data-desc="URL to the user's avatar."></x-field>
  </x-field>
  <x-field data-name="creditBalance" data-type="object" data-desc="User's credit balance details. Null if credit-based billing is disabled.">
    <x-field data-name="balance" data-type="number" data-desc="The available credit balance."></x-field>
    <x-field data-name="total" data-type="number" data-desc="The total credits granted."></x-field>
    <x-field data-name="grantCount" data-type="number" data-desc="The number of credit grants received."></x-field>
    <x-field data-name="pendingCredit" data-type="number" data-desc="Credits from pending transactions."></x-field>
  </x-field>
  <x-field data-name="paymentLink" data-type="string" data-desc="A short URL for the user to purchase credits."></x-field>
  <x-field data-name="currency" data-type="object" data-desc="The currency used for payments."></x-field>
  <x-field data-name="enableCredit" data-type="boolean" data-desc="Indicates if credit-based billing is active on the system."></x-field>
  <x-field data-name="profileLink" data-type="string" data-desc="A short URL to the user's credit usage profile page."></x-field>
</x-field-group>

---

### Credit Management

These endpoints are only functional when credit-based billing is enabled.

#### Get Credit Grants

Retrieves a paginated list of credit grants for the authenticated user.

-   **Endpoint**: `GET /credit/grants`
-   **Permissions**: Authenticated User

**Query Parameters**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="The page number for pagination (starts at 1)."></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="The number of items per page (max 100)."></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="Unix timestamp for the start of the time range."></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="Unix timestamp for the end of the time range."></x-field>
</x-field-group>

#### Get Credit Transactions

Retrieves a paginated list of credit transactions for the authenticated user.

-   **Endpoint**: `GET /credit/transactions`
-   **Permissions**: Authenticated User

**Query Parameters**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="The page number for pagination (starts at 1)."></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="The number of items per page (max 100)."></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="Unix timestamp for the start of the time range."></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="Unix timestamp for the end of the time range."></x-field>
</x-field-group>

#### Get Credit Balance

Retrieves the current credit balance for the authenticated user.

-   **Endpoint**: `GET /credit/balance`
-   **Permissions**: Authenticated User

#### Get Credit Payment Link

Provides a short URL for purchasing credits.

-   **Endpoint**: `GET /credit/payment-link`
-   **Permissions**: Authenticated User

---

### Model Call History

#### Get Model Calls

Retrieves a paginated list of model call records. Supports extensive filtering.

-   **Endpoint**: `GET /model-calls`
-   **Permissions**: Authenticated User. Admin/Owner role required if `allUsers=true`.

**Query Parameters**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="Page number for pagination."></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="Number of items per page (max 100)."></x-field>
    <x-field data-name="startTime" data-type="string" data-required="false" data-desc="Unix timestamp for the start of the time range."></x-field>
    <x-field data-name="endTime" data-type="string" data-required="false" data-desc="Unix timestamp for the end of the time range."></x-field>
    <x-field data-name="search" data-type="string" data-required="false" data-desc="Keyword search against call records."></x-field>
    <x-field data-name="status" data-type="string" data-required="false" data-desc="Filter by status. Can be 'success', 'failed', or 'all'."></x-field>
    <x-field data-name="model" data-type="string" data-required="false" data-desc="Filter by a specific model name."></x-field>
    <x-field data-name="providerId" data-type="string" data-required="false" data-desc="Filter by a specific provider ID."></x-field>
    <x-field data-name="appDid" data-type="string" data-required="false" data-desc="Filter by the DID of the calling application."></x-field>
    <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="If true, returns records for all users. Requires admin/owner role."></x-field>
</x-field-group>

#### Export Model Calls

Exports model call records to a CSV file. Supports the same filtering as the `/model-calls` endpoint.

-   **Endpoint**: `GET /model-calls/export`
-   **Permissions**: Authenticated User. Admin/Owner role required if `allUsers=true`.

**Query Parameters**

The same query parameters as `GET /model-calls` are supported, except for `page` and `pageSize`. The export limit is hardcoded to 10,000 records.

---

### Usage Statistics

#### Get Usage Statistics

Retrieves aggregated usage statistics for a given time range. This data is served by the caching system.

-   **Endpoint**: `GET /usage-stats`
-   **Permissions**: Authenticated User

**Query Parameters**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="Unix timestamp for the start of the time range."></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="Unix timestamp for the end of the time range."></x-field>
</x-field-group>

#### Get Weekly/Monthly Comparison

Retrieves a comparison of usage metrics against the previous week or month.

-   **Endpoint**: `GET /weekly-comparison`
-   **Endpoint**: `GET /monthly-comparison`
-   **Permissions**: Authenticated User

---

### Administrative Operations

These endpoints are intended for system maintenance and troubleshooting.

#### Get All User Statistics (Admin)

Retrieves aggregated usage statistics for all users combined.

-   **Endpoint**: `GET /admin/user-stats`
-   **Permissions**: Admin

**Query Parameters**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="Unix timestamp for the start of the time range."></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="Unix timestamp for the end of the time range."></x-field>
</x-field-group>

#### Recalculate Statistics Cache

Manually triggers the recalculation of hourly usage statistics for a specific user and time range. This is useful for correcting data discrepancies or backfilling data after a system change.

-   **Endpoint**: `POST /recalculate-stats`
-   **Permissions**: Admin

**Request Body**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="The DID of the user whose stats need recalculation."></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="Unix timestamp for the start of the recalculation period."></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="Unix timestamp for the end of the recalculation period."></x-field>
    <x-field data-name="dryRun" data-type="boolean" data-required="false" data-desc="If true, the endpoint will report what actions it would take without actually performing them."></x-field>
</x-field-group>

#### Cleanup Daily Statistics Cache

Removes legacy daily statistic entries from the cache for a specific user and time range.

-   **Endpoint**: `POST /cleanup-daily-stats`
-   **Permissions**: Admin

**Request Body**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="The DID of the user for whom to clean up stats."></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="Unix timestamp for the start of the cleanup period."></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="Unix timestamp for the end of the cleanup period."></x-field>
</x-field-group>