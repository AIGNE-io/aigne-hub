# 入門指南

本指南提供了部署、設定和開始使用 AIGNE Hub 的基本步驟。本指南專為需要高效啟動並運行該系統的維運和基礎架構團隊而設計。

## 總覽

AIGNE Hub 作為一個統一的 AI 閘道，集中管理多個大型語言模型 (LLM) 和 AIGC 供應商。它簡化了 API 金鑰管理、用量追蹤和計費，為您生態系統內的所有 AI 服務提供單一存取點。它基於 AIGNE 框架建構並作為 Blocklet 部署，為企業內部使用和面向公眾的服務供應商模式提供了強大的解決方案。

![AIGNE Hub 儀表板](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/c29f08420df8ea9a199fcb5ffe06febe.png)

## 1. 部署

AIGNE Hub 設計運行於 Blocklet Server 之上，由 Blocklet Server 提供底層的編排、擴展和管理能力。

### 先決條件

- 一個正在運行的 Blocklet Server 實例。
- 對 Blocklet Server 的管理員存取權限，以便安裝和管理應用程式。

### 安裝步驟

1.  **導覽至 Blocklet Store**：存取您的 Blocklet Server 儀表板並前往「Store」部分。
2.  **尋找 AIGNE Hub**：使用搜尋列尋找「AIGNE Hub」。
3.  **啟動應用程式**：在 AIGNE Hub 頁面上點擊「啟動」按鈕。安裝精靈將引導您完成初始設定過程。

安裝完成後，AIGNE Hub 將作為一個服務在您的 Blocklet Server 上運行。

## 2. 供應商組態設定

部署完成後，第一步是將 AIGNE Hub 連接到一個或多個 AI 供應商。這包括為您打算使用的服務新增必要的 API 金鑰。

1.  **存取管理面板**：打開您的 AIGNE Hub 實例並導覽至管理儀表板。
2.  **前往 AI 供應商**：在管理面板中，找到設定部分並選擇**設定 → AI 供應商**。
3.  **新增 API 金鑰**：從列表中選擇您想要的 AI 供應商（例如 OpenAI、Anthropic、Google Gemini）並輸入您的 API 金鑰。憑證將被加密並安全儲存。

![供應商組態設定](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/d037b6b6b092765ccbfa58706c241622.png)

## 3. 基本用法

供應商設定完成後，AIGNE Hub 便已準備好處理 AI 請求。應用程式可以與 Hub 的統一 API 端點進行互動。存取權限通常透過 OAuth 或生成的 API 存取金鑰來保護。

以下 TypeScript 範例展示了如何使用 `@aigne/aigne-hub` 用戶端函式庫來呼叫一個聊天模型。

```typescript
// 透過 AIGNE Hub 使用 AIGNE 框架
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// 設定用戶端以指向您的 AIGNE Hub 實例
const model = new AIGNEHubChatModel({
  // 您的 AIGNE Hub 聊天 API 端點的完整 URL
  url: "https://your-aigne-hub-url/api/v2/chat",

  // 用於身份驗證的 OAuth 存取金鑰
  accessKey: "your-oauth-access-key",

  // 指定要使用的供應商和模型，例如 "openai/gpt-3.5-turbo"
  model: "openai/gpt-3.5-turbo",
});

// 向模型發送請求
const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

### 關鍵參數：

*   `url`：您自行託管的 AIGNE Hub 實例的端點。
*   `accessKey`：從 AIGNE Hub 的身份驗證系統獲得的安全權杖，授予應用程式進行 API 呼叫的權限。
*   `model`：一個字串識別碼，用於指定供應商和模型（例如 `供應商/模型名稱`）。AIGNE Hub 根據此值將請求路由到對應的供應商。

## 後續步驟

完成基本設定後，您現在可以根據您的部署情境探索更進階的組態設定：

*   **企業內部使用**：將 Hub 與您的內部應用程式整合，並使用其內建的使用者管理和安全功能來管理團隊存取權限。
*   **服務供應商使用**：如果您計劃將 AIGNE Hub 作為公共服務提供，下一步是安裝 **Payment Kit** Blocklet，設定計費費率，並建立客戶付款流程。