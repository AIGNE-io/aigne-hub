# 概述

是否在为管理日益增多的 API 密钥、计费系统以及与不同 AI 提供商的集成而烦恼？本文档将全面介绍 AIGNE Hub，这是一个统一的 AI 网关，旨在简化这种复杂性。您将了解其核心功能、主要优势和系统架构，从而清晰地认识到它在基础设施管理方面的价值。

AIGNE Hub 作为一个中心化的网关，使您能够通过单一、一致的 API 将您的应用程序连接到领先的大语言模型（LLM）和 AIGC 服务。无论您是将其部署为内部工具，还是作为商业化、多租户的服务，它都能简化 API 密钥管理、使用情况跟踪和安全性。

## 为何选择 AIGNE Hub？

将多个 AI 服务集成到组织的基础设施中会带来巨大的运营开销。团队常常面临着一个碎片化的局面：提供商特定的 API、各不相同的计费周期以及不一致的安全模型。这种复杂性减缓了开发速度，使成本管理变得复杂，并增加了安全风险。

下图说明了 AIGNE Hub 如何置于您的应用程序和各种 AI 提供商之间以解决这些挑战：

```d2
direction: right

Applications: {
  label: "您的应用程序"
  shape: rectangle

  internal-tools: {
    label: "内部工具"
    shape: rectangle
  }

  customer-apps: {
    label: "面向客户的应用"
    shape: rectangle
  }

  chatbots: {
    label: "聊天机器人与 Agent"
    shape: rectangle
  }
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  unified-api: {
    label: "统一 API 端点"
  }

  security: {
    label: "集中式安全与密钥管理"
  }

  analytics: {
    label: "用量与成本分析"
  }

  billing: {
    label: "灵活的计费系统"
  }
}

AI-Providers: {
  label: "AI 提供商"
  shape: rectangle
  grid-columns: 2

  openai: "OpenAI"
  anthropic: "Anthropic"
  google: "Google Gemini"
  aws: "Amazon Bedrock"
  deepseek: "DeepSeek"
  others: "... 及更多"
}

Applications -> AIGNE-Hub: "单一、一致的 API"
AIGNE-Hub -> AI-Providers: "路由至任何提供商"
```

AIGNE Hub 旨在通过提供以下功能来解决这些具体挑战：

-   **单一集成点：** 它为所有连接的提供商提供了一个统一的、与 OpenAI 兼容的 API 端点。这使得开发人员无需学习和维护多个 SDK 和集成模式。
-   **集中式凭证管理：** 所有上游 API 密钥都通过 AES 加密安全地存储在一个地方，从而降低了密钥在各种应用程序和环境中暴露的风险。
-   **统一的用量和成本分析：** 从单一仪表板全面了解所有模型、用户和提供商的消耗和支出情况。这简化了预算跟踪和资源分配。
-   **灵活的部署模型：** AIGNE Hub 既可以部署为纯内部使用（自带密钥），也可以作为面向公众的服务，内置基于积分的计费系统。

## 核心功能

AIGNE Hub 提供了一套强大的功能，旨在简化 AI 服务消费和管理的整个生命周期。

<x-cards data-columns="3">
  <x-card data-title="多提供商管理" data-icon="lucide:cloud">
    通过单一界面连接到超过 8 家领先的 AI 提供商，如 OpenAI、Anthropic 和 Google Gemini。
  </x-card>
  <x-card data-title="统一 API 端点" data-icon="lucide:plug-zap">
    使用与 OpenAI 兼容的 RESTful API 与所有模型进行交互，用于聊天补全、图像生成和嵌入。
  </x-card>
  <x-card data-title="用量与成本分析" data-icon="lucide:line-chart">
    通过全面的分析仪表板监控所有用户和提供商的 token 用量、成本和延迟指标。
  </x-card>
  <x-card data-title="集中式安全" data-icon="lucide:shield-check">
    受益于加密的 API 密钥存储、OAuth 集成、基于角色的访问控制（RBAC）和详细的审计日志。
  </x-card>
  <x-card data-title="灵活的计费系统" data-icon="lucide:credit-card">
    可选择启用由 Payment Kit 支持的基于积分的计费系统，为外部用户提供商业化服务。
  </x-card>
  <x-card data-title="内置 Playground" data-icon="lucide:flask-conical">
    直接在 AIGNE Hub 用户界面中实时测试和体验任何已连接的 AI 模型。
  </x-card>
</x-cards>

## 支持的 AI 提供商

AIGNE Hub 支持越来越多主流的 AI 提供商。该系统设计为可扩展的，并会持续添加新的提供商。

| 提供商 | 支持的服务 |
| :--- | :--- |
| **OpenAI** | GPT 模型、DALL-E、Embeddings |
| **Anthropic** | Claude 模型 |
| **Google Gemini** | Gemini Pro、Vision 模型 |
| **Amazon Bedrock** | AWS 托管的基础模型 |
| **DeepSeek** | 高级推理模型 |
| **xAI** | Grok 模型 |
| **OpenRouter** | 多个提供商的聚合器 |
| **Ollama** | 本地模型部署 |
| **Doubao** | 豆包 AI 模型 |
| **Poe** | Poe AI 平台 |

## 系统架构

AIGNE Hub 是在 AIGNE 框架上构建的 [Blocklet](https://blocklet.io)，为可靠性和性能而设计。这种架构确保了在 AIGNE 生态系统内的无缝集成，并为云原生部署和扩展提供了坚实的基础。

该技术栈的主要组件包括：

-   **后端：** 使用 Node.js 和 TypeScript 构建，提供了一个强类型且高效的服务器端环境。
-   **前端：** 使用 React 19 构建的现代化用户界面。
-   **数据库：** 使用 SQLite 和 Sequelize ORM 进行本地数据存储，确保了简单的设置和可靠的数据管理。
-   **框架：** 采用最新版本的 AIGNE 框架，以实现核心功能和集成能力。

![AIGNE Hub 仪表板](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 总结

本概述介绍了 AIGNE Hub，它是一个统一的 AI 网关，旨在简化多提供商 AI 服务的基础设施管理。我们概述了它解决的问题、其核心功能及其技术架构。

接下来，您可以继续阅读以下部分以获取更详细的信息：

<x-cards data-columns="2">
  <x-card data-title="快速入门" data-href="/getting-started" data-icon="lucide:rocket">
    遵循分步指南，在 30 分钟内完成 AIGNE Hub 实例的部署和配置。
  </x-card>
  <x-card data-title="部署场景" data-href="/deployment-scenarios" data-icon="lucide:milestone">
    探索将 AIGNE Hub 部署为企业内部使用或作为商业化服务的架构指南。
  </x-card>
</x-cards>