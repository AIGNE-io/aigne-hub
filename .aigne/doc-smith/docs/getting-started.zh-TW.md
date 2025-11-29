# 入門指南

本指南提供一個直接、以任務為導向的路徑，來部署和操作 AIGNE Hub。遵循這些步驟，即可在 30 分鐘內配置一個功能齊全的實例，從而能夠立即與上游 AI 供應商和下游應用程式整合。

下圖說明了開始使用的核心工作流程：

```d2
direction: down

Admin: {
  shape: c4-person
}

Blocklet-Server: {
  label: "Blocklet Server"
  shape: rectangle

  Blocklet-Store: {
    label: "Blocklet 商店"
    icon: "https://store.blocklet.dev/assets/z8ia29UsENBg6tLZUKi2HABj38Cw1LmHZocbQ/logo.png"
  }

  AIGNE-Hub: {
    label: "AIGNE Hub"
    icon: "https://www.arcblock.io/image-bin/uploads/89a24f04c34eca94f26c9dd30aec44fc.png"
  }
}

AI-Providers: {
  label: "AI 供應商"
  shape: rectangle
  style: {
    stroke: "#888"
    stroke-width: 2
    stroke-dash: 4
  }
  OpenAI: {}
  Gemini: {}
  Anthropic: {}
}

Choose-Mode: {
  label: "選擇操作模式"
  shape: diamond
}

Enterprise-Use: {
  label: "企業內部使用"
  shape: rectangle
}

Service-Provider: {
  label: "服務供應商"
  shape: rectangle

  Payment-Kit: {
    label: "支付套件"
    shape: rectangle
  }
}

Basic-Usage: {
  label: "基本用法"
  shape: rectangle

  Playground: {}
  API-Integration: {
    label: "API 整合"
  }
}

Admin -> Blocklet-Server.Blocklet-Store: "1. 在商店中尋找"
Blocklet-Server.Blocklet-Store -> Blocklet-Server.AIGNE-Hub: "2. 安裝 Blocklet"
Admin -> Blocklet-Server.AIGNE-Hub: "3. 設定"
Blocklet-Server.AIGNE-Hub -> AI-Providers: "連接至"
Blocklet-Server.AIGNE-Hub -> Choose-Mode
Choose-Mode -> Enterprise-Use: "預設"
Enterprise-Use -> Basic-Usage
Choose-Mode -> Service-Provider: "營利"
Service-Provider -> Basic-Usage

```

## 前提條件

在繼續之前，請確保滿足以下要求：

*   **Blocklet Server：** 需要一個正在運行的 Blocklet Server 實例來託管 AIGNE Hub。
*   **AI 供應商帳號：** 您必須擁有您打算連接的 AI 服務（例如 OpenAI、Anthropic、Google Gemini）的有效帳號和對應的 API 金鑰。

## 步驟 1：安裝 AIGNE Hub

AIGNE Hub 以 Blocklet 的形式分發，確保了標準化且直接的安裝過程。

1.  在您的 Blocklet Server 實例中，導覽至 **Blocklet 商店**。
2.  使用搜尋欄尋找「AIGNE Hub」。
3.  在 AIGNE Hub blocklet 頁面上點擊 **「啟動」** 按鈕。
4.  遵循螢幕上的安裝精靈完成部署。系統將自動處理必要的設定和配置。

安裝完成後，AIGNE Hub 將會運行，並可從您的 Blocklet Server 儀表板存取。

![AIGNE Hub Dashboard](../../../blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 步驟 2：連接 AI 供應商

安裝後，下一步是將 AIGNE Hub 連接到您選擇的 AI 供應商。所有憑證在靜態時均經過 AES 加密，以確保安全。

1.  存取 AIGNE Hub 管理儀表板。
2.  透過側邊欄導覽至配置部分：**配置 → AI 供應商**。
3.  點擊 **「+ 新增供應商」** 按鈕以開啟配置模態框。
4.  從列表中選擇所需的供應商（例如 OpenAI、Google Gemini）。
5.  輸入您的 API 金鑰以及任何其他必要的憑證或參數。
6.  儲存配置。如果憑證有效，該供應商現在將出現在列表中，並顯示「已連接」狀態。

對您希望透過 AIGNE Hub 管理的所有 AI 供應商重複此過程。

![Configure AI Providers](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

## 步驟 3：選擇操作模式

AIGNE Hub 可針對兩種主要部署情境進行配置。您的選擇將決定後續的使用和整合步驟。

### 供企業內部使用

這是預設且最簡單的模式，專為需要為內部應用程式提供集中式 AI 閘道的團隊設計。

*   **直接計費：** 您的組織將由 AI 供應商（OpenAI、Anthropic 等）直接計費。AIGNE Hub 會追蹤使用情況以進行分析，但不處理支付。
*   **安全存取：** 與您現有的 OAuth 供應商整合，為內部開發人員和應用程式提供安全的單一登入存取。

配置好供應商後，您的 AIGNE Hub 實例即可立即使用。請繼續參閱[基本用法](#基本用法)部分。

### 作為服務供應商使用

此模式透過啟用基於點數的計費系統，將 AIGNE Hub 轉變為一個多租戶、可營利的服務。

*   **營利：** 以點數為基礎向終端使用者收取 AI 使用費。您設定每個模型的定價，從而在上游供應商的成本之上創造利潤。
*   **支付套件整合：** 此模式需要安裝 **Payment Kit** blocklet，它負責處理點數購買、發票開立和支付處理。
*   **使用者引導：** 自動授予新使用者起始點數餘額，以鼓勵採用。

要啟用此模式，請導覽至**偏好設定**，啟用基於點數的計費，並配置您的模型定價費率。

![Configure Model Rates](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

## 步驟 4：基本用法

配置完成後，您可以開始透過 AIGNE Hub 的統一端點發出 API 請求，或直接在內建的 Playground 中測試模型。

### 使用 Playground

Playground 提供一個無程式碼的介面，可與任何已連接的 AI 模型互動。它是測試、提示工程和演示的絕佳工具。

1.  在 AIGNE Hub 儀表板中導覽至 **Playground** 部分。
2.  從下拉式選單中選擇一個已連接的模型。
3.  輸入您的提示並提交以接收回應。

![AIGNE Hub Playground](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

### 程式化使用

透過對 AIGNE Hub 的 OpenAI 相容端點進行 API 呼叫，將其整合到您的應用程式中。以下範例展示如何使用 `@aigne/aigne-hub` 用戶端函式庫。

```typescript AIGNEHubChatModel.ts icon=logos:typescript
// 使用 AIGNE 框架與 AIGNE Hub
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "your-oauth-access-key", // 使用透過 OAuth 產生的存取金鑰
  model: "aignehub/gpt-3.5-turbo", // 在模型前加上 'aignehub/' 前綴
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

此程式碼片段初始化一個指向您自託管 AIGNE Hub 實例的聊天模型用戶端。它使用 OAuth 存取金鑰進行驗證，並透過閘道向 `gpt-3.5-turbo` 模型發出請求。

## 總結

您現在已成功部署、配置並測試了您的 AIGNE Hub 實例。該閘道已可運作，並準備好為您的團隊和應用程式提供 AI 功能。

有關更進階的配置和對平台功能的深入了解，請參閱以下文件：

<x-cards data-columns="2">
  <x-card data-title="部署情境" data-icon="lucide:server" data-href="/deployment-scenarios">
  探索企業自託管和公共服務供應商模式的詳細架構。
  </x-card>
  <x-card data-title="API 參考" data-icon="lucide:code" data-href="/api-reference">
  查閱聊天完成、圖像生成和嵌入端點的技術規格。
  </x-card>
</x-cards>