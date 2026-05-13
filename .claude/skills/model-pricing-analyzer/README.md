# Model Pricing Analyzer Skill

AI 模型定价分析工具，用于比较 AIGNE Hub 数据库中的模型价格与外部数据源（LiteLLM、OpenRouter）的差异。

## 目录结构

```
.claude/skills/model-pricing-analyzer/
├── model-pricing-analyzer.md    # Skill 定义和使用文档
├── README.md                     # 本文件
└── scripts/                      # 所有相关脚本（与 skill 放在一起）
    ├── hub-auth.mjs              # 多环境认证管理器（原始版本）
    ├── auth-hub.mjs              # 简单认证辅助工具（原始版本）
    ├── get-hub-access-key.mjs    # 获取访问密钥工具（原始版本）
    ├── detect-mount-point.mjs    # 自动检测 blocklet mount point
    ├── analyze-pricing.ts        # 主要定价分析脚本
    ├── analyze-and-report.sh     # 一键分析并生成 HTML 报告
    ├── generate-html-report.mjs  # HTML 报告生成器
    ├── package.json              # 脚本依赖
    └── package-lock.json         # 依赖锁定文件
```

## 设计理念

**为什么脚本与 skill 放在一起？**

1. **关联性**: 这些脚本是 skill 功能的核心组成部分，不是通用工具
2. **可移植性**: Skill 及其依赖的脚本作为一个完整单元，便于分享和复用
3. **语义清晰**: 将相关功能组织在同一个命名空间下，避免项目级 scripts/ 目录混乱
4. **版本管理**: 脚本和 skill 文档一起演进，保持同步

## 认证脚本说明

### hub-auth.mjs（推荐 - 多环境管理）

**功能特点**:
- 支持 local / staging / production 三个环境
- 自动管理多个环境的凭证，存储在 `~/.aigne-hub/credentials.json`
- 提供 login / logout / list / get 子命令
- 支持缓存 token，避免重复认证

**使用方式**:

```bash
# 登录 staging 环境
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs login staging

# 登录 production 环境
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs login production

# 登录本地环境
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs login local http://localhost:8090

# 查看所有已保存的凭证
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs list

# 获取特定环境的 token（用于脚本）
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs get staging

# 登出
node .claude/skills/model-pricing-analyzer/scripts/hub-auth.mjs logout staging
```

### auth-hub.mjs（简单版）

**功能特点**:
- 单次认证，打印 token
- 适合临时使用或手动设置环境变量
- 不保存凭证

**使用方式**:

```bash
# 认证指定的 Hub URL
node .claude/skills/model-pricing-analyzer/scripts/auth-hub.mjs https://staging-hub.aigne.io

# 默认使用 production
node .claude/skills/model-pricing-analyzer/scripts/auth-hub.mjs
```

### get-hub-access-key.mjs（脚本友好版）

**功能特点**:
- 仅输出 token，无额外信息
- 适合在脚本中使用 `$()`  捕获输出

**使用方式**:

```bash
# 获取 token 并赋值给变量
TOKEN=$(node .claude/skills/model-pricing-analyzer/scripts/get-hub-access-key.mjs https://hub.aigne.io)
```

## 快速开始

### 1. 安装依赖

```bash
cd .claude/skills/model-pricing-analyzer/scripts
npm install
```

### 2. 认证

```bash
# 使用多环境管理器（推荐）
node hub-auth.mjs login staging
```

### 3. 运行分析并生成报告

```bash
# 一键生成 HTML 报告
bash analyze-and-report.sh staging 0.1
```

### 4. 查看报告

报告会自动在浏览器中打开，或手动打开生成的 HTML 文件。

## 架构优势

### 对比旧架构

**旧架构**（scripts/ 在项目根目录）:
```
aigne-hub/
├── scripts/
│   ├── auth-hub.mjs         # 被删除后重新创建，逻辑丢失
│   ├── hub-auth.mjs         # 被删除后重新创建，逻辑丢失
│   ├── analyze-pricing.ts
│   └── ...其他不相关的脚本
└── .claude/
    └── skills/
        └── model-pricing-analyzer.md
```

**问题**:
- Skill 和脚本分离，不直观
- 脚本容易被误删（如本次情况）
- 项目级 scripts/ 目录混杂各种用途的脚本

**新架构**（scripts/ 在 skill 目录下）:
```
aigne-hub/
└── .claude/
    └── skills/
        └── model-pricing-analyzer/
            ├── model-pricing-analyzer.md
            ├── README.md
            └── scripts/
                ├── hub-auth.mjs       # 原始版本已恢复
                ├── auth-hub.mjs       # 原始版本已恢复
                ├── get-hub-access-key.mjs  # 原始版本已恢复
                └── ...
```

**优势**:
- 关联文件组织在一起
- Skill 是自包含的完整单元
- 便于版本控制和分享
- 不会与项目其他脚本冲突

## 文件恢复说明

### 恢复的原始文件

以下文件从会话日志中成功恢复：

1. **hub-auth.mjs** - 多环境认证管理器
   - 完整的 CLI 工具，支持 login / logout / list / get 子命令
   - 管理 `~/.aigne-hub/credentials.json` 凭证存储
   - 支持强制重新认证（--force）

2. **auth-hub.mjs** - 简单认证辅助工具
   - 单次认证，打印 token 和使用说明
   - 适合快速验证或手动操作

3. **get-hub-access-key.mjs** - 脚本友好版获取工具
   - 仅输出 token，无额外日志
   - 适合在 shell 脚本中使用

这些文件保留了原始逻辑和功能，不是重新实现的版本。

## 相关文档

- **Skill 使用文档**: `model-pricing-analyzer.md`
- **认证流程**: 参考 `~/.claude/skills/myvibe-publish/` 的认证实现
- **Mount Point 检测**: `detect-mount-point.mjs`

## 维护建议

1. **不要删除**: Skill 目录下的所有文件都是必需的，请勿清理
2. **统一更新**: 修改脚本时，同步更新 skill 文档
3. **版本控制**: 将整个 `.claude/skills/model-pricing-analyzer/` 目录纳入版本控制
4. **依赖管理**: 定期更新 `package.json` 中的依赖版本
