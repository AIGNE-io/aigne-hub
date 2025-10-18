# API 參考

本文件為 AIGNE Hub API 提供了詳細的參考資料，重點介紹其架構、端點和操作行為。本文件適用於負責部署和管理該服務的 DevOps、SRE 和基礎架構團隊。

## 系統架構

AIGNE Hub API 被設計為一個強固的、適用於各種 AI 服務的多供應商閘道。它為聊天完成、嵌入和圖像生成提供了一個統一的介面，同時也將管理不同底層 AI 供應商的複雜性抽象化。

### 供應商抽象化與憑證管理

此 API 的一個核心設計原則是其能夠與多個 AI 供應商（例如 OpenAI、Bedrock）無縫連接。這是透過一個供應商抽象層來實現的。

-   **動態憑證載入**：系統會從一個安全的儲存區中動態載入不同供應商的憑證。當一個請求指定一個模型（例如 `openai/gpt-4`）時，API 會識別出供應商（`openai`）並擷取必要的憑證。
-   **憑證輪換**：API 支援單一供應商的多個憑證，並會自動輪換它們。它使用 `getNextAvailableCredential` 策略來循環使用有效的憑證，從而提高安全性與可用性。這允許速率限制分發和零停機時間的金鑰輪換。
-   **設定**：AI 供應商及其憑證是透過 `AiProvider` 和 `AiCredential` 模型在系統的資料庫中進行管理。這使得管理員可以在不變動程式碼的情況下新增、停用或更新供應商的詳細資訊。

### 彈性與錯誤處理

為確保高可用性，API 為上游供應商的請求整合了自動重試機制。

-   **重試邏輯**：系統為關鍵端點使用 `createRetryHandler`。如果對底層 AI 供應商的請求因可重試的狀態碼（`429 Too Many Requests`、`500 Internal Server Error`、`502 Bad Gateway`）而失敗，API 將自動重試該請求。
-   **可設定性**：最大重試次數可透過 `maxRetries` 環境變數進行設定，讓操作員能夠根據自身需求調整系統的彈性。

### 身份驗證

API 端點受到基於元件的身份驗證機制（`ensureRemoteComponentCall` 和 `ensureComponentCall`）的保護。這確保只有生態系統內經授權的服務或元件才能存取 API，通常是使用基於公鑰的驗證系統。

## 端點

以下各節詳細介紹了可用的 API 端點。所有端點都以 `/v1` 為前綴。

---

### 聊天完成

此端點為給定的聊天對話或提示生成回應。它支援標準和串流兩種回應方式。

`POST /v1/chat/completions`
`POST /v1/completions`

**請求主體**

| 欄位 | 類型 | 描述 | 必要 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的模型 ID（例如 `openai/gpt-4`、`google/gemini-pro`）。 | 是 |
| `messages` | array | 代表對話歷史的訊息物件陣列。請參閱下方的物件結構。 | 是（或 `prompt`） |
| `prompt` | string | 單一的提示字串。是 `messages: [{ "role": "user", "content": "..." }]` 的簡寫。 | 是（或 `messages`） |
| `stream` | boolean | 若為 `true`，回應將以伺服器發送事件流的形式發送。 | 否 |
| `temperature` | number | 控制隨機性。值介於 0 和 2 之間。值越高，輸出越隨機。 | 否 |
| `topP` | number | 核心取樣。值介於 0.1 和 1 之間。模型會考慮具有 `topP` 機率質量的詞元。 | 否 |
| `maxTokens` | integer | 在完成中生成的最大詞元數。 | 否 |
| `presencePenalty` | number | 值介於 -2.0 和 2.0 之間。正值會根據新詞元是否已出現在文本中來懲罰它們。 | 否 |
| `frequencyPenalty` | number | 值介於 -2.0 和 2.0 之間。正值會根據新詞元在文本中已有的頻率來懲罰它們。 | 否 |
| `tools` | array | 模型可能呼叫的工具列表。 | 否 |
| `toolChoice` | string or object | 控制模型應使用哪個工具。可以是 "none"、"auto"、"required"，或指定一個函式。 | 否 |
| `responseFormat` | object | 指定輸出格式。對於 JSON 模式，請使用 `{ "type": "json_object" }`。 | 否 |

**訊息物件結構** (`messages` 陣列)

| 欄位 | 類型 | 描述 |
| :--- | :--- | :--- |
| `role` | string | 訊息作者的角色。`system`、`user`、`assistant` 或 `tool` 其中之一。 |
| `content` | string or array | 訊息的內容。可以是字串或用於多模態輸入（如文字和圖像）的陣列。 |
| `toolCalls` | array | 對於 `assistant` 角色，為模型所做的工具呼叫列表。 |
| `toolCallId` | string | 對於 `tool` 角色，此訊息所回應的工具呼叫 ID。 |

**回應 (非串流)**

-   `Content-Type: application/json`
-   回應是一個包含助理回覆的 JSON 物件。

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

**回應 (串流)**

-   `Content-Type: text/event-stream`
-   回應是一個伺服器發送事件流。每個事件都是一個 JSON 物件，代表完成的一部分。最後一個事件可能包含用量統計。

---

### 嵌入

此端點為給定的輸入創建一個向量表示，可用於語意搜尋、分群和其他機器學習任務。

`POST /v1/embeddings`

**請求主體**

| 欄位 | 類型 | 描述 | 必要 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的嵌入模型 ID（例如 `openai/text-embedding-ada-002`）。 | 是 |
| `input` | string or array | 要嵌入的輸入文字或詞元。可以是一個字串，或是一個字串/詞元陣列。 | 是 |

**回應**

-   `Content-Type: application/json`
-   回應包含嵌入資料和用量資訊。

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

### 圖像生成

此端點根據文字提示生成圖像。

`POST /v1/image/generations`

**請求主體**

| 欄位 | 類型 | 描述 | 必要 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的圖像生成模型 ID（例如 `dall-e-2`、`dall-e-3`）。 | 是 |
| `prompt` | string | 所需圖像的文字描述。 | 是 |
| `n` | integer | 要生成的圖像數量。必須介於 1 和 10 之間。預設為 1。 | 否 |
| `size` | string | 生成圖像的尺寸（例如 `1024x1024`、`1792x1024`）。 | 否 |
| `responseFormat` | string | 返回生成圖像的格式。可以是 `url` 或 `b64_json`。預設為 `url`。 | 否 |
| `quality` | string | 要生成的圖像品質。可以是 `standard` 或 `hd`。 | 否 |

**回應**

-   `Content-Type: application/json`
-   回應包含生成圖像的 URL 或 base64 編碼的 JSON，以及用量資料。

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

### 音訊服務 (代理)

音訊轉錄和語音合成端點是 OpenAI v1 API 的直接代理。AIGNE Hub API 透過在轉發請求前從其管理的憑證儲存庫中注入適當的 API 金鑰來處理身份驗證。

有關請求和回應格式，請參閱 OpenAI 官方 API 文件。

-   **音訊轉錄**：`POST /v1/audio/transcriptions`
-   **音訊語音**：`POST /v1/audio/speech`

---

### 系統狀態

此端點提供一個簡單的健康檢查，以驗證服務是否正在執行，並且至少設定了一個 AI 供應商 API 金鑰。

`GET /v1/status`

**回應**

-   `Content-Type: application/json`

```json
{
  "available": true
}
```

-   `available`：一個布林值，表示是否已設定一個或多個 API 金鑰並可供使用。