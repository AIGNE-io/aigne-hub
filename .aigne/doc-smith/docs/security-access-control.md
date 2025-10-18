# User API Endpoints

The User API provides endpoints for managing user-related data, including credit balances, transaction history, and usage statistics. These endpoints are essential for monitoring user activity and managing billing information.

## Authentication

All endpoints in this section require user authentication via `sessionMiddleware`. Specific endpoints may require administrator privileges, which are enforced by the `ensureAdmin` middleware.

---

### Get User Information

Retrieves detailed information for the authenticated user, including their profile and credit balance if credit-based billing is enabled.

- **Endpoint:** `GET /user/info`
- **Permissions:** Authenticated User

**Successful Response (200 OK)**

If credit-based billing is enabled and the payment service is operational:

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": {
    "balance": 1000.50,
    "total": 5000.00,
    "grantCount": 5,
    "pendingCredit": 100.00
  },
  "paymentLink": "https://example.com/short/payment",
  "currency": {
    "name": "Credit",
    "symbol": "CR",
    "decimal": 2
  },
  "enableCredit": true,
  "profileLink": "https://example.com/short/profile"
}
```

If credit-based billing is disabled:

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": null,
  "paymentLink": null,
  "enableCredit": false,
  "profileLink": "https://example.com/short/profile"
}
```

**Error Responses**

- `401 Unauthorized`: User is not authenticated.
- `404 Not Found`: User or Meter configuration not found.
- `502 Bad Gateway`: The payment service is not running.

---

### List Model Calls

Retrieves a paginated list of AI model calls, which can be filtered by various criteria. This is the primary endpoint for fetching usage history.

- **Endpoint:** `GET /user/model-calls`
- **Permissions:** Authenticated User. Administrator role is required to use the `allUsers=true` parameter.

**Query Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | The page number for pagination. Defaults to `1`. |
| `pageSize` | number | The number of items per page. Defaults to `50`, max `100`. |
| `startTime` | string | The start of the time range (Unix timestamp). |
| `endTime` | string | The end of the time range (Unix timestamp). |
| `search` | string | A search term to filter results. |
| `status` | string | Filter by call status. Can be `success`, `failed`, or `all`. |
| `model` | string | Filter by a specific model name. |
| `providerId` | string | Filter by a specific provider ID. |
| `appDid` | string | Filter by the DID of the calling application. |
| `allUsers` | boolean | **Admin only.** If `true`, retrieves calls for all users. |

**Successful Response (200 OK)**

```json
{
  "count": 1,
  "list": [
    {
      "id": "z82...",
      "userDid": "z1...",
      "model": "gpt-4",
      "status": "success",
      "credits": 150.75,
      "duration": 500,
      "createdAt": "2023-10-27T10:00:00.000Z",
      // ... other fields
      "appInfo": {
        "appName": "My App",
        "appDid": "z2...",
        "appLogo": "https://example.com/logo.png",
        "appUrl": "https://example.com"
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "https://example.com/avatar.png"
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 50
  }
}
```

---

### Export Model Calls

Exports model call history to a CSV file. The same filters as the `GET /user/model-calls` endpoint apply.

- **Endpoint:** `GET /user/model-calls/export`
- **Permissions:** Authenticated User. Administrator role is required to use the `allUsers=true` parameter.

**Query Parameters**

This endpoint accepts the same query parameters as `GET /user/model-calls`, excluding `page` and `pageSize`. The export limit is hardcoded to 10,000 records.

**Successful Response (200 OK)**

The server responds with a `text/csv` file.

```csv
Timestamp,Request ID,User DID,User Name,User Email,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration(ms),App DID
2023-10-27T10:00:00.000Z,z82...,z1...,John Doe,john.doe@example.com,gpt-4,OpenAI,chat,success,100,200,300,150.75,500,z2...
```

---

### Get Usage Statistics

Retrieves aggregated usage statistics for a specified time range.

- **Endpoint:** `GET /user/usage-stats`
- **Permissions:** Authenticated User.

**Query Parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `startTime` | string | Yes | The start of the time range (Unix timestamp). |
| `endTime` | string | Yes | The end of the time range (Unix timestamp). |

**Successful Response (200 OK)**

```json
{
  "summary": {
    "byType": {
      "chat": 100,
      "image": 20
    },
    "totalCalls": 120,
    "totalCredits": 12345.67,
    "modelCount": 5,
    "totalUsage": 500000
  },
  "dailyStats": [
    {
      "date": "2023-10-26",
      "credits": 5000.1,
      "calls": 50
    },
    {
      "date": "2023-10-27",
      "credits": 7345.57,
      "calls": 70
    }
  ],
  "modelStats": [
    {
      "model": "gpt-4",
      "totalCalls": 80,
      "totalCredits": 9000.0
    }
  ],
  "trendComparison": {
    "totalCredits": {
      "current": 12345.67,
      "previous": 11000.0,
      "change": "12.23"
    },
    "totalCalls": {
      "current": 120,
      "previous": 100,
      "change": "20.00"
    }
  }
}
```

---

### Admin: Get All User Statistics

Retrieves aggregated usage statistics for all users in a specified time range.

- **Endpoint:** `GET /user/admin/user-stats`
- **Permissions:** Administrator

**Query Parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `startTime` | string | Yes | The start of the time range (Unix timestamp). |
| `endTime` | string | Yes | The end of the time range (Unix timestamp). |

**Response**

The response structure is identical to `GET /user/usage-stats` but includes data for all users.

---

### Admin: Recalculate User Statistics

An administrative endpoint to regenerate cached hourly statistics for a user within a specified time range. This is useful for correcting data inconsistencies.

- **Endpoint:** `POST /user/recalculate-stats`
- **Permissions:** Administrator

**Request Body**

```json
{
  "userDid": "z1...",
  "startTime": "1698364800",
  "endTime": "1698451200",
  "dryRun": true
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `userDid` | string | Yes | The DID of the user whose stats will be recalculated. |
| `startTime` | string | Yes | The start of the time range (Unix timestamp). |
| `endTime` | string | Yes | The end of the time range (Unix timestamp). |
| `dryRun` | boolean | No | If `true`, the server will preview the changes without executing them. |

**Successful Response (200 OK)**

```json
{
  "message": "Rebuild completed",
  "deleted": 24,
  "success": 24,
  "failed": 0
}
```

---

## Credit Management API

Endpoints for managing and viewing user credits.

### List Credit Grants

Retrieves a paginated list of credit grants for the authenticated user.

- **Endpoint:** `GET /user/credit/grants`
- **Permissions:** Authenticated User

---

### List Credit Transactions

Retrieves a paginated list of credit transactions for the authenticated user.

- **Endpoint:** `GET /user/credit/transactions`
- **Permissions:** Authenticated User

---

### Get Credit Balance

Retrieves the current credit balance for the authenticated user.

- **Endpoint:** `GET /user/credit/balance`
- **Permissions:** Authenticated User

---

### Get Credit Payment Link

Retrieves a short URL for the credit payment page.

- **Endpoint:** `GET /user/credit/payment-link`
- **Permissions:** Authenticated User

# AI Providers API Endpoints

The AI Providers API is used for configuring the connection to various AI model providers, managing their credentials, and setting the rates for model usage. These settings are fundamental to the operation of the system.

## Authentication

Most endpoints in this section require administrator privileges, enforced by the `ensureAdmin` middleware. Public or user-facing endpoints are explicitly noted.

---

### List AI Providers

Retrieves a list of all configured AI providers, including their model rates and masked credentials.

- **Endpoint:** `GET /ai-providers`
- **Permissions:** Authenticated User

**Successful Response (200 OK)**

```json
[
  {
    "id": "prov_1...",
    "name": "openai",
    "displayName": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "enabled": true,
    "modelRates": [
      {
        "id": "rate_1...",
        "model": "gpt-4",
        "type": "chatCompletion",
        "inputRate": 10,
        "outputRate": 30
      }
    ],
    "credentials": [
      {
        "id": "cred_1...",
        "name": "Default Key",
        "credentialType": "api_key",
        "active": true,
        "displayText": "Default Key (sk-••••key)",
        "maskedValue": {
          "api_key": "sk-••••key"
        }
      }
    ]
  }
]
```

---

### Create AI Provider

Adds a new AI provider to the system.

- **Endpoint:** `POST /ai-providers`
- **Permissions:** Administrator

**Request Body**

```json
{
  "name": "anthropic",
  "displayName": "Anthropic",
  "baseUrl": "https://api.anthropic.com",
  "enabled": true
}
```

---

### Provider Operations

- **Update Provider:** `PUT /ai-providers/:id` (Admin)
- **Delete Provider:** `DELETE /ai-providers/:id` (Admin)

---

### Add Credential

Adds a new credential for a specified provider. The system validates the credential before saving it.

- **Endpoint:** `POST /ai-providers/:providerId/credentials`
- **Permissions:** Administrator

**Request Body**

```json
{
  "name": "My API Key",
  "value": "sk-...",
  "credentialType": "api_key"
}
```

---

### Credential Operations

- **Update Credential:** `PUT /ai-providers/:providerId/credentials/:credentialId` (Admin)
- **Delete Credential:** `DELETE /ai-providers/:providerId/credentials/:credentialId` (Admin)
- **Check Credential Status:** `GET /ai-providers/:providerId/credentials/:credentialId/check` (Admin) - Triggers a real-time check of the credential's validity.

---

### Add Model Rate

Adds a new model rate configuration to a provider.

- **Endpoint:** `POST /ai-providers/:providerId/model-rates`
- **Permissions:** Administrator

**Request Body**

```json
{
  "model": "claude-3-opus-20240229",
  "type": "chatCompletion",
  "inputRate": 15,
  "outputRate": 75,
  "unitCosts": {
    "input": 0.000015,
    "output": 0.000075
  }
}
```

---

### Batch Add Model Rates

Adds a single model rate configuration to multiple providers simultaneously.

- **Endpoint:** `POST /ai-providers/model-rates`
- **Permissions:** Administrator

**Request Body**

```json
{
  "model": "llama3-70b-8192",
  "type": "chatCompletion",
  "inputRate": 1,
  "outputRate": 1,
  "providers": ["prov_1...", "prov_2..."]
}
```

---

### Model Rate Operations

- **List Rates for a Provider:** `GET /ai-providers/:providerId/model-rates` (User)
- **Update Model Rate:** `PUT /ai-providers/:providerId/model-rates/:rateId` (Admin)
- **Delete Model Rate:** `DELETE /ai-providers/:providerId/model-rates/:rateId` (Admin)

---

### List All Model Rates

Retrieves a paginated and filterable list of all model rates across all providers.

- **Endpoint:** `GET /ai-providers/model-rates`
- **Permissions:** Authenticated User

**Query Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | Page number for pagination. |
| `pageSize` | number | Number of items per page. |
| `providerId` | string | Comma-separated list of provider IDs to filter by. |
| `model` | string | Search term for the model name. |

---

### Bulk Update Model Rates

Updates all existing model rates based on a specified profit margin and the price of a single credit. The new rates are calculated as: `newRate = (unitCost * (1 + profitMargin / 100)) / creditPrice`.

- **Endpoint:** `POST /ai-providers/bulk-rate-update`
- **Permissions:** Administrator

**Request Body**

```json
{
  "profitMargin": 20,
  "creditPrice": 0.00001
}
```

**Successful Response (200 OK)**

```json
{
  "message": "Successfully updated 50 model rates",
  "updated": 50,
  "skipped": 5,
  "parameters": {
    "profitMargin": 20,
    "creditPrice": 0.00001
  },
  "summary": [
    {
      "id": "rate_1...",
      "model": "gpt-4",
      "provider": "OpenAI",
      "oldInputRate": 10,
      "newInputRate": 12,
      "oldOutputRate": 30,
      "newOutputRate": 36
    }
  ]
}
```

---

## Service Discovery & Monitoring

### List Available Models (Public)

A public endpoint that provides a list of all enabled and configured models in a format compatible with LiteLLM. This is crucial for service discovery by client applications.

- **Endpoint:** `GET /ai-providers/models`
- **Permissions:** Public

**Successful Response (200 OK)**

```json
[
  {
    "key": "openai/gpt-4",
    "model": "gpt-4",
    "type": "chat",
    "provider": "openai",
    "providerId": "prov_1...",
    "input_credits_per_token": 10,
    "output_credits_per_token": 30,
    "modelMetadata": {
      "maxTokens": 8192,
      "features": ["tools", "vision"]
    },
    "status": {
      "id": "status_1...",
      "lastChecked": "2023-10-27T10:00:00.000Z",
      "latency": 120,
      "status": "operational"
    },
    "providerDisplayName": "OpenAI"
  }
]
```

---

### Trigger Model Health Checks

An administrative endpoint to enqueue health checks for all configured models. This is useful for forcing a refresh of model statuses.

- **Endpoint:** `GET /ai-providers/test-models`
- **Permissions:** Administrator

---

### Provider Health Status

Provides a summary of the health status of all configured provider credentials. This endpoint is designed for integration with monitoring and alerting systems.

- **Endpoint:** `GET /ai-providers/health`
- **Permissions:** Public

**Successful Response (200 OK)**

```json
{
  "providers": {
    "openai": {
      "Default Key": {
        "running": true
      }
    },
    "anthropic": {
      "Primary Key": {
        "running": false
      }
    }
  },
  "timestamp": "2023-10-27T12:00:00.000Z"
}
```