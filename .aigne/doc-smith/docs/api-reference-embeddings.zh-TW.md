# 嵌入 (Embeddings)

本文件提供了 AIGNE Hub Embeddings API 端點的詳細規格。遵循本指南，您將學會如何將文字轉換為數值向量表示，這是語義搜尋、文字分群和相似度分析等任務的基礎步驟。

## 建立嵌入

為給定的文字輸入產生一個向量表示。這對於需要文字數值表示的機器學習應用程式很有用。

**POST** `/api/embeddings`

### 請求內文

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>用於產生嵌入的模型 ID。該模型必須與嵌入任務相容。</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>要嵌入的輸入文字或 token。可以是一個字串、一個字串陣列、一個整數陣列 (token) 或一個整數陣列的陣列 (批次 token)。</x-field-desc>
  </x-field>
</x-field-group>

### 請求範例

以下是使用 cURL 呼叫 embeddings 端點的範例。

```bash 建立嵌入請求 icon=lucide:terminal
curl https://your-aigne-hub-instance.com/api/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
  }'
```

### 回應內文

API 會回傳一個包含嵌入資料列表的物件。

<x-field-group>
  <x-field data-name="data" data-type="array" data-required="true">
    <x-field-desc markdown>一個嵌入物件的陣列，其中每個物件對應一個輸入項目。</x-field-desc>
    <x-field data-name="embedding" data-type="array" data-required="true">
      <x-field-desc markdown>輸入文字的向量表示，以浮點數陣列的形式回傳。</x-field-desc>
    </x-field>
    <x-field data-name="index" data-type="number" data-required="true">
      <x-field-desc markdown>嵌入在列表中的索引，對應於輸入項目的順序。</x-field-desc>
    </x-field>
    <x-field data-name="object" data-type="string" data-required="true">
      <x-field-desc markdown>物件的類型，永遠是 `embedding`。</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>用於產生嵌入的模型。</x-field-desc>
  </x-field>
  <x-field data-name="object" data-type="string" data-required="true">
    <x-field-desc markdown>頂層物件的類型，永遠是 `list`。</x-field-desc>
  </x-field>
  <x-field data-name="usage" data-type="object" data-required="true">
    <x-field-desc markdown>一個詳述該請求 token 用量的物件。</x-field-desc>
    <x-field data-name="prompt_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>輸入提示中的 token 數量。</x-field-desc>
    </x-field>
    <x-field data-name="total_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>該請求消耗的 token 總數。</x-field-desc>
    </x-field>
  </x-field>
</x-field-group>

### 回應範例

```json 回應範例
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

## 總結

Embeddings API 提供了一種將文字轉換為高維向量的直接方法，從而實現了廣泛的自然語言處理應用。若要建構更複雜的對話式或生成式 AI，您可能還想探索 [Chat Completions API](./api-reference-chat-completions.md)。