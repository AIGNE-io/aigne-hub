# AIGNE Hub Cloudflare Migration: 从 Blocklet 完全迁移到 Cloudflare Workers

## 一句话说明

将 AIGNE Hub（AI 模型代理平台）从 Blocklet Server 完全迁移到 Cloudflare Workers 生态，实现 SaaS 化运营。

## Why?

AIGNE Hub 当前运行在 Blocklet Server 上，需要完全迁移到 Cloudflare 以获得边缘加速、Serverless 运维、全球部署能力，并脱离 Blocklet 平台依赖。

## Core Experience

```
用户 ──► CF Pages (React SPA)
              │
              ▼
         CF Worker (Hono API)
         ├── AI 调用代理 (v1/v2)
         ├── Provider + 定价管理
         ├── 用量统计 + 信用额度
         ├── 用户认证 (CF Auth SDK)
         └── 支付 ──► Blocklet Server (回源)
              │
              ▼
         CF D1 + KV + Queues + Cron
```

## Architecture

```
aigne-hub/
├── blocklets/core/          # 保持不变 (前端源码被复用)
├── cloudflare/              # ★ 新增
│   ├── frontend/            # Vite + shim 层 → 复用 blocklets/core/src/
│   ├── src/                 # Hono API + Drizzle + 业务逻辑
│   ├── migrations/          # D1 SQL 迁移
│   └── wrangler.toml        # CF 配置
└── packages/
    ├── ai-kit/              # 保持不变
    └── cf-auth/             # ★ 新增: 通用 CF 认证 SDK
```

## Key Decisions

| 问题 | 选择 | 原因 |
|------|------|------|
| 迁移范围 | 完全脱离 Blocklet | SaaS 运营需要统一架构 |
| 后端框架 | Hono | CF Workers 原生，与 media-kit 一致 |
| 数据库 | Drizzle + D1 | SQLite 方言兼容，零外部依赖 |
| 认证 | 新建通用 CF Auth SDK | 多项目复用（media-kit 也需要） |
| 支付 | v1 回源代理 | 降低初始复杂度 |
| WebSocket | SSE 替代 | 仅 1 个事件场景 |
| 项目结构 | 独立 cloudflare/ 目录 | 原代码不动，shim 层复用前端 |

## Scope

**In (v1)**:
- 全部 AI 调用代理 API
- Provider/定价/凭证管理
- 用量统计 + 信用额度
- 用户认证 (OAuth + Passkey)
- 管理后台
- 定时任务 + 数据迁移
- 支付回源代理

**Out (v1)**:
- 支付完全迁移
- DID Wallet 登录
- 自托管部署
- Blocklet Marketplace

## Risk + Mitigation

| 风险 | 缓解 |
|------|------|
| CF Auth SDK 阻塞全部功能 | 先用 x-user-did 占位符并行开发 |
| 30s CPU 限制影响图片/视频 | CF Queues 异步处理 |
| Sequelize→Drizzle 工作量 | 逐表迁移，9 个模型 |
| D1 数据量限制 | 归档策略 + 聚合统计 |

## Timeline

| 阶段 | 内容 | 周期 | 备注 |
|------|------|------|------|
| Phase 0 | CF Auth SDK (并行启动) | Week 1-4 | 跨项目阻塞点，media-kit/payment-kit 也需要 |
| Phase 1 | 基础设施 + DB Schema + 前端 shim | Week 1-2 | 用 x-user-did 占位符，不等 Auth SDK |
| Phase 2 | 核心 AI API 迁移 (v1/v2) | Week 2-4 | AI 代理是核心价值 |
| Phase 3 | 管理后台 + Cron + Queue + Auth 集成 | Week 4-6 | Auth SDK 完成后集成 |
| Phase 4 | 数据迁移 + 测试 + 部署 | Week 6-8 | 含 SQLite→D1 数据迁移脚本 |

## Next Steps

1. `/intent-review` — 审核本 Intent
2. 为 CF Auth SDK 创建独立的 Intent（`/intent-interview`）
3. `/intent-plan` — 分解为 TDD 驱动的执行步骤
4. 开始 Phase 1 实施
