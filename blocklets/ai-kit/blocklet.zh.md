# AIGNE Hub

AIGNE Hub 是一个能够快速集成 AI 的 blocklet。使用 AIGNE Hub，开发者能够轻松的将 AI 功能集成到他们的项目中，并创造强大的应用。

## 特点

- **多 AI 提供商支持**：OpenAI、Anthropic、Amazon Bedrock、DeepSeek、Google、Ollama、OpenRouter、xAI
- **OAuth 集成**：安全的 OAuth 认证方式调用 AI 能力
- **信用计费系统**：集成 Payment Kit 实现基于信用额度的计费和使用跟踪
- **提供商凭证管理**：支持 API Key、Access Key Pair
- **模型费率配置**：支持聊天、图像生成、嵌入等不同模型类型的灵活定价
- **内置沙盒环境**：实时 AI 模型测试和实验
- **AIGNE 框架集成**：支持通过 AIGNE CLI 本地调用 AIGNE Hub 模型
- **使用分析**：通过 Observability 组件监控 AI 服务使用情况、成本和性能指标
- **自动信用授予**：新用户首次登录时自动分配初始信用额度

## 安装和运行

- 点击 Launch 按钮
- 你需要首先购买一个 blocklet 服务器（如果你还没有的话）
- 按照安装向导在 blocklet 服务器上安装 blocklet
- 在 blocklet 服务器控制台启动已安装的 blocklet
- 在 **Blocklets -> AIGNE Hub ->  设置 → AI 配置 → AI 提供商** 中配置 AI 提供商
- 访问 AIGNE Hub 的公网地址，你可以从应用菜单中打开 Playground

## 信用计费配置（可选）

要启用基于信用的计费和使用管理：

1. **安装 Payment Kit 组件**

2. **在 AIGNE Hub 中启用信用计费**
   - 前往 **Blocklets → AIGNE Hub → Preferences**
   - 启用"信用计费"选项
   - 配置基础信用价格和目标利润率（可选）
   - 设置新用户信用授予金额（可选）

3. **配置模型费率**
   - 访问 AIGNE Hub → 设置 → AI 配置 → 模型费率
   - 为不同的模型类型和提供商设置价格
   - 配置输入/输出 token 费率

4. **查看使用情况和账单**
   - 在 Payment Kit 账单界面中可查看信用消费历史
   - 用户在信用不足时会收到需购买提示

### OAuth 集成

AIGNE Hub 支持基于 OAuth 的集成，提供安全的 AI 能力访问。

### 聊天对话（推荐）

```ts
// 使用 AIGNE Framework 与 AIGNE Hub
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  url: "https://your-aigne-hub-url/api/v2/chat",
  accessKey: "your-oauth-access-key", 
  model: "openai/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: [{ role: "user", content: "你好，AIGNE Hub！" }],
});

console.log(result);
```


## 信用计费

AIGNE Hub 与 Payment Kit 集成，提供灵活的基于信用的计费：

- **自动信用授予**：新用户在首次登录时获得初始信用
- **使用跟踪**：所有 AI API 调用根据配置的费率消耗信用
- **支付集成**：用户在需要时可以购买额外信用
- **账单历史**：在 Payment Kit 界面中查看详细的信用交易记录
- **模型特定费率**：为各种 AI 模型和功能设置不同的价格

## 支持

如果您有任何问题或需要帮助，请随时在[社区](https://community.arcblock.io/discussions/boards/aigne)进行反馈。我们很乐意提供帮助！
