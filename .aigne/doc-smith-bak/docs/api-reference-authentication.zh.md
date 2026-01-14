# API 身份验证

对 AIGNE Hub API 的请求进行安全身份验证是实现程序化访问和集成的关键步骤。本指南清晰地介绍了使用 API 密钥授权您的应用程序的分步流程，确保所有交互都是安全的并得到正确识别。

## 身份验证方法

AIGNE Hub 的 RESTful API 主要使用带有 API 密钥的持有者身份验证（bearer authentication）。所有 API 请求都必须包含一个含有有效 API 密钥的 `Authorization` 标头。这种方法直接、安全，并符合服务到服务通信的行业最佳实践。

## 生成 API 密钥

在进行身份验证之前，您必须从 AIGNE Hub 管理界面生成一个 API 密钥。

1.  在您的 AIGNE Hub 实例中，导航至 **设置 (Settings)** 部分。
2.  选择 **API 密钥 (API Keys)** 选项卡。
3.  点击 **“生成新密钥 (Generate New Key)”** 按钮。
4.  为您的密钥提供一个描述性名称，以便日后识别其用途（例如，`dev-server-integration`, `analytics-script-key`）。
5.  系统将生成一个新密钥。**请立即复制此密钥并将其存放在安全的位置。** 出于安全原因，在您离开此页面后，完整的密钥将不会再次显示。

## 使用 API 密钥

要验证一个 API 请求，请将 API 密钥包含在 HTTP 请求的 `Authorization` 标头中。该值必须以 `Bearer ` 方案作为前缀。

### HTTP 标头格式

```
Authorization: Bearer <YOUR_API_KEY>
```

将 `<YOUR_API_KEY>` 替换为您实际生成的密钥。

### 使用 cURL 的请求示例

以下是使用 `cURL` 向聊天补全 (Chat Completions) 端点发出经身份验证请求的示例。

```bash 经身份验证的 API 请求 icon=lucide:terminal
curl -X POST https://your-aigne-hub-url/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "aignehub/gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 在 Node.js 应用程序中的示例

在与应用程序集成时，您将在 HTTP 客户端库中设置 `Authorization` 标头。以下示例使用了 AIGNE Hub SDK，它简化了这一过程。

```javascript AIGNEHubChatModel.js icon=logos:javascript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "YOUR_API_KEY", // SDK 会处理添加 "Bearer " 前缀
  model: "aignehub/gpt-3.5-turbo",
});

async function getGreeting() {
  try {
    const result = await model.invoke({
      messages: [{ role: "user", content: "Hello, AIGNE Hub!" }],
    });
    console.log(result);
  } catch (error) {
    console.error("API request failed:", error.message);
  }
}

getGreeting();
```

在此示例中，提供给 `AIGNEHubChatModel` 构造函数的 `apiKey` 会被自动放入正确的 `Authorization` 标头中，用于该模型实例后续发出的所有 API 调用。

## 安全最佳实践

-   **像对待密码一样对待 API 密钥。** 将它们安全地存储在密钥管理器或环境变量中。切勿在客户端代码中暴露它们，或将它们提交到版本控制中。
-   **为不同的应用程序使用不同的密钥。** 这种做法被称为最小权限原则，可以在单个密钥泄露时限制其影响。
-   **定期轮换密钥。** 定期撤销旧密钥并生成新密钥，以降低因密钥泄露而导致未经授权访问的风险。
-   **监控 API 使用情况。** 密切关注分析仪表板，以检测任何可能表明密钥已泄露的异常活动。

## 总结

对 AIGNE Hub API 的身份验证是通过包含在 `Authorization` 标头中作为持有者令牌（bearer tokens）的 API 密钥来处理的。通过遵循上述生成流程和安全最佳实践，您可以确保对所有 API 端点进行安全可靠的程序化访问。

有关特定端点的更多信息，请参阅以下部分：
- [聊天补全](./api-reference-chat-completions.md)
- [图像生成](./api-reference-image-generation.md)
- [嵌入](./api-reference-embeddings.md)