# 部署场景

选择正确的部署模型对于使 AIGNE Hub 与您的特定运营和业务目标保持一致至关重要。本文档概述了两种可用的主要部署场景，并提供了清晰的比较，以指导您的架构决策。每种模式都旨在满足不同的用例，从企业内部使用到面向公众的商业服务。

AIGNE Hub 可以灵活地以两种主要模式之一进行部署：作为供企业内部使用的自托管网关，或作为内置信用和计费系统的多租户服务提供商平台。所选模式决定了计费、用户管理和安全性的配置。

下图对两种部署模型进行了高层级的比较：

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Deployment Scenarios](assets/diagram/deployment-scenarios-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

以下各节概述了每种部署场景。有关详细的配置说明，请参阅具体的子文档。

## 部署模型

AIGNE Hub 支持两种不同的运营模式，每种模式都针对不同的组织需求量身定制。以下是每种模型及其预期用例的摘要。

<x-cards data-columns="2">
  <x-card data-title="企业自托管" data-icon="lucide:building-2" data-href="/deployment-scenarios/enterprise-self-hosting">
    将 AIGNE Hub 作为内部团队的集中式网关部署在您自己的基础设施中。此模型提供了对数据和安全性的最大控制，计费由您的组织与上游 AI 提供商直接处理。
  </x-card>
  <x-card data-title="服务提供商模式" data-icon="lucide:store" data-href="/deployment-scenarios/service-provider">
    将 AIGNE Hub 配置为面向公众的、可盈利的 AI 服务。此模式启用基于积分的计费系统，允许您设置自定义定价、管理用户订阅并从 AI 服务中产生收入。
  </x-card>
</x-cards>

## 总结

本文档介绍了 AIGNE Hub 的两种主要部署场景。企业自托管模型非常适合内部使用，优先考虑安全性和直接计费。相比之下，服务提供商模式专为需要多租户和商业化的面向公众的服务而设计。

有关详细的实施指南，请继续阅读相关部分：
- **[企业自托管](./deployment-scenarios-enterprise-self-hosting.md)**
- **[服务提供商模式](./deployment-scenarios-service-provider.md)**