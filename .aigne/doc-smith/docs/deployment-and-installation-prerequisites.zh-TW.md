# 先決條件

在部署 AIGNE Hub 之前，確保目標環境符合指定的軟體和系統需求至關重要。本節概述了成功安裝和順暢運作所必需的依賴項目。遵循這些先決條件將能防止相容性問題並簡化部署過程。

## 軟體需求

主機系統上必須安裝並正確設定以下軟體元件。

### Node.js

AIGNE Hub 是一個 Node.js 應用程式，需要特定版本的執行環境才能正常運作。

*   **需求**：Node.js 是執行 AIGNE Hub 後端服務的 JavaScript 執行環境。
*   **要求版本**：`18.0.0` 或更高版本。
*   **驗證**：若要檢查您已安裝的版本，請在您的終端機中執行以下指令：
    ```bash Node.js 版本檢查 icon=logos:nodejs-icon
    node -v
    ```
*   **安裝**：如果您尚未安裝 Node.js 或需要升級，建議使用版本管理器，如 [nvm](https://github.com/nvm-sh/nvm)（適用於 Linux/macOS）或 [nvm-windows](https://github.com/coreybutler/nvm-windows) 來管理多個 Node.js 版本。官方安裝程式也可在 [Node.js 網站](https://nodejs.org/)上取得。

### pnpm

對於從原始碼手動安裝或出於開發目的，`pnpm` 是指定的套件管理器。它是高效管理依賴項目所必需的。

*   **需求**：`pnpm` 是一個快速、節省磁碟空間的套件管理器。它用於安裝和管理專案的依賴項目。
*   **要求版本**：`9.0.0` 或更高版本。
*   **驗證**：若要檢查您已安裝的版本，請執行此指令：
    ```bash pnpm 版本檢查 icon=logos:pnpm
    pnpm -v
    ```
*   **安裝**：`pnpm` 可以透過 npm（隨 Node.js 一併提供）或其他方法安裝。建議的方法是使用其獨立的腳本。詳細說明請參閱[官方 pnpm 安裝指南](https://pnpm.io/installation)。

    ```bash 安裝 pnpm icon=logos:pnpm
    npm install -g pnpm
    ```

## 部署環境

AIGNE Hub 被設計和封裝為一個 [Blocklet](https://www.blocklet.io/)，運行在 Blocklet Server 上。

### Blocklet Server

Blocklet Server 是一個雲原生應用程式伺服器，負責管理像 AIGNE Hub 這樣的 Blocklet 的生命週期、設定和運作。

*   **需求**：Blocklet Server 提供了必要的執行環境，包括反向代理、自動 HTTPS 和使用者驗證，這些都是 AIGNE Hub 運作所必需的。
*   **安裝**：Blocklet Server 可以安裝在各種平台上。建議且最簡單的方法是使用 `blocklet-cli`。
    ```bash 安裝 Blocklet CLI icon=lucide:terminal
    npm install -g @blocklet/cli
    ```
    一旦 CLI 安裝完成，您就可以初始化並啟動伺服器。
    ```bash 初始化 Blocklet Server icon=lucide:server
    blocklet server init
    blocklet server start
    ```
*   **更多資訊**：有關完整的安裝和管理說明，請參閱 [Blocklet Server 文件](https://docs.blocklet.io/docs/en/getting-started)。

## 總結

總結來說，一個符合 AIGNE Hub 部署要求的環境需要：

| 元件            | 最低版本        | 用途                                        |
| ---------------- | --------------- | ------------------------------------------- |
| Node.js          | `>= 18.0.0`     | JavaScript 執行環境                         |
| pnpm             | `>= 9.0.0`      | 套件管理（用於手動建置）                    |
| Blocklet Server  | 最新版本        | 應用程式伺服器與執行環境                    |

確保滿足這些先決條件是實現穩定且安全的 AIGNE Hub 部署的第一步，也是最關鍵的一步。一旦您的環境設定正確，您就可以繼續進行安裝指南。

- 對於建議的一鍵部署，請參閱[Blocklet Store 部署](./deployment-and-installation-blocklet-store.md)。
- 對於開發者和進階使用者，請遵循[手動安裝](./deployment-and-installation-manual-installation.md)指南。