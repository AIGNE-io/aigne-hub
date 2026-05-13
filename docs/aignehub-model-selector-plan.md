# Model Selector 方案

> 2026-04-09 · AFS 层的能力，使用 AIGNE Hub 提供的模型 metadata
> 关联文档：[`aignehub-refactor-plan.md`](./aignehub-refactor-plan.md)、[`aignehub-platform-analysis.md`](./aignehub-platform-analysis.md)

## 结论

Model Selector 属于 AFS，不属于 AIGNE Hub。它是 AFS 设备层的一个能力，作用是根据用户的意图（Policy）自动选出合适的模型，用户不需要关心具体模型名。

Hub 和 Selector 的关系是**存储与消费**：

- **Hub 是模型 metadata 的存储**（capability、价格、性能指标、benchmark 分数），通过 MCP 对外暴露读写
- **Selector 消费 metadata 做运行时选择**，也负责跑 benchmark 把结果写回 Hub

这两件事分开的好处：Hub 保持极简不引入选择逻辑；Selector 可以跟着 AFS 演进而不受 Hub 部署节奏影响；同一份 metadata 可以被 AFS 的其他能力复用。

本方案的起点是老冒 2026-02-04 给出的 Hub/Model/Policy/Route 四层设计，核心原则是**选择逻辑完全静态、不需要 LLM**——用规则引擎根据 Policy 和 Capacity 做匹配。

---

## 背景

### 2026-02-04 的原始设计

老冒当天在分享 Memory 调试方法论时阐述了完整的 Model Selector 架构：

```
Device Tree
  ├─ Hub (OpenAI / Agent Hub / OpenRouter，任何提供多个模型的都是 Hub)
  │    └─ Model (抽象名，带 capacity + price + features metadata)
  ├─ Policy (fast / cheap / powerful / balanced / coding / ...)
  └─ Route (根据 Policy 和 Model capacity 做静态匹配)
```

核心洞察是**静态路由**：

> "原先我们心想要有一个叫 model selector model（用 LLM 做选择），现在想，其实这个东西根本不是动态选择的，完全是一个静态的，就不需要通过大语言模型。你选这个东西，这些东西都是静态就可以帮你做的。"

用户视角是声明意图而非指定模型：

> "用户以后他其实要用我们这个 AOS 根本永远不需要真正的去关注说我下面用的是 gpt5 还是用的是 gemini，我要的就是我要一个 fast cheap 还能够写 code 的代码，他就给你选出一个模型出来给你。"

### 为什么过去一年没落地

两个月后（2026-04-09）这套设计仍然"是一个牛皮"。根本原因不是设计不清晰，而是三个结构性问题：

**一，职责层级没对齐。** Feb 04 的设计中 Model Selector 在 Device Tree 层，Hub 只负责暴露 metadata。但团队一直把它理解成"Hub 需要做的事"，导致鹏飞既不知道从哪下手也没动力下手。

**二，Metadata 源缺失。** 设计假设"从 model 节点拿到 capacity"，但 Hub 自己连结构化的 capability 都没有，更没有性能 benchmark 数据。选择算法需要的输入数据不存在。

**三，Policy 颗粒度没深入。** 叶超当时就提出过"fast 只管消耗，没管是否支持图像、多模态"等约束该怎么表达，老冒回答"在 metadata 里"但没有说 Policy 怎么承接这些细粒度约束。

### 行业已经做到的

**OpenRouter** 的 `/api/v1/models` 提供完整 metadata（context length、多维度 pricing、supported parameters、architecture）。Auto Router 功能可以自动为请求选模型。

**LiteLLM** 社区维护 model capability 和定价数据库。

**Cloud Arena** 类第三方做跨模型评估，输出质量分数 metadata。

这三个来源都能直接用，Hub 不需要自建 metadata 采集，Selector 也不需要自己爬定价。

---

## 定位

Model Selector 是 AFS 的一部分，和 Hub 之间是明确的三种交互：

**读 metadata**。Selector 通过 Hub 的 MCP 接口查询模型列表、capability、定价、benchmark 分数。运行时选择时就是在这些数据上做规则匹配。

**写 benchmark**。Selector 周期性跑 benchmark（延迟、成功率、质量评估），把结果通过 MCP 写回 Hub 的 models 表。Hub 不自己产生这类数据，完全由 Selector 维护。

**发请求**。Selector 选定模型后，把请求发给 Hub（带具体的 model 参数），Hub 按正常流程代理、计费、记录。

```
应用
  │
  │ LLM 请求带 Policy（例如 "fast+cheap+coding"）
  ▼
┌──────────────────────┐
│  AFS Model Selector  │
│                      │           ┌──────────────┐
│  1. 查 metadata      │ ── MCP ──→│ AIGNE Hub    │
│  2. 规则匹配出具体 model│ ← metadata │ (models 表)  │
│  3. 发请求            │           │              │
│                      │──请求───→│ 代理上游      │
│                      │←响应────│              │
└──────────────────────┘           └──────────────┘
           ▲                              ▲
           │                              │
           │ 周期性跑 benchmark            │
           └──────── 写回 benchmark ──MCP ─┘
```

Selector 不是 Hub 的模块，也不是 Ops Blocklet 的一部分。它和 Ops Blocklet 并列，都是 AFS 应用，都通过 MCP 和 Hub 通信，但职责不重叠：

- **Ops Blocklet** 做运维（发现新模型、同步定价、错误归类、健康探测）
- **Model Selector** 做选择（按 Policy 匹配、benchmark、质量评估）

两者在 health-test 这里会有轻微重叠，分工如下：

- Ops 的 `health-test`：只管"这个模型是否可达"（heartbeat）
- Selector 的 benchmark：管"这个模型在某任务上表现如何"（quality + latency ranking）

---

## 数据模型

### Hub 侧扩展：Models 表的 metadata 字段

Hub 的 models 表需要容纳 Selector 所需的全部 metadata。已有的字段（input_rate、output_rate、上下文长度、废弃标记）继续用，新增以下几类：

**Capability**（结构化能力描述）：
- `modality`：输入输出模态（`text → text`、`text+image → text`、`text → image` 等）
- `max_input_tokens` / `max_output_tokens`
- `supports_tools` / `supports_vision` / `supports_thinking` / `supports_streaming` / `supports_json_mode`
- `quantization`：精度（fp16 / fp8 / int4 等，对开源模型有意义）

**Performance**（由 Selector benchmark 写入）：
- `p50_ttfb_ms` / `p99_ttfb_ms`：首 token 延迟
- `p50_throughput` / `p99_throughput`：tokens/秒
- `success_rate_1h` / `success_rate_24h` / `success_rate_7d`
- `last_benchmarked_at`

**Quality**（由 Selector 写入，来源可以是内部评估或外部 metadata）：
- `quality_scores`：按任务类型分桶（`coding` / `reasoning` / `writing` / `vision` 等）
- `quality_source`：`internal_benchmark` / `arena` / `manual`

这些字段都作为 models 表的一部分存储。Hub 不加工这些数据，只存和读。

### Selector 侧：Policy 和 Route

Policy 是用户意图的声明，Route 是规则引擎。两者都定义在 AFS 里，可以被用户通过编辑文件实时调整。

**Policy 的结构**。Feb 04 提的 fast/cheap/powerful/balanced/coding 是**预设 Policy**，但叶超提的约束（是否支持图片、是否支持 tools）是**硬约束**，这两类应该分开。

概念上 Policy 有三层：

- **Preferences**（偏好，软约束，影响排序）：比如优先快、优先便宜、优先质量
- **Requirements**（需求，硬约束，不满足就淘汰）：比如必须支持 vision、必须支持 tools、上下文至少 128k
- **Exclusions**（排除）：比如不使用 deprecated 模型、不使用某些 provider、不使用 ops 专用模型

表达形式可以是结构化的对象，也可以是紧凑字符串（`"fast+cheap+coding,require:vision+tools,min_context:128k"`）。建议先支持结构化对象，字符串形式作为糖。

预设 Policy 是常用组合的命名，比如 `coding` 实际展开是 `{preferences: ['quality'], requirements: [supports_tools, supports_streaming]}`。这些预设存在 AFS 的 Policy 定义文件里，可以扩展。

**Route 的结构**。Route 是从 Policy 到具体 model 的匹配规则。定义形式是一条可执行的流水线：

```
给定 Policy、当前可用 Models 列表：

1. 应用 Exclusions → 过滤掉被排除的模型
2. 应用 Requirements → 过滤掉不满足硬约束的模型
3. 应用 Preferences → 对剩余模型打分排序
4. 选 top-N（N=1 时直接选定，N>1 时可以加随机或轮转）
```

排序的 scoring 函数是**静态规则**，不涉及 LLM。例如：
- `fast` → 按 `p50_ttfb_ms` 升序
- `cheap` → 按加权价格（`input_rate × 0.3 + output_rate × 0.7`）升序
- `powerful` → 按 `quality_scores.general` 降序
- `balanced` → 归一化后加权求和
- 组合诉求用多目标加权，每个维度有默认权重，可在 AFS 配置中覆盖

---

## 与 AIGNE Hub 的 MCP 接口

Hub 需要提供几个 Selector 专用的 MCP 接口（也可以被其他消费者使用，不是独占）：

| 接口 | 用途 |
|---|---|
| `query_models(filter)` | 按 modality、capability、status 过滤返回模型列表 |
| `get_model_metadata(id)` | 返回单个模型的完整 metadata |
| `update_benchmark(id, metrics)` | 写入性能和质量 benchmark 数据 |
| `bulk_update_benchmarks(records)` | 批量写入（避免 N 次 MCP 往返） |

这些接口的授权走和 Ops Agent 一样的 DID 签名机制。Selector 的 DID 登记为 `ops_agent` 级别，不允许它做模型禁用、凭证轮换等高危操作——它只能读 metadata 和写 benchmark。

---

## Benchmark 机制

Selector 需要周期性跑 benchmark 来维护 performance 和 quality 数据。这件事的实现基于 AFS 的 ash 和 agent-run。

### 数据来源

**外部 metadata**（直接拿）：
- OpenRouter `/api/v1/models` 的 pricing、context length、supported parameters、architecture
- LiteLLM 的 capability 数据
- Cloud Arena 等第三方的质量评分

**内部 benchmark**（自己跑）：
- 从 Hub 的 usage 数据统计实际 P50/P99 延迟和成功率（后验数据）
- 对每个模型发送标准化的测试集（先验测试）

### 外部 metadata 同步

这一步可以和 Ops Blocklet 的 `sync-models` 共享数据：Ops 拉 OpenRouter 模型目录做"发现新模型"，Selector 拉同一份数据做"更新 capability 和价格"。实际上可以让 Ops 的 `sync-models` 把完整数据写入 Hub，Selector 直接查 Hub 就行——不需要 Selector 也去拉一次。

这把 AFS 中 `/sources/openrouter/` 的消费者从"Ops + Selector"简化为"Ops"。Selector 只消费 Hub 里的数据。

### 内部 benchmark

**后验统计**从 Hub 的 usage 和 model_calls 表取数据，定期聚合。这类数据是免费的——用户的正常请求已经贡献了样本。Selector 只需要一个 ash 脚本周期性查 Hub 的 `get_metrics` 接口，拉出各模型的 P50/P99 延迟、成功率、吞吐，写回 benchmark。

**先验测试**需要真实发请求，有成本。设计上有几个考虑：

- 用 `X-Ops-Bypass` 标记走 ops 专用凭证池，不占用户余额
- 测试集要小（标准化的 coding / reasoning / writing 各几个 prompt），避免成本爆炸
- 对每个模型的每个测试集任务跑少量（例如 3 次）取平均
- 频率不需要太高，新模型上线后集中跑一轮，之后每周一次或每月一次

质量评估可以分两类：

- **客观可判定**的任务：代码能否运行、数学答案是否正确、格式是否符合 schema。这类任务由 ash 脚本直接判定，零 LLM 成本。
- **主观评估**的任务：回答是否清晰、创意是否好。这类任务用 LLM-as-judge，让一个高质量模型（比如直连的 Claude Opus，通过 ops 凭证池）对答案打分。

这个机制和 telegram-assistant 的 `agent-run` 模式一致：结构化 schema 约束输出（`{score: 0-100, reason}`），ash 负责编排和写回。

### 写回 Hub

跑完 benchmark 后，Selector 通过 `update_benchmark` 或 `bulk_update_benchmarks` 接口写回 Hub 的 models 表。写入时带上 `quality_source` 标记，便于审计和判断数据来源。

---

## 选择算法

运行时的选择路径要快——用户的每次请求都会经过这里。

**输入**：
- Policy（来自请求、应用配置、或用户配置的默认值）
- 当前可用的 models 列表（从 Hub 查，或 Selector 本地缓存）

**输出**：
- 一个具体的 model ID（或带优先级的候选列表，用于失败回退）

**算法流程**：

```
可用 models 列表
  │
  ├─ 过滤 1: exclusions (deprecated / excluded providers)
  ├─ 过滤 2: requirements (必须支持的 capability)
  │
  ▼
候选集（通常 3-20 个模型）
  │
  ├─ 打分: 按 preferences 的多目标加权
  │
  ▼
排序后的候选列表
  │
  └─ 选 top-1 作为本次请求的目标
     top-2 到 top-K 作为失败回退列表
```

整个过程是确定性的，**没有 LLM 调用**。只要 Policy 和 metadata 不变，同一个请求永远选到同一个模型。这带来的好处是：

- 可缓存：Policy → model 的映射可以在 Selector 本地缓存
- 可预测：运维可以预演某个 Policy 会选中哪个模型
- 可测试：规则引擎可以完全单元测试覆盖
- 零额外延迟：不增加 LLM 调用成本

### 缓存和失效

Selector 本地可以缓存两层：

- **Metadata 缓存**：从 Hub 拉的模型 metadata，短 TTL（分钟级），或者通过 AFS 事件订阅 Hub 的 metadata 变更
- **Policy → model 映射缓存**：对常见 Policy 缓存选择结果，更短 TTL 或事件驱动失效

当 Hub 通过 MCP 更新 benchmark 数据时，Selector 应该收到失效通知并刷新缓存。这依赖 AFS 的事件订阅能力。

### 失败回退

当 top-1 模型调用失败时，Selector 用候选列表的 top-2 重试（或让调用方拿到列表自己决定）。如果所有候选都失败，返回错误。

回退策略不是"在 Hub 里做复杂重试"，而是"Selector 把候选列表给出来，调用方按顺序试"。这让 Hub 保持简单。

---

## 与 Ops Blocklet 的分工

两者都是 AFS 应用，都通过 MCP 操作 Hub，但职责不重叠：

| 职责 | Ops Blocklet | Model Selector |
|---|---|---|
| 发现新模型 | ✓ | — |
| 同步 pricing 和 capability | ✓ | —（消费 Hub 里的数据） |
| 检测定价漂移 | ✓ | — |
| 错误归类和自动禁用 | ✓ | — |
| 心跳 / 可达性探测 | ✓ | — |
| 性能 benchmark（延迟、吞吐） | — | ✓ |
| 质量 benchmark（coding、reasoning） | — | ✓ |
| 写回 metadata | — | ✓ |
| 运行时选择模型 | — | ✓ |
| 通过 Policy 响应应用请求 | — | ✓ |

两者的输入数据都来自 Hub，输出数据都写回 Hub。Hub 作为双方共同的 metadata 存储。

**协作场景**。新模型上线后：
1. Ops 的 `sync-models` 发现并写入 Hub（capability、price、basic metadata）
2. Selector 的事件订阅感知到新模型，触发一次 benchmark
3. Selector 跑完 benchmark 后写回 performance 和 quality 分数
4. 之后的运行时选择就能把这个新模型纳入候选

---

## Policy 的颗粒度问题

这是 Feb 04 讨论留下的问题，需要在落地前定清楚。

### Preset + Freeform 混合

提供一套预设 Policy 应对常见场景：

| 预设 | 展开 |
|---|---|
| `fast` | preferences: [latency], 按 p50_ttfb 升序 |
| `cheap` | preferences: [cost], 按加权价格升序 |
| `powerful` | preferences: [quality], 按 quality.general 降序 |
| `balanced` | preferences: [quality, cost, latency]，归一化加权 |
| `coding` | preferences: [quality], requirements: [supports_tools], quality 维度用 quality.coding |
| `vision` | preferences: [quality], requirements: [modality includes image] |
| `long-context` | preferences: [quality], requirements: [max_input ≥ 128k] |

Freeform 允许应用组合预设或直接传完整的 Policy 对象：

```
{
  "preferences": [{"type": "cost", "weight": 0.7}, {"type": "quality.coding", "weight": 0.3}],
  "requirements": [{"supports_tools": true}, {"max_input_tokens": ">=64k"}],
  "exclusions": ["openai/gpt-3.5-turbo", "provider:poe"]
}
```

### Policy 的来源

按优先级从高到低：
1. 请求里显式传的 Policy
2. 应用注册时绑定的默认 Policy
3. 用户账户级别的默认 Policy
4. 系统默认（`balanced`）

---

## 开放问题

**Metadata 采集的边界**。LiteLLM 的 capability 数据和 OpenRouter 的 metadata 有重叠，可能冲突。以谁为准？建议 OpenRouter 优先（更实时），LiteLLM 做 fallback 和补充。

**质量评分的冷启动**。新模型刚上线时还没有 benchmark 数据，按 Policy 排序时怎么处理？建议：给未 benchmark 过的模型一个中间值（例如全部分数 50/100），同时触发一次 benchmark；benchmark 完成前这些模型不参与 `powerful` 类 Policy 的匹配。

**主观质量评估的成本控制**。LLM-as-judge 跑得越多越准，但成本也越高。需要定一个预算（例如每月 benchmark 成本不超过某个上限），由 Ops 的 `cost-audit` 监控。

**Policy 的版本管理**。预设 Policy 和 Route 规则会演进，是否需要版本化？建议作为 AFS 中的文件直接 Git 化，变更走 review 流程。

**和 Hub 的 provider rotation 的关系**。Hub 自己有基于 failureCount 的简单轮转逻辑。Selector 选定模型后是否绕过这个轮转？建议保留 Hub 的轮转作为 provider 层面的简单 fallback，Selector 只决定 model，具体 provider 由 Hub 在多个可用 provider 间选。

**冷启动 benchmark 的种子数据**。第一次跑时没有历史样本，建议先用 OpenRouter 和 LiteLLM 的 metadata 填充基础字段，然后手工设定几个 preset 的首批模型，之后逐步用 benchmark 数据替换。

**谁来做**。从 Feb 04 到现在这个问题悬而未决。本方案把它定位为 AFS 能力后，实施路径上可以由负责 AFS 的同学推进，不必再绑定到 Hub 团队。

---

## 历史讨论索引

完整的原始讨论上下文保留在以下会议记录中。如果对设计意图有疑问，可以回溯这些原文。

- **2026-02-04**（原始设计）：`~/Projects/aigne-daily-sync/202602/04/summary.md` §二 / `transcript.txt` 行 233-267
- **2026-02-25**（外部 VC 验证）：`~/Projects/aigne-daily-sync/202602/25/transcript.txt` 行 677-679
- **2026-03-23**（Nate 批评 + Master Plan）：`~/Projects/aigne-daily-sync/202603/23/transcript.txt` 行 569-597
- **2026-04-02**（AI Device default 路由）：`~/Projects/aigne-daily-sync/202604/02/transcript.txt` 行 135-139
- **2026-04-09**（爆发 + Arena 对比）：`~/Projects/aigne-daily-sync/202604/09/transcript.txt` 行 259-267

几个关键引用：

> "原先我们心想要有一个叫 model selector model，现在想，其实这个东西根本不是动态选择的，完全是一个静态的。"
> —— 老冒 2026-02-04

> "Agent Hub 为什么能火，因为它是我们路由选择的 gateway，模型越多越强，自动选择最保证的越强。"
> —— S6Z partner 2026-02-25（老冒转述）

> "Hub 自己的价值，能够自动的去帮用户选择模型，这是 Hub 存在的意义，从 Hub 到现在其实都还没有 touch 那一块就根本就没做。"
> —— Nate 2026-03-23

> "这东西都资金都是个吹的牛，Agent Hub 一年之前就这样想了 model sector，这是一个很可怕的事情。"
> —— 老冒 2026-04-09
