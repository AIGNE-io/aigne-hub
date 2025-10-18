# 系统架构

AIGNE Hub 旨在成为一个强大、可扩展且安全的生成式 AI 网关。它基于 AIGNE Blocklet 框架构建，为众多 AI 提供商提供统一的接口，同时管理计费、用量追踪和安全等关键运营方面。本文档详细介绍了 AIGNE Hub 系统的架构组件和设计原则，重点关注 DevOps 和 SRE 团队的运营问题。

---

### 核心架构原则

- **模块化：** 该系统被设计为一个 [Blocklet](https://blocklet.io)，确保其可以在 Blocklet Server 环境中独立部署、管理和扩展。它与其他专门的 Blocklet（如 Payment Kit 和 Observability）集成，以处理其核心领域之外的事务。
- **可扩展性：** 该架构支持面向企业的单实例、自托管部署和多租户服务提供商模型，能够处理大量用户和应用。
- **统一接口：** 它抽象了不同 AI 提供商 API 的复杂性，为开发者和应用程序提供了一套单一、一致的端点。

---

## 架构组件

AIGNE Hub 架构可分解为几个协同工作的关键组件：

![AIGNE Hub 系统架构图](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 1. API 网关与路由

AIGNE Hub 的核心是其 API 网关，它使用 Node.js 和 Express 构建，负责请求接收、身份验证、版本控制以及路由到相应的内部服务。

#### API 版本控制

该网关提供两个不同的 API 版本，反映了平台的演进并满足不同的用例需求：

-   **V1 API (`/api/v1`)**：这是旧版 API，主要为 AIGNE 生态系统内的服务器到服务器或组件到组件通信而设计。
    -   **身份验证**：依靠加密签名验证（`ensureComponentCall`）来授权来自受信任的 Blocklet 组件的请求。
    -   **计费模型**：通过 Payment Kit 集成**基于订阅**的模型。它会检查调用应用程序的有效订阅（`checkSubscription`）。此模型非常适合按次计费不适用的企业内部部署场景。

-   **V2 API (`/api/v2`)**：当前以用户为中心的 API，专为最终用户应用程序和现代服务设计。
    -   **身份验证**：利用 DID Connect 进行基于钱包的去中心化用户身份验证（`sessionMiddleware`）。这提供了一个安全且由用户管理的身份层。
    -   **计费模型**：采用灵活的**基于点数**的系统。在处理请求前，它会验证用户的点数余额（`checkUserCreditBalance`）。这是服务提供商模式的基础。
    -   **端点支持**：提供 OpenAI 兼容端点（例如 `/v2/chat/completions`）以实现直接兼容，以及 AIGNE 原生端点（例如 `/v2/chat`）以提供增强功能。

### 2. AI 提供商集成层

该层是连接各种第三方 AI 模型的编排引擎。它将来自 API 网关的请求规范化，并将其转换为下游 AI 提供商（如 OpenAI、Anthropic、Google Gemini）所需的特定格式。它还会对响应进行规范化，无论底层模型提供商是谁，都为客户端提供一致的输出结构。

API 密钥和提供商凭证经过加密并安全存储，通过 AIGNE Hub 的管理界面进行管理。

### 3. 计费与用量追踪

对于 SRE 和运营人员来说，计费和用量追踪系统是监控和财务管理的关键组件。

-   **模型调用追踪**：每个传入的 AI 请求都会在 `ModelCall` 数据库表中创建一条状态为 `processing` 的记录。该追踪器作为 Express 中间件（`createModelCallMiddleware`）实现，是所有用量的唯一可信源。它捕获用户 DID、应用 DID、请求的模型和请求时间戳。

-   **用量数据收集**：AI 调用成功完成后，追踪器会更新详细的用量指标，包括：
    -   提示和完成的 token 数量
    -   生成的图片数量
    -   模型参数（例如，图片尺寸、质量）
    -   计算出的点数成本
    -   调用时长
    -   用于可观测性的追踪 ID

-   **弹性**：系统包含一个清理机制（`cleanupStaleProcessingCalls`）来处理孤立调用。如果一条请求记录长时间（例如，由于服务器崩溃）保持在 `processing` 状态，它将被自动标记为 `failed`，从而确保系统稳定性和准确的记账。

-   **Payment Kit 集成**：对于基于点数的计费，AIGNE Hub 与 Payment Kit blocklet 深度集成。
    -   当模型调用完成时，计算出的点数成本会作为“计量事件”（`createMeterEvent`）报告给 Payment Kit。
    -   Payment Kit 负责扣除用户的点数余额、管理点数购买以及处理所有金融交易。这种关注点分离确保了 AIGNE Hub 专注于 AI 编排，而 Payment Kit 则处理复杂的支付事务。

### 4. 安全与身份验证

安全性在多个层面上进行管理，以适应不同类型的客户端。

-   **用户身份验证 (DID Connect)**：如 `blocklets/core/api/src/libs/auth.ts` 中所述，v2 API 的最终用户身份验证由 DID Connect 处理。用户使用其 DID 钱包进行身份验证，提供无密码且高度安全的会话。会话令牌由 `walletHandler` 管理。

-   **组件身份验证**：对于自动化的服务间通信（主要用于 v1），系统使用基于公钥密码学的挑战-响应机制。调用组件对请求进行签名，AIGNE Hub 验证签名（`verify(data, sig)`），确保请求源自受信任的已注册组件。

-   **基于角色的访问控制 (RBAC)**：管理端点受 `ensureAdmin` 中间件保护，该中间件将访问权限限制为具有 `owner` 或 `admin` 角色的用户，以防止未经授权的配置更改。

### 5. 数据存储

-   **主数据库**：`README.md` 文件指定使用 SQLite 和 Sequelize ORM 存储核心应用数据，包括提供商配置、使用费率和模型调用日志。对于高吞吐量的企业部署，运营人员应考虑迁移到更强大的数据库，如 PostgreSQL，Sequelize 对其提供支持。
-   **身份验证存储**：根据 `auth.ts` 中的配置，DID Connect 会话数据存储在单独的 NeDB 数据库（`auth.db`）中。

### 6. 可观测性

该系统为运营可见性而设计。从主路由（`blocklets/core/api/src/routes/index.ts`）中可以看出，AIGNE Hub 与 `AIGNEObserver` 库集成。这使其能够捕获每个请求的详细追踪数据（span），并将其导出到专门的 Observability Blocklet。这为运营人员提供了深入洞察整个请求生命周期（从网关到 AI 提供商再返回）的请求延迟、错误来源和性能瓶颈的能力。