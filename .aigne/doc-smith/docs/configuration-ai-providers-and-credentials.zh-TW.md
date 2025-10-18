# AI 提供商

AI 提供商 API 是整合與設定各種外部人工智慧服務的中央管理層。它作為一個抽象層，提供一個統一的介面來管理憑證、定義模型定價以及監控不同 AI 提供商的健康狀況。此系統專為可擴展性和彈性而設計，整合了加密憑證儲存和跨多個 API 金鑰的負載平衡等功能。

## 核心概念

理解這些核心概念對於操作和維護 AI 提供商的整合至關重要。

### 提供商

**提供商**代表一個外部 AI 服務，例如 OpenAI、Google Gemini 或 Amazon Bedrock。每個提供商都配置了必要的詳細資訊，讓系統能夠與其 API 互動。

- **`name`**：提供商的唯一識別碼（例如 `openai`、`bedrock`）。
- **`displayName`**：提供商的人類可讀名稱。
- **`baseUrl`**：提供商 API 的基礎端點。對於某些服務（如 Amazon Bedrock），此項可能不是必需的。
- **`region`**：需要指定雲端區域的服務所使用的特定區域（例如 AWS 的 `us-east-1`）。
- **`enabled`**：一個布林值標記，用於在全系統範圍內啟用或停用該提供商。

### 憑證

憑證用於對發送給 AI 提供商的請求進行身份驗證。系統設計為可為單一提供商管理多個憑證，以增強可靠性和吞吐量。

#### 安全性與加密

為確保安全，憑證的敏感部分（例如 `api_key` 或 `secret_access_key`）會使用 blocklet 原生的 `security.encrypt` 函式進行靜態加密。只有非敏感的識別碼（如 `access_key_id`）會以純文字形式儲存。當透過 API 檢索憑證以供顯示時，敏感值會被遮罩以防止意外洩露。

#### 憑證類型

- **`api_key`**：用於身份驗證的單一密鑰。
- **`access_key_pair`**：一對金鑰，通常是 `access_key_id` 和 `secret_access_key`。
- **`custom`**：一種靈活的物件結構，適用於具有獨特身份驗證方案的提供商。

#### 負載平衡

對於擁有多個有效憑證的提供商，系統會實作一種平滑加權輪詢演算法。此機制會根據分配的權重將 API 請求分佈到可用的金鑰上，確保沒有單一憑證成為瓶頸。

- 每個憑證都有一個 `weight`（預設為 100）。
- 該演算法會選擇當前有效權重最高的憑證，然後在後續選擇中降低其有效權重。
- 這種方法能隨著時間的推移提供平衡的負載分佈，從而提高容錯能力。如果某個憑證失敗，它會被標記為非作用中，並暫時從輪換中移除，直到重新驗證為止。

### 模型費率

模型費率定義了使用來自提供商的特定 AI 模型的成本，構成了基於點數的計費系統的基礎。

- 每個費率都將一個 `model`（例如 `gpt-4-turbo`）與一個 `providerId` 連結起來。
- 它指定了 `inputRate` 和 `outputRate`，代表每個 token（或其他單位）所收取的點數。
- 費率還可以包括 `unitCosts`（提供商的實際美元成本）和 `modelMetadata`，例如最大 token 數和支援的功能（`tools`、`vision` 等）。

---

## API 端點

以下部分詳細介紹了用於管理 AI 提供商、憑證和模型費率的 RESTful API。

### 提供商管理

用於建立、檢索、更新和刪除 AI 提供商的端點。

- **列出提供商**
  - `GET /api/ai-providers`
  - 檢索所有已設定的 AI 提供商列表，包括其關聯的憑證和模型費率。

- **建立提供商**
  - `POST /api/ai-providers`
  - 建立一個新的 AI 提供商。提供商的 `name` 必須是唯一的。
  - **Body:**
    ```json
    {
      "name": "openai",
      "displayName": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "enabled": true
    }
    ```

- **更新提供商**
  - `PUT /api/ai-providers/:id`
  - 更新現有提供商的設定。

- **刪除提供商**
  - `DELETE /api/ai-providers/:id`
  - 刪除一個提供商及其所有關聯的憑證和模型費率。

### 憑證管理

用於管理特定提供商憑證的端點。

- **建立憑證**
  - `POST /api/ai-providers/:providerId/credentials`
  - 為提供商新增一個新憑證。系統在儲存前會對照提供商的 API 驗證該憑證。
  - **Body:**
    ```json
    {
      "name": "My API Key",
      "value": "sk-...",
      "credentialType": "api_key"
    }
    ```

- **更新憑證**
  - `PUT /api/ai-providers/:providerId/credentials/:credentialId`
  - 更新現有憑證。此操作也會觸發重新驗證。

- **刪除憑證**
  - `DELETE /api/ai-providers/:providerId/credentials/:credentialId`
  - 從提供商中移除一個憑證。

- **檢查憑證狀態**
  - `GET /api/ai-providers/:providerId/credentials/:credentialId/check`
  - 手動觸發對特定憑證的驗證檢查。這對於疑難排解和重新啟用先前被標記為非作用中的金鑰很有用。

### 模型費率管理

用於管理 AI 模型定價的端點。

- **列出所有模型費率**
  - `GET /api/ai-providers/model-rates`
  - 檢索所有提供商的所有模型費率的分頁和可搜尋列表。支援按 `providerId` 和 `model` 進行篩選。

- **批次建立模型費率**
  - `POST /api/ai-providers/model-rates`
  - 同時為多個提供商建立相同的模型費率。
  - **Body:**
    ```json
    {
      "model": "claude-3-sonnet",
      "type": "chatCompletion",
      "inputRate": 3,
      "outputRate": 15,
      "providers": ["provider-id-1", "provider-id-2"]
    }
    ```

- **更新模型費率**
  - `PUT /api/ai-providers/:providerId/model-rates/:rateId`
  - 更新特定模型的費率、描述或元資料。

- **批次更新費率**
  - `POST /api/ai-providers/bulk-rate-update`
  - 更新所有已定義 `unitCosts` 的模型費率。新費率會根據指定的 `profitMargin` 和 `creditPrice` 計算。此端點專為全系統範圍的價格調整而設計。
  - **Body:**
    ```json
    {
      "profitMargin": 20,
      "creditPrice": 0.001
    }
    ```

### 模型探索

供用戶端應用程式用來擷取可用模型的公開端點。

- **取得可用模型**
  - `GET /api/ai-providers/models`
  - 以 LiteLLM 格式傳回所有可用且已啟用模型的扁平化列表。這是需要探索模型的服務所使用的主要端點。

- **取得聊天模型**
  - `GET /api/ai-providers/chat/models`
  - 傳回按模型名稱分組的模型列表，顯示每個模型支援哪些提供商。這主要由 UI 使用。

### 系統操作

用於系統監控和維護任務的端點。

- **健康檢查**
  - `GET /api/ai-providers/health`
  - 提供所有提供商的所有憑證的運作狀態快照。它會傳回一個 JSON 物件，指出每個憑證是否 `running`。此端點對於監控和警報至關重要。
  - **回應範例：**
    ```json
    {
      "providers": {
        "openai": {
          "Primary Key": { "running": true },
          "Secondary Key": { "running": false }
        }
      },
      "timestamp": "2023-10-27T10:00:00.000Z"
    }
    ```

- **測試模型**
  - `GET /api/ai-providers/test-models`
  - 觸發一個非同步作業，以測試與已設定費率相關的模型的有效性和狀態。此端點有速率限制以防止濫用。

---

## 操作指南

### 監控

監控 AI 提供商整合的主要端點是 `GET /api/ai-providers/health`。應將其整合到您現有的監控與警報基礎設施中。

- **操作：** 定期輪詢 `/health` 端點。
- **警報條件：** 如果任何憑證的 `running` 狀態為 `false`，則觸發警報。
- **檢查範例：**
  ```bash
  curl -s http://localhost:3030/api/ai-providers/health | jq '.providers[].[] | select(.running == false)'
  ```
  如果以上命令產生任何輸出，應觸發警報。

### 疑難排解

- **憑證失敗：** 當對提供商的 API 呼叫因驗證錯誤而失敗時，相關的憑證會自動被標記為非作用中（`active: false`）並儲存錯誤訊息。它會從負載平衡的輪換中移除。
- **重新啟用憑證：** 要重新啟用憑證，首先透過 `PUT /api/ai-providers/:providerId/credentials/:credentialId` 使用正確的金鑰更新它。系統將會重新驗證。或者，您可以使用 `GET .../check` 端點手動觸發驗證。
- **測試的速率限制：** `GET /api/ai-providers/test-models` 端點有嚴格的速率限制（每位使用者每 10 分鐘 5 次請求），以防止對下游 AI 提供商 API 造成過大負擔。如果您收到 `429 Too Many Requests` 錯誤，請等待指定的 `retryAfter` 期間。