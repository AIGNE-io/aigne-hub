# 技術架構

本文件詳細介紹了 AIGNE Hub 的技術架構，專為負責部署、監控和維護的 DevOps、SRE 及基礎架構團隊而設計。

## 核心理念

AIGNE Hub 的架構建立在模組化、可擴展性和易於部署的原則之上。它作為一個打包為 Blocklet 的獨立、雲原生應用程式運行。這種設計選擇簡化了安裝、管理以及與現有基礎設施的整合。該系統以一個統一的 API 閘道為中心，抽象化了與多個下游 AI 供應商互動的複雜性。

## 系統元件

AIGNE Hub 由幾個關鍵元件組成，它們協同工作以實現其功能。

![AIGNE Hub Logo](../../../blocklets/core/screenshots/logo.png)

### 1. API 伺服器 (Express.js)

應用程式的骨幹是一個使用 Node.js 和 [Express.js](https://expressjs.com/) 建立的強大 API 伺服器。它處理所有傳入的請求、身份驗證和路由。

-   **執行環境**：Node.js (>=18)，提供了一個高效的、事件驅動的環境，適合處理代理 API 呼叫等 I/O 密集型操作。
-   **框架**：使用 Express.js，因其在建立 Web 應用程式和 API 方面採用了極簡且靈活的方法。
-   **類型安全**：整個後端使用 TypeScript 編寫，確保了程式碼品質、可維護性並減少了執行時錯誤。
-   **API 結構**：系統提供了一個版本化的 RESTful API (例如 `/api/v1`、`/api/v2`)，用於與 AI 模型互動和管理 Hub。這確保了平台發展時的向後相容性。
-   **中介軟體**：核心功能是透過標準中介軟體實現的，包括：
    -   `cors` 用於跨來源資源共享。
    -   `cookie-parser` 用於處理 HTTP cookies。
    -   自訂的日誌記錄中介軟體，用於捕獲存取日誌。
    -   一個強大的錯誤處理機制，用於格式化和記錄異常，並返回適當的 HTTP 狀態碼。

### 2. 資料持久化 (SQLite & Sequelize)

在資料儲存方面，AIGNE Hub 使用了輕量級但功能強大的 SQLite 和 Sequelize ORM 組合。

-   **資料庫**：選擇 SQLite 作為資料庫引擎。此決策是為了優化簡易性和可移植性。透過將資料庫嵌入到 Blocklet 的資料目錄 (`/data/aikit.db`) 中，AIGNE Hub 無需外部資料庫依賴，使部署和資料備份變得簡單明瞭。
-   **效能**：為了在高負載下提升效能，系統透過特定的 PRAGMA 指令來設定 SQLite：
    -   `journal_mode = WAL`：預寫式日誌 (Write-Ahead Logging) 允許更高的並行性，讓讀取者在寫入進行時仍能繼續操作。
    -   `synchronous = normal`：在效能和資料完整性之間提供了良好的平衡。
-   **ORM**：[Sequelize](https://sequelize.org/) 被用作物件關聯對應器 (Object-Relational Mapper)。它提供了一個清晰的、基於模型的結構，用於與資料庫互動和管理關聯。關鍵的資料模型包括：
    -   `AiProvider`：儲存支援的 AI 供應商（例如 OpenAI、Anthropic）的設定。
    -   `AiCredential`：安全地儲存每個供應商的加密 API 金鑰和其他憑證。
    -   `App`：管理被授權使用 Hub 的應用程式。
    -   `ModelCall`：記錄每一次獨立的 API 呼叫，用於稽核和分析。
    -   `Usage`：匯總用於計費和追蹤目的的使用資料。
-   **遷移**：資料庫結構變更由 `umzug` 管理。這確保了資料庫更新能被可靠地應用並進行版本控制，這對於維護週期中的順利升級至關重要。

### 3. AI 供應商閘道

AIGNE Hub 的核心功能在於其智慧閘道，用於將請求路由到不同的 AI 供應商。

-   **動態模型載入**：系統會根據 API 請求中的 `model` 參數（例如 `openai/gpt-4o`）動態載入相應的 SDK 或模型處理器。這由 `@aigne/core` 和 `@aigne/aigne-hub` 函式庫處理，它們為不同的 AI 服務提供了一個標準化介面。
-   **憑證管理**：當收到請求時，`getProviderCredentials` 函式會從 `AiProvider` 和 `AiCredential` 資料表中檢索必要的憑證。它包含輪流使用可用金鑰（`getNextAvailableCredential`）的邏輯，為單一供應商設定了多個金鑰時，提供了一個基本的負載平衡和容錯移轉機制。
-   **可擴展性**：此架構被設計為可擴展的。新增一個 AI 供應商僅需在框架內實現其特定邏輯，並將其設定新增到資料庫中，而無需對核心應用程式進行重大更改。

### 4. 可觀測性與監控

為了獲得營運洞察，AIGNE Hub 與 AIGNE 生態系統的可觀測性工具進行了整合。

-   **分散式追蹤**：`AIGNEObserver` 模組會捕獲 API 呼叫的追蹤資料 (spans)。這些資料隨後會被匯出到一個專門的可觀測性 Blocklet。
-   **故障排除**：這種整合使操作人員能夠追蹤一個請求的生命週期，從最初的 API 呼叫，經過 Hub，到下游的 AI 供應商，再返回。這對於診斷延遲問題、識別錯誤和理解系統效能非常有價值。

## 部署與營運

AIGNE Hub 被設計為以 [Blocklet](https://blocklet.io) 的形式部署，這是一種雲原生應用程式套件，可簡化其生命週期管理。

-   **容器化**：作為一個 Blocklet，該應用程式在容器化環境中運行，確保在不同部署目標之間的一致性。
-   **設定**：特定於環境的設定透過 `.env` 檔案進行管理，並由 `dotenv-flow` 函式庫提供支援。這允許為開發、測試和生產環境設定不同的配置。
-   **靜態資產**：在生產環境中，編譯後的 React 前端由同一個 Express.js 伺服器直接提供服務，從而建立一個獨立的單元，易於在反向代理或負載平衡器後方進行管理和部署。
-   **計費系統**：Hub 包含一個基於點數的計費系統，該系統與 Payment Kit blocklet 整合。`paymentClient` 和 `ensureMeter` 函式處理通訊，使 Hub 能夠以服務提供者模式運行，其中使用量將被計量並根據使用者點數進行計費。