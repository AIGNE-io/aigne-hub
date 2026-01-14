# 快速入门

本指南提供了一条直接、面向任务的路径，用于部署和操作 AIGNE Hub。遵循这些步骤，可在 30 分钟内配置一个功能齐全的实例，从而实现与上游 AI 提供商和下游应用程序的即时集成。

下图说明了入门的核心工作流程：

<!-- DIAGRAM_IMAGE_START:guide:4:3 -->
![Getting Started](assets/diagram/getting-started-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

## 前提条件

在继续之前，请确保满足以下要求：

*   **Blocklet Server：** 需要一个正在运行的 Blocklet Server 实例来托管 AIGNE Hub。
*   **AI 提供商账户：** 您必须拥有您打算连接的 AI 服务的有效账户和相应的 API 密钥（例如，OpenAI、Anthropic、Google Gemini）。

## 第 1 步：安装 AIGNE Hub

AIGNE Hub 以 Blocklet 的形式分发，确保了标准化和直接的安装过程。

1.  在您的 Blocklet Server 实例中，导航至 **Blocklet 商店**。
2.  使用搜索栏查找“AIGNE Hub”。
3.  在 AIGNE Hub blocklet 页面上，点击 **“启动”** 按钮。
4.  按照屏幕上的安装向导完成部署。系统将自动处理必要的设置和配置。

安装完成后，AIGNE Hub 将开始运行，并可从您的 Blocklet Server 仪表盘访问。

![AIGNE Hub 仪表盘](../../../blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 第 2 步：连接 AI 提供商

安装完成后，下一步是将 AIGNE Hub 连接到您选择的 AI 提供商。所有凭证在静态存储时都经过 AES 加密，以确保安全。

1.  访问 AIGNE Hub 管理仪表盘。
2.  通过侧边栏导航至配置部分：**配置 → AI 提供商**。
3.  点击 **“+ 添加提供商”** 按钮以打开配置模态框。
4.  从列表中选择所需的提供商（例如，OpenAI、Google Gemini）。
5.  输入您的 API 密钥以及任何其他必需的凭证或参数。
6.  保存配置。如果凭证有效，该提供商现在将出现在列表中，并显示“已连接”状态。

对您希望通过 AIGNE Hub 管理的所有 AI 提供商重复此过程。

![配置 AI 提供商](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

## 第 3 步：选择运营模式

AIGNE Hub 可以针对两种主要部署场景进行配置。您的选择将决定后续的使用和集成步骤。

### 用于企业内部

这是默认且最简单的模式，专为需要为内部应用提供集中式 AI 网关的团队设计。

*   **直接计费：** 您的组织将由 AI 提供商（OpenAI、Anthropic 等）直接计费。AIGNE Hub 会跟踪使用情况以进行分析，但不处理支付。
*   **安全访问：** 与您现有的 OAuth 提供商集成，为内部开发人员和应用程序提供安全的单点登录访问。

配置好提供商后，您的 AIGNE Hub 实例即可立即使用。请继续阅读[基本用法](#基本用法)部分。

### 用作服务提供商

此模式通过启用基于点数的计费系统，将 AIGNE Hub 转变为一个多租户、可商业化的服务。

*   **商业化：** 以点数为基础向最终用户收取 AI 使用费。您可以为每个模型设定价格，从而在上游提供商的成本之上创造利润空间。
*   **支付套件集成：** 此模式需要安装 **支付套件** blocklet，该套件负责处理点数购买、发票开具和支付处理。
*   **用户引导：** 自动为新用户授予起始点数余额，以鼓励用户使用。

要启用此模式，请导航至 **偏好设置**，启用基于点数的计费，并配置您的模型定价费率。

![配置模型费率](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

## 第 4 步：基本用法

配置完成后，您可以通过 AIGNE Hub 的统一端点开始发出 API 请求，或直接在内置的 Playground 中测试模型。

### 使用 Playground

Playground 提供了一个无代码界面，用于与任何已连接的 AI 模型进行交互。它是测试、提示工程和演示的绝佳工具。

1.  在 AIGNE Hub 仪表盘中导航至 **Playground** 部分。
2.  从下拉菜单中选择一个已连接的模型。
3.  输入您的提示并提交以接收响应。

![AIGNE Hub Playground](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

### 程序化使用

通过向 AIGNE Hub 的 OpenAI 兼容端点发出 API 调用，将其集成到您的应用程序中。以下示例展示了如何使用 `@aigne/aigne-hub` 客户端库。

```typescript AIGNEHubChatModel.ts icon=logos:typescript
// 将 AIGNE 框架与 AIGNE Hub 结合使用
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "your-oauth-access-key", // 使用通过 OAuth 生成的访问密钥
  model: "aignehub/gpt-3.5-turbo", // 模型名称前缀为 'aignehub/'
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

此代码片段初始化一个指向您自托管的 AIGNE Hub 实例的聊天模型客户端。它使用 OAuth 访问密钥进行身份验证，并通过该网关向 `gpt-3.5-turbo` 模型发出请求。

## 总结

您现已成功部署、配置并测试了您的 AIGNE Hub 实例。该网关已投入运营，随时准备为您的团队和应用程序提供 AI 功能。

有关更高级的配置和对平台功能的深入了解，请参阅以下文档：

<x-cards data-columns="2">
  <x-card data-title="部署场景" data-icon="lucide:server" data-href="/deployment-scenarios">
  探索企业自托管和公共服务提供商模式的详细架构。
  </x-card>
  <x-card data-title="API 参考" data-icon="lucide:code" data-href="/api-reference">
  查看聊天补全、图像生成和嵌入端点的技术规范。
  </x-card>
</x-cards>