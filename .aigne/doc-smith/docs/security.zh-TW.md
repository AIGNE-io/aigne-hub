# 安全性

AIGNE Hub 的設計以安全性為核心原則，為身份驗證、授權和資料保護提供了強大的機制。本文件概述了關鍵的安全功能和架構，為部署、營運和維護提供了深入見解。

## 身份驗證

AIGNE Hub 採用多層次的身份驗證策略，以保護使用者、應用程式和內部元件的存取安全。

### 使用 DID-Connect 進行使用者身份驗證

使用者身份驗證的主要機制是 `@arcblock/did-connect`，這是一個去中心化的身份解決方案。這種方法利用了基於錢包的系統，允許使用者無需傳統密碼即可進行身份驗證。

- **儲存**：身份驗證權杖由 `did-connect-storage-nedb` 管理，它將會話資料儲存在位於 `Config.dataDir/auth.db` 的本地 NeDB 資料庫檔案中。
- **處理程式**：來自 Blocklet SDK 的 `WalletAuthenticator` 和 `WalletHandler` 類別管理身份驗證流程，包括挑戰的生成、回應的驗證和權杖的發行。

### 元件間身份驗證

Blocklet 架構內的內部服務和元件使用簽章驗證機制進行安全通訊。

- **驗證**：`ensureComponentCall` 中介軟體會攔截元件之間的請求。它使用 Blocklet SDK 中的 `getVerifyData` 和 `verify` 來檢查請求簽章（`sig`）的有效性。
- **流程**：發出請求的元件對負載（payload）進行簽章，接收元件在處理請求前會驗證此簽章。這可以防止未經授權或被竄改的內部 API 呼叫。

```typescript
// blocklets/core/api/src/libs/security.ts

import { getVerifyData, verify } from '@blocklet/sdk/lib/util/verify-sign';

export function ensureComponentCall(fallback?: (req, res, next) => any) {
  return (req, res, next) => {
    try {
      const { data, sig } = getVerifyData(req);
      const verified = verify(data, sig);
      if (!verified) throw new CustomError(401, 'verify sig failed');
      next();
    } catch (error) {
      // 處理備用方案或拋出錯誤
    }
  };
}
```

## 授權

存取控制是透過一個基於角色的系統來管理的，確保使用者和服務僅有權限執行其被授權的操作。

### 基於角色的存取控制 (RBAC)

AIGNE Hub 定義了特定的角色，主要是 `owner` 和 `admin`，用於保護敏感的端點和操作。

- **中介軟體**：`ensureAdmin` 中介軟體是此 RBAC 的一個實際應用。它被應用於需要管理權限的路由，會自動拒絕非 `owner` 或 `admin` 角色的使用者請求。

```typescript
// blocklets/core/api/src/libs/security.ts

import { auth } from '@blocklet/sdk/lib/middlewares';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

// 使用範例 (概念性)
// import { ensureAdmin } from './libs/security';
// app.use('/api/admin', ensureAdmin, adminRoutes);
```

這確保了關鍵的管理功能，例如管理 AI 供應商或查看全系統的分析數據，僅限於授權人員。

## 憑證管理

AIGNE Hub 的一個核心功能是能夠安全地管理各種下游 AI 供應商的憑證。

### 安全儲存與加密

敏感憑證，如 API 金鑰和存取權杖，始終進行靜態加密，以防止未經授權的存取。

- **加密模組**：系統利用 `@blocklet/sdk/lib/security` 模組進行加密操作。
- **流程**：當建立或更新 AI 供應商憑證時，像 `api_key` 和 `secret_access_key` 這樣的敏感欄位會先經過 `security.encrypt` 函數處理，然後再儲存到資料庫中。當需要使用憑證進行 API 呼叫時，它會被擷取並在記憶體中使用 `security.decrypt` 進行解密。
- **資料模型**：`AiCredential` 模型明確定義了哪些欄位是敏感的。非敏感的識別碼，如 `access_key_id`，則以純文字形式保存，以便於管理和顯示。

```typescript
// blocklets/core/api/src/store/models/ai-credential.ts

// 儲存前對敏感欄位進行加密
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }
  return encrypted;
}

// 解密敏感欄位以供使用
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };
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

為防止在使用者介面、日誌或 API 回應中意外洩露，憑證的敏感部分會被遮罩。`maskCredentialValue` 函數僅顯示金鑰的前 4 個和後 4 個字元，其餘部分則用星號遮蔽。

### 負載平衡與高可用性

AIGNE Hub 支援為單一 AI 供應商新增多個憑證。這使得負載平衡和高可用性成為可能。

- **演算法**：使用平滑加權輪詢演算法來為請求選擇下一個可用的憑證。每個憑證都有一個 `weight`（預設為 100），系統會動態調整一個 `current` 權重來決定接下來使用哪個金鑰。
- **彈性**：此機制將負載分散到多個金鑰上，有助於避免速率限制並提供彈性。如果某個金鑰被洩露或停用，系統可以自動切換到同一供應商的其他活動金鑰。
- **實作**：`AiCredential` 模型上的 `getNextAvailableCredential` 靜態方法包含了此選擇過程的邏輯。它會查詢給定 `providerId` 的所有活動憑證，並應用加權選擇邏輯。