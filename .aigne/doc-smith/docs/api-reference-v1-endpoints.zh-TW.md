# V1 端點 (舊版)

本節提供舊版 V1 API 端點的文件。維護這些端點是為了支援較舊的整合並確保向後相容性。對於所有新開發，強烈建議使用 [V2 端點](./api-reference-v2-endpoints.md)，其提供增強功能，包括使用者級別的身份驗證和基於點數的計費。

所有 V1 端點都需要身份驗證。請求必須包含一個帶有 Bearer 權杖的 `Authorization` 標頭。

---

## 聊天完成項

此端點為給定的對話生成回應。它支援串流和非串流模式。

**端點**

```
POST /api/v1/chat/completions
```

### 請求主體

請求主體必須是包含以下參數的 JSON 物件。

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="gpt-3.5-turbo">
    <x-field-desc markdown>要使用的模型 ID。有關哪些模型適用於聊天 API 的詳細資訊，請參閱模型端點相容性表。</x-field-desc>
  </x-field>
  <x-field data-name="messages" data-type="array" data-required="true">
    <x-field-desc markdown>構成迄今為止對話的訊息列表。</x-field-desc>
    <x-field data-name="role" data-type="string" data-required="true">
       <x-field-desc markdown>訊息作者的角色。必須是 `system`、`user`、`assistant` 或 `tool` 之一。</x-field-desc>
    </x-field>
    <x-field data-name="content" data-type="string" data-required="true">
       <x-field-desc markdown>訊息的內容。</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-required="false" data-default="false">
    <x-field-desc markdown>如果設定，將會發送部分訊息增量，類似於 ChatGPT。權杖將在可用時作為僅包含資料的伺服器發送事件 (server-sent events) 發送，串流由一則 `data: [DONE]` 訊息終止。</x-field-desc>
  </x-field>
  <x-field data-name="temperature" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>要使用的取樣溫度，介于 0 和 2 之間。較高的值（如 0.8）會使輸出更隨機，而較低的值（如 0.2）會使其更集中和確定。</x-field-desc>
  </x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false">
    <x-field-desc markdown>在聊天完成項中生成的最大權杖數。</x-field-desc>
  </x-field>
  <x-field data-name="topP" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>一種替代溫度取樣的方法，稱為核心取樣 (nucleus sampling)，模型會考慮具有 top_p 機率品質的權杖結果。因此，0.1 表示只考慮構成前 10% 機率品質的權杖。</x-field-desc>
  </x-field>
  <x-field data-name="presencePenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>介於 -2.0 和 2.0 之間的數字。正值會根據新權杖是否已在文本中出現來進行懲罰，從而增加模型談論新主題的可能性。</x-field-desc>
  </x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>介於 -2.0 和 2.0 之間的數字。正值會根據新權杖在文本中現有的頻率來進行懲罰，從而降低模型逐字重複相同行的可能性。</x-field-desc>
  </x-field>
</x-field-group>

### 請求範例

```bash 請求範例
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

### 回應範例 (非串流)

```json 回應
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

此端點創建一個代表輸入文本的嵌入向量。

**端點**

```
POST /api/v1/embeddings
```

### 請求主體

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>用於創建嵌入的模型 ID。</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>要嵌入的輸入文本，編碼為字串或權杖陣列。若要在單一請求中嵌入多個輸入，請傳遞一個字串陣列。</x-field-desc>
  </x-field>
</x-field-group>

### 請求範例

```bash 請求範例
curl -X POST \
  https://your-hub-url.com/api/v1/embeddings \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "text-embedding-ada-002",
        "input": "The food was delicious and the waiter..."
      }'
```

### 回應範例

```json 回應
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

## 圖像生成

此端點根據文本提示生成圖像。

**端點**

```
POST /api/v1/image/generations
```

### 請求主體

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>用於圖像生成的模型。</x-field-desc>
  </x-field>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>所需圖像的文本描述。最大長度取決於模型。</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>要生成的圖像數量。必須介於 1 和 10 之間。</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false">
    <x-field-desc markdown>生成圖像的尺寸。對於 DALL·E 2，必須是 `256x256`、`512x512` 或 `1024x1024` 之一。對於 DALL·E 3 模型，必須是 `1024x1024`、`1792x1024` 或 `1024x1792` 之一。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false">
    <x-field-desc markdown>返回生成圖像的格式。必須是 `url` 或 `b64_json` 之一。</x-field-desc>
  </x-field>
</x-field-group>

### 請求範例

```bash 請求範例
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

### 回應範例

```json 回應
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

## 音訊轉錄

此端點將音訊轉錄為輸入語言。它作為上游供應商服務的代理。

**端點**

```
POST /api/v1/audio/transcriptions
```

### 請求主體

請求主體應為一個包含音訊檔案和模型名稱的 `multipart/form-data` 物件。此端點直接代理到 `api.openai.com/v1/audio/transcriptions`，您應參考 [OpenAI 官方文件](https://platform.openai.com/docs/api-reference/audio/createTranscription) 以獲取詳細的參數規格。

### 請求範例

```bash 請求範例
curl -X POST \
  https://your-hub-url.com/api/v1/audio/transcriptions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F file="@/path/to/your/audio.mp3" \
  -F model="whisper-1"
```

### 回應

回應格式將與 OpenAI 音訊 API 為轉錄所返回的格式完全相同。

---

## 音訊語音合成

此端點從輸入文本生成音訊。它作為上游供應商服務的代理。

**端點**

```
POST /api/v1/audio/speech
```

### 請求主體

請求主體應為一個 JSON 物件。此端點直接代理到 `api.openai.com/v1/audio/speech`，您應參考 [OpenAI 官方文件](https://platform.openai.com/docs/api-reference/audio/createSpeech) 以獲取詳細的參數規格。

### 請求範例

```bash 請求範例
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

### 回應

回應將是根據請求指定的格式（例如 MP3）生成的音訊檔案。

---

## 總結

本指南詳細介紹了 AIGNE Hub 中可用的舊版 V1 API 端點。雖然這些端點功能正常，但可能不會再獲得新功能。我們鼓勵您遷移到 [V2 端點](./api-reference-v2-endpoints.md)，以利用最新的改進並確保長期相容性。有關 API 安全性和身份驗證的詳細資訊，請參閱 [身份驗證](./api-reference-authentication.md) 部分。