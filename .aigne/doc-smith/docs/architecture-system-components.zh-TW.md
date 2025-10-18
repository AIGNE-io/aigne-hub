# 系統架構

AIGNE Hub 被設計為一個強固、可擴展且安全的生成式 AI 世界入口。它建立在 AIGNE Blocklet 框架之上，為眾多 AI 供應商提供統一的介面，同時管理帳務、用量追蹤和安全性等關鍵營運層面。本文件詳細介紹 AIGNE Hub 系統的架構元件和設計原則，並著重於 DevOps 和 SRE 團隊所關注的營運問題。

---

### 核心架構原則

- **模組化：** 該系統被設計為一個 [Blocklet](https://blocklet.io)，確保其可以在 Blocklet Server 環境中獨立部署、管理和擴展。它與其他專業化的 blocklet（例如 Payment Kit 和 Observability）整合，以處理其核心領域之外的問題。
- **可擴展性：** 此架構支援企業的單一實例、自架部署，以及能夠處理大量使用者和應用程式的多租戶服務供應商模型。
- **統一介面：** 它將不同 AI 供應商 API 的複雜性抽象化，為開發者和應用程式提供一組單一、一致的端點。

---

## 架構元件

AIGNE Hub 架構可分解為幾個協同運作的關鍵元件：

![AIGNE Hub System Architecture Diagram](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 1. API 閘道與路由

AIGNE Hub 的核心是其 API 閘道，使用 Node.js 和 Express 建構。它負責請求的接收、身份驗證、版本控制，以及路由到適當的內部服務。

#### API 版本控制

該閘道公開了兩個不同的 API 版本，反映了平台的演進並滿足不同的使用案例：

-   **V1 API (`/api/v1`)**：這是舊版 API，主要為 AIGNE 生態系統內的伺服器對伺服器或元件對元件通訊而設計。
    -   **身份驗證**：依靠密碼學簽章驗證（`ensureComponentCall`）來授權來自受信任 blocklet 元件的請求。
    -   **帳務模型**：透過 Payment Kit 整合了**訂閱制**模型。它會檢查呼叫應用程式是否有有效的訂閱（`checkSubscription`）。此模型非常適合內部企業部署，因為其用量不是按次計費。

-   **V2 API (`/api/v2`)**：這是當前以使用者為中心的 API，專為終端使用者應用程式和現代服務設計。
    -   **身份驗證**：利用 DID Connect 進行去中心化、基於錢包的使用者身份驗證（`sessionMiddleware`）。這提供了一個安全且由使用者管理的身份層。
    -   **帳務模型**：採用彈性的**點數制**系統。在處理請求之前，它會驗證使用者的點數餘額（`checkUserCreditBalance`）。這是服務供應商模式的基礎。
    -   **端點支援**：提供 OpenAI 相容端點（例如 `/v2/chat/completions`）以實現直接相容性，以及 AIGNE 原生端點（例如 `/v2/chat`）以提供增強功能。

### 2. AI 供應商整合層

此層是連接各種第三方 AI 模型的協調引擎。它會將來自 API 閘道的請求正規化，並將其轉換為下游 AI 供應商（例如 OpenAI、Anthropic、Google Gemini）所需的特定格式。它也會將回應正規化，無論底層模型供應商為何，都為客戶端提供一致的輸出結構。

API 金鑰和供應商憑證會被加密並安全儲存，並透過 AIGNE Hub 的管理介面進行管理。

### 3. 帳務與用量追蹤

對於 SRE 和維運人員來說，帳務與用量追蹤系統是監控和財務管理的關鍵元件。

-   **模型呼叫追蹤**：每個傳入的 AI 請求都會在 `ModelCall` 資料庫表中啟動一筆狀態為 `processing` 的記錄。這個追蹤器是作為 Express 中介軟體（`createModelCallMiddleware`）實現的，是所有用量的真實來源。它會擷取使用者 DID、應用程式 DID、請求的模型和請求時間戳。

-   **用量資料收集**：成功完成 AI 呼叫後，追蹤器會更新詳細的用量指標，包括：
    -   提示和完成的 token 數量
    -   生成圖片的數量
    -   模型參數（例如，圖片尺寸、品質）
    -   計算出的點數成本
    -   呼叫持續時間
    -   用於可觀測性的追蹤 ID

-   **韌性**：系統包含一個清理機制（`cleanupStaleProcessingCalls`）來處理孤立的呼叫。如果一筆請求記錄長時間保持在 `processing` 狀態（例如，由於伺服器崩潰），它會被自動標記為 `failed`，以確保系統穩定性和準確的帳務。

-   **Payment Kit 整合**：對於點數制帳務，AIGNE Hub 與 Payment Kit blocklet 深度整合。
    -   當模型呼叫完成時，計算出的點數成本會作為一個「meter event」（`createMeterEvent`）報告給 Payment Kit。
    -   Payment Kit 負責扣除使用者的點數餘額、管理點數購買以及處理所有金融交易。這種關注點分離確保了 AIGNE Hub 專注於 AI 協調，而 Payment Kit 則處理複雜的支付事宜。

### 4. 安全性與身份驗證

安全性在多個層級上進行管理，以適應不同類型的客戶端。

-   **使用者身份驗證 (DID Connect)**：如 `blocklets/core/api/src/libs/auth.ts` 中詳述，v2 API 的終端使用者身份驗證由 DID Connect 處理。使用者使用他們的 DID 錢包進行驗證，提供無密碼且高度安全的會話。會話 token 由 `walletHandler` 管理。

-   **元件身份驗證**：對於自動化的服務間通訊（主要為 v1），系統使用帶有公開金鑰密碼學的挑戰-回應機制。呼叫元件對請求進行簽章，AIGNE Hub 則驗證簽章（`verify(data, sig)`），確保請求源自受信任的註冊元件。

-   **角色型存取控制 (RBAC)**：管理端點受到 `ensureAdmin` 中介軟體的保護，該中介軟體限制了只有具備 `owner` 或 `admin` 角色的使用者才能存取，以防止未經授權的配置變更。

### 5. 資料儲存

-   **主要資料庫**：`README.md` 中指定使用 SQLite 搭配 Sequelize ORM 來儲存核心應用程式資料，包括供應商配置、使用費率和模型呼叫日誌。對於高吞吐量的企業部署，維運人員應考慮遷移到更穩健的資料庫，如 PostgreSQL，Sequelize 也支援該資料庫。
-   **身份驗證儲存**：DID Connect 的會話資料儲存在一個獨立的 NeDB 資料庫（`auth.db`）中，如 `auth.ts` 所配置。

### 6. 可觀測性

該系統為營運可視性而設計。如主路由器（`blocklets/core/api/src/routes/index.ts`）中所示，AIGNE Hub 與 `AIGNEObserver` 函式庫整合。這使其能夠為每個請求擷取詳細的追蹤資料（spans），並將其匯出到一個專用的 Observability Blocklet。這為維運人員提供了從閘道到 AI 供應商再返回的整個請求生命週期中，關於請求延遲、錯誤來源和效能瓶頸的深入洞察。