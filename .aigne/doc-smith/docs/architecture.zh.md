# 技术架构

本文档详细概述了 AIGNE Hub 的技术架构，专为负责部署、监控和维护的 DevOps、SRE 和基础设施团队设计。

## 核心理念

AIGNE Hub 的架构建立在模块化、可扩展性和易于部署的原则之上。它作为一个打包为 Blocklet 的自包含云原生应用程序运行。这种设计选择简化了安装、管理以及与现有基础设施的集成。该系统以一个统一的 API 网关为中心，该网关抽象了与多个下游 AI 提供商交互的复杂性。

## 系统组件

AIGNE Hub 由几个协同工作的关键组件组成，以实现其功能。

![AIGNE Hub Logo](../../../blocklets/core/screenshots/logo.png)

### 1. API 服务器 (Express.js)

该应用程序的骨干是一个使用 Node.js 和 [Express.js](https://expressjs.com/) 构建的健壮的 API 服务器。它处理所有传入的请求、身份验证和路由。

-   **运行时**：Node.js (>=18)，提供了一个高效的、事件驱动的环境，适用于代理 API 调用等 I/O 密集型操作。
-   **框架**：使用 Express.js 是因为它在构建 Web 应用程序和 API 方面具有简约和灵活的特点。
-   **类型安全**：整个后端使用 TypeScript 编写，确保了代码质量、可维护性并减少了运行时错误。
-   **API 结构**：系统公开了一个版本化的 RESTful API（例如 `/api/v1`、`/api/v2`），用于与 AI 模型交互和管理 Hub。这确保了平台演进时的向后兼容性。
-   **中间件**：核心功能通过标准中间件实现，包括：
    -   用于跨域资源共享的 `cors`。
    -   用于处理 HTTP cookie 的 `cookie-parser`。
    -   用于捕获访问日志的自定义日志记录中间件。
    -   一个健壮的错误处理机制，用于格式化和记录异常，并返回适当的 HTTP 状态码。

### 2. 数据持久化 (SQLite & Sequelize)

在数据存储方面，AIGNE Hub 使用了轻量级但功能强大的 SQLite 和 Sequelize ORM 组合。

-   **数据库**：选择 SQLite 作为数据库引擎。这一决定是为了优化简单性和可移植性。通过将数据库嵌入到 Blocklet 的数据目录（`/data/aikit.db`）中，AIGNE Hub 无需外部数据库依赖，使部署和数据备份变得简单。
-   **性能**：为提高高负载下的性能，系统通过特定的 PRAGMA 指令配置 SQLite：
    -   `journal_mode = WAL`：预写式日志（Write-Ahead Logging）允许更高的并发性，使读取者在写入进行时仍能继续操作。
    -   `synchronous = normal`：在性能和数据完整性之间提供了良好的平衡。
-   **ORM**：使用 [Sequelize](https://sequelize.org/) 作为对象关系映射器（Object-Relational Mapper）。它为与数据库交互和管理关系提供了一个清晰的、基于模型的结构。关键数据模型包括：
    -   `AiProvider`：存储支持的 AI 提供商（如 OpenAI、Anthropic）的配置。
    -   `AiCredential`：安全地存储每个提供商的加密 API 密钥和其他凭证。
    -   `App`：管理被授权使用 Hub 的应用程序。
    -   `ModelCall`：记录每一次 API 调用，用于审计和分析。
    -   `Usage`：汇总用于计费和跟踪目的的使用数据。
-   **迁移**：数据库模式变更由 `umzug` 管理。这确保了数据库更新能够可靠地应用并进行版本控制，这对于维护周期中的平滑升级至关重要。

### 3. AI 提供商网关

AIGNE Hub 的核心功能在于其智能网关，用于将请求路由到各种 AI 提供商。

-   **动态模型加载**：系统根据 API 请求中的 `model` 参数（例如 `openai/gpt-4o`）动态加载相应的 SDK 或模型处理器。这由 `@aigne/core` 和 `@aigne/aigne-hub` 库处理，它们为不同的 AI 服务提供了一个标准化的接口。
-   **凭证管理**：当收到请求时，`getProviderCredentials` 函数从 `AiProvider` 和 `AiCredential` 表中检索必要的凭证。它包含循环使用可用密钥（`getNextAvailableCredential`）的逻辑，为单个提供商配置了多个密钥时提供了基本的负载均衡和故障转移机制。
-   **可扩展性**：该架构被设计为可扩展的。添加一个新的 AI 提供商只需在框架内实现其特定逻辑，并将其配置添加到数据库中，而无需对核心应用程序进行重大更改。

### 4. 可观测性与监控

为了获得运营洞察，AIGNE Hub 与 AIGNE 生态系统的可观测性工具集成。

-   **分布式追踪**：`AIGNEObserver` 模块捕获 API 调用的追踪数据（spans）。这些数据随后被导出到一个专门的可观测性 Blocklet。
-   **故障排查**：这种集成允许操作员追踪一个请求从初始 API 调用、经过 Hub、到下游 AI 提供商再返回的整个生命周期。这对于诊断延迟问题、识别错误和理解系统性能非常有价值。

## 部署与运维

AIGNE Hub 被设计为作为 [Blocklet](https://blocklet.io) 部署，这是一种云原生应用程序包，简化了其生命周期管理。

-   **容器化**：作为 Blocklet，该应用程序在容器化环境中运行，确保了在不同部署目标上的一致性。
-   **配置**：特定于环境的配置通过 `.env` 文件进行管理，由 `dotenv-flow` 库提供支持。这允许为开发、测试和生产环境设置不同的配置。
-   **静态资源**：在生产环境中，编译后的 React 前端由同一个 Express.js 服务器直接提供服务，创建了一个易于管理和部署在反向代理或负载均衡器后面的自包含单元。
-   **计费系统**：Hub 包含一个基于积分的计费系统，与 Payment Kit blocklet 集成。`paymentClient` 和 `ensureMeter` 函数处理通信，使 Hub 能够以服务提供商模式运行，其中使用情况被计量并根据用户积分进行计费。