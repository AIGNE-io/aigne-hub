# AIGNE Hub 入门指南

本指南为部署、配置和验证您的 AIGNE Hub 实例提供了全面的演练。它专为负责管理系统的运营和基础设施团队设计。

## 先决条件

在继续安装之前，请确保您的环境满足以下要求：

- **Blocklet Server**：需要一个正在运行的 Blocklet Server 实例来托管 AIGNE Hub。有关安装和管理说明，请参阅官方 [Blocklet Server 文档](https://docs.blocklet.io/docs/en/getting-started)。
- **Node.js**：AIGNE Hub 需要 Node.js 18 或更高版本。Blocklet Server 会管理 Node.js 运行时，因此请确保您的服务器环境是最新版本。
- **AI 提供商账户**：您需要拥有计划集成的 AI 提供商（例如 OpenAI、Anthropic、Google Gemini）的有效账户和 API 密钥。

该系统使用集成的 SQLite 数据库，通过 Sequelize ORM 进行管理，该数据库在安装过程中会自动配置。标准部署无需进行外部数据库设置。

## 安装

AIGNE Hub 是从官方 Blocklet 商店部署的 Blocklet。

1.  **导航至 Blocklet 商店**：访问您的 Blocklet Server 仪表盘，然后进入“商店”部分。
2.  **查找 AIGNE Hub**：使用搜索栏查找“AIGNE Hub”。
3.  **启动 Blocklet**：在 AIGNE Hub 页面上点击“启动”按钮。安装向导将引导您完成整个过程，通常包括确认 Blocklet 名称和 URL。

安装完成后，AIGNE Hub 实例将开始运行，并可通过您配置的 URL 进行访问。

![AIGNE Hub 仪表盘](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

## 初始配置

安装完成后，第一步是配置您希望通过该 Hub 提供的 AI 提供商。

1.  **访问管理面板**：打开您的 AIGNE Hub 实例并导航至管理仪表盘。
2.  **前往 AI 提供商**：在管理面板中，找到配置部分并选择 **AI 提供商**。
3.  **添加提供商密钥**：从列表中选择一个 AI 提供商，然后输入您的 API 密钥和任何其他必需的凭据。该 Hub 会对这些密钥进行加密并安全存储。您可以添加多个提供商。

![配置 AI 提供商](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 部署模型

AIGNE Hub 支持两种主要的运营模型。请选择符合您组织需求的模型。

### 1. 内部使用（企业自托管）

这是默认且最简单的部署模型，非常适合内部开发团队。

-   **运营**：一旦配置了 AI 提供商，该 Hub 就准备好处理请求。
-   **身份验证**：可以通过直接 API 访问或与 OAuth 提供商集成来管理访问，以实现安全的集中式身份验证。
-   **计费**：您的组织将由 AI 提供商根据使用情况直接计费。AIGNE Hub 提供了在内部跟踪此消耗的工具。

### 2. 服务提供商模式

此模型适用于希望向外部客户提供 AI 服务的组织。

-   **启用计费**：要启用此模式，请安装 **Payment Kit** Blocklet 并将其与 AIGNE Hub 集成。
-   **设置自定义定价**：为不同模型配置您自己的定价费率，从而可以设置利润空间。
-   **积分系统**：用户通过 Payment Kit 购买积分以支付其 AI 使用费用。系统会自动管理积分扣除和用户引导。

## 验证安装

配置完成后，使用内置的 AI Playground 验证该 Hub 是否正常运行。

1.  **打开 Playground**：在 AIGNE Hub 用户界面中导航至“Playground”部分。
2.  **选择模型**：选择您配置的 AI 模型之一（例如 `openai/gpt-4`）。
3.  **发送请求**：在输入框中输入提示并发送请求。

如果您收到模型的成功响应，则表示您的 AIGNE Hub 实例已正确配置并完全可以运行。

![AI Playground](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

## 基本使用示例

应用程序可以通过其 RESTful API 与 AIGNE Hub 交互。使用 AIGNE 框架时，`AIGNEHubChatModel` 提供了一个无缝的集成点。

以下 TypeScript 示例演示了如何通过该 Hub 调用聊天模型。

```typescript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// 使用您的 Hub 配置初始化模型
const model = new AIGNEHubChatModel({
  // 您的 AIGNE Hub API 端点的 URL
  baseURL: "https://your-aigne-hub-url",

  // 通过 OAuth 获取或为应用程序生成的安全访问密钥
  apiKey: "your-oauth-access-key",

  // 指定要使用的提供商和模型
  model: "aignehub/gpt-3.5-turbo",
});

async function getCompletion() {
  try {
    const result = await model.invoke({
      messages: "Hello, AIGNE Hub!",
    });

    console.log("AI Response:", result);
  } catch (error) {
    console.error("Error invoking model:", error);
  }
}

getCompletion();
```

-   `url`：指向您的 AIGNE Hub 聊天补全 API 端点的完整 URL。
-   `accessKey`：用于身份验证的访问密钥。对于生产系统，这应该是一个通过 OAuth 流程获得的安全令牌。
-   `model`：一个标识提供商和模型的字符串，格式为 `provider/model-name`。