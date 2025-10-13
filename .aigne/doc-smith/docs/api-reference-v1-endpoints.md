# V1 Endpoints (Legacy)

This section provides documentation for the legacy V1 API endpoints. These endpoints are maintained for backward compatibility with older integrations. For all new projects, we strongly recommend using the more feature-rich and robust [V2 Endpoints](./api-reference-v2-endpoints.md).

The V1 endpoints are designed primarily for server-to-server or component-to-component communication and require administrative privileges for access.

## Status

Checks the availability and configuration status of the AI providers.

`GET /api/v1/status`

**Description**

This endpoint verifies if there are any configured and active OpenAI API keys in the system. It's a simple way to health-check the service's connection to the underlying AI provider.

**Authentication**

This endpoint requires an authenticated request from a component with admin privileges.

**Example Request**

```bash Requesting Status icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-instance.com/api/v1/status' \
--header 'Authorization: Bearer YOUR_COMPONENT_TOKEN'
```

**Example Response**

```json Response Body
{
  "available": true
}
```

## Chat Completions

Generates a response for the given conversation.

`POST /api/v1/chat/completions`

**Description**

This endpoint processes chat completion requests, forwarding them to the appropriate AI model. It supports both standard and streaming responses. For V1, it performs a subscription check if an `appId` is associated with the request.

**Request Body**

<x-field-group>
  <x-field data-name="model" data-type="string" data-default="gpt-3.5-turbo" data-desc="The ID of the model to use for the completion."></x-field>
  <x-field data-name="messages" data-type="array" data-desc="A list of messages comprising the conversation so far. Either `messages` or `prompt` must be provided.">
    <x-field data-name="role" data-type="string" data-required="true" data-desc="The role of the message author. Can be `system`, `user`, `assistant`, or `tool`."></x-field>
    <x-field data-name="content" data-type="string | array" data-required="true" data-desc="The content of the message."></x-field>
  </x-field>
  <x-field data-name="prompt" data-type="string" data-desc="A string prompt, as an alternative to `messages`. This will be treated as a single user message."></x-field>
  <x-field data-name="stream" data-type="boolean" data-default="false" data-desc="If set to true, partial message deltas will be sent as server-sent events."></x-field>
  <x-field data-name="temperature" data-type="number" data-default="1" data-desc="Controls randomness. Lower values make the model more deterministic."></x-field>
  <x-field data-name="topP" data-type="number" data-default="1" data-desc="Nucleus sampling parameter."></x-field>
  <x-field data-name="maxTokens" data-type="number" data-desc="The maximum number of tokens to generate in the completion."></x-field>
  <x-field data-name="presencePenalty" data-type="number" data-default="0" data-desc="Penalizes new tokens based on whether they appear in the text so far."></x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-default="0" data-desc="Penalizes new tokens based on their existing frequency in the text so far."></x-field>
</x-field-group>

**Example Request**

```bash Chat Completions Request icon=lucide:terminal
curl -X POST 'https://your-aigne-hub-instance.com/api/v1/chat/completions' \
--header 'Authorization: Bearer YOUR_COMPONENT_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, what is AIGNE Hub?"
    }
  ]
}'
```

**Example Response (Non-Streaming)**

The `usage` object in the response is augmented with `aigneHubCredits`, which reflects the cost calculated by the Hub's billing system.

```json Response Body
{
  "role": "assistant",
  "content": "AIGNE Hub is a unified AI gateway designed to centralize access to various AI models, manage credentials, track usage, and handle billing.",
  "text": "AIGNE Hub is a unified AI gateway designed to centralize access to various AI models, manage credentials, track usage, and handle billing.",
  "usage": {
    "inputTokens": 15,
    "outputTokens": 30,
    "aigneHubCredits": 0.00006
  }
}
```

## Embeddings

Creates an embedding vector representing the input text.

`POST /api/v1/embeddings`

**Description**

This endpoint generates vector embeddings for a given input string or array of tokens. These embeddings can be used for tasks like semantic search, clustering, and classification.

**Request Body**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The ID of the model to use for creating embeddings."></x-field>
  <x-field data-name="input" data-type="string | array" data-required="true" data-desc="The input text or tokens to embed."></x-field>
</x-field-group>

**Example Request**

```bash Embeddings Request icon=lucide:terminal
curl -X POST 'https://your-aigne-hub-instance.com/api/v1/embeddings' \
--header 'Authorization: Bearer YOUR_COMPONENT_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "text-embedding-ada-002",
  "input": "AIGNE Hub is a unified AI gateway."
}'
```

**Example Response**

```json Response Body
{
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
  ]
}
```

## Image Generation

Creates an image given a prompt.

`POST /api/v1/image/generations`

**Description**

This endpoint generates images based on a textual description. It supports various models and parameters to control the output.

**Request Body**

<x-field-group>
  <x-field data-name="model" data-type="string" data-default="dall-e-2" data-desc="The model to use for image generation."></x-field>
  <x-field data-name="prompt" data-type="string" data-required="true" data-desc="A text description of the desired image(s)."></x-field>
  <x-field data-name="n" data-type="number" data-default="1" data-desc="The number of images to generate (1-10)."></x-field>
  <x-field data-name="size" data-type="string" data-desc="The size of the generated images (e.g., '1024x1024', '512x512')."></x-field>
  <x-field data-name="responseFormat" data-type="string" data-desc="The format in which the generated images are returned. Can be `url` or `b64_json`."></x-field>
</x-field-group>

**Example Request**

```bash Image Generation Request icon=lucide:terminal
curl -X POST 'https://your-aigne-hub-instance.com/api/v1/image/generations' \
--header 'Authorization: Bearer YOUR_COMPONENT_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "dall-e-2",
  "prompt": "A cute robot mascot for an AI gateway",
  "n": 1,
  "size": "512x512",
  "responseFormat": "url"
}'
```

**Example Response**

```json Response Body
{
  "images": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/...."
    }
  ],
  "data": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/...."
    }
  ],
  "model": "dall-e-2",
  "usage": {
    "aigneHubCredits": 160
  }
}
```

## Audio Transcriptions

Transcribes audio into the input language.

`POST /api/v1/audio/transcriptions`

**Description**

This endpoint is a direct proxy to the OpenAI `/v1/audio/transcriptions` API. AIGNE Hub forwards the request after injecting the appropriate API key. The request body and response format are identical to the official OpenAI API.

Refer to the [OpenAI API documentation](https://platform.openai.com/docs/api-reference/audio/createTranscription) for detailed information on parameters and responses.

## Audio Speech

Generates audio from the input text.

`POST /api/v1/audio/speech`

**Description**

This endpoint is a direct proxy to the OpenAI `/v1/audio/speech` API. AIGNE Hub forwards the request after injecting the appropriate API key. The request body and response format are identical to the official OpenAI API.

Refer to the [OpenAI API documentation](https://platform.openai.com/docs/api-reference/audio/createSpeech) for detailed information on parameters and responses.