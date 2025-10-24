# AI 提供商

AI 提供商 API 是用于集成和配置各种外部人工智能服务的中央管理层。它作为一个抽象层，为管理凭证、定义模型定价以及监控不同 AI 提供商的健康状况提供统一的接口。该系统专为可扩展性和弹性而设计，集成了加密凭证存储和跨多个 API 密钥的负载均衡等功能。

## 核心概念

理解这些核心概念对于操作和维护 AI 提供商集成至关重要。

### 提供商

**提供商**代表一个外部 AI 服务，例如 OpenAI、Google Gemini 或 Amazon Bedrock。每个提供商都配置了必要的详细信息，以便系统能够与其 API 进行交互。

- **`name`**：提供商的唯一标识符（例如 `openai`、`bedrock`）。
- **`displayName`**：提供商的人类可读名称。
- **`baseUrl`**：提供商 API 的基础端点。对于像 Amazon Bedrock 这样的某些服务，可能不需要此项。
- **`region`**：需要它的服务的特定云区域（例如 AWS 的 `us-east-1`）。
- **`enabled`**：一个布尔标志，用于在系统范围内启用或禁用该提供商。

### 凭证

凭证用于向 AI 提供商验证请求。该系统旨在为单个提供商管理多个凭证，从而提高可靠性和吞吐量。

#### 安全与加密

为确保安全，凭证的敏感部分（例如 `api_key` 或 `secret_access_key`）会使用 blocklet 的原生 `security.encrypt` 函数进行静态加密。只有非敏感标识符（如 `access_key_id`）以明文形式存储。当通过 API 检索凭证以供显示时，敏感值会被屏蔽以防止意外泄露。

#### 凭证类型

- **`api_key`**：用于身份验证的单个密钥。
- **`access_key_pair`**：一对密钥，通常是 `access_key_id` 和 `secret_access_key`。
- **`custom`**：一种灵活的对象结构，适用于具有独特身份验证方案的提供商。

#### 负载均衡

该系统为具有多个活动凭证的提供商实现了一种平滑加权轮询算法。此机制根据分配的权重将 API 请求分发到可用的密钥中，确保没有单个凭证成为瓶颈。

- 每个凭证都有一个 `weight`（默认为 100）。
- 该算法选择当前有效权重最高的凭证，然后为其后续选择降低其有效权重。
- 这种方法可以实现负载随时间的均衡分布，从而提高容错能力。如果凭证失败，它将被标记为非活动状态，并暂时从轮换中移除，直到重新验证。

### 模型费率

模型费率定义了使用来自提供商的特定 AI 模型的成本，构成了基于积分的计费系统的基础。

- 每个费率将一个 `model`（例如 `gpt-4-turbo`）链接到一个 `providerId`。
- 它指定了 `inputRate` 和 `outputRate`，代表每个 token（或其他单位）收取的积分数。
- 费率还可以包括 `unitCosts`（提供商的实际成本，以美元计）和 `modelMetadata`，例如最大 token 数和支持的功能（`tools`、`vision` 等）。

---

## API 端点

以下部分详细介绍了用于管理 AI 提供商、凭证和模型费率的 RESTful API。

### 提供商管理

用于创建、检索、更新和删除 AI 提供商的端点。

- **列出提供商**
  - `GET /api/ai-providers`
  - 检索所有已配置的 AI 提供商的列表，包括其关联的凭证和模型费率。

- **创建提供商**
  - `POST /api/ai-providers`
  - 创建一个新的 AI 提供商。提供商的 `name` 必须是唯一的。
  - **请求体：**
    ```json
    {
      "name": "openai",
      "displayName": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "enabled": true
    }
    ```

- **更新提供商**
  - `PUT /api/ai-providers/:id`
  - 更新现有提供商的配置。

- **删除提供商**
  - `DELETE /api/ai-providers/:id`
  - 删除一个提供商及其所有关联的凭证和模型费率。

### 凭证管理

用于管理特定提供商凭证的端点。

- **创建凭证**
  - `POST /api/ai-providers/:providerId/credentials`
  - 向提供商添加新凭证。系统在保存之前会根据提供商的 API 验证该凭证。
  - **请求体：**
    ```json
    {
      "name": "My API Key",
      "value": "sk-...",
      "credentialType": "api_key"
    }
    ```

- **更新凭证**
  - `PUT /api/ai-providers/:providerId/credentials/:credentialId`
  - 更新现有凭证。此操作也会触发重新验证。

- **删除凭证**
  - `DELETE /api/ai-providers/:providerId/credentials/:credentialId`
  - 从提供商中移除凭证。

- **检查凭证状态**
  - `GET /api/ai-providers/:providerId/credentials/:credentialId/check`
  - 手动触发对特定凭证的验证检查。这对于故障排除和重新激活先前被标记为非活动的密钥很有用。

### 模型费率管理

用于管理 AI 模型定价的端点。

- **列出所有模型费率**
  - `GET /api/ai-providers/model-rates`
  - 检索所有提供商的所有模型费率的分页和可搜索列表。支持按 `providerId` 和 `model` 进行筛选。

- **批量创建模型费率**
  - `POST /api/ai-providers/model-rates`
  - 同时为多个提供商创建相同的模型费率。
  - **请求体：**
    ```json
    {
      "model": "claude-3-sonnet",
      "type": "chatCompletion",
      "inputRate": 3,
      "outputRate": 15,
      "providers": ["provider-id-1", "provider-id-2"]
    }
    ```

- **更新模型费率**
  - `PUT /api/ai-providers/:providerId/model-rates/:rateId`
  - 更新特定模型的费率、描述或元数据。

- **批量更新费率**
  - `POST /api/ai-providers/bulk-rate-update`
  - 更新所有已定义 `unitCosts` 的模型费率。新费率根据指定的 `profitMargin` 和 `creditPrice` 计算。此端点用于系统范围的价格调整。
  - **请求体：**
    ```json
    {
      "profitMargin": 20,
      "creditPrice": 0.001
    }
    ```

### 模型发现

供客户端应用程序用于获取可用模型的公共可访问端点。

- **获取可用模型**
  - `GET /api/ai-providers/models`
  - 以 LiteLLM 格式返回所有可用且已启用的模型的扁平化列表。这是需要发现模型的服务所使用的主要端点。

- **获取聊天模型**
  - `GET /api/ai-providers/chat/models`
  - 返回按模型名称分组的模型列表，显示每个模型受哪些提供商支持。这主要由 UI 使用。

### 系统操作

用于系统监控和维护任务的端点。

- **健康检查**
  - `GET /api/ai-providers/health`
  - 提供所有提供商的所有凭证的操作状态快照。它返回一个 JSON 对象，指示每个凭证是否正在 `running`。此端点对于监控和警报至关重要。
  - **响应示例：**
    ```json
    {
      "providers": {
        "openai": {
          "Primary Key": { "running": true },
          "Secondary Key": { "running": false }
        }
      },
      "timestamp": "2023-10-27T10:00:00.000Z"
    }
    ```

- **测试模型**
  - `GET /api/ai-providers/test-models`
  - 触发一个异步作业，以测试与已配置费率关联的模型的有效性和状态。此端点有速率限制以防止滥用。

---

## 操作指南

### 监控

用于监控 AI 提供商集成的主要端点是 `GET /api/ai-providers/health`。应将其集成到您现有的监控和警报基础设施中。

- **操作：** 定期轮询 `/health` 端点。
- **警报条件：** 如果任何凭证的 `running` 状态设置为 `false`，则触发警报。
- **检查示例：**
  ```bash
  curl -s http://localhost:3030/api/ai-providers/health | jq '.providers[].[] | select(.running == false)'
  ```
  如果上述命令产生任何输出，则应触发警报。

### 故障排除

- **凭证失败：** 当因身份验证错误导致对提供商的 API 调用失败时，相应的凭证会自动被标记为非活动状态（`active: false`）并存储错误消息。它将从负载均衡轮换中移除。
- **重新激活凭证：** 要重新激活凭证，首先通过 `PUT /api/ai-providers/:providerId/credentials/:credentialId` 使用正确的密钥更新它。系统将对其进行重新验证。或者，您可以使用 `GET .../check` 端点手动触发验证。
- **测试的速率限制：** `GET /api/ai-providers/test-models` 端点有严格的速率限制（每位用户每 10 分钟 5 次请求），以防止对下游 AI 提供商 API 造成过大压力。如果您收到 `429 Too Many Requests` 错误，请等待指定的 `retryAfter` 时间段。