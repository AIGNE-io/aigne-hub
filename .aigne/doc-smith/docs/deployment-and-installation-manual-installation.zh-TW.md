# 手動安裝

對於希望為 AIGNE Hub 做出貢獻的開發者，或需要客製化部署的營運者，建議採用從原始碼手動安裝的方式。本指南為在本地機器上設定專案提供了系統化的逐步流程。如需更簡單的一鍵式部署，請參閱 [Blocklet Store 部署](./deployment-and-installation-blocklet-store.md)指南。

## 先決條件

在繼續安裝之前，請確保您的開發環境符合以下要求。指定的版本是為了相容性和穩定運作的最低要求。

| 軟體 | 所需版本 |
| :--- | :--- |
| Node.js | `>= 18` |
| pnpm | `>= 9` |
| Git | 最新的穩定版本 |

## 安裝程序

安裝過程包括複製原始碼儲存庫、進入專案目錄，並使用 `pnpm` 安裝所需的依賴項。

### 步驟 1：複製原始碼儲存庫

首先，將官方的 AIGNE Hub 儲存庫從 GitHub 複製到您的本地機器。請在您的終端機中執行以下指令：

```bash 複製儲存庫 icon=mdi:git
git clone https://github.com/blocklet/ai-kit.git
```

### 步驟 2：進入專案目錄

複製過程完成後，將您當前的目錄切換到新建立的專案資料夾：

```bash 進入目錄 icon=mdi:folder-open-outline
cd ai-kit
```

### 步驟 3：安裝依賴項

使用 `pnpm` 套件管理器安裝所有專案依賴項。此指令將根據 `pnpm-lock.yaml` 檔案的定義下載並連結所有必要的套件，以確保一致且可靠的建置。

```bash 安裝依賴項 icon=mdi:download
pnpm install
```

## 執行應用程式

成功安裝後，您可以執行 AIGNE Hub 應用程式。可用的腳本適用於開發和生產環境。

### 開發模式

若要在啟用熱重載的開發模式下啟動應用程式，請使用 `dev` 腳本。這非常適合進行積極的開發和測試。

```bash 啟動開發伺服器 icon=mdi:play-circle-outline
pnpm dev
```

### 生產環境建置

對於生產部署，您必須先建置應用程式。此過程會轉譯 TypeScript 程式碼、打包前端資產，並為效能優化專案。

```bash 為生產環境建置 icon=mdi:cogs
pnpm build
```

建置完成後，您將需要一個獨立的機制，例如進程管理器（如 PM2）或 Blocklet Server 實例，來執行已編譯的應用程式。

## 總結

您現在已成功從原始碼安裝 AIGNE Hub。下一步是設定實例，將其連接到您選擇的 AI 供應商，並設定任何可選功能，如基於點數的計費。

有關安裝後設定的詳細說明，請繼續閱讀 [設定](./configuration.md) 章節。