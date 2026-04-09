# 外部模型平台调研报告

> 2026-04-09 · 针对主流 AI 模型聚合平台和云服务商的能力对标，为 AIGNE Hub 重构方案（[`aignehub-refactor-plan.md`](./aignehub-refactor-plan.md)）和 Model Selector 方案（[`aignehub-model-selector-plan.md`](./aignehub-model-selector-plan.md)）提供依据。

调研对象：Google Vertex AI、OpenRouter、Hugging Face、AWS Bedrock、Together AI、Fireworks AI、Groq、DeepInfra、Replicate。

关注维度：模型数量、API 统一性、定价 API、按用户计费能力、模型上线自动化、路由与回退、元数据完整度。

---

## 一、平台深度分析

### 1. Google Vertex AI

**定位**：Google Cloud 上的企业级 AI 模型平台，集模型市场、推理服务、MLOps 于一体。

| 维度 | 详情 |
|------|------|
| **模型数量** | 200+ 基础模型（含 150+ 开源模型） |
| **自有模型** | Gemini 系列（2.5 Pro/Flash, 2.0, 1.5）、Imagen、Embeddings、MedLM |
| **第三方模型** | Anthropic Claude、Meta Llama、Mistral、AI21 Jamba、Cohere Command R |
| **开源模型** | 通过 Model Garden 部署 HuggingFace 模型（需兼容推理容器） |
| **API 格式** | Google 自定义格式（`generateContent`），Gemini 提供 OpenAI 兼容端点 |
| **定价方式** | Managed API 按 token 计费；自部署按 GPU 小时计费 |
| **定价 API** | ❌ 无实时定价 API，需从文档或 Billing Catalog API 手动映射 |
| **按用户计费** | ❌ 原生不支持，需应用层自行实现（响应含 usageMetadata） |
| **模型上架** | 半自动：Google 自有模型内部发布，第三方需合作伙伴流程 |
| **认证方式** | Google Cloud IAM + Service Account（复杂） |

**代表性定价（2026年）**：

| 模型 | 输入价格 | 输出价格 |
|------|----------|----------|
| Gemini 2.5 Pro | $1.25/M tokens | $10/M tokens |
| Gemini 2.5 Flash | $0.15/M tokens | $0.60/M tokens |
| Gemini 1.5 Pro | $1.25/M tokens | $5.00/M tokens |

**核心优势**：
- 模型多样性最强（200+），覆盖文本/图像/音频/视频/医疗等
- 200 万 token 上下文窗口（Gemini 1.5 Pro，业界最长之一）
- 企业级安全（VPC-SC, CMEK, IAM）
- Google Cloud 生态深度集成（BigQuery, GCS 等）
- Grounding with Google Search（实时信息增强）

**核心局限**：
- API 不统一：不同来源模型使用不同格式
- OpenAI 兼容仅限 Gemini 模型
- 无定价 API，元数据不够结构化
- 自部署开源模型成本高（GPU 持续计费）
- 供应商锁定严重，迁移成本高
- 认证复杂度高（非简单 API Key）

---

### 2. OpenRouter

**定位**：AI 模型聚合网关，"AI 模型的 Stripe"——统一 API、智能路由、透明定价。

| 维度 | 详情 |
|------|------|
| **模型数量** | 300+ 付费模型，500+ 含免费变体 |
| **供应商数** | 60+ 推理供应商 |
| **API 格式** | 完全 OpenAI 兼容（改 baseURL 即可） |
| **定价方式** | 推理零加价（=供应商价格），充值收 5-5.5% 手续费 |
| **定价 API** | ✅ `/api/v1/models` 公开免费 API，含完整定价+元数据 |
| **按用户计费** | ⚠️ 通过 OAuth PKCE 让用户用自己账户，非代收代付 |
| **模型上架** | 高度自动化，与实验室合作，新模型通常首发即上线 |
| **认证方式** | 简单 API Key |

**智能路由策略**：
1. 稳定性优先：排除最近 30 秒内故障的供应商
2. 成本加权：按价格反平方加权随机选择
3. 回退机制：支持多模型级联回退，按实际使用模型计费

**可控路由参数**：

| 参数 | 功能 |
|------|------|
| `order` | 指定供应商优先顺序 |
| `sort` | 按 price/throughput/latency 优先 |
| `only` / `ignore` | 白名单/黑名单供应商 |
| `require_parameters` | 仅选择支持所有请求参数的供应商 |
| `quantizations` | 按量化精度过滤 |

**模型元数据 API 返回字段**：
```json
{
  "id": "anthropic/claude-opus-4.6",
  "name": "Anthropic: Claude Opus 4.6",
  "pricing": {
    "prompt": "0.00003",
    "completion": "0.00015",
    "image": "...",
    "reasoning": "..."
  },
  "context_length": 1000000,
  "architecture": {
    "modality": "text+image->text",
    "input_modalities": ["text", "image"],
    "output_modalities": ["text"]
  },
  "supported_parameters": ["tools", "temperature", ...],
  "deprecation_date": "..."
}
```

**财务数据（2025）**：
- 月度客户支出：$800 万（2025.05），一年内 10x 增长
- 估算月收入：~$40 万（5% 平台费）
- 累计融资：$4000 万（a16z、Menlo Ventures）
- 成立时间：2023 年

**核心优势**：
- 一个 API Key 访问 300+ 模型，完全 OpenAI 兼容
- 智能路由（自动负载均衡、故障回退、成本优化）
- 推理零加价，定价完全透明
- 实时模型元数据 API（免费公开）
- 新模型上线速度极快（通常首发同天）
- 路由控制粒度细（按供应商、延迟、吞吐量、价格）

**核心局限**：
- 增加一跳网络延迟（中间层代理）
- 不支持平台方代收代付的按用户计费
- 免费模型限制严格
- 模型可用性依赖上游供应商
- BYOK 超出免费额度仍收 5%

---

### 3. Hugging Face

**定位**：AI 社区平台 + 模型托管 + 推理服务，是全球最大的开源模型仓库。

| 维度 | 详情 |
|------|------|
| **模型数量** | 100 万+ 模型（Hub 上托管），推理 API 支持数千个热门模型 |
| **推理方式** | Serverless Inference API（免费/付费）+ Inference Endpoints（专用部署） |
| **API 格式** | 自有格式 + OpenAI 兼容端点（`/v1/chat/completions`） |
| **定价方式** | Serverless 免费层有限，Pro $9/月加速；Endpoints 按 GPU 小时计费 |
| **定价 API** | ⚠️ 模型卡片有信息，但无统一定价 API |
| **按用户计费** | ❌ 不支持 |
| **模型上架** | 完全自动化（社区上传即可用） |

**Serverless Inference API 详情**：
- 免费层约 1000 次请求/天（因模型而异），Pro $9/月获更高速率
- 并非所有 100 万+ 模型都支持，主要覆盖数千个热门模型
- HF 使用共享 GPU 池，性能有波动

**Inference Endpoints 定价**：
| GPU 类型 | 价格/小时 |
|----------|-----------|
| NVIDIA T4 | ~$0.50 |
| NVIDIA A10G | ~$1.00 |
| NVIDIA A100 (40GB) | ~$3.25 |
| NVIDIA A100 (80GB) | ~$4.50 |
| NVIDIA H100 | ~$8-12 |

支持缩放到 0（闲置不收费）和多副本扩展。

**模型元数据 API**：
- `GET /api/models` 返回丰富的结构化数据：modelId, author, tags, pipeline_tag, downloads, likes, library_name, config, cardData
- Hub API 非常完善，支持搜索、过滤、排序
- 官方 Python 客户端 `huggingface_hub`

**核心优势**：
- 模型数量碾压所有平台（100万+）
- 开源社区活跃，新模型第一时间出现
- 模型元数据丰富（模型卡片、评估基准、下载量）
- 与 Vertex AI、AWS SageMaker 等有深度集成
- 上传即可用，零门槛模型上架

**核心局限**：
- Serverless 推理性能不稳定
- 不是为"生产级 API 网关"设计的
- 无内置计费系统
- 商业模型（如 Claude、GPT）不在推理 API 中

---

### 4. AWS Bedrock

**定位**：AWS 的托管式 AI 模型服务，企业级多模型平台。

| 维度 | 详情 |
|------|------|
| **模型数量** | 40-60+ 基础模型 |
| **供应商** | Anthropic Claude、Meta Llama、Mistral、Cohere、AI21 Jamba、Stability AI、Amazon Titan/Nova |
| **API 格式** | `Converse` API（2024 年推出的统一对话接口）+ `InvokeModel`（底层 API） |
| **OpenAI 兼容** | 非原生兼容，2025 年部分区域有实验性支持 |
| **定价方式** | 按需按 token 计费 / 预置吞吐量（包月，低 30-50%）/ 批量推理（低 50%） |
| **定价 API** | ⚠️ 通过 AWS Pricing API 可查，但映射复杂 |
| **按用户计费** | ⚠️ 通过 IAM + Cost Allocation Tags + Cost Explorer 间接支持（企业级） |
| **模型上架** | 半自动：需 AWS 团队审核和上架 |
| **认证方式** | AWS IAM SigV4（Access Key + Secret Key） |

**定价示例**：
| 模型 | 输入价格 | 输出价格 |
|------|----------|----------|
| Claude 3.5 Sonnet | $3/M tokens | $15/M tokens |
| Llama 3.1 70B | ~$0.72/M tokens | ~$0.72/M tokens |
| Amazon Titan Text | ~$0.30/M tokens | ~$0.60/M tokens |

**按用户成本分摊能力（Bedrock 优势）**：
- IAM 策略可控制每个用户/角色对特定模型的访问
- Cost Allocation Tags：为每次调用打标签，在 Cost Explorer 按标签分析费用
- AWS Organizations 多账户架构，每个子账户独立计费
- CloudWatch 提供详细使用量指标

**核心优势**：
- 企业级安全和合规（HIPAA, SOC2, FedRAMP）
- 与 AWS 生态深度集成（S3, Lambda, CloudWatch）
- Guardrails for Bedrock（内容安全过滤）
- Knowledge Bases（RAG 开箱即用）+ Agent 框架
- 精细的 IAM 权限控制和成本分摊

**核心局限**：
- 模型数量远少于 OpenRouter 或 Together AI
- API 非 OpenAI 原生兼容（需 LiteLLM 等转换）
- 新模型上线通常比原生平台晚数周
- 定价略高于专注推理的平台
- AWS 学习曲线高

---

### 5. 其他平台详细对比

#### Together AI
- **模型数量**：200+ 开源模型（Chat, Language, Code, Image, Embedding, Moderation）
- **API**：完全兼容 OpenAI 格式，改 `base_url` 即可迁移
- **定价**（按 token，有竞争力）：
  - Llama 3.1 8B: ~$0.18/M tokens
  - Llama 3.1 70B: ~$0.88/M tokens
  - Llama 3.1 405B: ~$3.50/M tokens
- **特点**：Serverless + Dedicated 两种模式，支持微调，自研优化引擎（FlashAttention/量化）
- **局限**：仅开源模型，无 Claude/GPT；不支持 per-user billing
- **免费层**：新用户 $5 免费额度

#### Fireworks AI
- **模型数量**：60-80+ 模型
- **API**：完全兼容 OpenAI 格式
- **特点**：极致推理速度优化（自研 FireAttention 引擎 + 推测解码）
- **定价**：按 token，价格激进（Llama 3.1 8B ~$0.10/M, 70B ~$0.90/M tokens）
- **亮点**：延迟业界最低之一，Function Calling 极速响应，支持 compound AI 系统
- **局限**：不支持 per-user billing

#### Groq
- **模型数量**：15-25 个精选模型（Llama, Mixtral, Gemma, DeepSeek-R1）
- **API**：完全兼容 OpenAI 格式
- **核心差异**：自研 **LPU（Language Processing Unit）** 硬件
  - Llama 3 8B: **800+ tokens/秒**
  - Llama 3 70B: **250+ tokens/秒**
  - TTFT（首 token 延迟）极低
- **定价**：极具竞争力（Llama 3.1 8B ~$0.05/M, 70B ~$0.59/M tokens），部分免费
- **局限**：模型数量少，不支持自定义模型/微调，无 per-user billing
- **适合**：需要极速推理的实时对话场景

#### DeepInfra
- **模型数量**：100-150+ 开源模型
- **API**：完全兼容 OpenAI 格式
- **定价**：业内最低梯队
  - Llama 3.1 8B: ~$0.06/M input tokens
  - Llama 3.1 70B: ~$0.35/M input tokens
  - Llama 3.1 405B: ~$1.79/M input tokens
- **特点**：Serverless + Dedicated，支持 HuggingFace 模型一键部署
- **局限**：不支持 per-user billing

#### Replicate
- **模型数量**：数万个（社区贡献模式，类似 Docker Hub）
- **API**：自有格式（非 OpenAI 兼容），基于 Cog 容器
- **定价**：按 GPU 秒计费（非 token）
  - CPU: ~$0.000100/秒
  - NVIDIA A100 (40GB): ~$0.001150/秒
  - NVIDIA H100: ~$0.003200/秒
- **特点**：任何人可用 Cog 打包模型上传，多模态支持最广（图像/视频/音频）
- **局限**：非 OpenAI 兼容，按 GPU 秒计费对 LLM 不直观

---

## 二、全景对比矩阵

### 核心能力对比

| 维度 | AIGNE Hub | OpenRouter | Vertex AI | Bedrock | HuggingFace | Together AI |
|------|-----------|------------|-----------|---------|-------------|-------------|
| **模型数量** | ~20-30 | 300+ | 200+ | 40-60 | 100万+ | 200+ |
| **新模型上线** | 手动配置 | 首发同天 | 天~周级 | 周级 | 即时（社区） | 天级 |
| **API 统一性** | OpenAI 兼容 | OpenAI 兼容 | 不统一 | Converse API | 部分兼容 | OpenAI 兼容 |
| **定价 API** | 内部 DB | ✅ 公开免费 | ❌ | ⚠️ 复杂 | ⚠️ 不统一 | ⚠️ 文档为主 |
| **价格自动更新** | 6h 从 LiteLLM 同步 | 实时 | N/A | N/A | N/A | N/A |
| **按用户计费** | ✅ 核心能力 | ⚠️ OAuth | ❌ 需自建 | ⚠️ IAM+Tags | ❌ | ❌ |
| **智能路由** | 简单轮转 | ✅ 高级 | ❌ | ❌ | ❌ | ❌ |
| **故障回退** | 有（基于失败计数） | ✅ 自动级联 | ❌ | ❌ | ❌ | ❌ |
| **凭证管理** | ✅ 加密+轮转 | N/A（统一key） | IAM | IAM | API Key | API Key |
| **延迟开销** | 有（中间层） | 有（中间层） | 无（直连） | 无（直连） | 有 | 无（直连） |
| **企业级安全** | ⚠️ 基础 | ⚠️ 基础 | ✅ 完整 | ✅ 完整 | ⚠️ 基础 | ⚠️ 基础 |

### 速度型平台补充对比

| 维度 | Groq | Fireworks AI | DeepInfra | Replicate |
|------|------|-------------|-----------|-----------|
| **模型数量** | 15-25 | 60-80 | 100-150 | 数万 |
| **OpenAI 兼容** | ✅ | ✅ | ✅ | ❌ |
| **速度优势** | 极快（LPU硬件） | 很快（FireAttention） | 快 | 中等 |
| **定价水平** | 极低 | 低 | 最低梯队 | GPU秒计费 |
| **按用户计费** | ❌ | ❌ | ❌ | ❌ |
| **适合场景** | 极速推理 | 高速生产 | 性价比 | 多模态 |

---

## 三、行业观察

### 按用户计费是稀缺能力

调研的所有平台中，只有 AWS Bedrock 通过 IAM + Cost Allocation Tags 间接支持按终端用户成本分摊。OpenRouter 的 OAuth PKCE 模式让用户用自己的账户使用 OpenRouter，但这是"让用户自己付钱"而非"平台方代收代付"，对需要提供统一用户体验的应用并不适用。

Vertex AI 和 Bedrock 都要求应用层自行实现用量追踪和计费逻辑。Together AI、Fireworks、Groq、DeepInfra、Replicate 均不提供任何按用户计费的原生机制。

这意味着"按终端用户授权计费"在当前的模型聚合/云服务市场上是一个真实的空白。

### OpenAI API 兼容已成行业标准

Together AI、Fireworks AI、Groq、DeepInfra、OpenRouter 全部完全兼容 OpenAI Chat Completions API 格式，用户只需修改 base URL 即可迁移。Vertex AI 为 Gemini 模型提供了 OpenAI 兼容端点。AWS Bedrock 在 2025 年开始在部分区域提供实验性的 OpenAI 兼容端点。

任何新的模型聚合层如果不兼容 OpenAI 格式，集成成本会显著高于竞品。

### 模型上架全面自动化

成功的平台都不依赖人工逐个配置模型。主流模式有三类：

- **Hub 与实验室合作 + 自动化流水线**（OpenRouter）——新模型通常在发布当天上线
- **社区自助上传**（HuggingFace、Replicate）——零门槛
- **社区维护的元数据数据库**（LiteLLM）——作为数据源被广泛引用

AIGNE Hub 当前的人工配置模式（确认 provider 支持 → 配置凭证 → 配置定价 → 测试可用性）是一个 O(n) 的人力流程，在每周数个新模型的行业节奏下已经不可持续。

### 模型元数据 API 的缺失是行业痛点

OpenRouter 的 `/api/v1/models` 是目前最好的模型元数据 API：公开、免费、实时、含多维度 pricing 和 supported parameters。这是其他平台都没有做到的事。

Google Vertex AI 没有公开的定价 API，需要从 Cloud Billing Catalog API 手动映射到具体模型，或者从文档硬编码。AWS Bedrock 的定价信息散落在 SDK 和文档中。Hugging Face 的模型卡片是非结构化的 YAML + Markdown。

这说明行业在"让模型可以被程序化地比较和选择"这件事上还非常早期，有空间去做更好的元数据聚合和 benchmark 服务（Cloud Arena 类第三方服务的兴起就是这个信号）。

### 速度型平台正在硬件差异化

Groq 通过自研 LPU 硬件在 Llama 等开源模型上达到 250-800 tokens/秒的吞吐，远高于 GPU 方案。Fireworks AI 通过 FireAttention 引擎和推测解码做软件优化。Together AI 用 vLLM 加自研优化做折衷。

对于延迟敏感的场景（实时对话、交互式编码），这类平台的优势显著。聚合层如果要支持"按速度选模型"的 Policy，需要把这些平台的延迟和吞吐量化到 metadata 里。
