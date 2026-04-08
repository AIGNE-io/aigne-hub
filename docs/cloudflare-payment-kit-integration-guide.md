# Cloudflare Workers: Payment Kit 集成实战指南

> 基于 AIGNE Hub × Payment Kit × blocklet-service 三模块联动的实际落地经验。

---

## 一、架构方案

### Q: Cloudflare Workers 之间如何通信？

**A:** 使用 **Service Binding**。同一账户下的 Workers 通过 Service Binding 实现零延迟内部通信，无需走公网。

```toml
# wrangler.toml
[[services]]
binding = "PAYMENT_KIT"
service = "payment-kit-staging"
```

调用方式：
```typescript
const resp = await env.PAYMENT_KIT.fetch(new Request('https://internal/api/meters'));
```

> **注意：** hostname 被忽略，只有 path 有效。Service Binding 要求两个 Worker 在**同一个 Cloudflare 账户**下。

### Q: Payment Kit 的 API 认证如何处理？

**A:** **透传用户 Cookie。** 三个 Worker 共享同一个 AUTH_SERVICE（blocklet-service），用户登录一次，JWT cookie 在所有服务间通用。

```typescript
// 创建 PaymentClient 时透传请求的 Cookie 和 Authorization
const headers = new Headers();
headers.set('Cookie', request.header('Cookie'));
headers.set('Authorization', request.header('Authorization'));
const client = new PaymentClient(env.PAYMENT_KIT, headers);
```

不需要额外的 API Key 或服务间签名。

### Q: 前端页面如何集成 Payment Kit UI？

**A:** **Mount Point 代理模式。** AIGNE Hub 作为 Gateway，将 `/payment/*` 代理到 Payment Kit Worker：

```
/payment/admin     → strip prefix → /admin     → Payment Kit 管理后台
/payment/customer  → strip prefix → /customer  → Payment Kit 用户账单
/payment/checkout  → strip prefix → /checkout  → Payment Kit 结账页
```

Gateway 需要做 **HTML 重写**：资源路径（`/assets/` → `/payment/assets/`）和前端 prefix（`window.blocklet.prefix`）。

---

## 二、关键经验

### Q: Payment Kit API 的 livemode 怎么传？

**A:** 通过 **URL query string**，不是 request body。

Payment Kit 的 Express 路由中间件从 `req.query.livemode` 读取：
```typescript
// 正确 ✅
fetch('/api/meters?livemode=false')

// 错误 ❌ — body 里的 livemode 不会被读到
fetch('/api/meters', { body: JSON.stringify({ livemode: false }) })
```

**最佳实践：** 在 HTTP client 的基础 `request()` 方法里统一追加 `?livemode=xxx`：
```typescript
private async request(path: string, init?: RequestInit) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://internal${path}${separator}livemode=${this.livemode}`;
  return this.service.fetch(new Request(url, init));
}
```

### Q: Credit 金额为什么显示异常大？

**A:** Payment Kit 用 **integer + decimal** 模式存储金额。例如：

| Currency | decimal | 存储值 | 实际值 |
|----------|---------|--------|--------|
| AIGNE Hub Credits | 10 | 10,000,000,000 | 1.00 |
| TBA | 18 | 1,000,000,000,000,000,000 | 1.00 |

后端返回余额时必须做换算：
```typescript
const divisor = Math.pow(10, currency.decimal);
const displayBalance = rawBalance / divisor;
```

**坑：** Blocklet Server 版本的 `@blocklet/payment-js` SDK 内部自动做了换算，但 CF 版本直接调 HTTP API 拿到的是原始值。

### Q: Meter 和 Currency 如何关联？

**A:** 每个 Meter 关联一个 `currency_id`。Credit grant 充值到这个 currency，meter event 从这个 currency 扣费。

**致命错误：** 如果 payment link 的 `credit_config.currency_id` 和 meter 的 `currency_id` 不一致，充值和余额查询用的是不同的 currency，会导致**充值成功但余额永远为 0**。

```
Meter (agent-hub-ai-meter-v2) → currency_id: pc_IecaG7Ubzlmk (USD)
Price credit_config            → currency_id: pc_IecaG7Ubzlmk (USD)  ← 必须一致！
Credit Grant                   → currency_id: pc_IecaG7Ubzlmk (USD)  ← 充到这里
getCreditSummary               → query by currency_id: pc_IecaG7Ubzlmk ← 查的这里
```

### Q: 用户权限在哪里管理？

**A:** 在 **blocklet-service** 的 `memberships` 表。每个 Worker 有自己的 `APP_PID`（instance DID），用户通过 membership 关联到特定实例。

```sql
-- 给用户添加 Payment Kit 的 owner 权限
INSERT INTO memberships (user_did, instance_did, role, joined_at)
VALUES ('z3hzurNEMV...', 'zNKhmePD23...', 'owner', datetime('now'));
```

**注意：** 更新 membership 后用户需要**重新登录**才能拿到新角色的 JWT。

---

## 三、常见坑点

### Q: Workers.dev 域名不对？

**A:** 同一个 Cloudflare 账户可能有多个 workers.dev 子域名（如 `zhuzhuyule.workers.dev` 和 `zhuzhuyule-779.workers.dev`）。Service Binding 不关心域名，只要在同一账户下就能连通。但要确认你的 Worker 实际部署在哪个子域名上。

### Q: Error 1042 是什么？

**A:** Worker 启动超时或 Service Binding 目标不可用。常见原因：
1. **Free plan CPU 限制**（10ms）— 大 Worker 需要 Paid plan
2. **Service Binding 目标 Worker 挂了** — 级联故障
3. **Service Binding 目标不存在** — service name 拼错

### Q: Payment Kit 前端发 `/api/did/payment/auth` 为什么 404？

**A:** Payment Kit 前端在 `/payment/` mount point 下加载，但 DID Connect SDK 发 API 请求时用**绝对路径**（没带 `/payment/` prefix）。需要在 Gateway 里额外代理：

```typescript
// Payment Kit 的 DID Connect 支付路由
app.all('/api/did/payment/*', async (c) => {
  return c.env.PAYMENT_KIT.fetch(c.req.raw);
});
```

### Q: Payment link 为什么用了错误的支付方式？

**A:** Payment Kit 有两套支付方式：`livemode=1`（ABT 主网）和 `livemode=0`（TBA 测试网）。如果 payment link 的 livemode 不对，checkout 页面会显示错误的支付方式。

检查点：
1. `PAYMENT_LIVEMODE` env var — 控制 API 默认 livemode
2. payment link 的 `livemode` 字段 — 创建时确定
3. price 的 `livemode` 字段 — 创建时确定
4. `__blocklet__.js` 的 `livemode` 字段 — 前端用来决定显示哪套支付方式

### Q: `getCreditPaymentLink()` 自动创建了错误的 payment link？

**A:** 如果 KV preferences 里配置了 `creditPaymentLink`，应该优先使用配置值。自动创建逻辑只作为 fallback。

```typescript
// 优先使用配置
const prefs = await getPreferences(kv);
if (prefs.creditPaymentLink) return prefs.creditPaymentLink;
// 否则自动创建（可能创建出 livemode 不对的 link）
return getCreditPaymentLink(payment);
```

---

## 四、配置清单

### AIGNE Hub Worker

| 配置项 | 类型 | 值 | 说明 |
|--------|------|-----|------|
| `PAYMENT_KIT` | Service Binding | `payment-kit-staging` | Payment Kit Worker |
| `BLOCKLET_SERVICE` | Service Binding | `blocklet-service-staging` | DID Auth |
| `PAYMENT_LIVEMODE` | Env Var | `"false"` | testmode |
| `app:preferences` | KV (AUTH_KV) | JSON | 运行时配置 |

### Payment Kit Worker

| 配置项 | 类型 | 值 | 说明 |
|--------|------|-----|------|
| `AUTH_SERVICE` | Service Binding | `blocklet-service-staging` | DID Auth |
| `APP_SK` | Secret | hex string | DID 签名私钥 |
| `APP_PID` | Env Var | instance DID | 在 blocklet-service 注册的实例 |
| `PAYMENT_LIVEMODE` | Env Var | `"false"` | testmode |

### KV Preferences (运行时可改，不需要重新部署)

```json
{
  "creditBasedBillingEnabled": true,
  "creditPaymentLink": "/payment/checkout/pay/plink_xxx",
  "guestPlaygroundEnabled": true,
  "newUserCreditGrantEnabled": false,
  "newUserCreditGrantAmount": 0,
  "creditPrefix": "",
  "basePricePerUnit": 1
}
```

设置方式：
```bash
# 方式 1：wrangler CLI
npx wrangler kv key put "app:preferences" '{"creditPaymentLink":"/payment/checkout/pay/plink_xxx"}' \
  --namespace-id <AUTH_KV_ID> --remote

# 方式 2：Admin API（需登录）
curl -X PUT /api/user/admin/preferences -d '{"creditPaymentLink":"/payment/..."}'
```

---

## 五、数据迁移

### Q: 如何从 Blocklet Server 迁移 Payment Kit 数据到 D1？

```bash
# 1. 导出 SQLite
sqlite3 /path/to/payment-kit.db .dump > dump.sql

# 2. 清理（去掉 PRAGMA、BEGIN/COMMIT 等）
cat dump.sql | grep -v "^PRAGMA" | grep -v "^BEGIN" | grep -v "^COMMIT" > d1.sql

# 3. 导入 D1
npx wrangler d1 execute <db-name> --remote --file=d1.sql

# 4. 补充 CF-only 表
npx wrangler d1 execute <db-name> --remote --command="
  CREATE TABLE IF NOT EXISTS _locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS _did_connect_tokens (token TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
"
```

### Q: 需要迁移哪些数据？

| 数据 | 是否必需 | 说明 |
|------|---------|------|
| customers | 是 | 但 `create=true` 会自动创建 |
| payment_currencies | 是 | 支付货币定义 |
| payment_methods | 是 | 支付方式配置 |
| products / prices | 是 | 充值商品和价格 |
| credit_grants | 是 | 用户已有的余额 |
| meter_events | 可选 | 历史用量记录 |
| subscriptions / invoices | 看需求 | 订阅数据 |

---

## 六、调试技巧

### 查看 D1 数据
```bash
npx wrangler d1 execute <db-name> --remote --command="SELECT ..."
```

### 查看 KV 数据
```bash
npx wrangler kv key get "app:preferences" --namespace-id <id> --remote
```

### 验证 API
```bash
# 余额
curl /api/user/credit/balance -b 'login_token=...'

# 用户信息（含余额、支付链接）
curl /api/user/info -b 'login_token=...'

# __blocklet__.js（含 preferences、mount points）
curl /__blocklet__.js?type=json

# Payment Kit 健康检查
curl /payment/health
```

### 解码 JWT
```bash
echo '<jwt-payload-base64>' | base64 -d | python3 -m json.tool
```
