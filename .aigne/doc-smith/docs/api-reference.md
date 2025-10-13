# API Reference

The AIGNE Hub API provides a unified and secure gateway to access over 10 leading AI providers through a single interface. This reference offers a detailed technical overview of authentication mechanisms, available endpoints, and request/response specifications to facilitate seamless integration with your applications.

For comprehensive details on specific versions and authentication, please refer to the following sections:
- [Authentication](./api-reference-authentication.md): Learn how to secure your API requests.
- [V2 Endpoints (Recommended)](./api-reference-v2-endpoints.md): The current standard for new integrations, offering advanced features.
- [V1 Endpoints (Legacy)](./api-reference-v1-endpoints.md): Maintained for backward compatibility.

## Authentication

All API requests to AIGNE Hub must be authenticated using a Bearer token. Include your access key in the `Authorization` header with every request.

```bash Authorization Header icon=lucide:key-round
Authorization: Bearer YOUR_ACCESS_KEY
```

## Endpoints Overview

AIGNE Hub exposes a set of RESTful endpoints for various AI tasks. The API is versioned to ensure stability, with `V2` being the current and recommended version.

Here is a summary of the primary endpoints available:

| Endpoint | Method | Description |
|---|---|---|
| `/api/v2/chat` | POST | Handles chat completions with various models. |
| `/api/v2/images` | POST | Manages image generation requests. |
| `/api/v2/embeddings` | POST | Generates text embeddings for natural language processing tasks. |
| `/api/v2/models` | GET | Retrieves a list of available models configured in the hub. |
| `/api/v2/usage` | GET | Fetches usage statistics for monitoring and billing. |

### Direct API Usage Examples

Here are a couple of quick examples using `curl` to interact with the V2 endpoints.

#### Chat Completion

```bash Chat Completion Request icon=lucide:message-square-more
curl -X POST "https://your-hub.com/api/v2/chat" \
  -H "Authorization: Bearer YOUR_ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

#### Image Generation

```bash Image Generation Request icon=lucide:image
curl -X POST "https://your-hub.com/api/v2/images" \
  -H "Authorization: Bearer YOUR_ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/dall-e-3",
    "prompt": "A futuristic AI gateway",
    "size": "1024x1024"
  }'
```

## Dive Deeper

For complete specifications, including detailed request parameters and response schemas, explore the dedicated API documentation sections.

<x-cards data-columns="3">
  <x-card data-title="Authentication" data-icon="lucide:key-round" data-href="/api-reference/authentication">
    Learn how to authenticate your API requests using Bearer tokens to ensure secure access.
  </x-card>
  <x-card data-title="V2 Endpoints" data-icon="lucide:milestone" data-href="/api-reference/v2-endpoints">
    Explore the current and recommended API endpoints for all new integrations, supporting advanced features like user-level billing.
  </x-card>
  <x-card data-title="V1 Endpoints (Legacy)" data-icon="lucide:history" data-href="/api-reference/v1-endpoints">
    Find documentation for legacy V1 endpoints to support and maintain older integrations.
  </x-card>
</x-cards>