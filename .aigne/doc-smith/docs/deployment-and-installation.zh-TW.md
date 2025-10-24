# 部署與安裝

本節提供部署 AIGNE Hub 的完整說明。內容涵蓋透過 Blocklet Store 進行的建議一鍵安裝方法，以及為開發者和自訂環境設計的從原始碼手動安裝的流程。

在繼續之前，請務必檢閱系統先決條件，以確保您的環境已正確設定。無論您的目標是快速啟動還是自訂安裝，正確的設定對於成功部署至關重要。

```d2
direction: down

Start: {
  label: "開始部署"
  shape: oval
}

Prerequisites: {
  label: "檢閱系統\n先決條件"
  shape: rectangle
}

Decision: {
  label: "選擇部署\n方法"
  shape: diamond
}

One-Click-Install: {
  label: "Blocklet Store：\n一鍵安裝"
  shape: rectangle
}

Clone-Repo: {
  label: "手動：複製\n原始碼"
  shape: rectangle
}

Install-Deps: {
  label: "手動：安裝\n依賴套件"
  shape: rectangle
}

Run-App: {
  label: "手動：執行\n應用程式"
  shape: rectangle
}

End: {
  label: "AIGNE Hub 已部署"
  shape: oval
}

Start -> Prerequisites
Prerequisites -> Decision
Decision -> One-Click-Install: "建議"
Decision -> Clone-Repo: "適用於開發者"

One-Click-Install -> End

Clone-Repo -> Install-Deps
Install-Deps -> Run-App
Run-App -> End

```

## 部署方法

部署 AIGNE Hub 主要有兩種方法。請選擇最符合您技術需求和營運環境的方法。

<x-cards data-columns="2">
  <x-card data-title="透過 Blocklet Store 部署 (建議)" data-icon="lucide:store">
    這是最快、最直接的方法。它允許一鍵安裝，並在 Blocklet Server 環境中自動處理所有依賴套件和初始設定。此方法適合大多數使用者。
  </x-card>
  <x-card data-title="從原始碼手動安裝" data-icon="lucide:file-code-2">
    此方法適用於需要自訂安裝、為專案做出貢獻，或在非 Blocklet Server 環境中部署 AIGNE Hub 的開發者。它涉及複製原始碼並手動管理依賴套件。
  </x-card>
</x-cards>

## 詳細指南

有關詳細的逐步說明，請前往相關子章節。在開始安裝流程前，請確保您已滿足所有先決條件。

<x-cards data-columns="1">
  <x-card data-title="先決條件" data-icon="lucide:clipboard-list" data-href="/deployment-and-installation/prerequisites" data-horizontal="true">
    在開始安裝前，請檢閱所需的軟體和環境設定，例如 Node.js 和 Blocklet Server。
  </x-card>
  <x-card data-title="透過 Blocklet Store 部署" data-icon="lucide:rocket" data-href="/deployment-and-installation/blocklet-store" data-horizontal="true">
    請遵循一鍵安裝指南，以獲得最簡單的部署體驗。
  </x-card>
  <x-card data-title="手動安裝" data-icon="lucide:terminal" data-href="/deployment-and-installation/manual-installation" data-horizontal="true">
    存取從原始碼儲存庫進行安裝的逐步說明。
  </x-card>
</x-cards>

## 總結

本節概述了部署 AIGNE Hub 的可用途徑。對於大多數營運情境，因其簡單性和可靠性，建議採用 [透過 Blocklet Store 部署](./deployment-and-installation-blocklet-store.md)。對於開發或特殊環境，[手動安裝](./deployment-and-installation-manual-installation.md) 指南提供了必要的詳細說明。成功部署後，下一步是設定系統，詳情請參閱 [設定](./configuration.md) 章節。