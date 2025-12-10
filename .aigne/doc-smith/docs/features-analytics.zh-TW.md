# 用量與成本分析

了解 AI 模型的使用情況對於管理成本、監控效能和確保資源公平分配至關重要。本文件詳細介紹了如何查詢用量統計、追蹤成本，以及解讀 AIGNE Hub 用於分析和報告的資料模型。

## 總覽

AIGNE Hub 將每次 API 互動記錄為一筆 `ModelCall` 項目。這些記錄是所有用量分析的基礎。系統提供了多個 API 端點來查詢和匯總這些資料，讓您可以監控整個系統或每個使用者的消耗情況。這使得對權杖用量、點數消耗和整體 API 呼叫量進行詳細追蹤成為可能。

## 資料模型

了解底層資料結構對於有效查詢和解讀分析資料至關重要。下圖說明了 `ModelCall` 記錄是如何生成並被分析端點使用的。

<!-- DIAGRAM_IMAGE_START:flowchart:16:9 -->
![Usage & Cost Analytics](assets/diagram/features-analytics-01.jpg)
<!-- DIAGRAM_IMAGE_END -->

### `ModelCall` 物件

每個透過 Hub 向 AI 供應商發出的請求都會被記錄為一筆 `ModelCall`。此物件包含有關請求、其執行情況以及相關成本的詳細資訊。

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="模型呼叫記錄的唯一識別碼。"></x-field>
  <x-field data-name="providerId" data-type="string" data-required="true" data-desc="用於該呼叫的 AI 供應商的識別碼。"></x-field>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="被呼叫的具體模型（例如 'gpt-4o-mini'）。"></x-field>
  <x-field data-name="credentialId" data-type="string" data-required="true" data-desc="用於向供應商進行身份驗證的憑證 ID。"></x-field>
  <x-field data-name="type" data-type="string" data-required="true" data-desc="API 呼叫的類型。可能的值包括 'chatCompletion'、'embedding'、'imageGeneration'、'audioGeneration'、'video' 或 'custom'。"></x-field>
  <x-field data-name="totalUsage" data-type="number" data-required="true" data-desc="一個標準化的用量指標。對於文字模型，這通常是權杖總數（輸入 + 輸出）。"></x-field>
  <x-field data-name="usageMetrics" data-type="object" data-required="false" data-desc="用量的詳細分類，例如輸入和輸出權杖。">
    <x-field data-name="inputTokens" data-type="number" data-desc="輸入提示中的權杖數量。"></x-field>
    <x-field data-name="outputTokens" data-type="number" data-desc="生成回應中的權杖數量。"></x-field>
  </x-field>
  <x-field data-name="credits" data-type="number" data-required="true" data-desc="根據配置的模型費率，該呼叫消耗的點數。"></x-field>
  <x-field data-name="status" data-type="string" data-required="true" data-desc="呼叫的最終狀態。可以是 'success' 或 'failed'。"></x-field>
  <x-field data-name="duration" data-type="number" data-required="false" data-desc="API 呼叫的持續時間，單位為秒。"></x-field>
  <x-field data-name="errorReason" data-type="string" data-required="false" data-desc="如果呼叫失敗，此欄位包含失敗的原因。"></x-field>
  <x-field data-name="appDid" data-type="string" data-required="false" data-desc="發起呼叫的應用程式的 DID。"></x-field>
  <x-field data-name="userDid" data-type="string" data-required="true" data-desc="發出呼叫的使用者的 DID。"></x-field>
  <x-field data-name="requestId" data-type="string" data-required="false" data-desc="一個可選的客戶端請求識別碼，用於追蹤。"></x-field>
  <x-field data-name="callTime" data-type="number" data-required="true" data-desc="發出呼叫時的 Unix 時間戳。"></x-field>
  <x-field data-name="createdAt" data-type="string" data-required="true" data-desc="在資料庫中創建此記錄的時間戳。"></x-field>
</x-field-group>

## 查詢用量資料

您可以透過多個 REST API 端點來擷取分析資料。這些端點需要身份驗證。

### 取得用量統計

若要取得特定時段內用量的摘要和匯總視圖，請使用 `GET /api/user/usage-stats` 端點。對於全系統的分析，管理員可以使用 `GET /api/user/admin/user-stats`。

**請求參數**

<x-field-group>
  <x-field data-name="startTime" data-type="string" data-required="true" data-desc="時間範圍的開始，以 Unix 時間戳表示。"></x-field>
  <x-field data-name="endTime" data-type="string" data-required="true" data-desc="時間範圍的結束，以 Unix 時間戳表示。"></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-required="false">
    <x-field-desc markdown>使用 `/api/user/model-calls` 時，設為 `true` 以取得所有使用者的資料。此功能僅限管理員使用。</x-field-desc>
  </x-field>
</x-field-group>

**請求範例**

```bash 請求使用者統計資料 icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/usage-stats?startTime=1672531200&endTime=1675228799' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

**回應內文**

此端點會返回一個全面的物件，其中包含摘要、每日明細、模型統計和趨勢比較。

<x-field-group>
  <x-field data-name="summary" data-type="object" data-desc="一個包含指定期間內匯總總計的物件。">
    <x-field data-name="totalCredits" data-type="number" data-desc="消耗的總點數。"></x-field>
    <x-field data-name="totalCalls" data-type="number" data-desc="API 呼叫總次數。"></x-field>
    <x-field data-name="modelCount" data-type="number" data-desc="使用的獨立模型總數。"></x-field>
    <x-field data-name="byType" data-type="object" data-desc="一個按呼叫類型（例如 'chatCompletion'）分類的用量統計物件。">
      <x-field data-name="[callType]" data-type="object">
        <x-field data-name="totalUsage" data-type="number" data-desc="此類型的總用量（例如，權杖數）。"></x-field>
        <x-field data-name="totalCredits" data-type="number" data-desc="此類型消耗的總點數。"></x-field>
        <x-field data-name="totalCalls" data-type="number" data-desc="此類型的總呼叫次數。"></x-field>
        <x-field data-name="successCalls" data-type="number" data-desc="此類型的成功呼叫次數。"></x-field>
      </x-field>
    </x-field>
  </x-field>
  <x-field data-name="dailyStats" data-type="array" data-desc="一個物件陣列，每個物件代表一天的用量統計。">
    <x-field data-name="date" data-type="string" data-desc="日期，格式為 'YYYY-MM-DD'。"></x-field>
    <x-field data-name="credits" data-type="number" data-desc="當天消耗的總點數。"></x-field>
    <x-field data-name="tokens" data-type="number" data-desc="當天處理的總權杖數。"></x-field>
    <x-field data-name="requests" data-type="number" data-desc="當天發出的 API 呼叫總次數。"></x-field>
  </x-field>
  <x-field data-name="modelStats" data-type="array" data-desc="一個列出最常用模型的陣列。">
    <x-field data-name="providerId" data-type="string" data-desc="該模型的供應商 ID。"></x-field>
    <x-field data-name="model" data-type="string" data-desc="模型的名稱。"></x-field>
    <x-field data-name="totalCalls" data-type="number" data-desc="對此模型發出的總呼叫次數。"></x-field>
  </x-field>
  <x-field data-name="trendComparison" data-type="object" data-desc="當前期間與上一期間的用量比較。">
    <x-field data-name="current" data-type="object" data-desc="當前期間的統計資料。"></x-field>
    <x-field data-name="previous" data-type="object" data-desc="對應的上一期間的統計資料。"></x-field>
    <x-field data-name="growth" data-type="object" data-desc="兩個期間之間的增長率。"></x-field>
  </x-field>
</x-field-group>

### 列出模型呼叫

若要取得按時間順序排列的個別 API 請求詳細日誌，請使用 `GET /api/user/model-calls` 端點。此端點提供對原始 `ModelCall` 記錄的存取，並支援分頁和篩選。

**請求參數**

<x-field-group>
  <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="分頁的頁碼。"></x-field>
  <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="每頁返回的項目數。最大值為 100。"></x-field>
  <x-field data-name="startTime" data-type="string" data-required="false" data-desc="時間範圍的開始，以 Unix 時間戳表示。"></x-field>
  <x-field data-name="endTime" data-type="string" data-required="false" data-desc="時間範圍的結束，以 Unix 時間戳表示。"></x-field>
  <x-field data-name="search" data-type="string" data-required="false" data-desc="用於按模型名稱、應用程式 DID 或使用者 DID 篩選結果的搜尋詞。"></x-field>
  <x-field data-name="status" data-type="string" data-required="false" data-desc="按呼叫狀態篩選。可以是 'success'、'failed' 或 'all'。"></x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="按特定模型名稱篩選。"></x-field>
  <x-field data-name="providerId" data-type="string" data-required="false" data-desc="按特定供應商 ID 篩選。"></x-field>
  <x-field data-name="appDid" data-type="string" data-required="false" data-desc="按特定應用程式 DID 篩選。"></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="如果為 true，則返回所有使用者的模型呼叫（僅限管理員）。"></x-field>
</x-field-group>

**請求範例**

```bash 列出模型呼叫 icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/model-calls?page=1&pageSize=10&status=failed' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

**回應內文**

回應是一個包含 `ModelCall` 物件的分頁列表。

```json response.json
{
  "count": 1,
  "list": [
    {
      "id": "z8VwXGf6k3qN...",
      "providerId": "openai",
      "model": "gpt-4o-mini",
      "credentialId": "z3tXy..._default",
      "type": "chatCompletion",
      "totalUsage": 150,
      "usageMetrics": {
        "inputTokens": 100,
        "outputTokens": 50
      },
      "credits": 0.0002,
      "status": "failed",
      "duration": 2,
      "errorReason": "API key is invalid.",
      "appDid": "z2qa9sD2tFAP...",
      "userDid": "z1...",
      "requestId": null,
      "callTime": 1675228799,
      "createdAt": "2023-01-31T23:59:59.000Z",
      "updatedAt": "2023-01-31T23:59:59.000Z",
      "traceId": null,
      "provider": {
        "id": "openai",
        "name": "openai",
        "displayName": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "region": null,
        "enabled": true
      },
      "appInfo": {
        "appName": "My AI App",
        "appDid": "z2qa9sD2tFAP...",
        "appLogo": "...",
        "appUrl": "..."
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "..."
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 10
  }
}
```

### 匯出模型呼叫

您可以使用 `GET /api/user/model-calls/export` 端點將模型呼叫歷史記錄匯出為 CSV 檔案，以進行離線分析或報告。此端點接受與列表端點相同的篩選參數。

**請求範例**

```bash 匯出模型呼叫 icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/model-calls/export?startTime=1672531200&endTime=1675228799' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>' \
-o model-calls-export.csv
```

伺服器將回應一個 `text/csv` 檔案，其中包含您請求的資料。

## 總結

AIGNE Hub 中的分析功能提供了強大的工具，用於監控和了解 AI 模型的使用情況。透過利用 `ModelCall` 資料模型和相關的 API 端點，您可以建立儀表板、生成報告，並獲得對營運成本和效能的關鍵洞察。

有關點數如何配置和計費的詳細資訊，請參閱[服務供應商模式](./deployment-scenarios-service-provider.md)文件。