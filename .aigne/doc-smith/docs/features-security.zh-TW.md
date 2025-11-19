# 安全性與存取控制

一個安全且管理良好的系統對於任何企業級部署都至關重要。本節詳細介紹 AIGNE Hub 健全的安全架構，涵蓋身份驗證、憑證管理、存取控制和日誌記錄，以確保您 AI 營運的完整性和機密性。

下圖提供了 AIGNE Hub 內部安全層和元件的高層次概覽：

```d2
direction: down

User: {
  shape: c4-person
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  Authentication: {
    label: "身份驗證層"
    shape: rectangle
    style: {
      stroke-dash: 2
      fill: "#f0f9ff"
    }

    DID-Connect: {
      label: "DID Connect"
      icon: "https://www.arcblock.io/image-bin/uploads/71eea946246150766324008427d2f63d.svg"
    }

    Blocklet-Server-Auth: {
      label: "Blocklet Server Auth"
    }

    auth-db: {
      label: "auth.db"
      shape: cylinder
    }
  }

  Admin-Panel: {
    label: "管理面板"
    shape: rectangle
    style: {
      fill: "#fffbe6"
    }

    RBAC-Middleware: {
      label: "RBAC 中介軟體\n(ensureAdmin)"
    }

    Admin-APIs: {
      label: "管理 API\n(管理供應商等)"
    }
  }

  Credential-Management: {
    label: "憑證管理"
    shape: rectangle
    style: {
      fill: "#f6ffed"
    }

    Encryption-Module: {
      label: "@blocklet/sdk/lib/security"
    }

    Encrypted-DB: {
      label: "加密的憑證\n(資料庫)"
      shape: cylinder
    }
  }

  Audit-Logging: {
    label: "稽核日誌"
    shape: cylinder
  }
}

Upstream-AI-Providers: {
  label: "上游 AI 供應商"
  shape: rectangle
}

User -> AIGNE-Hub.Authentication.DID-Connect: "1. 登入"
AIGNE-Hub.Authentication.DID-Connect -> AIGNE-Hub.Authentication.Blocklet-Server-Auth: "2. 驗證"
AIGNE-Hub.Authentication.Blocklet-Server-Auth -> AIGNE-Hub.Authentication.auth-db: "3. 管理會話"

User -> AIGNE-Hub.Admin-Panel.RBAC-Middleware: "4. 存取管理面板"
AIGNE-Hub.Admin-Panel.RBAC-Middleware -> AIGNE-Hub.Admin-Panel.Admin-APIs: "5. 授予/拒絕存取"

AIGNE-Hub.Admin-Panel.Admin-APIs -> AIGNE-Hub.Credential-Management.Encryption-Module: "6. 新增/更新供應商金鑰"
AIGNE-Hub.Credential-Management.Encryption-Module -> AIGNE-Hub.Credential-Management.Encrypted-DB: "7. 儲存加密金鑰"

AIGNE-Hub.Admin-Panel.Admin-APIs -> AIGNE-Hub.Audit-Logging: "記錄管理操作"
AIGNE-Hub.Credential-Management.Encryption-Module -> AIGNE-Hub.Audit-Logging: "記錄憑證事件"

AIGNE-Hub.Credential-Management.Encrypted-DB <-> Upstream-AI-Providers: "為其安全儲存 API 金鑰"
```

## 身份驗證

AIGNE Hub 與 Blocklet Server 的標準身份驗證機制整合，提供安全且統一的登入體驗。主要的身份驗證方法是透過 DID Connect，它利用去中心化身份實現無密碼且安全的存取。

### DID Connect 整合

所有使用者身份驗證都由底層的 Blocklet Server 環境處理。當使用者登入 AIGNE Hub 時，他們會透過 DID Connect 錢包驗證器進行身份驗證，確保存取權限與經過驗證的去中心化身份綁定。這種方法消除了對傳統使用者名稱/密碼組合的需求，降低了憑證被盜的風險。

系統使用一個身份驗證儲存資料庫（`auth.db`）來安全地管理會話權杖。

關於如何對 AIGNE Hub 進行程式化的 API 請求驗證的詳細資訊，請參閱 [API 身份驗證](./api-reference-authentication.md) 文件。

## 加密憑證儲存

儲存來自上游 AI 供應商的 API 金鑰和其他敏感憑證是一個關鍵的安全問題。AIGNE Hub 透過對所有敏感憑證資料實施強大的欄位級加密來解決這個問題。

### 加密機制

當您新增供應商的憑證（例如 API 金鑰或秘密存取金鑰）時，憑證的敏感部分會在儲存到資料庫之前被加密。

-   **加密目標**：僅加密敏感欄位。例如，在一個 `access_key_pair` 中，`secret_access_key` 會被加密，而 `access_key_id` 則以純文字形式保留以供識別。獨立的 `api_key` 值總是會被加密。
-   **技術**：加密和解密操作由 `@blocklet/sdk/lib/security` 模組處理，該模組提供強大的加密功能。

以下來自 `AiCredential` 模型的程式碼片段說明了這個過程：

```typescript ai-credential.ts icon=lucide:file-code
// 加密憑證值（僅加密敏感欄位）
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };

  // 加密敏感欄位
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }

  // access_key_id 保持純文字
  return encrypted;
}

// 解密憑證值
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };

  // 解密敏感欄位
  if (encryptedCredential.secret_access_key) {
    decrypted.secret_access_key = security.decrypt(encryptedCredential.secret_access_key);
  }
  if (encryptedCredential.api_key) {
    decrypted.api_key = security.decrypt(encryptedCredential.api_key);
  }

  return decrypted;
}
```

### 憑證遮罩

為了防止敏感金鑰在使用者介面中意外洩露，AIGNE Hub 會自動對憑證值進行遮罩。僅顯示金鑰的前四個和後四個字元，其餘部分由星號取代。

## 基於角色的存取控制 (RBAC)

AIGNE Hub 採用一個簡單而有效的基於角色的存取控制 (RBAC) 模型來限制對管理功能的存取。角色繼承自 Blocklet Server 環境。

### 可用角色

| 角色 | 權限 |
| :------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `owner` | 對 AIGNE Hub 實例擁有完整的管理存取權限。可以管理供應商、設定計費、查看分析以及管理所有設定。 |
| `admin` | 與 `owner` 具有相同的權限。此角色也被視為具有完整管理功能存取權限的特權使用者。 |
| `guest` | 標準使用者角色。可以使用 Hub 提供的 AI 服務（例如 Playground、API 存取），但無法存取管理設定。 |

對關鍵管理 API 端點的存取受到一個中介軟體的保護，該中介軟體驗證使用者的角色，確保只有具有 `owner` 或 `admin` 角色的使用者才能執行管理任務。

```typescript security.ts icon=lucide:shield
import { auth } from '@blocklet/sdk/lib/middlewares';

// 確保使用者具有 'owner' 或 'admin' 角色的中介軟體
export const ensureAdmin = auth({ roles: ['owner', 'admin'] });
```

## 稽核日誌

全面的稽核日誌對於安全分析、故障排除和合規性至關重要。AIGNE Hub 維護系統內所有重要活動的詳細日誌。

### 記錄的活動

-   **API 請求**：所有對 AI 端點的傳入請求都會被記錄，包括使用者、請求的模型和使用指標。
-   **管理操作**：在管理面板中執行的操作，例如新增或更新供應商、更改模型費率或修改設定，都會被記錄下來。
-   **憑證管理**：與供應商憑證的建立、修改或刪除相關的事件。

這些日誌提供了使用情況和管理變更的完整歷史記錄，對於安全稽核和營運監控非常有價值。

## 總結

AIGNE Hub 採用多層次的安全模型設計，以保護您的 AI 閘道。透過結合基於 DID 的身份驗證、對憑證的強力加密、基於角色的存取控制以及詳細的稽核日誌，它為內部企業使用和面向公眾的服務提供了一個安全的基礎。

有關相關功能的更多資訊，請參閱以下部分：

<x-cards data-columns="2">
  <x-card data-title="供應商管理" data-href="/features/provider-management" data-icon="lucide:server">了解如何連接和設定上游 AI 供應商。</x-card>
  <x-card data-title="用量與成本分析" data-href="/features/analytics" data-icon="lucide:pie-chart">探索如何監控全系統和每個使用者的消耗情況。</x-card>
</x-cards>