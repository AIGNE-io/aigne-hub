# API Reference

This document provides a detailed reference for the AIGNE Hub API, focusing on its architecture, endpoints, and operational behavior. It is intended for DevOps, SRE, and infrastructure teams responsible for deploying and managing the service.

## System Architecture

The AIGNE Hub API is designed as a robust, multi-provider gateway for various AI services. It provides a unified interface for chat completions, embeddings, and image generation, while abstracting the complexity of managing different underlying AI providers.

### Provider Abstraction and Credential Management

A core design principle of the API is its ability to connect with multiple AI providers (e.g., OpenAI, Bedrock) seamlessly. This is achieved through a provider abstraction layer.

-   **Dynamic Credential Loading**: The system dynamically loads credentials for different providers from a secure store. When a request specifies a model (e.g., `openai/gpt-4`), the API identifies the provider (`openai`) and retrieves the necessary credentials.
-   **Credential Rotation**: The API supports multiple credentials for a single provider and automatically rotates them. It uses a `getNextAvailableCredential` strategy to cycle through active credentials, enhancing both security and availability. This allows for rate limit distribution and zero-downtime key rotation.
-   **Configuration**: AI providers and their credentials are managed within the system's database via the `AiProvider` and `AiCredential` models. This allows administrators to add, disable, or update provider details without code changes.

### Resiliency and Error Handling

To ensure high availability, the API incorporates an automatic retry mechanism for upstream provider requests.

-   **Retry Logic**: The system uses a `createRetryHandler` for critical endpoints. If a request to an underlying AI provider fails with a retryable status code (`429 Too Many Requests`, `500 Internal Server Error`, `502 Bad Gateway`), the API will automatically retry the request.
-   **Configurability**: The maximum number of retries is configurable via the `maxRetries` environment variable, allowing operators to tune the system's resiliency according to their needs.

### Authentication

API endpoints are protected by a component-based authentication mechanism (`ensureRemoteComponentCall` and `ensureComponentCall`). This ensures that only authorized services or components within the ecosystem can access the API, typically using a public key-based verification system.

## Endpoints

The following sections detail the available API endpoints. All endpoints are prefixed with `/v1`.

---

### Chat Completions

This endpoint generates a response for a given chat conversation or prompt. It supports both standard and streaming responses.

`POST /v1/chat/completions`
`POST /v1/completions`

**Request Body**

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `model` | string | The ID of the model to use (e.g., `openai/gpt-4`, `google/gemini-pro`). | Yes |
| `messages` | array | An array of message objects representing the conversation history. See object structure below. | Yes (or `prompt`) |
| `prompt` | string | A single prompt string. Shorthand for `messages: [{ "role": "user", "content": "..." }]`. | Yes (or `messages`) |
| `stream` | boolean | If `true`, the response will be sent as a server-sent event stream. | No |
| `temperature` | number | Controls randomness. A value between 0 and 2. Higher values make the output more random. | No |
| `topP` | number | Nucleus sampling. A value between 0.1 and 1. The model considers tokens with `topP` probability mass. | No |
| `maxTokens` | integer | The maximum number of tokens to generate in the completion. | No |
| `presencePenalty` | number | A value between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far. | No |
| `frequencyPenalty` | number | A value between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far. | No |
| `tools` | array | A list of tools the model may call. | No |
| `toolChoice` | string or object | Controls which tool the model should use. Can be "none", "auto", "required", or specify a function. | No |
| `responseFormat` | object | Specifies the output format. For JSON mode, use `{ "type": "json_object" }`. | No |

**Message Object Structure** (`messages` array)

| Field | Type | Description |
| :--- | :--- | :--- |
| `role` | string | The role of the message author. One of `system`, `user`, `assistant`, or `tool`. |
| `content` | string or array | The content of the message. Can be a string or an array for multi-modal input (e.g., text and images). |
| `toolCalls` | array | For `assistant` roles, a list of tool calls made by the model. |
| `toolCallId` | string | For `tool` roles, the ID of the tool call this message is a response to. |

**Response (Non-Streaming)**

-   `Content-Type: application/json`
-   The response is a JSON object containing the assistant's reply.

```json
{
  "role": "assistant",
  "content": "This is the generated response.",
  "text": "This is the generated response.",
  "toolCalls": [],
  "usage": {
    "promptTokens": 5,
    "completionTokens": 10,
    "totalTokens": 15,
    "aigneHubCredits": 0.00015
  }
}
```

**Response (Streaming)**

-   `Content-Type: text/event-stream`
-   The response is a stream of server-sent events. Each event is a JSON object representing a chunk of the completion. The final event may contain usage statistics.

---

### Embeddings

This endpoint creates a vector representation of a given input, which can be used for semantic search, clustering, and other machine learning tasks.

`POST /v1/embeddings`

**Request Body**

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `model` | string | The ID of the embedding model to use (e.g., `openai/text-embedding-ada-002`). | Yes |
| `input` | string or array | The input text or tokens to embed. Can be a single string or an array of strings/tokens. | Yes |

**Response**

-   `Content-Type: application/json`
-   The response contains the embedding data and usage information.

```json
{
  "data": [
    {
      "embedding": [ -0.00692, -0.0053, ... ],
      "index": 0,
      "object": "embedding"
    }
  ],
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

---

### Image Generation

This endpoint generates images from a text prompt.

`POST /v1/image/generations`

**Request Body**

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `model` | string | The ID of the image generation model to use (e.g., `dall-e-2`, `dall-e-3`). | Yes |
| `prompt` | string | A text description of the desired image(s). | Yes |
| `n` | integer | The number of images to generate. Must be between 1 and 10. Defaults to 1. | No |
| `size` | string | The size of the generated images (e.g., `1024x1024`, `1792x1024`). | No |
| `responseFormat` | string | The format in which the generated images are returned. Can be `url` or `b64_json`. Defaults to `url`. | No |
| `quality` | string | The quality of the image to generate. Can be `standard` or `hd`. | No |

**Response**

-   `Content-Type: application/json`
-   The response contains URLs or base64-encoded JSON for the generated images, along with usage data.

```json
{
  "images": [
    { "url": "https://..." },
    { "b64Json": "..." }
  ],
  "data": [ /* same as images */ ],
  "model": "dall-e-3",
  "usage": {
    "aigneHubCredits": 0.04
  }
}
```

---

### Audio Services (Proxy)

The audio transcription and speech synthesis endpoints are direct proxies to the OpenAI v1 API. The AIGNE Hub API handles authentication by injecting the appropriate API key from its managed credential store before forwarding the request.

For request and response formats, please refer to the official OpenAI API documentation.

-   **Audio Transcriptions**: `POST /v1/audio/transcriptions`
-   **Audio Speech**: `POST /v1/audio/speech`

---

### System Status

This endpoint provides a simple health check to verify that the service is running and has at least one AI provider API key configured.

`GET /v1/status`

**Response**

-   `Content-Type: application/json`

```json
{
  "available": true
}
```

-   `available`: A boolean indicating if one or more API keys are configured and available for use.