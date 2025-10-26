# 系统组件

AIGNE Hub 采用模块化架构设计，确保系统中的每个部分都具有明确且定义清晰的职责。这种关注点分离的设计增强了系统的可维护性、可扩展性和安全性。主要的功能模块包括 API 网关、身份验证系统、用量追踪器和可选的计费模块。这些组件协同工作，以高效、安全地处理 AI 请求。

下图展示了这些核心组件之间的高层交互，从接收客户端请求到从 AI 提供商返回响应的整个过程。

```d2
direction: down

Client-Applications: {
  label: "客户端应用程序"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  API-Gateway: {
    label: "API 网关"
    shape: rectangle
  }

  Authentication-System: {
    label: "身份验证系统"
    shape: rectangle
  }

  AI-Provider-Handler: {
    label: "AI 提供商处理器"
    shape: rectangle
  }

  Usage-Tracker: {
    label: "用量追踪器"
    shape: rectangle
  }

  Billing-Module: {
    label: "计费模块"
    shape: rectangle
  }

  Database: {
    label: "数据库"
    shape: cylinder
  }
}

External-AI-Provider: {
  label: "外部 AI 提供商\n（例如 OpenAI）"
  shape: rectangle
}

Client-Applications -> AIGNE-Hub.API-Gateway: "1. API 请求"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Authentication-System: "2. 验证身份"
AIGNE-Hub.Authentication-System -> AIGNE-Hub.API-Gateway: "3. 身份验证通过"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.AI-Provider-Handler: "4. 路由请求"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Usage-Tracker: "5. 记录请求详情"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Billing-Module: "6. 发送用量数据"
AIGNE-Hub.Billing-Module -> AIGNE-Hub.Database: "7. 更新额度"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Database: "存储日志"
AIGNE-Hub.AI-Provider-Handler -> External-AI-Provider: "8. 转发请求"
External-AI-Provider -> AIGNE-Hub.API-Gateway: "9. AI 响应"
AIGNE-Hub.API-Gateway -> Client-Applications: "10. 最终响应"
```

## API 网关

API 网关是所有进入 AIGNE Hub 请求的单一、统一入口点。它负责根据请求路径将流量路由到相应的内部服务。这种集中式方法简化了客户端的集成，因为无论底层 AI 提供商是哪家，开发者都只需与一个单一、一致的 API 端点进行交互。

该网关主要在 `/api/v2/` 路径下暴露了一组 RESTful 端点，用于实现聊天补全、图像生成和嵌入等功能。请求在通过身份验证和其他中间件后，网关会将其定向到相关的处理器进行处理。

## 身份验证系统

安全性由一个强大的身份验证系统管理，该系统保护所有端点。它利用中间件来验证发起请求的用户或应用程序的身份。

-   **用户身份验证**：对于面向用户的交互，例如使用管理仪表盘或内置的 playground，系统采用由 Blocklet SDK 管理的基于会话的身份验证机制。
-   **API 身份验证**：所有 API 请求都需要一个 Bearer 令牌进行授权。该令牌与特定用户或应用程序相关联，确保只有经过身份验证的客户端才能访问 AI 模型。

系统设计为拒绝任何未经身份验证的请求，并返回 `401 Unauthorized` 错误，以防止对底层 AI 服务和数据的未经授权的访问。

## 用量追踪器

用量追踪器是用于监控和审计的关键组件。它会精确记录通过网关的每一次 API 调用。一个名为 `createModelCallMiddleware` 的中间件会拦截传入的请求，以便在数据库中创建一个状态为 `processing` 的 `ModelCall` 记录。

该记录捕获了交易的关键细节，包括：
-   用户 DID 和应用程序 DID
-   请求的 AI 模型和调用类型（例如 `chatCompletion`、`imageGeneration`）
-   请求和响应的时间戳
-   输入和输出的令牌数
-   调用的状态（例如 `success`、`failed`）

API 调用完成或失败后，该中间件会更新 `ModelCall` 记录，包含最终状态、持续时间和任何错误详情。这为调试、分析和计费提供了完整的审计追踪。

## 计费模块

在“服务提供商模式”下运行时，AIGNE Hub 会激活其可选的计费模块。该组件与用量追踪器和 **Payment Kit** blocklet 无缝集成，以管理一个基于额度的计费系统。

工作流程如下：
1.  **检查余额**：在处理请求之前，系统会检查用户是否有足够的额度余额。如果余额为零或负数，请求将被拒绝，并返回 `402 Payment Required` 错误。
2.  **计算成本**：API 调用成功后，用量追踪器会提供最终的令牌数或图像生成指标。计费模块使用这些数据以及针对特定模型预先配置的费率（`AiModelRate`），来计算以额度为单位的总成本。
3.  **扣除额度**：然后通过 Payment Kit API 创建一个计量事件，从用户余额中扣除计算出的金额。

这个自动化流程使运营商能够将 AIGNE Hub 作为一项付费服务来提供，所有用量和计费都得到透明化管理。