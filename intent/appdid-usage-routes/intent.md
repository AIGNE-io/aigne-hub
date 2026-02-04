# appDid 获取与 Usage 项目路由调整规格说明

## 1. 概述

### 产品定位
修正 Model Call 统计中的 appDid 归属逻辑，并消除 Usage 项目路由中 appDid 出现在 path 带来的中文路径问题。

### 核心概念
- appDid 解析顺序调整：Header 优先，其次 access key 名称，最后 fallback 到 BLOCKLET DID。
- Usage 项目相关路由改为固定路径，appDid 通过 query 传递。

### 优先级
高优先级。影响调用统计维度与前端项目分析页面的稳定性。

### 目标用户
- API 调用方（前端/服务端）
- 使用 Usage 项目分析功能的用户
- 运维与数据分析人员

### 项目范围
包含：
- `createModelCallMiddleware` 中 appDid 解析逻辑调整
- Usage 项目相关路由路径变更与查询参数调整
- 前端调用处同步更新

不包含：
- 旧路径兼容或重定向
- appDid 规范化校验（长度/字符白名单等）
- UI 层新增功能

## 2. 架构设计

### 数据来源
- Header：`x-aigne-hub-client-did`
- 认证上下文：`req.user.method`、`req.user.fullName`
- 默认值：`BLOCKLET DID`（当前实现为 `BLOCKLET_APP_PID`）
- Query 参数：`appDid`

### 关键模块
- `blocklets/core/api/src/middlewares/model-call-tracker.ts`
- `blocklets/core/api/src/routes/usage.ts`
- `blocklets/core/src/pages/customer/hooks.ts`（Usage 前端调用）

### 数据流（简化）
```
request
  ├─ header: x-aigne-hub-client-did
  ├─ session: req.user
  └─ query: appDid
        │
        ├─ ModelCall 统计：appDid 解析并写入
        └─ Usage API：appDid 作为筛选维度
```

## 3. 详细行为

### 3.1 appDid 解析顺序
1) 读取 header `x-aigne-hub-client-did`
   - 若存在有效值，直接作为 appDid
2) 若 header 不存在或为空：
   - 当 `req.user?.method === 'accessKey'` 时，使用 `${userDid}-${req.user.fullName}` 作为 appDid
3) 若仍无有效值：
   - fallback 到 `BLOCKLET DID`

> 说明：access key 情况下 `req.user.fullName` 可能为中文，按原值使用。

### 3.2 Usage 项目路由调整
将 appDid 从 path 移除，统一改为 query 参数：
- `appDid` 作为 query 传递（前端需 encode）
- 服务端依赖 Express 默认 query 解码，不额外处理

## 4. 接口变更

### 路由调整（仅路径与参数变化，业务逻辑不变）
| 旧路径 | 新路径 | 说明 |
| --- | --- | --- |
| `GET /api/usage/projects/trends` | `GET /api/usage/projects/group-trends` | 项目分组趋势（不传 appDid） |
| `GET /api/usage/projects/:appDid/trends` | `GET /api/usage/projects/trends?appDid=...` | 单项目趋势 |
| `GET /api/usage/projects/:appDid/calls` | `GET /api/usage/projects/calls?appDid=...` | 单项目调用列表 |

### 参数约定
- Query: `appDid`（字符串，可为中文）
- 若未提供 `appDid`，服务端会 fallback 到 `BLOCKLET DID`

## 5. 兼容性与迁移
- 不提供旧路径兼容或重定向
- 前端调用与可能的内部调用必须同步更新

## 6. 风险与约束
- 旧客户端调用旧路由将失败（404 或未命中路由）
- access key 的 `fullName` 可能非唯一或变更，可能影响统计维度
- query 需正确 URL 编码，避免中文或特殊字符问题

## 7. 测试要点
- header 提供 appDid：优先使用 header
- header 缺失 + access key：使用 `req.user.fullName`
- header 缺失 + 非 access key：fallback 到 `BLOCKLET DID`
- `fullName` 为空时正确 fallback
- 新路由可接收中文 appDid（query 编码/解码正确）
- 旧路由不再可访问

## 8. 未决项
暂无

## 9. Finalized Implementation Details

> Synced on: 2026-02-04  
> From: commit a501ad405a8c3a873645bc906c20cf418773cc00

### appDid 解析顺序（最终实现）
1) Header `x-aigne-hub-client-did` 优先
2) Header 无效时，若 `req.user?.method === 'accessKey'`，appDid = `${userDid}-${req.user.fullName}`
3) 仍无有效值时，fallback 到 `BLOCKLET DID`

### Usage 路由（最终实现）
| 接口 | 说明 |
| --- | --- |
| `GET /api/usage/projects/group-trends` | 项目分组趋势 |
| `GET /api/usage/projects/trends?appDid=...` | 单项目趋势 |
| `GET /api/usage/projects/calls?appDid=...` | 单项目调用列表 |

### 参数处理（最终实现）
- `appDid` 通过 query 传递（需 URL 编码）
- 未提供 `appDid` 时，服务端 fallback 到 `BLOCKLET DID`
