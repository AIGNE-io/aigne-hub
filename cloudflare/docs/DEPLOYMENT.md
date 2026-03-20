# AIGNE Hub Cloudflare Deployment Guide

## Data Migration Strategy

### Overview

数据迁移分三层：

| 层级 | 数据 | 方式 | 自动化 |
|------|------|------|--------|
| **L1: 公开数据** | Providers, ModelRates, Statuses | API 同步 | ✅ 全自动 |
| **L2: 管理数据** | Credentials, Apps, Projects | SQLite 导出 或 手动配置 | ⚠️ 半自动 |
| **L3: 历史数据** | ModelCalls, Usages, Stats, History | SQLite 导出 | ⚠️ 可选 |

### Step 1: 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
wrangler d1 create aigne-hub-production

# 创建 KV namespace (session 存储)
wrangler kv namespace create AUTH_KV

# 设置 secrets
wrangler secret put AUTH_SECRET        # JWT 签名密钥
wrangler secret put GOOGLE_CLIENT_ID   # Google OAuth
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID   # GitHub OAuth
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put ADMIN_EMAILS       # 管理员邮箱列表

# 更新 wrangler.toml 中的 database_id 和 KV id
```

### Step 2: 初始化 Schema

```bash
wrangler d1 execute aigne-hub-production --remote --file=migrations/0001_initial.sql
```

### Step 3: L1 数据迁移 — 公开数据（全自动）

```bash
# 从运行中的 Blocklet Server 同步 providers + model rates + statuses
npx tsx scripts/sync-from-hub.ts \
  --hub=https://staging-hub.aigne.io \
  --target=production
```

这会自动迁移：
- 10 Providers（OpenAI, Anthropic, Google, DeepSeek, xAI 等）
- 136 Model Rates（含定价、类型、元数据）
- 43 Model Statuses

### Step 4: L2 数据迁移 — 敏感数据

**方案 A: 手动在 CF Dashboard 配置**（推荐）

不迁移旧的 API Keys，在新系统中重新配置：
1. 部署后访问 `/config/ai-config`
2. 为每个 Provider 添加新的 API Key
3. 优点：密钥不经过网络传输

**方案 B: 从 SQLite 导出**（需服务器访问权限）

```bash
# 1. 从 Blocklet Server 复制数据库文件
scp server:/path/to/BLOCKLET_DATA_DIR/aikit.db ./aikit.db

# 2. 运行完整迁移（包含加密的 credentials）
npx tsx scripts/migrate-data.ts \
  --source=./aikit.db \
  --target=production \
  --tables=Apps,AiCredentials,Projects

# 3. 迁移完成后删除本地数据库文件
rm ./aikit.db
```

### Step 5: L3 历史数据迁移（可选）

如果需要保留历史调用记录和用量统计：

```bash
npx tsx scripts/migrate-data.ts \
  --source=./aikit.db \
  --target=production \
  --tables=ModelCalls,ModelCallStats,Usages,AiModelRateHistories
```

注意：
- `ModelCalls` 可能有大量数据，迁移时间较长
- 建议只迁移最近 90 天的数据
- `ArchiveExecutionLogs` 不需要迁移（从零开始）

### Step 6: 部署 Worker

```bash
cd cloudflare

# 部署到 production
wrangler deploy --env production

# 验证
curl https://your-domain.workers.dev/api/health
curl https://your-domain.workers.dev/api/ai-providers/models | jq '.length'
```

### Step 7: 前端部署

```bash
cd cloudflare/frontend
pnpm build
# 部署 dist/ 到 CF Pages 或作为 Worker 的 Assets
```

### Step 8: DNS 切换

将域名从 Blocklet Server 切换到 Cloudflare Worker。

---

## 自动化 CI/CD

### GitHub Actions 示例

```yaml
name: Deploy AIGNE Hub to Cloudflare
on:
  push:
    branches: [feat/cloudflare-migration]
    paths: ['cloudflare/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install

      # Build frontend
      - run: cd cloudflare/frontend && pnpm build

      # Deploy Worker
      - run: cd cloudflare && wrangler deploy --env production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

      # Sync data from Hub (L1 only)
      - run: |
          cd cloudflare
          npx tsx scripts/sync-from-hub.ts \
            --hub=${{ vars.HUB_URL }} \
            --target=production
```

### 定期数据同步（可选）

可以设置 Cron 定期从 Blocklet Server 同步 model rates 更新：

```yaml
# .github/workflows/sync-rates.yml
on:
  schedule:
    - cron: '0 */6 * * *'  # 每 6 小时

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx tsx cloudflare/scripts/sync-from-hub.ts --hub=${{ vars.HUB_URL }} --target=production
```
