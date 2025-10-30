# 身份验证

所有对 AIGNE Hub 的 API 请求都必须经过身份验证，以确保对网关及其集成的 AI 服务的安全访问。本文档概述了所有 API 交互所需的基于令牌的身份验证机制。

API 的访问通过 Bearer 令牌进行控制。每个请求的 `Authorization` 标头中都必须包含一个有效的令牌。未经身份验证的请求或凭据无效的请求将导致错误。

有关可用端点的更多详细信息，请参阅 [V2 端点（推荐）](./api-reference-v2-endpoints.md) 部分。

## 身份验证流程

该流程始于管理员通过 AIGNE Hub 的用户界面生成访问令牌。然后，该令牌被提供给客户端应用程序，客户端应用程序将其包含在每个 API 请求的标头中。AIGNE Hub API 在处理请求之前会验证此令牌。

```d2
shape: sequence_diagram

Admin: {
  shape: c4-person
}

AIGNE-Hub-Admin-UI: {
  label: "AIGNE Hub\n管理界面"
}

Client-Application: {
  label: "客户端应用程序"
}

AIGNE-Hub-API: {
  label: "AIGNE Hub API"
}

Admin -> AIGNE-Hub-Admin-UI: "1. 生成访问令牌"
AIGNE-Hub-Admin-UI -> Admin: "2. 提供令牌"
Admin -> Client-Application: "3. 使用令牌进行配置"

Client-Application -> AIGNE-Hub-API: "4. API 请求\n(Authorization: Bearer <token>)"
AIGNE-Hub-API -> AIGNE-Hub-API: "5. 验证令牌和权限"

"如果已授权" {
  AIGNE-Hub-API -> Client-Application: "6a. 200 OK 响应"
}

"如果未授权" {
  AIGNE-Hub-API -> Client-Application: "6b. 401 Unauthorized 错误"
}
```

## 发起经身份验证的请求

要对 API 请求进行身份验证，您必须包含一个含有 Bearer 令牌的 `Authorization` 标头。

**标头格式：**

```
Authorization: Bearer <YOUR_ACCESS_TOKEN>
```

请将 `<YOUR_ACCESS_TOKEN>` 替换为从 AIGNE Hub 管理界面生成的实际 OAuth 访问密钥。

### 示例：cURL 请求

此示例演示了如何使用 `curl`向聊天补全端点发起请求。

```bash 使用 cURL 发起 API 请求 icon=cib:curl
curl -X POST 'https://your-aigne-hub-url/api/v2/chat/completions' \
-H 'Authorization: Bearer your-oauth-access-key' \
-H 'Content-Type: application/json' \
-d '{
  "model": "openai/gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, AIGNE Hub!"
    }
  ]
}'
```

### 示例：Node.js 客户端

使用官方 AIGNE Hub 客户端库时，身份验证标头会自动管理。

```typescript AIGNE Hub 客户端 icon=logos:nodejs
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "your-oauth-access-key",
  model: "aignehub/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

## 错误处理

如果身份验证失败，API 将响应 HTTP `401 Unauthorized` 状态码。这表明请求中提供的凭据存在问题。

导致 `401` 错误的常见原因包括：

| 原因 | 描述 |
| :--- | :--- |
| **缺少令牌** | 请求中未包含 `Authorization` 标头。 |
| **无效令牌** | 提供的令牌格式错误、已过期或已被撤销。 |
| **权限不足** | 令牌有效，但关联的用户或应用程序缺少访问所请求资源的必要权限。 |

### 错误响应示例

失败的身份验证尝试将返回一个包含错误详细信息的 JSON 对象。

```json 未经授权的响应 icon=mdi:code-json
{
  "error": "Unauthorized",
  "message": "Authentication token is invalid or missing."
}
```

如果您收到此响应，请在重试请求前，验证您的访问令牌是否正确、是否尚未过期，并拥有所需权限。

## 总结

本节详细介绍了 AIGNE Hub API 的 Bearer 令牌身份验证机制。所有请求都必须在 `Authorization` 标头中包含一个有效的令牌。有关具体端点的详细信息，请继续阅读 [V2 端点（推荐）](./api-reference-v2-endpoints.md) 文档。