# 使用者服務 API

## 總覽

使用者服務 API 是系統的基礎元件，旨在管理所有與使用者相關的操作。其職責包括處理使用者驗證、追蹤 AI 模型用量、管理基於點數的計費，以及提供詳細的分析和報告。此服務對於終端使用者體驗以及管理監督和系統維護都至關重要。

從營運角度來看，此服務直接與資料庫介接，以儲存和擷取使用者資料及模型呼叫日誌。它公開了一組 RESTful 端點，供前端應用程式和其他後端服務使用。

## 架構與關鍵概念

### 資料模型

此服務依賴幾個關鍵的資料模型來運作。了解這些模型對於故障排除和維護至關重要。

*   **`ModelCall`**：這是追蹤用量的核心資料模型。`ModelCall` 表中的每筆記錄代表與 AI 模型的一次單獨、離散的互動。它儲存了關於該次呼叫的全面詳細資訊，包括：
    *   **供應商與模型**：使用了哪個 AI 供應商和特定模型（例如，OpenAI、gpt-4）。
    *   **用量指標**：Token 數量（輸入/輸出）或其他相關的消耗單位。
    *   **成本**：該次呼叫所計算出的點數成本。
    *   **狀態**：呼叫是成功、失敗，還是仍在處理中。
    *   **時間戳記與持續時間**：呼叫發生的時間以及花費了多長時間。
    *   **識別碼**：連結到發起呼叫的使用者（`userDid`）和應用程式（`appDid`）。

*   **`ModelCallStat`**：為了優化分析查詢的效能，系統會將 `ModelCall` 表中的資料預先彙總到 `ModelCallStat` 中。這些記錄包含特定時間間隔（例如，每小時、每日）的摘要統計資料，從而減少了在提供儀表板資料時進行昂貴即時計算的需求。用於重新計算和清理統計資料的管理端點操作的就是這張表。

### 驗證與授權

安全性是在 Express.js 框架內的中介軟體層級進行管理的。

*   **Session 中介軟體**：大多數端點都受到 `sessionMiddleware` 的保護。此中介軟體會檢查傳入請求中是否包含有效的 session token，驗證使用者，並將使用者資訊（如 `userDid` 和 `role`）附加到請求物件上。未經驗證的請求將被拒絕，並回傳 `401 Unauthorized` 狀態。
*   **Admin 中介軟體**：某些提供全系統資料或執行敏感維護任務的端點，會受到 `ensureAdmin` 中介軟體的進一步保護。此檢查確保已驗證的使用者具有 `admin` 或 `owner` 的角色，如果權限不足，則回傳 `403 Forbidden` 錯誤。

## API 端點

本節為使用者服務公開的所有端點提供了詳細的參考。

### 使用者資訊

#### GET /info

擷取目前已驗證使用者的完整資訊，包括其個人資料以及（如果啟用）其點數餘額。

*   **權限**：已驗證的使用者
*   **回應主體**：
    *   `user`：包含使用者詳細資訊的物件（`did`、`fullName`、`email`、`avatar`）。
    *   `creditBalance`：包含點數詳細資訊的物件（`balance`、`total`、`grantCount`、`pendingCredit`）。如果基於點數的計費被停用，此欄位為 `null`。
    *   `paymentLink`：一個預先產生的短網址，供使用者購買更多點數。
    *   `currency`：用於支付的貨幣設定。
    *   `enableCredit`：一個布林值旗標，表示基於點數的計費是否啟用。
    *   `profileLink`：一個預先產生的短網址，指向使用者的點數用量儀表板。

### 點數管理

這些端點僅在 `Config.creditBasedBillingEnabled` 為 `true` 時才有效。

#### GET /credit/grants

擷取使用者的點數授予分頁列表。授予是指將點數添加到使用者帳戶中，通常來自促銷活動或初始註冊。

*   **權限**：已驗證的使用者
*   **查詢參數**：
    *   `page`（number，可選）：分頁的頁碼。
    *   `pageSize`（number，可選）：每頁的項目數（最多 100）。
    *   `start`（number，可選）：查詢範圍的開始時間戳記。
    *   `end`（number，可選）：查詢範圍的結束時間戳記。

#### GET /credit/transactions

擷取點數交易（如購買）的分頁列表。

*   **權限**：已驗證的使用者
*   **查詢參數**：
    *   `page`（number，可選）：分頁的頁碼。
    *   `pageSize`（number，可選）：每頁的項目數（最多 100）。
    *   `start`（number，可選）：查詢範圍的開始時間戳記。
    *   `end`（number，可選）：查詢範圍的結束時間戳記。

#### GET /credit/balance

擷取已驗證使用者目前的點數餘額。

*   **權限**：已驗證的使用者

#### GET /credit/payment-link

產生並回傳一個短網址，將使用者導向支付頁面以購買點數。

*   **權限**：已驗證的使用者

### 模型呼叫歷史紀錄

#### GET /model-calls

擷取 AI 模型呼叫的分頁歷史紀錄。這是向使用者和管理員顯示用量日誌的主要端點。

*   **權限**：已驗證的使用者。若 `allUsers=true`，則需要 admin 或 owner 角色。
*   **查詢參數**：
    *   `page`（number，可選，預設值：1）：分頁的頁碼。
    *   `pageSize`（number，可選，預設值：50）：每頁的項目數（最多 100）。
    *   `startTime`（string，可選）：查詢範圍的開始時間戳記（Unix 時間）。
    *   `endTime`（string，可選）：查詢範圍的結束時間戳記（Unix 時間）。
    *   `search`（string，可選）：用於按模型、`appDid` 或 `userDid` 篩選的搜尋詞。
    *   `status`（string，可選）：按呼叫狀態篩選。可以是 `success`、`failed` 或 `all`。
    *   `model`（string，可選）：按特定模型名稱篩選。
    *   `providerId`（string，可選）：按特定 AI 供應商 ID 篩選。
    *   `appDid`（string，可選）：按特定應用程式 DID 篩選。
    *   `allUsers`（boolean，可選）：若為 `true`，則擷取所有使用者的呼叫紀錄。**需要管理員權限。**

#### GET /model-calls/export

將模型呼叫歷史紀錄匯出為 CSV 檔案。此端點支援與 `GET /model-calls` 相同的篩選功能，但專為大量資料匯出和離線分析而設計。

*   **權限**：已驗證的使用者。若 `allUsers=true`，則需要 admin 或 owner 角色。
*   **查詢參數**：與 `GET /model-calls` 相同，但不包括分頁參數（`page`、`pageSize`）。匯出上限硬性設定為 10,000 筆記錄。
*   **回應**：一個 `text/csv` 檔案，帶有 `Content-Disposition` 標頭以觸發檔案下載。

### 用量統計

#### GET /usage-stats

為已驗證的使用者提供指定時間範圍內的彙總用量統計資料。此端點為面向使用者的分析儀表板提供資料。

*   **權限**：已驗證的使用者
*   **查詢參數**：
    *   `startTime`（string，必要）：查詢範圍的開始時間戳記。
    *   `endTime`（string，必要）：查詢範圍的結束時間戳記。
*   **回應主體**：
    *   `summary`：一個包含頂層統計資料的物件，如總呼叫次數、總消耗點數，以及按呼叫類型（例如 `chatCompletion`、`embedding`）細分的用量。
    *   `dailyStats`：一個物件陣列，每個物件代表時間範圍內的一天，並包含其自身的用量和點數摘要。
    *   `modelStats`：該時期內最常使用的模型列表。
    *   `trendComparison`：將指定時期與前一時期進行比較，以顯示用量增長或下降的資料。

#### GET /weekly-comparison

計算並回傳本週（迄今）與前一完整週之間的用量指標比較。

*   **權限**：已驗證的使用者
*   **回應主體**：
    *   `current`：一個包含本週 `totalUsage`、`totalCredits` 和 `totalCalls` 的物件。
    *   `previous`：前一週的相同指標。
    *   `growth`：每個指標的百分比變化。

#### GET /monthly-comparison

計算並回傳本月（迄今）與前一完整月份之間的用量指標比較。

*   **權限**：已驗證的使用者
*   **回應主體**：
    *   `current`：一個包含本月 `totalUsage`、`totalCredits` 和 `totalCalls` 的物件。
    *   `previous`：前一月份的相同指標。
    *   `growth`：每個指標的百分比變化。

### 管理端點

這些端點旨在用於系統維護、監控和故障排除。存取權限僅限於具有 `admin` 或 `owner` 角色的使用者。

#### GET /admin/user-stats

提供指定時間範圍內所有使用者的彙總用量統計資料。這是 `GET /usage-stats` 的管理員對應版本。

*   **權限**：Admin 或 Owner
*   **查詢參數**：
    *   `startTime`（string，必要）：查詢範圍的開始時間戳記。
    *   `endTime`（string，必要）：查詢範圍的結束時間戳記。

#### POST /recalculate-stats

手動觸發對特定使用者在給定時間範圍內的彙總 `ModelCallStat` 資料進行重新計算。這是一個關鍵工具，用於修正可能因處理失敗或錯誤而導致的資料不一致。

*   **權限**：Admin 或 Owner
*   **請求主體**：
    *   `userDid`（string，必要）：需要重新計算統計資料的使用者 DID。
    *   `startTime`（string，必要）：重新計算視窗的開始時間戳記。
    *   `endTime`（string，必要）：重新計算視窗的結束時間戳記。
    *   `dryRun`（boolean，可選）：若為 `true`，端點將報告它將要執行的操作（例如，要刪除的記錄數和要重新計算的小時數），但不會實際執行。強烈建議在執行前使用此選項來驗證操作的範圍。
*   **操作**：
    1.  識別出該使用者在時間範圍內的所有每小時 `ModelCallStat` 記錄。
    2.  如果不是 `dryRun`，則刪除這些記錄。
    3.  然後，它會遍歷該範圍內的每個小時，並重新觸發彙總邏輯，以從原始 `ModelCall` 資料中建立新的 `ModelCallStat` 記錄。

#### POST /cleanup-daily-stats

刪除特定使用者在時間範圍內的每日彙總統計資料（`ModelCallStat` 記錄中 `timeType` 為 'day' 的部分）。這可用於資料生命週期管理，或在重新計算前清除損壞的每日摘要。

*   **權限**：Admin 或 Owner
*   **請求主體**：
    *   `userDid`（string，必要）：要為其執行清理的使用者 DID。
    *   `startTime`（string，必要）：清理視窗的開始時間戳記。
    *   `endTime`（string，必要）：清理視窗的結束時間戳記。