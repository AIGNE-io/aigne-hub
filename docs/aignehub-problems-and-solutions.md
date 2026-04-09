# AIGNE Hub 问题分析与解决方案

> 生成日期：2026-04-09
> 背景：基于 AIGNE Daily Sync 会议中老冒提出的核心问题，结合竞品调研和代码架构分析

---

## 一、问题全景

### 会议中明确的三大核心约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | **按用户计费** | 不能让用户自己填 API Key，必须提供统一计费通道 |
| 2 | **尽可能多的模型** | 不能只支持 20-30 个，要跟上行业 300+ 模型的步伐 |
| 3 | **极低运维成本** | 新模型接入和价格维护必须全自动化，不能依赖人工配置 |

---

## 二、逐项问题分析

### 问题 1：模型覆盖严重不足

**现状**：
- 当前实际可用模型约 20-30 个，取决于管理员手动配置了多少 provider 和凭证
- 支持 11 个 provider，但每个 provider 需要手动添加凭证和配置模型定价

**对标差距**：
- OpenRouter: 300+ 模型，60+ 供应商
- Vertex AI: 200+ 模型
- Together AI: 200+ 开源模型

**根因**：
- 每新增一个模型需要：① 确认 provider 支持 ② 配置凭证 ③ 配置定价 ④ 测试可用性
- 这是一个 O(n) 的人工流程，n = 模型数量

---

### 问题 2：定价管理混乱且有亏损风险

**现状**：
- 已有 LiteLLM 数据源同步机制（`model-registry.ts`），每 24 小时缓存
- 已有 bulk rate sync（`bulk-rate-sync.ts`），每 6 小时从 OpenRouter/官方定价页同步
- 漂移检测阈值 10%

**问题**：
- LiteLLM 社区数据可能有延迟或不准确
- 定价同步失败时无告警机制
- 存在"配错价格导致亏损"的历史问题（会议中老冒提到彭辉发现价格一塌糊涂）
- 没有自动化的价格健康检查和异常告警

**对标**：
- OpenRouter `/api/v1/models` API 提供实时准确的定价数据，且免费公开
- 这是 AIGNE Hub 已经在使用的数据源之一，但利用得不够充分

---

### 问题 3：新模型上线速度慢

**现状**：
- 新模型上线流程：人工发现 → 人工判断是否接入 → 人工配置 provider/凭证/定价 → 人工测试
- 完全依赖人的主动性和时间

**对标**：
- OpenRouter：与实验室合作，新模型首发同天上线
- HuggingFace：社区上传即可用
- 行业新模型发布频率：每周数个，热门模型（如 GPT、Claude、Gemini 新版）需要小时级响应

---

### 问题 4：API 中转带来的性能问题

**现状**：
- AIGNE Hub 作为中间层，增加了一跳网络延迟
- 会议中老冒提到"经常出现反应反馈慢，或 API 就是不 work 了，要 retry"

**分析**：
- 这不是架构本身的问题（OpenRouter 也是中间层），而是：
  - 错误处理和重试逻辑不够健壮
  - 缺乏对上游 provider 健康状态的实时监控
  - 故障检测和切换不够快（当前基于 failureCount 累计）
  - 代理层耦合了业务逻辑，增加了处理时间

---

### 问题 5：Model Selector 一直未落地

**现状**：
- 当前模型选择逻辑仅为基于 provider tier 的简单轮转
- 无基于任务类型、成本、延迟、质量的智能选择

**会议中的讨论**：
- Nate 明确指出："engine hub 最核心的价值的点就在于能够帮用户自动的去选择模型"
- 但这个能力一年来都未实现，而第三方已经有类似服务（如 Arena 评测平台）
- OpenRouter 已实现 Auto Router（自动为请求选择最合适的模型）

---

### 问题 6：团队聚焦不足

**会议中的讨论**：
- 鹏辉被安排做 Agent Hub 核心能力，但一直在做周边工作
- 被叫停后也没有回到核心功能上
- 这导致核心能力长期空转

**根因分析**：
- 业务逻辑和代理逻辑耦合，使得"改进核心能力"变成了"改动整个系统"，心智负担过重
- 缺乏明确的职责边界，容易偏移到"看起来有用但非核心"的工作上

---

## 三、解决方案

### 核心理念：极简代理 + 外置智能运维

```
旧定位：AIGNE Hub = API 中转站
         （代码里硬编码策略，手动接入模型，手动配价，业务逻辑和代理逻辑耦合）

新定位：AIGNE Hub = 极简计费代理 + 外置智能运维
         ┌────────────────────────────────┐
         │  AIGNE Hub Worker（代理层）      │
         │  - 数据代理                      │
         │  - 按用户计费                    │
         │  - 错误记录                      │
         │  - MCP 管理接口                  │
         │  - Status 页面                   │
         │  （不做任何"聪明"的决策）         │
         └───────────────┬────────────────┘
                         │ MCP (DID 授权)
         ┌───────────────▼────────────────┐
         │  Ops Blocklet（基于 AFS）        │
         │  - 确定性策略 (ash 脚本)          │
         │  - LLM 智能决策 (agent-run)       │
         │  - 自信度评分 + 分级审批         │
         │  - 策略可实时编辑                 │
         │  - 通过挂载访问所有数据源         │
         └────────────────────────────────┘
```

### 四大设计原则

1. **Worker 极简化**：只做代理、计费、错误记录、状态暴露。所有"需要聪明"的逻辑全部外置
2. **AFS 原生**：运维层基于 AFS 的 "everything is context" 理念，把 AIGNE Hub、外部数据源、监控、告警都挂载为文件系统
3. **确定性 + 智能混合**：规则明确的操作用 ash 脚本（零 LLM 成本），需要语义理解的用 agent-run（有自信度门控）
4. **策略即文件**：运维策略是可实时编辑的文件，而非代码交付物——改策略无需改代码、无需部署

---

### 阶段一：AIGNE Hub Worker 重构

#### 职责边界（极简原则）

| 必做 | 不做 |
|------|------|
| 接收请求 + 鉴权 | 定时任务 |
| 预扣费（Durable Objects） | 模型发现 |
| 路由转发到上游 provider | 定价同步 |
| 流式响应 + token 统计 | 错误分析 |
| 结算 + usage 日志 | 健康检测 |
| 错误捕获 + 结构化入库 | 复杂路由决策 |
| MCP 管理接口（admin 授权） | Admin UI |
| 只读 Status 页面 | 运维策略 |

#### 技术栈

- **Cloudflare Worker**：代理层运行时
- **D1**：Provider/模型/凭证/用量/错误/审计数据
- **Durable Objects**：用户余额强一致计费
- **R2**：冷日志归档
- **KV**：配置缓存

详细的 D1 schema、MCP tool 清单、Worker 目录结构等技术细节见：
[`aignehub-architecture-design.md`](./aignehub-architecture-design.md)

#### 核心技术决策

**1. 为什么要重构而不是渐进改造？**
- 现有代码的 Sequelize ORM、Express 中间件体系无法直接跑在 Worker 上
- 包体积和 CPU 时间限制要求必须精简
- 会议中老冒强调"AI 时代敢于重构，不要受限于原来的包袱"
- 保留现有代码的**设计经验**（pricing 表结构、usage 计算逻辑、credential 加密方案），但代码层面全新编写

**2. 为什么用 Durable Objects 做计费？**
- Worker 分布式无状态，并发扣费必然有竞态条件
- Durable Objects 提供单实例串行化，天然解决并发问题
- 每个用户一个 DO 实例，水平扩展能力不受影响
- OpenRouter 等 Cloudflare 原生平台的通用方案

**3. 为什么数据迁移独立做？**
- 新 Worker 可以用最优 schema，不背历史包袱
- 只迁移必需的数据：用户余额 + 加密凭证
- 不迁移的数据：历史 usage（→R2 冷存）、模型定价（→ Ops 首次运行全量刷新）、错误日志（新系统重新开始）
- 一次性脚本，不需要双写过渡期、不需要回滚机制、测试简单

---

### 阶段二：AIGNE Hub Ops Blocklet（基于 AFS）

#### 核心思想

把 AIGNE Hub 运维从"硬编码在服务里的逻辑"变为"可实时编辑的策略文件"。运维 Agent 本身就是 AIGNE 产品理念（AI 自动化）的最佳 dogfooding。

#### AFS 挂载结构

```
/services/aignehub/           ← AIGNE Hub MCP 挂载（可读写）
  ├─ models/  providers/  credentials/
  ├─ errors/  (事件源)
  ├─ metrics/
  └─ .actions/  (upsert-model / disable-model / ...)

/sources/                     ← 外部数据源（只读挂载）
  ├─ openrouter/models/
  ├─ litellm/prices/
  └─ providers/*/health/

/monitoring/                  ← 监控与告警
  ├─ slack/     (告警通道)
  └─ audit/     (运维操作留痕)

/blocklet/                    ← 策略文件（可实时编辑）
  ├─ scripts/   (*.ash 流水线)
  ├─ prompts/   (LLM 的 system prompt)
  └─ schemas/   (LLM 响应约束)

/data/config/                 ← 运行时配置（可实时调整）
  ├─ thresholds/
  ├─ auto_execute/
  └─ custom_rules.txt
```

#### 三类策略形态

| 形态 | 触发 | 用途 | 例子 |
|------|------|------|------|
| **纯确定性** | cron / event | 规则明确、无歧义 | 同步新模型、定时健康测试、价格漂移检测 |
| **LLM 智能** | event | 需要语义理解 | 错误根因分析、故障响应决策 |
| **混合** | cron / event | 大多数真实场景 | 确定性发现异常 → LLM 判断是否行动 → 确定性执行 |

#### 参考实现：telegram-assistant 模式

AFS 中的 `blocklets/telegram-assistant` 已经实现了一套完整的"自信度评分 + 分级审批"机制，AIGNE Hub Ops 直接照搬即可。核心模式：

```
事件触发 (on /services/aignehub:error)
  ↓
ash 预过滤 (where count >= 10)
  ↓
agent-run 分析 (返回 {decision, confidence, reason})
  ↓
门控判断 (where confidence >= threshold)
  ↓
  ┌────────────┴────────────┐
  自动执行                   人工审批
  ├─ 执行 action             ├─ 发 Slack 带按钮
  ├─ 写 audit                ├─ 等 /slack:callback
  └─ 通知 Slack              └─ route 到具体操作
```

#### 分级自动化策略

策略配置存在 `/data/config/thresholds/`，运行时可调：

| 操作 | 风险等级 | 自动执行阈值 | 低于阈值行为 |
|------|----------|--------------|--------------|
| 新模型上线 | 低 | confidence ≥ 70 | 60 分钟无反对后执行 |
| 价格微调 < 10% | 低 | confidence ≥ 75 | 30 分钟无反对后执行 |
| 模型禁用 | 中 | confidence ≥ 85 | Slack 按钮审批 |
| 价格调整 > 20% | 中 | confidence ≥ 90 | Slack 按钮审批 |
| 凭证轮换 | 高 | 不允许自动 | 必须管理员手动审批 |
| 删除资源 | 高 | 不允许自动 | 必须管理员手动审批 |

**所有自动执行的操作**：
- 写入 `/monitoring/audit/` 留痕
- 发 Slack 通知（记录执行结果 + 15 分钟内可 undo 的按钮）

详细的策略文件结构、ash 脚本骨架、prompt 模板见：
[`aignehub-architecture-design.md`](./aignehub-architecture-design.md)

---

### 阶段三：监控体系

#### 三层监控设计

```
对外                       对内                      团队告警
────────────────          ──────────────────        ──────────
Status 页（Worker 内置）    Ops 监控（AFS 挂载）       Slack 频道
- 各 provider 状态          - 实时请求量               - 故障告警
- 模型可用性                - P50/P99 延迟             - 定价变更
- 历史 uptime               - 成本 vs 计费对账          - 新模型上线
- 事件公告                  - 凭证健康                  - 待审批操作
```

**对外 Status 页**：
- 放在 AIGNE Hub Worker 里，HTML + JSON API
- 纯读 D1 预聚合表，无任何复杂逻辑
- 数据由 Ops Blocklet 定期聚合后通过 MCP 写入

**对内监控**：
- 基于 AFS `/monitoring/` 挂载
- Ops Blocklet 的 ash 脚本聚合数据
- 通过 AFS Explorer 直接查看

**Slack 集成**：
- 所有自动执行操作发通知
- 需要审批的操作发带按钮的消息
- 故障告警走专用频道

---

## 四、实施路径

### Phase 0：设计对齐（本周）
- [x] 问题分析与竞品调研
- [x] 架构方案定稿
- [ ] D1 schema 和 MCP tool 清单 review
- [ ] ash 脚本骨架 review

### Phase 1：Worker 核心重构（3-4 周）
- 最小可用版本：薄代理 + 计费（Durable Objects） + 基础监控
- 初期只支持 OpenRouter 作为后端 provider（验证端到端链路）
- D1 schema 建立
- 基础的 MCP 管理接口
- Status 页面

### Phase 2：MCP 管理接口完善（1-2 周）
- 暴露全套管理工具（模型/Provider/凭证/定价/日志/状态）
- DID-based 授权机制
- 审计日志

### Phase 3：Ops Blocklet 搭建（3-4 周）
- AFS 挂载结构建立
- 核心 ash 脚本：
  - `sync-models.ash`（新模型发现）
  - `drift-check.ash`（定价漂移）
  - `error-triage.ash`（错误分析）
  - `health-test.ash`（定时模型测试）
  - `slack-callback.ash`（审批回调）
- Prompt 和 schema 编写
- 分级审批机制打通

### Phase 4：监控与告警（2-3 周）
- 对外 Status 页美化 + 历史数据
- 对内 Dashboard（AFS Explorer 视图）
- Slack 告警集成

### Phase 5：数据迁移与切换（1 周）
- 一次性迁移脚本（余额 + 凭证）
- 灰度切换流量
- 观察 24-48 小时后完全切换
- 旧系统归档

**总工期预估**：10-14 周，部分可并行

---

## 五、核心理念总结

### 从"做一切"到"做减法"

```
  ┌────────────────────────────────────────────┐
  │       AIGNE Hub 新定位：极简 + 外置智能       │
  │                                            │
  │  AIGNE Hub Worker（做少）                   │
  │    ✓ 代理                                   │
  │    ✓ 计费                                   │
  │    ✓ 错误记录                               │
  │    ✓ MCP 管理接口                           │
  │    ✓ Status 页面                            │
  │                                            │
  │  Ops Blocklet（做聪明）                     │
  │    ✓ 确定性策略（ash）                      │
  │    ✓ LLM 决策（agent-run）                  │
  │    ✓ 自信度评分 + 分级审批                   │
  │    ✓ 实时可编辑策略                         │
  └────────────────────────────────────────────┘
```

**四条核心原则**：

1. **计费是护城河**——这是 OpenRouter、Vertex AI、Bedrock 都不提供的能力，必须把它做到极致
2. **模型覆盖靠借力**——不自己维护 300 个模型的接入，利用 OpenRouter 等聚合平台
3. **智能不在代理层**——Worker 不做任何"需要判断"的事，所有决策外置给运维 Agent
4. **策略即文件**——运维策略是可实时编辑的 ash 脚本和 prompt，不是代码

**为什么这个方案能成立**：

- 符合会议中老冒提出的三大约束（计费、模型自动化、降低运维成本）
- 符合 AI 时代的架构哲学（薄代理 + 智能外置）
- 是 AIGNE 和 AFS 产品的 dogfooding（用自家产品运维自家服务）
- 直接照搬 telegram-assistant 已验证的审批机制
- 与 ArcBlock 整体技术栈（DID、Blocklet、AFS）天然融合
- 数据迁移独立化，降低重构风险

**下一步**：参见架构设计文档 [`aignehub-architecture-design.md`](./aignehub-architecture-design.md) 了解具体的技术细节和代码骨架。
