# API 參考文件

AIGNE Hub 提供一套強大的 RESTful API，可將 AI 功能整合到您的應用程式中。此 API 旨在成為一個統一的閘道，簡化與各種底層 AI 供應商的互動。本文件為開發人員和網站可靠性工程師 (SRE) 提供有關如何部署、整合和監控 API 端點的詳細資訊。

此 API 有兩個可用版本。強烈建議所有新的整合都使用 **V2 API**，因為它功能更豐富，與 AIGNE 框架一致，並支援基於點數的計費系統。

- **V2 API**：目前的建議版本，適用於所有使用者。它需要基於使用者的驗證，並與點數計費系統整合。
- **V1 API (舊版)**：一個已棄用的版本，主要用於內部元件之間的通訊。它依賴於一個較簡單的訂閱模型，功能有限。

---

## 驗證

V1 和 V2 API 的驗證處理方式不同，反映了它們各自的使用情境。

### V2 驗證：使用者存取金鑰

V2 API 專為終端使用者和應用程式整合而設計。它使用基於會話的驗證機制，其中每個經過驗證的使用者都擁有一個存取金鑰。

- **機制**：用戶端必須在其請求中包含有效的存取金鑰以進行驗證。這通常是透過 `Authorization` 標頭或由 `@blocklet/sdk` 管理的會話 cookie 來完成。
- **用途**：所有 V2 端點（例如 `/api/v2/chat/completions`、`/api/v2/image`）都使用此方法。它確保所有 API 呼叫都與特定使用者相關聯，這對於準確的用量追蹤和基於點數的計費至關重要。

### V1 驗證：元件呼叫

V1 API 旨在用於 Blocklet 生態系統內不同元件之間的內部、伺服器對伺服器通訊。

- **機制**：V1 端點受到 `ensureRemoteComponentCall` 和 `ensureAdmin` 中介軟體的保護。此系統會驗證請求是否來自具有必要管理權限的受信任元件。
- **用途**：這不適用於外部或面向終端使用者的應用程式。它為 AIGNE 生態系統的不同部分在內部與 Hub 進行通訊提供了一種安全的方式。

---

## API 版本 2 (建議)

V2 API 是所有新開發的標準。它為聊天、圖片生成和嵌入提供了全面的功能，並內建了用量追蹤和基於點數的計費支援。

### 端點：聊天完成

此端點為對話式 AI、文字完成和其他語言任務生成基於文字的回應。它與 OpenAI 聊天完成 API 格式相容並支援串流。

- **端點**：`POST /api/v2/chat/completions`
- **AIGNE 原生端點**：`POST /api/v2/chat`

#### 請求主體

| 欄位 | 類型 | 描述 | 是否必須 |
| :--- | :--- | :--- | :--- |
| `model` | string | 要使用的模型 ID（例如 `openai/gpt-4`、`anthropic/claude-3-opus`）。 | 是 |
| `messages` | array | 代表對話歷史的訊息物件陣列。請參閱下方的物件結構。 | 是 |
| `stream` | boolean | 若為 `true`，API 將以伺服器發送事件 (SSE) 的形式串流傳回部分訊息增量。 | 否 |
| `temperature` | number | 控制隨機性。值越低，輸出越具確定性。範圍從 0.0 到 2.0。 | 否 |
| `maxTokens` | integer | 在完成中生成的最大權杖數。 | 否 |
| `topP` | number | 透過核心取樣控制多樣性。範圍從 0.1 到 1.0。 | 否 |
| `presencePenalty` | number | 根據新權杖是否已出現在目前文本中來進行懲罰。範圍從 -2.0 到 2.0。 | 否 |
| `frequencyPenalty` | number | 根據新權杖在目前文本中已存在的頻率來進行懲罰。範圍從 -2.0 到 2.0。 | 否 |
| `tools` | array | 模型可能呼叫的工具列表。 | 否 |
| `toolChoice` | string or object | 控制模型應使用哪個工具。可以是 "none"、"auto"、"required" 或特定函數。 | 否 |
| `responseFormat` | object | 指定模型必須輸出的格式的物件。例如 `{ "type": "json_object" }` | 否 |

**訊息物件結構**

| 欄位 | 類型 | 描述 |
| :--- | :--- | :--- |
| `role` | string | 訊息作者的角色。`system`、`user`、`assistant` 或 `tool` 之一。 |
| `content` | string or array | 訊息的內容。對於多模態模型，這可以是一個由文字和圖片物件組成的陣列。 |
| `toolCalls` | array | 如果模型決定呼叫工具，則會出現在 `assistant` 訊息中。 |
| `toolCallId` | string | `tool` 角色的訊息所需，指定正在回應的工具呼叫的 ID。 |

#### 範例用法 (TypeScript)

```typescript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  accessKey: "your-user-access-key",
  model: "aignehub/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: "Hello, what is AIGNE Hub?",
});

console.log(result);
```

#### 回應物件

回應包括生成的消息、模型資訊和詳細的用量指標，包括以 AIGNE Hub 點數計算的成本。

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

### 端點：圖片生成

此端點從文字提示生成圖片。

- **端點**：`POST /api/v2/image/generations`
- **AIGNE 原生端點**：`POST /api/v2/image`

#### 請求主體

| 欄位 | 類型 | 描述 | 是否必須 |
| :--- | :--- | :--- | :--- |
| `model` | string | 用於圖片生成的模型（例如 `openai/dall-e-3`）。 | 是 |
| `prompt` | string | 對所需圖片的文字描述。 | 是 |
| `n` | integer | 要生成的圖片數量。預設為 1。最多 10。 | 否 |
| `size` | string | 生成圖片的尺寸（例如 `1024x1024`、`1792x1024`）。 | 否 |
| `quality` | string | 圖片的品質。`standard` 或 `hd`。 | 否 |
| `style` | string | 生成圖片的風格。`vivid` 或 `natural`。 | 否 |
| `responseFormat` | string | 返回生成圖片的格式。`url` 或 `b64_json`。 | 否 |

#### 回應物件

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

### 端點：嵌入

此端點為給定的輸入創建一個向量表示，可用於語意搜尋、分群和其他機器學習任務。

- **端點**：`POST /api/v2/embeddings`

#### 請求主體

| 欄位 | 類型 | 描述 | 是否必須 |
| :--- | :--- | :--- | :--- |
| `model` | string | 用於創建嵌入的模型（例如 `openai/text-embedding-ada-002`）。 | 是 |
| `input` | string or array | 要嵌入的輸入文字或權杖。可以是一個字串或一個字串/權杖陣列。 | 是 |

#### 回應物件

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

## 系統操作與可靠性

對於開發維運 (DevOps) 和網站可靠性工程師 (SRE) 而言，了解系統的運作行為是維持可靠服務的關鍵。

### 自動重試

API 閘道包含一個內建的重試機制，以處理來自下游 AI 供應商的暫時性故障。這提高了請求的整體可靠性，而無需用戶端的重試邏輯。

- **觸發狀態碼**：如果下游服務返回以下 HTTP 狀態碼之一，將自動嘗試重試：
  - `429 (Too Many Requests)`
  - `500 (Internal Server Error)`
  - `502 (Bad Gateway)`
- **設定**：系統已設定預設的 `maxRetries` 值。如果請求因上述代碼之一而失敗，它將被重試，直到達到此最大次數，然後再向用戶端返回錯誤。此邏輯在 `createRetryHandler` 函數中實現。

### 計費與用量追蹤

AIGNE Hub 的 V2 API 與基於點數的計費系統緊密整合。此系統對於監控成本、執行配額以及在企業和服務供應商部署中管理使用者存取至關重要。

- **點數檢查**：在處理任何 V2 API 請求之前，系統會呼叫 `checkUserCreditBalance` 以確保經過驗證的使用者有足夠的點數來執行操作。如果餘額不足，請求將被拒絕並返回錯誤。
- **用量報告**：API 呼叫成功完成後，系統會根據所使用的模型、處理的權杖數或生成的圖片數來計算操作成本。`createUsageAndCompleteModelCall` 函數會記錄此用量，並從使用者的點數餘額中扣除相應的金額。
- **回應元資料**：為求透明，用於聊天和圖片生成的 API 回應在 `usage` 物件中包含一個 `aigneHubCredits` 欄位。此欄位顯示該特定交易的確切成本，讓用戶端能夠即時追蹤其消耗量。