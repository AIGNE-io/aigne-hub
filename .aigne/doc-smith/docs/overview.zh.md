# Blocklet Store 部署

通过 Blocklet Store 部署 AIGNE Hub 是大多数运营场景下的推荐方法。这种方法利用一键安装流程，极大地简化了初始设置，并确保系统在运行中的 Blocklet Server 实例上得到正确配置。

对于希望快速运行 AIGNE Hub，而又不想处理手动源代码编译和依赖管理复杂性的团队来说，这种方法是理想的选择。

## 分步安装指南

请按照以下步骤从 Blocklet Store 部署和配置 AIGNE Hub。

### 步骤 1：在 Blocklet Store 中找到 AIGNE Hub

访问官方 [Blocklet Store](https://store.blocklet.dev) 并使用搜索功能查找“AIGNE Hub”。该商店提供了有关该 blocklet 的详细信息，包括其功能、版本历史和系统要求。

### 步骤 2：启动安装

进入 AIGNE Hub 页面后，点击“启动”按钮。这将在您连接的 Blocklet Server 上启动安装过程。

![AIGNE Hub 在 Blocklet Store 中](../../../blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

### 步骤 3：跟随安装向导

系统将引导您完成一个安装向导。请按照屏幕上的提示完成设置。该向导会自动处理所有必要组件和依赖项的部署。

### 步骤 4：初始配置

安装完成后，最后一步是配置您打算使用的 AI 提供商。

1.  访问 AIGNE Hub 管理面板。
2.  导航至 **Config** 部分并选择 **AI Providers**。
3.  为您希望连接的每个 AI 服务添加必要的 API 密钥和凭证。所有凭证在静态时都经过 AES 加密，以确保安全。

![配置 AI 提供商](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

一旦您的提供商配置完成，您的 AIGNE Hub 实例就已完全投入运行，并准备好为您的内部团队或（如果已配置）外部客户提供 API 请求服务。