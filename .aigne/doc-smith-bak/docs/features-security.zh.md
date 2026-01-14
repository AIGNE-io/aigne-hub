# 安全与访问

一个安全且管理良好的系统对于任何企业级部署都至关重要。本节详细介绍 AIGNE Hub 强大的安全架构，涵盖身份验证、凭证管理、访问控制和日志记录，以确保您 AI 操作的完整性和机密性。

下图提供了 AIGNE Hub 内部安全层和组件的高层概览：

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Security & Access](assets/diagram/security-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

## 身份验证

AIGNE Hub 与 Blocklet Server 的标准身份验证机制集成，提供安全统一的登录体验。主要的身份验证方法是通过 DID Connect，它利用去中心化身份实现无密码的安全访问。

### DID Connect 集成

所有用户身份验证均由底层的 Blocklet Server 环境处理。当用户登录 AIGNE Hub 时，他们通过 DID Connect 钱包验证器进行身份验证，确保访问权限与经过验证的去中心化身份绑定。这种方法消除了对传统用户名/密码组合的需求，从而降低了凭证被盗的风险。

系统使用一个身份验证存储数据库（`auth.db`）来安全地管理会话令牌。

有关如何对 AIGNE Hub 的编程 API 请求进行身份验证的详细信息，请参阅 [API 身份验证](./api-reference-authentication.md)文档。

## 加密凭证存储

存储来自上游 AI 提供商的 API 密钥和其他敏感凭证是一个关键的安全问题。AIGNE Hub 通过对所有敏感凭证数据实施强大的字段级加密来解决此问题。

### 加密机制

当您添加提供商的凭证（如 API 密钥或秘密访问密钥）时，凭证的敏感部分在存入数据库前会被加密。

-   **加密目标**：仅加密敏感字段。例如，在一个 `access_key_pair` 中，`secret_access_key` 会被加密，而 `access_key_id` 则保持明文以便于识别。独立的 `api_key` 值总是会被加密。
-   **技术**：加密和解密操作由 `@blocklet/sdk/lib/security` 模块处理，该模块提供了强大的密码学功能。

以下来自 `AiCredential` 模型的代码片段演示了此过程：

```typescript ai-credential.ts icon=lucide:file-code
// 加密凭证值（仅加密敏感字段）
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };

  // 加密敏感字段
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }

  // access_key_id 保持明文
  return encrypted;
}

// 解密凭证值
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };

  // 解密敏感字段
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

为防止敏感密钥在用户界面中意外暴露，AIGNE Hub 会自动对凭证值进行掩码处理。仅显示密钥的前四个和后四个字符，其余部分由星号替换。

## 基于角色的访问控制 (RBAC)

AIGNE Hub 采用一种简单而有效的基于角色的访问控制 (RBAC) 模型来限制对管理功能的访问。角色继承自 Blocklet Server 环境。

### 可用角色

| 角色 | 权限 |
| :------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `owner` | 对 AIGNE Hub 实例拥有完全的管理访问权限。可以管理提供商、配置计费、查看分析以及管理所有设置。 |
| `admin` | 与 `owner` 拥有相同的权限。此角色也被视为具有完全管理功能访问权限的特权用户。 |
| `guest` | 标准用户角色。可以使用 Hub 提供的 AI 服务（例如 Playground、API 访问），但无法访问管理配置。 |

对关键管理 API 端点的访问受一个中间件保护，该中间件会验证用户的角色，确保只有具有 `owner` 或 `admin` 角色的用户才能执行管理任务。

```typescript security.ts icon=lucide:shield
import { auth } from '@blocklet/sdk/lib/middlewares';

// 确保用户角色为 'owner' 或 'admin' 的中间件
export const ensureAdmin = auth({ roles: ['owner', 'admin'] });
```

## 审计日志

全面的审计日志对于安全分析、故障排查和合规性至关重要。AIGNE Hub 维护系统内所有重要活动的详细日志。

### 记录的活动

-   **API 请求**：所有对 AI 端点的传入请求都会被记录，包括用户、请求的模型和使用指标。
-   **管理操作**：在管理面板中执行的操作，例如添加或更新提供商、更改模型费率或修改配置，都会被记录。
-   **凭证管理**：与提供商凭证的创建、修改或删除相关的事件。

这些日志提供了使用情况和管理变更的完整历史记录，对于安全审计和运营监控非常有价值。

## 总结

AIGNE Hub 采用多层安全模型设计，以保护您的 AI 网关。通过结合基于 DID 的身份验证、对凭证的强加密、基于角色的访问控制和详细的审计日志，它为内部企业使用和面向公众的服务提供了一个安全的基础。

有关相关功能的更多信息，请参阅以下部分：

<x-cards data-columns="2">
  <x-card data-title="提供商管理" data-href="/features/provider-management" data-icon="lucide:server">了解如何连接和配置上游 AI 提供商。</x-card>
  <x-card data-title="用量与成本分析" data-href="/features/analytics" data-icon="lucide:pie-chart">探索如何监控全系统和每个用户的消耗情况。</x-card>
</x-cards>