# 快速入门

本指南提供了部署、配置和开始使用 AIGNE Hub 的基本步骤。它专为需要高效运行系统的运营和基础设施团队而设计。

## 概述

AIGNE Hub 作为一个统一的 AI 网关，集中管理多个大语言模型（LLM）和 AIGC 服务提供商。它简化了 API 密钥管理、用量跟踪和计费，为您的生态系统内的所有 AI 服务提供了一个单一访问点。它基于 AIGNE 框架构建并作为 Blocklet 部署，为企业内部使用和面向公众的服务提供商模式提供了强大的解决方案。

![AIGNE Hub 仪表盘](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/c29f08420df8ea9a199fcb5ffe06febe.png)

## 1. 部署

AIGNE Hub 设计运行于 Blocklet Server 之上，后者提供了底层的编排、扩展和管理能力。

### 前提条件

- 一个正在运行的 Blocklet Server 实例。
- 对 Blocklet Server 的管理访问权限，以便安装和管理应用程序。

### 安装步骤

1.  **导航至 Blocklet 商店**：访问您的 Blocklet Server 仪表盘，并进入“商店”部分。
2.  **查找 AIGNE Hub**：使用搜索栏查找“AIGNE Hub”。
3.  **启动应用**：在 AIGNE Hub 页面上点击“启动”按钮。安装向导将引导您完成初始设置过程。

安装完成后，AIGNE Hub 将作为一项服务在您的 Blocklet Server 上运行。

## 2. 服务提供商配置

部署后，第一步是将 AIGNE Hub 连接到一个或多个 AI 服务提供商。这需要为您打算使用的服务添加必要的 API 密钥。

1.  **访问管理面板**：打开您的 AIGNE Hub 实例并导航至管理仪表盘。
2.  **进入 AI 服务提供商**：在管理面板中，找到配置部分并选择 **配置 → AI 服务提供商**。
3.  **添加 API 密钥**：从列表中选择您想要的 AI 服务提供商（例如，OpenAI、Anthropic、Google Gemini）并输入您的 API 密钥。凭证将被加密并安全存储。

![服务提供商配置](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/d037b6b6b092765ccbfa58706c241622.png)

## 3. 基本用法

配置好服务提供商后，AIGNE Hub 就可以处理 AI 请求了。应用程序可以与 Hub 的统一 API 端点进行交互。访问通常通过 OAuth 或生成的 API 访问密钥来保障安全。

以下 TypeScript 示例演示了如何使用 `@aigne/aigne-hub` 客户端库调用聊天模型。

```typescript
// 使用 AIGNE 框架与 AIGNE Hub
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// 配置客户端以指向您的 AIGNE Hub 实例
const model = new AIGNEHubChatModel({
  // 您的 AIGNE Hub 聊天 API 端点的完整 URL
  url: "https://your-aigne-hub-url/api/v2/chat",

  // 用于身份验证的 OAuth 访问密钥
  accessKey: "your-oauth-access-key",

  // 指定要使用的服务提供商和模型，例如 "openai/gpt-3.5-turbo"
  model: "openai/gpt-3.5-turbo",
});

// 向模型发送请求
const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

### 关键参数：

*   `url`：您自托管的 AIGNE Hub 实例的端点。
*   `accessKey`：从 AIGNE Hub 的身份验证系统获取的安全令牌，授予应用程序进行 API 调用的权限。
*   `model`：一个字符串标识符，用于同时指定服务提供商和模型（例如，`provider/model-name`）。AIGNE Hub 会根据此值将请求路由到相应的服务提供商。

## 后续步骤

基本设置完成后，您现在可以根据您的部署场景探索更高级的配置：

*   **企业内部使用**：将 Hub 与您的内部应用程序集成，并使用其内置的用户管理和安全功能来管理团队访问。
*   **服务提供商**：如果您计划将 AIGNE Hub 作为公共服务提供，下一步是安装 **Payment Kit** Blocklet，配置计费费率，并设置客户支付流程。