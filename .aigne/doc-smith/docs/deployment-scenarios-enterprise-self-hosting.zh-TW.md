# 企業自架託管

在您自己的基礎架構內部署 AIGNE Hub，能讓您的組織完全掌控 AI 模型存取、資料隱私和營運成本。本指南提供一個結構化的方法，說明如何設定和管理一個自架託管的 AIGNE Hub 實例，以供安全的企業內部使用。

## 總覽

企業自架託管模型專為優先考慮資料安全和直接管理其 AI 資源的組織而設計。透過在您自己的網路邊界內部署 AIGNE Hub，您可以為所有內部團隊和應用程式建立一個集中化、安全的閘道，以存取各種 AI 模型。

此方法提供幾個獨特的優勢：

*   **增強的安全性**：所有資料，包括提示、回應和 API 憑證，都保留在您的企業網路內，確保符合嚴格的資料隱私政策。
*   **直接計費**：您與每個 AI 供應商（例如 OpenAI、Anthropic、Google）維持直接的計費關係。AIGNE Hub 會追蹤用量，但所有費用都直接支付給供應商，簡化了預算分配並消除了第三方計費的複雜性。
*   **完全控制**：您的團隊對實例擁有完整的管理控制權，包括哪些模型可用、誰可以存取它們，以及它們如何設定。
*   **內部整合**：將 AIGNE Hub 與您現有的內部驗證系統（例如您的企業 OAuth 供應商）無縫連接，實現統一且安全的存取管理。

此部署情境非常適合開發團隊、企業 AI 專案，以及任何需要穩健、私密存取生成式 AI 功能的應用程式。

## 架構考量

當為企業內部使用部署 AIGNE Hub 時，它在您的安全邊界內充當一個集中式閘道。所有內部應用程式和服務都透過該 Hub 路由其 AI 請求，然後 Hub 再安全地與外部 AI 供應商通訊。

下圖說明了此架構：

```d2
direction: down

Corporate-Network: {
  label: "您的企業網路 / 安全邊界"
  style: {
    stroke: "#888"
    stroke-width: 2
    stroke-dash: 4
  }

  Internal-Applications: {
    label: "內部應用程式與服務"
    shape: rectangle
  }

  AIGNE-Hub-Instance: {
    label: "AIGNE Hub 實例"
    shape: rectangle
    icon: "https://www.arcblock.io/image-bin/uploads/89a24f04c34eca94f26c9dd30aec44fc.png"
  }

  Authentication-System: {
    label: "企業驗證系統 (OAuth)"
    shape: rectangle
  }
}

External-AI-Providers: {
  label: "外部 AI 供應商"
  shape: rectangle
  grid-columns: 3

  OpenAI: {
    label: "OpenAI"
  }

  Anthropic: {
    label: "Anthropic"
  }

  Google: {
    label: "Google AI"
  }
}

Corporate-Network.Internal-Applications -> Corporate-Network.Authentication-System: "1. 驗證使用者/服務"
Corporate-Network.Authentication-System -> Corporate-Network.Internal-Applications: "2. 提供權杖"
Corporate-Network.Internal-Applications -> Corporate-Network.AIGNE-Hub-Instance: "3. 統一的 AI API 請求"
Corporate-Network.AIGNE-Hub-Instance -> External-AI-Providers: "4. 安全地將請求路由至供應商"
External-AI-Providers -> Corporate-Network.AIGNE-Hub-Instance: "5. AI 回應"
Corporate-Network.AIGNE-Hub-Instance -> Corporate-Network.Internal-Applications: "6. 返回回應"
```

![AIGNE Hub Dashboard](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

### 關鍵元件

*   **AIGNE Hub 實例**：一個在您內部基礎架構（例如私有雲、本地伺服器或 VPC）上運行的專用 Blocklet。
*   **內部應用程式**：需要使用 AI 服務的您的服務、開發環境和內部工具。
*   **驗證系統**：您的企業身份供應商（例如內部 OAuth 2.0 伺服器），用於管理使用者存取。
*   **外部 AI 供應商**：AIGNE Hub 連接的上游 LLM 和 AIGC 服務。

在此設定中，Hub 作為唯一的仲介。內部應用程式不需要直接存取供應商的 API 金鑰，這顯著增強了您的安全態勢。

## 設定步驟

為企業使用設定 AIGNE Hub 是一個簡單的過程，主要著重於連接供應商和保護存取。

### 1. 初始部署

首先，請確保您有一個正在運行的 AIGNE Hub 實例。如果您尚未安裝，請遵循我們[入門指南](./getting-started.md)中的部署說明。主要方法是從 Blocklet Store 將其啟動到您的 Blocklet Server 上。

### 2. 供應商設定

自架託管設定的核心是將 AIGNE Hub 設定為使用您組織自己的 API 金鑰來連接每個 AI 供應商。這確保了所有用量都直接計費到您的企業帳戶。

1.  導覽至您的 AIGNE Hub 實例的管理儀表板。
2.  在左側邊欄中，前往 **設定 > AI 供應商**。
3.  在這裡，您將看到支援的 AI 供應商列表。點擊 **+ 新增供應商** 或選擇一個現有的進行設定。
4.  輸入您組織為所選供應商提供的 API 憑證。系統會使用加密技術安全地儲存這些憑證。
5.  啟用您希望向內部使用者提供的供應商。

![Provider Configuration](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

### 3. 使用者存取與安全

對於內部使用，您可以透過現有的身份基礎架構來管理存取。

#### 內部 OAuth 整合

AIGNE Hub 支援標準的 OAuth 2.0，以實現安全的單一登入（SSO）存取。透過將其與您的內部身份供應商整合，員工可以使用他們的企業憑證來存取 Hub 並為其應用程式產生 API 權杖。這集中了使用者管理和存取控制。

要進行此設定，您需要在 AIGNE Hub 的安全設定中提供來自您 OAuth 供應商的客戶端 ID、客戶端密鑰和相關端點。

#### 直接 API 存取

對於服務或自動化工作流程，管理員可以直接在 AIGNE Hub 內產生長效的 API 金鑰。這些金鑰可以被指派特定的權限，並可隨時撤銷，為非互動式存取提供了一種安全的方法。

## 使用與管理

設定好自架託管實例後，內部團隊就可以開始使用統一的 API 端點來滿足其所有 AI 需求。

### 統一的 API 端點

所有對任何已設定的 AI 模型的請求都會發送到您的 AIGNE Hub 實例的 API 端點。Hub 會使用安全儲存的憑證，自動將請求路由到適當的上游供應商。

例如，一個應用程式可以僅透過在 API 呼叫中更改模型名稱，就從使用 OpenAI 的 `gpt-4` 切換到 Anthropic 的 `claude-3-opus`，而無需管理不同的 API 金鑰或端點。

### 用量分析

儘管計費是直接與供應商處理的，AIGNE Hub 仍提供詳細的用量和成本分析。

*   在管理儀表板中導覽至 **用量分析** 部分。
*   監控每個使用者、團隊或應用程式的權杖消耗量、圖片生成次數和預估成本。
*   使用這些資料進行內部費用分攤、預算追蹤，以及識別高消耗的服務。

這使您能夠掌握整個組織的 AI 支出情況，而無需解析各個供應商發票的複雜性。

## 總結

企業自架託管模型為內部使用部署 AIGNE Hub 提供了一種安全、可控且高效的方式。透過集中 AI 存取、將資料保留在您的安全邊界內，並維持直接的計費關係，您可以建立一個符合嚴格企業要求的穩健 AI 基礎架構。

有關更進階的設定，例如為外部客戶建立一個可營利的服務，請參閱[服務供應商模式](./deployment-scenarios-service-provider.md)文件。您也可以在[安全與存取](./features-security.md)指南中找到有關保護您實例的詳細資訊。