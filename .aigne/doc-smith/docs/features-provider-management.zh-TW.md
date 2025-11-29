# 供應商管理

有效管理上游 AI 供應商對於維持可靠且具成本效益的 AI 閘道至關重要。AIGNE Hub 將此流程集中化，提供統一的介面來連接、設定和管理各種 AI 服務的憑證。本節詳細說明處理供應商設定、憑證和模型費率的程序。

下圖說明了供應商、憑證和模型費率在 AIGNE Hub 內的相互關聯：

```d2
direction: down

AIGNE-Hub: {
  label: "AIGNE Hub 管理"
  shape: rectangle

  Provider: {
    label: "供應商\n（例如 OpenAI、Google）"
    shape: rectangle
    style.fill: "#f0f4ff"
  }

  Credential: {
    label: "憑證\n（例如 API 金鑰）"
    shape: rectangle
    style.fill: "#e6fffa"
  }

  Model-Rate: {
    label: "模型費率\n（例如 gpt-4o-mini 成本）"
    shape: rectangle
    style.fill: "#fffbe6"
  }
}

AIGNE-Hub.Provider -> AIGNE-Hub.Credential: "擁有一或多個"
AIGNE-Hub.Provider <-> AIGNE-Hub.Model-Rate: "與...相關聯"
```

## 供應商設定

供應商是將 AIGNE Hub 連接到 OpenAI、Google 和 AWS Bedrock 等上游 AI 服務的基礎元件。正確的設定可確保 Hub 能將請求路由到適當的服務。

![顯示已設定的 AI 供應商（如 OpenAI、Google 和 AWS Bedrock）列表的供應商設定 UI。](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

### 新增供應商

要整合新的 AI 服務，您必須將其新增為供應商。每個供應商都需要一個唯一的名稱、一個用於 UI 顯示的名稱，以及特定於服務的詳細資訊，例如 `baseUrl` 或 `region`。

#### 請求主體

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>供應商的官方名稱。必須是支援的供應商值之一（例如 `openai`、`google`、`bedrock`）。</x-field-desc>
  </x-field>
  <x-field data-name="displayName" data-type="string" data-required="true">
    <x-field-desc markdown>供應商的使用者友好名稱，將顯示在 UI 中。</x-field-desc>
  </x-field>
  <x-field data-name="baseUrl" data-type="string" data-required="false">
    <x-field-desc markdown>供應商 API 端點的基礎 URL。大多數供應商都需要此項，但對 AWS Bedrock 而言是選填的。</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>Bedrock 服務的 AWS 區域。僅 `bedrock` 供應商需要此項。</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-default="true" data-required="false">
    <x-field-desc markdown>啟用或停用供應商。已停用的供應商將不會用於路由請求。</x-field-desc>
  </x-field>
</x-field-group>

### 更新供應商

您可以修改現有供應商的設定，例如其 `baseUrl`、`region` 或 `enabled` 狀態。

#### 請求主體

<x-field-group>
  <x-field data-name="baseUrl" data-type="string" data-required="false">
    <x-field-desc markdown>供應商 API 端點的更新後基礎 URL。</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>Bedrock 服務的更新後 AWS 區域。</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-required="false">
    <x-field-desc markdown>供應商的新狀態。</x-field-desc>
  </x-field>
</x-field-group>

### 列出與刪除供應商

您可以擷取所有已設定供應商的列表，或根據 ID 刪除特定供應商。刪除供應商也會移除所有相關的憑證和模型費率。

## 憑證管理

憑證用於向上游 AI 供應商進行身份驗證。AIGNE Hub 會加密並安全地儲存這些憑證，並將其與特定供應商關聯。每個供應商可以有多個憑證，以便進行金鑰輪替和負載平衡。

### 新增憑證

新增憑證時，您必須指定其類型和值。AIGNE Hub 會自動根據供應商的服務驗證憑證，以確保其有效。

#### 請求主體

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>憑證的描述性名稱（例如「A 團隊 API 金鑰」）。</x-field-desc>
  </x-field>
  <x-field data-name="credentialType" data-type="string" data-default="api_key" data-required="false">
    <x-field-desc markdown>憑證的類型。支援的值為 `api_key` 和 `access_key_pair`。</x-field-desc>
  </x-field>
  <x-field data-name="value" data-type="string or object" data-required="true">
    <x-field-desc markdown>憑證值。對於 `api_key`，這是一個字串。對於 `access_key_pair`，這是一個包含 `access_key_id` 和 `secret_access_key` 的物件。</x-field-desc>
  </x-field>
</x-field-group>

### 憑證驗證

AIGNE Hub 包含一個端點，用於檢查已儲存憑證的有效性。此操作會觸發使用指定憑證對供應商進行測試連線，以確認其處於活動狀態並具有必要的權限。

### 更新與刪除憑證

現有的憑證可以更新為新值或被刪除。當憑證被刪除時，它會從系統中永久移除，並且不能再用於請求。

## 模型費率管理

模型費率定義了在 AIGNE Hub 中使用特定 AI 模型的成本（以點數計算）。這些費率對於在[服務供應商模式](./deployment-scenarios-service-provider.md)下運作的系統至關重要，在該模式下，使用量是根據點數計費的。

![顯示 AI 模型及其相關成本列表的模型費率設定 UI。](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 新增模型費率

您可以為已設定供應商支援的任何模型定義費率。這包括為輸入和輸出 token（針對文字模型）或每張圖片/影片（針對生成模型）設定不同的點數成本。

#### 請求主體

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>模型的識別碼（例如 `gpt-4o-mini`）。</x-field-desc>
  </x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>服務的類型。支援的值為 `chatCompletion`、`imageGeneration`、`embedding` 和 `video`。</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true">
    <x-field-desc markdown>此模型費率適用的供應商 ID 陣列。這允許單一模型由多個供應商提供。</x-field-desc>
  </x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true">
    <x-field-desc markdown>輸入的點數成本（例如，每 1,000 個 token）。</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true">
    <x-field-desc markdown>輸出的點數成本（例如，每 1,000 個 token）。</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>供應商的實際成本，以美元計，每百萬單位（token/圖片）。用於根據利潤率自動計算費率。</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="每百萬單位的輸入成本。"></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="每百萬單位的輸出成本。"></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false">
    <x-field-desc markdown>關於模型功能的額外元資料。</x-field-desc>
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="最大上下文視窗大小。"></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="支援的功能陣列，例如 `tools` 或 `vision`。</x-field>
  </x-field>
</x-field-group>

### 批次更新模型費率

為了簡化定價調整，AIGNE Hub 支援根據定義的利潤率和點數價格批次更新模型費率。系統會自動為所有定義了 `unitCosts` 的模型重新計算 `inputRate` 和 `outputRate`。

計算方式如下：
`新費率 = (單位成本 * (1 + 利潤率 / 100)) / 點數價格`

#### 請求主體

<x-field-group>
  <x-field data-name="profitMargin" data-type="number" data-required="true">
    <x-field-desc markdown>期望的利潤率百分比（例如，`20` 代表 20%）。</x-field-desc>
  </x-field>
  <x-field data-name="creditPrice" data-type="number" data-required="true">
    <x-field-desc markdown>單一點數的美元價格。</x-field-desc>
  </x-field>
</x-field-group>

### 更新與刪除模型費率

可以修改或移除個別的模型費率。如果刪除模型費率，且已啟用基於點數的計費，則相應模型將不再對使用者可用。

## 總結

本節涵蓋了在 AIGNE Hub 中管理 AI 供應商、憑證和模型費率的核心功能。正確設定這些資源對於您的 AI 服務的安全性、可靠性和財務管理至關重要。

有關相關主題的更多資訊，請參考以下部分：
<x-cards data-columns="2">
  <x-card data-title="服務供應商模式" data-href="/deployment-scenarios/service-provider" data-icon="lucide:briefcase">了解如何設定基於點數的計費和自訂定價模型。</x-card>
  <x-card data-title="安全與存取控制" data-href="/features/security" data-icon="lucide:shield">了解安全架構，包括加密儲存和存取控制。</x-card>
</x-cards>