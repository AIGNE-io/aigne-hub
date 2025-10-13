# 计费与支付

AIGNE Hub 包含一个灵活的、基于额度的计费系统，专为企业内部使用和面向公众的服务提供商部署而设计。该系统构建于 Blocklet 的 Payment Kit 之上，为计量 AI 使用量、管理客户额度以及处理支付提供了一个强大的机制。

## 系统架构

AIGNE Hub 的计费功能根据系统配置，在两种主要模式下运行。

### 部署场景

1.  **企业自托管（计费禁用）**：在此模式下，AIGNE Hub 纯粹充当一个网关。所有 API 调用都将传递给底层的 AI 提供商，计费由组织与提供商（例如 OpenAI、Anthropic）之间直接处理。这是默认且最简单的部署模型，非常适合管理自有 AI 提供商订阅的内部团队。

2.  **服务提供商（计费启用）**：当启用基于额度的计费时，AIGNE Hub 会转变为一个功能齐全的 AI 服务平台。它抽象了各个提供商的成本，而是基于统一的额度系统向用户收费。此模式专为希望向客户提供 AI 服务的运营商设计，可以完全控制定价、计费和用户管理。

### 核心组件

计费系统依赖于与 **Payment Kit** blocklet (`did:z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk`) 的紧密集成，这是此模式下的一个关键依赖项。

-   **计量器 (`agent-hub-ai-meter`)**：Payment Kit 中的一个核心组件，用于记录使用情况。每次 AI API 调用（聊天、图像生成、嵌入）都会触发一个计量事件，消耗特定数量的额度。
-   **记账单位 (`AIGNE Hub Credits`)**：Hub 内的标准化货币。所有模型的使用都以这些额度进行定价和收费，无论底层 AI 提供商是谁，都能提供一致的计费体验。
-   **客户钱包**：Payment Kit 为每个用户管理一个额度余额。在处理 AI 请求之前，Hub 会验证用户的余额。
-   **支付链接**：用户可以通过可配置的支付链接购买额度，这些链接由 Payment Kit 处理。

## 配置

系统运营商可以通过一组配置变量来管理计费系统。

### 启用基于额度的计费

要激活服务提供商模式，必须启用以下设置：

-   `creditBasedBillingEnabled`: (boolean) 设置为 `true` 以启用额度系统。当为 `false` 时，Hub 在企业自托管模式下运行。

### 新用户引导

为了鼓励用户采用，运营商可以向新用户赠送一定的免费额度。

-   `newUserCreditGrantEnabled`: (boolean) 如果为 `true`，新用户将自动获得起始额度。
-   `newUserCreditGrantAmount`: (number) 授予每个新用户的额度数量。
-   `creditExpirationDays`: (number) 赠送的额度在此天数后过期。值为 `0` 表示额度永不过期。

### 额度购买流程

运营商可以指定一个 URL，用户可以在该页面购买更多额度。

-   `creditPaymentLink`: (string) 额度购买页面的 URL。如果未指定，系统会尝试使用 Payment Kit 预配置的额度产品生成一个默认支付链接。

## 定价与费率管理

服务提供商模式下，运营商的一项关键任务是为 AI 模型的使用设定价格。价格被定义为“费率”——即对给定工作单元（例如，每 1000 个 token）收取的 AIGNE Hub 额度数量。

### 费率计算模型

该系统支持灵活的定价模型，允许运营商在 AI 提供商的实际成本之上设定期望的利润率。计算最终额度费率的公式是：

```
费率 = (单位成本 * (1 + 利润率 / 100)) / 额度单价
```

-   **单位成本 (UnitCost)**：来自提供商的模型的实际成本（例如，每百万 token 的美元价格）。该值按模型存储在 `unitCosts` 字段中。
-   **利润率 (ProfitMargin)**：运营商期望的利润率百分比（例如，`20` 代表 20%）。
-   **额度单价 (CreditPrice)**：一个 AIGNE Hub 额度的有效价格，其货币与 `UnitCost` 相同。

### 管理模型费率

费率可以通过 AIGNE Hub 的 REST API 进行管理。

#### 手动费率配置

运营商可以为每个模型单独设置费率。这为特定模型的定价提供了精细的控制。

**API 端点**：`POST /api/v2/ai-providers/{providerId}/model-rates`

**示例负载**：

```json
{
  "model": "gpt-4-turbo",
  "type": "chatCompletion",
  "inputRate": 500,
  "outputRate": 1500,
  "unitCosts": {
    "input": 0.00001,
    "output": 0.00003
  }
}
```

-   `inputRate`/`outputRate`：以 AIGNE Hub 额度为单位的价格。
-   `unitCosts`：来自提供商的底层成本，用于自动计算。

#### 批量费率更新

对于全系统的价格调整，可以使用批量更新机制。这对于根据提供商成本或业务策略的变化调整价格非常有效。

**API 端点**：`POST /api/v2/ai-providers/bulk-rate-update`

**示例负载**：

```json
{
  "profitMargin": 25,
  "creditPrice": 0.000005
}
```

此请求将为所有已定义 `unitCosts` 的模型重新计算并更新 `inputRate` 和 `outputRate`，基于每个额度 $0.000005 的价格应用 25% 的利润率。

## 运营与故障排查

### 依赖项

-   **Payment Kit**：最关键的依赖项。如果 Payment Kit blocklet 未运行，所有基于额度的操作——包括余额检查、额度扣除和购买——都将失败。请确保 Payment Kit 处于活动且健康的状态。

### 常见问题

-   **额度不足错误 (`CreditError 402`)**：当最终用户的额度余额为零或过低而无法处理请求时，将返回此错误。解决方法是用户通过配置的支付链接购买更多额度。
-   **计量事件失败**：如果 AIGNE Hub 无法与 Payment Kit 通信以记录计量事件，AI 请求将失败，以防止产生未计费的使用。检查 AIGNE Hub 和 Payment Kit 的日志以诊断连接问题。
-   **定价不正确**：如果费率看起来不正确，请验证 `AiModelRate` 表中的值，并确保任何批量更新都是使用正确的 `profitMargin` 和 `creditPrice` 参数执行的。