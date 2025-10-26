# 架构

AIGNE Hub 是一个强大、自托管的 AI 网关，专为模块化和可扩展性而设计。它基于 AIGNE 框架构建，并作为 Blocklet 部署，为管理多个 AI 提供商提供了一个集中化且安全的接口。该架构旨在高效地处理 API 请求、管理安全性、跟踪使用情况并持久化数据。

下图提供了系统结构及其核心组件之间交互的高层概览。

```d2
direction: down

AI-Model-Request: { 
  label: "AI 模型请求"
}

Blocklet-Server: {
  label: "Blocklet Server"
  icon: "https://www.arcblock.io/image-bin/uploads/eb1cf5d60cd85c42362920c49e3768cb.svg"
}

AIGNE-Hub: {
  label: "AIGNE Hub (自托管 AI 网关)"
  shape: rectangle
  grid-gap: 100

  System-Components: {
    label: "系统组件"
    shape: rectangle

    API-Gateway: {
      label: "API 网关"
    }
    Authentication-System: {
      label: "身份验证系统"
    }
    Usage-Tracker: {
      label: "使用情况跟踪器"
    }
    Billing-Module: {
      label: "计费模块 (可选)"
    }
  }

  Technology-Stack: {
    label: "技术栈"
    shape: rectangle

    Backend: {
      label: "后端\nNode.js, Express.js, TypeScript"
    }
    Frontend: {
      label: "前端\nReact"
    }
  }

  Data-Persistence: {
    label: "数据持久化"
    shape: rectangle

    Sequelize-ORM: {
      label: "Sequelize ORM"
    }

    SQLite-Database: {
      label: "SQLite 数据库"
      shape: cylinder
      
      AI-Providers: {
        label: "AI 提供商"
      }
      AI-Credentials: {
        label: "AI 凭证"
      }
      Model-Calls: {
        label: "模型调用"
      }
      Usage-Statistics: {
        label: "使用情况统计"
      }
    }
  }
}

AI-Model-Request -> AIGNE-Hub.System-Components.API-Gateway: "入口点"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Authentication-System: "1. 验证"
AIGNE-Hub.System-Components.Authentication-System -> AIGNE-Hub.Data-Persistence.SQLite-Database: "读取凭证"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Usage-Tracker: "2. 记录使用情况"
AIGNE-Hub.System-Components.Usage-Tracker -> AIGNE-Hub.Data-Persistence.SQLite-Database: "写入统计数据"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Billing-Module: "3. 扣除积分"
AIGNE-Hub.System-Components.Billing-Module -> AIGNE-Hub.Data-Persistence.SQLite-Database: "更新积分"
AIGNE-Hub.Data-Persistence.Sequelize-ORM -> AIGNE-Hub.Data-Persistence.SQLite-Database: "管理"
AIGNE-Hub -> Blocklet-Server: "部署于"

```

本文档提供了该架构的概览。如需深入了解各个领域，请参阅以下详细章节。

<x-cards data-columns="3">
  <x-card data-title="系统组件" data-icon="lucide:blocks" data-href="/architecture/system-components">
    详细介绍主要功能模块，包括 API 网关、身份验证系统和使用情况跟踪器。
  </x-card>
  <x-card data-title="技术栈" data-icon="lucide:layers" data-href="/architecture/technology-stack">
    列出了用于构建系统的关键技术和框架，如 Node.js、React 和 Sequelize。
  </x-card>
  <x-card data-title="数据持久化" data-icon="lucide:database" data-href="/architecture/data-persistence">
    解释了使用 SQLite 的数据库设置以及提供商、凭证和使用情况统计的数据模型。
  </x-card>
</x-cards>

## 系统组件

该系统由几个关键功能模块组成，它们协同工作，提供统一的 AI 网关体验。每个组件都有特定的用途，从处理传入请求到管理数据和安全。

-   **API 网关**：所有 AI 模型请求的中心入口点。它使用 Express.js 构建，并将传入流量路由到适当的后端服务和 AI 提供商。
-   **身份验证系统**：通过管理访问控制和验证所有传入 API 请求的凭证来保护网关，并与 Blocklet Server 的用户管理集成。
-   **使用情况跟踪器**：监控并记录每次 API 调用的令牌消耗、请求次数和其他指标，为分析和计费提供数据。
-   **计费模块**：一个可选组件，与 Payment Kit 集成以管理基于积分的系统，从而实现将 AI 网关作为服务进行商业化。

有关每个组件的详细分解，请参阅 [系统组件](./architecture-system-components.md) 文档。

## 技术栈

AIGNE Hub 采用现代、可靠的技术栈构建，该技术栈的选择基于性能、类型安全和可维护性。

-   **后端**：核心逻辑使用 **Node.js** 和 **Express.js** 框架构建。整个后端使用 **TypeScript** 以确保类型安全并提高代码质量。
-   **前端**：管理和面向用户的仪表盘使用 **React** 开发。
-   **数据库 ORM**：使用 **Sequelize** 作为对象关系映射器（ORM）与数据库进行交互，从而简化数据访问和管理。
-   **部署**：整个应用程序打包为 **Blocklet**，从而可以在 Blocklet Server 实例上进行直接部署和管理。

更多详细信息请参阅 [技术栈](./architecture-technology-stack.md) 部分。

## 数据持久化

系统依赖本地 **SQLite** 数据库满足所有数据持久化需求，该数据库通过 Sequelize ORM 进行管理。这种自包含的设置确保所有数据都保留在您的托管环境中，并通过避免需要外部数据库服务器来简化部署。数据库日志模式设置为 WAL（预写式日志），以提高并发性和性能。

关键数据模型包括：

-   **AiProvider**：存储每个连接的 AI 服务提供商的配置，例如端点和支持的模型。
-   **AiCredential**：安全地存储访问 AI 提供商 API 所需的加密 API 密钥和其他敏感凭证。
-   **ModelCall**：记录通过网关进行的每一次 API 调用，用于审计、调试和详细的使用情况跟踪。
-   **ModelCallStat & Usage**：将原始调用数据聚合成定期统计数据，用于性能监控和成本分析仪表盘。

有关数据库模式和模型的更多信息，请参阅 [数据持久化](./architecture-data-persistence.md) 文档。

---

本架构概览提供了关于 AIGNE Hub 如何构建的基础性理解。后续章节将对系统的每个方面进行更细致的审视。