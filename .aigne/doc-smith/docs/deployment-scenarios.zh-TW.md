# 部署情境

選擇正確的部署模型對於使 AIGNE Hub 符合您的特定營運和業務目標至關重要。本文件概述了兩種主要的部署情境，提供清晰的比較以指導您的架構決策。每種模式都旨在解決從內部企業使用到面向公眾的商業服務等不同用例。

AIGNE Hub 提供靈活性，可以部署為兩種主要模式之一：作為供內部企業使用的自架設閘道，或作為具有內建點數和計費系統的多租戶服務提供商平台。所選的模式將決定計費、使用者管理和安全性的設定。

下圖提供了兩種部署模型的高層次比較：

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Deployment Scenarios](assets/diagram/deployment-scenarios-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

以下章節將概述每種部署情境。有關詳細的設定說明，請參閱具體的子文件。

## 部署模型

AIGNE Hub 支援兩種不同的營運模式，每種模式都是為了滿足不同的組織需求而量身打造。以下是每種模型的摘要及其預期用例。

<x-cards data-columns="2">
  <x-card data-title="企業自架設" data-icon="lucide:building-2" data-href="/deployment-scenarios/enterprise-self-hosting">
    在您自己的基礎設施內部署 AIGNE Hub，作為內部團隊的集中式閘道。此模型對資料和安全性提供最大程度的控制，計費則由您的組織與上游 AI 供應商直接處理。
  </x-card>
  <x-card data-title="服務供應商模式" data-icon="lucide:store" data-href="/deployment-scenarios/service-provider">
    將 AIGNE Hub 設定為一個面向公眾、可營利的 AI 服務。此模式啟用基於點數的計費系統，讓您可以設定自訂定價、管理使用者訂閱，並從 AI 服務中創造營收。
  </x-card>
</x-cards>

## 總結

本文件介紹了 AIGNE Hub 的兩種主要部署情境。企業自架設模型非常適合內部使用，優先考慮安全性和直接計費。相較之下，服務供應商模式則是為需要多租戶和營利功能的面向公眾服務而設計。

有關詳細的實作指南，請前往相關章節：
- **[企業自架設](./deployment-scenarios-enterprise-self-hosting.md)**
- **[服務供應商模式](./deployment-scenarios-service-provider.md)**