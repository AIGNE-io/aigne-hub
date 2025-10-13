# Blocklet Store 部署

對於大多數操作場景，建議透過 Blocklet Store 部署 AIGNE Hub。此方法利用一鍵安裝流程，不僅大幅簡化了初始設定，也確保系統能在運行的 Blocklet Server 實例上正確配置。

對於希望快速啟動並運行 AIGNE Hub，同時避免手動原始碼編譯和依賴管理複雜性的團隊而言，此方法是理想的選擇。

## 逐步安裝指南

請遵循以下步驟，從 Blocklet Store 部署和配置 AIGNE Hub。

### 步驟 1：在 Blocklet Store 中找到 AIGNE Hub

前往官方 [Blocklet Store](https://store.blocklet.dev)，並使用搜尋功能找到「AIGNE Hub」。商店頁面提供了關於該 blocklet 的詳細資訊，包括其功能、版本歷史和系統需求。

### 步驟 2：啟動安裝

進入 AIGNE Hub 頁面後，點擊「Launch」按鈕。這將在您已連接的 Blocklet Server 上啟動安裝過程。

![AIGNE Hub in Blocklet Store](../../../blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

### 步驟 3：遵循安裝精靈的指示

系統將引導您完成安裝精靈。請遵循螢幕上的提示完成設定。安裝精靈會自動處理所有必要元件和依賴項的部署。

### 步驟 4：初始配置

安裝完成後，最後一步是配置您打算使用的 AI 提供商。

1.  進入 AIGNE Hub 管理面板。
2.  前往 **Config** 區塊並選擇 **AI Providers**。
3.  為您希望連接的每個 AI 服務新增必要的 API 金鑰和憑證。所有憑證在靜態儲存時均經過 AES 加密，以確保安全。

![Configure AI Providers](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

一旦您的提供商配置完成，您的 AIGNE Hub 實例即可全面運作，並準備好為您的內部團隊，或（若有配置）為外部客戶提供 API 請求服務。