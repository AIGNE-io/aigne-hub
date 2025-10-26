# API 参考

AIGNE Hub 提供了一套功能强大的 RESTful API，可将 AI 功能集成到您的应用程序中。该 API 旨在成为一个统一的网关，以简化与各种底层 AI 提供商的交互。本文档为开发人员和网站可靠性工程师（SRE）提供了有关如何部署、集成和监控 API 端点的详细信息。

API 有两个可用版本。强烈建议所有新集成都使用 **V2 API**，因为它功能更丰富，与 AIGNE 框架保持一致，并支持基于积分的计费系统。

- **V2 API**：当前推荐所有用户使用的版本。它需要基于用户的身份验证，并与积分计费系统集成。
- **V1 API (旧版)**：一个已弃用的版本，主要用于内部组件间的通信。它依赖于一个更简单的订阅模型，功能有限。

---

## 身份验证

V1 和 V2 API 的身份验证处理方式不同，这反映了它们各自不同的使用场景。

### V2 身份验证：用户访问密钥

V2 API 专为最终用户和应用程序集成而设计。它使用一种基于会话的身份验证机制，其中每个经过身份验证的用户都有一个访问密钥。

- **机制**：客户端必须在请求中包含有效的访问密钥以进行身份验证。这通常通过 `Authorization` 标头或由 `@blocklet/sdk` 管理的会话 cookie 来完成。
- **用途**：所有 V2 端点（例如 `/api/v2/chat/completions`、`/api/v2/image`）都使用此方法。它确保所有 API 调用都与特定用户相关联，这对于准确的使用情况跟踪和基于积分的计费至关重要。

### V1 身份验证：组件调用

V1 API 用于 Blocklet 生态系统内不同组件之间的内部、服务器到服务器的通信。

- **机制**：V1 端点受 `ensureRemoteComponentCall` 和 `ensureAdmin` 中间件保护。该系统验证请求是否源自具有必要管理权限的可信组件。
- **用途**：这不适用于外部或面向最终用户的应用程序。它为 AIGNE 生态系统的不同部分在内部与 Hub 通信提供了一种安全的方式。

---

## API 版本 2 (推荐)

V2 API 是所有新开发工作的标准。它为聊天、图像生成和嵌入提供了全面的功能，并内置了对使用情况跟踪和基于积分计费的支持。

### 端点：聊天补全

此端点为对话式 AI、文本补全和其他语言任务生成基于文本的响应。它与 OpenAI 聊天补全 API 格式兼容并支持流式传输。

- **端点**：`POST /api/v2/chat/completions`
- **AIGNE 原生端点**：`POST /api/v2/chat`

#### 请求体

| 字段 | 类型 | 描述 | 必需 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的模型的 ID（例如 `openai/gpt-4`、`anthropic/claude-3-opus`）。 | 是 |
| `messages` | array | 代表对话历史的消息对象数组。参见下方的对象结构。 | 是 |
| `stream` | boolean | 如果为 `true`，API 将以服务器发送事件 (SSE) 的形式流式返回部分消息增量。 | 否 |
| `temperature` | number | 控制随机性。值越低，输出的确定性越高。范围从 0.0 到 2.0。 | 否 |
| `maxTokens` | integer | 在补全中生成的最大令牌数。 | 否 |
| `topP` | number | 通过核心采样控制多样性。范围从 0.1 到 1.0。 | 否 |
| `presencePenalty` | number | 根据新令牌是否已在文本中出现来对其进行惩罚。范围从 -2.0 到 2.0。 | 否 |
| `frequencyPenalty` | number | 根据新令牌在文本中已有的频率来对其进行惩罚。范围从 -2.0 到 2.0。 | 否 |
| `tools` | array | 模型可以调用的工具列表。 | 否 |
| `toolChoice` | string or object | 控制模型应使用哪个工具。可以是 "none"、"auto"、"required" 或特定函数。 | 否 |
| `responseFormat` | object | 一个指定模型必须输出格式的对象。例如：`{ "type": "json_object" }` | 否 |

**消息对象结构**

| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `role` | string | 消息作者的角色。`system`、`user`、`assistant` 或 `tool` 之一。 |
| `content` | string or array | 消息的内容。对于多模态模型，这可以是一个文本和图像对象的数组。 |
| `toolCalls` | array | 如果模型决定调用工具，则会出现在 `assistant` 消息中。 |
| `toolCallId` | string | 对于 `tool` 角色的消息是必需的，指定正在响应的工具调用的 ID。 |

#### 使用示例 (TypeScript)

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

#### 响应对象

响应包括生成的消息、模型信息和详细的使用指标，其中包括以 AIGNE Hub 积分计算的成本。

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

### 端点：图像生成

此端点根据文本提示生成图像。

- **端点**：`POST /api/v2/image/generations`
- **AIGNE 原生端点**：`POST /api/v2/image`

#### 请求体

| 字段 | 类型 | 描述 | 必需 |
| :--- | :--- | :--- | :--- |
| `model` | string | 用于图像生成的模型（例如 `openai/dall-e-3`）。 | 是 |
| `prompt` | string | 所需图像的文本描述。 | 是 |
| `n` | integer | 要生成的图像数量。默认为 1。最多 10。 | 否 |
| `size` | string | 生成图像的尺寸（例如 `1024x1024`、`1792x1024`）。 | 否 |
| `quality` | string | 图像的质量。`standard` 或 `hd`。 | 否 |
| `style` | string | 生成图像的风格。`vivid` 或 `natural`。 | 否 |
| `responseFormat` | string | 生成图像的返回格式。`url` 或 `b64_json`。 | 否 |

#### 响应对象

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

### 端点：嵌入

此端点为给定输入创建一个向量表示，可用于语义搜索、聚类和其他机器学习任务。

- **端点**：`POST /api/v2/embeddings`

#### 请求体

| 字段 | 类型 | 描述 | 必需 |
| :--- | :--- | :--- | :--- |
| `model` | string | 用于创建嵌入的模型（例如 `openai/text-embedding-ada-002`）。 | 是 |
| `input` | string or array | 要嵌入的输入文本或令牌。可以是一个字符串，也可以是一个字符串/令牌数组。 | 是 |

#### 响应对象

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

## 系统运维与可靠性

对于 DevOps 和 SRE 而言，了解系统的运行行为是维持可靠服务的关键。

### 自动重试

API 网关包含一个内置的重试机制，用于处理来自下游 AI 提供商的瞬时故障。这提高了请求的整体可靠性，而无需客户端实现重试逻辑。

- **触发状态码**：如果下游服务返回以下任一 HTTP 状态码，系统将自动尝试重试：
  - `429 (Too Many Requests)`
  - `500 (Internal Server Error)`
  - `502 (Bad Gateway)`
- **配置**：系统配置了默认的 `maxRetries` 值。如果请求因上述状态码之一而失败，它将被重试，直到达到此最大次数，然后向客户端返回错误。此逻辑在 `createRetryHandler` 函数中实现。

### 计费与使用情况跟踪

AIGNE Hub 的 V2 API 与基于积分的计费系统紧密集成。该系统对于在企业和服务提供商部署中监控成本、执行配额和管理用户访问至关重要。

- **积分检查**：在处理任何 V2 API 请求之前，系统会调用 `checkUserCreditBalance` 以确保经过身份验证的用户有足够的积分来执行操作。如果余额不足，请求将被拒绝并返回错误。
- **使用情况报告**：API 调用成功完成后，系统会根据所使用的模型、处理的令牌数或生成的图像数计算操作成本。`createUsageAndCompleteModelCall` 函数会记录此使用情况，并从用户的积分余额中扣除相应金额。
- **响应元数据**：为保证透明度，聊天和图像生成的 API 响应在 `usage` 对象中包含一个 `aigneHubCredits` 字段。该字段显示了该特定交易的确切成本，允许客户端实时跟踪其消耗情况。