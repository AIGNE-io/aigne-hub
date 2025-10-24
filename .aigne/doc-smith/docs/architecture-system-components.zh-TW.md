# 系統元件

AIGNE Hub 採用模組化架構設計，確保系統的每個部分都有明確且定義清晰的職責。這種關注點分離的設計提升了可維護性、可擴展性和安全性。主要的功能區塊包括 API 閘道、驗證系統、用量追蹤器和一個可選的計費模組。這些元件協同運作，以高效且安全地處理 AI 請求。

下圖說明了這些核心元件之間的高層級互動，從接收客戶端請求到從 AI 供應商返回回應的整個過程。

```d2
direction: down

Client-Applications: {
  label: "客戶端應用程式"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  API-Gateway: {
    label: "API 閘道"
    shape: rectangle
  }

  Authentication-System: {
    label: "驗證系統"
    shape: rectangle
  }

  AI-Provider-Handler: {
    label: "AI 供應商處理器"
    shape: rectangle
  }

  Usage-Tracker: {
    label: "用量追蹤器"
    shape: rectangle
  }

  Billing-Module: {
    label: "計費模組"
    shape: rectangle
  }

  Database: {
    label: "資料庫"
    shape: cylinder
  }
}

External-AI-Provider: {
  label: "外部 AI 供應商\n(例如 OpenAI)"
  shape: rectangle
}

Client-Applications -> AIGNE-Hub.API-Gateway: "1. API 請求"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Authentication-System: "2. 驗證身份"
AIGNE-Hub.Authentication-System -> AIGNE-Hub.API-Gateway: "3. 已驗證"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.AI-Provider-Handler: "4. 路由請求"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Usage-Tracker: "5. 記錄請求詳情"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Billing-Module: "6. 傳送用量資料"
AIGNE-Hub.Billing-Module -> AIGNE-Hub.Database: "7. 更新點數"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Database: "儲存日誌"
AIGNE-Hub.AI-Provider-Handler -> External-AI-Provider: "8. 轉發請求"
External-AI-Provider -> AIGNE-Hub.API-Gateway: "9. AI 回應"
AIGNE-Hub.API-Gateway -> Client-Applications: "10. 最終回應"
```

## API 閘道

API 閘道是所有進入 AIGNE Hub 的請求的單一、統一入口點。它負責根據請求路徑將流量路由到適當的內部服務。這種集中式的方法簡化了客戶端的整合，因為無論底層的 AI 供應商是誰，開發者都只需要與一個單一、一致的 API 端點互動。

該閘道公開了一組 RESTful 端點，主要位於 `/api/v2/` 路徑下，用於聊天完成、圖片生成和嵌入等功能。在請求通過驗證和其他中介軟體後，它會將請求導向相關的處理器進行處理。

## 驗證系統

安全性由一個強大的驗證系統管理，該系統保護所有端點。它利用中介軟體來驗證發出請求的使用者或應用程式的身份。

-   **使用者驗證**：對於面向使用者的互動，例如使用管理儀表板或內建的遊樂場，系統會使用由 Blocklet SDK 管理的基於會話的驗證機制。
-   **API 驗證**：所有 API 請求都需要一個 Bearer 權杖進行授權。此權杖與特定使用者或應用程式相關聯，確保只有經過驗證的客戶端才能存取 AI 模型。

該系統設計為拒絕任何未經驗證的請求，並回傳 `401 Unauthorized` 錯誤，以防止未經授權存取底層的 AI 服務和資料。

## 用量追蹤器

用量追蹤器是監控和稽核的關鍵元件。它會仔細記錄通過閘道的每一次 API 呼叫。一個名為 `createModelCallMiddleware` 的中介軟體會攔截傳入的請求，在資料庫中建立一個狀態為 `processing` 的 `ModelCall` 記錄。

此記錄會擷取交易的關鍵細節，包括：
-   使用者 DID 和應用程式 DID
-   請求的 AI 模型和呼叫類型 (例如 `chatCompletion`、`imageGeneration`)
-   請求和回應的時間戳
-   輸入和輸出的權杖數量
-   呼叫的狀態 (例如 `success`、`failed`)

API 呼叫完成或失敗後，中介軟體會更新 `ModelCall` 記錄，包括最終狀態、持續時間和任何錯誤詳情。這為偵錯、分析和計費提供了完整的稽核軌跡。

## 計費模組

在「服務供應商模式」下運作時，AIGNE Hub 會啟用其可選的計費模組。此元件與用量追蹤器和 **Payment Kit** blocklet 無縫整合，以管理一個基於點數的計費系統。

工作流程如下：
1.  **檢查餘額**：在處理請求之前，系統會檢查使用者是否有足夠的點數餘額。如果餘額為零或負數，請求將被拒絕，並回傳 `402 Payment Required` 錯誤。
2.  **計算成本**：在 API 成功呼叫後，用量追蹤器會提供最終的權杖數量或圖片生成指標。計費模組使用這些資料，以及針對特定模型預先配置的費率 (`AiModelRate`)，來計算以點數為單位的總成本。
3.  **扣除點數**：接著，系統會透過 Payment Kit API 建立一個計量事件，從使用者的餘額中扣除計算出的金額。

這個自動化流程讓營運商能夠將 AIGNE Hub 作為付費服務提供，所有用量和計費都以透明的方式進行管理。