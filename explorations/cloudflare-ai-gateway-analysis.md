# Cloudflare AI Gateway vs AigneHub 可行性分析报告

## 1. 背景

AigneHub 是 ArcBlock 自研的 AI 模型网关服务，通过 AFS provider 集成到 AFS 生态中，为 AI agent 提供统一的模型访问接口。本报告评估使用 Cloudflare AI Gateway 替代或增强 AigneHub 的可行性。

---

## 2. AI Gateway 是什么

Cloudflare AI Gateway 是一个托管的 **AI 代理层 + 可观测性 + 控制面板**，本质上是放在应用和 AI provider 之间的中间代理。它解决的核心问题是：

- **可见性不足** — 无法了解用户如何使用 AI 应用，缺乏对请求、token、成本的洞察
- **成本控制困难** — AI API 调用成本难以追踪和预测
- **可靠性问题** — API 速率限制导致服务中断，模型故障时没有备用方案
- **安全风险** — API 密钥管理分散，缺乏统一的安全控制

---

## 3. AI Gateway 核心能力

### 3.1 统一接入

- **OpenAI 兼容端点** — 一个 URL (`/compat/chat/completions`) 访问所有 provider，model 参数用 `provider/model` 格式
- **Universal Endpoint** — 支持请求数组，每条指定不同 provider，适合 fallback 场景
- **24+ 原生 Provider** — OpenAI、Anthropic、Google (Vertex AI / AI Studio)、DeepSeek、xAI、Mistral、Groq、Replicate、Bedrock 等
- **Custom Provider** — 任何 HTTPS API 端点都可以接入，扩展性强

### 3.2 可靠性

- **Retry** — 失败请求自动重试（最多 5 次）
- **Fallback** — 自动回退到备选模型/provider
- **Dynamic Routing** — 可视化/JSON 配置路由流，支持条件路由、A/B 测试、概率分流、按 metadata 路由

### 3.3 成本优化

- **缓存** — 相同请求从 Cloudflare 全球缓存返回，延迟降低最高 90%（仅精确匹配，无语义缓存）
- **Rate Limiting** — 灵活的滑动/固定窗口限流
- **Spend Controls** — 日/周/月消费上限，到限自动停止

### 3.4 可观测性

- **Analytics Dashboard** — 开箱即用，追踪 requests、tokens、costs、errors
- **Persistent Logs** — 免费 10 万条/月（Free），100 万条/月（Workers Paid）

### 3.5 安全

- **BYOK (Bring Your Own Key)** — 通过 Secrets Store (AES 加密) 安全存储各 provider API key
- **DLP** — 敏感数据检测
- **Guardrails** — 内容安全审查

### 3.6 计费

- **Unified Billing** — 预充值 credits 到 Cloudflare，统一出账
- **使用自己的 API key 时 AI Gateway 本身不收费** — 核心功能（代理、缓存、限流、analytics）全部免费

---

## 4. AigneHub 当前能力

| 维度 | 详情 |
|------|------|
| **模型数量** | 105 个模型，8 个 provider |
| **Provider** | Anthropic、OpenAI、Google、DeepSeek、xAI、Bedrock、Ideogram、**Doubao（豆包）** |
| **推理类型** | chat (87)、image (12)、video (3)、embedding (3) |
| **接口形式** | AFS actions（`exec /defaults/chat/.actions/chat`） |
| **计费体系** | 自有 credits 体系（`inputCreditsPerToken` / `outputCreditsPerToken`），面向终端用户的多租户计费 |
| **基础设施** | 自有的 retry/fallback、API key 管理、可观测性 |

---

## 5. 逐项对比

### 5.1 模型覆盖

| 能力 | AigneHub | AI Gateway | 差异 |
|------|----------|------------|------|
| Chat 推理 | 87 个模型 | 350+ 模型 | AI Gateway 更多，但缺 doubao（可通过 Custom Provider 解决） |
| Image 生成 | 12 个模型（gpt-image-1, DALL-E, Imagen, doubao-seedream 等） | 仅 Ideogram + Workers AI 开源模型 | **AI Gateway 严重不足**，商业图片模型不走原生路径 |
| Video 生成 | 3 个模型（Sora-2, Veo） | 不支持 | **AI Gateway 无此能力** |
| Embedding | 3 个模型 | 支持 | 基本等价 |

### 5.2 基础设施能力对比

两者都具备 retry/fallback、API key 管理、可观测性等基础设施能力，但实现方式和侧重点不同：

| 能力 | AigneHub | AI Gateway |
|------|----------|------------|
| Retry / Fallback | 有，自有实现 | 有，自动重试最多 5 次 + 多模型 fallback |
| API Key 管理 | 有，自有实现 | 有，BYOK + Secrets Store (AES 加密) |
| 可观测性 | 有，自有实现 | 有，Analytics dashboard 开箱即用 |
| 缓存 | 无 | **全球 CDN 缓存**，延迟降低最高 90% |
| Dynamic Routing | 无 | **可视化配置**，A/B 测试、条件路由、概率分流 |
| 限流 | 无 | **灵活的滑动/固定窗口限流** |
| Spend Controls | 无 | **日/周/月消费上限**，到限自动停止 |
| DLP / Guardrails | 无 | **内置**敏感数据检测和内容安全审查 |

AI Gateway 的差异化优势主要在：**全球 CDN 缓存、Dynamic Routing、限流、Spend Controls、DLP/Guardrails** — 这些是 Cloudflare 基础设施的天然优势，自建成本较高。

### 5.3 计费体系（核心差异）

| 维度 | AigneHub | AI Gateway |
|------|----------|------------|
| **计费对象** | 面向终端用户（多租户） | 面向 Cloudflare 账户持有人（单租户） |
| **定价体系** | 自定义 credits 单价，可加价 | 按 provider 原价，无加价机制 |
| **余额管理** | 用户充值、余额查询、扣费、欠费拦截 | 仅账户级 spend controls |
| **多租户隔离** | 按用户/组织区分 | 无 |
| **账单** | 面向用户出账 | 面向运营者统一出账 |

**AI Gateway 的 Unified Billing 是运维便利工具，不是面向终端用户的可运营计费系统。** 如果 AFS 需要向用户收费，计费体系必须自建或由 AigneHub 提供。

---

## 6. 定位分析

**两者不在同一层，不是替代关系，而是互补关系：**

```
终端用户
   |
   v
AFS Provider（AFS 路径接口）         <-- 任何服务都可以写 provider 接入 AFS
   |
   v
AigneHub / 计费网关（业务层）        <-- 模型目录 + 多租户计费 + 统一推理接口
   |
   v
Cloudflare AI Gateway（基础设施层）  <-- 代理 + 缓存 + 可观测性 + 可靠性
   |
   v
AI Provider（OpenAI / Anthropic / Google / ...）
```

- **AI Gateway = 基础设施层** — 解决代理、缓存、Dynamic Routing、限流、DLP 等 Cloudflare 基础设施层能力
- **AigneHub = 业务层** — 解决多租户计费、统一推理接口（chat/image/video/embedding）、模型全覆盖（含 doubao 等）

---

## 7. 方案评估

### 方案 A：AI Gateway 完全替代 AigneHub — 不推荐

- 需自建：多租户计费体系（credits、余额、扣费、欠费拦截）
- Image 生成覆盖不足（商业图片模型不走原生路径）
- Video 生成不支持
- Doubao 无原生支持
- AigneHub 已有的 retry/fallback、API key 管理、可观测性需要迁移到 AI Gateway 的实现方式
- **计费能力的缺失是最大障碍**

### 方案 B：AigneHub 底层走 AI Gateway — 推荐

- AigneHub 服务不变，provider 调用层从直连改为经过 AI Gateway 代理
- **零额外成本**获得 AigneHub 目前没有的能力：全球 CDN 缓存、Dynamic Routing、限流、Spend Controls、DLP/Guardrails
- 不支持的 provider（doubao）和不支持的能力（image/video 生成）继续直连
- 计费体系完全保留
- 对上层完全透明

### 方案 C：轻量 AI Gateway AFS Provider — 视情况

- 如果多租户计费不是核心需求，可写一个轻量的 `afs-ai-gateway` provider 直接接入 AFS
- 但一旦需要向用户收费，仍需自建计费系统
- Video 生成、doubao 等仍需额外处理

---

## 8. AI Gateway 的局限性

| 局限 | 影响 |
|------|------|
| 代理延迟 10-50ms | 对实时/流式场景有一定影响 |
| 日志上限（免费 10 万/月，付费 100 万/月） | 高流量场景需 Enterprise |
| 无语义缓存 | 只有精确匹配，相似查询无法命中缓存 |
| 无多租户治理 | 缺少层级预算管理、per-team RBAC |
| 不支持 MCP | 无法直接被 AI agent 发现和调用 |
| SaaS 锁定 | 只能用 Cloudflare 托管，无法自部署 |
| Image/Video 能力有限 | 商业图片/视频模型不走原生路径 |

---

## 9. 结论

1. **AI Gateway 不能替代 AigneHub**，两者解决不同层面的问题
2. **AI Gateway 可以增强 AigneHub**，提供 AigneHub 目前缺少的基础设施能力（全球 CDN 缓存、Dynamic Routing、限流、Spend Controls、DLP/Guardrails）
3. **计费是核心壁垒** — 如果 AFS 需要向用户收费，AigneHub（或类似的计费网关）不可或缺，AI Gateway 的 Unified Billing 不具备多租户计费能力
4. **推荐方案 B** — AigneHub 保持不变，底层对支持的 provider 走 AI Gateway 代理，不支持的继续直连

---

## 参考资料

- [Cloudflare AI Gateway 概述](https://developers.cloudflare.com/ai-gateway/)
- [AI Gateway 功能列表](https://developers.cloudflare.com/ai-gateway/features/)
- [Universal Endpoint](https://developers.cloudflare.com/ai-gateway/usage/universal/)
- [OpenAI 兼容端点](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/)
- [Dynamic Routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)
- [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)
- [BYOK (Secrets Store)](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- [定价](https://developers.cloudflare.com/ai-gateway/reference/pricing/)
- [支持的 Provider](https://developers.cloudflare.com/ai-gateway/usage/providers/)
- [Custom Providers](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/)
- [限制](https://developers.cloudflare.com/ai-gateway/reference/limits/)
