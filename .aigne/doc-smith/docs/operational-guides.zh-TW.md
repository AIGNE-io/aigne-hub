# 用量與分析

本文件詳細介紹了用於追蹤、計算和報告 AI 模型用量與分析的系統架構。本文件適用於負責部署和維護此系統的 DevOps、SRE 和基礎架構團隊。

## 1. 核心概念

分析系統圍繞三個主要概念建構：追蹤每一次獨立的 API 呼叫、計算其相關的點數成本，以及匯總這些資料以進行高效的報告和分析。

### 1.1 模型呼叫追蹤

對 AI 模型的每一次請求都會被詳盡地記錄為資料庫中的一筆 `ModelCall` 記錄。這成為所有用量資料的唯一真實來源。

#### 模型呼叫的生命週期

一筆 `ModelCall` 記錄會經歷一個明確的生命週期，由 `createModelCallMiddleware` 進行管理：

1.  **處理中 (Processing)**：當收到 API 請求時，系統會立即建立一筆狀態為 `processing` 的 `ModelCall` 記錄。一個 `modelCallContext` 物件會被附加到請求物件上，允許下游服務更新該記錄。
2.  **完成 (Completion)**：從 AI 模型供應商成功收到回應後，會呼叫 context 的 `complete` 方法。這會將記錄的狀態更新為 `success`，並填入最終的用量指標，如 token 數量、消耗的點數和總持續時間。
3.  **失敗 (Failure)**：如果在過程中發生任何錯誤（API 錯誤、網路問題、內部處理失敗），則會調用 context 的 `fail` 方法。狀態會被設為 `failed`，並記錄具體的錯誤訊息。這確保了即使是失敗的請求也能被追蹤，以便進行監控和偵錯。

此生命週期確保不會遺失任何 API 呼叫，從而能夠全面掌握成功和失敗的操作。

### 1.2 點數計算與用量報告

系統採用基於點數的計費模型，其中用量（例如，token、圖片生成）會被轉換為標準化的 `credits` 單位。

#### 計算

點數計算由 `createUsageAndCompleteModelCall` 函數執行。當模型呼叫完成時，此函數會：
1.  從系統設定中擷取特定模型和呼叫類型（例如，聊天完成的輸入/輸出費率，圖片生成的單張圖片費率）的定價費率。
2.  使用 `BigNumber.js` 計算消耗的總點數，以確保高精準度並避免浮點數不準確的問題。
3.  將計算出的點數儲存在對應的 `ModelCall` 記錄中。

#### 非同步報告

為最佳化效能和彈性，點數用量會以非同步方式報告給外部計費系統。

1.  **節流 (Throttling)**：`reportUsageV2` 函數使用 `lodash/throttle` 進行節流。系統不會為每一次 API 呼叫都發送一個計費事件，而是在一個可設定的時間段（`usageReportThrottleTime`）內匯總某個使用者的用量，然後發送一個單一的、合併的事件。這大大減少了計費服務的負載。
2.  **原子性更新 (Atomic Updates)**：為防止在分散式或多程序環境中發生資料遺失或重複計算，系統採用了原子性更新策略。用量記錄首先被標記為 `counted`，然後進行匯總，在成功呼叫計費服務的 API 後，最終被標記為 `reported`。如果報告失敗，記錄將保持在 `counted` 狀態（或被重設為 `null`），以便後續重試。

### 1.3 資料匯總與快取

為確保儀表板快速載入和高效的分析查詢，系統使用了一個預先匯總的快取層。

-   **原始資料**：`ModelCall` 表包含精細的、每次請求一行的資料。雖然這對於詳細的審計和日誌至關重要，但在大日期範圍內對其進行時間序列分析可能會很慢。
-   **匯總資料**：`ModelCallStat` 表儲存了為每個使用者預先計算的每小時和每日摘要。一個 cron job (`model.call.stats`) 會定期執行，從 `ModelCall` 原始資料中計算這些摘要並儲存它們。儀表板和統計端點主要查詢此快取表，從而顯著加快回應時間。

## 2. 系統架構與資料流

以下步驟概述了從傳入的 API 請求到最終匯總分析的資料流：

1.  **請求攔截**：一個傳入的 API 請求（例如 `/v1/chat/completions`）被 `createModelCallMiddleware` 攔截。
2.  **初始記錄建立**：中介軟體建立一筆 `status: 'processing'` 的 `ModelCall` 記錄，擷取初始元資料，如請求的模型、使用者 DID 和請求時間戳。
3.  **供應商互動**：請求被轉發到適當的 AI 供應商。中介軟體會用解析後的憑證和最終的模型名稱更新 `ModelCall` 記錄。
4.  **用量計算**：收到回應後，`createUsageAndCompleteModelCall` 函數被調用。它會計算 token 用量和相應的點數。
5.  **用量記錄建立**：建立一筆新的 `Usage` 記錄，將該交易排入佇列等待計費系統處理。
6.  **非同步報告**：觸發經過節流的 `reportUsageV2` 函數。它會匯總該使用者所有未報告的 `Usage` 記錄，並向支付/計費服務發送一個單一的 `createMeterEvent`。
7.  **完成 ModelCall**：`ModelCall` 記錄被更新為 `success` 或 `failed`，並附上最終指標，如持續時間、token 數量和點數。
8.  **排程匯總**：`model.call.stats` cron job 定期執行，查詢 `ModelCall` 表以計算每小時和每日的摘要，然後將其儲存到 `ModelCallStat` 表中。

## 3. 關鍵元件

### 3.1 API 端點

以下在 `routes/user.ts` 中定義的端點提供對用量和分析資料的存取。

| 端點 | 方法 | 描述 |
| :--- | :--- | :--- |
| `/api/user/model-calls` | `GET` | 擷取 `ModelCall` 原始記錄的分頁清單。支援按日期、狀態、模型和使用者進行篩選。管理員可使用 `allUsers=true` 參數。 |
| `/api/user/model-calls/export` | `GET` | 將 `ModelCall` 資料匯出為 CSV 檔案，套用與清單端點相同的篩選條件。 |
| `/api/user/usage-stats` | `GET` | 擷取目前使用者儀表板的匯總用量統計資料，主要來自 `ModelCallStat` 快取。 |
| `/api/user/admin/user-stats` | `GET` | （僅限管理員）擷取所有使用者的匯總用量統計資料。 |
| `/api/user/recalculate-stats` | `POST` | （僅限管理員）手動觸發在指定時間範圍內重新計算使用者統計資料。這是資料校正的關鍵工具。 |
| `/api/user/cleanup-daily-stats` | `POST` | （僅限管理員）刪除指定時間範圍內使用者的每日快取統計資料，強制在下次查詢時重新計算。 |

### 3.2 排程任務 (Cron Jobs)

排程任務對於維護分析系統的健康和準確性至關重要。

| 任務名稱 | 排程 | 描述 |
| :--- | :--- | :--- |
| `cleanup.stale.model.calls` | `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` | 掃描因伺服器崩潰或未處理的錯誤而長時間（例如 >30 分鐘）卡在 `processing` 狀態的 `ModelCall` 記錄。它會將其標記為 `failed` 以確保資料完整性。 |
| `model.call.stats` | `MODEL_CALL_STATS_CRON_TIME` | 透過匯總 `ModelCall` 表的資料來填充 `ModelCallStat` 表。這是分析快取機制的核心。 |

## 4. 疑難排解與維護

### 4.1 過期或「卡住」的處理中呼叫

**症狀**：`ModelCall` 記錄無限期地保持在 `processing` 狀態。
**原因**：如果伺服器執行個體在開始模型呼叫後，但在將其標記為完成或失敗前意外終止，就可能發生這種情況。
**解決方案**：`cleanup.stale.model.calls` 排程任務會將超時的呼叫標記為失敗，從而自動解決此問題。超時時間是可設定的（預設為 30 分鐘）。通常不需要手動介入。

### 4.2 儀表板上的統計資料不正確

**症狀**：使用者或管理員儀表板顯示不正確的用量、呼叫次數或點數總計。
**原因**：這可能是由於過去匯總邏輯中的錯誤，或排程任務執行失敗導致 `ModelCallStat` 快取處於不一致的狀態。
**解決方案**：使用僅限管理員的 `/api/user/recalculate-stats` 端點。

**重新計算統計資料的請求範例：**

```bash
curl -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "userDid": "z1...userDid",
    "startTime": 1672531200,
    "endTime": 1675209599,
    "dryRun": false
  }' \
  https://your-instance.com/api/user/recalculate-stats
```

-   `userDid`：需要校正統計資料的使用者的 DID。
-   `startTime`/`endTime`：定義重新計算期間的 Unix 時間戳。
-   `dryRun`：設為 `true` 可預覽變更而不寫入資料庫。

此過程將刪除指定範圍內的現有快取統計資料，並從 `ModelCall` 原始資料中重新產生，以確保準確性。