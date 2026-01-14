# 嵌入

本文档为 AIGNE Hub 嵌入 API 端点提供了详细的规范。通过本指南，您将学习如何将文本转换为数值向量表示，这是语义搜索、文本聚类和相似性分析等任务的基础步骤。

## 创建嵌入

为给定的文本输入生成向量表示。这对于需要文本数值表示的机器学习应用非常有用。

**POST** `/api/embeddings`

### 请求体

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>用于生成嵌入的模型 ID。该模型必须与嵌入任务兼容。</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>要嵌入的输入文本或令牌。这可以是单个字符串、字符串数组、整数数组（令牌）或整数数组的数组（批量令牌）。</x-field-desc>
  </x-field>
</x-field-group>

### 请求示例

以下是使用 cURL 调用嵌入端点的示例。

```bash 创建嵌入请求 icon=lucide:terminal
curl https://your-aigne-hub-instance.com/api/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
  }'
```

### 响应体

API 返回一个包含嵌入数据列表的对象。

<x-field-group>
  <x-field data-name="data" data-type="array" data-required="true">
    <x-field-desc markdown>一个嵌入对象数组，其中每个对象对应一个输入项。</x-field-desc>
    <x-field data-name="embedding" data-type="array" data-required="true">
      <x-field-desc markdown>输入文本的向量表示，以浮点数数组的形式返回。</x-field-desc>
    </x-field>
    <x-field data-name="index" data-type="number" data-required="true">
      <x-field-desc markdown>嵌入在列表中的索引，与输入项的顺序相对应。</x-field-desc>
    </x-field>
    <x-field data-name="object" data-type="string" data-required="true">
      <x-field-desc markdown>对象类型，始终为 `embedding`。</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>用于生成嵌入的模型。</x-field-desc>
  </x-field>
  <x-field data-name="object" data-type="string" data-required="true">
    <x-field-desc markdown>顶层对象的类型，始终为 `list`。</x-field-desc>
  </x-field>
  <x-field data-name="usage" data-type="object" data-required="true">
    <x-field-desc markdown>一个详细说明该请求令牌使用情况的对象。</x-field-desc>
    <x-field data-name="prompt_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>输入提示中的令牌数量。</x-field-desc>
    </x-field>
    <x-field data-name="total_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>该请求消耗的总令牌数。</x-field-desc>
    </x-field>
  </x-field>
</x-field-group>

### 响应示例

```json 响应示例
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.006929283495992422,
        -0.005336422007530928,
        ...
        -4.547132266452536e-05
      ],
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## 总结

嵌入 API 提供了一种将文本转换为高维向量的直接方法，支持广泛的自然语言处理应用。要构建更复杂的对话式或生成式 AI，您可能还想了解[聊天补全 API](./api-reference-chat-completions.md)。