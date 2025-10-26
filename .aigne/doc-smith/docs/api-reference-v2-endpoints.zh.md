# V2 端点 (推荐)

V2 API 提供了一套全面的端点，用于通过 AIGNE Hub 与各种 AI 模型进行交互。这些端点是当前的标准，推荐用于所有新的集成。它们的设计旨在实现健壮性和功能丰富性，提供用户级身份验证、可选的基于积分的计费检查以及详细的使用情况跟踪。

这些端点充当统一网关，抽象了与不同 AI 提供商交互的复杂性。通过 AIGNE Hub 路由请求，您可以对 AI 模型的使用情况进行集中控制、监控和保护。

有关 API 身份验证的详细信息，请参阅 [身份验证](./api-reference-authentication.md) 指南。有关旧版端点的信息，请参阅 [V1 端点 (旧版)](./api-reference-v1-endpoints.md) 文档。

## API 端点参考

以下各节提供了每个可用 V2 端点的详细规格。所有请求都需要 `Authorization: Bearer <TOKEN>` 标头进行身份验证。

### GET /status

该端点用于检查 AIGNE Hub 服务的可用性，并可选择性地检查特定模型的可用性。它会验证所需的 AI 提供商是否已配置、启用并拥有有效的凭据。如果启用了基于积分的计费，它还会检查用户的余额和模型的费率配置。

**查询参数**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="要检查可用性的特定模型，格式为 provider/model-name (例如，openai/gpt-4o-mini)。"></x-field>
</x-field-group>

**请求示例**

```bash 检查特定模型的可用性 icon=lucide:terminal
curl --location --request GET 'https://your-aigne-hub-instance.com/api/v2/status?model=openai/gpt-4o-mini' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>'
```

**响应示例 (成功)**

```json icon=lucide:braces
{
  "available": true
}
```

**响应示例 (失败)**

```json icon=lucide:braces
{
  "available": false,
  "error": "Model rate not available"
}
```

### POST /chat/completions

该端点根据一系列消息从聊天模型生成响应。它旨在与 OpenAI Chat Completions API 格式兼容，使其能直接替代 OpenAI 的直接集成。它同时支持标准响应和流式响应。

**请求体**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="要使用的模型的标识符 (例如，openai/gpt-4o-mini, google/gemini-1.5-pro-latest)。"></x-field>
  <x-field data-name="messages" data-type="array" data-required="true" data-desc="代表对话历史的消息对象数组。">
    <x-field data-name="role" data-type="string" data-required="true" data-desc="消息作者的角色。可以是 'system'、'user'、'assistant' 或 'tool'。"></x-field>
    <x-field data-name="content" data-type="string | array" data-required="true" data-desc="消息的内容。可以是字符串或用于多部分消息（例如文本和图像）的数组。"></x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-default="false" data-required="false" data-desc="如果设置为 true，响应将在生成时以数据块的形式流式传回。"></x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false" data-desc="在补全中生成的最大 token 数。"></x-field>
  <x-field data-name="temperature" data-type="number" data-default="1" data-required="false" data-desc="控制随机性。值越低，模型越确定。范围：0.0 到 2.0。"></x-field>
  <x-field data-name="topP" data-type="number" data-default="1" data-required="false" data-desc="核心采样参数。模型会考虑概率质量为 topP 的 token。范围：0.0 到 1.0。"></x-field>
  <x-field data-name="presencePenalty" data-type="number" data-default="0" data-required="false" data-desc="根据新 token 是否已在文本中出现来进行惩罚。范围：-2.0 到 2.0。"></x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-default="0" data-required="false" data-desc="根据新 token 在文本中已有的频率来进行惩罚。范围：-2.0 到 2.0。"></x-field>
  <x-field data-name="tools" data-type="array" data-required="false" data-desc="模型可以调用的工具列表。目前只支持函数。"></x-field>
  <x-field data-name="toolChoice" data-type="string | object" data-required="false" data-desc="控制模型调用哪个工具。可以是 'none'、'auto'、'required' 或特定函数。"></x-field>
</x-field-group>

**请求示例**

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

**响应示例 (非流式)**

```json icon=lucide:braces
{
  "role": "assistant",
  "text": "The capital of France is Paris.",
  "content": "The capital of France is Paris."
}
```

**响应示例 (流式)**

当 `stream` 为 `true` 时，服务器以 `text/event-stream` 格式响应。

```text 服务器发送事件 icon=lucide:file-text
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

该端点为给定的输入文本创建向量嵌入，可用于语义搜索、聚类和分类等任务。

**请求体**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="要使用的嵌入模型的标识符 (例如，openai/text-embedding-3-small)。"></x-field>
  <x-field data-name="input" data-type="string | array" data-required="true" data-desc="要嵌入的输入文本。可以是一个字符串或一个字符串数组。"></x-field>
</x-field-group>

**请求示例**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/embeddings' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
}'
```

**响应示例**

```json icon=lucide:braces
{
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.008922631,
        0.011883527,
        // ... 更多浮点数
        -0.013459821
      ],
      "index": 0
    }
  ]
}
```

### POST /image/generations

该端点使用指定的图像模型根据文本提示生成图像。

**请求体**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="要使用的图像生成模型的标识符 (例如，openai/dall-e-3)。"></x-field>
  <x-field data-name="prompt" data-type="string" data-required="true" data-desc="对所需图像的详细文本描述。"></x-field>
  <x-field data-name="n" data-type="integer" data-default="1" data-required="false" data-desc="要生成的图像数量。必须在 1 到 10 之间。"></x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-desc="生成图像的尺寸。支持的值取决于模型 (例如，'1024x1024', '1792x1024')。"></x-field>
  <x-field data-name="quality" data-type="string" data-default="standard" data-required="false" data-desc="图像的质量。支持的值为 'standard' 和 'hd'。"></x-field>
  <x-field data-name="style" data-type="string" data-default="vivid" data-required="false" data-desc="生成图像的风格。支持的值为 'vivid' 和 'natural'。"></x-field>
  <x-field data-name="responseFormat" data-type="string" data-default="url" data-required="false" data-desc="返回生成图像的格式。必须是 'url' 或 'b64_json' 之一。"></x-field>
</x-field-group>

**请求示例**

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

**响应示例**

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

### 音频端点

AIGNE Hub 提供用于音频处理的端点，目前这些端点会将请求代理到 OpenAI API。这些端点与基于积分的计费系统的完全集成正在开发中。

#### POST /audio/transcriptions

将音频转录为输入语言。

#### POST /audio/speech

根据输入文本生成音频。

对于这两个音频端点，请求和响应格式与 OpenAI V1 API 的音频转录和语音生成接口相同。有关所需参数的详细信息，请参阅 OpenAI 官方文档。AIGNE Hub 将在转发请求前安全地注入提供商所需的 API 密钥。