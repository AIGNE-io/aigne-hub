# 基於點數的計費

AIGNE Hub 包含一個可選的、功能強大的點數計費系統，旨在對 AI 模型的使用和成本進行精細控制。啟用後，該系統允許營運商為各種 AI 模型定義具體的點數費率、追蹤每位使用者的消耗量，並與支付系統整合以進行點數儲值。這種方法從直接轉嫁供應商成本轉變為一個受管理的內部經濟體系，從而實現一致的定價、成本抽象化和潛在的獲利能力。

本指南詳細介紹了啟用和設定點數計費系統的過程，包括如何為不同的 AI 模型設定具體的使用費率以及管理使用者點數。

關於管理這些模型所屬的 AI 供應商的資訊，請參閱 [AI 供應商和憑證](./configuration-ai-providers-and-credentials.md) 文件。

## 啟用點數計費

點數計費系統預設為停用。若要啟用它，您必須在您的 AIGNE Hub 設定中將 `CREDIT_BASED_BILLING_ENABLED` 環境變數設定為 `true`。啟用後，系統將開始對所有 API 呼叫強制執行點數檢查，並根據使用者餘額追蹤用量。

當此模式啟用時，只有在「模型費率」設定中明確定義了費率的模型才能透過 API 使用。

## 設定模型費率

模型費率是點數計費系統的核心。費率定義了使用特定 AI 模型會消耗多少點數。費率通常根據輸入（例如，提示 token）和輸出（例如，完成 token 或生成的圖片）來定義。

您可以透過管理儀表板在 **AI 設定 > 模型費率** 下設定這些費率。

![此螢幕截圖描述了 AIGNE Hub 的 AI 設定區塊中的「模型費率」設定頁面，概述了使用者如何管理 AI 模型定價。它展示了一個詳細的表格，列出了各種 AI 模型，如 ChatGPT 和 Claude、其供應商、內容類型（圖片、文字）以及相關的輸入和輸出定價費率。該介面允許編輯、刪除和新增模型費率，提供了對 AI 服務成本的全面管理控制。](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 新增模型費率

若要新增費率，請點擊「新增模型費率」按鈕並提供必要的詳細資訊。您可以同時為跨多個供應商的特定模型建立一個費率。

![此螢幕截圖展示了「AIGNE / Hub」平台的使用者介面，特別著重於 AI 模型費率設定。右側開啟了一個顯眼的「新增模型費率」強制回應視窗，顯示了模型名稱、費率類型、供應商、模型成本、AIGNE Hub 點數費率設定、描述和進階選項的輸入欄位。在背景中，「設定」頁面的「模型費率」區塊下，可以看到現有的 AI 模型列表，如 ChatGPT、Claude 和 Gemini，以及它們的供應商和類型。](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

定義模型費率需要以下參數：

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="模型在供應商端識別的確切名稱（例如，gpt-4o、claude-3-opus-20240229）。"></x-field>
  <x-field data-name="modelDisplay" data-type="string" data-required="false" data-desc="方便使用者閱讀的模型名稱，將顯示在使用者介面中。如果留空，將根據模型 ID 生成一個格式化的名稱。"></x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>AI 任務的類型。這決定了應用哪種費率。可能的值為 `chatCompletion`、`imageGeneration` 或 `embedding`。</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true" data-desc="此費率將適用的供應商 ID 陣列。這允許在多個平台上可用的單一模型共享一個費率。"></x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>每個輸入單位收取的點數（例如，每 1,000 個提示 token）。對於 `imageGeneration`，此值通常為 `0`。</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>每個輸出單位收取的點數（例如，每 1,000 個完成 token 或每張生成的圖片）。</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>來自 AI 供應商的實際成本，通常以美元/百萬 token 計算。此資訊用於自動計算費率，不會直接向使用者收費。</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="供應商的輸入單位成本。"></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="供應商的輸出單位成本。"></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false" data-desc="關於模型功能的額外元資料。">
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="模型在單一上下文中可處理的最大 token 數。"></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="模型支援的特殊功能列表，例如 `tools`、`thinking` 或 `vision`。"></x-field>
    <x-field data-name="imageGeneration" data-type="object" data-required="false" data-desc="圖片生成模型的具體資訊。">
      <x-field data-name="max" data-type="number" data-required="false" data-desc="每個請求的最大圖片數量。"></x-field>
      <x-field data-name="quality" data-type="array" data-required="false" data-desc="支援的圖片品質選項（例如，['standard', 'hd']）。"></x-field>
      <x-field data-name="size" data-type="array" data-required="false" data-desc="支援的圖片尺寸（例如，['1024x1024', '1792x1024']）。"></x-field>
      <x-field data-name="style" data-type="array" data-required="false" data-desc="支援的圖片風格（例如，['vivid', 'natural']）。"></x-field>
    </x-field>
  </x-field>
</x-field-group>

## 批次更新費率

為了簡化費率管理，AIGNE Hub 提供了一種機制，可以根據您的基礎成本和期望的利潤率批次更新所有模型費率。當供應商更改其定價或您想調整您的點數定價結構時，此功能特別有用。

此功能使用為每個模型定義的 `unitCosts`，並應用一個簡單的公式來計算新的 `inputRate` 和 `outputRate`：

```
費率 = (單位成本 * (1 + 利潤率 / 100)) / 點數價格
```

其中：
*   `UnitCost`：來自供應商的原始成本（例如，美元/百萬 token）。
*   `ProfitMargin`：您定義的百分比。
*   `CreditPrice`：您向使用者出售一點數的價格。

此計算會對每個已定義 `unitCosts` 的模型的輸入和輸出費率進行。

## 使用者點數管理

啟用計費後，每個使用者都有一個點數餘額。AIGNE Hub 與一個支付元件整合來管理這些餘額。

### 新使用者點數贈送

您可以設定 AIGNE Hub 自動向新使用者贈送初始餘額。這有助於鼓勵試用和採用。以下環境變數控制此功能：

*   `NEW_USER_CREDIT_GRANT_ENABLED`：設定為 `true` 以啟用贈送。
*   `NEW_USER_CREDIT_GRANT_AMOUNT`：贈送給每位新使用者的點數數量。
*   `CREDIT_EXPIRATION_DAYS`：促銷點數過期的天數。設定為 `0` 表示永不過期。

### 購買點數

使用者可以透過購買點數來增加其餘額。系統可以設定一個付款連結，將使用者導向結帳頁面。預設情況下，AIGNE Hub 會嘗試透過整合的 PaymentKit blocklet 建立和管理一個付款連結，但也可以透過 `CREDIT_PAYMENT_LINK` 環境變數指定一個自訂 URL。

## 用量追蹤與計量

對於每個 API 呼叫，AIGNE Hub 都會執行一系列步驟，以確保準確的點數消耗和報告。此過程設計得既具彈性又高效，會將小額費用批次處理以減少額外開銷。

工作流程如下：

1.  **驗證使用者餘額**：檢查使用者是否有足夠的點數餘額。如果餘額為零或更少，請求將被拒絕，並回傳 `402 Payment Required` 錯誤。
2.  **計算成本**：在 AI 供應商成功處理請求後，AIGNE Hub 會將提示和完成 token（或圖片數量）乘以設定的 `inputRate` 和 `outputRate` 來計算點數成本。
3.  **記錄用量**：在資料庫中建立一筆用量記錄，詳細說明使用的 token 數、消耗的點數以及相關的使用者和模型。
4.  **向支付系統回報**：消耗的點數作為一個計量事件回報給支付系統，然後支付系統會從使用者的餘額中扣除該金額。此回報過程會進行節流控制，將多個小型請求批次處理為單一更新，以最佳化效能。

## 總結

點數計費系統將 AIGNE Hub 轉變為一個全面的 AI 資源管理平台。它為營運商提供了工具，可以抽象化複雜的供應商定價、建立一個穩定的內部經濟體系，並根據清晰的、基於用量的指標來管理使用者存取。透過仔細設定模型費率和使用者點數政策，您可以確保您的 AI 閘道可持續且受控地運作。