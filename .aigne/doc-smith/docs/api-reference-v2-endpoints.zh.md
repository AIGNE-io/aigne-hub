# API 架构与端点 (v2)

本文档详细概述了 v2 API 架构，专为负责部署、监控和维护系统的 DevOps、SRE 和基础设施团队设计。本文档重点介绍 API 的内部工作原理、设计理念和操作方面。

## 1. 系统架构概述

v2 API 是一个用于与各种 AI 模型交互的稳健、可扩展的接口。其设计优先考虑动态提供商管理、弹性以及全面的使用情况跟踪，使其适用于生产环境。

### 1.1. 请求生命周期

一个典型的 API 请求遵循一个结构化的生命周期，由一系列 Express.js 中间件强制执行：

1.  **身份验证**：`sessionMiddleware` 通过访问密钥对用户进行身份验证，并将用户上下文（`req.user`）附加到请求对象上。
2.  **计费和积分检查**：如果启用了基于积分的计费（`Config.creditBasedBillingEnabled`），`checkCreditBasedBillingMiddleware` 会验证支付系统是否正常运行，以及用户是否有足够的积分余额（`checkUserCreditBalance`）。
3.  **模型调用跟踪**：一个专用的中间件（`createModelCallMiddleware`）在系统中启动一条记录，以跟踪 AI 模型交互的整个生命周期。这对于日志记录、调试和分析至关重要。
4.  **输入验证**：传入的请求体会根据预定义的 Joi 模式进行严格验证，以确保数据完整性，并防止格式错误的请求到达核心逻辑。
5.  **动态模型和凭证选择**：系统动态选择合适的 AI 提供商和凭证。它会查询 `AiProvider` 和 `AiCredential` 表，为请求的模型找到一个活动的、已启用的凭证，并实施轮询或类似策略（`AiCredential.getNextAvailableCredential`）来分配负载。
6.  **AI 模型调用**：请求由核心逻辑处理，该逻辑使用 `AIGNE` SDK 与选定的 AI 模型进行交互。这抽象了不同提供商 API 的复杂性。
7.  **使用情况和计费记录最终确定**：在成功完成或失败时，会触发一个钩子（`onEnd` 或 `onError`）。`createUsageAndCompleteModelCall` 函数被调用，以最终确定模型调用记录，计算积分成本，并记录详细的使用指标。
8.  **响应生成**：系统将响应发送回客户端。对于聊天补全，这可以是一个标准的 JSON 对象，也可以是用于实时流式传输的 `text/event-stream`。

### 1.2. 动态提供商和凭证管理

一个关键的设计决策是将 API 与特定的 AI 提供商解耦。系统使用数据库驱动的方法来管理提供商（`AiProvider`）及其关联的 API 密钥（`AiCredential`）。

-   **工作原理**：当请求指定一个模型（例如 `openai/gpt-4o`）时，系统首先识别提供商（`openai`）。然后，它查询数据库以获取与该提供商关联的活动凭证。这允许在不中断任何服务的情况下添加、删除或轮换凭证。
-   **设计理念**：这种架构提供了高可用性和灵活性。如果一个凭证或提供商出现问题，系统可以配置为故障转移到另一个。它还简化了 API 密钥的管理，并集中控制了对 AI 模型的访问。`getProviderCredentials` 函数封装了这一逻辑，确保每次模型调用都使用一个有效的、活动的凭证。

### 1.3. 弹性和错误处理

为确保在分布式环境中的稳定性，API 整合了一个针对瞬时故障的自动重试机制。

-   **重试处理器**：`createRetryHandler` 包装了核心端点逻辑。它被配置为重试因特定 HTTP 状态码（例如 `429 Too Many Requests`、`500 Internal Server Error`、`502 Bad Gateway`）而失败的请求。重试次数可通过 `Config.maxRetries` 进行配置。
-   **失败日志记录**：在发生不可重试的错误或用尽所有重试次数后，`onError` 钩子会确保记录失败，并将相关的模型调用记录标记为失败。这可以防止出现孤立的记录，并为故障排除提供清晰的数据。

## 2. API 端点

以下各节详细介绍了主要的 v2 API 端点、其用途和操作特性。

### GET /status

-   **用途**：一个健康检查端点，用于确定服务是否可用并准备好接受特定模型的请求。
-   **处理流程**：
    1.  对用户进行身份验证。
    2.  如果 `Config.creditBasedBillingEnabled` 为 true，它会检查支付服务是否正在运行，以及用户是否有正的积分余额。
    3.  它会查询 `AiProvider` 数据库，以确保至少有一个已启用的提供商拥有可以服务于所请求模型的活动凭证。
    4.  如果查询了特定模型，它还会检查 `AiModelRate` 表中是否为该模型定义了费率。
-   **操作说明**：此端点对于客户端服务发现至关重要。客户端应在尝试进行模型调用之前调用 `/status`，以避免发送注定会失败的请求。

### POST /chat 和 /chat/completions

-   **用途**：提供对语言模型的访问，以进行基于聊天的交互。
-   **端点变体**：
    -   `/chat/completions`：一个与 OpenAI 兼容的端点，接受标准的 `messages` 数组，并支持通过 `text/event-stream` 进行流式传输。
    -   `/chat`：原生的 AIGNE Hub 端点，它使用略有不同的输入结构，但提供相同的核心功能。
-   **处理流程**：
    1.  执行请求生命周期（身份验证、计费检查等）。
    2.  `processChatCompletion` 函数处理核心逻辑。它根据 `completionsRequestSchema` 验证输入。
    3.  调用 `getModel` 以动态加载指定的模型实例并选择凭证。
    4.  `AIGNE` 引擎调用模型。如果请求了 `stream: true`，它会返回一个异步生成器，该生成器会产生响应块。
    5.  对于流式响应，响应块在到达时被写入响应流。
    6.  `onEnd` 钩子计算令牌使用量（`promptTokens`、`completionTokens`），并调用 `createUsageAndCompleteModelCall` 来记录事务。

### POST /image 和 /image/generations

-   **用途**：使用像 DALL-E 这样的模型从文本提示生成图像。
-   **端点变体**：
    -   `/image/generations`：与 OpenAI 兼容的端点。
    -   `/image`：原生的 AIGNE Hub 端点。
-   **处理流程**：
    1.  遵循标准的请求生命周期。
    2.  输入根据 `imageGenerationRequestSchema` 或 `imageModelInputSchema` 进行验证。
    3.  调用 `getImageModel` 以加载适当的图像模型提供商（例如 OpenAI、Gemini）并选择凭证。
    4.  `AIGNE` 引擎使用提示和参数（尺寸、质量等）调用模型。
    5.  `onEnd` 钩子记录使用情况。对于图像，计费通常基于生成的图像数量、其尺寸和质量，这些信息在 `createUsageAndCompleteModelCall` 中被捕获。
    6.  响应包含生成的图像，可以是 URL 或 Base64 编码的 JSON 数据（`b64_json`）。

### POST /embeddings

-   **用途**：将输入文本转换为数值向量表示（嵌入）。
-   **处理流程**：
    1.  执行标准的请求生命周期。
    2.  请求体由 `embeddingsRequestSchema` 进行验证。
    3.  `processEmbeddings` 调用底层提供商的嵌入端点。
    4.  使用情况根据输入令牌的数量计算，并通过 `createUsageAndCompleteModelCall` 进行记录。

### POST /audio/transcriptions 和 /audio/speech

-   **用途**：提供语音转文本和文本转语音功能。
-   **架构**：这些端点目前作为到 OpenAI API 的安全代理实现。
-   **处理流程**：
    1.  对用户进行身份验证。
    2.  请求被直接转发到 OpenAI API。
    3.  `proxyReqOptDecorator` 函数从凭证存储中动态检索适当的 OpenAI API 密钥，并将其注入到传出请求的 `Authorization` 头部中。
-   **操作说明**：由于这些是代理，其性能和可用性直接与上游的 OpenAI 服务相关。请注意，在源代码中，基于积分的计费被标记为这些端点的 "TODO"，这意味着使用情况可能不会通过 AIGNE Hub 计费系统进行跟踪。

## 3. 故障排除与监控

-   **日志分析**：系统使用集中式记录器。需要监控的关键事件有：
    -   `Create usage and complete model call error`：表示在模型调用后将使用数据写入数据库时出现问题，这可能会影响计费。
    -   `ai route retry`：表示正在发生瞬时的网络或提供商错误。高频率的重试可能指向潜在的基础设施不稳定。
    -   `Failed to mark incomplete model call as failed`：一个严重错误，可能导致模型调用跟踪系统中的状态不一致。
-   **常见错误**：
    -   `400 Validation error`：客户端发送了格式错误的请求。检查错误消息以获取有关哪个 Joi 验证失败的详细信息。
    -   `401 User not authenticated`：访问密钥缺失或无效。
    -   `404 Provider ... not found`：请求的模型或提供商未在数据库中配置或启用。
    -   `502 Payment kit is not Running`：计费服务已关闭或无法访问。当 `creditBasedBillingEnabled` 为 true 时，这是一个关键依赖项。