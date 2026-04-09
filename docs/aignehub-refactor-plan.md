# AIGNE Hub 重构方案

> 2026-04-09 · 基于会议讨论和行业对标，相关背景材料见 [`aignehub-platform-analysis.md`](./aignehub-platform-analysis.md)

## 结论

AIGNE Hub 的差异化是**按用户授权计费 + OAuth 机制**——OpenRouter、Vertex AI、Bedrock 都不提供这两项。除此之外，API 转接、模型接入、定价维护这些事情要么做不过专业聚合平台，要么不该是我们的核心。

重构目标是让 Hub 回到本质：简单、稳定、可被外部管理。

Hub Worker 只负责五件事：

1. LLM 请求和响应的数据标准化
2. 流量代理
3. Token 计费（计算 credit 消耗，交给 Payment Kit 完成实际扣款）
4. 日志与错误记录
5. 暴露 MCP 管理接口

所有"需要判断"的事情——发现新模型、同步价格、归类错误、决定是否禁用某个模型——全部外置到独立的运维 Blocklet（基于 AFS），通过 MCP 驱动 Hub。

Model Selector 不是本方案的一部分。它是 AFS 的能力，只消费 Hub 暴露的模型 metadata 并把 benchmark 结果写回。具体方案见 [`aignehub-model-selector-plan.md`](./aignehub-model-selector-plan.md)。

这样 Hub 代码小、故障点少，改运维策略不用改 Hub；稳定性由极简保证，灵活性由外置保证。

---

## 现状问题

**模型覆盖落后行业。** 当前实际可用模型约 20-30 个，每个都需要人工配置 provider、凭证、定价、测试。同期 OpenRouter 300+、Vertex AI 200+、Together AI 200+。

**定价维护有亏损风险。** 现有 LiteLLM 24 小时缓存同步和 6 小时漂移检测，但社区数据可能延迟、同步失败没有告警，历史上出现过配错价格赔本的情况。

**新模型上线慢。** 行业热门模型发布后需要小时级响应，当前依赖人工发现和配置，通常是天到周级。

**代理层耦合业务逻辑。** 问题不在"多一跳代理"——OpenRouter 也是中间层。问题在错误处理不健壮、上游健康监控缺失、故障切换依赖累计失败计数，加上业务和代理耦合让每次改动都牵动全身。

**职责边界模糊。** 业务逻辑和代理逻辑耦合，改一处动全身，负责人容易滑向"看起来有用但不是核心"的工作。这直接导致过去一年的核心能力（Model Selector 在内）没落地。

---

## 架构

两层结构。Worker 做代理和数据记录，Ops Blocklet 做运维决策。两层通过 MCP 协议通信，MCP 调用由 DID 签名授权。

```
                    终端用户请求
                         │
                         ▼
            ┌──────────────────────────┐
            │   AIGNE Hub Worker       │
            │   (Cloudflare Worker)    │
            │                          │       上游 Provider
            │  代理 + 标准化             │ ───→  (OpenAI /
            │  Token 计费               │       Anthropic /
            │  日志 + MCP 管理接口       │       OpenRouter / ...)
            └───┬─────────────────┬────┘
                │                 │
          MCP   │                 │ Usage Report
       (DID授权) │                 │
                ▼                 ▼
      ┌──────────────────┐  ┌────────────────┐
      │  Ops Blocklet     │  │  Payment Kit    │
      │  (基于 AFS)        │  │                │
      │                  │  │  余额 / 扣费     │
      │  运维策略         │  │  充值 / 退款     │
      │  自动化决策       │  │  订阅 / 对账     │
      │  分级审批         │  │                │
      └──────────────────┘  └────────────────┘
```

**Worker** 运行在 Cloudflare Worker 上，用 D1 存配置和用量、KV 做热缓存、R2 归档冷日志。不使用 Durable Objects 管余额——余额由 Payment Kit 作为唯一真相源，Worker 只计算 credit 消耗并批量上报。

**Ops Blocklet** 是独立 Blocklet，通过 MCP 读写 Worker 的配置和数据。基于 AFS，把 Worker 管理接口、OpenRouter、LiteLLM 等都挂载为文件系统路径，运维策略以 ash 脚本和 prompt 文件的形式存在，支持实时编辑。

**外部依赖**：Payment Kit 负责实际计费，Model Selector（AFS 能力）消费 metadata 并写回 benchmark 结果。这两者都不是 Hub 的一部分。

---

## Worker 设计

### 职责边界

| 做 | 不做 |
|---|---|
| 接收请求、鉴权、模型解析 | 定时任务 |
| 查余额（KV 缓存 + Payment Kit 回源） | 模型发现 |
| 选凭证、转发到上游 | 定价同步 |
| 流式响应和 token 统计 | 错误分析 |
| 计算 credit、写 usage、批量上报 | 健康检测 |
| 错误捕获和结构化入库 | 智能选择模型 |
| MCP 管理接口（DID 授权） | Admin UI |
| 只读 Status 页 | 运维策略 |

请求处理路径里没有需要"判断"的节点：鉴权 → 模型解析 → 查余额 → 选凭证 → 转发 → 统计 → 计算 credit → 写 usage → 异步上报。

### 技术栈

Cloudflare Worker 做运行时，Hono 做框架，Drizzle 作为 D1 的轻量 ORM。D1 存配置、用量、审计数据；R2 归档冷日志；KV 做余额和配置缓存。MCP 协议用官方 SDK 或自实现 HTTP transport。计费通过 Payment Kit 的 API 集成。

**不用 Durable Objects 的理由**。DO 在 Cloudflare 原生生态里通常被用于用户余额这类需要强一致的状态。本方案不用 DO，是因为余额的真相源在 Payment Kit 那边，Worker 再引入 DO 只是增加复杂度而不解决根本问题。并发扣费的小额透支可以接受（见下文余额检查部分）。

### 数据模型

按领域划分，保持扁平：

**配置类**。Providers 记录上游服务商及其健康状态；Credentials 是加密凭证，区分用途（默认池 vs 运维专用池，用于解决循环依赖）；Models 存模型元数据和多维度定价，含 capability 字段（供 Model Selector 消费）、数据来源标记、废弃时间戳。

**运行时数据**。Usage 是主表，记录每次调用的 token、credit、成本估算；Usage Reports 追踪向 Payment Kit 上报的状态（pending / reported / failed），用于对账和失败重试；Model Calls 记录性能指标和错误；Errors 是结构化错误事件，作为 Ops Blocklet 错误分析的事件源。

**管理类**。Audit Log 记录所有管理操作（含 Ops Agent 的决策自信度和 before_value 用于 undo）；Status Snapshots 是 Status 页的预聚合数据，由 Ops Blocklet 写入；Admin DIDs 是授权白名单，区分 owner / admin / ops_agent 三种角色。

### 用量计算与上报

Worker 在计费链路中是**用量计量员**，不是计费执行者。

**计算逻辑**。每次请求结束时，根据 models 表中的多维度费率计算 credit：文本类按 input × input_rate + output × output_rate 加上缓存/推理维度；嵌入类按总 token 乘 input_rate；图像类按张数计费。结果写入 usage 表。

**上报模式**。同步上报会拖慢每次请求，采用批量节流：usage 写入时标记为 pending，异步调度器周期性拉取 pending 记录批量上报到 Payment Kit，成功后更新为 reported。失败进入重试队列，多次失败进死信队列由 Ops Agent 告警。本地的上报状态是与 Payment Kit 对账的依据。

**请求准入的余额检查**。三个设计点：
- 余额缓存在 KV 中（TTL 约 10 秒），miss 时回源 Payment Kit
- 维护用户的"在途未上报额度"，检查时一并扣除，避免并发请求同时读到"还有余额"导致超用
- 接受批量上报延迟带来的极端并发小额透支（例如 < $0.10），由 Payment Kit 事后处理

这不是"最严格"的设计，但是 Payment Kit 作为真相源的架构下最合理的折衷。

### MCP 管理接口

Worker 通过 MCP 对外暴露**全部**管理能力。接口按领域分组：

| 分类 | 能力 |
|------|------|
| 模型 | list / get / upsert / enable / disable / delete / test |
| Provider | list / upsert / enable / disable |
| 凭证 | list（不返回 value）/ add / rotate / disable |
| 定价 | bulk_update / query_drift |
| 模型元数据 | query_capabilities / update_benchmark（供 Model Selector 使用） |
| 日志 | list_errors / get_error / mark_resolved / list_recent_calls / get_metrics |
| 用量对账 | list_pending_reports / manual_flush / audit_report |
| Status | upsert_snapshot / publish_incident |
| 审计 | list_audit_log |

**授权流程**。验证 DID 签名（含 nonce + timestamp 防重放）→ 查白名单 → 按角色判断权限 → 执行 → 写审计日志。权限分三级：owner 所有操作，admin 除最高危，ops_agent 预授权的自动化操作。

**Model Selector 相关的接口**（query_capabilities / update_benchmark）是给 AFS 侧的 Selector 用的，Hub 本身不执行选择逻辑，只是元数据的存储。

### Status 页

Worker 内置的轻量 HTML + JSON，原则是零业务逻辑。纯读 status_snapshots 表，Cloudflare 短 TTL 缓存。所有聚合计算由 Ops Blocklet 做完后通过 MCP 写入快照。

放在 Worker 里的原因：对外展示必须高可用，和代理层共享基础设施不需额外部署，数据读取路径最短。

---

## Ops Blocklet 设计

Ops Blocklet 是独立的 Blocklet，职责是通过 MCP 驱动 Hub 完成所有自动化运维工作。它是 AFS 应用——把 Hub 的管理接口、外部数据源、监控告警都挂载为文件系统路径，策略以 ash 脚本和 prompt 文件的形式存在，支持实时编辑。

### 构成

**挂载的数据源**。`/services/aignehub/` 是 Hub MCP 的 AFS 映射（models、providers、credentials、errors、metrics 等都是路径）；`/sources/` 是只读的外部数据（OpenRouter、LiteLLM、各 provider 的官方 status 页）；`/monitoring/` 是告警通道和运维审计。

**策略文件**。`blocklet/scripts/` 是 ash 流水线脚本；`blocklet/prompts/` 是 LLM system prompts；`blocklet/schemas/` 是 LLM 响应的 JSON Schema 约束。

**运行时配置**。`data/config/thresholds/` 是各操作的自信度阈值；`data/config/auto_execute/` 是允许自动执行的操作开关；`data/config/custom_rules.txt` 是追加到 prompt 的自定义规则。所有配置文件支持 AFS 内编辑即生效。

### 策略的三种形态

**纯确定性**（ash 流水线）：规则明确的任务，比如从 OpenRouter 同步新模型目录、定时给活跃模型发探测请求、检查本地定价和上游的偏差。零 LLM 成本，可单元测试。

**LLM 决策**（agent-run）：需要语义判断的任务，比如分析错误批次决定是否禁用模型、故障升级判断。LLM 返回结构化的 `{decision, confidence, reason}`，schema 强制约束字段。

**混合**：大多数真实场景。ash 做确定性预过滤和执行，中间插入 agent-run 做判断。例如价格漂移检测：ash 发现异常 → LLM 判断是否需要调整 → ash 执行或发出审批请求。

### 核心策略清单

| 脚本 | 触发 | 形态 | 职责 |
|------|------|------|------|
| `sync-models` | cron | 确定性 | 从 OpenRouter/LiteLLM 同步模型目录和元数据 |
| `drift-check` | cron | 混合 | 检测本地定价和上游偏差，LLM 判断是否调整 |
| `health-test` | cron | 确定性 | 给活跃模型发探测请求，更新健康状态 |
| `cost-audit` | cron | 混合 | AIGNE Hub 上报金额 vs Payment Kit 扣款 vs 上游账单对账 |
| `error-triage` | 事件 | LLM | 分析错误批次，决定处置（禁用、轮换、告警） |
| `slack-callback` | 事件 | 确定性 | 处理管理员的 Slack 审批/撤销 |
| `incident-response` | 事件 | LLM | 故障响应决策（降级、切换、升级） |

### 自信度评分与分级审批

照搬 AFS 中 `telegram-assistant` 已验证的模式。LLM 决策返回 `{decision, target, params, confidence, reason}`，ash 根据 confidence 和操作的风险等级决定直接执行还是走审批。

| 操作 | 风险 | 自动执行阈值 | 低于阈值行为 |
|---|---|---|---|
| 新模型上线 | 低 | ≥ 70 | 60 分钟无反对后执行 |
| 价格微调（< 10%） | 低 | ≥ 75 | 30 分钟无反对后执行 |
| 模型降级 | 中 | ≥ 80 | Slack 通知，不自动执行 |
| 模型禁用 | 中 | ≥ 85 | Slack 按钮审批 |
| 价格大改（> 20%） | 中 | ≥ 90 | Slack 按钮审批 |
| 凭证轮换 | 高 | — | 必须手动审批 |
| 删除资源 | 高 | — | 必须手动审批 |

所有自动执行的操作都必须：写入 `/monitoring/audit/` 留痕（含决策者、自信度、理由）、发 Slack 通知（含 15 分钟内可 undo 的按钮）。

### Prompt 设计原则

Prompt 必须包含：角色定位、可用 decision 枚举和每项的适用条件、自信度评分规则（95-100 / 80-94 / 60-79 / 0-59 四档）、硬性约束（例如 429 错误优先降级而非禁用）、输出格式约束。

调优原则是保守优先：不确定时优先选 `notify_only` 或 `ignore`，不做破坏性操作；要求 LLM 看到足够的证据样本才能做重大决策；明确区分"用户误用"和"系统故障"。

---

## 数据迁移

由于用户余额由 Payment Kit 管理，Hub 自身的数据迁移很轻量。

| 数据 | 处理 |
|---|---|
| 用户余额 | 不迁移（Payment Kit 已有） |
| 加密凭证 | 解密 → 新密钥加密 → 写 D1 |
| Provider 配置 | 迁移到 D1 |
| Admin DID 白名单 | 迁移到 D1 |
| 模型定价表 | 不迁移（Ops 首次运行从 OpenRouter 全量刷新） |
| 历史 Usage | 导出到 R2 冷存储 |
| 未上报 Usage | 一次性补报到 Payment Kit |
| 错误日志 | 不迁移 |
| 历史 Audit Log | 归档到 R2 |

**流程**。先独立部署新系统跑通端到端链路；然后短暂停写窗口内导出旧库快照、运行迁移脚本、对账验证；最后切流量到新 Worker，旧系统保留一段时间作为回滚保险。

**对账检查点**。活跃凭证数量一致、每个凭证能用新密钥解密、Provider 配置完整、Admin 白名单完整、未上报 Usage 已全部补报到 Payment Kit、端到端调用测试通过。

---

## AFS 能力缺口

探索 AFS 代码时发现几个缺口，短期都有绕过方案：

| 缺口 | 影响 | 短期方案 | 长期方向 |
|---|---|---|---|
| MCP 层无细粒度 RBAC | 管理权限控制 | Hub Worker 侧自己实现 DID 授权 | AFS `access-mode-extension` Intent |
| 无 HTTP webhook 触发器 | 外部事件推送 | Hub 主动写入 AFS 路径触发事件订阅 | AFS 新增 HTTP provider |
| Ops 层无独立 LLM 配置 | 循环依赖 | 用 ops 专用凭证池 + 请求头标记绕过 | Ops Blocklet 支持独立 LLM provider 配置 |
| ash 无条件分支 | 复杂逻辑拆多 job | 用 where 过滤 + route 分发 | 设计取舍，不修 |

**循环依赖的解法**。Ops Agent 需要调 LLM 做决策，如果这个调用走 Hub 主流量，Hub 挂了 Ops 也挂。方案是让 Hub 识别请求头 `X-Ops-Bypass: true`，对这类请求走 credentials 表中 `purpose = 'ops'` 的独立凭证池，不触发用户计费，不受终端用户限流影响。Ops Blocklet 同时配置一组"紧急 LLM 凭证"（直连 provider 不经 Hub），当 Hub 连续一段时间不可达时临时切换。

---

## 监控与告警

三层：对外 Status 页（Worker 内置，纯读快照）、对内监控 Dashboard（基于 AFS 的 `/monitoring/` 挂载）、Slack 告警（分通道：常规通知、待审批、严重故障）。

**必须监控**：每个 provider 的成功率、每个模型的 P50/P99 延迟和 TTFB、**计费对账**（Hub 上报金额 vs Payment Kit 扣费 vs 上游账单）、usage 上报健康度（pending 积压量和延迟）、凭证剩余额度、Worker CPU 时间分布。

**建议监控**：Ops Agent 的决策分布和自信度分布、自动执行 vs 人工审批比例、undo 触发频率（反映 Ops Agent 决策质量）。

告警抑制：同类告警合并避免刷屏；告警级别和通知通道严格分开。

---

## 实施顺序

按依赖关系排，不带时间估算：

1. **Worker 最小可用版本**：薄代理 + 用量计算 + Payment Kit 对接 + 基础 MCP 接口，初期只支持一个上游 provider（建议 OpenRouter）把端到端链路跑通
2. **MCP 管理接口补齐**：全套读写接口 + DID 授权 + 审计日志
3. **Ops Blocklet 搭建**：AFS 挂载、核心 ash 策略（sync-models、drift-check、health-test、cost-audit、error-triage、slack-callback）、Slack 审批机制
4. **监控与告警**：Status 页优化、对内 Dashboard、计费对账监控、告警聚合规则
5. **数据迁移与切换**：一次性迁移脚本、对账验证、流量切换、旧系统归档

每一步完成后都应该能独立运行，不依赖后续步骤。

---

## 开放问题

**技术**：D1 跨区域一致性对 Status 页和用量场景的影响；凭证加密方案选择（Cloudflare Secrets Store vs 自建密钥管理）；Worker 包体积能否控制在限制内；Payment Kit API 的调用方式和延迟特征。

**运维策略**：LLM prompt 的初始样本从哪里来（现有日志能否做冷启动数据集）；undo 机制支持哪些操作类型和时间窗口；告警聚合和抑制的具体规则。

**组织**：谁负责接收 Slack 审批通知；谁有权限修改 `/blocklet/scripts/` 和 `/data/config/`；Ops Blocklet 自身 LLM 调用成本在财务上如何归类；策略变更是否需要 review 流程。
