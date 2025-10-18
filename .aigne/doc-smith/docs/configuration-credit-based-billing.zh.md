# 5. 模型费率管理

本节详细介绍 AI 模型费率的配置和管理，这是平台基于积分的计费系统的基础。运营商将在此找到定义定价、管理模型以及排查计费不准确问题所需的信息。

## 5.1. 核心概念

**模型费率**是定义使用特定提供商的特定 AI 模型所需成本的记录。每条费率都规定了每个输入 token 和每个输出 token 收取的积分数量。这种精细的定价结构是所有用量计算和计费的基础。

关键组成部分包括：

*   **Provider**：AI 服务提供商（例如 OpenAI、Google、Bedrock）。
*   **Model**：具体的模型标识符（例如 `gpt-4`、`gemini-1.5-pro-latest`）。
*   **Type**：模型的模式，例如 `chatCompletion`、`imageGeneration` 或 `embedding`。
*   **Rates**：
    *   `inputRate`：每 1,000 个输入 token 的积分成本。
    *   `outputRate`：每 1,000 个输出 token 或每张生成图像的积分成本。
*   **Unit Costs**：模型以法定货币（例如美元）计价的实际成本，单位是每百万 token。这用于自动化的批量价格调整。

准确和完整的模型费率配置至关重要。如果用户尝试调用的模型缺少费率，API 请求将会失败，因为系统无法计算使用成本。

![模型费率管理界面](d037b6b6b092765ccbfa58706c241622.png)

## 5.2. 通过 API 管理模型费率

模型费率通过一组 RESTful API 端点进行管理。所有创建、更新和删除操作都需要管理员权限。

### 5.2.1. 创建模型费率

此端点为单个提供商上的特定模型注册新费率。

*   **Endpoint**: `POST /api/ai-providers/:providerId/model-rates`
*   **Permissions**: Admin
*   **Body**:
    *   `model` (string, required)：模型标识符。
    *   `type` (string, required)：模型类型。必须是 `chatCompletion`、`imageGeneration`、`embedding` 之一。
    *   `inputRate` (number, required)：输入的积分成本。
    *   `outputRate` (number, required)：输出的积分成本。
    *   `modelDisplay` (string, optional)：一个用户友好的显示名称。
    *   `description` (string, optional)：模型的简要描述。
    *   `unitCosts` (object, optional)：来自提供商的底层成本。
        *   `input` (number, required)：每百万输入 token 的成本。
        *   `output` (number, required)：每百万输出 token 的成本。
    *   `modelMetadata` (object, optional)：额外的模型能力。

**请求示例**：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "gpt-4o",
    "type": "chatCompletion",
    "inputRate": 10,
    "outputRate": 30,
    "modelDisplay": "GPT-4 Omni",
    "unitCosts": {
      "input": 5.0,
      "output": 15.0
    },
    "modelMetadata": {
      "maxTokens": 128000,
      "features": ["tools", "vision"]
    }
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates
```

### 5.2.2. 批量创建模型费率

此端点允许同时在多个提供商中创建相同的模型费率。这对于可从多个供应商处获得的模型很有用。

*   **Endpoint**: `POST /api/ai-providers/model-rates`
*   **Permissions**: Admin
*   **Body**: 与单个创建端点相同，但增加了一个 `providers` 数组。
    *   `providers` (array of strings, required)：应创建此费率的提供商 ID 列表。

**请求示例**：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "claude-3-sonnet",
    "type": "chatCompletion",
    "inputRate": 6,
    "outputRate": 30,
    "providers": ["prv_bedrock_xxxx", "prv_anthropic_yyyy"],
    "unitCosts": {
      "input": 3.0,
      "output": 15.0
    }
  }' \
  https://<your-domain>/api/ai-providers/model-rates
```

系统会验证所有指定的提供商是否存在，并且该费率在任何目标提供商上对于给定的模型和类型尚未存在，以防止重复。

### 5.2.3. 更新模型费率

此端点修改现有的模型费率。

*   **Endpoint**: `PUT /api/ai-providers/:providerId/model-rates/:rateId`
*   **Permissions**: Admin
*   **Body**: 可以提供创建字段的子集。
    *   `modelDisplay`, `inputRate`, `outputRate`, `description`, `unitCosts`, `modelMetadata`.

**请求示例**：

```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "inputRate": 12,
    "outputRate": 35
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates/rate_zzzzzzzz
```

### 5.2.4. 删除模型费率

此端点永久删除一个模型费率。一旦删除，相应的模型将不再可计费或使用。

*   **Endpoint**: `DELETE /api/ai-providers/:providerId/model-rates/:rateId`
*   **Permissions**: Admin

## 5.3. 批量价格更新

为简化和统一价格调整，系统提供了一种基于预定义利润率的批量更新机制。当底层提供商成本或积分估值发生变化时，此功能对于全局调整价格特别有用。

*   **Endpoint**: `POST /api/ai-providers/bulk-rate-update`
*   **Permissions**: Admin
*   **Body**:
    *   `profitMargin` (number, required)：期望的利润率百分比（例如，`20` 代表 20%）。
    *   `creditPrice` (number, required)：单个积分单位的有效价格，其货币与 `unitCosts` 中的货币相同（例如，`0.000005`，如果 1 积分 = $0.000005）。

**工作流程**：

1.  系统获取所有已填充 `unitCosts` 字段的 `AiModelRate` 记录。**没有此字段的费率将被跳过。**
2.  对于每个有效的费率，它使用以下公式计算新的 `inputRate` 和 `outputRate`：
    `newRate = (unitCost / 1,000,000) * (1 + profitMargin / 100) / creditPrice`
3.  计算出的费率将应用于这些记录。

这使运营商能够根据业务逻辑来维护定价，而无需手动重新计算每个费率。

## 5.4. 模型同步与健康状况

系统包含测试已配置模型的可用性和状态的功能。

*   **Endpoint**: `GET /api/ai-providers/test-models`
*   **Permissions**: Admin
*   **Functionality**: 此端点为每个已配置的模型费率触发一个异步作业。该作业尝试使用存储的凭据向提供商验证模型。结果（成功或失败）存储在 `AiModelStatus` 表中，可用于确定模型是否应对最终用户可用。

**速率限制**：为防止滥用和对下游提供商 API 造成过大负载，此端点受到速率限制。默认情况下，管理员在 10 分钟内最多可以触发此过程 5 次。

## 5.5. 数据模型 (`AiModelRate`)

对于高级故障排查，运营商可能需要直接检查数据库中的 `ai_model_rates` 表。

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | 费率记录的唯一标识符（例如 `rate_xxxxxxxx`）。 |
| `providerId` | String | 链接到 `AiProvider` 记录的外键。 |
| `model` | String(100) | 模型的唯一标识符（例如 `gpt-4o`）。 |
| `modelDisplay` | String(100) | 模型的人类可读名称（例如 `GPT-4 Omni`）。 |
| `type` | Enum | 模型类型（`chatCompletion`、`embedding`、`imageGeneration`）。 |
| `inputRate` | Decimal(10, 4) | 输入 token 的积分成本。 |
| `outputRate` | Decimal(10, 4) | 输出 token 或每张图像的积分成本。 |
| `unitCosts` | JSON | 存储来自提供商的底层成本（例如 `{ "input": 5.0, "output": 15.0 }`）。 |
| `modelMetadata` | JSON | 存储有关模型能力的元数据（例如 `maxTokens`、`features`）。 |

## 5.6. 运营注意事项

*   **缺少 `unitCosts`**：批量费率更新功能完全依赖于 `unitCosts` 字段。如果某个模型费率未填充此字段，该费率将在批量更新期间被跳过。如果运营商打算使用基于利润率的定价工具，应确保准确输入此数据。

*   **定价问题排查**：如果用户对某次 API 调用的收费金额感到意外，第一步是查询 `ai_model_rates` 表中使用的确切模型和提供商。验证 `inputRate` 和 `outputRate` 是否与预期值匹配。如果手动更新或批量更新产生了意外结果，就可能出现差异。

*   **模型不可用**：如果某个模型持续对用户失败，运营商可以使用 `GET /test-models` 端点触发健康检查。检查结果可在 `ai_model_status` 表中查看，有助于诊断问题是出在模型本身、提供商还是存储的凭据上。