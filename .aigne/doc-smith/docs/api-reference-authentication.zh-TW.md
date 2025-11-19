# API 驗證

對 AIGNE Hub API 的請求進行安全驗證，是程式化存取與整合的關鍵步驟。本指南提供一個清晰、逐步的流程，說明如何使用 API 金鑰來授權您的應用程式，確保所有互動都是安全且能被正確識別的。

## 驗證方法

AIGNE Hub 主要為其 RESTful API 使用帶有 API 金鑰的 bearer 驗證。所有 API 請求都必須包含一個含有有效 API 金鑰的 `Authorization` 標頭。這種方法直接、安全，並符合服務對服務通訊的業界最佳實踐。

## 產生 API 金鑰

在進行驗證之前，您必須從 AIGNE Hub 管理介面產生一個 API 金鑰。

1.  在您的 AIGNE Hub 實例中，導覽至 **Settings** 區塊。
2.  選擇 **API Keys** 標籤頁。
3.  點擊 **"Generate New Key"** 按鈕。
4.  為您的金鑰提供一個描述性的名稱，以幫助您稍後識別其用途（例如，`dev-server-integration`、`analytics-script-key`）。
5.  系統將會產生一把新的金鑰。**請立即複製此金鑰並將其存放在安全的位置。** 基於安全考量，在您離開此頁面後，完整的金鑰將不會再次顯示。

## 使用 API 金鑰

要驗證 API 請求，請將 API 金鑰包含在 HTTP 請求的 `Authorization` 標頭中。該值必須以 `Bearer ` 方案為前綴。

### HTTP 標頭格式

```
Authorization: Bearer <YOUR_API_KEY>
```

請將 `<YOUR_API_KEY>` 替換為您實際產生的金鑰。

### cURL 請求範例

以下是使用 `cURL` 向 Chat Completions 端點發出已驗證請求的範例。

```bash Authenticated API Request icon=lucide:terminal
curl -X POST https://your-aigne-hub-url/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "aignehub/gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Node.js 應用程式中的範例

在與應用程式整合時，您將在 HTTP 客戶端函式庫中設定 `Authorization` 標頭。以下範例使用 AIGNE Hub SDK，它簡化了此流程。

```javascript AIGNEHubChatModel.js icon=logos:javascript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "YOUR_API_KEY", // SDK 會處理加上 "Bearer " 前綴
  model: "aignehub/gpt-3.5-turbo",
});

async function getGreeting() {
  try {
    const result = await model.invoke({
      messages: [{ role: "user", content: "Hello, AIGNE Hub!" }],
    });
    console.log(result);
  } catch (error) {
    console.error("API request failed:", error.message);
  }
}

getGreeting();
```

在此範例中，提供給 `AIGNEHubChatModel` 建構函式的 `apiKey` 會被自動放入正確的 `Authorization` 標頭中，用於該模型實例後續發出的所有 API 呼叫。

## 安全最佳實踐

-   **像對待密碼一樣對待 API 金鑰。** 將它們安全地存放在秘密管理器或環境變數中。切勿將它們暴露在客戶端程式碼中，或提交到版本控制系統。
-   **為不同的應用程式使用不同的金鑰。** 這種做法稱為最小權限原則，可以在單一金鑰被洩露時限制其影響範圍。
-   **定期輪換金鑰。** 定期撤銷舊金鑰並產生新金鑰，以降低因金鑰洩露而導致未經授權存取的風險。
-   **監控 API 使用情況。** 密切注意分析儀表板，以偵測任何可能表示金鑰已遭洩露的異常活動。

## 總結

對 AIGNE Hub API 的驗證是透過包含在 `Authorization` 標頭中作為 bearer token 的 API 金鑰來處理的。遵循上述的產生流程和安全最佳實踐，您可以確保對所有 API 端點的程式化存取是安全且可靠的。

有關特定端點的更多資訊，請參考以下章節：
- [Chat Completions](./api-reference-chat-completions.md)
- [Image Generation](./api-reference-image-generation.md)
- [Embeddings](./api-reference-embeddings.md)