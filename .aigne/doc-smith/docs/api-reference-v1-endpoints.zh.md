# API 参考

本文档为 AIGNE Hub API 提供了详细的参考，重点介绍其架构、端点和操作行为。本文档面向负责部署和管理该服务的 DevOps、SRE 和基础设施团队。

## 系统架构

AIGNE Hub API 被设计为一个强大的、支持多供应商的网关，适用于各种 AI 服务。它为聊天补全、嵌入和图像生成提供了统一的接口，同时抽象了管理不同底层 AI 供应商的复杂性。

### 供应商抽象与凭证管理

该 API 的一个核心设计原则是其能够无缝连接多个 AI 供应商（例如 OpenAI、Bedrock）。这是通过一个供应商抽象层实现的。

-   **动态凭证加载**：系统从一个安全存储中动态加载不同供应商的凭证。当请求指定一个模型（例如 `openai/gpt-4`）时，API 会识别出供应商（`openai`）并检索必要的凭证。
-   **凭证轮换**：API 支持单个供应商的多个凭证，并自动进行轮换。它使用 `getNextAvailableCredential` 策略来循环使用活动凭证，从而增强了安全性和可用性。这使得速率限制得以分发，并实现了零停机密钥轮换。
-   **配置**：AI 供应商及其凭证通过 `AiProvider` 和 `AiCredential` 模型在系统数据库中进行管理。这使得管理员无需更改代码即可添加、禁用或更新供应商的详细信息。

### 弹性和错误处理

为确保高可用性，API 整合了针对上游供应商请求的自动重试机制。

-   **重试逻辑**：系统为关键端点使用 `createRetryHandler`。如果对底层 AI 供应商的请求失败并返回可重试的状态码（`429 Too Many Requests`、`500 Internal Server Error`、`502 Bad Gateway`），API 将自动重试该请求。
-   **可配置性**：最大重试次数可通过 `maxRetries` 环境变量进行配置，允许运维人员根据其需求调整系统的弹性。

### 身份验证

API 端点受基于组件的身份验证机制（`ensureRemoteComponentCall` 和 `ensureComponentCall`）保护。这确保了只有生态系统内经授权的服务或组件才能访问 API，通常使用基于公钥的验证系统。

## 端点

以下各节详细介绍了可用的 API 端点。所有端点都以 `/v1` 为前缀。

---

### 聊天补全

该端点为给定的聊天对话或提示生成响应。它同时支持标准响应和流式响应。

`POST /v1/chat/completions`
`POST /v1/completions`

**请求体**

| 字段 | 类型 | 描述 | 必需 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的模型的 ID（例如 `openai/gpt-4`、`google/gemini-pro`）。 | 是 |
| `messages` | array | 代表对话历史的消息对象数组。对象结构见下文。 | 是（或 `prompt`） |
| `prompt` | string | 单个提示字符串。是 `messages: [{ "role": "user", "content": "..." }]` 的简写形式。 | 是（或 `messages`） |
| `stream` | boolean | 如果为 `true`，响应将以服务器发送事件流的形式发送。 | 否 |
| `temperature` | number | 控制随机性。值介于 0 和 2 之间。值越高，输出越随机。 | 否 |
| `topP` | number | 核心采样。值介于 0.1 和 1 之间。模型会考虑概率质量为 `topP` 的词元。 | 否 |
| `maxTokens` | integer | 在补全中生成的最大词元数。 | 否 |
| `presencePenalty` | number | 值介于 -2.0 和 2.0 之间。正值会根据新词元是否已在文本中出现而来惩罚它们。 | 否 |
| `frequencyPenalty` | number | 值介于 -2.0 和 2.0 之间。正值会根据新词元在文本中已有的频率来惩罚它们。 | 否 |
| `tools` | array | 模型可能调用的工具列表。 | 否 |
| `toolChoice` | string or object | 控制模型应使用哪个工具。可以是 "none"、"auto"、"required"，或指定一个函数。 | 否 |
| `responseFormat` | object | 指定输出格式。对于 JSON 模式，使用 `{ "type": "json_object" }`。 | 否 |

**消息对象结构** (`messages` 数组)

| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `role` | string | 消息作者的角色。`system`、`user`、`assistant` 或 `tool` 之一。 |
| `content` | string or array | 消息的内容。可以是字符串或用于多模态输入的数组（例如文本和图像）。 |
| `toolCalls` | array | 对于 `assistant` 角色，模型进行的工具调用列表。 |
| `toolCallId` | string | 对于 `tool` 角色，此消息所响应的工具调用的 ID。 |

**响应（非流式）**

-   `Content-Type: application/json`
-   响应是一个包含助手回复的 JSON 对象。

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

**响应（流式）**

-   `Content-Type: text/event-stream`
-   响应是一个服务器发送事件流。每个事件都是一个代表补全内容块的 JSON 对象。最后一个事件可能包含使用情况统计信息。

---

### 嵌入

该端点为给定的输入创建一个向量表示，可用于语义搜索、聚类和其他机器学习任务。

`POST /v1/embeddings`

**请求体**

| 字段 | 类型 | 描述 | 必需 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的嵌入模型的 ID（例如 `openai/text-embedding-ada-002`）。 | 是 |
| `input` | string or array | 要嵌入的输入文本或词元。可以是单个字符串或字符串/词元数组。 | 是 |

**响应**

-   `Content-Type: application/json`
-   响应包含嵌入数据和使用情况信息。

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

### 图像生成

该端点根据文本提示生成图像。

`POST /v1/image/generations`

**请求体**

| 字段 | 类型 | 描述 | 必需 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的图像生成模型的 ID（例如 `dall-e-2`、`dall-e-3`）。 | 是 |
| `prompt` | string | 所需图像的文本描述。 | 是 |
| `n` | integer | 要生成的图像数量。必须在 1 到 10 之间。默认为 1。 | 否 |
| `size` | string | 生成图像的尺寸（例如 `1024x1024`、`1792x1024`）。 | 否 |
| `responseFormat` | string | 返回生成图像的格式。可以是 `url` 或 `b64_json`。默认为 `url`。 | 否 |
| `quality` | string | 要生成的图像质量。可以是 `standard` 或 `hd`。 | 否 |

**响应**

-   `Content-Type: application/json`
-   响应包含生成图像的 URL 或 base64 编码的 JSON，以及使用情况数据。

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

### 音频服务（代理）

音频转录和语音合成端点是 OpenAI v1 API 的直接代理。AIGNE Hub API 通过在转发请求前从其托管的凭证库中注入相应的 API 密钥来处理身份验证。

有关请求和响应格式，请参阅 OpenAI 官方 API 文档。

-   **音频转录**：`POST /v1/audio/transcriptions`
-   **音频语音**：`POST /v1/audio/speech`

---

### 系统状态

该端点提供一个简单的健康检查，以验证服务是否正在运行并且至少配置了一个 AI 供应商 API 密钥。

`GET /v1/status`

**响应**

-   `Content-Type: application/json`

```json
{
  "available": true
}
```

-   `available`：一个布尔值，指示是否配置了一个或多个 API 密钥并可供使用。