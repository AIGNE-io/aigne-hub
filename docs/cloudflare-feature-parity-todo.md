# Cloudflare Workers 功能对齐待办清单

> 基于 Blocklet Server 原系统与 CF Workers 新系统的逐项对比，记录需要补齐的功能差异。
> 目标：让 CF 环境的使用体验与原系统保持一致。
>
> 创建时间：2026-04-09
> 分支：feat/cloudflare-migration

---

## 当前状态

核心链路已通：AI 调用 → Payment Kit credit check → meter event 记录 → 余额扣减。
以下是需要补齐的体验差异。

---

## P0：影响用户感知

### 1. 新用户自动赠送 Credits

**原系统行为：**
- 事件驱动：监听 `blocklet.user.added` / `blocklet.user.updated`
- 通过 Payment Kit SDK 调 `creditGrants.create()` 发放
- 金额由 `Config.newUserCreditGrantAmount` 控制
- 过期由 `Config.creditExpirationDays` 控制
- `user.extra.AICreditGranted` 标记防重复发放
- 发放后推送欢迎通知

**CF 版现状：**
- 无事件监听，无自动触发
- 本地 D1 `getOrCreateAccount()` 硬编码 1000 credits，与 Payment Kit 无关
- KV preferences 有 `newUserCreditGrantEnabled` / `newUserCreditGrantAmount` 配置项但未生效

**修复方案：**
- 在用户首次调 API 或首次登录时，检查 KV 标记（`credit-granted:{did}`）
- 若未发放，通过 PaymentClient 调 `creditGrants.create()` 发放
- 金额和过期从 KV preferences 读取
- 在 KV 中写入已发放标记

**涉及文件：**
- `cloudflare/src/routes/v2.ts` 或 `cloudflare/src/middleware/auth.ts`（触发点）
- `cloudflare/src/libs/payment.ts`（新增 grant 方法）

---

### 2. 用户头像缺失

**原系统行为：**
- `/api/user/info` 返回 blocklet-service 用户头像 URL

**CF 版现状：**
- avatar 字段始终返回空字符串 `''`

**修复方案：**
- `user.ts` 中从 blocklet-service 获取 profile 时取 avatar 字段回传

**涉及文件：**
- `cloudflare/src/routes/user.ts`（`/api/user/info` handler）

---

### 3. 通知系统完全缺失

**原系统行为：**
- 充值成功：推送通知（含金额、到期时间、操作链接）
- 欢迎 credits：双语通知（含 Playground 链接）
- 通知模板：`CreditGrantedNotificationTemplate`，支持中英文
- 通知动作按钮："Try Now"、"View Credits"、"View Invoice"

**CF 版现状：**
- 无任何通知机制
- 充值成功后用户无反馈，只能刷新页面看余额

**修复方案（最小可行）：**
- webhook 回调成功后在 KV 中写入未读通知记录
- 前端通过现有 SSE (`/api/events`) 或轮询获取通知
- 先支持充值成功通知，后续扩展欢迎 credits 通知

**涉及文件：**
- `cloudflare/src/routes/payment.ts`（webhook handler）
- `cloudflare/src/routes/events.ts`（SSE 推送）
- 可能新增 `cloudflare/src/libs/notifications.ts`

---

## P1：影响管理体验

### 4. Config Overview 页面在 CF 模式下隐藏

**原系统行为：**
- `/config/overview` 显示 3 个功能卡片：AI Provider 设置、Credits 管理、Usage 分析
- 提供 Payment Kit 管理入口和可观测性入口

**CF 版现状：**
- `app.tsx` 中 `isCfMode=true` 时无 `/config/overview` 路由
- 访问 `/config` 直接跳到 AI Config 页面
- admin 缺少概览仪表盘和 Payment Kit 管理入口

**修复方案：**
- 在 CF mode 路由中恢复 overview 页面
- 或将关键入口整合到 Header 导航中

**涉及文件：**
- `blocklets/core/src/app.tsx`（CF mode 路由定义）

---

### 5. `/api/user/info` 返回值不完整

**字段对比：**

| 字段 | 原系统 | CF 版 | 状态 |
|------|--------|-------|------|
| `user.avatar` | 用户头像 URL | `''` | 缺失（见 #2） |
| `creditBalance.grantCount` | Payment Kit 实际 grant 数 | 固定 `0` | 缺失 |
| `creditBalance.pendingCredit` | Payment Kit pending meter events | KV holds 计算 | 来源不同 |
| `paymentLink` | Payment Kit 动态短链接 | 静态 `/payment/customer` | 降级 |
| `profileLink` | Payment Kit credit 使用详情链接 | `null` | 缺失 |
| `currency` | 完整 currency 对象 | 仅 `{ decimal }` | 不完整 |

**影响：**
- `grantCount=0` 可能导致前端显示 "无充值记录"
- `profileLink=null` 导致 "查看详情" 按钮失效

**修复方案：**
- 从 PaymentClient 取真实数据填充这些字段
- 统一余额来源走 Payment Kit，去掉本地 D1 混用

**涉及文件：**
- `cloudflare/src/routes/user.ts`

---

### 6. Credit Grant 过期机制未实现

**原系统行为：**
- `creditExpirationDays` 配置 → 计算 Unix timestamp → 传给 Payment Kit `expires_at`
- Payment Kit 自动处理过期逻辑

**CF 版现状：**
- KV preferences 有 `creditExpirationDays` 配置项
- 代码中未读取也未传给 Payment Kit

**修复方案：**
- 在 PaymentClient 调 `creditGrants.create()` 时，从 preferences 读取 `creditExpirationDays`，计算并传入 `expires_at`

**涉及文件：**
- `cloudflare/src/libs/payment.ts`

---

## P2：次要差异

### 7. Payment Webhook 事件处理不完整

**原系统行为：**
- 处理多种事件：`customer.credit_grant.granted`、`checkout.session.completed` 等
- 每种事件触发对应通知

**CF 版现状：**
- webhook 仅处理 `payment.completed` 事件
- 仅调 `grantCredits()` 到本地 D1，无通知

**修复方案：**
- 识别更多事件类型
- 联动通知系统（待 #3 完成后）

**涉及文件：**
- `cloudflare/src/routes/payment.ts`

---

### 8. Credit Balance 计算精度

**原系统行为：**
- 使用 BigNumber 精确运算
- 余额来源统一为 Payment Kit 实时查询

**CF 版现状：**
- v2 路由的 credit check 和 meter event 已走 Payment Kit
- `/api/user/info` 的余额展示仍混用本地 D1
- 使用 JavaScript 浮点数运算

**修复方案：**
- 统一所有余额展示接口走 Payment Kit
- 可选：引入精确运算库处理 decimal 转换

**涉及文件：**
- `cloudflare/src/routes/user.ts`
- `cloudflare/src/routes/usage.ts`

---

## 执行优先级

| 序号 | 任务 | 工作量 | 依赖 |
|------|------|--------|------|
| 1 | 新用户自动 credit grant（#1） | 中 | 无 |
| 2 | 补齐 avatar / grantCount / profileLink（#2 + #5） | 小 | 无 |
| 3 | 统一余额走 Payment Kit（#8） | 小 | 无 |
| 4 | credit grant 传入过期时间（#6） | 小 | #1 |
| 5 | 基础通知系统（#3） | 中 | 无 |
| 6 | 恢复 Config Overview（#4） | 小 | 无 |
| 7 | webhook 事件扩展（#7） | 小 | #5 |

---

## 参考文档

- 设计规格：`docs/superpowers/specs/2026-04-07-payment-kit-cf-integration-design.md`
- 实现计划：`docs/superpowers/plans/2026-04-08-payment-kit-cf-integration.md`
- 集成指南：`docs/cloudflare-payment-kit-integration-guide.md`
