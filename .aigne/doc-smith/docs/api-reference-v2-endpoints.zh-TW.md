# API 架構與端點 (v2)

本文件詳細介紹 v2 API 架構，專為負責部署、監控和維護系統的 DevOps、SRE 及基礎架構團隊所設計。本文將著重於 API 的內部運作、設計理念及操作層面。

## 1. 系統架構概覽

v2 API 是一個強大且可擴展的介面，用於與各種 AI 模型互動。其設計優先考量動態提供者管理、彈性恢復能力及全面的用量追蹤，使其適用於生產環境。

### 1.1. 請求生命週期

一個典型的 API 請求會遵循一個結構化的生命週期，由一系列 Express.js 中介軟體強制執行：

1.  **身份驗證**：`sessionMiddleware` 透過存取金鑰驗證使用者身份，並將使用者情境 (`req.user`) 附加到請求物件上。
2.  **計費與額度檢查**：若啟用以額度為基礎的計費方式 (`Config.creditBasedBillingEnabled`)，`checkCreditBasedBillingMiddleware` 會驗證支付系統是否正常運作，且使用者擁有足夠的信用額度餘額 (`checkUserCreditBalance`)。
3.  **模型呼叫追蹤**：一個專門的中介軟體 (`createModelCallMiddleware`) 會在系統中啟動一筆記錄，以追蹤 AI 模型互動的整個生命週期。這對於日誌記錄、偵錯及分析至關重要。
4.  **輸入驗證**：傳入的請求主體會根據預先定義的 Joi 結構描述進行嚴格驗證，以確保資料完整性，並防止格式錯誤的請求進入核心邏輯。
5.  **動態模型與憑證選擇**：系統會動態選擇合適的 AI 提供者和憑證。它會查詢 `AiProvider` 和 `AiCredential` 資料表，為請求的模型找到一個啟用中的有效憑證，並實作輪詢（round-robin）或類似策略 (`AiCredential.getNextAvailableCredential`) 來分配負載。
6.  **AI 模型調用**：請求由核心邏輯處理，該邏輯使用 `AIGNE` SDK 與選定的 AI 模型進行互動。這一步驟抽象化了不同提供者 API 的複雜性。
7.  **用量與計費記錄定案**：成功完成或失敗時，會觸發一個掛鉤（hook）(`onEnd` 或 `onError`)。系統會呼叫 `createUsageAndCompleteModelCall` 函式來完成模型呼叫記錄的最終處理、計算以額度為單位的成本，並記錄詳細的用量指標。
8.  **回應生成**：系統將回應傳回給客戶端。對於聊天完成（chat completions），回應可以是標準的 JSON 物件，也可以是 `text/event-stream` 格式以進行即時串流。

### 1.2. 動態提供者與憑證管理

一個關鍵的設計決策是將 API 與特定的 AI 提供者解耦。系統使用資料庫驅動的方法來管理提供者 (`AiProvider`) 及其相關的 API 金鑰 (`AiCredential`)。

-   **運作方式**：當請求指定一個模型（例如 `openai/gpt-4o`）時，系統首先會識別其提供者 (`openai`)。接著，它會查詢資料庫，尋找與該提供者關聯的有效憑證。這使得新增、移除或輪換憑證時，無須中斷任何服務。
-   **設計理念**：此架構提供了高可用性與靈活性。如果某個憑證或提供者出現問題，系統可以設定為容錯轉移（failover）到另一個。它也簡化了 API 金鑰的管理，並集中控制對 AI 模型的存取。`getProviderCredentials` 函式封裝了此邏輯，確保每次模型呼叫都使用有效且啟用中的憑證。

### 1.3. 彈性恢復與錯誤處理

為確保在分散式環境中的穩定性，API 整合了一套針對暫時性故障的自動重試機制。

-   **重試處理器**：`createRetryHandler` 包裝了核心端點邏輯。它被設定為對因特定 HTTP 狀態碼（例如 `429 Too Many Requests`、`500 Internal Server Error`、`502 Bad Gateway`）而失敗的請求進行重試。重試次數可透過 `Config.maxRetries` 進行設定。
-   **失敗記錄**：若發生不可重試的錯誤或在用盡所有重試次數後，`onError` 掛鉤會確保該失敗被記錄下來，且相關的模型呼叫記錄會被標記為失敗。這可以防止出現孤立的記錄，並為故障排除提供清晰的資料。

## 2. API 端點

以下章節詳細說明主要的 v2 API 端點、其用途及操作特性。

### GET /status

-   **用途**：一個健康檢查端點，用於判斷服務是否可用，並準備好接受特定模型的請求。
-   **處理流程**：
    1.  驗證使用者身份。
    2.  如果 `Config.creditBasedBillingEnabled` 為 true，則檢查支付服務是否正在運行，且使用者有正數的信用額度餘額。
    3.  查詢 `AiProvider` 資料庫，以確保至少有一個已啟用且具備有效憑證的提供者可以服務請求的模型。
    4.  如果查詢特定模型，它還會檢查 `AiModelRate` 資料表中是否為該模型定義了費率。
-   **操作說明**：此端點對於客戶端的服務發現至關重要。客戶端應在嘗試進行模型呼叫前先呼叫 `/status`，以避免發送注定會失敗的請求。

### POST /chat and /chat/completions

-   **用途**：提供對語言模型的存取，以進行聊天互動。
-   **端點變體**：
    -   `/chat/completions`：一個與 OpenAI 相容的端點，可接受標準的 `messages` 陣列，並支援透過 `text/event-stream` 進行串流。
    -   `/chat`：AIGNE Hub 的原生端點，其輸入結構略有不同，但提供相同的核心功能。
-   **處理流程**：
    1.  執行請求的生命週期（身份驗證、計費檢查等）。
    2.  `processChatCompletion` 函式處理核心邏輯。它會根據 `completionsRequestSchema` 驗證輸入。
    3.  呼叫 `getModel` 以動態載入指定的模型實例並選擇憑證。
    4.  `AIGNE` 引擎會調用模型。如果請求中包含 `stream: true`，它會回傳一個非同步產生器（async generator），該產生器會產出回應的區塊（chunks）。
    5.  對於串流回應，區塊會在到達時被寫入回應串流。
    6.  `onEnd` 掛鉤會計算權杖（token）用量 (`promptTokens`, `completionTokens`) 並呼叫 `createUsageAndCompleteModelCall` 來記錄交易。

### POST /image and /image/generations

-   **用途**：使用像 DALL-E 這類的模型，根據文字提示生成圖片。
-   **端點變體**：
    -   `/image/generations`：與 OpenAI 相容的端點。
    -   `/image`：AIGNE Hub 的原生端點。
-   **處理流程**：
    1.  遵循標準的請求生命週期。
    2.  輸入會根據 `imageGenerationRequestSchema` 或 `imageModelInputSchema` 進行驗證。
    3.  呼叫 `getImageModel` 以載入適當的圖片模型提供者（例如 OpenAI、Gemini）並選擇憑證。
    4.  `AIGNE` 引擎會使用提示和參數（尺寸、品質等）調用模型。
    5.  `onEnd` 掛鉤會記錄用量。對於圖片，計費通常基於生成的圖片數量、其尺寸和品質，這些資訊會在 `createUsageAndCompleteModelCall` 中被擷取。
    6.  回應中包含生成的圖片，格式可以是 URL 或 Base64 編碼的 JSON 資料 (`b64_json`)。

### POST /embeddings

-   **用途**：將輸入的文字轉換為數值向量表示（embeddings）。
-   **處理流程**：
    1.  執行標準的請求生命週期。
    2.  請求主體由 `embeddingsRequestSchema` 進行驗證。
    3.  `processEmbeddings` 呼叫底層提供者的 embeddings 端點。
    4.  用量根據輸入的權杖數量計算，並透過 `createUsageAndCompleteModelCall` 記錄。

### POST /audio/transcriptions and /audio/speech

-   **用途**：提供語音轉文字及文字轉語音功能。
-   **架構**：這些端點目前是作為 OpenAI API 的安全代理（secure proxies）來實作。
-   **處理流程**：
    1.  驗證使用者身份。
    2.  請求被直接轉發到 OpenAI API。
    3.  `proxyReqOptDecorator` 函式會從憑證儲存庫中動態擷取適當的 OpenAI API 金鑰，並將其注入到傳出請求的 `Authorization` 標頭中。
-   **操作說明**：由於這些是代理端點，其效能與可用性直接取決於上游的 OpenAI 服務。請注意，在原始碼中，以額度為基礎的計費方式在這些端點上被標記為「TODO」，這意味著其用量可能不會透過 AIGNE Hub 的計費系統進行追蹤。

## 3. 故障排除與監控

-   **日誌分析**：系統使用一個集中式的日誌記錄器。需要監控的關鍵事件包括：
    -   `Create usage and complete model call error`：表示在模型呼叫後將用量資料寫入資料庫時發生問題，這可能會影響計費。
    -   `ai route retry`：表示正在發生暫時性的網路或提供者錯誤。高頻率的重試可能指向潛在的基礎架構不穩定問題。
    -   `Failed to mark incomplete model call as failed`：一個嚴重錯誤，可能導致模型呼叫追蹤系統中的狀態不一致。
-   **常見錯誤**：
    -   `400 Validation error`：客戶端發送了格式錯誤的請求。請檢查錯誤訊息以了解哪個 Joi 驗證失敗的詳細資訊。
    -   `401 User not authenticated`：存取金鑰遺失或無效。
    -   `404 Provider ... not found`：請求的模型或提供者未在資料庫中設定或啟用。
    -   `502 Payment kit is not Running`：計費服務已關閉或無法連線。當 `creditBasedBillingEnabled` 為 true 時，這是一個關鍵的相依服務。