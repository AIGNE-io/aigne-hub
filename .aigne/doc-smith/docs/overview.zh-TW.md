# 總覽

AIGNE Hub 是一個統一的 AI 閘道，旨在管理和簡化與各種大型語言模型（LLM）和 AI 生成內容（AIGC）提供商的連接。它作為 AIGNE 生態系統中的核心組件，將處理多個 API 金鑰、追蹤用量以及管理各種 AI 服務計費的複雜性抽象化。

該系統設計為可自行託管，讓組織能夠完全控制其資料和 AI 操作。透過將所有 AI 相關請求路由至單一、安全的端點，AIGNE Hub 確保了一致的安全性、監控和治理。

```d2
direction: down

User-Application: {
  label: "使用者 / 應用程式"
  shape: c4-person
}

Self-Hosted-Infrastructure: {
  label: "自行託管的基礎設施"
  style: {
    stroke-dash: 4
  }

  AIGNE-Hub: {
    label: "AIGNE Hub\n（統一 AI 閘道）"
    shape: rectangle

    Unified-API-Endpoint: {
      label: "統一 API 端點\n（與 OpenAI 相容）"
    }

    Central-Management: {
      label: "集中管理與功能"
      shape: rectangle
      grid-columns: 2

      Secure-Credential-Storage: { label: "安全憑證\n儲存" }
      Usage-Analytics: { label: "用量分析" }
      Flexible-Billing-System: { label: "彈性計費\n系統" }
    }
    
    Unified-API-Endpoint -> Central-Management
  }
}

External-Services: {
  grid-columns: 2
  grid-gap: 200

  AI-Providers: {
    label: "AI 提供商"
    shape: rectangle
    grid-columns: 2

    OpenAI: {}
    Anthropic: {}
    Google-Gemini: { label: "Google Gemini"}
    Amazon-Bedrock: { label: "Amazon Bedrock"}
    Ollama: {}
    "Others...": { label: "其他..."}
  }

  Payment-Kit: {
    label: "Payment Kit\n（適用於服務提供商模式）"
    shape: rectangle
  }
}

User-Application -> Self-Hosted-Infrastructure.AIGNE-Hub.Unified-API-Endpoint: "1. AI 請求"
Self-Hosted-Infrastructure.AIGNE-Hub -> External-Services.AI-Providers: "2. 路由至特定提供商"
Self-Hosted-Infrastructure.AIGNE-Hub.Central-Management.Flexible-Billing-System <-> External-Services.Payment-Kit: "管理點數和計費"
```

## 主要功能

AIGNE Hub 提供了一套全面的功能，專為企業內部使用和希望向其客戶提供 AI 功能的服務提供商而設計。

<x-cards data-columns="3">
  <x-card data-title="統一 API 存取" data-icon="lucide:plug-zap">
    透過單一、一致且與 OpenAI 相容的 API 端點，連接超過 8 家領先的 AI 提供商，包括 OpenAI、Anthropic 和 Google Gemini。
  </x-card>
  <x-card data-title="集中化管理" data-icon="lucide:database">
    單一儀表板提供對所有連接的模型和使用者的用量、成本和效能的全面可見性。
  </x-card>
  <x-card data-title="安全憑證儲存" data-icon="lucide:shield-check">
    所有提供商的 API 金鑰和憑證在靜態時都經過 AES 加密，確保敏感資訊受到保護。
  </x-card>
  <x-card data-title="用量分析" data-icon="lucide:pie-chart">
    追蹤 token 消耗、分析成本並監控效能指標，以優化 AI 支出和資源分配。
  </x-card>
  <x-card data-title="彈性計費系統" data-icon="lucide:credit-card">
    可採用「自備金鑰」模式供內部使用，或啟用可選的基於點數的計費系統以將 AI 服務變現。
  </x-card>
  <x-card data-title="自行託管控制" data-icon="lucide:server">
    在您自己的基礎設施內部署 AIGNE Hub，以實現最大的資料隱私、安全性和營運控制。
  </x-card>
</x-cards>

![AIGNE Hub 儀表板](../../../blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 支援的 AI 提供商

AIGNE Hub 為眾多 AI 提供商提供內建支援，並持續新增新的整合。平台會在新提供商可用時自動發現並支援它們。

| 提供商 | 支援的模型/服務 |
| :--- | :--- |
| **OpenAI** | GPT 模型、DALL-E、Embeddings |
| **Anthropic** | Claude 模型 |
| **Amazon Bedrock** | AWS 託管的模型 |
| **Google Gemini** | Gemini Pro、Vision |
| **DeepSeek** | 進階推理模型 |
| **Ollama** | 本地模型部署 |
| **OpenRouter** | 存取多個提供商 |
| **xAI** | Grok 模型 |
| **Doubao** | Doubao AI 模型 |
| **Poe** | Poe AI 平台 |

![AI 提供商設定](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

## 部署場景

AIGNE Hub 旨在適應兩種主要營運模式，以滿足不同的組織需求。

### 企業自行託管

此模式非常適合需要嚴格資料控制和隱私的內部團隊和組織。

- **基礎設施**：完全部署在組織的私有基礎設施內。
- **計費**：無需外部計費；組織直接向 AI 提供商付款。
- **資料安全**：所有資料和 API 憑證都保留在企業安全邊界內。
- **使用案例**：適用於企業 AI 計畫、內部開發團隊和研究專案。

### 服務提供商模式

此模式允許組織透過將 AIGNE Hub 轉變為一個多租戶、可變現的平台，向外部客戶提供 AI 服務。

- **計費**：與 Payment Kit 整合，以啟用基於點數的計費系統。
- **定價**：營運商可以為每個模型設定自訂費率，從而獲得利潤空間。
- **使用者引導**：支援自動使用者引導，並可設定初始點數。
- **使用案例**：非常適合 SaaS 平台、AI 服務提供商以及為客戶建構 AI 驅動解決方案的代理商。

## 總結

AIGNE Hub 作為 AIGNE 生態系統內所有生成式 AI 互動的中央閘道。它簡化了使用多個 AI 提供商的營運複雜性，透過集中式憑證管理增強了安全性，並提供了強大的監控和計費工具。透過提供彈性的部署模式，它支援從內部開發到面向公眾的 AI 服務等廣泛的使用案例。

如需深入了解系統結構，請繼續閱讀 [架構](./architecture.md) 部分。