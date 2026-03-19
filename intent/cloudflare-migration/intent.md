# AIGNE Hub: Blocklet → Cloudflare Workers 完整迁移

::: locked {reason="核心定位"}
## 1. Overview

- **Product positioning**: AIGNE Hub 是一个 AI 模型调用代理平台，提供多 provider 管理、定价、用量统计、信用额度计费等功能
- **Core concept**: 将 AIGNE Hub 从 Blocklet Server 平台完全迁移到 Cloudflare Workers，采用与 [media-kit PR #487](https://github.com/blocklet/media-kit/pull/487) 相同的架构模式
- **Priority**: 高 — 近期交付（1-2 个月）
- **Target user**: SaaS 用户（统一运营，非自托管）
- **Project scope**: 完整功能对等迁移，包括数据迁移
:::

::: reviewed {by=zac date=2026-03-19}
## 2. Architecture

### 2.1 整体架构

```
                     Cloudflare Edge Network
                    ┌────────────────────────────────┐
                    │                                │
  用户浏览器 ──────►│  CF Pages (React SPA)          │
                    │  ├── Vite alias + shim 层      │
                    │  └── 复用 blocklets/core/src/   │
                    │                                │
                    │  CF Worker (Hono API)           │
                    │  ├── /api/v1/* (AI 调用代理)    │
                    │  ├── /api/v2/* (增强版 AI API)  │
                    │  ├── /api/ai-providers/*        │
                    │  ├── /api/usage/*               │
                    │  ├── /api/user/*                │
                    │  ├── /api/payment/* ──────────► │ Blocklet Server (回源)
                    │  └── SSE /api/events            │
                    │                                │
                    │  CF D1 (SQLite)                 │
                    │  CF KV (session/cache)          │
                    │  CF Queues (异步任务)            │
                    │  CF Cron Triggers (定时统计)     │
                    └────────────────────────────────┘
```

### 2.2 项目结构

```
aigne-hub/
├── blocklets/core/          # 保持不变
│   ├── src/                 # 前端源码 (被 cloudflare/frontend 复用)
│   └── api/                 # Blocklet 后端 (保留作为参考)
├── cloudflare/              # ★ 新增
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── shims/      # @blocklet/* 和 @arcblock/* shim 层
│   │   │   │   ├── blocklet-js-sdk.ts
│   │   │   │   ├── blocklet-ui-react-dashboard.tsx
│   │   │   │   ├── blocklet-ui-react-header.tsx
│   │   │   │   ├── blocklet-ui-react-footer.tsx
│   │   │   │   ├── did-connect-react-session.tsx
│   │   │   │   └── did-connect-react-button.tsx
│   │   │   └── main.tsx     # 入口
│   │   ├── vite.config.ts   # alias 配置指向 shim
│   │   └── package.json
│   ├── src/
│   │   ├── worker.ts        # Hono 主入口
│   │   ├── db/
│   │   │   └── schema.ts    # Drizzle schema (9 个表)
│   │   ├── middleware/
│   │   │   ├── auth.ts      # CF Auth SDK 集成
│   │   │   └── tracking.ts  # 调用计量中间件
│   │   ├── routes/
│   │   │   ├── v1.ts        # AI 调用 v1 API
│   │   │   ├── v2.ts        # AI 调用 v2 API
│   │   │   ├── ai-providers.ts  # Provider 管理
│   │   │   ├── usage.ts     # 用量查询
│   │   │   ├── user.ts      # 用户设置
│   │   │   ├── payment.ts   # 支付回源代理
│   │   │   └── events.ts    # SSE 事件推送
│   │   ├── crons/
│   │   │   ├── model-call-stats.ts
│   │   │   ├── model-rate-check.ts
│   │   │   └── archive.ts
│   │   ├── queue/
│   │   │   └── handlers.ts
│   │   └── libs/
│   │       ├── ai-proxy.ts  # AI 模型调用转发
│   │       ├── logger.ts
│   │       └── status.ts    # 模型状态检测
│   ├── migrations/
│   │   └── 0001_initial.sql
│   ├── scripts/
│   │   └── migrate-data.ts  # SQLite → D1 数据迁移
│   ├── wrangler.toml
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json
└── packages/
    ├── ai-kit/              # 保持不变
    └── cf-auth/             # ★ 新增: 通用 CF Auth SDK
        ├── src/
        │   ├── index.ts
        │   ├── providers/
        │   │   ├── google.ts
        │   │   ├── github.ts
        │   │   ├── email.ts
        │   │   └── passkey.ts
        │   ├── session.ts   # JWT + KV session 管理
        │   └── middleware.ts # Hono middleware
        └── package.json
```

### 2.3 技术栈映射

| 层 | Blocklet (现有) | Cloudflare (目标) |
|---|---|---|
| Web 框架 | Express.js | **Hono** |
| ORM | Sequelize | **Drizzle ORM** |
| 数据库 | SQLite (本地文件) | **Cloudflare D1** |
| 缓存 | 内存 / 文件 | **Cloudflare KV** |
| 作业队列 | @abtnode/queue (SQLite) | **Cloudflare Queues** |
| 定时任务 | 自定义 setInterval | **CF Cron Triggers** |
| 实时推送 | WebSocket (@arcblock/ws) | **SSE (Server-Sent Events)** |
| 用户认证 | DID Connect (@blocklet/sdk) | **CF Auth SDK (新建)** |
| 支付 | @blocklet/payment-js | **回源代理 → Blocklet Server** |
| 前端部署 | Blocklet 内置 | **Cloudflare Pages** |
| 静态资源 | Express static | **CF Pages / R2** |

:::

::: reviewed {by=zac date=2026-03-19}
## 3. Detailed Behavior

### 3.1 CF Auth SDK (packages/cf-auth)

通用的 Cloudflare Workers 认证库。

<!-- critique: 2026-03-19 — Auth SDK v1 简化为 Google+GitHub OAuth，Passkey/Email 推到 v2。考虑用 arctic + oslo 而非从零自建 -->

**v1 支持的认证方式**:
- Google OAuth 2.0
- GitHub OAuth

**v2 支持（post-launch）**:
- Email OTP (Magic Link)
- Passkey (WebAuthn)

**实现建议**: 考虑使用 [arctic](https://github.com/pilcrowonpaper/arctic)（轻量 OAuth 库，支持 50+ providers）+ [oslo](https://github.com/pilcrowonpaper/oslo)（session/crypto），而非从零自建全部 OAuth 流程。

**核心接口**:
```typescript
// packages/cf-auth/src/middleware.ts
import { Hono } from 'hono';

interface AuthConfig {
  providers: {
    google?: { clientId: string; clientSecret: string };
    github?: { clientId: string; clientSecret: string };
  };
  session: {
    kvBinding: KVNamespace;  // CF KV for session storage
    secret: string;          // JWT signing secret
    maxAge: number;          // Session TTL in seconds
  };
  d1Binding?: D1Database;    // Optional: persist users in D1
}

export function createAuthMiddleware(config: AuthConfig): Hono;
// Provides:
//   GET /auth/login/:provider
//   GET /auth/callback/:provider
//   POST /auth/logout
//   GET /auth/session  (returns current user)
```

**Session 管理**:
- JWT token 存储在 HttpOnly cookie
- Session 数据存储在 CF KV（key: `session:{jti}`, TTL = maxAge）
- JWT payload: `{ sub: userId, email, name, role, jti, iat, exp }`

**与 DID Connect 的关系**:
- 不兼容现有 DID Wallet 登录（需要 Blocklet Server）
- 用户体验等价：Google/GitHub/Email/Passkey 登录方式相同
- 用户数据需要迁移映射（DID → email/OAuth ID）

### 3.2 数据库 Schema (Drizzle)

从 Sequelize 模型 1:1 映射到 Drizzle schema，保持表结构一致：

**9 个核心表**:
1. `apps` — 多租户应用注册 + 公钥
2. `ai_providers` — AI Provider 配置（name, baseUrl, credentials）
3. `ai_credentials` — 用户级 API Key 存储
4. `ai_model_rates` — 模型定价（含 type: chatCompletion/embedding/imageGeneration/video）
5. `ai_model_rate_history` — 定价变更审计
6. `ai_model_status` — 模型可用性状态
7. `model_calls` — 单次调用记录（tokens, latency, TTFB, cost）
8. `model_call_stats` — 聚合统计（hourly + monthly）
9. `usage` — 用户信用额度/token 使用跟踪

**额外表**:
- `projects` — 项目组织
- `archive_execution_logs` — 归档执行日志

### 3.3 AI 调用代理

核心功能：接收用户请求 → 选择 provider → 转发到 AI 模型 API → streaming 返回

**关键行为**:
- v1/v2 API 支持 chat completion、embedding、image generation、video
- Streaming 响应：Worker 作为 proxy，不缓冲完整响应
- 调用计量：记录 tokens、latency、TTFB、cost 到 D1
- Provider 轮询/fallback：按优先级尝试多个 provider
- 30s CPU 限制：streaming 转发不消耗 CPU，大部分调用应在限制内

<!-- critique: 2026-03-19 — v1 不引入 CF Queues，直接转发所有 AI 调用。I/O 等待不计 CPU 时间，大部分调用安全。如遇超时再按需加 Queue -->

**Workers 限制评估**:
- Chat streaming：✅ 安全（I/O 等待不计 CPU 时间）
- Embedding：✅ 安全（通常 <5s）
- Image generation：✅ 大概率安全（API 返回 URL，Worker 只是转发等待）
- Video generation：⚠️ 可能超时（v1 先直接转发，如遇问题再加 Queue）

### 3.4 WebSocket → SSE 替换

现有 WebSocket 仅用于 `model.status.updated` 事件广播。

**替换方案**:
```typescript
// cloudflare/src/routes/events.ts
app.get('/api/events', async (c) => {
  return streamSSE(c, async (stream) => {
    // 从 KV 或 D1 读取最新状态
    // 定期推送 model.status.updated 事件
    // Workers 支持最长 30s 的 SSE 连接
    // 前端需要自动重连 (EventSource 内置支持)
  });
});
```

**前端 shim**:
```typescript
// 将 useSubscription('model.status.updated', cb) 替换为 EventSource
```

### 3.5 定时任务 (Cron Triggers)

```toml
# wrangler.toml
[triggers]
crons = [
  "0 * * * *",    # 每小时: model-call-stats 聚合
  "*/30 * * * *", # 每30分钟: model-rate-check 价格检查
  "0 2 * * *",    # 每天凌晨2点: archive 归档
]
```

### 3.6 支付回源

支付相关请求代理回 Blocklet Server：

```typescript
// cloudflare/src/routes/payment.ts
app.all('/api/payment/*', async (c) => {
  const url = new URL(c.req.url);
  url.hostname = BLOCKLET_SERVER_ORIGIN;
  return fetch(new Request(url, c.req.raw));
});
```

### 3.7 数据迁移

```
SQLite (BLOCKLET_DATA_DIR/aikit.db)
    ↓ scripts/migrate-data.ts
D1 (aigne-hub database)
```

**迁移步骤**:
1. 导出 SQLite 数据为 JSON
2. 转换 schema 差异（如 DID → OAuth user mapping）
3. 批量插入 D1（使用 D1 batch API，每批 100 条）
4. 验证数据完整性

:::

::: reviewed {by=zac date=2026-03-19}
## 4. Shim Layer

### 4.1 需要 shim 的包

| 原始包 | Shim 策略 |
|--------|----------|
| `@blocklet/js-sdk` | `createAxios` → `axios.create()` |
| `@blocklet/ui-react/lib/Dashboard` | 简化的 flexbox layout |
| `@blocklet/ui-react/lib/Header` | MUI AppBar |
| `@blocklet/ui-react/lib/Footer` | MUI Box |
| `@arcblock/did-connect-react/lib/Session` | CF Auth SDK session context |
| `@arcblock/did-connect-react/lib/Button` | 标准 OAuth 登录按钮 |

### 4.2 不需要 shim 的包

- `@arcblock/ux` — 纯 UI 组件，无 Blocklet 依赖
- `@arcblock/did` — 纯工具库
- `@mui/*` — 直接使用

### 4.3 Shim 发现流程

<!-- critique: 2026-03-19 — shim 列表可能不完整，需要编译扫描步骤 -->

**Phase 1 必须包含"前端编译扫描"步骤**：
1. 配置 Vite alias 指向已知 shim
2. 尝试编译 `blocklets/core/src/`
3. 收集所有失败的 `@blocklet/*`、`@arcblock/*` import
4. 逐个决定：shim / 直接使用 / 删除功能
5. 更新 shim 清单

### 4.4 Vite Alias 配置

```typescript
// cloudflare/frontend/vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@blocklet/js-sdk': './src/shims/blocklet-js-sdk.ts',
      '@blocklet/ui-react/lib/Dashboard': './src/shims/blocklet-ui-react-dashboard.tsx',
      '@blocklet/ui-react/lib/Header': './src/shims/blocklet-ui-react-header.tsx',
      '@blocklet/ui-react/lib/Footer': './src/shims/blocklet-ui-react-footer.tsx',
      '@arcblock/did-connect-react/lib/Session': './src/shims/did-connect-react-session.tsx',
      '@arcblock/did-connect-react/lib/Button': './src/shims/did-connect-react-button.tsx',
      // 指向原始前端源码
      '@app': '../../blocklets/core/src',
    },
  },
});
```

:::

::: locked {reason="核心决策"}
## 5. Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 迁移模式 | 完全迁移，非混合 | SaaS 运营需要统一架构，减少运维复杂度 |
| 项目结构 | 独立 cloudflare/ 目录 | 复用 media-kit 成熟模式，原代码不动 |
| Web 框架 | Hono | CF Workers 原生支持，与 media-kit 一致 |
| 数据库 | Drizzle + D1 | SQLite 方言兼容，零外部依赖，与 media-kit 一致 |
| 认证 | 通用 CF Auth SDK (新建) | 多项目复用，替代 DID Connect |
| 支付 | 回源代理 | 降低初始迁移复杂度，支付逻辑暂不改 |
| 实时推送 | SSE 替代 WebSocket | 仅 1 个事件场景，SSE 足够且无需 Durable Objects |
| 前端 | React SPA，CF Pages 部署 | 最小改动，Vite alias + shim 复用源码 |
| 数据 | 需要迁移到 D1 | 保留现有用户和配置数据 |
| 兼容期 | 无，直接切换 | SaaS 统一运营，无需并行 |

:::

::: locked {reason="范围边界"}
## 6. MVP Scope

### Included (v1)
- ✅ 全部 AI 调用代理 API (v1 + v2)
- ✅ Provider 管理 + 凭证管理
- ✅ 模型定价管理
- ✅ 用量统计 + 信用额度
- ✅ 用户认证 (Google/GitHub/Email/Passkey)
- ✅ 管理后台完整功能
- ✅ 定时任务 (统计聚合、价格检查、归档)
- ✅ 模型状态监测 + SSE 推送
- ✅ 生产数据迁移
- ✅ 支付 (回源代理)

### Excluded (post-v1)
- ❌ 支付系统完全迁移到 CF（v1 保留回源）
- ❌ DID Wallet 登录（已用 OAuth/Passkey 替代）
- ❌ Blocklet Marketplace 分发
- ❌ 自托管部署支持
- ❌ Component Call 跨 blocklet 通信

:::

::: reviewed {by=zac date=2026-03-19}
## 7. Risks

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CF Auth SDK 开发周期不可控 | 高 — 阻塞全部功能 | 先用 x-user-did 占位符，Auth SDK 并行开发 |
| D1 性能/容量限制 | 中 — 大量 model_calls 数据 | 使用归档策略 + 聚合统计减少数据量 |
| 30s CPU 限制影响图片/视频生成 | 中 | 用 CF Queues 异步处理长时任务 |
| Sequelize → Drizzle 迁移工作量 | 中 — 9 个模型 + 复杂查询 | 逐表迁移，保持 SQL 逻辑一致 |
| 前端 shim 层不完整 | 低 — 可能遗漏某些 @blocklet/* 导入 | 编译时即可发现，逐个补 shim |
| 支付回源依赖 Blocklet Server | 低 — v1 可接受 | v2 完全迁移支付到 Stripe 直连 |

:::

::: reviewed {by=zac date=2026-03-19}
## 8. Open Items

- [ ] CF Auth SDK 的详细 API 设计（需要独立的 Intent）
- [ ] D1 数据量限制是否满足 model_calls 表的增长需求（D1 免费版 5GB，付费版 50GB）
- [ ] 支付回源的跨域/认证机制细节
- [ ] 现有用户 DID → OAuth 账号的映射策略
- [ ] meilisearch 集成是否保留（`/api/meilisearch/*` 路由）
- [ ] @aigne/observability-api 在 CF Workers 中的替代方案

:::

::: reviewed {by=zac date=2026-03-19}
## 9. Reference

- **参考实现 (推荐模式)**: [media-kit PR #487](https://github.com/blocklet/media-kit/pull/487) — 独立 cloudflare/ 目录 + Hono + Drizzle/D1 重写，shim 层复用前端
- **参考实现 (shim 模式)**: [payment-kit PR #1339](https://github.com/blocklet/payment-kit/pull/1339) — 783 行 Sequelize shim + esbuild alias，适合原型验证但不适合生产
- **参考分析**: [Component Call vs Service Binding 对比](https://bhqa5qcjco4n2bfvuiaw7l7dcre732u4l2fqdhisjmu.staging.myvibe.so/?v=1773885660059_2)
- **nodejs_compat**: CF Workers 原生支持 node:crypto (Ed25519)、node:http、node:buffer、node:stream 等

### 从 payment-kit PR 得到的关键教训

1. **CF Auth SDK 是跨项目阻塞点** — media-kit 和 payment-kit 都在等，应作为第一优先级独立开发
2. **Shim 方案是死路** — payment-kit 的迁移文档明确声明 shim 仅适合原型，生产应走 adapter pattern 或 clean rewrite
3. **Stripe 在 Workers 上已验证可用** — 需要 raw body 访问做 webhook 签名验证，v2 可直连 Stripe
4. **D1 不是真事务** — batch API 不保证原子性，支付状态不应存 KV，涉及金额的操作需要 read-after-write consistency
5. **支付系统迁移极复杂** — payment-kit 估计需 6-12 月完整迁移，AIGNE Hub v1 回源代理是正确选择
:::
