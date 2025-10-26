# 架構

AIGNE Hub 被設計為一個強大、可自主託管的 AI 閘道，專為模組化和可擴展性而打造。它建立在 AIGNE 框架之上，並以 Blocklet 的形式部署，為管理多個 AI 供應商提供了一個集中且安全的介面。此架構的結構旨在高效地處理 API 請求、管理安全性、追蹤用量並持久化資料。

下圖提供了系統結構及其核心元件之間互動的高層次概覽。

```d2
direction: down

AI-Model-Request: { 
  label: "AI 模型請求"
}

Blocklet-Server: {
  label: "Blocklet Server"
  icon: "https://www.arcblock.io/image-bin/uploads/eb1cf5d60cd85c42362920c49e3768cb.svg"
}

AIGNE-Hub: {
  label: "AIGNE Hub (自主託管的 AI 閘道)"
  shape: rectangle
  grid-gap: 100

  System-Components: {
    label: "系統元件"
    shape: rectangle

    API-Gateway: {
      label: "API 閘道"
    }
    Authentication-System: {
      label: "驗證系統"
    }
    Usage-Tracker: {
      label: "用量追蹤器"
    }
    Billing-Module: {
      label: "計費模組 (選用)"
    }
  }

  Technology-Stack: {
    label: "技術堆疊"
    shape: rectangle

    Backend: {
      label: "後端\nNode.js, Express.js, TypeScript"
    }
    Frontend: {
      label: "前端\nReact"
    }
  }

  Data-Persistence: {
    label: "資料持久化"
    shape: rectangle

    Sequelize-ORM: {
      label: "Sequelize ORM"
    }

    SQLite-Database: {
      label: "SQLite 資料庫"
      shape: cylinder
      
      AI-Providers: {
        label: "AI 供應商"
      }
      AI-Credentials: {
        label: "AI 憑證"
      }
      Model-Calls: {
        label: "模型呼叫"
      }
      Usage-Statistics: {
        label: "用量統計"
      }
    }
  }
}

AI-Model-Request -> AIGNE-Hub.System-Components.API-Gateway: "進入點"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Authentication-System: "1. 驗證"
AIGNE-Hub.System-Components.Authentication-System -> AIGNE-Hub.Data-Persistence.SQLite-Database: "讀取憑證"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Usage-Tracker: "2. 記錄用量"
AIGNE-Hub.System-Components.Usage-Tracker -> AIGNE-Hub.Data-Persistence.SQLite-Database: "寫入統計資料"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Billing-Module: "3. 扣除點數"
AIGNE-Hub.System-Components.Billing-Module -> AIGNE-Hub.Data-Persistence.SQLite-Database: "更新點數"
AIGNE-Hub.Data-Persistence.Sequelize-ORM -> AIGNE-Hub.Data-Persistence.SQLite-Database: "管理"
AIGNE-Hub -> Blocklet-Server: "部署於"

```

本文件提供了此架構的概覽。若要深入了解各個領域，請參閱以下詳細章節。

<x-cards data-columns="3">
  <x-card data-title="系統元件" data-icon="lucide:blocks" data-href="/architecture/system-components">
    詳細介紹主要功能區塊，包括 API 閘道、驗證系統和用量追蹤器。
  </x-card>
  <x-card data-title="技術堆疊" data-icon="lucide:layers" data-href="/architecture/technology-stack">
    列出用於建構系統的關鍵技術和框架，例如 Node.js、React 和 Sequelize。
  </x-card>
  <x-card data-title="資料持久化" data-icon="lucide:database" data-href="/architecture/data-persistence">
    說明使用 SQLite 的資料庫設定以及供應商、憑證和用量統計的資料模型。
  </x-card>
</x-cards>

## 系統元件

此系統由幾個關鍵功能區塊組成，它們協同工作以提供統一的 AI 閘道體驗。每個元件都有其特定用途，從處理傳入的請求到管理資料和安全性。

-   **API 閘道**：所有 AI 模型請求的中央進入點。它使用 Express.js 建構，並將傳入的流量路由到適當的後端服務和 AI 供應商。
-   **驗證系統**：透過管理存取控制並驗證所有傳入 API 請求的憑證來保護閘道，並與 Blocklet Server 的使用者管理整合。
-   **用量追蹤器**：監控並記錄每次 API 呼叫的 token 消耗量、請求次數和其他指標，為分析和計費提供資料。
-   **計費模組**：一個選用元件，與 Payment Kit 整合以管理基於點數的系統，從而將 AI 閘道作為一種服務來實現營利。

有關每個元件的詳細分解，請參閱 [系統元件](./architecture-system-components.md) 文件。

## 技術堆疊

AIGNE Hub 採用現代化、可靠的技術堆疊建構，這些技術是為效能、型別安全和可維護性而選擇的。

-   **後端**：核心邏輯使用 **Node.js** 和 **Express.js** 框架建構。整個後端都使用 **TypeScript** 以確保型別安全並提高程式碼品質。
-   **前端**：管理和使用者導向的儀表板是使用 **React** 開發的。
-   **資料庫 ORM**：使用 **Sequelize** 作為物件關聯對映器 (ORM) 與資料庫互動，從而簡化資料存取和管理。
-   **部署**：整個應用程式被打包成一個 **Blocklet**，使其能夠在 Blocklet Server 實例上進行直接的部署和管理。

更多詳細資訊可在 [技術堆疊](./architecture-technology-stack.md) 章節中找到。

## 資料持久化

系統依賴本地 **SQLite** 資料庫來滿足所有資料持久化的需求，並透過 Sequelize ORM 進行管理。這種自足的設定確保所有資料都保留在您的託管環境中，並透過避免需要外部資料庫伺服器來簡化部署。資料庫的日誌模式設定為 WAL (Write-Ahead Logging)，以提高並行性和效能。

關鍵的資料模型包括：

-   **AiProvider**：儲存每個連接的 AI 服務供應商的設定，例如端點和支援的模型。
-   **AiCredential**：安全地儲存存取 AI 供應商 API 所需的加密 API 金鑰和其他敏感憑證。
-   **ModelCall**：記錄透過閘道進行的每一次 API 呼叫，用於稽核、偵錯和詳細的用量追蹤。
-   **ModelCallStat & Usage**：將原始呼叫資料匯總為定期統計數據，用於效能監控和成本分析儀表板。

有關資料庫結構和模型的更多資訊，請參閱 [資料持久化](./architecture-data-persistence.md) 文件。

---

此架構概覽提供了對 AIGNE Hub 建構方式的基礎理解。後續章節將對系統的每個方面進行更細緻的介紹。