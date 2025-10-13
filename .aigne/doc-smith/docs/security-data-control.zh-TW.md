# AIGNE Hub 入門指南

本指南為您提供部署、設定及驗證 AIGNE Hub 執行個體的完整說明。本指南專為負責管理系統的維運和基礎架構團隊所設計。

## 先決條件

在開始安裝之前，請確保您的環境符合以下要求：

- **Blocklet Server**：需要一個正在執行的 Blocklet Server 執行個體來託管 AIGNE Hub。有關安裝和管理說明，請參閱官方 [Blocklet Server 文件](https://docs.blocklet.io/docs/en/getting-started)。
- **Node.js**：AIGNE Hub 需要 Node.js 18 或更高版本。Blocklet Server 會管理 Node.js 的執行環境，因此請確保您的伺服器環境為最新版本。
- **AI 提供者帳號**：您需要擁有您打算整合的 AI 提供者（例如 OpenAI、Anthropic、Google Gemini）的有效帳號和 API 金鑰。

系統使用整合的 SQLite 資料庫，並透過 Sequelize ORM 進行管理，該資料庫會在安裝過程中自動設定。標準部署無需進行外部資料庫設定。

## 安裝

AIGNE Hub 是作為一個 Blocklet 從官方 Blocklet 商店部署的。

1.  **前往 Blocklet 商店**：進入您的 Blocklet Server 儀表板，然後前往「商店」部分。
2.  **尋找 AIGNE Hub**：使用搜尋列尋找「AIGNE Hub」。
3.  **啟動 Blocklet**：在 AIGNE Hub 頁面上點擊「啟動」按鈕。安裝精靈將引導您完成整個過程，通常包括確認 blocklet 名稱和 URL。

安裝完成後，AIGNE Hub 執行個體將會開始執行，並可透過您設定的 URL 進行存取。

![AIGNE Hub 儀表板](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

## 初始設定

安裝完成後，第一步是設定您希望透過該中心提供的 AI 提供者。

1.  **進入管理面板**：開啟您的 AIGNE Hub 執行個體並前往管理儀表板。
2.  **前往 AI 提供者**：在管理面板中，找到設定部分並選擇**AI 提供者**。
3.  **新增提供者金鑰**：從列表中選擇一個 AI 提供者，然後輸入您的 API 金鑰和任何其他必要的憑證。該中心會安全地加密和儲存這些金鑰。您可以新增多個提供者。

![設定 AI 提供者](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 部署模式

AIGNE Hub 支援兩種主要營運模式。請選擇符合您組織需求的模式。

### 1. 內部使用（企業自架）

這是預設且最簡單的部署模式，非常適合內部開發團隊。

-   **營運**：一旦設定好 AI 提供者，該中心即可開始處理請求。
-   **驗證**：可以透過直接 API 存取或與 OAuth 提供者整合來管理存取，以實現安全、集中的驗證。
-   **計費**：您的組織將根據使用量由 AI 提供者直接計費。AIGNE Hub 提供工具來內部追蹤此消耗量。

### 2. 服務提供者模式

此模式適用於希望向外部客戶提供 AI 服務的組織。

-   **啟用計費**：要啟用此模式，請安裝 **Payment Kit** Blocklet 並將其與 AIGNE Hub 整合。
-   **設定自訂定價**：為不同模型設定您自己的定價費率，讓您能夠設定利潤空間。
-   **點數系統**：使用者透過 Payment Kit 購買點數以支付其 AI 使用費用。系統會自動管理點數扣除和使用者引導。

## 驗證安裝

設定完成後，請使用內建的 AI 遊樂場來驗證該中心是否正常運作。

1.  **開啟遊樂場**：在 AIGNE Hub 使用者介面中前往「遊樂場」部分。
2.  **選擇模型**：選擇您設定的其中一個 AI 模型（例如 `openai/gpt-4`）。
3.  **傳送請求**：在輸入框中輸入提示並傳送請求。

如果您收到來自模型的回應，表示您的 AIGNE Hub 執行個體已正確設定並可完全運作。

![AI 遊樂場](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

## 基本用法範例

應用程式可以透過其 RESTful API 與 AIGNE Hub 互動。當使用 AIGNE 框架時，`AIGNEHubChatModel` 提供了一個無縫的整合點。

以下 TypeScript 範例示範了如何透過該中心呼叫聊天模型。

```typescript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// 使用您的 Hub 設定來初始化模型
const model = new AIGNEHubChatModel({
  // 您的 AIGNE Hub API 端點的 URL
  url: "https://your-aigne-hub-url/api/v2/chat",

  // 透過 OAuth 取得或為應用程式產生的安全存取金鑰
  accessKey: "your-oauth-access-key",

  // 指定要使用的提供者和模型
  model: "openai/gpt-3.5-turbo",
});

async function getCompletion() {
  try {
    const result = await model.invoke({
      messages: "Hello, AIGNE Hub!",
    });

    console.log("AI Response:", result);
  } catch (error) {
    console.error("Error invoking model:", error);
  }
}

getCompletion();
```

-   `url`：您 AIGNE Hub 的聊天完成 API 端點的完整 URL。
-   `accessKey`：用於驗證的存取金鑰。對於生產系統，這應該是透過 OAuth 流程取得的安全權杖。
-   `model`：一個識別提供者和模型的字串，格式為 `provider/model-name`。