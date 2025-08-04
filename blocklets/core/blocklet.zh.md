# AIGNE Hub  
**统一的大语言模型（LLM）服务网关**

AIGNE Hub 通过统一的 API、安全模型和直观的管理界面，将您的应用程序连接到主流的大语言模型（LLMs）。无需再手动管理多个 API 密钥、分散的计费系统和复杂的集成逻辑。

无论您是在构建 SaaS 平台、内部工具，还是智能体应用，AIGNE Hub 都能以最简方式帮助您接入并扩展 AI 能力，安全、稳定、可商业化。

---

## ✨ 为什么选择 AIGNE Hub？

- **一个 API，统一接入多个模型**  
  OpenAI、Claude、Gemini、DeepSeek、xAI、Bedrock 等主流模型一站式接入，兼容 OpenAI 接口规范。

- **集中式管理与可视化监控**  
  在单一仪表盘中查看模型调用、使用量、延迟与成本等关键指标。

- **支持自托管或基于额度计费**  
  可使用您自己的 API 密钥，也可启用基于额度的计费系统（由 [Payment Kit] 提供支持）。

- **无代码模型测试 + CLI 集成开发**  
  内置可视化 Playground，快速调试；也支持本地命令行调用和自动化集成。

- **完善的安全体系**  
  所有凭证经 AES 加密存储，支持基于角色的访问控制和审计日志。

---

## 🧩 核心功能一览

- 💬 **聊天补全** – 支持流式/标准响应模式  
- 🖼️ **图像生成** – 接入 DALL·E 等主流图像模型  
- 🧠 **向量嵌入** – 支持语义搜索、RAG 等应用  
- 🔐 **OAuth 安全 API** – 全接口支持 Bearer Token 授权  
- 📊 **使用统计** – 实时查看 Token 用量、请求延迟与计费数据  
- 💳 **额度计费（可选）** – 支持对用户按使用量计费、额度预分配等功能  

---

## 🚀 快速开始

### 第 1 步：启动 AIGNE Hub  
点击“启动”按钮，自动在您的 Blocklet Server 上部署 AIGNE Hub。

### 第 2 步：配置模型提供商  
前往 `Blocklets → AIGNE Hub → Config → AI Providers`  
添加所需模型的 API 密钥（如 OpenAI、Claude、Gemini 等）。

### 第 3 步（可选）：启用额度计费  
如需对用户进行用量计费，您可以：  
- 安装 **Payment Kit** 组件  
- 在“偏好设置”中启用“基于额度计费”  
- 设置初始额度赠送规则及各模型的 Token 计价策略

### 第 4 步：探索和开发  
使用内置 Playground 测试模型能力，或通过 AIGNE CLI 与后端集成。

---

## 🔌 当前支持的 AI 提供商

- OpenAI（GPT、DALL·E、Embedding）
- Anthropic（Claude）
- Amazon Bedrock（AWS 模型托管）
- Google Gemini（文本与图像模型）
- DeepSeek
- xAI（Grok 系列模型）
- OpenRouter（多模型聚合平台）
- Ollama（本地模型部署）

> 📈 支持的提供商将持续更新，您可在后台自动发现并启用新模型。

---

## 🧑‍💻 开发者资源

- [🏠 AIGNE Hub 官网](https://www.aigne.io/hub)  
- [📘 GitHub 仓库](https://github.com/AIGNE-io/aigne-hub)  
- [🧑‍💻 AIGNE CLI 文档](https://www.arcblock.io/docs/aigne-framework/en/aigne-framework-api-aigne-cli-md)  
- [💬 官方社区](https://community.arcblock.io/discussions/boards/aigne)  

---

**AIGNE Hub 是现代 AI 应用的统一入口，立即启动，构建智能化体验从未如此简单。**
