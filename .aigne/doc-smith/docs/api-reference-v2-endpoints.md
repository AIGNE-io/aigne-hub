# V2 Endpoints (Recommended)

The V2 API is the current and recommended interface for interacting with AIGNE Hub. These endpoints are designed to be largely compatible with the OpenAI API format while incorporating enhanced features like user-level authentication, credit-based billing, and detailed usage tracking.

All V2 endpoints require authentication. For details on how to acquire and use API tokens, please see the [Authentication](./api-reference-authentication.md) section. For backward compatibility with older integrations, refer to the [V1 Endpoints (Legacy)](./api-reference-v1-endpoints.md).

## Status Check

This endpoint allows you to verify the operational status of the AIGNE Hub service and check if a specific model is available and configured correctly.

`GET /api/v2/status`

### Query Parameters

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="The full model name (e.g., openai/gpt-4) to check for availability. If omitted, checks for any available provider."></x-field>
</x-field-group>

### Example Request

```bash Shell icon=mdi:bash
# Check general service availability
curl -X GET 'https://your-hub-url/api/v2/status' \
  -H 'Authorization: Bearer YOUR_API_TOKEN'

# Check availability for a specific model
curl -X GET 'https://your-hub-url/api/v2/status?model=openai/gpt-4' \
  -H 'Authorization: Bearer YOUR_API_TOKEN'
```

### Example Response

A successful response indicates that at least one AI provider is enabled and has active credentials.

```json Response icon=mdi:code-json
{
  "available": true
}
```

If the service or a specific model is unavailable, the response will indicate so, potentially with an error message.

```json Error Response icon=mdi:code-json
{
  "available": false,
  "error": "Model rate not available"
}
```

## Chat Completions

Creates a model response for the given chat conversation. This endpoint is compatible with the OpenAI Chat Completions API.

`POST /api/v2/chat/completions`

### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="ID of the model to use (e.g., `openai/gpt-4`)."></x-field>
  <x-field data-name="messages" data-type="array" data-required="true">
    <x-field-desc markdown>An array of message objects representing the conversation history.</x-field-desc>
    <x-field data-name="role" data-type="string" data-required="true" data-desc="The role of the message author. Can be `system`, `user`, `assistant`, or `tool`."></x-field>
    <x-field data-name="content" data-type="string | array" data-required="true" data-desc="The content of the message. Can be a string or an array for multi-modal inputs."></x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-default="false" data-required="false" data-desc="If set, partial message deltas will be sent as server-sent events. The stream terminates with a `data: [DONE]` message."></x-field>
  <x-field data-name="temperature" data-type="number" data-default="1" data-required="false" data-desc="Controls randomness. Higher values like 0.8 make the output more random, while lower values like 0.2 make it more deterministic. Range: 0.0 to 2.0."></x-field>
  <x-field data-name="max_tokens" data-type="integer" data-required="false" data-desc="The maximum number of tokens to generate in the completion."></x-field>
  <x-field data-name="tools" data-type="array" data-required="false" data-desc="A list of tools the model may call."></x-field>
  <x-field data-name="tool_choice" data-type="string | object" data-required="false" data-desc="Controls if and how the model uses tools."></x-field>
</x-field-group>

### Example Request

```bash Shell icon=mdi:bash
curl -X POST 'https://your-hub-url/api/v2/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai/gpt-4",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```

### Example Response (Non-Streaming)

If credit-based billing is enabled, the `usage` object will include the cost of the call in `aigneHubCredits`.

```json Response icon=mdi:code-json
{
  "id": "chatcmpl-xxxx",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4-0613",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello there! How can I assist you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 9,
    "total_tokens": 28,
    "aigneHubCredits": 0.00075,
    "modelCallId": "mc_xxxx"
  }
}
```

## Embeddings

Creates a vector embedding representing the given input text.

`POST /api/v2/embeddings`

### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="ID of the embedding model to use."></x-field>
  <x-field data-name="input" data-type="string | array" data-required="true" data-desc="The input text or tokens to embed, encoded as a string or an array of strings/tokens."></x-field>
</x-field-group>

### Example Request

```bash Shell icon=mdi:bash
curl -X POST 'https://your-hub-url/api/v2/embeddings' \
  -H 'Authorization: Bearer YOUR_API_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai/text-embedding-ada-002",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
```

### Example Response

```json Response icon=mdi:code-json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.006929283495992422,
        -0.005336422007530928,
        // ... more embedding values
        -0.024047505110502243
      ],
      "index": 0
    }
  ],
  "model": "text-embedding-ada-002-v2",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## Image Generation

Creates an image given a textual prompt.

`POST /api/v2/image/generations`

### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The model to use for image generation (e.g., `openai/dall-e-3`)."></x-field>
  <x-field data-name="prompt" data-type="string" data-required="true" data-desc="A text description of the desired image(s)."></x-field>
  <x-field data-name="n" data-type="integer" data-default="1" data-required="false" data-desc="The number of images to generate. Must be between 1 and 10."></x-field>
  <x-field data-name="size" data-type="string" data-default="1024x1024" data-required="false" data-desc="The size of the generated images (e.g., `1024x1024`, `1792x1024`)."></x-field>
  <x-field data-name="quality" data-type="string" data-default="standard" data-required="false" data-desc="The quality of the image. `hd` creates more detailed images."></x-field>
  <x-field data-name="style" data-type="string" data-default="vivid" data-required="false" data-desc="The style of the generated images. Can be `vivid` or `natural`."></x-field>
  <x-field data-name="response_format" data-type="string" data-default="url" data-required="false" data-desc="The format in which the generated images are returned. Must be `url` or `b64_json`."></x-field>
</x-field-group>

### Example Request

```bash Shell icon=mdi:bash
curl -X POST 'https://your-hub-url/api/v2/image/generations' \
  -H 'Authorization: Bearer YOUR_API_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai/dall-e-3",
    "prompt": "A cute corgi wearing a space helmet",
    "n": 1,
    "size": "1024x1024"
  }'
```

### Example Response

```json Response icon=mdi:code-json
{
  "created": 1689623456,
  "data": [
    {
      "url": "https://..."
    }
  ],
  "model": "dall-e-3",
  "usage": {
    "aigneHubCredits": 0.04
  }
}
```

## Audio Endpoints

AIGNE Hub provides proxy endpoints for audio services. These endpoints require user authentication but currently do not support credit-based billing. The request is forwarded directly to the underlying provider (e.g., OpenAI).

### Audio Transcriptions

Transcribes audio into the input language.

`POST /api/v2/audio/transcriptions`

This endpoint proxies to OpenAI's `/v1/audio/transcriptions` endpoint. Please refer to the official OpenAI documentation for request parameters.

### Text-to-Speech

Generates audio from the input text.

`POST /api/v2/audio/speech`

This endpoint proxies to OpenAI's `/v1/audio/speech` endpoint. Please refer to the official OpenAI documentation for request parameters.
