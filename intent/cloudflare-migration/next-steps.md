# Cloudflare Workers 迁移 — 后续计划

## 1. 扣费优化：预扣 + 结算模式

**问题**：当前 deductCredits 在 streaming 开始前同步 await，高并发时 D1 串行写入导致排队延迟。

**方案**：
```
当前:   resolveProvider → await deductCredits(实际费用) → streaming → 记录(异步)
优化后: resolveProvider → await preDeduct(预估最大费用) → streaming → settle(实际费用, 异步多退少补)
```

**要点**：
- preDeduct 用原子 SQL 预扣一个固定额度（按模型 max_tokens × outputRate 预估）
- streaming 完成后，用异步（waitUntil 或 Queues）结算差额
- 预扣失败 = 余额不足，直接拒绝
- 预扣成功但 streaming 失败 = 需要退还预扣额度

**优先级**：P1（用户超过 50 并发时需要）

---

## 2. 多 Provider 请求格式标准化

**问题**：不同 Provider 的认证方式、请求体、响应体各不相同，当前只适配了 OpenAI 和 Google Gemini。

### 各 Provider 格式对比

#### 认证方式
| Provider | 方式 |
|----------|------|
| OpenAI / DeepSeek / xAI | `Authorization: Bearer <key>` |
| Anthropic | `x-api-key: <key>` + `anthropic-version: 2023-06-01` |
| Google Gemini | URL 参数 `?key=<key>` |
| AWS Bedrock | SigV4 签名（access_key + secret_key + region） |
| 字节 Doubao | `Authorization: Bearer <key>`（类 OpenAI 但有 endpoint 差异） |

#### 请求体结构
| Provider | Chat 请求体 |
|----------|------------|
| **OpenAI** | `{ model, messages: [{role, content}], stream, max_tokens }` |
| **Anthropic** | `{ model, messages: [{role, content}], max_tokens, stream }` — 类似但 system 要单独字段 |
| **Google Gemini** | `{ contents: [{role, parts: [{text}]}], generationConfig: {maxOutputTokens} }` |
| **Bedrock** | `{ inputText / messages, textGenerationConfig: {maxTokenCount} }` — 按模型不同格式不同 |

#### 响应体结构
| Provider | 非流式响应 |
|----------|-----------|
| **OpenAI** | `{ choices: [{message: {content}}], usage: {prompt_tokens, completion_tokens} }` |
| **Anthropic** | `{ content: [{type: "text", text: "..."}], usage: {input_tokens, output_tokens} }` |
| **Google Gemini** | `{ candidates: [{content: {parts: [{text}]}}], usageMetadata: {promptTokenCount, candidatesTokenCount} }` |

#### Streaming 事件格式
| Provider | SSE 格式 |
|----------|---------|
| **OpenAI** | `data: {"choices":[{"delta":{"content":"..."}}]}` |
| **Anthropic** | `event: content_block_delta` + `data: {"delta":{"text":"..."}}` |
| **Google Gemini** | `data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}` |

### 实现方案

在 `cloudflare/src/libs/ai-proxy.ts` 中为每个 Provider 创建适配器：

```typescript
interface ProviderAdapter {
  buildHeaders(apiKey: string): Record<string, string>;
  buildUrl(baseUrl: string, model: string, callType: string, stream: boolean): string;
  buildRequestBody(messages: Message[], options: RequestOptions): unknown;
  parseResponse(data: unknown): StandardResponse;
  parseStreamChunk(line: string): { text?: string; usage?: Usage } | null;
}

const adapters: Record<string, ProviderAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GeminiAdapter(),
  bedrock: new BedrockAdapter(),
  // ...
};
```

**优先级**：
- P0: OpenAI 兼容 ✅ 已完成
- P0: Google Gemini ✅ 已完成
- P1: Anthropic 直连（需适配请求体 + streaming 事件格式）
- P2: Bedrock（需 SigV4 签名库）
- P2: Doubao 直连

---

## 3. 自定义 Provider（Custom OpenAI 兼容）

**现状**：代码通过 `providerName` 硬编码判断请求格式（anthropic / google / 其他默认 OpenAI）。用户可以创建任意 Provider，但无法指定请求格式。

**需求场景**：
- 企业内部 AI 网关（OneAPI、New API、LiteLLM 等）
- 私有部署模型（Ollama、vLLM、LocalAI）
- 其他 OpenAI 兼容代理

**方案**：AiProviders 表增加 `apiFormat` 字段：

```sql
ALTER TABLE AiProviders ADD COLUMN apiFormat TEXT DEFAULT 'openai';
-- 可选值: 'openai' | 'anthropic' | 'gemini' | 'bedrock'
```

路由逻辑从 `providerName === 'anthropic'` 改为 `provider.apiFormat === 'anthropic'`。创建 Provider 时可选格式，默认 OpenAI 兼容。

**优先级**：P1

---

## 4. 队列 + 失败重试

**问题**：waitUntil 中的 DB 写入失败完全静默。

**方案**：
- 阶段 1: waitUntil 失败时写入 KV 暂存（`failed:<id>`），Cron 每分钟重试
- 阶段 2: 引入 Cloudflare Queues，写入入队，Consumer 消费，自带重试 + 死信队列

**优先级**：P1

---

## 4. 不可用模型清理 + 模型管理

**问题**：DB 中模型与实际 Provider 可用模型不匹配。

**方案**：
- 添加模型时验证 Provider 是否真的支持该模型
- 定期通过 test-models 检查可用性
- 不可用模型自动标记 deprecated 或显示状态

**优先级**：P1

---

## 5. Credential 加密

**问题**：API Key 明文存 D1。

**方案**：AES-GCM via Web Crypto API，加密密钥从 Worker secret 获取。

**优先级**：P0（上线前必须）

---

## 6. 可观测性

**问题**：waitUntil 失败静默，无日志回溯。

**方案**：
- 接入 Workers Logpush → 推到 R2 / S3 / 日志平台
- 或接入 Workers Analytics Engine
- 定期对账：CreditAccounts.totalUsed vs SUM(CreditTransactions.amount)

**优先级**：P1

---

## 执行优先级

| 优先级 | 项目 | 依赖 |
|--------|------|------|
| **P0** | Credential 加密 | 无 |
| **P0** | Production 环境创建 | 无 |
| **P1** | 多 Provider 格式适配 (Anthropic) | 无 |
| **P1** | 预扣 + 结算模式 | 无 |
| **P1** | 失败重试 (KV 暂存) | 无 |
| **P1** | 模型管理 + 清理 | 无 |
| **P1** | 可观测性 | 无 |
| **P2** | Cloudflare Queues | P1 完成后 |
| **P2** | Bedrock / Doubao 适配 | P1 Provider 适配完成后 |
| **P3** | Hyperdrive + PG | 用户量达到需要时 |
