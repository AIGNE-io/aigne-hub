# 使用者 API 端點

使用者 API 提供用於管理使用者相關資料的端點，包括點數餘額、交易歷史和用量統計。這些端點對於監控使用者活動和管理帳務資訊至關重要。

## 身份驗證

本節中的所有端點都需要透過 `sessionMiddleware` 進行使用者身份驗證。特定端點可能需要管理員權限，這由 `ensureAdmin` 中介軟體強制執行。

---

### 獲取使用者資訊

檢索已驗證使用者的詳細資訊，包括其個人資料和點數餘額（如果啟用了基於點數的計費）。

- **端點：** `GET /user/info`
- **權限：** 已驗證的使用者

**成功回應 (200 OK)**

如果啟用了基於點數的計費且支付服務正常運作：

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": {
    "balance": 1000.50,
    "total": 5000.00,
    "grantCount": 5,
    "pendingCredit": 100.00
  },
  "paymentLink": "https://example.com/short/payment",
  "currency": {
    "name": "Credit",
    "symbol": "CR",
    "decimal": 2
  },
  "enableCredit": true,
  "profileLink": "https://example.com/short/profile"
}
```

如果禁用了基於點數的計費：

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": null,
  "paymentLink": null,
  "enableCredit": false,
  "profileLink": "https://example.com/short/profile"
}
```

**錯誤回應**

- `401 Unauthorized`：使用者未通過身份驗證。
- `404 Not Found`：找不到使用者或 Meter 設定。
- `502 Bad Gateway`：支付服務未執行。

---

### 列出模型呼叫

檢索 AI 模型呼叫的分頁列表，可依各種條件進行篩選。這是獲取用量歷史記錄的主要端點。

- **端點：** `GET /user/model-calls`
- **權限：** 已驗證的使用者。使用 `allUsers=true` 參數需要管理員角色。

**查詢參數**

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | 分頁的頁碼。預設為 `1`。 |
| `pageSize` | number | 每頁的項目數。預設為 `50`，最大為 `100`。 |
| `startTime` | string | 時間範圍的開始（Unix 時間戳）。 |
| `endTime` | string | 時間範圍的結束（Unix 時間戳）。 |
| `search` | string | 用於篩選結果的搜尋詞。 |
| `status` | string | 按呼叫狀態篩選。可以是 `success`、`failed` 或 `all`。 |
| `model` | string | 按特定模型名稱篩選。 |
| `providerId` | string | 按特定提供者 ID 篩選。 |
| `appDid` | string | 按呼叫應用程式的 DID 篩選。 |
| `allUsers` | boolean | **僅限管理員。** 如果為 `true`，則檢索所有使用者的呼叫。 |

**成功回應 (200 OK)**

```json
{
  "count": 1,
  "list": [
    {
      "id": "z82...",
      "userDid": "z1...",
      "model": "gpt-4",
      "status": "success",
      "credits": 150.75,
      "duration": 500,
      "createdAt": "2023-10-27T10:00:00.000Z",
      // ... 其他欄位
      "appInfo": {
        "appName": "My App",
        "appDid": "z2...",
        "appLogo": "https://example.com/logo.png",
        "appUrl": "https://example.com"
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "https://example.com/avatar.png"
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 50
  }
}
```

---

### 匯出模型呼叫

將模型呼叫歷史記錄匯出為 CSV 檔案。適用與 `GET /user/model-calls` 端點相同的篩選條件。

- **端點：** `GET /user/model-calls/export`
- **權限：** 已驗證的使用者。使用 `allUsers=true` 參數需要管理員角色。

**查詢參數**

此端點接受與 `GET /user/model-calls` 相同的查詢參數，但不包括 `page` 和 `pageSize`。匯出上限硬性設定為 10,000 筆記錄。

**成功回應 (200 OK)**

伺服器以 `text/csv` 檔案回應。

```csv
Timestamp,Request ID,User DID,User Name,User Email,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration(ms),App DID
2023-10-27T10:00:00.000Z,z82...,z1...,John Doe,john.doe@example.com,gpt-4,OpenAI,chat,success,100,200,300,150.75,500,z2...
```

---

### 獲取用量統計

檢索指定時間範圍內的彙總用量統計資料。

- **端點：** `GET /user/usage-stats`
- **權限：** 已驗證的使用者。

**查詢參數**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `startTime` | string | 是 | 時間範圍的開始（Unix 時間戳）。 |
| `endTime` | string | 是 | 時間範圍的結束（Unix 時間戳）。 |

**成功回應 (200 OK)**

```json
{
  "summary": {
    "byType": {
      "chat": 100,
      "image": 20
    },
    "totalCalls": 120,
    "totalCredits": 12345.67,
    "modelCount": 5,
    "totalUsage": 500000
  },
  "dailyStats": [
    {
      "date": "2023-10-26",
      "credits": 5000.1,
      "calls": 50
    },
    {
      "date": "2023-10-27",
      "credits": 7345.57,
      "calls": 70
    }
  ],
  "modelStats": [
    {
      "model": "gpt-4",
      "totalCalls": 80,
      "totalCredits": 9000.0
    }
  ],
  "trendComparison": {
    "totalCredits": {
      "current": 12345.67,
      "previous": 11000.0,
      "change": "12.23"
    },
    "totalCalls": {
      "current": 120,
      "previous": 100,
      "change": "20.00"
    }
  }
}
```

---

### 管理員：獲取所有使用者統計資料

檢索指定時間範圍內所有使用者的彙總用量統計資料。

- **端點：** `GET /user/admin/user-stats`
- **權限：** 管理員

**查詢參數**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `startTime` | string | 是 | 時間範圍的開始（Unix 時間戳）。 |
| `endTime` | string | 是 | 時間範圍的結束（Unix 時間戳）。 |

**回應**

回應結構與 `GET /user/usage-stats` 相同，但包含所有使用者的資料。

---

### 管理員：重新計算使用者統計資料

一個管理端點，用於重新生成指定時間範圍內使用者的快取每小時統計資料。這對於修正資料不一致很有用。

- **端點：** `POST /user/recalculate-stats`
- **權限：** 管理員

**請求主體**

```json
{
  "userDid": "z1...",
  "startTime": "1698364800",
  "endTime": "1698451200",
  "dryRun": true
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `userDid` | string | 是 | 將要重新計算統計資料的使用者的 DID。 |
| `startTime` | string | 是 | 時間範圍的開始（Unix 時間戳）。 |
| `endTime` | string | 是 | 時間範圍的結束（Unix 時間戳）。 |
| `dryRun` | boolean | 否 | 如果為 `true`，伺服器將預覽變更而不執行它們。 |

**成功回應 (200 OK)**

```json
{
  "message": "Rebuild completed",
  "deleted": 24,
  "success": 24,
  "failed": 0
}
```

---

## 點數管理 API

用於管理和查看使用者點數的端點。

### 列出點數授予

檢索已驗證使用者的點數授予分頁列表。

- **端點：** `GET /user/credit/grants`
- **權限：** 已驗證的使用者

---

### 列出點數交易

檢索已驗證使用者的點數交易分頁列表。

- **端點：** `GET /user/credit/transactions`
- **權限：** 已驗證的使用者

---

### 獲取點數餘額

檢索已驗證使用者目前的點數餘額。

- **端點：** `GET /user/credit/balance`
- **權限：** 已驗證的使用者

---

### 獲取點數支付連結

檢索點數支付頁面的短網址。

- **端點：** `GET /user/credit/payment-link`
- **權限：** 已驗證的使用者

# AI 提供者 API 端點

AI 提供者 API 用於設定與各種 AI 模型提供者的連線、管理其憑證以及設定模型使用費率。這些設定是系統運作的基礎。

## 身份驗證

本節中的大多數端點都需要管理員權限，由 `ensureAdmin` 中介軟體強制執行。公開或面向使用者的端點會特別註明。

---

### 列出 AI 提供者

檢索所有已設定的 AI 提供者列表，包括其模型費率和遮蔽後的憑證。

- **端點：** `GET /ai-providers`
- **權限：** 已驗證的使用者

**成功回應 (200 OK)**

```json
[
  {
    "id": "prov_1...",
    "name": "openai",
    "displayName": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "enabled": true,
    "modelRates": [
      {
        "id": "rate_1...",
        "model": "gpt-4",
        "type": "chatCompletion",
        "inputRate": 10,
        "outputRate": 30
      }
    ],
    "credentials": [
      {
        "id": "cred_1...",
        "name": "Default Key",
        "credentialType": "api_key",
        "active": true,
        "displayText": "Default Key (sk-••••key)",
        "maskedValue": {
          "api_key": "sk-••••key"
        }
      }
    ]
  }
]
```

---

### 建立 AI 提供者

向系統中新增一個新的 AI 提供者。

- **端點：** `POST /ai-providers`
- **權限：** 管理員

**請求主體**

```json
{
  "name": "anthropic",
  "displayName": "Anthropic",
  "baseUrl": "https://api.anthropic.com",
  "enabled": true
}
```

---

### 提供者操作

- **更新提供者：** `PUT /ai-providers/:id` (管理員)
- **刪除提供者：** `DELETE /ai-providers/:id` (管理員)

---

### 新增憑證

為指定的提供者新增一個新憑證。系統在儲存前會驗證該憑證。

- **端點：** `POST /ai-providers/:providerId/credentials`
- **權限：** 管理員

**請求主體**

```json
{
  "name": "My API Key",
  "value": "sk-...",
  "credentialType": "api_key"
}
```

---

### 憑證操作

- **更新憑證：** `PUT /ai-providers/:providerId/credentials/:credentialId` (管理員)
- **刪除憑證：** `DELETE /ai-providers/:providerId/credentials/:credentialId` (管理員)
- **檢查憑證狀態：** `GET /ai-providers/:providerId/credentials/:credentialId/check` (管理員) - 觸發對憑證有效性的即時檢查。

---

### 新增模型費率

向提供者新增一個新的模型費率設定。

- **端點：** `POST /ai-providers/:providerId/model-rates`
- **權限：** 管理員

**請求主體**

```json
{
  "model": "claude-3-opus-20240229",
  "type": "chatCompletion",
  "inputRate": 15,
  "outputRate": 75,
  "unitCosts": {
    "input": 0.000015,
    "output": 0.000075
  }
}
```

---

### 批次新增模型費率

同時向多個提供者新增單個模型費率設定。

- **端點：** `POST /ai-providers/model-rates`
- **權限：** 管理員

**請求主體**

```json
{
  "model": "llama3-70b-8192",
  "type": "chatCompletion",
  "inputRate": 1,
  "outputRate": 1,
  "providers": ["prov_1...", "prov_2..."]
}
```

---

### 模型費率操作

- **列出提供者的費率：** `GET /ai-providers/:providerId/model-rates` (使用者)
- **更新模型費率：** `PUT /ai-providers/:providerId/model-rates/:rateId` (管理員)
- **刪除模型費率：** `DELETE /ai-providers/:providerId/model-rates/:rateId` (管理員)

---

### 列出所有模型費率

檢索所有提供者的所有模型費率的分頁和可篩選列表。

- **端點：** `GET /ai-providers/model-rates`
- **權限：** 已驗證的使用者

**查詢參數**

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | 分頁的頁碼。 |
| `pageSize` | number | 每頁的項目數。 |
| `providerId` | string | 以逗號分隔的提供者 ID 列表，用於篩選。 |
| `model` | string | 模型名稱的搜尋詞。 |

---

### 批次更新模型費率

根據指定的利潤率和單個點數的價格更新所有現有的模型費率。新費率計算公式為：`newRate = (unitCost * (1 + profitMargin / 100)) / creditPrice`。

- **端點：** `POST /ai-providers/bulk-rate-update`
- **權限：** 管理員

**請求主體**

```json
{
  "profitMargin": 20,
  "creditPrice": 0.00001
}
```

**成功回應 (200 OK)**

```json
{
  "message": "Successfully updated 50 model rates",
  "updated": 50,
  "skipped": 5,
  "parameters": {
    "profitMargin": 20,
    "creditPrice": 0.00001
  },
  "summary": [
    {
      "id": "rate_1...",
      "model": "gpt-4",
      "provider": "OpenAI",
      "oldInputRate": 10,
      "newInputRate": 12,
      "oldOutputRate": 30,
      "newOutputRate": 36
    }
  ]
}
```

---

## 服務發現與監控

### 列出可用模型 (公開)

一個公開端點，以與 LiteLLM 相容的格式提供所有啟用和設定的模型列表。這對於客戶端應用程式的服務發現至關重要。

- **端點：** `GET /ai-providers/models`
- **權限：** 公開

**成功回應 (200 OK)**

```json
[
  {
    "key": "openai/gpt-4",
    "model": "gpt-4",
    "type": "chat",
    "provider": "openai",
    "providerId": "prov_1...",
    "input_credits_per_token": 10,
    "output_credits_per_token": 30,
    "modelMetadata": {
      "maxTokens": 8192,
      "features": ["tools", "vision"]
    },
    "status": {
      "id": "status_1...",
      "lastChecked": "2023-10-27T10:00:00.000Z",
      "latency": 120,
      "status": "operational"
    },
    "providerDisplayName": "OpenAI"
  }
]
```

---

### 觸發模型健康檢查

一個管理端點，用於將所有已設定模型的健康檢查加入佇列。這對於強制刷新模型狀態很有用。

- **端點：** `GET /ai-providers/test-models`
- **權限：** 管理員

---

### 提供者健康狀態

提供所有已設定的提供者憑證的健康狀態摘要。此端點設計用於與監控和警報系統整合。

- **端點：** `GET /ai-providers/health`
- **權限：** 公開

**成功回應 (200 OK)**

```json
{
  "providers": {
    "openai": {
      "Default Key": {
        "running": true
      }
    },
    "anthropic": {
      "Primary Key": {
        "running": false
      }
    }
  },
  "timestamp": "2023-10-27T12:00:00.000Z"
}
```