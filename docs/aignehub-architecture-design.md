# AIGNE Hub 架构设计文档

> 生成日期：2026-04-09
> 关联文档：[`aignehub-problems-and-solutions.md`](./aignehub-problems-and-solutions.md)
> 目标：描述 AIGNE Hub 重构的概念架构与设计决策

---

## 一、会议问题与方案对应关系

下表列出 AIGNE Daily Sync 会议中提出的现阶段核心问题，以及新架构方案中对应的解决思路：

| # | 会议中提出的问题 | 新方案的解决方式 |
|---|----------------|----------------|
| 1 | **行业每周几百个新模型，人工配置跟不上**<br>（老冒：Vertex AI 已经有两三百个模型） | Ops Blocklet 的 `sync-models` 策略自动从 OpenRouter 等源发现并上线新模型，小时级响应 |
| 2 | **Agent Hub 变成维护负担，核心价值被弄反**<br>（老冒：API 转接根本不是我们的核心价值，计费才是） | AIGNE Hub Worker 极简化为"代理 + 用量计算"，所有智能逻辑外置；实际计费由 Payment Kit 承担 |
| 3 | **定价一塌糊涂、存在亏损风险**<br>（老冒：彭辉自动抓价格发现赔本赔得一塌糊涂） | `drift-check` 策略定期检测偏差 + `cost-audit` 成本对账 + 定价安全边际 + 分级自动/审批 |
| 4 | **必须按用户计费**<br>（老冒：不能让用户去填 API Key） | AIGNE Hub 按 token 计算 credit 消耗，上报 Payment Kit 完成实际扣费和余额管理 |
| 5 | **必须支持尽可能多的模型**<br>（老冒：两三百个模型的速度，我们这玩意就落后了） | 借力 OpenRouter 等聚合平台，一次接入获得 300+ 模型；未来补充 Vertex AI/Bedrock 作为企业用户选项 |
| 6 | **必须做到完全自动化**<br>（老冒：这个东西我们这个东西是 fully automatic） | Ops Blocklet 的 ash 策略 + LLM 决策 + 自信度门控，实现运维全流程自动化 |
| 7 | **Model Selector 一年前就说了一直没做**<br>（老冒：资金都是一个牛皮，很可怕） | 短期通过 OpenRouter 的智能路由借力；中期基于本地 ModelCall 统计数据提供简单版推荐 |
| 8 | **没人用才没出问题，一用就撑不住**<br>（老冒：等到有人用这玩意就撑不住） | `health-test` 策略每 10 分钟全量 probe + `error-triage` 事件触发自动分析 |
| 9 | **团队聚焦不足，容易偏移到周边工作**<br>（讨论中提到鹏辉一直在做周边不做核心） | 代码职责严格切分：Worker 只做代理，Ops 只做运维；心智边界清晰，减少偏移 |
| 10 | **API 性能问题：反应慢、要 retry、分不清谁的问题**<br>（老冒：我们自己用就经常出现反馈慢） | Worker 剥离业务逻辑走最短路径；错误由 Ops 分析归类，自动降级/切换 |

> 注：问题 4「按用户计费」是会议中唯一明确的**差异化护城河**——所有竞品中只有 AWS Bedrock 通过 IAM+Tags 间接支持，其他平台都不提供。这是 AIGNE Hub 必须做好的核心。

---

## 二、总体架构

### 系统组成

```
┌───────────────────────────────────────────────────────────────┐
│                     Cloudflare 边缘                            │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │          AIGNE Hub Worker（极简代理层）                  │  │
│  │                                                         │  │
│  │  请求入口              存储                               │  │
│  │  ├─ 代理 API           ├─ D1: 配置+审计+用量             │  │
│  │  ├─ 管理接口           ├─ R2: 冷日志                     │  │
│  │  └─ 状态页             └─ KV: 热缓存                     │  │
│  └───────────┬─────────────────────────────┬───────────────┘  │
└──────────────┼─────────────────────────────┼──────────────────┘
               │                             │
               │ MCP(DID 授权)               │ Payment API
               │                             │
┌──────────────▼──────────────┐   ┌──────────▼──────────────┐
│    AIGNE Hub Ops Blocklet    │   │     Payment Kit          │
│    （基于 AFS）                │   │                         │
│                              │   │  - 用户余额              │
│  - 确定性策略（ash）           │   │  - 实际扣费              │
│  - LLM 决策（prompts）        │   │  - 充值/退款            │
│  - 响应约束（schemas）        │   │  - 订阅                  │
│  - 运行时配置                  │   │  - 对账                  │
└──────────────────────────────┘   └─────────────────────────┘
```

### 职责划分

| 组件 | 核心职责 | 明确不做 |
|------|----------|----------|
| **Worker** | 代理、用量计算、错误记录、MCP 管理接口、Status 页 | 定时任务、智能决策、运维逻辑、Admin UI、**实际计费扣款** |
| **Ops Blocklet** | 运维策略、监控聚合、自动化决策、审批流程 | 处理终端用户流量、替代 Worker 代理 |
| **Payment Kit** | 余额管理、实际扣费、充值、退款、订阅、对账 | 计算每次请求的 credit（这是 AIGNE Hub 的事） |

### 核心设计决策

**1. 为什么彻底重构而非渐进改造**

- 现有代码的 Express/Sequelize 体系无法直接跑在 Worker 运行时上
- Worker 的包体积和 CPU 时间限制要求架构必须精简
- 会议共识是"AI 时代敢于重构，不要受限于原来的包袱"
- 保留现有代码的**设计经验**（定价表结构、用量计算逻辑、凭证加密方案），但代码层面全新编写

**2. 为什么由 Payment Kit 负责实际计费**

- Payment Kit 是 ArcBlock 平台统一的计费基础设施，已经解决了余额、充值、订阅、对账等问题
- AIGNE Hub 不应重复造轮子去管理"钱"
- 计费逻辑集中在 Payment Kit 有利于多产品统一结算
- AIGNE Hub 只负责它真正擅长的事：**按 token 计算 credit 消耗**

**3. 为什么数据迁移独立做**

- 新 Worker 可以用最优数据模型，不背历史包袱
- 用户余额由 Payment Kit 管理，根本不需要迁移
- 只需迁移少量 AIGNE Hub 自身配置（加密凭证、provider 配置、管理员白名单）
- 一次性脚本，无需双写过渡期、无需回滚机制、测试简单

---

## 三、AIGNE Hub Worker 设计

### 3.1 技术栈选型

| 层级 | 选型 | 理由 |
|------|------|------|
| 运行时 | Cloudflare Worker | 与 ArcBlock 的云端架构统一方向对齐 |
| 框架 | Hono | Worker 原生、轻量、类型完善 |
| 数据库 | D1 | Cloudflare 原生，SQLite 兼容，零运维 |
| ORM | Drizzle | 支持 D1、类型安全、包体积小 |
| 冷存储 | R2 | 归档历史日志 |
| 热缓存 | KV | 配置和高频读数据（含余额缓存） |
| MCP 协议 | 官方 SDK 或自实现 HTTP transport | 对接 Ops Agent |
| 计费集成 | Payment Kit API | 上报用量，查询余额 |

### 3.2 数据模型（概念层面）

Worker 的 D1 数据库按领域划分为以下几类表，每类表承担明确的职责：

#### 配置类表

**Providers**：上游 AI 服务商配置
- 记录每个 provider 的基础信息（ID、显示名、base URL、区域等）
- 维护 provider 的健康状态（healthy / degraded / unhealthy / disabled）
- 由 Ops Agent 通过 MCP 管理

**Credentials**：加密凭证
- 每个 provider 可以有多个凭证，支持轮转
- 凭证值加密存储，只在 Worker 内存中解密
- 区分用途（默认凭证池 vs 运维专用凭证池），用于解决循环依赖问题
- 记录失败计数和最近失败时间，用于健康决策

**Models**：模型元数据和定价
- 每个模型的完整定价信息（输入、输出、缓存、图片、推理等多维度费率）
- 模型能力元数据（上下文长度、是否支持 tools/vision 等）
- 当前状态（healthy / degraded / unhealthy / disabled）
- 数据来源标记（openrouter / litellm / manual），便于追溯
- 废弃标记和时间戳

#### 运行时数据表

**Usage**：用量记录主表
- 每次成功调用产生一条记录
- 包含用户身份、模型、各维度 token 数、计算出的 credits 消耗
- 同时记录"我方实际成本估算"，用于后续成本对账
- 是向 Payment Kit 上报用量的数据来源
- 保留时间：热数据在 D1，老数据归档到 R2

**Usage Reports**：用量上报状态追踪
- 记录每条 usage 上报到 Payment Kit 的状态（pending / reported / failed）
- 支持批量上报和失败重试
- 与 Payment Kit 对账的本地凭证

**Model Calls**：详细调用日志
- 记录每次调用的性能指标（总时长、TTFB、重试次数）
- 记录错误详情（错误码、错误消息）
- 与 Usage 表通过 ID 关联
- 作为 Status 页和监控的数据源

**Errors**：结构化错误事件
- 按类别、严重程度组织（provider 错误、凭证错误、超时、Bug 等）
- 标记是否已被 Ops Agent 处理及处理结果
- 作为 Ops Blocklet 错误分析流水线的事件源

#### 管理类表

**Audit Log**：所有管理操作留痕
- 记录操作者身份（人类管理员 DID 或 Ops Agent DID）
- 记录操作类型、目标资源、变更前后值
- 对于 Ops Agent 的操作，额外记录自信度评分和决策理由
- 支持 undo 所需的 before_value

**Status Snapshots**：Status 页预聚合数据
- 全局/provider/模型三个层级的聚合状态
- 包含 24h/7d/30d 的 uptime、P50/P99 延迟
- 由 Ops Blocklet 定期通过 MCP 写入，Worker 只负责展示

**Admin DIDs**：管理员白名单
- 区分角色（owner / admin / ops_agent）
- 细粒度权限配置
- MCP 接口调用时的授权依据

### 3.3 用量计算与上报

AIGNE Hub 在计费链路中的角色是**用量计量员**，而非计费执行者。真正的扣费由 Payment Kit 完成。

#### 职责边界

| 角色 | 负责的事 | 不负责的事 |
|------|----------|------------|
| **AIGNE Hub Worker** | 按 token 计算 credit 消耗、上报用量、请求准入判断（查余额） | 扣款、余额管理、充值、退款、订阅管理 |
| **Payment Kit** | 余额存储、原子扣款、对账、充值流程、订阅 | 按模型定价计算 credit（它不懂 AI 模型） |

#### 计算逻辑

每次请求结束时，Worker 根据以下规则计算 credit 消耗：

- **文本生成类**：`credits = prompt_tokens × input_rate + completion_tokens × output_rate + 其他维度（缓存/推理）`
- **嵌入类**：`credits = total_tokens × input_rate`
- **图像生成类**：`credits = image_count × image_rate`
- **定价来源**：`models` 表中该模型的多维度费率（由 Ops Blocklet 自动维护）

计算结果写入 `usage` 表，然后交给上报流水线处理。

#### 上报模式

**实时上报 vs 批量上报**：

- Payment Kit 的 API 调用有延迟和成本，每次请求同步上报会拖慢代理性能
- 采用**批量节流上报**：多条 usage 记录攒一批上报，由调度器周期性触发
- 参考现有 `createAndReportUsage()` 的 throttle 机制

**上报状态追踪**：
- 每条 usage 记录有 `report_status` 字段（pending / reported / failed）
- 上报成功后更新为 `reported`
- 上报失败时重试，多次失败后进入死信队列，由 Ops Agent 告警
- 这是本地与 Payment Kit 的对账依据

#### 请求准入与余额检查

请求进入 Worker 后，在真正转发之前需要判断用户是否有足够余额。

**挑战**：
- 直接每次请求都查 Payment Kit 会增加延迟
- Worker 分布式环境下，多个并发请求可能同时读到"还有余额"，导致小额透支
- Payment Kit 的扣费是延迟的（批量上报），余额读数有滞后

**设计原则**：
- **余额查询**：通过 KV 缓存用户余额，短 TTL（如 10 秒），命中失败时才查 Payment Kit
- **悲观估算**：准入判断时按"最坏情况"估算请求费用（按 max_tokens），避免乐观估算导致超用
- **在途追踪**：在 KV 或短生命周期 DO 中追踪"当前用户的在途未上报额度"，余额检查时扣除
- **轻微透支容忍**：极端并发下允许小额透支（例如 < $0.10），由 Payment Kit 事后处理

**为什么不用 Durable Objects 做强一致**：
- 真正的强一致性在 Payment Kit 那边已经实现
- 在 Worker 侧引入 DO 会增加架构复杂度，而且不能真正解决问题（Payment Kit 才是真相之源）
- 准入判断只需要"足够准确"，不需要"绝对精确"
- 在途追踪如果需要强一致可以用 DO，但优先考虑 KV + 版本号的乐观并发方案

### 3.4 MCP 管理接口

Worker 通过 MCP 协议对外暴露**全部**管理能力，由 Ops Agent 消费。接口按领域分组：

| 分类 | 接口能力 | 说明 |
|------|----------|------|
| **模型管理** | 列表、详情、新增、更新、启用、禁用、删除、触发测试 | 覆盖模型的全生命周期 |
| **Provider 管理** | 列表、新增、更新、启用、禁用 | Provider 层面的操作 |
| **凭证管理** | 列表（不返回值）、添加、轮换、禁用 | 凭证值只能写入不能读出 |
| **定价管理** | 批量更新、漂移查询 | 用于定价自动同步 |
| **日志与状态** | 错误列表、错误详情、标记已解决、最近调用、聚合指标、健康检查 | 为运维决策提供数据 |
| **用量与对账** | 查询未上报 usage、手动触发上报、对账报告 | 与 Payment Kit 的对账支撑 |
| **Status 页** | 更新快照、发布事故公告 | Ops Blocklet 写入 Status 数据 |
| **审计** | 查询审计日志 | 所有操作可追溯 |

#### 授权机制

每次 MCP 调用经过以下流程：

1. **签名验证**：调用方必须用 DID 私钥签名（包含 nonce 和 timestamp 防重放）
2. **白名单检查**：查询 `admin_dids` 表验证调用方是否被授权
3. **权限判断**：根据操作类型和调用方角色判断是否允许
4. **执行操作**：调用对应的数据访问层
5. **审计记录**：将操作详情（含变更前后值）写入 `audit_log`

**权限分级**：
- `owner`：所有操作
- `admin`：除了最高危操作（如删除所有数据）
- `ops_agent`：预授权的自动化操作，不允许手动高危操作

### 3.5 Status 页面设计

Status 页是 Worker 内置的轻量 HTML + JSON 接口，核心原则是**零业务逻辑**：

**展示内容**：
- 全局系统状态（operational / degraded / outage）
- 各 Provider 的当前健康度
- 最近 24 小时 / 7 天 / 30 天的 uptime
- P50 / P99 延迟趋势
- 进行中的事件公告和历史事件列表

**实现原则**：
- Worker 侧只做纯读查询，数据来源于 `status_snapshots` 表
- 所有聚合计算由 Ops Blocklet 完成，通过 MCP 写入快照
- 页面使用 Cloudflare 缓存（短 TTL，如 30 秒），降低 D1 压力
- HTML 页面内嵌简单模板，无需外部 CDN 依赖

**为什么放在 Worker 里**：
- Status 页是对外展示，必须高可用
- 放在 Worker 里和代理层共享基础设施，无需额外部署
- 数据读取路径最短（同一个 D1），延迟最低

### 3.6 请求处理流水线

完整的代理请求经过以下阶段：

```
用户请求
  │
  ▼
[认证中间件]  校验用户 DID / Access Key
  │
  ▼
[模型解析]    根据 model 参数定位到具体模型配置
              └─ 若模型不存在或已禁用 → 返回错误
  │
  ▼
[费用预估]    按请求长度 + max_tokens 估算最坏 credit 消耗
  │
  ▼
[余额检查]    查询 KV 缓存的用户余额（miss 时查 Payment Kit）
              扣除在途未上报额度
              └─ 余额不足 → 返回 402
  │
  ▼
[凭证选择]    从 credentials 表选择合适的凭证
              └─ 考虑 purpose (default/ops)、failure_count、优先级
  │
  ▼
[请求转发]    改写 URL 和 headers，forward 到上游 provider
              └─ 挂上 TransformStream 统计 token
  │
  ▼
[流式响应]    边传给用户边统计
  │
  ▼
[用量计算]    按实际 token 计算真实 credit 消耗
              ├─ 写 usage 表（status: pending）
              ├─ 写 model_calls 表
              ├─ 更新在途额度
              └─ 若失败 → 写 errors 表
  │
  ▼
[批量上报]    异步调度器周期性拉取 pending 的 usage
              批量上报到 Payment Kit
              成功后更新 usage 表的 report_status
  │
  ▼
响应完成
```

**关键特性**：
- 整个流程中 Worker 不做任何"聪明"的决策（不选最优模型、不做 fallback 判断）
- 错误处理只做记录，不做智能重试（重试策略由 Ops 决定未来是否启用哪些模型）
- 流式响应的 token 统计依赖 TransformStream，不破坏流式特性
- 计费的真相之源在 Payment Kit，Worker 的 usage 表是上报队列

---

## 四、Ops Blocklet 设计

### 4.1 Blocklet 组成

Ops Blocklet 基于 AFS 构建，包含以下几类构成要素：

**挂载提供者（Providers）**
- 把 AIGNE Hub MCP 封装为 AFS provider，挂载到 `/services/aignehub/`
- 把外部数据源（OpenRouter、LiteLLM）封装为只读 provider，挂载到 `/sources/`
- 把监控和告警能力挂载到 `/monitoring/`

**策略文件**
- `scripts/`：ash 流水线脚本，定义自动化工作流
- `prompts/`：LLM system prompts，定义智能决策的判断标准
- `schemas/`：JSON Schema，约束 LLM 响应的结构

**运行时配置**
- `data/config/thresholds/`：各操作的自信度阈值
- `data/config/auto_execute/`：允许自动执行的操作开关
- `data/config/custom_rules.txt`：追加到 prompt 的自定义规则

**启动逻辑**
- Blocklet 启动时挂载所有 providers
- 扫描 `scripts/` 目录，注册 ash 脚本的触发器（cron + event）
- 加载运行时配置

### 4.2 AFS 挂载结构

```
/services/aignehub/           ← AIGNE Hub MCP 映射（可读写）
  ├─ models/                  每个模型是一个节点
  ├─ providers/
  ├─ credentials/
  ├─ errors/                  事件源，新错误触发 ash
  ├─ metrics/                 聚合指标
  ├─ usage-reports/           待上报/已上报用量
  └─ .actions/                可执行的管理动作

/sources/                     ← 外部数据源（只读）
  ├─ openrouter/models/       定期从 /api/v1/models 拉取
  ├─ litellm/prices/          从 GitHub 拉取
  └─ providers/*/health/      各 provider 官方 status 页

/monitoring/                  ← 监控与告警
  ├─ slack/                   告警通道封装
  └─ audit/                   运维操作审计留痕

/scheduler/                   ← AFS 内置，用于 cron 触发
/proc/                        ← AFS 内置，用于 LLM 预算控制
```

### 4.3 策略的三种形态

Ops Blocklet 的策略分为三类，每类有明确的适用场景：

| 形态 | 触发方式 | 适用场景 | 特点 |
|------|----------|----------|------|
| **纯确定性** | cron 定时 / 事件触发 | 规则明确、无歧义的任务 | 零 LLM 成本、完全可预测、可单元测试 |
| **纯 LLM 智能** | 事件触发 | 需要语义理解和判断的任务 | 能处理模糊场景、成本较高、有自信度保障 |
| **混合** | cron 或事件 | 大多数真实场景 | 确定性触发+预过滤 → LLM 判断 → 确定性执行 |

**纯确定性**适用于：新模型同步、定时健康测试、价格数据拉取等完全规则化的操作。

**纯 LLM 智能**适用于：错误根因分析、事故响应决策、故障升级判断等需要理解上下文的操作。

**混合**是最常见的形态，例如价格漂移检测：ash 脚本做确定性的数据对比发现异常 → LLM 判断是否需要行动 → ash 脚本执行或发出审批请求。

### 4.4 核心策略清单

| 脚本 | 触发方式 | 形态 | 职责 |
|------|----------|------|------|
| `sync-models` | 每小时 cron | 纯确定性 | 对比 OpenRouter 和本地，发现新模型并添加 |
| `drift-check` | 每 6 小时 cron | 混合 | 检测本地定价和上游价格的偏差，LLM 判断是否需要调整 |
| `error-triage` | AIGNE Hub 错误事件 | LLM 智能 | 分析错误批次，决定是否禁用模型/轮换凭证/告警 |
| `health-test` | 每 10 分钟 cron | 纯确定性 | 对所有 healthy 模型发送测试请求，更新健康状态 |
| `cost-audit` | 每天 cron | 混合 | 对账：AIGNE Hub 上报金额 vs Payment Kit 扣费金额 vs 上游 provider 实际成本，LLM 分析亏损异常 |
| `slack-callback` | Slack 按钮回调事件 | 纯确定性 | 处理管理员的审批/撤销操作 |
| `incident-response` | 严重错误事件 | LLM 智能 | 故障响应决策（降级、切换、升级等） |

### 4.5 自信度评分与分级审批

照搬 AFS 中 telegram-assistant 已验证的模式：

#### 决策数据结构（概念层面）

LLM 的每次决策返回以下核心字段：

- **decision**：具体决策，来自预定义的枚举列表（如 `disable_model`、`update_price`、`notify_only`、`ignore` 等）
- **target**：决策作用的资源 ID（如模型 ID、凭证 ID）
- **params**：附加参数（如新价格、失败样本数）
- **confidence**：0-100 的自信度评分
- **reason**：决策的简短解释（用于审计和通知）

schema 强制约束这些字段必填，LLM 无法返回不符合结构的响应。

#### 分级自动化策略

策略存在运行时配置中，支持实时编辑：

| 操作 | 风险等级 | 自动执行阈值 | 低于阈值行为 |
|------|----------|--------------|--------------|
| 新模型上线 | 低 | confidence ≥ 70 | 60 分钟无反对后执行 |
| 价格微调 < 10% | 低 | confidence ≥ 75 | 30 分钟无反对后执行 |
| 模型降级 | 中 | confidence ≥ 80 | Slack 通知，不自动执行 |
| 模型禁用 | 中 | confidence ≥ 85 | Slack 按钮审批 |
| 价格调整 > 20% | 中 | confidence ≥ 90 | Slack 按钮审批 |
| 凭证轮换 | 高 | 不允许自动 | 必须管理员手动审批 |
| 删除资源 | 高 | 不允许自动 | 必须管理员手动审批 |

**所有自动执行的操作**都必须：
- 写入 `/monitoring/audit/` 留痕（含决策者、自信度、理由）
- 发 Slack 通知（记录执行结果）
- 保留 undo 按钮（15 分钟内可回滚）

### 4.6 Prompt 设计原则

系统 prompt 不是随意写的，需要遵循以下结构：

**必备部分**：
- 角色定位：明确告诉 LLM 它是 AIGNE Hub 的运维 agent
- 可用决策列表：枚举所有允许的 decision 值，含每个决策的适用条件
- 自信度评分规则：明确 95-100、80-94、60-79、0-59 各区间的判断标准
- 硬性约束：哪些情况下必须优先选择哪个决策（例如 429 错误优先降级而非禁用）
- 输出格式约束：强调必须返回符合 schema 的 JSON

**可选部分**（通过 `data/config/custom_rules.txt` 追加）：
- 临时规则（如"某 provider 暂时不稳定，24 小时内忽略其 401 错误"）
- 业务相关规则（如"某系列模型的 deprecation 需要提前 7 天通知"）
- 实验性调整

**调优原则**：
- 保守优先：不确定时宁可选 `notify_only` 也不要做破坏性操作
- 证据门槛：要求 LLM 必须看到足够的证据样本才能做重大决策
- 边界清晰：明确区分"用户误用"和"系统故障"

### 4.7 运行时配置层级

配置分三层，允许不同粒度的实时调整：

**阈值配置**（`thresholds/`）：
- 每个操作的自信度门槛
- 价格变化的自动/审批边界
- 错误数量的聚合阈值

**开关配置**（`auto_execute/`）：
- 每种自动化是否启用（例如临时关闭自动禁用模型，进入"观察模式"）
- 可用于紧急降级

**规则追加**（`custom_rules.txt`）：
- 自由文本，直接拼接到 LLM prompt
- 用于快速响应临时情况
- 不需要改代码或 prompt 模板

三层配置都在 AFS 中，编辑即生效，无需重启 Ops Blocklet。

---

## 五、端到端流程示例

以下三个场景展示不同形态策略的完整工作流。

### 场景 1：新模型上线（纯自动化）

```
触发
  OpenRouter 发布 Claude Opus 4.7
  ↓
发现
  sync-models 脚本（每小时 cron）触发
  ash 流水线对比 /sources/openrouter/models 和 /services/aignehub/models
  发现本地缺少 claude-opus-4.7
  ↓
执行
  ash 调用 /services/aignehub/.actions/upsert-model
  Worker 收到 MCP 调用 → 验证 Ops Agent DID 签名 → 写 models 表
  ↓
审计
  写 audit_log（operator = ops_agent，confidence = null 因为是确定性操作）
  ↓
通知
  ash 调用 /monitoring/slack/.actions/notify
  Slack 收到："新模型上线: anthropic/claude-opus-4.7"
  ↓
持续监控
  下次 health-test 触发时自动包含这个新模型
```

### 场景 2：错误自动处置（LLM 智能）

```
触发
  用户调用 gemini-2.5-pro，连续返回 500 错误
  Worker 将错误写入 errors 表
  ↓
聚合
  当同类错误累积达到阈值（例如 10 条），Worker 生成 error_batch 事件
  ↓
分析
  error-triage 脚本被事件触发
  ash 调用 agent-run，把错误样本喂给 LLM
  ↓
决策
  LLM 返回:
    decision: "disable_model"
    target: "google/gemini-2.5-pro"
    confidence: 92
    reason: "100% 失败率，错误一致为 'service unavailable'"
  ↓
门控
  ash 判断 confidence 92 ≥ 阈值 85 → 允许自动执行
  ↓
执行
  ash 调用 /services/aignehub/.actions/disable-model
  Worker 通过 MCP 执行禁用
  ↓
审计
  写 audit_log（含 before_value 用于 undo）
  ↓
通知
  发 Slack 消息："⚠️ 已自动禁用 google/gemini-2.5-pro（置信度 92%）- 15 分钟内可撤销"
  ↓
可回滚窗口
  管理员 15 分钟内可点 undo 按钮 → 触发 slack-callback 脚本 → 恢复
```

### 场景 3：人工审批流（混合）

```
触发
  drift-check（每 6 小时 cron）检测到 Claude Sonnet 价格下降 25%
  ↓
初判
  ash 流水线发现超过漂移阈值，保存漂移报告
  ↓
LLM 分析
  调用 agent-run 让 LLM 判断
  LLM 返回: {decision: "update", confidence: 80, reason: "..."}
  ↓
规则判断
  价格变化 > 10%，按策略必须走人工审批
  ash 跳过自动执行分支
  ↓
通知审批
  发 Slack 带按钮消息：
    "⚠️ Claude Sonnet 价格下降 25%，需要审批
     [批准更新] [忽略]"
  ↓
等待决策
  （异步等待管理员点击）
  ↓
管理员点击"批准更新"
  ↓
回调处理
  Slack 回调触发 slack-callback 脚本
  路由到 approve_drift 分支
  ↓
执行
  调用 /services/aignehub/.actions/bulk-update-rates
  ↓
审计
  写 audit_log（operator = 管理员 DID，operator_type = admin）
  ↓
更新消息
  Slack 消息更新为："✓ 已批准并执行"
```

---

## 六、一次性数据迁移

由于**用户余额由 Payment Kit 管理**，AIGNE Hub 自身的数据迁移非常轻量。

### 迁移范围决策

| 数据 | 处理方式 | 理由 |
|------|----------|------|
| **用户余额** | ❌ 不迁移 | Payment Kit 已经管理，新 Worker 直接对接即可 |
| **加密凭证** | 解密 → 用新密钥重新加密 → 写入 D1 | 必须保留，但密钥需要更新 |
| **Provider 配置** | 迁移到 D1 | 配置信息，量小，直接迁移 |
| **管理员 DID 白名单** | 迁移到 D1 | 权限信息 |
| **模型定价表** | 不迁移 | 由 Ops 首次运行时从 OpenRouter 全量刷新，反而更干净 |
| **历史 Usage 记录** | 导出到 R2 冷存储（CSV/Parquet） | 只读审计数据，不需要在新 D1 中查询 |
| **未上报的 Usage** | 一次性补报到 Payment Kit | 避免丢失待结算的用量 |
| **历史错误日志** | 不迁移 | 新系统重新开始计数 |
| **历史 Audit Log** | 归档到 R2 | 合规需要，但新系统无需读取 |

### 迁移流程

**第一步：新系统独立运行**

- 部署 Worker + D1 + R2
- 部署 Ops Blocklet，运行 sync-models 拉取模型目录
- 新 Worker 对接 Payment Kit，验证余额查询和用量上报链路
- 用测试账户跑通端到端链路
- 确认所有管理接口可用

**第二步：快照式迁移**

- 给旧系统设置只读模式（短暂停写窗口）
- 导出旧数据库快照
- 运行独立的迁移脚本：
  - 解密旧凭证 → 用新密钥加密 → 写 D1
  - 导出未上报的 usage → 一次性批量补报到 Payment Kit
  - 导出 Usage 历史到 R2
  - 写入 provider 配置和管理员 DID 白名单
- 运行对账检查脚本验证一致性

**第三步：流量切换**

- 修改 DNS / 路由指向新 Worker
- 观察关键指标无异常后确认切换
- 旧系统保留一段时间作为回滚保险
- 之后归档释放资源

### 对账检查点

迁移后必须通过的验证：

- 活跃凭证的数量在新旧系统一致
- 每个凭证都能用新密钥成功解密
- Provider 配置完整
- Admin DID 白名单完整
- 未上报 usage 已全部补报到 Payment Kit（对账无缺失）
- 端到端调用测试通过（选几个典型用户发真实请求，验证计费链路）

---

## 七、AFS 能力缺口与应对

探索 AFS 代码时发现几个当前不支持的能力。短期都有绕过方案，长期建议在 AFS 侧补齐。

| 缺口 | 影响 | 短期绕过 | 长期修复方向 |
|------|------|----------|--------------|
| **MCP 层无细粒度 RBAC** | 管理权限控制 | AIGNE Hub Worker 侧自己实现 DID 授权 | AFS 已有 `access-mode-extension` Intent 规划 |
| **无 HTTP webhook 触发器** | 外部系统无法主动推送事件 | AIGNE Hub 主动写入 AFS 路径触发事件订阅 | 新增 HTTP provider 支持 |
| **运维层无独立 LLM 配置** | 循环依赖风险 | 用 ops 专用凭证池 + 请求头标记绕过 | Ops Blocklet 支持独立 LLM provider 配置 |
| **ash 无条件分支** | 复杂逻辑需拆多个 job | 用 where 过滤 + route 分发 | 设计取舍，不修复 |

### 循环依赖的应对

Ops Agent 需要调用 LLM 来做决策。如果这个调用走 AIGNE Hub 主流量，会形成循环依赖——Hub 故障时 Ops Agent 也无法自救。

**方案**：

AIGNE Hub 识别特殊请求头 `X-Ops-Bypass: true`，对这类请求：
- 走 credentials 表中 `purpose = 'ops'` 的独立凭证池
- 不触发用户计费逻辑（不走 Payment Kit 上报）
- 不受终端用户限流影响
- 独立记账（可统计 Ops 自身的运维成本）

**降级方案**：

Ops Blocklet 同时配置一组"紧急 LLM 凭证"（直连某个 provider，不经 Hub）。当检测到 AIGNE Hub 连续一段时间不可达时，临时切换到这组凭证进行自救操作。

---

## 八、监控与告警体系

### 三层监控

**对外 Status 页**（Worker 内置）
- 展示：全局状态、各 provider 状态、历史 uptime、事件公告
- 实现：纯读 status_snapshots 表
- 数据来源：Ops Blocklet 定期聚合后通过 MCP 写入

**对内监控 Dashboard**（基于 AFS）
- 展示：实时请求量、延迟分布、成本对账、凭证健康、错误趋势
- 实现：通过 AFS Explorer 查看 `/monitoring/` 下的数据
- 数据来源：Ops Blocklet 的 ash 脚本定期聚合

**Slack 告警**
- 分通道：`#aignehub-ops`（常规通知）、`#aignehub-approvals`（待审批）、`#aignehub-critical`（严重故障）
- 告警内容：自动执行结果、待审批操作、故障告警、定价变更、对账异常
- 告警抑制：同类告警合并，避免刷屏

### 关键监控指标

**必须监控**：
- 每个 provider 的成功率（滚动窗口）
- 每个模型的 P50 / P99 延迟和 TTFB
- **计费对账**：AIGNE Hub 上报金额 vs Payment Kit 实际扣费 vs 上游 provider 账单
- **上报健康**：pending usage 的积压量和上报延迟
- 凭证剩余额度
- Worker CPU 时间分布（防止接近限制）

**建议监控**：
- Ops Agent 自身的决策分布和自信度分布
- 自动执行 vs 人工审批的比例
- Undo 触发频率（反映 Ops Agent 决策质量）

---

## 九、开放问题

实施前需要进一步讨论的技术决策：

### 9.1 技术决策
- D1 的跨区域一致性是否影响 Status 页和用量数据场景
- 凭证加密方案选择（Cloudflare Secrets Store 还是自建密钥管理）
- Worker 包体积是否能控制在限制内
- Payment Kit API 的调用方式（REST？gRPC？）和延迟特征
- 在途额度追踪用 KV 乐观并发还是轻量 DO

### 9.2 运维策略
- LLM prompt 的初始样本从哪里来（现有日志能不能用来做冷启动数据集）
- undo 机制支持哪些操作类型，时间窗口多长
- 告警聚合和抑制的具体规则
- 策略调优的迭代节奏

### 9.3 组织流程
- 谁负责接收 Slack 审批通知（值班轮换还是全员接收）
- 谁有权限修改 `/blocklet/scripts/` 和 `/data/config/`
- Ops Blocklet 自身的 LLM 调用成本如何在财务上归类
- 策略变更是否需要评审流程

---

## 十、实施阶段

### Phase 0：设计对齐
- 问题分析与竞品调研
- 架构方案定稿
- D1 数据模型 review
- MCP 接口清单 review
- ash 策略清单 review
- 与 Payment Kit 的对接点确认

### Phase 1：Worker 核心重构
- Cloudflare 基础设施搭建
- Worker 脚手架和技术栈选型落地
- 数据模型建立
- 代理 API 端点（初期仅支持 OpenRouter 作为后端）
- 流式响应和 token 统计
- **用量计算模块**
- **Payment Kit 对接**（余额查询 + 批量上报）
- 错误捕获和结构化记录
- 基础 MCP 管理接口（核心的几个）
- Status 页（读 status_snapshots）
- DID 签名认证
- 审计日志

**验证目标**：
- 端到端链路贯通：用户请求 → 余额检查 → OpenRouter → 流式响应 → 用量计算 → 上报 Payment Kit
- MCP 管理接口调用打通
- Status 页可访问

### Phase 2：MCP 管理接口完善
- 所有管理接口补齐
- 权限粒度细化
- 协议符合性测试

### Phase 3：Ops Blocklet 搭建
- Blocklet 脚手架 + AFS 集成
- AIGNE Hub MCP 作为 AFS provider 挂载
- 外部数据源 provider（OpenRouter、LiteLLM）
- 核心 ash 策略落地（sync-models、drift-check、error-triage、health-test、cost-audit、slack-callback）
- Prompts 和 schemas 编写
- 运行时配置结构
- Slack provider 集成
- 分级审批机制打通

**验证目标**：
- 模拟各类场景测试策略响应
- 人工审批流程跑通
- undo 机制验证
- cost-audit 对账链路贯通

### Phase 4：监控与告警
- Status 页优化和历史数据展示
- 对内监控视图
- Slack 告警通道配置
- 计费对账监控
- 告警聚合和抑制规则

### Phase 5：数据迁移与切换
- 迁移脚本开发
- Staging 环境 dry run
- 对账脚本
- 切换演练
- 生产环境切换
- 旧系统归档

---

## 十一、参考资料

- [`aignehub-platform-analysis.md`](./aignehub-platform-analysis.md) - 竞品平台对标分析
- [`aignehub-problems-and-solutions.md`](./aignehub-problems-and-solutions.md) - 问题分析与解决方案
- AFS 项目：`~/Projects/afs`
  - ash 实现：`providers/basic/ash/`
  - telegram-assistant 参考：`blocklets/telegram-assistant/`
  - scheduler：`providers/basic/scheduler/`
- Cloudflare Workers 文档：D1 Database、KV、R2、Workers AI
- OpenRouter：Models API、Provider Routing
- Model Context Protocol 规范
- Payment Kit（@blocklet/payment-js）
