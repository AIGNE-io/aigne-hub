# 前提条件

在部署 AIGNE Hub 之前，必须确保目标环境满足指定的软件和系统要求。本节概述了成功安装和顺利运行所需的依赖项。遵循这些前提条件将避免兼容性问题并简化部署过程。

## 软件要求

以下软件组件必须在主机系统上安装并正确配置。

### Node.js

AIGNE Hub 是一个 Node.js 应用程序，需要特定版本的运行时才能正常运行。

*   **要求**：Node.js 是执行 AIGNE Hub 后端服务的 JavaScript 运行时环境。
*   **要求版本**：`18.0.0` 或更高版本。
*   **验证**：要检查您安装的版本，请在终端中执行以下命令：
    ```bash Node.js 版本检查 icon=logos:nodejs-icon
    node -v
    ```
*   **安装**：如果您没有安装 Node.js 或需要升级，建议使用版本管理器（如 [nvm](https://github.com/nvm-sh/nvm) (适用于 Linux/macOS) 或 [nvm-windows](https://github.com/coreybutler/nvm-windows)）来管理多个 Node.js 版本。官方安装程序也可在 [Node.js 网站](https://nodejs.org/) 上获取。

### pnpm

对于从源代码手动安装或用于开发目的，`pnpm` 是指定的包管理器。它是高效管理依赖项所必需的。

*   **要求**：`pnpm` 是一个快速、节省磁盘空间的包管理器。它用于安装和管理项目的依赖项。
*   **要求版本**：`9.0.0` 或更高版本。
*   **验证**：要检查您安装的版本，请运行此命令：
    ```bash pnpm 版本检查 icon=logos:pnpm
    pnpm -v
    ```
*   **安装**：`pnpm` 可以通过 npm（Node.js 自带）或其他方法安装。推荐的方法是使用其独立脚本。有关详细说明，请参阅 [pnpm 官方安装指南](https://pnpm.io/installation)。

    ```bash 安装 pnpm icon=logos:pnpm
    npm install -g pnpm
    ```

## 部署环境

AIGNE Hub 被设计和打包成一个 [Blocklet](https://www.blocklet.io/)，它在 Blocklet Server 上运行。

### Blocklet Server

Blocklet Server 是一个云原生应用服务器，用于管理像 AIGNE Hub 这样的 Blocklet 的生命周期、配置和操作。

*   **要求**：Blocklet Server 提供了必要的运行时环境，包括反向代理、自动 HTTPS 和用户认证，这些对于 AIGNE Hub 的运行至关重要。
*   **安装**：Blocklet Server 可以安装在各种平台上。推荐且最简单的方法是使用 `blocklet-cli`。
    ```bash 安装 Blocklet CLI icon=lucide:terminal
    npm install -g @blocklet/cli
    ```
    安装 CLI 后，您可以初始化并启动服务器。
    ```bash 初始化 Blocklet Server icon=lucide:server
    blocklet server init
    blocklet server start
    ```
*   **更多信息**：有关完整的安装和管理说明，请参阅 [Blocklet Server 文档](https://docs.blocklet.io/docs/en/getting-started)。

## 总结

总而言之，一个合规的 AIGNE Hub 部署环境需要：

| 组件             | 最低版本    | 用途                               |
| ---------------- | ----------- | ---------------------------------- |
| Node.js          | `>= 18.0.0` | JavaScript 运行时环境              |
| pnpm             | `>= 9.0.0`  | 包管理（用于手动构建）             |
| Blocklet Server  | 最新        | 应用服务器和运行时环境             |

确保满足这些前提条件是实现稳定、安全的 AIGNE Hub 部署的首要且最关键的一步。一旦您的环境正确设置完毕，您就可以继续阅读安装指南。

- 对于推荐的一键部署，请参阅 [Blocklet 商店部署](./deployment-and-installation-blocklet-store.md)。
- 对于开发者和高级用户，请遵循 [手动安装](./deployment-and-installation-manual-installation.md) 指南。