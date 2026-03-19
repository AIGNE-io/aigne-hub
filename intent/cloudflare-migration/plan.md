# Execution Plan: AIGNE Hub Cloudflare Migration

## Overview

将 AIGNE Hub 从 Blocklet Server 完全迁移到 Cloudflare Workers。采用独立 `cloudflare/` 目录 + shim 层模式（参考 media-kit PR #487），后端 Hono + Drizzle/D1，前端 CF Pages。

## Prerequisites

- Cloudflare 账号 + Workers Paid Plan（D1、KV、Cron Triggers）
- Google OAuth App（clientId + clientSecret）
- GitHub OAuth App（clientId + clientSecret）
- 现有 Blocklet Server 可访问（支付回源 + 数据导出）
- wrangler CLI 已安装

---

## Phase 0: 项目脚手架 + D1 Schema

### Description

搭建 `cloudflare/` 目录结构，初始化 Hono + Drizzle + D1，定义全部 11 个表的 Drizzle schema，创建 D1 migration SQL，验证 `wrangler dev` 可启动。

**交付物**:
- `cloudflare/` 目录结构（worker.ts、wrangler.toml、package.json）
- Drizzle schema（11 个表）
- D1 migration SQL
- 健康检查端点 `GET /api/health`

### Tests

#### Happy Path
- [ ] `wrangler dev` 启动成功，Worker 响应 200
- [ ] `GET /api/health` 返回 `{ status: "ok", db: "connected" }`
- [ ] D1 migration 执行成功，所有 11 个表创建
- [ ] Drizzle schema 类型与现有 Sequelize 模型字段一致
- [ ] `pnpm build` 成功编译 Worker

#### Bad Path
- [ ] D1 未绑定时 `/api/health` 返回 `{ status: "error", db: "not connected" }`
- [ ] 重复执行 migration 不报错（幂等）
- [ ] schema 中缺少必填字段时 insert 报错

#### Edge Cases
- [ ] 空数据库查询返回空数组而非错误
- [ ] 表名/列名不与 SQLite 保留字冲突
- [ ] TEXT 类型正确存储 JSON 字符串（ai_providers.config）

#### Security
- [ ] wrangler.toml 中无明文 secret（使用 `wrangler secret`）
- [ ] D1 数据库 ID 不暴露在前端代码中

#### Data Leak
- [ ] `/api/health` 不暴露数据库版本或内部路径
- [ ] 错误响应不包含 SQL 语句

#### Data Damage
- [ ] migration 失败时数据库状态可回滚
- [ ] schema 中定义了必要的 NOT NULL 和 DEFAULT 约束

### E2E Gate

```bash
cd cloudflare && pnpm install && pnpm build
wrangler d1 execute aigne-hub-dev --local --file=migrations/0001_initial.sql
wrangler dev --local &
sleep 3
curl -s http://localhost:8787/api/health | jq '.status' | grep -q '"ok"'
kill %1
echo "Phase 0: PASSED"
```

### Acceptance Criteria

- [ ] 所有 6 类测试通过
- [ ] `wrangler dev --local` 启动并响应
- [ ] 11 个表在 D1 中创建成功
- [ ] 代码已提交

---

## Phase 1: 前端 Shim 层 + 编译扫描

### Description

配置 Vite alias，创建已知的 6 个 shim，执行前端编译扫描发现完整 shim 需求，补全所有缺失 shim，确保前端编译通过。

**交付物**:
- `cloudflare/frontend/` 目录 + Vite 配置
- 全部 shim 文件（已知 6 个 + 扫描发现的）
- 前端 `pnpm build` 成功

### Tests

#### Happy Path
- [ ] `pnpm build` 编译成功，零错误
- [ ] shim 后的 Dashboard 组件渲染不报错
- [ ] shim 后的 Session context 提供 mock user
- [ ] `@app` alias 正确指向 `blocklets/core/src/`
- [ ] `@arcblock/ux` 组件直接使用不报错

#### Bad Path
- [ ] 缺少某个 shim 时编译报明确错误（指出具体 import 路径）
- [ ] shim 导出的类型与原始包类型不匹配时 TypeScript 报错
- [ ] 空 shim（仅 `export default {}`) 在运行时报明确错误

#### Edge Cases
- [ ] 动态 import（`import()`）的 @blocklet 包被正确 alias
- [ ] re-export 链（A re-exports from B which imports @blocklet/*）被正确解析
- [ ] CSS/样式 import 从 @blocklet 包中被正确处理

#### Security
- [ ] shim 中的 session mock 不包含真实 token 或密钥
- [ ] shim 中的 API client 不硬编码真实 API URL

#### Data Leak
- [ ] shim 中的 mock user 不包含真实用户数据
- [ ] 编译产物中不包含原始 @blocklet 包的源码

#### Data Damage
- [ ] shim 替换不影响原始 blocklets/core/src/ 源文件
- [ ] Vite alias 不干扰 blocklets/core 自身的构建

### E2E Gate

```bash
cd cloudflare/frontend && pnpm install && pnpm build
# 验证编译产物存在
ls dist/index.html dist/assets/*.js
# 验证无 @blocklet 包残留在 bundle 中
! grep -r '@blocklet/sdk' dist/ && echo "No @blocklet/sdk leaked"
echo "Phase 1: PASSED"
```

### Acceptance Criteria

- [ ] 前端编译零错误
- [ ] 完整的 shim 清单已记录
- [ ] bundle 中无 @blocklet/* 包残留
- [ ] 代码已提交

---

## Phase 2: CF Auth SDK (Google + GitHub OAuth)

### Description

在 `packages/cf-auth/` 构建通用 CF Workers 认证库，v1 支持 Google + GitHub OAuth。使用 arctic 库处理 OAuth 流程，JWT + KV 做 session 管理。

**交付物**:
- `packages/cf-auth/` 包（可独立发布）
- Google + GitHub OAuth 登录流程
- JWT session 中间件
- Hono middleware 导出

### Tests

#### Happy Path
- [ ] Google OAuth: 重定向到正确的 Google auth URL（含 scope、redirect_uri）
- [ ] Google OAuth: callback 正确解析 code 换取 token
- [ ] Google OAuth: 从 token 提取 user profile（email、name、picture）
- [ ] GitHub OAuth: 重定向到正确的 GitHub auth URL
- [ ] GitHub OAuth: callback 正确解析 code 换取 token
- [ ] GitHub OAuth: 从 token 提取 user profile（email、login、avatar_url）
- [ ] Session: 登录后设置 HttpOnly cookie（JWT token）
- [ ] Session: `GET /auth/session` 返回当前用户信息
- [ ] Session: `POST /auth/logout` 清除 cookie + 删除 KV session
- [ ] Middleware: 已认证请求 `c.get('user')` 返回 user 对象
- [ ] Middleware: 未认证请求返回 401

#### Bad Path
- [ ] 无效 OAuth code 时 callback 返回 401
- [ ] 过期的 OAuth state 参数返回 400
- [ ] 篡改的 JWT token 返回 401
- [ ] 过期的 JWT token 返回 401
- [ ] KV 中不存在的 session（已登出）返回 401
- [ ] 未配置 provider 时访问其 login URL 返回 404
- [ ] OAuth provider 返回错误时（如用户拒绝授权）返回合适错误
- [ ] Google/GitHub API 超时时返回 502
- [ ] 缺少 clientId/clientSecret 配置时启动报错

#### Edge Cases
- [ ] 同一用户通过不同 provider 登录（Google vs GitHub）但 email 相同时关联为同一用户
- [ ] 用户没有公开 email（GitHub 私密 email）时正确处理
- [ ] 并发登录请求不产生重复 session
- [ ] JWT maxAge 边界值（恰好过期 vs 刚好未过期）

#### Security
- [ ] OAuth state 参数使用 CSRF-safe random（crypto.randomUUID）
- [ ] JWT secret 从环境变量读取，不硬编码
- [ ] Cookie 设置 Secure + SameSite=Lax + HttpOnly
- [ ] OAuth redirect_uri 严格匹配配置值（防 open redirect）
- [ ] JWT payload 不包含敏感信息（不含密码、token 等）

#### Data Leak
- [ ] OAuth access_token 不存储在 KV 或 cookie 中
- [ ] 错误响应不包含 OAuth secret 或 internal URL
- [ ] `GET /auth/session` 不返回 JWT secret 或 KV key
- [ ] 日志中不输出 token 或 credential

#### Data Damage
- [ ] KV session 写入失败时登录不完成（不设置半成品 cookie）
- [ ] logout 时 KV 删除失败仍清除 cookie（宁可让 session 自然过期）
- [ ] D1 user upsert 在并发时不产生重复记录

### E2E Gate

```bash
cd packages/cf-auth && pnpm test
# 集成测试（需要测试用 OAuth credentials）
cd cloudflare
wrangler dev --local &
sleep 3
# 验证 auth 端点存在
curl -s http://localhost:8787/auth/login/google -o /dev/null -w '%{http_code}' | grep -q '302'
curl -s http://localhost:8787/auth/login/github -o /dev/null -w '%{http_code}' | grep -q '302'
curl -s http://localhost:8787/auth/session -o /dev/null -w '%{http_code}' | grep -q '401'
kill %1
echo "Phase 2: PASSED"
```

### Acceptance Criteria

- [ ] Google + GitHub OAuth 登录流程完整
- [ ] JWT session 创建/验证/销毁
- [ ] 所有 6 类测试通过
- [ ] 包可独立构建和测试
- [ ] 代码已提交

---

## Phase 3: Provider + 定价管理 API

### Description

迁移 `/api/ai-providers/*` 路由到 Hono，包括 provider CRUD、凭证管理、模型定价管理、模型状态查询。这是最大的路由文件（1900+ 行）。

**交付物**:
- `cloudflare/src/routes/ai-providers.ts`
- Provider CRUD（增删改查）
- 凭证管理（加密存储）
- 模型定价管理（含 bulk-rate-update）
- 模型状态查询

### Tests

#### Happy Path
- [ ] `GET /api/ai-providers` 返回所有 provider 列表
- [ ] `POST /api/ai-providers` 创建新 provider
- [ ] `PUT /api/ai-providers/:id` 更新 provider 配置
- [ ] `DELETE /api/ai-providers/:id` 删除 provider
- [ ] `GET /api/ai-providers/models` 返回所有可用模型（公开，无需认证）
- [ ] `GET /api/ai-providers/model-rates` 返回定价列表（公开）
- [ ] `POST /api/ai-providers/model-rates` 创建/更新单个模型定价
- [ ] `POST /api/ai-providers/bulk-rate-update` 批量更新定价
- [ ] `GET /api/ai-providers/model-status` 返回模型可用性状态
- [ ] 凭证（API Key）加密存储在 D1 中

#### Bad Path
- [ ] 创建 provider 缺少必填字段（name）返回 400
- [ ] 更新不存在的 provider 返回 404
- [ ] 删除已有关联 credentials 的 provider 时适当处理
- [ ] 无效的 model rate 数据（负数价格）返回 400
- [ ] 未认证请求访问管理 API 返回 401
- [ ] 非 admin 角色访问管理 API 返回 403
- [ ] bulk-rate-update 中部分数据无效时返回部分成功报告

#### Edge Cases
- [ ] provider name 含特殊字符（`/`、`&`、unicode）
- [ ] model rate 价格为 0（免费模型）
- [ ] 大批量 bulk-rate-update（100+ 条）在 D1 batch 限制内
- [ ] 并发更新同一 provider 不产生数据竞争

#### Security
- [ ] API Key 存储时加密，读取时不返回完整 key（仅返回 `sk-...xxx`）
- [ ] SQL injection 防护（Drizzle 参数化查询）
- [ ] admin API 需要 admin/owner 角色
- [ ] 公开 API（models、model-rates）不需要认证

#### Data Leak
- [ ] GET provider 列表不返回完整 API Key
- [ ] 错误响应不包含 SQL 语句或数据库结构
- [ ] 日志中不输出 API Key 明文

#### Data Damage
- [ ] 删除 provider 时级联删除关联 credentials
- [ ] bulk-rate-update 原子性：使用 D1 batch
- [ ] rate history 记录每次定价变更

### E2E Gate

```bash
cd cloudflare && wrangler dev --local &
sleep 3
# 公开 API（无需认证）
curl -s http://localhost:8787/api/ai-providers/models | jq '.length'
curl -s http://localhost:8787/api/ai-providers/model-rates | jq '.length'
# Admin API（需要认证 header）
curl -s -H "x-user-did: test-admin" -H "x-user-role: admin" \
  http://localhost:8787/api/ai-providers | jq '.length'
kill %1
echo "Phase 3: PASSED"
```

### Acceptance Criteria

- [ ] 所有 provider CRUD API 功能完整
- [ ] 凭证加密存储
- [ ] 公开 API 无需认证
- [ ] 管理 API 需 admin 角色
- [ ] 代码已提交

---

## Phase 4: AI 调用代理 API (v1 + v2)

### Description

迁移核心 AI 调用代理功能。Worker 接收用户请求 → 选择 provider → streaming 转发到 AI 模型 API → 记录用量。这是 AIGNE Hub 的核心价值。

**交付物**:
- `cloudflare/src/routes/v1.ts` + `v2.ts`
- Chat completion streaming 转发
- Embedding API 转发
- Image generation 转发
- Video generation 转发
- 调用计量中间件（tokens、latency、TTFB、cost 写入 D1）

### Tests

#### Happy Path
- [ ] `POST /api/v2/chat/completions` streaming 响应正确转发
- [ ] `POST /api/v2/embeddings` 返回 embedding 向量
- [ ] `POST /api/v2/images/generations` 返回生成的图片 URL
- [ ] `POST /api/v2/video/generations` 返回视频结果
- [ ] `POST /api/v1/chat/completions` v1 兼容 API 正常工作
- [ ] 调用完成后 model_calls 表记录 tokens、latency、TTFB、cost
- [ ] streaming 响应的 SSE 格式正确（`data: {...}\n\n`）
- [ ] Provider fallback：首选 provider 失败时尝试下一个

#### Bad Path
- [ ] 不支持的模型名返回 404
- [ ] 无可用 provider 时返回 503
- [ ] AI provider API 返回 429 (rate limit) 时正确转发错误
- [ ] AI provider API 返回 500 时重试或 fallback
- [ ] 请求 body 缺少 `model` 字段返回 400
- [ ] 请求 body 缺少 `messages` 字段（chat）返回 400
- [ ] 用户信用额度不足返回 402
- [ ] API Key 无效时返回 401

#### Edge Cases
- [ ] 超长 prompt（接近模型 context 限制）正确转发
- [ ] streaming 响应中途 provider 断开连接时优雅处理
- [ ] 并发请求同一模型的信用额度扣减不出现竞态
- [ ] non-streaming 模式（stream: false）也正确支持
- [ ] 零 token 响应（空回复）正确处理

#### Security
- [ ] 用户只能使用自己有权限的 provider
- [ ] API Key 不在 streaming 响应中泄露
- [ ] 请求 header 中的 Authorization 不转发到 AI provider（使用服务端 key）
- [ ] prompt injection 防护（不在系统中执行用户输入的代码）

#### Data Leak
- [ ] streaming 响应中不包含 provider API Key
- [ ] 错误信息中不包含 provider base URL 或 internal config
- [ ] model_calls 记录中不存储完整 prompt/response 内容（除非 VERBOSE 模式）

#### Data Damage
- [ ] streaming 中途中断时 model_calls 仍记录（标记为 incomplete）
- [ ] 信用额度扣减在调用完成后执行（非预扣）
- [ ] 并发写入 model_calls 不产生数据丢失

### E2E Gate

```bash
cd cloudflare && wrangler dev --local &
sleep 3
# Chat completion 测试（需要有效的 provider 配置）
curl -s -X POST http://localhost:8787/api/v2/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-user-did: test-user" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"stream":false}' \
  | jq '.choices[0].message.content'
# 验证调用记录
curl -s -H "x-user-did: test-user" http://localhost:8787/api/usage/recent | jq '.[0].model'
kill %1
echo "Phase 4: PASSED"
```

### Acceptance Criteria

- [ ] Chat/Embedding/Image/Video API 功能完整
- [ ] Streaming 转发正确
- [ ] 调用计量写入 D1
- [ ] Provider fallback 工作
- [ ] 代码已提交

---

## Phase 5: 用量统计 + 用户管理 + 信用额度

### Description

迁移用量查询、用户设置、信用额度管理 API。

**交付物**:
- `cloudflare/src/routes/usage.ts`
- `cloudflare/src/routes/user.ts`
- 用量统计查询（按时间范围、按模型、按用户）
- 信用额度查询和管理
- 用户设置 CRUD

### Tests

#### Happy Path
- [ ] `GET /api/usage/stats` 返回聚合统计（按时间范围）
- [ ] `GET /api/usage/by-model` 返回按模型分组的用量
- [ ] `GET /api/usage/credits` 返回用户信用额度余额
- [ ] `GET /api/user/profile` 返回当前用户信息
- [ ] `PUT /api/user/settings` 更新用户设置
- [ ] `GET /api/app/status` 返回应用状态

#### Bad Path
- [ ] 无效时间范围参数返回 400
- [ ] 未认证用户访问返回 401
- [ ] 非 admin 用户查看其他用户用量返回 403
- [ ] 不存在的用户 ID 返回 404

#### Edge Cases
- [ ] 时间范围跨月份的统计查询
- [ ] 零用量用户的统计返回空而非错误
- [ ] 信用额度精度（浮点数处理）

#### Security
- [ ] 用户只能查看自己的用量（除非 admin）
- [ ] 信用额度修改仅 admin 可操作

#### Data Leak
- [ ] 用量 API 不暴露其他用户数据
- [ ] 用户 profile 不返回敏感字段

#### Data Damage
- [ ] 信用额度扣减的并发安全

### E2E Gate

```bash
cd cloudflare && wrangler dev --local &
sleep 3
curl -s -H "x-user-did: test-user" http://localhost:8787/api/usage/credits | jq '.balance'
curl -s -H "x-user-did: test-user" http://localhost:8787/api/user/profile | jq '.did'
kill %1
echo "Phase 5: PASSED"
```

### Acceptance Criteria

- [ ] 用量查询 API 完整
- [ ] 信用额度管理正确
- [ ] 权限控制到位
- [ ] 代码已提交

---

## Phase 6: 定时任务 + SSE 推送 + 支付回源

### Description

实现 CF Cron Triggers 替代现有定时任务，SSE 端点替代 WebSocket 推送，支付 API 回源代理。

**交付物**:
- Cron Triggers: model-call-stats（每小时）、model-rate-check（每30分钟）、archive（每天）
- `cloudflare/src/routes/events.ts`（SSE）
- `cloudflare/src/routes/payment.ts`（回源代理）

### Tests

#### Happy Path
- [ ] Cron handler `model-call-stats` 正确聚合 model_calls → model_call_stats
- [ ] Cron handler `model-rate-check` 从 provider 源检查价格更新
- [ ] Cron handler `archive` 归档超过 retention 期的 model_calls
- [ ] `GET /api/events` 返回 SSE stream（Content-Type: text/event-stream）
- [ ] `model.status.updated` 事件通过 SSE 推送到客户端
- [ ] `/api/payment/*` 请求正确代理到 Blocklet Server

#### Bad Path
- [ ] Cron handler 执行失败时不影响下次执行
- [ ] SSE 客户端断开连接时不报错
- [ ] Blocklet Server 不可达时支付回源返回 502
- [ ] 回源超时时返回 504

#### Edge Cases
- [ ] model_call_stats 聚合时 model_calls 表为空
- [ ] SSE 连接 30s 超时后客户端自动重连
- [ ] 并发多个 SSE 客户端

#### Security
- [ ] Cron handler 不可通过 HTTP 触发（仅 scheduled event）
- [ ] 支付回源代理保留原始认证 header
- [ ] 支付回源目标 URL 不可被客户端篡改

#### Data Leak
- [ ] Cron 日志不输出敏感数据
- [ ] SSE 事件不包含内部配置信息
- [ ] 支付回源不在响应中暴露 Blocklet Server 地址

#### Data Damage
- [ ] 统计聚合是幂等的（重复执行不会重复计数）
- [ ] 归档操作先写入 archive 再删除原数据
- [ ] 支付回源不修改请求/响应 body

### E2E Gate

```bash
cd cloudflare && wrangler dev --local &
sleep 3
# SSE 测试
timeout 5 curl -s -N http://localhost:8787/api/events || true
# 支付回源测试（期望 502 因为本地无 Blocklet Server）
STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/api/payment/status)
echo "Payment proxy status: $STATUS"
# Cron 手动触发测试
curl -s -X POST http://localhost:8787/__scheduled?cron=0+*+*+*+* 2>/dev/null || true
kill %1
echo "Phase 6: PASSED"
```

### Acceptance Criteria

- [ ] 3 个 Cron handler 正确执行
- [ ] SSE 推送工作
- [ ] 支付回源代理正确
- [ ] 代码已提交

---

## Phase 7: Auth 集成 + 前端完整联调

### Description

将 Phase 2 的 CF Auth SDK 集成到 Worker 和前端。替换 x-user-did 占位符为真实认证。前端 shim 中的 mock session 替换为真实 Auth SDK session。全栈联调。

**交付物**:
- Worker 中集成 Auth middleware
- 前端 session shim 对接 Auth SDK
- 登录/登出流程完整
- 所有 API 端点的认证验证

### Tests

#### Happy Path
- [ ] 前端登录页显示 Google + GitHub 登录按钮
- [ ] Google 登录后重定向回前端，session 有效
- [ ] GitHub 登录后重定向回前端，session 有效
- [ ] 登录状态在页面刷新后保持
- [ ] 登出后 session 清除，API 返回 401
- [ ] admin 角色用户可访问管理后台
- [ ] 普通用户不可访问管理 API

#### Bad Path
- [ ] 未登录用户访问前端管理页面重定向到登录
- [ ] 登录后 token 过期自动跳转登录
- [ ] OAuth callback URL 被篡改时拒绝

#### Edge Cases
- [ ] 多 tab 打开时登出在所有 tab 生效
- [ ] OAuth provider 临时不可用时前端显示友好错误

#### Security
- [ ] CORS 限制为特定 origin
- [ ] 公开 API（/api/ai-providers/models）无需认证
- [ ] 管理 API 严格要求 admin 角色

#### Data Leak
- [ ] 前端不在 localStorage 中存储 token
- [ ] Network tab 中看不到 JWT secret

#### Data Damage
- [ ] 登录状态与 KV session 一致

### E2E Gate

```bash
cd cloudflare && pnpm build
cd frontend && pnpm build
wrangler dev --local &
sleep 3
# 验证未认证访问
curl -s http://localhost:8787/api/user/profile -o /dev/null -w '%{http_code}' | grep -q '401'
# 验证公开 API 无需认证
curl -s http://localhost:8787/api/ai-providers/models -o /dev/null -w '%{http_code}' | grep -q '200'
# 验证 OAuth 重定向
curl -s http://localhost:8787/auth/login/google -o /dev/null -w '%{http_code}' | grep -q '302'
kill %1
echo "Phase 7: PASSED"
```

### Acceptance Criteria

- [ ] 完整登录/登出流程
- [ ] 角色权限控制
- [ ] 前后端联调通过
- [ ] 代码已提交

---

## Phase 8: 数据迁移 + 部署 + 验证

### Description

开发 SQLite → D1 数据迁移脚本，执行生产数据迁移，部署到 Cloudflare，全面验证。

**交付物**:
- `cloudflare/scripts/migrate-data.ts`
- 生产环境 wrangler.toml 配置
- 部署到 Cloudflare Workers（staging → production）
- 全面 E2E 验证

### Tests

#### Happy Path
- [ ] 迁移脚本读取 SQLite 导出的所有 11 个表数据
- [ ] DID → OAuth 用户映射正确
- [ ] 迁移后 D1 中数据条数与 SQLite 一致
- [ ] 迁移后 API 查询返回与原系统一致的结果
- [ ] `wrangler deploy` 成功部署到 staging
- [ ] staging 环境全部 API 正常工作

#### Bad Path
- [ ] 迁移脚本对损坏数据（null where not expected）跳过并报告
- [ ] D1 batch 限制（每批 100 条）正确分批
- [ ] 迁移中断后可从断点恢复（幂等 upsert）
- [ ] 部署失败时可快速回滚

#### Edge Cases
- [ ] 空表迁移不报错
- [ ] 超大 JSON 字段（provider config > 1MB）正确处理
- [ ] 时间戳格式统一（ISO 8601）

#### Security
- [ ] 迁移脚本不在日志中输出 API Key 或用户凭证
- [ ] 生产 D1 数据库有访问控制
- [ ] 部署后旧 Blocklet Server 的 API Key 不再有效

#### Data Leak
- [ ] 迁移中间文件（JSON 导出）在完成后删除
- [ ] staging 环境不使用生产数据

#### Data Damage
- [ ] 迁移使用 D1 batch（虽非真事务，但保证一致性最大化）
- [ ] 验证步骤比较源和目标数据的 checksum
- [ ] 回滚方案：保留 SQLite 备份至少 30 天

### E2E Gate

```bash
# 1. 数据迁移验证
node cloudflare/scripts/migrate-data.ts --source=./aikit.db --target=staging --dry-run
node cloudflare/scripts/migrate-data.ts --source=./aikit.db --target=staging

# 2. 部署到 staging
cd cloudflare && wrangler deploy --env staging

# 3. Staging 全面验证
STAGING_URL="https://aigne-hub-staging.workers.dev"
curl -s $STAGING_URL/api/health | jq '.status' | grep -q '"ok"'
curl -s $STAGING_URL/api/ai-providers/models | jq '.length'
curl -s $STAGING_URL/api/ai-providers/model-rates | jq '.length'
echo "Phase 8: PASSED"
```

### Acceptance Criteria

- [ ] 数据迁移脚本完成并验证
- [ ] Staging 部署成功
- [ ] 所有 API 在 staging 上功能正常
- [ ] 数据一致性验证通过
- [ ] 代码已提交

---

## Final E2E Verification

```bash
# 全系统端到端验证（在 staging 环境）
STAGING_URL="https://aigne-hub-staging.workers.dev"

echo "=== Health Check ==="
curl -s $STAGING_URL/api/health | jq .

echo "=== Public APIs (no auth) ==="
curl -s $STAGING_URL/api/ai-providers/models | jq '.length'
curl -s $STAGING_URL/api/ai-providers/model-rates | jq '.length'

echo "=== Auth Flow ==="
curl -s $STAGING_URL/auth/login/google -o /dev/null -w 'Google OAuth: %{http_code}\n'
curl -s $STAGING_URL/auth/login/github -o /dev/null -w 'GitHub OAuth: %{http_code}\n'
curl -s $STAGING_URL/auth/session -o /dev/null -w 'Unauth session: %{http_code}\n'

echo "=== SSE ==="
timeout 3 curl -s -N $STAGING_URL/api/events 2>/dev/null | head -1

echo "=== Payment Proxy ==="
curl -s $STAGING_URL/api/payment/status -o /dev/null -w 'Payment: %{http_code}\n'

echo "=== Frontend ==="
curl -s $STAGING_URL/ -o /dev/null -w 'Frontend: %{http_code}\n'
curl -s $STAGING_URL/config -o /dev/null -w 'SPA route: %{http_code}\n'

echo "=== COMPLETE ==="
```

## Risk Mitigation

| Risk | Mitigation | Contingency |
|------|------------|-------------|
| Auth SDK 延期 | Phase 0-1 使用 x-user-did 占位符，Auth 在 Phase 2 并行开发 | 延长占位符使用到 Phase 7 |
| D1 性能不足 | Phase 0 建立性能基线，持续监控 | 切换到 Hyperdrive + PG |
| 前端 shim 不完整 | Phase 1 编译扫描先于实现 | 按需补 shim，不阻塞后续 Phase |
| AI 调用超时 | v1 直接转发，监控超时率 | 按需引入 CF Queues |
| 数据迁移数据丢失 | dry-run + checksum 验证 + 保留备份 | 回滚到 Blocklet Server |

## References

- [Intent](./intent.md)
- [Overview](./overview.md)
- [media-kit PR #487](https://github.com/blocklet/media-kit/pull/487)
- [payment-kit PR #1339](https://github.com/blocklet/payment-kit/pull/1339)
