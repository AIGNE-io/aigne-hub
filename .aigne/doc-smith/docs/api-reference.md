# API Reference

AIGNE Hub provides a robust set of RESTful APIs to integrate AI functionalities into your applications. The API is designed to be a unified gateway, simplifying interactions with various underlying AI providers. This document provides detailed information for developers and SREs on how to deploy, integrate with, and monitor the API endpoints.

There are two versions of the API available. It is strongly recommended that all new integrations use the **V2 API**, as it is more feature-rich, aligns with the AIGNE framework, and supports the credit-based billing system.

- **V2 API**: The current, recommended version for all users. It requires user-based authentication and integrates with the credit billing system.
- **V1 API (Legacy)**: A deprecated version primarily used for internal component-to-component communication. It relies on a simpler subscription model and has limited features.

---

## Authentication

Authentication is handled differently between the V1 and V2 APIs, reflecting their distinct use cases.

### V2 Authentication: User Access Key

The V2 API is designed for end-user and application integrations. It uses a session-based authentication mechanism where each authenticated user has an access key.

- **Mechanism**: Clients must include a valid access key in their requests to authenticate. This is typically done via an `Authorization` header or a session cookie managed by the `@blocklet/sdk`.
- **Usage**: This method is used by all V2 endpoints (e.g., `/api/v2/chat/completions`, `/api/v2/image`). It ensures that all API calls are associated with a specific user, which is essential for accurate usage tracking and credit-based billing.

### V1 Authentication: Component Call

The V1 API is intended for internal, server-to-server communication between different components within the Blocklet ecosystem.

- **Mechanism**: V1 endpoints are protected by `ensureRemoteComponentCall` and `ensureAdmin` middleware. This system verifies that the request originates from a trusted component with the necessary administrative privileges.
- **Usage**: This is not intended for external or end-user-facing applications. It provides a secure way for different parts of the AIGNE ecosystem to communicate with the Hub internally.

---

## API Version 2 (Recommended)

The V2 API is the standard for all new development. It offers comprehensive features for chat, image generation, and embeddings, with built-in support for usage tracking and credit-based billing.

### Endpoint: Chat Completions

This endpoint generates text-based responses for conversational AI, text completion, and other language tasks. It is compatible with the OpenAI Chat Completions API format and supports streaming.

- **Endpoint**: `POST /api/v2/chat/completions`
- **AIGNE Native Endpoint**: `POST /api/v2/chat`

#### Request Body

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `model` | string | The ID of the model to use (e.g., `openai/gpt-4`, `anthropic/claude-3-opus`). | Yes |
| `messages` | array | An array of message objects representing the conversation history. See object structure below. | Yes |
| `stream` | boolean | If `true`, the API will stream back partial message deltas as Server-Sent Events (SSE). | No |
| `temperature` | number | Controls randomness. Lower values make the output more deterministic. Ranges from 0.0 to 2.0. | No |
| `maxTokens` | integer | The maximum number of tokens to generate in the completion. | No |
| `topP` | number | Controls diversity via nucleus sampling. Ranges from 0.1 to 1.0. | No |
| `presencePenalty` | number | Penalizes new tokens based on whether they appear in the text so far. Ranges from -2.0 to 2.0. | No |
| `frequencyPenalty` | number | Penalizes new tokens based on their existing frequency in the text so far. Ranges from -2.0 to 2.0. | No |
| `tools` | array | A list of tools the model may call. | No |
| `toolChoice` | string or object | Controls which tool the model should use. Can be "none", "auto", "required", or a specific function. | No |
| `responseFormat` | object | An object specifying the format that the model must output. E.g., `{ "type": "json_object" }` | No |

**Message Object Structure**

| Field | Type | Description |
| :--- | :--- | :--- |
| `role` | string | The role of the message author. One of `system`, `user`, `assistant`, or `tool`. |
| `content` | string or array | The content of the message. For multi-modal models, this can be an array of text and image objects. |
| `toolCalls` | array | Present on `assistant` messages if the model decided to call tools. |
| `toolCallId` | string | Required for `tool` role messages, specifying the ID of the tool call being responded to. |

#### Example Usage (TypeScript)

```typescript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  url: "https://your-aigne-hub-url/api/v2/chat",
  accessKey: "your-user-access-key",
  model: "openai/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: "Hello, what is AIGNE Hub?",
});

console.log(result);
```

#### Response Object

The response includes the generated message, model information, and detailed usage metrics, including the cost in AIGNE Hub credits.

```json
{
  "id": "chatcmpl-xxxxxxxx",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "openai/gpt-3.5-turbo",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "AIGNE Hub is a unified AI gateway..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 20,
    "total_tokens": 28,
    "aigneHubCredits": 0.0015
  }
}
```

### Endpoint: Image Generation

This endpoint generates images from a text prompt.

- **Endpoint**: `POST /api/v2/image/generations`
- **AIGNE Native Endpoint**: `POST /api/v2/image`

#### Request Body

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `model` | string | The model to use for image generation (e.g., `openai/dall-e-3`). | Yes |
| `prompt` | string | A text description of the desired image(s). | Yes |
| `n` | integer | The number of images to generate. Defaults to 1. Max 10. | No |
| `size` | string | The size of the generated images (e.g., `1024x1024`, `1792x1024`). | No |
| `quality` | string | The quality of the image. `standard` or `hd`. | No |
| `style` | string | The style of the generated images. `vivid` or `natural`. | No |
| `responseFormat` | string | The format in which the generated images are returned. `url` or `b64_json`. | No |

#### Response Object

```json
{
  "created": 1689989552,
  "data": [
    {
      "url": "https://..."
    },
    {
      "url": "https://..."
    }
  ],
  "model": "openai/dall-e-3",
  "usage": {
    "aigneHubCredits": 0.080
  }
}
```

### Endpoint: Embeddings

This endpoint creates a vector representation of a given input that can be used for semantic search, clustering, and other machine learning tasks.

- **Endpoint**: `POST /api/v2/embeddings`

#### Request Body

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `model` | string | The model to use for creating embeddings (e.g., `openai/text-embedding-ada-002`). | Yes |
| `input` | string or array | The input text or tokens to embed. Can be a single string or an array of strings/tokens. | Yes |

#### Response Object

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.0069292834,
        -0.005336422,
        ...
      ],
      "index": 0
    }
  ],
  "model": "openai/text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 5,
    "total_tokens": 5
  }
}
```

---

## System Operations and Reliability

For DevOps and SREs, understanding the system's operational behavior is key to maintaining a reliable service.

### Automatic Retries

The API gateway includes a built-in retry mechanism to handle transient failures from downstream AI providers. This improves the overall reliability of requests without requiring client-side retry logic.

- **Triggering Status Codes**: Retries are automatically attempted if the downstream service returns one of the following HTTP status codes:
  - `429 (Too Many Requests)`
  - `500 (Internal Server Error)`
  - `502 (Bad Gateway)`
- **Configuration**: The system is configured with a default `maxRetries` value. If a request fails with one of the above codes, it will be retried up to this maximum number of times before returning an error to the client. This logic is implemented in the `createRetryHandler` function.

### Billing and Usage Tracking

AIGNE Hub's V2 API is tightly integrated with a credit-based billing system. This system is crucial for monitoring costs, enforcing quotas, and managing user access in both enterprise and service-provider deployments.

- **Credit Check**: Before processing any V2 API request, the system calls `checkUserCreditBalance` to ensure the authenticated user has sufficient credits to perform the operation. If the balance is insufficient, the request is rejected with an error.
- **Usage Reporting**: Upon successful completion of an API call, the system calculates the cost of the operation based on the model used, tokens processed, or images generated. The `createUsageAndCompleteModelCall` function records this usage and deducts the corresponding amount from the user's credit balance.
- **Response Metadata**: For transparency, API responses for chat and image generation include an `aigneHubCredits` field within the `usage` object. This field shows the exact cost of that specific transaction, allowing clients to track their consumption in real-time.