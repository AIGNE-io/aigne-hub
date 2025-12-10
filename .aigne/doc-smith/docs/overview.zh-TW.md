# 總覽

您是否正在為管理日益增多的 API 金鑰、計費系統以及不同 AI 供應商的整合而苦惱？本文件將全面介紹 AIGNE Hub，這是一個統一的 AI 閘道，旨在簡化這種複雜性。您將了解其核心功能、主要優勢和系統架構，從而清楚地認識其在基礎設施管理方面的價值。

AIGNE Hub 作為一個集中式閘道，讓您能夠透過單一、一致的 API 將您的應用程式連接到領先的大型語言模型（LLM）和 AIGC 服務。無論您是將其部署為內部工具，還是作為一個可營利的多租戶服務，它都能簡化 API 金鑰的管理、用量追蹤和安全性。

## 為何選擇 AIGNE Hub？

將多個 AI 服務整合到組織的基礎設施中會帶來巨大的營運開銷。團隊經常面臨著供應商特定的 API 碎片化、計費週期分散以及安全性模型不一致的局面。這種複雜性會減緩開發速度、使成本管理複雜化，並增加安全風險。

下圖說明了 AIGNE Hub 如何位於您的應用程式和各種 AI 供應商之間，以解決這些挑戰：

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Overview](assets/diagram/overview-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

AIGNE Hub 旨在透過提供以下功能來解決這些特定挑戰：

-   **單一整合點：** 它為所有連接的供應商提供一個統一的、與 OpenAI 相容的 API 端點。這使得開發人員無需學習和維護多個 SDK 和整合模式。
-   **集中式憑證管理：** 所有上游 API 金鑰都透過 AES 加密安全地儲存在一個地方，降低了金鑰在各種應用程式和環境中暴露的風險。
-   **統一的用量和成本分析：** 從單一儀表板全面了解所有模型、使用者和供應商的消耗和支出情況。這簡化了預算追蹤和資源分配。
-   **彈性的部署模型：** AIGNE Hub 既可以部署為純內部使用（您自備金鑰），也可以作為一個內建基於點數的計費系統的公開服務。

## 核心功能

AIGNE Hub 提供一套強大的功能，旨在簡化 AI 服務使用和管理的整個生命週期。

<x-cards data-columns="3">
  <x-card data-title="多供應商管理" data-icon="lucide:cloud">
    透過單一介面連接超過 8 家領先的 AI 供應商，如 OpenAI、Anthropic 和 Google Gemini。
  </x-card>
  <x-card data-title="統一的 API 端點" data-icon="lucide:plug-zap">
    使用與 OpenAI 相容的 RESTful API 與所有模型互動，進行聊天完成、圖像生成和嵌入。
  </x-card>
  <x-card data-title="用量與成本分析" data-icon="lucide:line-chart">
    透過全面的分析儀表板，監控所有使用者和供應商的 token 用量、成本和延遲指標。
  </x-card>
  <x-card data-title="集中式安全" data-icon="lucide:shield-check">
    受益於加密的 API 金鑰儲存、OAuth 整合、基於角色的存取控制（RBAC）和詳細的稽核日誌。
  </x-card>
  <x-card data-title="彈性的計費系統" data-icon="lucide:credit-card">
    可選啟用由 Payment Kit 驅動的基於點數的計費系統，為外部使用者提供營利服務。
  </x-card>
  <x-card data-title="內建遊樂場" data-icon="lucide:flask-conical">
    直接從 AIGNE Hub 使用者介面即時測試和實驗任何已連接的 AI 模型。
  </x-card>
</x-cards>

## 支援的 AI 供應商

AIGNE Hub 支援越來越多的主要 AI 供應商。該系統設計為可擴展的，並持續增加新的供應商。

| 供應商 | 支援的服務 |
| :--- | :--- |
| **OpenAI** | GPT 模型、DALL-E、Embeddings |
| **Anthropic** | Claude 模型 |
| **Google Gemini** | Gemini Pro、Vision 模型 |
| **Amazon Bedrock** | AWS 託管的基礎模型 |
| **DeepSeek** | 進階推理模型 |
| **xAI** | Grok 模型 |
| **OpenRouter** | 多個供應商的聚合器 |
| **Ollama** | 本地模型部署 |
| **Doubao** | 豆包 AI 模型 |
| **Poe** | Poe AI 平台 |

## 系統架構

AIGNE Hub 是為可靠性和性能而設計的，它是在 AIGNE 框架上建構的 [Blocklet](https://blocklet.io)。這種架構確保了在 AIGNE 生態系統內的無縫整合，並為雲原生部署和擴展提供了堅實的基礎。

技術堆疊的主要元件包括：

-   **後端：** 使用 Node.js 和 TypeScript 建構，提供強型別且高效的伺服器端環境。
-   **前端：** 使用 React 19 建構的現代化使用者介面。
-   **資料庫：** 使用 SQLite 搭配 Sequelize ORM 進行本地資料儲存，確保設定簡單且資料管理可靠。
-   **框架：** 運用最新版本的 AIGNE 框架來實現核心功能和整合能力。

![AIGNE Hub Dashboard](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## 總結

本總覽介紹了 AIGNE Hub 作為一個統一的 AI 閘道，旨在簡化多供應商 AI 服務的基礎設施管理。我們概述了它解決的問題、其核心功能及其技術架構。

接下來，您可以繼續閱讀以下部分以獲取更詳細的資訊：

<x-cards data-columns="2">
  <x-card data-title="快速入門" data-href="/getting-started" data-icon="lucide:rocket">
    遵循逐步指南，在 30 分鐘內部署和設定您的 AIGNE Hub 實例。
  </x-card>
  <x-card data-title="部署情境" data-href="/deployment-scenarios" data-icon="lucide:milestone">
    探索將 AIGNE Hub 部署為企業內部使用或作為營利服務的架構指南。
  </x-card>
</x-cards>