# 手动安装

对于希望为 AIGNE Hub 做出贡献的开发者或需要自定义部署的运维人员，建议采用从源代码进行手动安装的方式。本指南提供了在本地机器上设置该项目的系统化、分步流程。如需更简单的一键式部署，请参阅 [Blocklet Store 部署](./deployment-and-installation-blocklet-store.md)指南。

## 前提条件

在继续安装之前，请确保您的开发环境满足以下要求。指定的版本是确保兼容性和稳定运行的最低要求。

| 软件 | 要求版本 |
| :--- | :--- |
| Node.js | `>= 18` |
| pnpm | `>= 9` |
| Git | 最新稳定版 |

## 安装步骤

安装过程包括克隆源代码仓库、进入项目目录以及使用 `pnpm` 安装所需依赖项。

### 第 1 步：克隆源仓库

首先，将 AIGNE Hub 的官方 GitHub 仓库克隆到您的本地机器。在终端中执行以下命令：

```bash 克隆仓库 icon=mdi:git
git clone https://github.com/blocklet/ai-kit.git
```

### 第 2 步：进入项目目录

克隆过程完成后，将当前目录切换到新创建的项目文件夹：

```bash 进入目录 icon=mdi:folder-open-outline
cd ai-kit
```

### 第 3 步：安装依赖

使用 `pnpm` 包管理器安装所有项目依赖项。该命令将根据 `pnpm-lock.yaml` 文件中的定义下载并链接所有必要的包，以确保构建的一致性和可靠性。

```bash 安装依赖 icon=mdi:download
pnpm install
```

## 运行应用程序

成功安装后，您可以运行 AIGNE Hub 应用程序。可用的脚本同时适用于开发和生产环境。

### 开发模式

要以启用热重载的开发模式启动应用程序，请使用 `dev` 脚本。这非常适合进行活跃的开发和测试。

```bash 启动开发服务器 icon=mdi:play-circle-outline
pnpm dev
```

### 生产构建

对于生产部署，您必须首先构建应用程序。此过程会转译 TypeScript 代码、打包前端资源并优化项目性能。

```bash 为生产环境构建 icon=mdi:cogs
pnpm build
```

构建完成后，您将需要一个独立的机制来运行编译后的应用程序，例如进程管理器（如 PM2）或 Blocklet Server 实例。

## 总结

您现在已经成功地从源代码安装了 AIGNE Hub。下一步是通过连接到您选择的 AI 提供商并设置任何可选功能（如基于额度的计费）来配置实例。

有关安装后设置的详细说明，请继续阅读 [配置](./configuration.md) 部分。