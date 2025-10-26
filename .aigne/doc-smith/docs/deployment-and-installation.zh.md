# 部署与安装

本节提供了部署 AIGNE Hub 的全面说明。内容涵盖通过 Blocklet Store 进行推荐的一键式安装方法，以及为开发者和自定义环境从源代码进行手动安装的流程。

在继续之前，必须查阅系统先决条件，以确保您的环境配置正确。无论是为了快速启动还是进行自定义安装，正确的设置对于成功部署至关重要。

```d2
direction: down

Start: {
  label: "开始部署"
  shape: oval
}

Prerequisites: {
  label: "查阅系统\n先决条件"
  shape: rectangle
}

Decision: {
  label: "选择部署\n方法"
  shape: diamond
}

One-Click-Install: {
  label: "Blocklet Store：\n一键安装"
  shape: rectangle
}

Clone-Repo: {
  label: "手动：克隆\n源代码"
  shape: rectangle
}

Install-Deps: {
  label: "手动：安装\n依赖项"
  shape: rectangle
}

Run-App: {
  label: "手动：运行\n应用程序"
  shape: rectangle
}

End: {
  label: "AIGNE Hub 已部署"
  shape: oval
}

Start -> Prerequisites
Prerequisites -> Decision
Decision -> One-Click-Install: "推荐"
Decision -> Clone-Repo: "适用于开发者"

One-Click-Install -> End

Clone-Repo -> Install-Deps
Install-Deps -> Run-App
Run-App -> End

```

## 部署方法

部署 AIGNE Hub 主要有两种方法。请选择最符合您技术要求和操作环境的方法。

<x-cards data-columns="2">
  <x-card data-title="通过 Blocklet Store 部署（推荐）" data-icon="lucide:store">
    这是最快捷、最直接的方法。它支持一键式安装，并在 Blocklet Server 环境中自动处理所有依赖项和初始设置。此方法适合大多数用户。
  </x-card>
  <x-card data-title="从源代码手动安装" data-icon="lucide:file-code-2">
    适用于需要自定义安装、为项目做出贡献或在非 Blocklet Server 环境中部署 AIGNE Hub 的开发者。此方法涉及克隆源代码并手动管理依赖项。
  </x-card>
</x-cards>

## 详细指南

如需详细的分步说明，请前往相关子章节。在开始安装过程之前，请确保您已满足所有先决条件。

<x-cards data-columns="1">
  <x-card data-title="先决条件" data-icon="lucide:clipboard-list" data-href="/deployment-and-installation/prerequisites" data-horizontal="true">
    在开始安装前，请查阅所需的软件和环境设置，例如 Node.js 和 Blocklet Server。
  </x-card>
  <x-card data-title="通过 Blocklet Store 部署" data-icon="lucide:rocket" data-href="/deployment-and-installation/blocklet-store" data-horizontal="true">
    请遵循一键式安装指南，以获得最简单的部署体验。
  </x-card>
  <x-card data-title="手动安装" data-icon="lucide:terminal" data-href="/deployment-and-installation/manual-installation" data-horizontal="true">
    查看从源代码仓库进行安装的分步说明。
  </x-card>
</x-cards>

## 总结

本节概述了部署 AIGNE Hub 的可用路径。对于大多数操作场景，因其简单性和可靠性，推荐采用 [通过 Blocklet Store 部署](./deployment-and-installation-blocklet-store.md)。对于开发或特殊环境，[手动安装](./deployment-and-installation-manual-installation.md) 指南提供了必要的详细说明。成功部署后，下一步是配置系统，详见 [配置](./configuration.md) 部分。