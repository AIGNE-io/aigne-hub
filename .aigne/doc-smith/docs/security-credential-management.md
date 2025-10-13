# Load Balancing

AIGNE Hub provides a robust load balancing mechanism to distribute AI requests across multiple credentials for a single provider. This is essential for managing API rate limits, improving fault tolerance, and optimizing costs. The system is designed to be both intelligent in its distribution and resilient to credential failures.

This document explains the architecture of the load balancing system, the algorithm used, and operational considerations for infrastructure teams.

## Architecture Overview

When multiple API keys or credentials are configured for a single AI provider (e.g., several OpenAI API keys), AIGNE Hub treats them as a pool of resources. For every incoming request designated for that provider, the load balancer selects the most appropriate credential from the pool based on a smooth weighted round-robin algorithm.

Key components of this system include:

-   **Credential Pool**: A collection of active credentials for a specific provider.
-   **Weighting System**: Each credential can be assigned a `weight` to influence how frequently it is selected.
-   **Health Status**: Credentials can be marked as `active` or `inactive`. The load balancer will only select from the pool of active credentials.
-   **Usage Tracking**: The system tracks `usageCount` and `lastUsedAt` for each credential, which aids in failover and provides visibility into distribution.

---

## Load Balancing Algorithm

AIGNE Hub employs a **Smooth Weighted Round-Robin** algorithm to ensure a fair and predictable distribution of requests according to predefined weights.

### How It Works

The algorithm is designed to avoid bursts of requests to a single high-weight credential. Instead, it spreads them out smoothly. Here is the selection process for each request:

1.  **Retrieve Active Credentials**: The system fetches all credentials for the target provider where the `active` flag is `true`.
2.  **Update Current Weights**: An in-memory cache maintains a `current` weight for each credential. On every selection run, each credential's configured `weight` is added to its `current` weight.
3.  **Select Best Credential**: The credential with the highest `current` weight is selected to handle the request.
4.  **Adjust for Next Cycle**: After selection, the `total weight` of all credentials in the pool is subtracted from the `current` weight of the selected credential.

This process ensures that credentials with higher weights are chosen more often over time, but in an interleaved and smooth fashion.

### Configuration

The distribution is controlled by the `weight` parameter on each credential.

-   **`weight` (integer)**: Defaults to `100`. A higher number increases the proportion of requests sent to that credential.

**Example Scenario:**

Consider a provider with two credentials:
-   **Key-A**: `weight: 200`
-   **Key-B**: `weight: 100`

Over a series of 300 requests, **Key-A** will be selected to handle approximately 200 requests, while **Key-B** will handle about 100. The smooth algorithm ensures the distribution is even, preventing, for example, Key-A from receiving 200 requests in a row.

### Code Implementation

The core logic resides in the `getNextAvailableCredential` static method of the `AiCredential` model. This method manages the weight calculations and selects the next credential.

```typescript
// From: blocklets/core/api/src/store/models/ai-credential.ts

// Simplified logic for Smooth Weighted Round-Robin
let selected: AiCredential | null = null;
for (const c of credentials) {
  const w = weights[c.id];
  if (w) {
    w.current += w.weight;
    if (!selected || w.current > weights[selected.id]!.current) {
      selected = c;
    }
  }
}

if (selected) {
  weights[selected.id]!.current -= totalWeight;
}

return selected;
```

---

## Failover and Health Management

The load balancer is designed to automatically bypass failing credentials, ensuring service continuity.

### Automatic Deactivation

If a request to an AI provider fails due to a credential-specific issue (e.g., an invalid API key), that credential can be marked as inactive.

-   The `active` flag is set to `false`.
-   An `error` message detailing the cause of failure is logged against the credential record.

Once a credential is marked as inactive, the load balancer immediately removes it from the selection pool for subsequent requests.

### Credential Reactivation

A credential that was marked inactive must be manually re-validated and re-activated. The `checkCredentials` function is used for this purpose.

1.  **Trigger Validation**: An administrator can trigger a health check on an inactive credential through the admin interface.
2.  **Test Connection**: The system uses the credential to make a simple validation call to the AI provider (e.g., listing models).
3.  **Update Status**:
    -   If the validation succeeds, the credential's `active` flag is set to `true`, the `error` field is cleared, and its default `weight` is restored.
    -   If it fails, the `error` field is updated with the new failure reason.

This process prevents permanently invalid keys from being retried, reducing latency and error rates.

## Monitoring and Troubleshooting

For SRE and DevOps teams, monitoring the state of credential pools is critical for maintaining a healthy system.

### Key Monitoring Points

-   **`active` Status**: Monitor the number of inactive credentials. A sudden increase can signal a widespread issue, such as expired keys or a provider-side change.
-   **`error` Field**: Log and alert on non-null values in the `error` field of the `AiCredential` table to quickly identify the root cause of credential failures.
-   **`usageCount` and `lastUsedAt`**: Observe these fields to verify that load is being distributed as expected according to the configured weights. If a credential's `usageCount` is not increasing, it may be inactive or have a configuration issue.

### Troubleshooting Scenarios

-   **Uneven Load Distribution**: If requests are not balanced according to expectations, verify the `weight` values for all credentials associated with the provider. Ensure that no credentials have been unexpectedly marked inactive.
-   **High Error Rate for a Provider**: Query the `ai_credentials` table for that `providerId`. Check for any credentials with `active: false` and review the corresponding `error` messages. The issue is likely with one or more specific keys, not the entire service.
-   **Total Provider Outage**: If all credentials for a provider are failing, the issue may be upstream with the AI provider itself. The logged `error` messages will help differentiate between local credential issues and external service outages.