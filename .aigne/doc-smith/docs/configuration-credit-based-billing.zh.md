# 基于积分的计费

AIGNE Hub 包含一个可选的、强大的基于积分的计费系统，旨在对 AI 模型的使用和成本进行精细控制。启用后，该系统允许运营者为各种 AI 模型定义具体的积分费率，跟踪每个用户的消耗情况，并与支付系统集成以进行积分充值。这种方法从直接转嫁提供商成本的模式转变为一种受控的内部经济体系，从而实现统一定价、成本抽象和潜在的盈利能力。

本指南详细介绍了启用和配置基于积分的计费系统的过程，包括如何为不同的 AI 模型设置具体的使用费率以及如何管理用户积分。

有关管理这些模型所属的 AI 提供商的信息，请参阅 [AI 提供商和凭证](./configuration-ai-providers-and-credentials.md) 文档。

## 启用基于积分的计费

基于积分的计费系统默认是禁用的。要激活它，您必须在您的 AIGNE Hub 配置中将 `CREDIT_BASED_BILLING_ENABLED` 环境变量设置为 `true`。启用后，系统将开始对所有 API 调用强制执行积分检查，并根据用户余额跟踪使用情况。

当此模式激活时，只有在“模型费率”配置中明确定义了费率的模型才能通过 API 使用。

## 配置模型费率

模型费率是基于积分的计费系统的基石。费率定义了使用特定 AI 模型消耗多少积分。费率通常根据输入（例如，提示词 token）和输出（例如，补全 token 或生成的图像）来定义。

您可以通过管理仪表盘在 **AI 配置 > 模型费率** 下配置这些费率。

![此屏幕截图展示了 AIGNE Hub 的 AI 配置部分中的“模型费率”配置页面，概述了用户如何管理 AI 模型定价。它展示了一个详细的表格，列出了各种 AI 模型，如 ChatGPT 和 Claude，它们的提供商、内容类型（图像、文本）以及相关的输入和输出定价费率。该界面允许编辑、删除和添加新的模型费率，为 AI 服务成本提供了全面的管理控制。](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 添加模型费率

要添加新费率，请单击“添加模型费率”按钮并提供必要的详细信息。您可以同时为多个提供商的特定模型创建一个费率。

![此屏幕截图展示了“AIGNE / Hub”平台的用户界面，特别关注 AI 模型费率配置。右侧打开了一个显眼的“添加模型费率”模态窗口，显示了用于输入模型名称、费率类型、提供商、模型成本、AIGNE Hub 积分费率配置、描述和高级选项的输入字段。在背景中，“配置”页面的“模型费率”部分下可以看到现有 AI 模型（如 ChatGPT、Claude 和 Gemini）及其提供商和类型的列表。](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

定义模型费率需要以下参数：

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="提供商识别出的模型的精确名称（例如，gpt-4o、claude-3-opus-20240229）。"></x-field>
  <x-field data-name="modelDisplay" data-type="string" data-required="false" data-desc="模型的用户友好名称，将显示在用户界面中。如果留空，将从模型 ID 生成一个格式化的名称。"></x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>AI 任务的类型。这决定了应用哪个费率。可能的值为 `chatCompletion`、`imageGeneration` 或 `embedding`。</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true" data-desc="此费率将应用到的提供商 ID 数组。这允许多个平台上的同一个模型共享一个费率。"></x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>每个输入单位收取的积分数（例如，每 1000 个提示词 token）。对于 `imageGeneration`，此值通常为 `0`。</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>每个输出单位收取的积分数（例如，每 1000 个补全 token 或每个生成的图像）。</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>来自 AI 提供商的实际成本，通常以美元/百万 token 为单位。这用于自动计算费率，不会直接向用户收费。</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="提供商的输入单位成本。"></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="提供商的输出单位成本。"></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false" data-desc="关于模型功能的附加元数据。">
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="模型在单个上下文中可以处理的最大 token 数。"></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="模型支持的特殊功能列表，例如 `tools`、`thinking` 或 `vision`。"></x-field>
    <x-field data-name="imageGeneration" data-type="object" data-required="false" data-desc="图像生成模型的具体信息。">
      <x-field data-name="max" data-type="number" data-required="false" data-desc="每个请求的最大图像数。"></x-field>
      <x-field data-name="quality" data-type="array" data-required="false" data-desc="支持的图像质量选项（例如，['standard', 'hd']）。"></x-field>
      <x-field data-name="size" data-type="array" data-required="false" data-desc="支持的图像尺寸（例如，['1024x1024', '1792x1024']）。"></x-field>
      <x-field data-name="style" data-type="array" data-required="false" data-desc="支持的图像样式（例如，['vivid', 'natural']）。"></x-field>
    </x-field>
  </x-field>
</x-field-group>

## 批量费率更新

为了简化费率管理，AIGNE Hub 提供了一种根据您的基础成本和期望的利润率批量更新所有模型费率的机制。当提供商更改其定价或您希望调整积分定价结构时，此功能特别有用。

此功能使用为每个模型定义的 `unitCosts`，并应用一个简单的公式来计算新的 `inputRate` 和 `outputRate`：

```
费率 = (单位成本 * (1 + 利润率 / 100)) / 积分价格
```

其中：
*   `UnitCost`：来自提供商的原始成本（例如，美元/百万 token）。
*   `ProfitMargin`：您定义的百分比。
*   `CreditPrice`：您向用户出售一个积分的价格。

此计算会为每个定义了 `unitCosts` 的模型的输入和输出费率执行。

## 用户积分管理

启用计费后，每个用户都有一个积分余额。AIGNE Hub 与支付组件集成来管理这些余额。

### 新用户积分赠送

您可以配置 AIGNE Hub 自动向新用户赠送初始余额。这有助于鼓励试用和采用。以下环境变量控制此功能：

*   `NEW_USER_CREDIT_GRANT_ENABLED`：设置为 `true` 以启用赠送。
*   `NEW_USER_CREDIT_GRANT_AMOUNT`：赠送给每个新用户的积分数量。
*   `CREDIT_EXPIRATION_DAYS`：促销积分过期的天数。设置为 `0` 表示永不过期。

### 购买积分

用户可以通过购买积分来增加其余额。系统可以配置一个支付链接，将用户引导至结账页面。默认情况下，AIGNE Hub 会尝试通过集成的 PaymentKit blocklet 创建和管理支付链接，但也可以通过 `CREDIT_PAYMENT_LINK` 环境变量指定自定义 URL。

## 使用量跟踪与计量

对于每次 API 调用，AIGNE Hub 都会执行一系列步骤，以确保准确的积分消耗和报告。该过程设计得既有弹性又高效，通过批量处理小额费用来减少开销。

工作流程如下：

1.  **验证用户余额**：检查用户是否有足够的积分余额。如果余额为零或更少，请求将被拒绝，并返回 `402 Payment Required` 错误。
2.  **计算成本**：在 AI 提供商成功处理请求后，AIGNE Hub 通过将提示词和补全 token（或图像数量）乘以配置的 `inputRate` 和 `outputRate` 来计算积分成本。
3.  **记录使用情况**：在数据库中创建一条使用记录，详细说明使用的 token、消耗的积分以及相关的用户和模型。
4.  **向支付系统报告**：消耗的积分作为计量事件报告给支付系统，然后支付系统会从用户余额中扣除相应金额。此报告过程会进行节流控制，将多个小请求批量处理为一次更新，以优化性能。

## 总结

基于积分的计费系统将 AIGNE Hub 转变为一个全面的 AI 资源管理平台。它为运营者提供了工具，可以将复杂的提供商定价抽象化，创建一个稳定的内部经济体系，并根据一个基于使用量的明确指标来管理用户访问。通过仔细配置模型费率和用户积分策略，您可以确保您的 AI 网关的可持续和可控运营。