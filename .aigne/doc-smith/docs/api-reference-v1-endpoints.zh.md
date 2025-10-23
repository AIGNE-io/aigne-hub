# V1 端点（旧版）

本节提供了旧版 V1 API 端点的文档。维护这些端点是为了支持旧的集成并确保向后兼容。对于所有新开发，强烈建议使用 [V2 端点](./api-reference-v2-endpoints.md)，它提供了更强的功能，包括用户级身份验证和基于积分的计费。

所有 V1 端点都需要身份验证。请求必须包含带有 Bearer 令牌的 `Authorization` 标头。

---

## 聊天补全

该端点为给定对话生成响应。它支持流式和非流式两种模式。

**端点**

```
POST /api/v1/chat/completions
```

### 请求体

请求体必须是包含以下参数的 JSON 对象。

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="gpt-3.5-turbo">
    <x-field-desc markdown>要使用的模型的 ID。有关哪些模型适用于聊天 API 的详细信息，请参阅模型端点兼容性表。</x-field-desc>
  </x-field>
  <x-field data-name="messages" data-type="array" data-required="true">
    <x-field-desc markdown>构成迄今为止对话的消息列表。</x-field-desc>
    <x-field data-name="role" data-type="string" data-required="true">
       <x-field-desc markdown>消息作者的角色。必须是 `system`、`user`、`assistant` 或 `tool` 之一。</x-field-desc>
    </x-field>
    <x-field data-name="content" data-type="string" data-required="true">
       <x-field-desc markdown>消息的内容。</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-required="false" data-default="false">
    <x-field-desc markdown>如果设置，将发送部分消息增量，就像在 ChatGPT 中一样。令牌将在可用时作为纯数据服务器发送事件发送，流由 `data: [DONE]` 消息终止。</x-field-desc>
  </x-field>
  <x-field data-name="temperature" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>使用的采样温度，介于 0 和 2 之间。较高的值（如 0.8）会使输出更随机，而较低的值（如 0.2）会使输出更具针对性和确定性。</x-field-desc>
  </x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false">
    <x-field-desc markdown>在聊天补全中生成的最大令牌数。</x-field-desc>
  </x-field>
  <x-field data-name="topP" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>一种替代温度采样的方法，称为核心采样，模型会考虑具有 top_p 概率质量的令牌结果。因此，0.1 意味着只考虑构成前 10% 概率质量的令牌。</x-field-desc>
  </x-field>
  <x-field data-name="presencePenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>介于 -2.0 和 2.0 之间的数字。正值会根据新令牌是否已在文本中出现来对其进行惩罚，从而增加模型谈论新主题的可能性。</x-field-desc>
  </x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>介于 -2.0 和 2.0 之间的数字。正值会根据新令牌在文本中已有的频率对其进行惩罚，从而降低模型逐字重复同一行的可能性。</x-field-desc>
  </x-field>
</x-field-group>

### 请求示例

```bash 请求示例
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

### 响应示例（非流式）

```json 响应
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

## 嵌入

该端点创建一个表示输入文本的嵌入向量。

**端点**

```
POST /api/v1/embeddings
```

### 请求体

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>用于创建嵌入的模型的 ID。</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>要嵌入的输入文本，编码为字符串或令牌数组。要在单个请求中嵌入多个输入，请传递一个字符串数组。</x-field-desc>
  </x-field>
</x-field-group>

### 请求示例

```bash 请求示例
curl -X POST \
  https://your-hub-url.com/api/v1/embeddings \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "text-embedding-ada-002",
        "input": "The food was delicious and the waiter..."
      }'
```

### 响应示例

```json 响应
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

## 图像生成

该端点根据文本提示生成图像。

**端点**

```
POST /api/v1/image/generations
```

### 请求体

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>用于图像生成的模型。</x-field-desc>
  </x-field>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>所需图像的文本描述。最大长度取决于模型。</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>要生成的图像数量。必须介于 1 和 10 之间。</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false">
    <x-field-desc markdown>生成的图像尺寸。对于 DALL·E 2，必须是 `256x256`、`512x512` 或 `1024x1024` 之一。对于 DALL·E 3 模型，必须是 `1024x1024`、`1792x1024` 或 `1024x1792` 之一。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false">
    <x-field-desc markdown>返回生成图像的格式。必须是 `url` 或 `b64_json` 之一。</x-field-desc>
  </x-field>
</x-field-group>

### 请求示例

```bash 请求示例
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

### 响应示例

```json 响应
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

## 音频转录

该端点将音频转录为输入语言。它充当上游提供商服务的代理。

**端点**

```
POST /api/v1/audio/transcriptions
```

### 请求体

请求体应为包含音频文件和模型名称的 `multipart/form-data` 对象。该端点直接代理到 `api.openai.com/v1/audio/transcriptions`，您应参考 [OpenAI 官方文档](https://platform.openai.com/docs/api-reference/audio/createTranscription) 了解详细的参数规范。

### 请求示例

```bash 请求示例
curl -X POST \
  https://your-hub-url.com/api/v1/audio/transcriptions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F file="@/path/to/your/audio.mp3" \
  -F model="whisper-1"
```

### 响应

响应格式将与 OpenAI 音频 API 返回的转录响应格式相同。

---

## 音频语音合成

该端点根据输入文本生成音频。它充当上游提供商服务的代理。

**端点**

```
POST /api/v1/audio/speech
```

### 请求体

请求体应为 JSON 对象。该端点直接代理到 `api.openai.com/v1/audio/speech`，您应参考 [OpenAI 官方文档](https://platform.openai.com/docs/api-reference/audio/createSpeech) 了解详细的参数规范。

### 请求示例

```bash 请求示例
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

### 响应

响应将是根据请求指定的格式生成的音频文件（例如 MP3）。

---

## 总结

本指南详细介绍了 AIGNE Hub 中可用的旧版 V1 API 端点。虽然这些端点功能齐全，但可能不会获得新功能。我们鼓励您迁移到 [V2 端点](./api-reference-v2-endpoints.md)，以利用最新的改进并确保长期兼容性。有关 API 安全和身份验证的详细信息，请参阅 [身份验证](./api-reference-authentication.md) 部分。