# AIGNE Hub 智能模型选择 - 会议讨论汇总

> 生成日期：2026-04-09
> 目的：汇总 AIGNE Daily Sync 中所有关于"智能模型选择 / Model Selector"的讨论，为下一步深度分析提供原始依据

---

## 关键发现速览

经过对 2026-01 至 2026-04 所有会议记录的检索，可以得出三个核心结论：

1. **设计早就有**——老冒在 **2026-02-04** 提出了完整的 Model Selector 架构（基于 Capacity / Policy / Route 的静态路由模型），这个设计清晰、可落地
2. **方向被外部验证**——**2026-02-25** 外部 VC（S6Z partner）独立得出了相同结论："Agent Hub 为什么能火，因为它是路由选择的 gateway，模型越多越强，自动选择越强，所以 Agent Hub 有价值"
3. **至今未落地**——**2026-03-23** Nate 直接指出"从 Hub 到现在其实都还没有 touch 那一块就根本就没做"；**2026-04-09** 老冒与 Google 会面后爆发："model sector 资金都是一个牛皮，这是一个很可怕的事情"

**这说明下一步分析的核心问题不是"应该怎么设计"，而是"为什么设计没落地、应该怎么强制落地"。**

---

## 一、设计源头：2026-02-04 老冒提出的完整架构

这是所有讨论中**最重要的一天**。老冒在分享 Memory 调试方法论时，顺带阐述了他心目中 Model Selector 的完整架构。

### 架构层级

```
Device Tree
  └─ Hub（OpenAI / Agent Hub / OpenRouter，任何能提供多个模型的都是 Hub）
      └─ Model（抽象名，不管来自哪个 hub）
          ├─ metadata（capability、价格、特性）
          └─ ... 
  
  Policy（fast / cheap / powerful / balanced / coding / 未来: privacy ...）
  
  Route（可任意定义）
      └─ 根据 Policy 和 Model capacity 自动匹配最优模型
```

### 老冒原话（transcript 行 239-267）

> **关于 Hub 的定义**：
> "这个 hub 现在我把比如 openai 将来可是 hub 因为它只要是能够提供多个模型都是 hub，对吧。OPEN AI、agent、这个 open router 只要他们愿意，只要我们愿意支持他，这都可以算是一种 hub，现在我们只是一种 hub。但 model 这个东西其实是一个抽象的名字，这个就不管你从哪个 hub 来，这都是 model 的。"

> **关于 model metadata**：
> "这个 model 里面不是一个 tool，也不是...将来这个地方现在这里面说这个 model 是谁叫什么名字，将来这个里面这个 model 打开的，就它的 capacity 的数据，我们就从这边就可以拿到。**包括它的价格，什么东西都可以从那拿到**。"

> **关于 Policy**：
> "然后重要的一点就是在我这个心里，我在这个大型模型这边，我定义了一个叫 policy policy，就是你看这边从名字就可以看到它叫 **fast、cheap、powerful、balanced、coding**，你将来有可能我这边还会有更多的。因为这个 policy 下面就是定义的，就是我为了能完成这种类型的这种 capacity 的这个特征是什么。"

> **关于 Route**：
> "然后最后还有一个 route 就是路由，就是我为了我要找这个 policy，这整个就是一个...你今天如果打开这个 road fast，它里面就会指向，比如说就它就会指向这边的一个，比如说这个 sonnet 就指向；一弄一个 cheap，它就会指向，比如说 gpt4.1 mini。"

> **关于用户视角**：
> "**用户以后，他其实要用我们这个 AOS 根本永远不需要真正的去关注说我下面用的是 gpt5 还是用的是 gemini，他，我要的就是我要一个 fast cheap 还能够写 code 的代码 fast code cheap，他就给你选出一个模型出来给你**。"

> **关于动态 vs 静态**：
> "所以原先我们心想要有一个叫 model selector model，现在想，**其实这个东西也不根本不是动态选择的这个东西就完全是一个静态的，就不需要通过大语言模型**。你选这个东西，这些东西都是静态就可以帮你做的。"

### 叶超的质疑和老冒的回答（transcript 行 259-267）

叶超提出了一个关键问题：

> **李叶超**：那个 root 里面的这个索引可能还有一些问题，比如说 fast 它只分了这个模型的就消耗，但是模型的能力，比如说一个模型，它是否支持图片输入是否支持多模态输出...

> **老冒**：这在 model 里面，在 model 的 metadata 里面...它的规则就是说 root 是可以任意定义的...**root 就是根据 policy 这个和模型的 capacity 去帮你去找到一条，就是说通过 policy 去找到它应该用哪个 model**。route 你可以任意 route 是一个可以任意定义的东西，这个 policy 也可以任意定义，然后这个 model 这个东西是必须要能够返回正确的这个 capacity，否则它上面就没法去选择这个 root 就没法去选择。

### Summary 中的记录（202602/04/summary.md §二）

> **Model Selector 与 Policy 路由**
> - AOS 中的模型选择完全基于 **Capacity** 而非模型名称：
>   - Device Tree 中定义了 Hub（如 OpenAI、Agent Hub）→ Model → Policy → Route
>   - Policy 类型：fast、cheap、powerful、balanced、coding 等
>   - Route 根据 Policy 和 Model Capacity 自动匹配最优模型
> - 用户只需声明需求（如 "fast + cheap + code"），系统自动选出模型
> - 未来可扩展 privacy 等更多维度
> - 当 AFS Tool metadata 就绪后，将全面测试 Tool 选择的准确率，目标 > 90%

### 设计要点提炼

| 要点 | 说明 |
|------|------|
| **Hub 是个抽象概念** | 任何提供多个模型的东西都是 Hub（OpenAI、OpenRouter、Agent Hub 都是 Hub） |
| **Model 是个抽象名** | 不管来自哪个 Hub，对外都是一个 model 节点 |
| **Model metadata 必须完整** | capacity、价格、特性（是否支持图像/tools/vision 等）都必须在 metadata 里 |
| **Policy 是用户意图的声明** | fast / cheap / powerful / balanced / coding / privacy 等 |
| **Route 是规则引擎** | 根据 Policy + Model capacity 静态匹配 |
| **选择是静态的，不是 LLM 动态决策** | 这是老冒的关键洞察——选择逻辑完全是规则，不需要 LLM 参与 |
| **用户不需要知道模型名** | 只声明需求，系统负责落到具体 model |

---

## 二、外部验证：2026-02-25 VC 独立得出相同结论

老冒用 AI 工具分析了一个 S6Z partner（angel 陈）的 Twitter，对方提出了一个 filter："如果 base model quality 在 1.5 年内增长 10x，你这个产品还有没有意义？" 然后用这个 filter 审视 ArcBlock 的产品矩阵。

### VC 对 Agent Hub 的判断（transcript 行 679）

老冒转述对方的分析：

> "AFS 为什么能活得下来？是模型无关的抽象路由和管理力不是 AI 本身。如果 10X 以后会怎么样？**10X 更多的模型选择更有价值**，是吧，**Agent Hub 为什么能火，因为它是我们路由选择的 gateway，模型越多越强，自动选择最保证的越强，所以 Agent Hub 有价值**。"

对比之下，VC 判断其他产品的命运：
- **DocSmith**：会死。"thin wrapper，Cloud Code 已经能做到 80% 了"
- **Agent Studio**（no code AI 的壳）：和 2024 年差不多
- **Agent Framework**：模型越好，越不需要框架
- **DID**：和 AI 模型无关，根本不受影响

**Agent Hub 的核心价值被外部独立验证——它是 ArcBlock 产品矩阵中为数不多能在模型能力 10x 之后仍然有价值的产品，前提是它真的做成"自动路由选择的 gateway"**。

---

## 三、2026-03-23：第一次明确批评"核心工作没做"

老冒决定写 Master Plan，Nate 提出了团队的核心矛盾：鹏飞（Agent Hub 的负责人）一直在做周边工作，从未碰核心能力。

### Nate 的话（transcript 行 577）

> "就如果有一个很清晰的，**我们就是要实现 Hub 自己的价值，能够自动的去帮用户选择模型，这是我们的 Hub 存在的意义，从 Hub 到现在其实都还没有 touch 那一块就根本就没做**！"

### 老冒的回应（transcript 行 569-597）

> "对就很危险..."

> "你根本不是要把原来的东西照搬，而是需要去思考。原来什么东西是有用的，什么东西是没有用的..."

> "所以这个地方就鹏飞，所以需要最第一时刻的就是先迅速...这个地方鹏飞那个地方我们需要让他尽快干最核心的事情。"

### Summary 中的决策

从 2026-03-23 开始，老冒启动 Master Plan 机制：
- Master Plan 统一记录团队目标
- 每个人的工作对照 Master Plan 检查是否一致
- 目的是防止"大家都在忙着找一个活让自己显得在干活"

---

## 四、2026-04-01：确认 Agent Hub 盈利模式

这一天的会议明确了 Agent Hub 的商业定位。

### Summary 中的关键决策

> "**Agent Hub 盈利模式** — 借鉴 API 中转站模式，聚合多种模型，实现高利润率"

这是一个战略层面的确认：Agent Hub 的商业价值来自**聚合 + 分账**，而实现这一点的前提就是"自动选择模型"。

---

## 五、2026-04-02：AI Device 层的 default 路由发布

这是一个关键但被忽视的转折点。**老冒自己在 AI Device 层实现了 default 路由**，而不是等 Agent Hub 团队来做。

### 老冒原话（transcript 行 137）

> "那你就要破我最新的版本，**确保要用那个 default 的那个路由，我这个 default 路由现在这边就是说大家改进一下**...因为用用 foundation model 有非常大的好处，就是不要钱嘛。"

### Nate 的解读（transcript 行 135）

> "其实那个 foundation 只是一个 option 嘛，其实它可以因为最终其实在 FS 上去...**它其实可以挂在 hub 也可以本地的，或者就其他的模型都可以。就只是一个提供 AI 能力的地方**，所以我会把它先把这个架子搭出来，然后你后面继续往里面加上本地的来调。"

### 关键观察

**2026-02-04 的设计在 AI Device 层（老冒自己的代码）已经实现了，但 Agent Hub 层没有**。这是一个严重的错位：
- AI Device 知道 default 路由怎么走
- Foundation Model（本地）作为优选
- Hub 作为 fallback
- 但 Hub 自己没有内部路由能力，只是一个普通的 API 代理

这意味着：**老冒心目中的 Model Selector 一部分在 Device 层实现了，但 Hub 层的那部分（用 policy/metadata 在多个 hub-provided 模型之间选择）至今是空白**。

---

## 六、2026-04-09：全面爆发

这是老冒最严厉的一次批评，也是最接近会议结论的一天。完整上下文在 `/Users/chao/Projects/aigne-daily-sync/202604/09/transcript.txt`，已在之前的分析中详细引用过。

### 关键原话（transcript 行 259-267）

**老冒**：
> "**这个我们能上面提供这种更好的 metadata 帮助我们选择模型，这东西都资金都是个吹的牛，这是 Agent Hub，这 Agent Hub 一年之前就这样想了 model sector 这资金都是一个牛，都是牛皮，你知道吗？这是一个很可怕的事情**。"

**老冒关于 Arena**：
> "但是最近那些什么，比如我前阵子就看到另外一个第三方的公司，他就专门做了一个对于 open cloud 用的一个 API 用的一个 model selector。他叫 cloud 什么什么 arena，就它就是个第三方服务。**这个 arena 的目的就是让不同的让各种 cloud 去在那边去评估哪一个模型更好，哪个模型更省钱，哪个模型效率更高？然后他就提供出 metadata 了**。我一看这玩意，这个东西就变成什么，就变成就人家。我们吹的很牛的这种自己觉得很好的这个东西人家都已经实现了用另外一种方法都实现了，我们还只是停留在一个空吹牛的状态。"

**Nate 补充**：
> "对当时不是就停下来，让他说是和老冒开会的时候，不是也说了嘛，就是 **engine hub 最核心的价值的点就在于能够帮用户自动的去选择模型，提供这些 metadata 给 FS 来知道，就我这次调用我用哪个模型好**。"

**老冒对 Master Plan 的绝望**：
> "因为这个 master plan 这玩意我看就没人去用它，就没人去真正的去当回事嘛，就没有人去，所以大家都还在忙着找找一个活，让自己显得在干活，这样是不行的。"

### 2026-04-09 的新输入

这一天还有一个关键新信息：Google 的 Vertex AI 已经提供 200-300 个模型，这让老冒意识到**外部世界的速度已经远远超过了 Agent Hub 的人工配置模式**，必须做到 "fully automatic"。

---

## 七、时间线总结

```
2026-02-04  ◉ 老冒提出完整 Model Selector 架构
            │  - Hub/Model/Policy/Route 四层
            │  - 基于 Capacity 而非模型名
            │  - Policy: fast/cheap/powerful/balanced/coding
            │  - 静态规则，不是 LLM 决策
            │
2026-02-25  ◉ S6Z partner 独立验证方向正确
            │  "Agent Hub 为什么能火，因为它是路由选择的 gateway"
            │
            │  （将近一个月没有实质进展）
            │
2026-03-23  ◉ Nate 第一次明确批评："Hub 核心价值一直没 touch"
            │  老冒启动 Master Plan 机制
            │  鹏飞被点名但继续做周边工作
            │
2026-04-01  ◉ 会议明确 Agent Hub 商业模式
            │  "API 中转站模式，聚合多种模型，实现高利润率"
            │
2026-04-02  ◉ 老冒自己在 AI Device 层实现了 default 路由
            │  （即 Feb 04 设计的一部分）
            │  但 Hub 层的 policy/metadata 路由依然空白
            │
2026-04-09  ◉ 全面爆发
               - Google Vertex AI 200+ 模型的冲击
               - "model sector 资金都是一个吹的牛"
               - 第三方 Arena 已经做到了 metadata 评估
               - Master Plan 机制也失效了
```

---

## 八、核心矛盾分析

通过梳理所有讨论，发现了几个深层矛盾：

### 矛盾 1：设计完整但实施滞后

**2026-02-04 的设计已经非常完整**：
- 层级清晰（Hub → Model → Policy → Route）
- 判据明确（Capacity，静态规则）
- 用户视角清晰（只声明需求，不关心模型名）
- 可扩展性明确（未来加 privacy 等维度）

但从 2026-02-04 到 2026-04-09 的两个月里，Agent Hub 层面**零进展**。这不是"设计不清晰"的问题，是"谁来做 + 怎么让做的事情真的被做"的问题。

### 矛盾 2：两层架构的错位

```
AI Device 层：老冒做的 default 路由          ← 已实现
    ↓                                         ↓
Hub 层：基于 Policy + Capacity 的路由         ← 缺失
    ↓                                         ↓
Provider 层：OpenRouter 等                    ← 现有能力
```

Device 层和 Provider 层都有路由能力，**偏偏中间的 Hub 层空着**。这导致：
- 上层用户无法通过 Policy 访问模型
- 下层 Provider 的全部模型无法被自动筛选
- Hub 退化成纯 API 代理，失去差异化

### 矛盾 3：人工配置 vs 全自动化

- **老冒的要求**：fully automatic，不能靠人配置
- **现状**：每个新模型都需要人工配置 provider / 凭证 / 定价 / 测试
- **行业标准**：OpenRouter 自动同步 300+ 模型、价格实时更新

**即使 Feb 04 的 Policy/Route 机制做出来了**，如果底层的 Model metadata 还是人工维护，"自动选择"也是假的——因为可选范围本身就是人工维护的一个小池子。

### 矛盾 4：Metadata 来源问题

老冒说 Model metadata 来自哪里？从 Feb 04 的讨论看，他假设"就从 model 自己的节点拿到"。但真实情况是：
- OpenRouter 提供完整 metadata（context length、pricing、features）
- LiteLLM 提供社区维护的定价
- 各 provider 官方有各自的文档
- **没有一个统一来源**，也没有一个持续同步的机制

Arena 是 VC 提到的那类第三方服务，老冒在 Apr 9 会议中对其感到威胁，本质上是因为 **Arena 已经在做 "metadata 聚合 + 评估" 这件事**，而 Agent Hub 还没做。

### 矛盾 5：Policy 的颗粒度

Feb 04 提到的 Policy 是粗粒度的（fast / cheap / powerful / balanced / coding）。叶超当时就提出了一个更精细的问题：

> "fast 它只分了这个模型的消耗，但是模型的能力，比如说一个模型，它是否支持图片输入是否支持多模态输出..."

老冒回答"在 model metadata 里"，但**没有讨论如何在 Policy 中表达这些细粒度约束**。例如：
- "fast + cheap + vision"（既要快又便宜又支持视觉）
- "thinking mode only"（只要推理模型）
- "long context + tools"（长上下文且支持工具调用）

这些约束条件如何组合？Policy 是预设枚举还是可组合表达式？Feb 04 的讨论停在了"以后再说"。

---

## 九、下一步分析的关键问题

基于以上梳理，下一步深度分析需要回答的问题：

### 9.1 定义问题
- **Model Selector 的边界在哪？** 是只选 "chat 模型"，还是要覆盖 chat / embed / image / video / audio 全部？
- **选择时机在哪？** 请求到达 Hub 时选？还是用户创建应用时预先绑定？
- **静态 vs 动态？** Feb 04 老冒说是静态的，但用户的 Policy 可能是动态的（"最近用户的内容偏长，切成长上下文模型"）

### 9.2 输入问题
- **用户怎么表达意图？** 是一个字符串 `"fast+cheap+code"`？还是一组结构化字段？
- **应用可以自己 override 吗？** 如果 A 应用永远要用 Claude Opus，Policy 怎么处理？
- **Policy 可以被 AI 生成吗？** 用户描述任务，LLM 生成 Policy（这是"动态"的一种形式）

### 9.3 数据问题
- **Model metadata 从哪来？** OpenRouter API？LiteLLM？Arena？自己维护？
- **Capability 怎么表达？** 预定义枚举（supports_vision、supports_tools...）？还是开放的 key-value？
- **质量分数从哪来？** 是人工维护还是从历史调用统计？Arena 这种第三方评估能不能直接用？
- **Metadata 更新频率？** 实时？每小时？每天？

### 9.4 算法问题
- **Route 的匹配算法是什么？** 老冒说"静态"，但 Policy = "fast+cheap+code" 怎么映射到具体 model？需要权重？优先级？
- **多个模型都满足怎么选？** 轮转？按成本？按延迟？
- **失败如何回退？** Policy 选中的模型挂了，路由到 Policy 的次优解还是报错？

### 9.5 架构问题
- **放在 Hub Worker 里还是 Ops Blocklet 里？** 
  - Hub 内做：每个请求都要算一次，增加延迟
  - Ops 外做：请求来之前预先决定（比如应用注册时绑定 Policy → 具体 model）
  - 老冒"静态"的说法暗示可以预先绑定，但用户运行时切 Policy 就需要动态查
- **和现有 provider rotation 的关系？** 现在有 failureCount 驱动的轮转，Policy-based 选择如何和它结合？

### 9.6 执行问题
- **谁来做？** 这是 2026-03-23 以来就没解决的问题。鹏飞没做；老冒自己在 Device 层做了但不是 Hub 层；叶超和仕军都有自己的事
- **Master Plan 机制为什么失效？** 2026-04-09 老冒自己说"没人真正去当回事"——下次怎么让它生效？
- **是否应该重新分配？** 基于 AI 时代的"正负资产"理论（老冒在 4-9 提出），是否应该让"核心团队"做这件事而不是鹏飞？

### 9.7 战略问题
- **借力 OpenRouter 还是自建？** OpenRouter 已经做到了 metadata + routing + pricing，如果把它作为超级 provider 集成进来，AIGNE Hub 的差异化在哪？
- **护城河是什么？** 如果只是"按用户计费"，这就不是 Model Selector 的事
- **和 Arena 的关系？** 是把 Arena 当 metadata 数据源，还是自己做评估？

---

## 十、给下一步分析的建议

基于这些讨论，建议下一步的深度分析按以下顺序推进：

1. **先对齐 Model Selector 的最小可用形态**
   - 回到 Feb 04 的设计，把 Hub/Model/Policy/Route 四层的**具体数据结构**写清楚
   - 明确 Policy 的颗粒度（枚举 vs 组合表达式）
   - 明确 Capability 的字段清单

2. **再讨论 metadata 来源和同步**
   - 这是 "fully automatic" 的基础
   - 决定是站在 OpenRouter/LiteLLM 肩膀上，还是自建

3. **然后讨论算法和匹配策略**
   - 静态规则怎么写（SQL where？DSL？）
   - 多候选时怎么排序
   - 回退策略

4. **最后讨论架构位置和实施路径**
   - 放 Worker 里还是 Ops 里
   - 和现有 provider rotation 怎么融合
   - 谁来做、怎么确保做

每一步都应该回到 Feb 04 的原始设计比对，避免又一次"设计很好，但没落地"的循环。

---

## 十一、附：完整引用索引

### 2026-02-04
- Summary: `/Users/chao/Projects/aigne-daily-sync/202602/04/summary.md` §二 "老冒：Context Building & Memory Debug 方法论 & Model Selector"
- Transcript: `/Users/chao/Projects/aigne-daily-sync/202602/04/transcript.txt` 行 233-267（核心设计阐述）

### 2026-02-25
- Transcript: `/Users/chao/Projects/aigne-daily-sync/202602/25/transcript.txt` 行 677-679（VC 验证）

### 2026-03-23
- Transcript: `/Users/chao/Projects/aigne-daily-sync/202603/23/transcript.txt` 行 569-597（Nate 批评 + 老冒回应 + Master Plan 启动）

### 2026-04-01
- Summary: `/Users/chao/Projects/aigne-daily-sync/202604/01/summary.md` 关键决策第 5 条

### 2026-04-02
- Transcript: `/Users/chao/Projects/aigne-daily-sync/202604/02/transcript.txt` 行 135-139（AI Device default 路由）

### 2026-04-09
- Summary: `/Users/chao/Projects/aigne-daily-sync/202604/09/summary.md`
- Transcript: `/Users/chao/Projects/aigne-daily-sync/202604/09/transcript.txt` 行 259-267（Model Selector 批评 + Arena + Master Plan 失效）
