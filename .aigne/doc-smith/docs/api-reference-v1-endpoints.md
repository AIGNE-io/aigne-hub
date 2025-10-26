# V1 Endpoints (Legacy)

This section provides documentation for the legacy V1 API endpoints. These endpoints are maintained to support older integrations and ensure backward compatibility. For all new development, it is strongly recommended to use the [V2 Endpoints](./api-reference-v2-endpoints.md), which offer enhanced features, including user-level authentication and credit-based billing.

All V1 endpoints require authentication. Requests must include an `Authorization` header with a Bearer token.

---

## Chat Completions

This endpoint generates a response for the given conversation. It supports both streaming and non-streaming modes.

**Endpoint**

```
POST /api/v1/chat/completions
```

### Request Body

The request body must be a JSON object with the following parameters.

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="gpt-3.5-turbo">
    <x-field-desc markdown>ID of the model to use. See the model endpoint compatibility table for details on which models work with the Chat API.</x-field-desc>
  </x-field>
  <x-field data-name="messages" data-type="array" data-required="true">
    <x-field-desc markdown>A list of messages comprising the conversation so far.</x-field-desc>
    <x-field data-name="role" data-type="string" data-required="true">
       <x-field-desc markdown>The role of the messages author. Must be one of `system`, `user`, `assistant`, or `tool`.</x-field-desc>
    </x-field>
    <x-field data-name="content" data-type="string" data-required="true">
       <x-field-desc markdown>The contents of the message.</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-required="false" data-default="false">
    <x-field-desc markdown>If set, partial message deltas will be sent, like in ChatGPT. Tokens will be sent as data-only server-sent events as they become available, with the stream terminated by a `data: [DONE]` message.</x-field-desc>
  </x-field>
  <x-field data-name="temperature" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.</x-field-desc>
  </x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false">
    <x-field-desc markdown>The maximum number of tokens to generate in the chat completion.</x-field-desc>
  </x-field>
  <x-field data-name="topP" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.</x-field-desc>
  </x-field>
  <x-field data-name="presencePenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.</x-field-desc>
  </x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.</x-field-desc>
  </x-field>
</x-field-group>

### Example Request

```bash Request Example
curl -X POST \
  https://your-hub-url.com/api/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": "Hello, who are you?"
            }
        ]
      }'
```

### Example Response (Non-streaming)

```json Response
{
  "role": "assistant",
  "text": "I am a large language model, trained by Google.",
  "content": "I am a large language model, trained by Google.",
  "usage": {
    "inputTokens": 8,
    "outputTokens": 9,
    "aigneHubCredits": 0.00012
  }
}
```

---

## Embeddings

This endpoint creates an embedding vector representing the input text.

**Endpoint**

```
POST /api/v1/embeddings
```

### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>ID of the model to use for creating embeddings.</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>Input text to embed, encoded as a string or array of tokens. To embed multiple inputs in a single request, pass an array of strings.</x-field-desc>
  </x-field>
</x-field-group>

### Example Request

```bash Request Example
curl -X POST \
  https://your-hub-url.com/api/v1/embeddings \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "text-embedding-ada-002",
        "input": "The food was delicious and the waiter..."
      }'
```

### Example Response

```json Response
{
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.006929283495992422,
        -0.005336422473192215,
        ...
        -4.547132266452536e-05
      ],
      "index": 0
    }
  ]
}
```

---

## Image Generation

This endpoint generates an image based on a text prompt.

**Endpoint**

```
POST /api/v1/image/generations
```

### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>The model to use for image generation.</x-field-desc>
  </x-field>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>A text description of the desired image(s). The maximum length is model-dependent.</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>The number of images to generate. Must be between 1 and 10.</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false">
    <x-field-desc markdown>The size of the generated images. Must be one of `256x256`, `512x512`, or `1024x1024` for DALL·E 2. Must be one of `1024x1024`, `1792x1024`, or `1024x1792` for DALL·E 3 models.</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false">
    <x-field-desc markdown>The format in which the generated images are returned. Must be one of `url` or `b64_json`.</x-field-desc>
  </x-field>
</x-field-group>

### Example Request

```bash Request Example
curl -X POST \
  https://your-hub-url.com/api/v1/image/generations \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "dall-e-3",
        "prompt": "A cute corgi wearing a space suit",
        "n": 1,
        "size": "1024x1024"
      }'
```

### Example Response

```json Response
{
  "images": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/..."
    }
  ],
  "data": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/..."
    }
  ],
  "model": "dall-e-3",
  "usage": {
    "aigneHubCredits": 0.04
  }
}
```

---

## Audio Transcriptions

This endpoint transcribes audio into the input language. It acts as a proxy to the upstream provider's service.

**Endpoint**

```
POST /api/v1/audio/transcriptions
```

### Request Body

The request body should be a `multipart/form-data` object containing the audio file and model name. This endpoint proxies directly to `api.openai.com/v1/audio/transcriptions`, and you should refer to the [official OpenAI documentation](https://platform.openai.com/docs/api-reference/audio/createTranscription) for detailed parameter specifications.

### Example Request

```bash Request Example
curl -X POST \
  https://your-hub-url.com/api/v1/audio/transcriptions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F file="@/path/to/your/audio.mp3" \
  -F model="whisper-1"
```

### Response

The response format will be identical to the one returned by the OpenAI Audio API for transcriptions.

---

## Audio Speech

This endpoint generates audio from an input text. It acts as a proxy to the upstream provider's service.

**Endpoint**

```
POST /api/v1/audio/speech
```

### Request Body

The request body should be a JSON object. This endpoint proxies directly to `api.openai.com/v1/audio/speech`, and you should refer to the [official OpenAI documentation](https://platform.openai.com/docs/api-reference/audio/createSpeech) for detailed parameter specifications.

### Example Request

```bash Request Example
curl -X POST \
  https://your-hub-url.com/api/v1/audio/speech \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "tts-1",
        "input": "The quick brown fox jumped over the lazy dog.",
        "voice": "alloy"
      }' \
  --output speech.mp3
```

### Response

The response will be the generated audio file in the format specified by the request (e.g., MP3).

---

## Summary

This guide has detailed the legacy V1 API endpoints available in AIGNE Hub. While functional, these endpoints may not receive new features. We encourage you to migrate to the [V2 Endpoints](./api-reference-v2-endpoints.md) to take advantage of the latest improvements and ensure long-term compatibility. For details on API security and authentication, please refer to the [Authentication](./api-reference-authentication.md) section.