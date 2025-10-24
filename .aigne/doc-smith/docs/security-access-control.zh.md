# 用户 API 端点

用户 API 提供用于管理用户相关数据的端点，包括信用点余额、交易历史和使用统计。这些端点对于监控用户活动和管理账单信息至关重要。

## 身份验证

本节中的所有端点都需要通过 `sessionMiddleware` 进行用户身份验证。特定端点可能需要管理员权限，这些权限由 `ensureAdmin` 中间件强制执行。

---

### 获取用户信息

检索已认证用户的详细信息，如果启用了基于信用点的计费，则包括其个人资料和信用点余额。

- **端点：** `GET /user/info`
- **权限：** 已认证用户

**成功响应 (200 OK)**

如果启用了基于信用点的计费且支付服务正在运行：

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": {
    "balance": 1000.50,
    "total": 5000.00,
    "grantCount": 5,
    "pendingCredit": 100.00
  },
  "paymentLink": "https://example.com/short/payment",
  "currency": {
    "name": "Credit",
    "symbol": "CR",
    "decimal": 2
  },
  "enableCredit": true,
  "profileLink": "https://example.com/short/profile"
}
```

如果禁用了基于信用点的计费：

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": null,
  "paymentLink": null,
  "enableCredit": false,
  "profileLink": "https://example.com/short/profile"
}
```

**错误响应**

- `401 Unauthorized`: 用户未认证。
- `404 Not Found`: 未找到用户或 Meter 配置。
- `502 Bad Gateway`: 支付服务未运行。

---

### 列出模型调用

检索 AI 模型调用的分页列表，可以按各种标准进行筛选。这是获取使用历史记录的主要端点。

- **端点：** `GET /user/model-calls`
- **权限：** 已认证用户。使用 `allUsers=true` 参数需要管理员角色。

**查询参数**

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | 用于分页的页码。默认为 `1`。 |
| `pageSize` | number | 每页的项目数。默认为 `50`，最大为 `100`。 |
| `startTime` | string | 时间范围的开始（Unix 时间戳）。 |
| `endTime` | string | 时间范围的结束（Unix 时间戳）。 |
| `search` | string | 用于筛选结果的搜索词。 |
| `status` | string | 按调用状态筛选。可以是 `success`、`failed` 或 `all`。 |
| `model` | string | 按特定模型名称筛选。 |
| `providerId` | string | 按特定提供商 ID 筛选。 |
| `appDid` | string | 按调用应用程序的 DID 筛选。 |
| `allUsers` | boolean | **仅限管理员。** 如果为 `true`，则检索所有用户的调用。 |

**成功响应 (200 OK)**

```json
{
  "count": 1,
  "list": [
    {
      "id": "z82...",
      "userDid": "z1...",
      "model": "gpt-4",
      "status": "success",
      "credits": 150.75,
      "duration": 500,
      "createdAt": "2023-10-27T10:00:00.000Z",
      // ... other fields
      "appInfo": {
        "appName": "My App",
        "appDid": "z2...",
        "appLogo": "https://example.com/logo.png",
        "appUrl": "https://example.com"
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "https://example.com/avatar.png"
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 50
  }
}
```

---

### 导出模型调用

将模型调用历史记录导出为 CSV 文件。适用与 `GET /user/model-calls` 端点相同的筛选条件。

- **端点：** `GET /user/model-calls/export`
- **权限：** 已认证用户。使用 `allUsers=true` 参数需要管理员角色。

**查询参数**

此端点接受与 `GET /user/model-calls` 相同的查询参数，但不包括 `page` 和 `pageSize`。导出限制硬编码为 10,000 条记录。

**成功响应 (200 OK)**

服务器以 `text/csv` 文件作为响应。

```csv
Timestamp,Request ID,User DID,User Name,User Email,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration(ms),App DID
2023-10-27T10:00:00.000Z,z82...,z1...,John Doe,john.doe@example.com,gpt-4,OpenAI,chat,success,100,200,300,150.75,500,z2...
```

---

### 获取使用统计

检索指定时间范围内的聚合使用情况统计数据。

- **端点：** `GET /user/usage-stats`
- **权限：** 已认证用户。

**查询参数**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `startTime` | string | 是 | 时间范围的开始（Unix 时间戳）。 |
| `endTime` | string | 是 | 时间范围的结束（Unix 时间戳）。 |

**成功响应 (200 OK)**

```json
{
  "summary": {
    "byType": {
      "chat": 100,
      "image": 20
    },
    "totalCalls": 120,
    "totalCredits": 12345.67,
    "modelCount": 5,
    "totalUsage": 500000
  },
  "dailyStats": [
    {
      "date": "2023-10-26",
      "credits": 5000.1,
      "calls": 50
    },
    {
      "date": "2023-10-27",
      "credits": 7345.57,
      "calls": 70
    }
  ],
  "modelStats": [
    {
      "model": "gpt-4",
      "totalCalls": 80,
      "totalCredits": 9000.0
    }
  ],
  "trendComparison": {
    "totalCredits": {
      "current": 12345.67,
      "previous": 11000.0,
      "change": "12.23"
    },
    "totalCalls": {
      "current": 120,
      "previous": 100,
      "change": "20.00"
    }
  }
}
```

---

### 管理员：获取所有用户统计信息

检索指定时间范围内所有用户的聚合使用情况统计数据。

- **端点：** `GET /user/admin/user-stats`
- **权限：** 管理员

**查询参数**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `startTime` | string | 是 | 时间范围的开始（Unix 时间戳）。 |
| `endTime` | string | 是 | 时间范围的结束（Unix 时间戳）。 |

**响应**

响应结构与 `GET /user/usage-stats` 相同，但包含所有用户的数据。

---

### 管理员：重新计算用户统计信息

一个管理端点，用于在指定时间范围内为用户重新生成缓存的每小时统计数据。这对于纠正数据不一致性很有用。

- **端点：** `POST /user/recalculate-stats`
- **权限：** 管理员

**请求体**

```json
{
  "userDid": "z1...",
  "startTime": "1698364800",
  "endTime": "1698451200",
  "dryRun": true
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `userDid` | string | 是 | 将要重新计算统计数据的用户的 DID。 |
| `startTime` | string | 是 | 时间范围的开始（Unix 时间戳）。 |
| `endTime` | string | 是 | 时间范围的结束（Unix 时间戳）。 |
| `dryRun` | boolean | 否 | 如果为 `true`，服务器将预览更改而不执行它们。 |

**成功响应 (200 OK)**

```json
{
  "message": "Rebuild completed",
  "deleted": 24,
  "success": 24,
  "failed": 0
}
```

---

## 信用点管理 API

用于管理和查看用户信用点的端点。

### 列出信用点授权

检索已认证用户的信用点授权的分页列表。

- **端点：** `GET /user/credit/grants`
- **权限：** 已认证用户

---

### 列出信用点交易

检索已认证用户的信用点交易的分页列表。

- **端点：** `GET /user/credit/transactions`
- **权限：** 已认证用户

---

### 获取信用点余额

检索已认证用户的当前信用点余额。

- **端点：** `GET /user/credit/balance`
- **权限：** 已认证用户

---

### 获取信用点支付链接

检索信用点支付页面的短 URL。

- **端点：** `GET /user/credit/payment-link`
- **权限：** 已认证用户

# AI 提供商 API 端点

AI 提供商 API 用于配置与各种 AI 模型提供商的连接、管理其凭证以及设置模型使用费率。这些设置是系统运行的基础。

## 身份验证

本节中的大多数端点都需要管理员权限，由 `ensureAdmin` 中间件强制执行。公开或面向用户的端点会明确注明。

---

### 列出 AI 提供商

检索所有已配置的 AI 提供商的列表，包括其模型费率和经过掩码处理的凭证。

- **端点：** `GET /ai-providers`
- **权限：** 已认证用户

**成功响应 (200 OK)**

```json
[
  {
    "id": "prov_1...",
    "name": "openai",
    "displayName": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "enabled": true,
    "modelRates": [
      {
        "id": "rate_1...",
        "model": "gpt-4",
        "type": "chatCompletion",
        "inputRate": 10,
        "outputRate": 30
      }
    ],
    "credentials": [
      {
        "id": "cred_1...",
        "name": "Default Key",
        "credentialType": "api_key",
        "active": true,
        "displayText": "Default Key (sk-••••key)",
        "maskedValue": {
          "api_key": "sk-••••key"
        }
      }
    ]
  }
]
```

---

### 创建 AI 提供商

向系统中添加一个新的 AI 提供商。

- **端点：** `POST /ai-providers`
- **权限：** 管理员

**请求体**

```json
{
  "name": "anthropic",
  "displayName": "Anthropic",
  "baseUrl": "https://api.anthropic.com",
  "enabled": true
}
```

---

### 提供商操作

- **更新提供商：** `PUT /ai-providers/:id` (管理员)
- **删除提供商：** `DELETE /ai-providers/:id` (管理员)

---

### 添加凭证

为指定的提供商添加新凭证。系统在保存前会验证该凭证。

- **端点：** `POST /ai-providers/:providerId/credentials`
- **权限：** 管理员

**请求体**

```json
{
  "name": "My API Key",
  "value": "sk-...",
  "credentialType": "api_key"
}
```

---

### 凭证操作

- **更新凭证：** `PUT /ai-providers/:providerId/credentials/:credentialId` (管理员)
- **删除凭证：** `DELETE /ai-providers/:providerId/credentials/:credentialId` (管理员)
- **检查凭证状态：** `GET /ai-providers/:providerId/credentials/:credentialId/check` (管理员) - 触发对凭证有效性的实时检查。

---

### 添加模型费率

向提供商添加新的模型费率配置。

- **端点：** `POST /ai-providers/:providerId/model-rates`
- **权限：** 管理员

**请求体**

```json
{
  "model": "claude-3-opus-20240229",
  "type": "chatCompletion",
  "inputRate": 15,
  "outputRate": 75,
  "unitCosts": {
    "input": 0.000015,
    "output": 0.000075
  }
}
```

---

### 批量添加模型费率

同时向多个提供商添加单个模型费率配置。

- **端点：** `POST /ai-providers/model-rates`
- **权限：** 管理员

**请求体**

```json
{
  "model": "llama3-70b-8192",
  "type": "chatCompletion",
  "inputRate": 1,
  "outputRate": 1,
  "providers": ["prov_1...", "prov_2..."]
}
```

---

### 模型费率操作

- **列出提供商的费率：** `GET /ai-providers/:providerId/model-rates` (用户)
- **更新模型费率：** `PUT /ai-providers/:providerId/model-rates/:rateId` (管理员)
- **删除模型费率：** `DELETE /ai-providers/:providerId/model-rates/:rateId` (管理员)

---

### 列出所有模型费率

检索所有提供商的所有模型费率的分页和可筛选列表。

- **端点：** `GET /ai-providers/model-rates`
- **权限：** 已认证用户

**查询参数**

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | number | 用于分页的页码。 |
| `pageSize` | number | 每页的项目数。 |
| `providerId` | string | 用于筛选的提供商 ID 的逗号分隔列表。 |
| `model` | string | 模型名称的搜索词。 |

---

### 批量更新模型费率

根据指定的利润率和单个信用点的价格更新所有现有的模型费率。新费率的计算公式为：`newRate = (unitCost * (1 + profitMargin / 100)) / creditPrice`。

- **端点：** `POST /ai-providers/bulk-rate-update`
- **权限：** 管理员

**请求体**

```json
{
  "profitMargin": 20,
  "creditPrice": 0.00001
}
```

**成功响应 (200 OK)**

```json
{
  "message": "Successfully updated 50 model rates",
  "updated": 50,
  "skipped": 5,
  "parameters": {
    "profitMargin": 20,
    "creditPrice": 0.00001
  },
  "summary": [
    {
      "id": "rate_1...",
      "model": "gpt-4",
      "provider": "OpenAI",
      "oldInputRate": 10,
      "newInputRate": 12,
      "oldOutputRate": 30,
      "newOutputRate": 36
    }
  ]
}
```

---

## 服务发现与监控

### 列出可用模型（公开）

一个公开端点，以与 LiteLLM 兼容的格式提供所有已启用和配置的模型的列表。这对于客户端应用程序的服务发现至关重要。

- **端点：** `GET /ai-providers/models`
- **权限：** 公开

**成功响应 (200 OK)**

```json
[
  {
    "key": "openai/gpt-4",
    "model": "gpt-4",
    "type": "chat",
    "provider": "openai",
    "providerId": "prov_1...",
    "input_credits_per_token": 10,
    "output_credits_per_token": 30,
    "modelMetadata": {
      "maxTokens": 8192,
      "features": ["tools", "vision"]
    },
    "status": {
      "id": "status_1...",
      "lastChecked": "2023-10-27T10:00:00.000Z",
      "latency": 120,
      "status": "operational"
    },
    "providerDisplayName": "OpenAI"
  }
]
```

---

### 触发模型健康检查

一个管理端点，用于将所有已配置模型的健康检查加入队列。这对于强制刷新模型状态很有用。

- **端点：** `GET /ai-providers/test-models`
- **权限：** 管理员

---

### 提供商健康状态

提供所有已配置提供商凭证的健康状态摘要。此端点设计用于与监控和警报系统集成。

- **端点：** `GET /ai-providers/health`
- **权限：** 公开

**成功响应 (200 OK)**

```json
{
  "providers": {
    "openai": {
      "Default Key": {
        "running": true
      }
    },
    "anthropic": {
      "Primary Key": {
        "running": false
      }
    }
  },
  "timestamp": "2023-10-27T12:00:00.000Z"
}
```