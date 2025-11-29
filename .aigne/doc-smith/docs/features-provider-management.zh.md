# Provider 管理

有效管理上游 AI Provider 对于维护一个可靠且经济高效的 AI 网关至关重要。AIGNE Hub 集中管理此过程，提供统一的界面来连接、配置和管理各种 AI 服务的凭证。本节详细介绍处理 Provider 设置、凭证和模型费率的流程。

下图说明了 Provider、凭证和模型费率在 AIGNE Hub 中是如何相互关联的：

```d2
direction: down

AIGNE-Hub: {
  label: "AIGNE Hub 管理"
  shape: rectangle

  Provider: {
    label: "Provider\n(例如 OpenAI, Google)"
    shape: rectangle
    style.fill: "#f0f4ff"
  }

  Credential: {
    label: "凭证\n(例如 API 密钥)"
    shape: rectangle
    style.fill: "#e6fffa"
  }

  Model-Rate: {
    label: "模型费率\n(例如 gpt-4o-mini 成本)"
    shape: rectangle
    style.fill: "#fffbe6"
  }
}

AIGNE-Hub.Provider -> AIGNE-Hub.Credential: "拥有一个或多个"
AIGNE-Hub.Provider <-> AIGNE-Hub.Model-Rate: "与之关联"
```

## Provider 配置

Provider 是将 AIGNE Hub 连接到上游 AI 服务（如 OpenAI、Google 和 AWS Bedrock）的基础元素。正确的配置确保 Hub 可以将请求路由到适当的服务。

![显示已配置 AI provider 列表的 Provider 配置 UI，如 OpenAI、Google 和 AWS Bedrock。](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

### 添加 Provider

要集成新的 AI 服务，您必须将其添加为 Provider。每个 Provider 都需要一个唯一的名称、一个用于 UI 显示的名称，以及特定于服务的详细信息，如 `baseUrl` 或 `region`。

#### 请求体

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>Provider 的官方名称。必须是支持的 Provider 值之一（例如 `openai`、`google`、`bedrock`）。</x-field-desc>
  </x-field>
  <x-field data-name="displayName" data-type="string" data-required="true">
    <x-field-desc markdown>将在 UI 中显示的 Provider 的用户友好名称。</x-field-desc>
  </x-field>
  <x-field data-name="baseUrl" data-type="string" data-required="false">
    <x-field-desc markdown>Provider API 端点的基础 URL。大多数 Provider 都需要此项，但对于 AWS Bedrock 是可选的。</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>Bedrock 服务的 AWS 区域。仅 `bedrock` Provider 需要此项。</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-default="true" data-required="false">
    <x-field-desc markdown>启用或禁用 Provider。禁用的 Provider 将不会用于路由请求。</x-field-desc>
  </x-field>
</x-field-group>

### 更新 Provider

您可以修改现有 Provider 的配置，例如其 `baseUrl`、`region` 或 `enabled` 状态。

#### 请求体

<x-field-group>
  <x-field data-name="baseUrl" data-type="string" data-required="false">
    <x-field-desc markdown>Provider API 端点的更新后基础 URL。</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>Bedrock 服务的更新后 AWS 区域。</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-required="false">
    <x-field-desc markdown>Provider 的新状态。</x-field-desc>
  </x-field>
</x-field-group>

### 列出和删除 Provider

您可以检索所有已配置 Provider 的列表，或通过其 ID 删除特定的 Provider。删除 Provider 也会移除所有关联的凭证和模型费率。

## 凭证管理

凭证用于向上游 AI Provider 进行身份验证。AIGNE Hub 会加密并安全地存储这些凭证，并将其与特定的 Provider 关联。每个 Provider 可以有多个凭证，这允许密钥轮换和负载均衡。

### 添加凭证

添加凭证时，您必须指定其类型和值。AIGNE Hub 会自动根据 Provider 的服务验证凭证，以确保其处于活动状态。

#### 请求体

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>凭证的描述性名称（例如，“A 团队 API 密钥”）。</x-field-desc>
  </x-field>
  <x-field data-name="credentialType" data-type="string" data-default="api_key" data-required="false">
    <x-field-desc markdown>凭证的类型。支持的值为 `api_key` 和 `access_key_pair`。</x-field-desc>
  </x-field>
  <x-field data-name="value" data-type="string or object" data-required="true">
    <x-field-desc markdown>凭证的值。对于 `api_key`，这是一个字符串。对于 `access_key_pair`，这是一个包含 `access_key_id` 和 `secret_access_key` 的对象。</x-field-desc>
  </x-field>
</x-field-group>

### 凭证验证

AIGNE Hub 包含一个用于检查已存储凭证有效性的端点。此操作会触发使用指定凭证对 Provider 进行测试连接，以确认其处于活动状态并具有必要的权限。

### 更新和删除凭证

可以更新现有凭证的值或将其删除。当凭证被删除时，它将从系统中永久移除，并且不能再用于请求。

## 模型费率管理

模型费率定义了使用特定 AI 模型所需的 AIGNE Hub 积分成本。这些费率对于在[服务提供商模式](./deployment-scenarios-service-provider.md)下运行的系统至关重要，在该模式下，使用情况是根据积分计费的。

![模型费率配置 UI，显示了 AI 模型及其相关成本的列表。](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 添加模型费率

您可以为已配置 Provider 支持的任何模型定义费率。这包括为输入和输出 Token（对于文本模型）或每张图像/每个视频（对于生成模型）设置单独的积分成本。

#### 请求体

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>模型的标识符（例如，`gpt-4o-mini`）。</x-field-desc>
  </x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>服务的类型。支持的值为 `chatCompletion`、`imageGeneration`、`embedding` 和 `video`。</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true">
    <x-field-desc markdown>此模型费率适用的 Provider ID 数组。这允许单个模型由多个 Provider 提供。</x-field-desc>
  </x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true">
    <x-field-desc markdown>输入的积分成本（例如，每 1,000 个 Token）。</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true">
    <x-field-desc markdown>输出的积分成本（例如，每 1,000 个 Token）。</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>Provider 提供的每百万单位（Token/图像）的实际成本（美元）。用于根据利润率自动计算费率。</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="每百万单位的输入成本。"></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="每百万单位的输出成本。"></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false">
    <x-field-desc markdown>有关模型功能的附加元数据。</x-field-desc>
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="最大上下文窗口大小。"></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="支持的功能数组，例如 `tools` 或 `vision`。</x-field>
  </x-field>
</x-field-group>

### 批量更新模型费率

为了简化价格调整，AIGNE Hub 支持根据定义的利润率和积分价格批量更新模型费率。系统会自动为所有定义了 `unitCosts` 的模型重新计算 `inputRate` 和 `outputRate`。

计算方式如下：
`新费率 = (单位成本 * (1 + 利润率 / 100)) / 积分价格`

#### 请求体

<x-field-group>
  <x-field data-name="profitMargin" data-type="number" data-required="true">
    <x-field-desc markdown>期望的利润率百分比（例如，`20` 表示 20%）。</x-field-desc>
  </x-field>
  <x-field data-name="creditPrice" data-type="number" data-required="true">
    <x-field-desc markdown>单个积分的美元价格。</x-field-desc>
  </x-field>
</x-field-group>

### 更新和删除模型费率

可以修改或删除单个模型费率。如果删除模型费率，在启用基于积分的计费时，相应模型将不再对用户可用。

## 总结

本节介绍了在 AIGNE Hub 中管理 AI Provider、凭证和模型费率的核心功能。正确配置这些资源对于 AI 服务的安全性、可靠性和财务管理至关重要。

有关相关主题的更多信息，请参阅以下部分：
<x-cards data-columns="2">
  <x-card data-title="服务提供商模式" data-href="/deployment-scenarios/service-provider" data-icon="lucide:briefcase">了解如何配置基于积分的计费和自定义定价模型。</x-card>
  <x-card data-title="安全和访问控制" data-href="/features/security" data-icon="lucide:shield">了解安全架构，包括加密存储和访问控制。</x-card>
</x-cards>