# 5. 模型費率管理

本節詳細說明 AI 模型費率的設定與管理，這是平台基於點數計費系統的基礎。營運商將在此找到定義定價、管理模型及排解計費錯誤所需的資訊。

## 5.1. 核心概念

**模型費率**是用於定義使用特定供應商的特定 AI 模型所需成本的紀錄。每項費率都指明了每個輸入 token 和每個輸出 token 所需收取的點數。此精細的定價結構是所有用量計算與計費的基礎。

關鍵組成部分包括：

*   **Provider**：AI 服務供應商（例如 OpenAI、Google、Bedrock）。
*   **Model**：特定的模型識別碼（例如 `gpt-4`、`gemini-1.5-pro-latest`）。
*   **Type**：模型的類型，例如 `chatCompletion`、`imageGeneration` 或 `embedding`。
*   **Rates**：
    *   `inputRate`：每 1,000 個輸入 token 的點數成本。
    *   `outputRate`：每 1,000 個輸出 token 或每張生成圖片的點數成本。
*   **Unit Costs**：模型以法定貨幣（例如美元）計價的實際成本，單位為每百萬個 token。此項用於自動化的批次價格調整。

準確且完整的模型費率設定至關重要。如果使用者嘗試呼叫的模型缺少費率，API 請求將會失敗，因為系統無法計算使用成本。

![模型費率管理介面](d037b6b6b092765ccbfa58706c241622.png)

## 5.2. 透過 API 管理模型費率

模型費率透過一組 RESTful API 端點進行管理。所有建立、更新及刪除操作皆需具備管理員權限。

### 5.2.1. 建立模型費率

此端點為單一供應商的特定模型註冊一項新費率。

*   **Endpoint**: `POST /api/ai-providers/:providerId/model-rates`
*   **Permissions**: Admin
*   **Body**:
    *   `model` (string, required)：模型識別碼。
    *   `type` (string, required)：模型類型。必須是 `chatCompletion`、`imageGeneration` 或 `embedding` 其中之一。
    *   `inputRate` (number, required)：輸入的點數成本。
    *   `outputRate` (number, required)：輸出的點數成本。
    *   `modelDisplay` (string, optional)：方便使用者閱讀的顯示名稱。
    *   `description` (string, optional)：模型的簡要描述。
    *   `unitCosts` (object, optional)：來自供應商的基礎成本。
        *   `input` (number, required)：每百萬個輸入 token 的成本。
        *   `output` (number, required)：每百萬個輸出 token 的成本。
    *   `modelMetadata` (object, optional)：額外的模型功能。

**請求範例**：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "gpt-4o",
    "type": "chatCompletion",
    "inputRate": 10,
    "outputRate": 30,
    "modelDisplay": "GPT-4 Omni",
    "unitCosts": {
      "input": 5.0,
      "output": 15.0
    },
    "modelMetadata": {
      "maxTokens": 128000,
      "features": ["tools", "vision"]
    }
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates
```

### 5.2.2. 批次建立模型費率

此端點允許同時為多個供應商建立相同的模型費率，適用於可從多家供應商取得的模型。

*   **Endpoint**: `POST /api/ai-providers/model-rates`
*   **Permissions**: Admin
*   **Body**: 與單一建立端點相同，但額外增加一個 `providers` 陣列。
    *   `providers` (array of strings, required)：應建立此費率的供應商 ID 列表。

**請求範例**：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "claude-3-sonnet",
    "type": "chatCompletion",
    "inputRate": 6,
    "outputRate": 30,
    "providers": ["prv_bedrock_xxxx", "prv_anthropic_yyyy"],
    "unitCosts": {
      "input": 3.0,
      "output": 15.0
    }
  }' \
  https://<your-domain>/api/ai-providers/model-rates
```

系統會驗證所有指定的供應商都存在，且該費率在目標供應商上對於指定的模型和類型尚未存在，以防止重複建立。

### 5.2.3. 更新模型費率

此端點用於修改現有的模型費率。

*   **Endpoint**: `PUT /api/ai-providers/:providerId/model-rates/:rateId`
*   **Permissions**: Admin
*   **Body**: 可提供建立欄位的一個子集。
    *   `modelDisplay`、`inputRate`、`outputRate`、`description`、`unitCosts`、`modelMetadata`。

**請求範例**：

```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "inputRate": 12,
    "outputRate": 35
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates/rate_zzzzzzzz
```

### 5.2.4. 刪除模型費率

此端點會永久移除一項模型費率。一旦刪除，對應的模型將無法再計費或使用。

*   **Endpoint**: `DELETE /api/ai-providers/:providerId/model-rates/:rateId`
*   **Permissions**: Admin

## 5.3. 批次價格更新

為簡化並維持一致的價格調整，系統提供基於已定義利潤率的批次更新機制。此功能在因應基礎供應商成本或點數價值的變動而需進行全域價格調整時特別有用。

*   **Endpoint**: `POST /api/ai-providers/bulk-rate-update`
*   **Permissions**: Admin
*   **Body**:
    *   `profitMargin` (number, required)：期望的利潤率百分比（例如 `20` 代表 20%）。
    *   `creditPrice` (number, required)：單一點數單位與 `unitCosts` 相同貨幣的有效價格（例如 `0.000005`，若 1 點 = $0.000005）。

**工作流程**：

1.  系統會擷取所有已填寫 `unitCosts` 欄位的 `AiModelRate` 紀錄。**未填寫此欄位的費率將被跳過。**
2.  對於每個有效的費率，系統會使用以下公式計算新的 `inputRate` 和 `outputRate`：
    `newRate = (unitCost / 1,000,000) * (1 + profitMargin / 100) / creditPrice`
3.  計算出的費率將應用於相應的紀錄。

這讓營運商能根據業務邏輯來維護定價，而無需手動重新計算每項費率。

## 5.4. 模型同步與健康狀態

系統包含測試已設定模型可用性與狀態的功能。

*   **Endpoint**: `GET /api/ai-providers/test-models`
*   **Permissions**: Admin
*   **Functionality**: 此端點會為每個已設定的模型費率觸發一個非同步作業。該作業會嘗試使用儲存的憑證向供應商驗證模型。結果（成功或失敗）將儲存於 `AiModelStatus` 資料表中，可用於判斷模型是否應對終端使用者開放。

**速率限制**：為防止濫用及對下游供應商 API 造成過大負載，此端點設有速率限制。預設情況下，管理員在 10 分鐘內最多可觸發此程序 5 次。

## 5.5. 資料模型 (`AiModelRate`)

為進行進階疑難排解，營運商可能需要直接檢查資料庫中的 `ai_model_rates` 資料表。

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | 費率紀錄的唯一識別碼（例如 `rate_xxxxxxxx`）。 |
| `providerId` | String | 連結至 `AiProvider` 紀錄的外鍵。 |
| `model` | String(100) | 模型的唯一識別碼（例如 `gpt-4o`）。 |
| `modelDisplay` | String(100) | 方便使用者閱讀的模型名稱（例如 `GPT-4 Omni`）。 |
| `type` | Enum | 模型的類型 (`chatCompletion`, `embedding`, `imageGeneration`)。 |
| `inputRate` | Decimal(10, 4) | 輸入 token 的點數成本。 |
| `outputRate` | Decimal(10, 4) | 輸出 token 或每張圖片的點數成本。 |
| `unitCosts` | JSON | 儲存來自供應商的基礎成本（例如 `{ "input": 5.0, "output": 15.0 }`）。 |
| `modelMetadata` | JSON | 儲存關於模型功能的元數據（例如 `maxTokens`, `features`）。 |

## 5.6. 營運考量

*   **缺少 `unitCosts`**：批次費率更新功能完全依賴 `unitCosts` 欄位。若某模型費率未填寫此欄位，該費率將在批次更新過程中被跳過。若營運商打算使用基於利潤率的定價工具，應確保此資料已準確輸入。

*   **定價問題疑難排解**：若使用者被收取非預期的 API 呼叫費用，第一步是查詢 `ai_model_rates` 資料表，找出所使用的確切模型和供應商。驗證 `inputRate` 和 `outputRate` 是否符合預期值。若手動更新或批次更新產生非預期的結果，可能會導致差異。

*   **模型不可用**：若某模型對使用者持續失敗，營運商可使用 `GET /test-models` 端點觸發健康狀態檢查。檢查結果將顯示在 `ai_model_status` 資料表中，有助於診斷問題是出在模型本身、供應商還是儲存的憑證。