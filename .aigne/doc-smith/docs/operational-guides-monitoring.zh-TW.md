# 使用者服務

## 概覽

使用者服務是一個核心元件，負責管理所有以使用者為中心的資料和操作。它提供了一套 API 端點，用於處理使用者資訊、基於點數的計費以及詳細的使用量分析。此服務對於個人使用者帳戶管理和整個系統的管理監督都至關重要。

從營運角度來看，此服務旨在實現高效能和資料完整性。其關鍵的架構特性是其使用量統計的快取機制，該機制會預先計算並儲存匯總資料，以便為分析查詢提供快速回應，並防止對主資料庫造成沉重的計算負載。

## 關鍵概念

### 基於點數的計費

本系統與外部的支付套件（Payment Kit）整合，以支援基於點數的計費模式。啟用此功能後（`creditBasedBillingEnabled` 為 true），使用者服務會處理：
- 獲取使用者點數餘額。
- 檢索交易和授信記錄。
- 提供付款連結供使用者購買更多點數。

如果支付套件未執行或被停用，該服務會平穩降級，與點數相關的端點將回傳錯誤或指示該功能已停用。

### 使用量統計快取

為確保能快速且高效地檢索使用量資料，使用者服務對模型呼叫統計採用了一套精密的快取策略。系統並非在每次請求時都從原始的 `ModelCalls` 資料表中計算匯總資料（此方式非常耗費資源），而是預先計算這些統計資料並將其儲存在 `ModelCallStat` 資料表中。

**快取邏輯：**

1.  **粒度**：統計資料按小時匯總。這在資料新鮮度和計算開銷之間取得了良好的平衡。
2.  **按需計算**：當請求過去某個時段的每小時統計資料時，系統會首先檢查 `ModelCallStat` 快取。
3.  **快取未命中**：如果資料不在快取中（即「快取未命中」），服務會針對 `ModelCalls` 資料表執行最佳化的 SQL 查詢，以計算該特定小時的統計資料。
4.  **快取儲存**：新計算出的統計資料會被儲存到 `ModelCallStat` 資料表中，確保後續對同一小時的請求能直接從快取中提供服務。
5.  **即時資料**：對於當前正在進行的小時，統計資料總是即時計算，以提供最新的資訊。

此設計顯著降低了所有使用量統計端點的資料庫負載和 API 延遲。它是系統可擴展性和效能的關鍵元件。為了維護和疑難排解，系統提供了僅供管理員使用的端點，以便在必要時手動重新計算這些快取的統計資料。

## API 端點

以下部分詳細介紹了可用的 API 端點、其參數及其功能。

---

### 使用者資訊

#### 獲取使用者資訊

檢索當前已驗證使用者的完整資訊，包括個人資料詳情和點數餘額（如果適用）。

-   **端點**：`GET /info`
-   **權限**：已驗證的使用者

**回傳**

<x-field-group>
  <x-field data-name="user" data-type="object" data-desc="使用者的個人資料資訊。">
    <x-field data-name="did" data-type="string" data-desc="使用者的去中心化識別碼。"></x-field>
    <x-field data-name="fullName" data-type="string" data-desc="使用者的全名。"></x-field>
    <x-field data-name="email" data-type="string" data-desc="使用者的電子郵件地址。"></x-field>
    <x-field data-name="avatar" data-type="string" data-desc="使用者頭像的 URL。"></x-field>
  </x-field>
  <x-field data-name="creditBalance" data-type="object" data-desc="使用者的點數餘額詳情。若點數計費已停用，則為 null。">
    <x-field data-name="balance" data-type="number" data-desc="可用的點數餘額。"></x-field>
    <x-field data-name="total" data-type="number" data-desc="已授信的總點數。"></x-field>
    <x-field data-name="grantCount" data-type="number" data-desc="收到的點數授信次數。"></x-field>
    <x-field data-name="pendingCredit" data-type="number" data-desc="來自待處理交易的點數。"></x-field>
  </x-field>
  <x-field data-name="paymentLink" data-type="string" data-desc="供使用者購買點數的短網址。"></x-field>
  <x-field data-name="currency" data-type="object" data-desc="用於支付的貨幣。"></x-field>
  <x-field data-name="enableCredit" data-type="boolean" data-desc="指示系統上是否啟用點數計費。"></x-field>
  <x-field data-name="profileLink" data-type="string" data-desc="指向使用者點數使用情況個人資料頁面的短網址。"></x-field>
</x-field-group>

---

### 點數管理

這些端點僅在啟用點數計費時才有效。

#### 獲取點數授信記錄

檢索已驗證使用者的點數授信記錄分頁列表。

-   **端點**：`GET /credit/grants`
-   **權限**：已驗證的使用者

**查詢參數**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="分頁的頁碼（從 1 開始）。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="每頁的項目數（最多 100）。"></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="時間範圍開始的 Unix 時間戳。"></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="時間範圍結束的 Unix 時間戳。"></x-field>
</x-field-group>

#### 獲取點數交易記錄

檢索已驗證使用者的點數交易記錄分頁列表。

-   **端點**：`GET /credit/transactions`
-   **權限**：已驗證的使用者

**查詢參數**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="分頁的頁碼（從 1 開始）。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="每頁的項目數（最多 100）。"></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="時間範圍開始的 Unix 時間戳。"></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="時間範圍結束的 Unix 時間戳。"></x-field>
</x-field-group>

#### 獲取點數餘額

檢索已驗證使用者的當前點數餘額。

-   **端點**：`GET /credit/balance`
-   **權限**：已驗證的使用者

#### 獲取點數支付連結

提供用於購買點數的短網址。

-   **端點**：`GET /credit/payment-link`
-   **權限**：已驗證的使用者

---

### 模型呼叫歷史記錄

#### 獲取模型呼叫記錄

檢索模型呼叫記錄的分頁列表。支援廣泛的篩選功能。

-   **端點**：`GET /model-calls`
-   **權限**：已驗證的使用者。若 `allUsers=true`，則需要管理員/擁有者角色。

**查詢參數**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="分頁的頁碼。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="每頁的項目數（最多 100）。"></x-field>
    <x-field data-name="startTime" data-type="string" data-required="false" data-desc="時間範圍開始的 Unix 時間戳。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="false" data-desc="時間範圍結束的 Unix 時間戳。"></x-field>
    <x-field data-name="search" data-type="string" data-required="false" data-desc="針對呼叫記錄進行關鍵字搜尋。"></x-field>
    <x-field data-name="status" data-type="string" data-required="false" data-desc="依狀態篩選。可以是 'success'、'failed' 或 'all'。"></x-field>
    <x-field data-name="model" data-type="string" data-required="false" data-desc="依特定模型名稱篩選。"></x-field>
    <x-field data-name="providerId" data-type="string" data-required="false" data-desc="依特定提供者 ID 篩選。"></x-field>
    <x-field data-name="appDid" data-type="string" data-required="false" data-desc="依呼叫應用程式的 DID 篩選。"></x-field>
    <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="若為 true，則回傳所有使用者的記錄。需要管理員/擁有者角色。"></x-field>
</x-field-group>

#### 匯出模型呼叫記錄

將模型呼叫記錄匯出為 CSV 檔案。支援與 `/model-calls` 端點相同的篩選功能。

-   **端點**：`GET /model-calls/export`
-   **權限**：已驗證的使用者。若 `allUsers=true`，則需要管理員/擁有者角色。

**查詢參數**

支援與 `GET /model-calls` 相同的查詢參數，但 `page` 和 `pageSize` 除外。匯出上限硬性設定為 10,000 筆記錄。

---

### 使用量統計

#### 獲取使用量統計

檢索指定時間範圍內的匯總使用量統計資料。此資料由快取系統提供。

-   **端點**：`GET /usage-stats`
-   **權限**：已驗證的使用者

**查詢參數**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="時間範圍開始的 Unix 時間戳。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="時間範圍結束的 Unix 時間戳。"></x-field>
</x-field-group>

#### 獲取每週/每月比較

檢索與前一週或前一個月的使用量指標比較。

-   **端點**：`GET /weekly-comparison`
-   **端點**：`GET /monthly-comparison`
-   **權限**：已驗證的使用者

---

### 管理操作

這些端點旨在用於系統維護和疑難排解。

#### 獲取所有使用者統計（管理員）

檢索所有使用者合計的匯總使用量統計資料。

-   **端點**：`GET /admin/user-stats`
-   **權限**：管理員

**查詢參數**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="時間範圍開始的 Unix 時間戳。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="時間範圍結束的 Unix 時間戳。"></x-field>
</x-field-group>

#### 重新計算統計快取

手動觸發對特定使用者和時間範圍的每小時使用量統計進行重新計算。這對於修正資料差異或在系統變更後回填資料很有用。

-   **端點**：`POST /recalculate-stats`
-   **權限**：管理員

**請求主體**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="需要重新計算統計資料的使用者 DID。"></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="重新計算期間開始的 Unix 時間戳。"></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="重新計算期間結束的 Unix 時間戳。"></x-field>
    <x-field data-name="dryRun" data-type="boolean" data-required="false" data-desc="若為 true，端點將報告它會採取哪些操作，但不會實際執行。"></x-field>
</x-field-group>

#### 清理每日統計快取

為特定使用者和時間範圍從快取中移除舊的每日統計項目。

-   **端點**：`POST /cleanup-daily-stats`
-   **權限**：管理員

**請求主體**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="要為其清理統計資料的使用者 DID。"></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="清理期間開始的 Unix 時間戳。"></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="清理期間結束的 Unix 時間戳。"></x-field>
</x-field-group>