# 身分驗證

所有對 AIGNE Hub 的 API 請求都必須經過身分驗證，以確保對閘道器及其整合的 AI 服務的安全存取。本文件概述了所有 API 互動所需的基於權杖 (token) 的身分驗證機制。

API 的存取是透過 Bearer 權杖進行控制。每個請求的 `Authorization` 標頭中都必須包含一個有效的權杖。未經驗證的請求或憑證無效的請求將會導致錯誤。

有關可用端點的更多詳細資訊，請參閱 [V2 端點 (建議)](./api-reference-v2-endpoints.md) 章節。

## 身分驗證流程

此流程始於管理員透過 AIGNE Hub 的使用者介面產生存取權杖。然後，此權杖會提供給用戶端應用程式，用戶端應用程式會將其包含在每個 API 請求的標頭中。AIGNE Hub API 會在處理請求前驗證此權杖。

```d2
shape: sequence_diagram

Admin: {
  shape: c4-person
}

AIGNE-Hub-Admin-UI: {
  label: "AIGNE Hub\n管理介面"
}

Client-Application: {
  label: "用戶端應用程式"
}

AIGNE-Hub-API: {
  label: "AIGNE Hub API"
}

Admin -> AIGNE-Hub-Admin-UI: "1. 產生存取權杖"
AIGNE-Hub-Admin-UI -> Admin: "2. 提供權杖"
Admin -> Client-Application: "3. 使用權杖進行設定"

Client-Application -> AIGNE-Hub-API: "4. API 請求\n(Authorization: Bearer <token>)"
AIGNE-Hub-API -> AIGNE-Hub-API: "5. 驗證權杖與權限"

"若已授權" {
  AIGNE-Hub-API -> Client-Application: "6a. 200 OK 回應"
}

"若未授權" {
  AIGNE-Hub-API -> Client-Application: "6b. 401 Unauthorized 錯誤"
}
```

## 發送已驗證的請求

要驗證 API 請求，您必須包含一個含有 Bearer 權杖的 `Authorization` 標頭。

**標頭格式：**

```
Authorization: Bearer <YOUR_ACCESS_TOKEN>
```

請將 `<YOUR_ACCESS_TOKEN>` 替換為從 AIGNE Hub 管理介面產生的實際 OAuth 存取金鑰。

### 範例：cURL 請求

此範例示範如何使用 `curl` 向聊天完成 (chat completions) 端點發送請求。

```bash 使用 cURL 的 API 請求 icon=cib:curl
curl -X POST 'https://your-aigne-hub-url/api/v2/chat/completions' \
-H 'Authorization: Bearer your-oauth-access-key' \
-H 'Content-Type: application/json' \
-d '{
  "model": "openai/gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, AIGNE Hub!"
    }
  ]
}'
```

### 範例：Node.js 用戶端

當使用官方的 AIGNE Hub 用戶端函式庫時，身分驗證標頭會自動管理。

```typescript AIGNE Hub 用戶端 icon=logos:nodejs
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  url: "https://your-aigne-hub-url/api/v2/chat",
  accessKey: "your-oauth-access-key",
  model: "openai/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

## 錯誤處理

如果身分驗證失敗，API 將會回傳 HTTP `401 Unauthorized` 狀態碼。這表示請求中提供的憑證有問題。

`401` 錯誤的常見原因包括：

| 原因 | 說明 |
| :--- | :--- |
| **缺少權杖** | 請求中未包含 `Authorization` 標頭。 |
| **無效的權杖** | 提供的權杖格式錯誤、已過期或已被撤銷。 |
| **權限不足** | 權杖有效，但關聯的使用者或應用程式缺乏對所請求資源的必要權限。 |

### 錯誤回應範例

失敗的身分驗證嘗試將會回傳一個包含錯誤詳細資訊的 JSON 物件。

```json 未授權回應 icon=mdi:code-json
{
  "error": "Unauthorized",
  "message": "Authentication token is invalid or missing."
}
```

如果您收到此回應，請在重試請求前，確認您的存取權杖是否正確、尚未過期，並具備所需權限。

## 總結

本節詳細介紹了 AIGNE Hub API 的 Bearer 權杖身分驗證機制。所有請求都必須在 `Authorization` 標頭中包含一個有效的權杖。有關特定端點的詳細資訊，請繼續參閱 [V2 端點 (建議)](./api-reference-v2-endpoints.md) 文件。