# V2 Endpoints (Recommended)

The V2 API provides a comprehensive set of endpoints for interacting with various AI models through AIGNE Hub. These endpoints are the current standard and are recommended for all new integrations. They are designed to be robust and feature-rich, offering user-level authentication, optional credit-based billing checks, and detailed usage tracking.

These endpoints act as a unified gateway, abstracting the complexities of interacting with different AI providers. By routing requests through AIGNE Hub, you gain centralized control, monitoring, and security over your AI model usage.

For details on authenticating with the API, please refer to the [Authentication](./api-reference-authentication.md) guide. For information on legacy endpoints, see the [V1 Endpoints (Legacy)](./api-reference-v1-endpoints.md) documentation.

## API Endpoint Reference

The following sections provide detailed specifications for each available V2 endpoint. All requests require an `Authorization: Bearer <TOKEN>` header for authentication.

### GET /status

This endpoint checks the availability of the AIGNE Hub service and, optionally, a specific model. It verifies that the required AI providers are configured, enabled, and have active credentials. If credit-based billing is enabled, it also checks the user's balance and the model's rate configuration.

**Query Parameters**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="The specific model to check availability for, in the format provider/model-name (e.g., openai/gpt-4o-mini)."></x-field>
</x-field-group>

**Example Request**

```bash Check availability for a specific model icon=lucide:terminal
curl --location --request GET 'https://your-aigne-hub-instance.com/api/v2/status?model=openai/gpt-4o-mini' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>'
```

**Example Response (Success)**

```json icon=lucide:braces
{
  "available": true
}
```

**Example Response (Failure)**

```json icon=lucide:braces
{
  "available": false,
  "error": "Model rate not available"
}
```

### POST /chat/completions

This endpoint generates a response from a chat model based on a sequence of messages. It is designed to be compatible with the OpenAI Chat Completions API format, making it a straightforward replacement for direct OpenAI integrations. It supports both standard and streaming responses.

**Request Body**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The identifier for the model to use (e.g., openai/gpt-4o-mini, google/gemini-1.5-pro-latest)."></x-field>
  <x-field data-name="messages" data-type="array" data-required="true" data-desc="An array of message objects representing the conversation history.">
    <x-field data-name="role" data-type="string" data-required="true" data-desc="The role of the message author. Can be 'system', 'user', 'assistant', or 'tool'."></x-field>
    <x-field data-name="content" data-type="string | array" data-required="true" data-desc="The content of the message. This can be a string or an array for multi-part messages (e.g., text and images)."></x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-default="false" data-required="false" data-desc="If set to true, the response will be streamed back in chunks as they are generated."></x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false" data-desc="The maximum number of tokens to generate in the completion."></x-field>
  <x-field data-name="temperature" data-type="number" data-default="1" data-required="false" data-desc="Controls randomness. Lower values make the model more deterministic. Range: 0.0 to 2.0."></x-field>
  <x-field data-name="topP" data-type="number" data-default="1" data-required="false" data-desc="Nucleus sampling parameter. The model considers tokens with topP probability mass. Range: 0.0 to 1.0."></x-field>
  <x-field data-name="presencePenalty" data-type="number" data-default="0" data-required="false" data-desc="Penalizes new tokens based on whether they appear in the text so far. Range: -2.0 to 2.0."></x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-default="0" data-required="false" data-desc="Penalizes new tokens based on their existing frequency in the text so far. Range: -2.0 to 2.0."></x-field>
  <x-field data-name="tools" data-type="array" data-required="false" data-desc="A list of tools the model may call. Currently, only functions are supported."></x-field>
  <x-field data-name="toolChoice" data-type="string | object" data-required="false" data-desc="Controls which tool is called by the model. Can be 'none', 'auto', 'required', or a specific function."></x-field>
</x-field-group>

**Example Request**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/chat/completions' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/gpt-4o-mini",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Hello! What is the capital of France?"
        }
    ],
    "stream": false
}'
```

**Example Response (Non-Streaming)**

```json icon=lucide:braces
{
  "role": "assistant",
  "text": "The capital of France is Paris.",
  "content": "The capital of France is Paris."
}
```

**Example Response (Streaming)**

When `stream` is `true`, the server responds with a `text/event-stream`.

```text Server-Sent Events icon=lucide:file-text
data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":"The"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" capital"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" of"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" France"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" is"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" Paris"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":"."},"logprobs":null,"finish_reason":null}]}

data: {"object":"chat.completion.usage","usage":{"promptTokens":23,"completionTokens":7,"totalTokens":30,"aigneHubCredits":0.00000485,"modelCallId":"mca_..."},"model":"openai/gpt-4o-mini"}

data: [DONE]
```

### POST /embeddings

This endpoint creates vector embeddings for a given input text, which can be used for tasks like semantic search, clustering, and classification.

**Request Body**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The identifier for the embedding model to use (e.g., openai/text-embedding-3-small)."></x-field>
  <x-field data-name="input" data-type="string | array" data-required="true" data-desc="The input text to embed. It can be a single string or an array of strings."></x-field>
</x-field-group>

**Example Request**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/embeddings' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
}'
```

**Example Response**

```json icon=lucide:braces
{
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.008922631,
        0.011883527,
        // ... more floating point numbers
        -0.013459821
      ],
      "index": 0
    }
  ]
}
```

### POST /image/generations

This endpoint generates images from a text prompt using a specified image model.

**Request Body**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The identifier for the image generation model to use (e.g., openai/dall-e-3)."></x-field>
  <x-field data-name="prompt" data-type="string" data-required="true" data-desc="A detailed text description of the desired image(s)."></x-field>
  <x-field data-name="n" data-type="integer" data-default="1" data-required="false" data-desc="The number of images to generate. Must be between 1 and 10."></x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-desc="The size of the generated images. Supported values depend on the model (e.g., '1024x1024', '1792x1024')."></x-field>
  <x-field data-name="quality" data-type="string" data-default="standard" data-required="false" data-desc="The quality of the image. Supported values are 'standard' and 'hd'."></x-field>
  <x-field data-name="style" data-type="string" data-default="vivid" data-required="false" data-desc="The style of the generated images. Supported values are 'vivid' and 'natural'."></x-field>
  <x-field data-name="responseFormat" data-type="string" data-default="url" data-required="false" data-desc="The format in which the generated images are returned. Must be one of 'url' or 'b64_json'."></x-field>
</x-field-group>

**Example Request**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/image/generations' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/dall-e-3",
    "prompt": "A cute cat astronaut floating in space, digital art",
    "n": 1,
    "size": "1024x1024",
    "responseFormat": "url"
}'
```

**Example Response**

```json icon=lucide:braces
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

### Audio Endpoints

AIGNE Hub provides endpoints for audio processing, which currently proxy requests to the OpenAI API. Full integration with the credit-based billing system for these endpoints is under development.

#### POST /audio/transcriptions

Transcribes audio into the input language.

#### POST /audio/speech

Generates audio from an input text.

For both audio endpoints, the request and response formats are identical to the OpenAI V1 API for audio transcriptions and speech. Please refer to the official OpenAI documentation for details on the required parameters. The AIGNE Hub will securely inject the necessary API key for the provider before forwarding the request.