# 安全

AIGNE Hub 在设计上将安全作为核心原则，为身份验证、授权和数据保护提供了强大的机制。本文档概述了关键的安全功能和架构，为部署、运营和维护提供了见解。

## 身份验证

AIGNE Hub 采用多层身份验证策略来保护用户、应用程序和内部组件的访问安全。

### 用于用户身份验证的 DID-Connect

用户身份验证的主要机制是 `@arcblock/did-connect`，一个去中心化身份解决方案。这种方法利用了基于钱包的系统，允许用户无需传统密码即可进行身份验证。

- **存储**：身份验证令牌由 `did-connect-storage-nedb` 管理，它将回话数据存储在位于 `Config.dataDir/auth.db` 的本地 NeDB 数据库文件中。
- **处理器**：Blocklet SDK 中的 `WalletAuthenticator` 和 `WalletHandler` 类管理身份验证流程，包括质询生成、响应验证和令牌颁发。

### 组件间身份验证

Blocklet 架构内的内部服务和组件使用签名验证机制进行安全通信。

- **验证**：`ensureComponentCall` 中间件拦截组件之间的请求。它使用 Blocklet SDK 中的 `getVerifyData` 和 `verify` 来检查请求签名（`sig`）的有效性。
- **流程**：发出请求的组件对有效负载进行签名，接收组件在处理请求前验证此签名。这可以防止未经授权或被篡改的内部 API 调用。

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
      // 处理回退或抛出错误
    }
  };
}
```

## 授权

访问控制通过基于角色的系统进行管理，确保用户和服务仅有权执行其被授权的操作。

### 基于角色的访问控制（RBAC）

AIGNE Hub 定义了特定的角色，主要是 `owner` 和 `admin`，用于保护敏感的端点和操作。

- **中间件**：`ensureAdmin` 中间件是此 RBAC 的一个实际应用。它被应用于需要管理权限的路由，自动拒绝没有“owner”或“admin”角色的用户的请求。

```typescript
// blocklets/core/api/src/libs/security.ts

import { auth } from '@blocklet/sdk/lib/middlewares';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

// 用法示例（概念性）
// import { ensureAdmin } from './libs/security';
// app.use('/api/admin', ensureAdmin, adminRoutes);
```

这确保了关键的管理功能，如管理 AI 提供商或查看系统级分析，仅限于授权人员。

## 凭证管理

AIGNE Hub 的一个核心功能是能够安全地管理各种下游 AI 提供商的凭证。

### 安全存储与加密

敏感凭证，如 API 密钥和访问令牌，始终在静态时加密以防止未经授权的访问。

- **加密模块**：系统利用 `@blocklet/sdk/lib/security` 模块进行加密操作。
- **过程**：当创建或更新 AI 提供商凭证时，像 `api_key` 和 `secret_access_key` 这样的敏感字段在存储到数据库之前会通过 `security.encrypt` 函数处理。当需要凭证进行 API 调用时，它会被检索出来并在内存中使用 `security.decrypt` 进行解密。
- **数据模型**：`AiCredential` 模型明确定义了哪些字段是敏感的。非敏感的标识符如 `access_key_id` 则以明文形式保存，以方便管理和显示。

```typescript
// blocklets/core/api/src/store/models/ai-credential.ts

// 保存前加密敏感字段
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

// 解密敏感字段以供使用
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

### 凭证掩码

为防止在用户界面、日志或 API 响应中意外泄露，凭证的敏感部分会被掩码处理。`maskCredentialValue` 函数仅显示密钥的前 4 个和后 4 个字符，其余部分用星号遮蔽。

### 负载均衡与高可用性

AIGNE Hub 支持为单个 AI 提供商添加多个凭证。这既能实现负载均衡，也能提供高可用性。

- **算法**：使用平滑加权轮询算法来选择下一个可用的凭证用于请求。每个凭证都有一个 `weight`（默认为 100），系统动态调整一个 `current` 权重来决定接下来使用哪个密钥。
- **弹性**：这种机制将负载分散到多个密钥上，有助于避免速率限制并提供弹性。如果一个密钥被泄露或禁用，系统可以自动回退到同一提供商的其他活动密钥。
- **实现**：`AiCredential` 模型上的 `getNextAvailableCredential` 静态方法包含了此选择过程的逻辑。它查询给定 `providerId` 的所有活动凭证，并应用加权选择逻辑。