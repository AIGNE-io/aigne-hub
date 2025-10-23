# Blocklet Store 部署

從 Blocklet Store 部署 AIGNE Hub 是最直接且推薦的方法。此方法利用 Blocklet Server 環境提供一鍵安裝體驗，自動處理相依性套件和初始設定。對於優先考慮速度和簡易性的操作者而言，這是理想的選擇。

在繼續之前，請確保您有一個正在運行的 Blocklet Server 實例。有關詳細要求，請參閱 [先決條件](./deployment-and-installation-prerequisites.md) 文件。

## 安裝流程

安裝過程是透過 Blocklet Server 儀表板中的引導式精靈來管理。

1.  **前往 Blocklet Store**
    進入您的 Blocklet Server 儀表板，並從導覽選單中開啟「Store」部分。

2.  **搜尋 AIGNE Hub**
    在 Store 中使用搜尋列找到「AIGNE Hub」應用程式。

3.  **啟動安裝**
    在 AIGNE Hub 應用程式頁面上點擊「Launch」按鈕。這將會啟動安裝精靈。

4.  **遵循螢幕上的精靈指示**
    精靈將引導您完成必要的設定步驟。系統會提示您確認安裝設定。一旦確認，Blocklet Server 將自動下載、安裝並啟動 AIGNE Hub 實例。

5.  **存取您的實例**
    安裝成功後，您將被重新導向至 AIGNE Hub 的主儀表板。該實例現在已在運行並可進行設定。

![AIGNE Hub 儀表板](https://raw.githubusercontent.com/AIGNE-ab/doc-assets/main/images/fc46e9461382f0be7541af17ef13f632.png)

## 安裝後設定

部署完成後，下一個關鍵步驟是設定服務。這包括新增 AI 供應商憑證，以及在需要時設定計費。

有關設定供應商和其他設定的詳細說明，請前往 [設定](./configuration.md) 章節。

## 總結

使用 Blocklet Store 將 AIGNE Hub 的部署簡化為只需點擊幾下。此方法確保了一致、可靠的設定，是推薦給大多數使用者的路徑。對於需要對安裝過程有更多控制權的開發人員或操作者，我們也提供了 [手動安裝](./deployment-and-installation-manual-installation.md) 指南。