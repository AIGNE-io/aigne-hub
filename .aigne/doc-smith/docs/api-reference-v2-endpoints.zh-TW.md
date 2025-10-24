# V2 端點（推薦）

V2 API 提供了一套全面的端點，可透過 AIGNE Hub 與各種 AI 模型互動。這些端點是目前的標準，建議所有新的整合都使用。它們的設計穩健且功能豐富，提供使用者層級的驗證、選用的基於點數的計費檢查以及詳細的使用情況追蹤。

這些端點作為一個統一的閘道，抽象化了與不同 AI 供應商互動的複雜性。透過 AIGNE Hub 路由請求，即可對 AI 模型的使用情況進行集中化的控制、監控和安全管理。

關於 API 驗證的詳細資訊，請參閱 [驗證](./api-reference-authentication.md) 指南。關於舊版端點的資訊，請參閱 [V1 端點（舊版）](./api-reference-v1-endpoints.md) 文件。

## API 端點參考

以下各節提供每個可用 V2 端點的詳細規格。所有請求都需要一個 `Authorization: Bearer <TOKEN>` 標頭進行驗證。

### GET /status

此端點檢查 AIGNE Hub 服務的可用性，並可選擇性地檢查特定模型的可用性。它會驗證所需的 AI 供應商是否已設定、已啟用且具有有效的憑證。如果啟用了基於點數的計費，它還會檢查使用者的餘額和模型的費率設定。

**查詢參數**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="要檢查可用性的特定模型，格式為 provider/model-name（例如：openai/gpt-4o-mini）。"></x-field>
</x-field-group>

**請求範例**

```bash 檢查特定模型的可用性 icon=lucide:terminal
curl --location --request GET 'https://your-aigne-hub-instance.com/api/v2/status?model=openai/gpt-4o-mini' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>'
```

**成功回應範例**

```json icon=lucide:braces
{
  "available": true
}
```

**失敗回應範例**

```json icon=lucide:braces
{
  "available": false,
  "error": "Model rate not available"
}
```

### POST /chat/completions

此端點根據一系列訊息從聊天模型生成回應。其設計與 OpenAI Chat Completions API 格式相容，使其成為直接 OpenAI 整合的直接替代方案。它支援標準和串流兩種回應方式。

**請求主體**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="要使用的模型的識別碼（例如：openai/gpt-4o-mini、google/gemini-1.5-pro-latest）。"></x-field>
  <x-field data-name="messages" data-type="array" data-required="true" data-desc="代表對話歷史的訊息物件陣列。">
    <x-field data-name="role" data-type="string" data-required="true" data-desc="訊息作者的角色。可以是 'system'、'user'、'assistant' 或 'tool'。"></x-field>
    <x-field data-name="content" data-type="string | array" data-required="true" data-desc="訊息的內容。可以是字串或用於多部分訊息（例如文字和圖片）的陣列。"></x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-default="false" data-required="false" data-desc="若設定為 true，回應將在生成時以區塊（chunks）的形式串流回傳。"></x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false" data-desc="在完成中生成的最大 token 數。"></x-field>
  <x-field data-name="temperature" data-type="number" data-default="1" data-required="false" data-desc="控制隨機性。較低的值會使模型更具確定性。範圍：0.0 到 2.0。"></x-field>
  <x-field data-name="topP" data-type="number" data-default="1" data-required="false" data-desc="核心取樣參數。模型會考慮機率質量為 topP 的 token。範圍：0.0 到 1.0。"></x-field>
  <x-field data-name="presencePenalty" data-type="number" data-default="0" data-required="false" data-desc="根據新 token 是否已在目前文本中出現來對其進行懲罰。範圍：-2.0 到 2.0。"></x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-default="0" data-required="false" data-desc="根據新 token 在目前文本中的現有頻率對其進行懲罰。範圍：-2.0 到 2.0。"></x-field>
  <x-field data-name="tools" data-type="array" data-required="false" data-desc="模型可能呼叫的工具列表。目前僅支援函式。"></x-field>
  <x-field data-name="toolChoice" data-type="string | object" data-required="false" data-desc="控制模型呼叫哪個工具。可以是 'none'、'auto'、'required' 或特定函式。"></x-field>
</x-field-group>

**請求範例**

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

**回應範例（非串流）**

```json icon=lucide:braces
{
  "role": "assistant",
  "text": "The capital of France is Paris.",
  "content": "The capital of France is Paris."
}
```

**回應範例（串流）**

當 `stream` 為 `true` 時，伺服器會以 `text/event-stream` 格式回應。

```text 伺服器發送事件 icon=lucide:file-text
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

此端點為給定的輸入文字建立向量嵌入，可用於語意搜尋、分群和分類等任務。

**請求主體**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="要使用的嵌入模型的識別碼（例如：openai/text-embedding-3-small）。"></x-field>
  <x-field data-name="input" data-type="string | array" data-required="true" data-desc="要嵌入的輸入文字。可以是一個字串或一個字串陣列。"></x-field>
</x-field-group>

**請求範例**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/embeddings' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
}'
```

**回應範例**

```json icon=lucide:braces
{
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.008922631,
        0.011883527,
        // ... 更多浮點數
        -0.013459821
      ],
      "index": 0
    }
  ]
}
```

### POST /image/generations

此端點使用指定的圖像模型，根據文字提示生成圖像。

**請求主體**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="要使用的圖像生成模型的識別碼（例如：openai/dall-e-3）。"></x-field>
  <x-field data-name="prompt" data-type="string" data-required="true" data-desc="所需圖像的詳細文字描述。"></x-field>
  <x-field data-name="n" data-type="integer" data-default="1" data-required="false" data-desc="要生成的圖像數量。必須介於 1 到 10 之間。"></x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-desc="生成圖像的尺寸。支援的值取決於模型（例如：'1024x1024'、'1792x1024'）。"></x-field>
  <x-field data-name="quality" data-type="string" data-default="standard" data-required="false" data-desc="圖像的品質。支援的值為 'standard' 和 'hd'。"></x-field>
  <x-field data-name="style" data-type="string" data-default="vivid" data-required="false" data-desc="生成圖像的風格。支援的值為 'vivid' 和 'natural'。"></x-field>
  <x-field data-name="responseFormat" data-type="string" data-default="url" data-required="false" data-desc="生成圖像回傳的格式。必須是 'url' 或 'b64_json' 之一。"></x-field>
</x-field-group>

**請求範例**

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

**回應範例**

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

### 音訊端點

AIGNE Hub 提供用於音訊處理的端點，目前會將請求代理到 OpenAI API。這些端點與基於點數的計費系統的完全整合正在開發中。

#### POST /audio/transcriptions

將音訊轉錄為輸入語言的文字。

#### POST /audio/speech

從輸入文字生成音訊。

對於這兩個音訊端點，請求和回應格式與 OpenAI V1 API 的音訊轉錄和語音生成完全相同。有關必要參數的詳細資訊，請參閱 OpenAI 官方文件。AIGNE Hub 會在轉發請求前，安全地為供應商注入必要的 API 金鑰。