# 5. Model Rate Management

This section details the configuration and management of AI Model Rates, which are fundamental to the platform's credit-based billing system. Operators will find the necessary information to define pricing, manage models, and troubleshoot billing inaccuracies.

## 5.1. Core Concepts

**Model Rates** are records that define the cost of using a specific AI model from a particular provider. Each rate specifies the number of credits charged per input token and per output token. This granular pricing structure is the basis for all usage calculations and billing.

The key components are:

*   **Provider**: The AI service provider (e.g., OpenAI, Google, Bedrock).
*   **Model**: The specific model identifier (e.g., `gpt-4`, `gemini-1.5-pro-latest`).
*   **Type**: The modality of the model, such as `chatCompletion`, `imageGeneration`, or `embedding`.
*   **Rates**:
    *   `inputRate`: The credit cost per 1,000 input tokens.
    *   `outputRate`: The credit cost per 1,000 output tokens or per generated image.
*   **Unit Costs**: The actual cost of the model in a fiat currency (e.g., USD) per million tokens. This is used for automated bulk price adjustments.

Accurate and complete model rate configuration is critical. If a rate is missing for a model that users attempt to call, the API request will fail, as the system cannot calculate the usage cost.

![Model Rate Management UI](d037b6b6b092765ccbfa58706c241622.png)

## 5.2. Managing Model Rates via API

Model rates are managed through a set of RESTful API endpoints. Administrative privileges are required for all creation, update, and deletion operations.

### 5.2.1. Create a Model Rate

This endpoint registers a new rate for a specific model on a single provider.

*   **Endpoint**: `POST /api/ai-providers/:providerId/model-rates`
*   **Permissions**: Admin
*   **Body**:
    *   `model` (string, required): The model identifier.
    *   `type` (string, required): The model type. Must be one of `chatCompletion`, `imageGeneration`, `embedding`.
    *   `inputRate` (number, required): The credit cost for input.
    *   `outputRate` (number, required): The credit cost for output.
    *   `modelDisplay` (string, optional): A user-friendly display name.
    *   `description` (string, optional): A brief description of the model.
    *   `unitCosts` (object, optional): The underlying cost from the provider.
        *   `input` (number, required): Cost per million input tokens.
        *   `output` (number, required): Cost per million output tokens.
    *   `modelMetadata` (object, optional): Additional model capabilities.

**Example Request**:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "gpt-4o",
    "type": "chatCompletion",
    "inputRate": 10,
    "outputRate": 30,
    "modelDisplay": "GPT-4 Omni",
    "unitCosts": {
      "input": 5.0,
      "output": 15.0
    },
    "modelMetadata": {
      "maxTokens": 128000,
      "features": ["tools", "vision"]
    }
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates
```

### 5.2.2. Batch Create Model Rates

This endpoint allows for the creation of the same model rate across multiple providers simultaneously. It is useful for models available from several vendors.

*   **Endpoint**: `POST /api/ai-providers/model-rates`
*   **Permissions**: Admin
*   **Body**: Same as the single create endpoint, but with an additional `providers` array.
    *   `providers` (array of strings, required): A list of Provider IDs where this rate should be created.

**Example Request**:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "claude-3-sonnet",
    "type": "chatCompletion",
    "inputRate": 6,
    "outputRate": 30,
    "providers": ["prv_bedrock_xxxx", "prv_anthropic_yyyy"],
    "unitCosts": {
      "input": 3.0,
      "output": 15.0
    }
  }' \
  https://<your-domain>/api/ai-providers/model-rates
```

The system validates that all specified providers exist and that the rate does not already exist for the given model and type on any of the target providers to prevent duplicates.

### 5.2.3. Update a Model Rate

This endpoint modifies an existing model rate.

*   **Endpoint**: `PUT /api/ai-providers/:providerId/model-rates/:rateId`
*   **Permissions**: Admin
*   **Body**: A subset of the creation fields can be provided.
    *   `modelDisplay`, `inputRate`, `outputRate`, `description`, `unitCosts`, `modelMetadata`.

**Example Request**:

```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "inputRate": 12,
    "outputRate": 35
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates/rate_zzzzzzzz
```

### 5.2.4. Delete a Model Rate

This endpoint permanently removes a model rate. Once deleted, the corresponding model will no longer be billable or usable.

*   **Endpoint**: `DELETE /api/ai-providers/:providerId/model-rates/:rateId`
*   **Permissions**: Admin

## 5.3. Bulk Price Updates

For simplified and consistent pricing adjustments, the system provides a bulk update mechanism based on a defined profit margin. This feature is particularly useful for globally adjusting prices in response to changes in underlying provider costs or credit valuation.

*   **Endpoint**: `POST /api/ai-providers/bulk-rate-update`
*   **Permissions**: Admin
*   **Body**:
    *   `profitMargin` (number, required): The desired profit margin as a percentage (e.g., `20` for 20%).
    *   `creditPrice` (number, required): The effective price of a single credit unit in the same currency as `unitCosts` (e.g., `0.000005` if 1 credit = $0.000005).

**Workflow**:

1.  The system fetches all `AiModelRate` records that have the `unitCosts` field populated. **Rates without this field will be skipped.**
2.  For each valid rate, it calculates the new `inputRate` and `outputRate` using the formula:
    `newRate = (unitCost / 1,000,000) * (1 + profitMargin / 100) / creditPrice`
3.  The calculated rates are applied to the records.

This allows operators to maintain pricing based on business logic rather than manually recalculating each rate.

## 5.4. Model Synchronization and Health

The system includes functionality to test the availability and status of configured models.

*   **Endpoint**: `GET /api/ai-providers/test-models`
*   **Permissions**: Admin
*   **Functionality**: This endpoint triggers an asynchronous job for each configured model rate. The job attempts to validate the model with the provider using the stored credentials. The result (success or failure) is stored in the `AiModelStatus` table, which can be used to determine if a model should be available to end-users.

**Rate Limiting**: To prevent abuse and excessive load on downstream provider APIs, this endpoint is rate-limited. By default, an administrator can trigger this process a maximum of 5 times within a 10-minute window.

## 5.5. Data Model (`AiModelRate`)

For advanced troubleshooting, operators may need to inspect the `ai_model_rates` table in the database directly.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique identifier for the rate record (e.g., `rate_xxxxxxxx`). |
| `providerId` | String | Foreign key linking to the `AiProvider` record. |
| `model` | String(100) | The unique identifier of the model (e.g., `gpt-4o`). |
| `modelDisplay` | String(100) | A human-readable name for the model (e.g., `GPT-4 Omni`). |
| `type` | Enum | The type of model (`chatCompletion`, `embedding`, `imageGeneration`). |
| `inputRate` | Decimal(10, 4) | The credit cost for input tokens. |
| `outputRate` | Decimal(10, 4) | The credit cost for output tokens or per image. |
| `unitCosts` | JSON | Stores the underlying cost from the provider (e.g., `{ "input": 5.0, "output": 15.0 }`). |
| `modelMetadata` | JSON | Stores metadata about the model's capabilities (e.g., `maxTokens`, `features`). |

## 5.6. Operational Considerations

*   **Missing `unitCosts`**: The bulk rate update feature is entirely dependent on the `unitCosts` field. If this field is not populated for a given model rate, that rate will be skipped during a bulk update. Operators should ensure this data is entered accurately if they intend to use the profit-margin-based pricing tool.

*   **Troubleshooting Pricing**: If a user is charged an unexpected amount for an API call, the first step is to query the `ai_model_rates` table for the exact model and provider used. Verify that the `inputRate` and `outputRate` match the expected values. Discrepancies can arise if a manual update or a bulk update produced an unintended result.

*   **Model Unavailability**: If a model is consistently failing for users, an operator can use the `GET /test-models` endpoint to trigger a health check. The results, visible in the `ai_model_status` table, can help diagnose whether the issue is with the model itself, the provider, or the stored credentials.