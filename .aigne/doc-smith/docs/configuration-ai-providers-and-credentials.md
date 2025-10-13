# AI Providers

The AI Providers API is the central management layer for integrating and configuring various external Artificial Intelligence services. It acts as an abstraction layer, providing a unified interface for managing credentials, defining model pricing, and monitoring the health of different AI providers. This system is designed for scalability and resilience, incorporating features like encrypted credential storage and load balancing across multiple API keys.

## Core Concepts

Understanding these core concepts is essential for operating and maintaining the AI provider integrations.

### Providers

A **Provider** represents an external AI service, such as OpenAI, Google Gemini, or Amazon Bedrock. Each provider is configured with essential details that allow the system to interact with its API.

- **`name`**: A unique identifier for the provider (e.g., `openai`, `bedrock`).
- **`displayName`**: A human-readable name for the provider.
- **`baseUrl`**: The base endpoint for the provider's API. For some services like Amazon Bedrock, this may not be required.
- **`region`**: The specific cloud region for services that require it (e.g., `us-east-1` for AWS).
- **`enabled`**: A boolean flag to enable or disable the provider system-wide.

### Credentials

Credentials are used to authenticate requests to the AI providers. The system is designed to manage multiple credentials for a single provider, enhancing reliability and throughput.

#### Security and Encryption

To ensure security, sensitive parts of a credential, such as the `api_key` or `secret_access_key`, are encrypted at rest using the blocklet's native `security.encrypt` function. Only non-sensitive identifiers like `access_key_id` are stored in plaintext. When credentials are retrieved via the API for display, sensitive values are masked to prevent accidental exposure.

#### Credential Types

- **`api_key`**: A single secret key for authentication.
- **`access_key_pair`**: A pair of keys, typically an `access_key_id` and a `secret_access_key`.
- **`custom`**: A flexible object structure for providers with unique authentication schemes.

#### Load Balancing

The system implements a smooth weighted round-robin algorithm for providers with multiple active credentials. This mechanism distributes API requests across the available keys based on their assigned weight, ensuring that no single credential becomes a bottleneck.

- Each credential has a `weight` (defaulting to 100).
- The algorithm selects the credential that has the highest current effective weight, then reduces its effective weight for subsequent selections.
- This approach provides a balanced distribution of load over time, improving fault tolerance. If a credential fails, it is marked as inactive and temporarily removed from the rotation until it is re-validated.

### Model Rates

Model Rates define the cost of using a specific AI model from a provider, forming the foundation of the credit-based billing system.

- Each rate links a `model` (e.g., `gpt-4-turbo`) to a `providerId`.
- It specifies the `inputRate` and `outputRate`, which represent the number of credits charged per token (or other unit).
- Rates can also include `unitCosts` (the actual cost from the provider in USD) and `modelMetadata` such as maximum tokens and supported features (`tools`, `vision`, etc.).

---

## API Endpoints

The following section details the RESTful API for managing AI providers, credentials, and model rates.

### Provider Management

Endpoints for creating, retrieving, updating, and deleting AI providers.

- **List Providers**
  - `GET /api/ai-providers`
  - Retrieves a list of all configured AI providers, including their associated credentials and model rates.

- **Create Provider**
  - `POST /api/ai-providers`
  - Creates a new AI provider. The provider `name` must be unique.
  - **Body:**
    ```json
    {
      "name": "openai",
      "displayName": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "enabled": true
    }
    ```

- **Update Provider**
  - `PUT /api/ai-providers/:id`
  - Updates an existing provider's configuration.

- **Delete Provider**
  - `DELETE /api/ai-providers/:id`
  - Deletes a provider and all its associated credentials and model rates.

### Credential Management

Endpoints for managing credentials for a specific provider.

- **Create Credential**
  - `POST /api/ai-providers/:providerId/credentials`
  - Adds a new credential to a provider. The system validates the credential against the provider's API before saving it.
  - **Body:**
    ```json
    {
      "name": "My API Key",
      "value": "sk-...",
      "credentialType": "api_key"
    }
    ```

- **Update Credential**
  - `PUT /api/ai-providers/:providerId/credentials/:credentialId`
  - Updates an existing credential. This also triggers a re-validation.

- **Delete Credential**
  - `DELETE /api/ai-providers/:providerId/credentials/:credentialId`
  - Removes a credential from a provider.

- **Check Credential Status**
  - `GET /api/ai-providers/:providerId/credentials/:credentialId/check`
  - Manually triggers a validation check for a specific credential. This is useful for troubleshooting and re-activating a key that was previously marked as inactive.

### Model Rate Management

Endpoints for managing the pricing of AI models.

- **List All Model Rates**
  - `GET /api/ai-providers/model-rates`
  - Retrieves a paginated and searchable list of all model rates across all providers. Supports filtering by `providerId` and `model`.

- **Batch Create Model Rate**
  - `POST /api/ai-providers/model-rates`
  - Creates the same model rate for multiple providers simultaneously.
  - **Body:**
    ```json
    {
      "model": "claude-3-sonnet",
      "type": "chatCompletion",
      "inputRate": 3,
      "outputRate": 15,
      "providers": ["provider-id-1", "provider-id-2"]
    }
    ```

- **Update Model Rate**
  - `PUT /api/ai-providers/:providerId/model-rates/:rateId`
  - Updates the rates, description, or metadata for a specific model.

- **Bulk Update Rates**
  - `POST /api/ai-providers/bulk-rate-update`
  - Updates all model rates that have `unitCosts` defined. The new rates are calculated based on the specified `profitMargin` and `creditPrice`. This endpoint is designed for system-wide price adjustments.
  - **Body:**
    ```json
    {
      "profitMargin": 20,
      "creditPrice": 0.001
    }
    ```

### Model Discovery

Publicly accessible endpoints used by client applications to fetch available models.

- **Get Available Models**
  - `GET /api/ai-providers/models`
  - Returns a flattened list of all available and enabled models in LiteLLM format. This is the primary endpoint for services that need to discover models.

- **Get Chat Models**
  - `GET /api/ai-providers/chat/models`
  - Returns a list of models grouped by model name, showing which providers support each model. This is primarily used by the UI.

### System Operations

Endpoints for system monitoring and maintenance tasks.

- **Health Check**
  - `GET /api/ai-providers/health`
  - Provides a snapshot of the operational status of all credentials for all providers. It returns a JSON object indicating whether each credential is `running`. This endpoint is critical for monitoring and alerting.
  - **Example Response:**
    ```json
    {
      "providers": {
        "openai": {
          "Primary Key": { "running": true },
          "Secondary Key": { "running": false }
        }
      },
      "timestamp": "2023-10-27T10:00:00.000Z"
    }
    ```

- **Test Models**
  - `GET /api/ai-providers/test-models`
  - Triggers an asynchronous job to test the validity and status of models associated with configured rates. This endpoint is rate-limited to prevent abuse.

---

## Operational Guide

### Monitoring

The primary endpoint for monitoring the AI provider integration is `GET /api/ai-providers/health`. This should be integrated into your existing monitoring and alerting infrastructure.

- **Action:** Periodically poll the `/health` endpoint.
- **Alert Condition:** Trigger an alert if any credential has its `running` status set to `false`.
- **Example Check:**
  ```bash
  curl -s http://localhost:3030/api/ai-providers/health | jq '.providers[].[] | select(.running == false)'
  ```
  An alert should be triggered if the above command produces any output.

### Troubleshooting

- **Credential Failure:** When an API call to a provider fails due to an authentication error, the responsible credential is automatically marked as inactive (`active: false`) and an error message is stored. It is removed from the load balancing rotation.
- **Re-activating Credentials:** To re-activate a credential, first update it with the correct key via `PUT /api/ai-providers/:providerId/credentials/:credentialId`. The system will re-validate it. Alternatively, you can use the `GET .../check` endpoint to manually trigger validation.
- **Rate Limit on Testing:** The `GET /api/ai-providers/test-models` endpoint has a strict rate limit (5 requests per 10 minutes per user) to prevent overwhelming the downstream AI provider APIs. If you receive a `429 Too Many Requests` error, wait for the specified `retryAfter` period.