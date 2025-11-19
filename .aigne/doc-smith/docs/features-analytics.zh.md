# 使用量与成本分析

了解 AI 模型的使用情况对于管理成本、监控性能和确保资源公平分配至关重要。本文档详细介绍了如何查询使用情况统计数据、跟踪成本以及解读 AIGNE Hub 用于分析和报告的数据模型。

## 概述

AIGNE Hub 将每一次 API 交互记录为一个 `ModelCall` 条目。这些记录是所有使用量分析的基础。系统提供了多个 API 端点来查询和聚合这些数据，让您可以监控整个系统或单个用户的使用情况。这使得对 token 使用量、积分消耗和总体 API 调用量进行详细跟踪成为可能。

## 数据模型

理解底层数据结构对于有效查询和解读分析数据至关重要。下图说明了 `ModelCall` 记录是如何生成并被分析端点使用的。

```d2
direction: down

User: {
  shape: c4-person
}

App: {
  label: "用户应用程序"
  shape: rectangle
}

Aigne-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  Model-Call-Logger: {
    label: "模型调用记录器"
  }

  Analytics-API: {
    label: "分析 API"
    shape: rectangle

    Usage-Stats-Endpoint: {
      label: "GET /api/user/usage-stats"
    }

    Model-Calls-Endpoint: {
      label: "GET /api/user/model-calls"
    }

    Export-Endpoint: {
      label: "GET /.../export"
    }
  }
}

AI-Provider: {
  label: "AI 提供商\n（例如 OpenAI）"
  shape: rectangle
}

DB: {
  label: "数据库"
  shape: cylinder

  Model-Call-Table: {
    label: "ModelCall 记录"
  }
}

App -> Aigne-Hub: "1. API 调用"
Aigne-Hub -> AI-Provider: "2. 转发请求"
AI-Provider -> Aigne-Hub: "3. 返回响应"
Aigne-Hub.Model-Call-Logger -> DB.Model-Call-Table: "4. 记录 'ModelCall' 条目"

User -> Aigne-Hub.Analytics-API: "5. 请求分析数据"
Aigne-Hub.Analytics-API.Usage-Stats-Endpoint -> DB.Model-Call-Table: "6. 查询并聚合数据"
Aigne-Hub.Analytics-API.Model-Calls-Endpoint -> DB.Model-Call-Table: "6. 查询并筛选数据"
Aigne-Hub.Analytics-API.Export-Endpoint -> DB.Model-Call-Table: "6. 查询并导出数据"
DB.Model-Call-Table -> Aigne-Hub.Analytics-API: "7. 返回数据"
Aigne-Hub.Analytics-API -> User: "8. 返回统计/日志/CSV"

```

### `ModelCall` 对象

通过 Hub 向 AI 提供商发出的每个请求都会被记录为一次 `ModelCall`。该对象包含有关请求、其执行情况以及相关成本的详细信息。

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="模型调用记录的唯一标识符。"></x-field>
  <x-field data-name="providerId" data-type="string" data-required="true" data-desc="本次调用所使用的 AI 提供商的标识符。"></x-field>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="被调用的具体模型（例如 'gpt-4o-mini'）。"></x-field>
  <x-field data-name="credentialId" data-type="string" data-required="true" data-desc="用于向提供商进行身份验证的凭证 ID。"></x-field>
  <x-field data-name="type" data-type="string" data-required="true" data-desc="API 调用的类型。可能的值包括 'chatCompletion'、'embedding'、'imageGeneration'、'audioGeneration'、'video' 或 'custom'。"></x-field>
  <x-field data-name="totalUsage" data-type="number" data-required="true" data-desc="一个标准化的使用量指标。对于文本模型，这通常是 token 的总数（输入 + 输出）。"></x-field>
  <x-field data-name="usageMetrics" data-type="object" data-required="false" data-desc="使用量的详细分解，例如输入和输出的 token 数。">
    <x-field data-name="inputTokens" data-type="number" data-desc="输入提示中的 token 数量。"></x-field>
    <x-field data-name="outputTokens" data-type="number" data-desc="生成响应中的 token 数量。"></x-field>
  </x-field>
  <x-field data-name="credits" data-type="number" data-required="true" data-desc="根据配置的模型费率，本次调用消耗的积分数。"></x-field>
  <x-field data-name="status" data-type="string" data-required="true" data-desc="调用的最终状态。可以是 'success' 或 'failed'。"></x-field>
  <x-field data-name="duration" data-type="number" data-required="false" data-desc="API 调用的持续时间（秒）。"></x-field>
  <x-field data-name="errorReason" data-type="string" data-required="false" data-desc="如果调用失败，此字段包含失败的原因。"></x-field>
  <x-field data-name="appDid" data-type="string" data-required="false" data-desc="发起调用的应用程序的 DID。"></x-field>
  <x-field data-name="userDid" data-type="string" data-required="true" data-desc="发起调用的用户的 DID。"></x-field>
  <x-field data-name="requestId" data-type="string" data-required="false" data-desc="一个可选的客户端请求标识符，用于追踪。"></x--field>
  <x-field data-name="callTime" data-type="number" data-required="true" data-desc="进行调用的 Unix 时间戳。"></x-field>
  <x-field data-name="createdAt" data-type="string" data-required="true" data-desc="记录在数据库中创建的时间戳。"></x-field>
</x-field-group>

## 查询使用数据

您可以通过多个 REST API 端点检索分析数据。这些端点需要身份验证。

### 获取使用情况统计

要获取特定时间段内的使用情况摘要和聚合视图，请使用 `GET /api/user/usage-stats` 端点。对于系统范围的分析，管理员可以使用 `GET /api/user/admin/user-stats`。

**请求参数**

<x-field-group>
  <x-field data-name="startTime" data-type="string" data-required="true" data-desc="时间范围的起始时间，格式为 Unix 时间戳。"></x-field>
  <x-field data-name="endTime" data-type="string" data-required="true" data-desc="时间范围的结束时间，格式为 Unix 时间戳。"></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-required="false">
    <x-field-desc markdown>使用 `/api/user/model-calls` 时，设置为 `true` 可获取所有用户的数据。此功能仅限管理员用户使用。</x-field-desc>
  </x-field>
</x-field-group>

**请求示例**

```bash 请求用户统计数据 icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/usage-stats?startTime=1672531200&endTime=1675228799' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

**响应体**

该端点返回一个全面的对象，其中包含摘要、每日明细、模型统计和趋势比较。

<x-field-group>
  <x-field data-name="summary" data-type="object" data-desc="一个包含指定时期内聚合总数的对象。">
    <x-field data-name="totalCredits" data-type="number" data-desc="消耗的总积分。"></x-field>
    <x-field data-name="totalCalls" data-type="number" data-desc="API 调用总数。"></x-field>
    <x-field data-name="modelCount" data-type="number" data-desc="使用的独立模型总数。"></x-field>
    <x-field data-name="byType" data-type="object" data-desc="按调用类型（例如 'chatCompletion'）细分的使用情况统计对象。">
      <x-field data-name="[callType]" data-type="object">
        <x-field data-name="totalUsage" data-type="number" data-desc="此类型的总使用量（例如 token 数）。"></x-field>
        <x-field data-name="totalCredits" data-type="number" data-desc="此类型消耗的总积分。"></x-field>
        <x-field data-name="totalCalls" data-type="number" data-desc="此类型的总调用次数。"></x-field>
        <x-field data-name="successCalls" data-type="number" data-desc="此类型成功调用的次数。"></x-field>
      </x-field>
    </x-field>
  </x-field>
  <x-field data-name="dailyStats" data-type="array" data-desc="一个对象数组，每个对象代表一天的使用情况统计。">
    <x-field data-name="date" data-type="string" data-desc="日期，格式为 'YYYY-MM-DD'。"></x-field>
    <x-field data-name="credits" data-type="number" data-desc="当天消耗的总积分。"></x-field>
    <x-field data-name="tokens" data-type="number" data-desc="当天处理的总 token 数。"></x-field>
    <x-field data-name="requests" data-type="number" data-desc="当天发出的 API 调用总数。"></x-field>
  </x-field>
  <x-field data-name="modelStats" data-type="array" data-desc="一个列出最常用模型的数组。">
    <x-field data-name="providerId" data-type="string" data-desc="模型所属提供商的 ID。"></x-field>
    <x-field data-name="model" data-type="string" data-desc="模型名称。"></x-field>
    <x-field data-name="totalCalls" data-type="number" data-desc="对此模型进行的总调用次数。"></x-field>
  </x-field>
  <x-field data-name="trendComparison" data-type="object" data-desc="当前周期与上一周期使用情况的比较。">
    <x-field data-name="current" data-type="object" data-desc="当前周期的统计数据。"></x-field>
    <x-field data-name="previous" data-type="object" data-desc="上一个等长周期的统计数据。"></x-field>
    <x-field data-name="growth" data-type="object" data-desc="两个周期之间的增长率。"></x-field>
  </x-field>
</x-field-group>

### 列出模型调用

要获取按时间顺序排列的单个 API 请求的详细日志，请使用 `GET /api/user/model-calls` 端点。该端点提供对原始 `ModelCall` 记录的访问，并支持分页和筛选。

**请求参数**

<x-field-group>
  <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="分页的页码。"></x-field>
  <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="每页返回的项目数。最大值为 100。"></x-field>
  <x-field data-name="startTime" data-type="string" data-required="false" data-desc="时间范围的起始时间，格式为 Unix 时间戳。"></x-field>
  <x-field data-name="endTime" data-type="string" data-required="false" data-desc="时间范围的结束时间，格式为 Unix 时间戳。"></x-field>
  <x-field data-name="search" data-type="string" data-required="false" data-desc="用于按模型名称、应用程序 DID 或用户 DID 筛选结果的搜索词。"></x-field>
  <x-field data-name="status" data-type="string" data-required="false" data-desc="按调用状态筛选。可以是 'success'、'failed' 或 'all'。"></x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="按特定模型名称筛选。"></x-field>
  <x-field data-name="providerId" data-type="string" data-required="false" data-desc="按特定提供商 ID 筛选。"></x-field>
  <x-field data-name="appDid" data-type="string" data-required="false" data-desc="按特定应用程序 DID 筛选。"></x-field>
  <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="如果为 true，则返回所有用户的模型调用记录（仅限管理员）。"></x-field>
</x-field-group>

**请求示例**

```bash 列出模型调用记录 icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/model-calls?page=1&pageSize=10&status=failed' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

**响应体**

响应是一个分页的 `ModelCall` 对象列表。

```json response.json
{
  "count": 1,
  "list": [
    {
      "id": "z8VwXGf6k3qN...",
      "providerId": "openai",
      "model": "gpt-4o-mini",
      "credentialId": "z3tXy..._default",
      "type": "chatCompletion",
      "totalUsage": 150,
      "usageMetrics": {
        "inputTokens": 100,
        "outputTokens": 50
      },
      "credits": 0.0002,
      "status": "failed",
      "duration": 2,
      "errorReason": "API key is invalid.",
      "appDid": "z2qa9sD2tFAP...",
      "userDid": "z1...",
      "requestId": null,
      "callTime": 1675228799,
      "createdAt": "2023-01-31T23:59:59.000Z",
      "updatedAt": "2023-01-31T23:59:59.000Z",
      "traceId": null,
      "provider": {
        "id": "openai",
        "name": "openai",
        "displayName": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "region": null,
        "enabled": true
      },
      "appInfo": {
        "appName": "My AI App",
        "appDid": "z2qa9sD2tFAP...",
        "appLogo": "...",
        "appUrl": "..."
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "..."
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 10
  }
}
```

### 导出模型调用记录

您可以使用 `GET /api/user/model-calls/export` 端点将模型调用历史记录导出为 CSV 文件，以进行离线分析或报告。该端点接受与列表端点相同的筛选参数。

**请求示例**

```bash 导出模型调用记录 icon=lucide:terminal
curl -X GET 'https://your-aigne-hub-url/api/user/model-calls/export?startTime=1672531200&endTime=1675228799' \
--header 'Authorization: Bearer <YOUR_ACCESS_TOKEN>' \
-o model-calls-export.csv
```

服务器将响应一个包含所请求数据的 `text/csv` 文件。

## 总结

AIGNE Hub 中的分析功能为监控和理解 AI 模型使用情况提供了强大的工具。通过利用 `ModelCall` 数据模型和相关的 API 端点，您可以构建仪表盘、生成报告，并获得对运营成本和性能的关键洞察。

有关积分如何配置和计费的详细信息，请参阅[服务提供商模式](./deployment-scenarios-service-provider.md)文档。