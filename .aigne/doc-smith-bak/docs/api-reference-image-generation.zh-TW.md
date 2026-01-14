# 圖片生成

本文件提供了圖片生成端點的技術規格。透過本指南，您將能夠透過建構請求、指定模型和參數以及處理生成的圖片資料，將由 AI 驅動的圖片創建功能整合到您的應用程式中。

AIGNE Hub API 讓您可以透過文字提示生成新圖片或編輯現有圖片。有關其他 AI 功能的詳細資訊，請參閱 [聊天完成](./api-reference-chat-completions.md) 和 [嵌入](./api-reference-embeddings.md) 文件。

## 創建圖片

根據文字描述（提示）生成圖片。您也可以提供一張現有圖片進行編輯。

**端點**

```sh
POST /api/images/generations
```

此端點會創建一張新圖片或編輯一張現有圖片，並以指定的格式回傳圖片資料。

### 請求主體

<x-field-group>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>所需圖片的詳細文字描述。最大長度取決於模型，但較短、精確的提示通常能產生更好的結果。</x-field-desc>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>用於圖片生成的模型 ID。若未指定，系統預設為 `dall-e-2`。根據供應商的配置，可能也提供其他模型，如 `dall-e-3` 或 Google 的 `gemini` 模型。</x-field-desc>
  </x-field>
  <x-field data-name="image" data-type="string or array" data-required="false">
    <x-field-desc markdown>用於編輯的來源圖片。可以是一個 URL 或 Base64 編碼的字串。目前，此參數由 `gpt-image-1` 模型用於圖片編輯任務。</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>要生成的圖片數量。必須是 `1` 到 `10` 之間的整數。</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-default="1024x1024">
    <x-field-desc markdown>生成的圖片所需尺寸。支援的尺寸取決於所選模型。DALL·E 2 的常見值包括 `256x256`、`512x512` 和 `1024x1024`；DALL·E 3 則為 `1024x1024`、`1792x1024` 或 `1024x1792`。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false" data-default="url">
    <x-field-desc markdown>生成的圖片回傳的格式。必須是 `url` 或 `b64_json` 之一。`url` 的有效期限為一小時，而 `b64_json` 提供以 Base64 編碼的圖片資料。</x-field-desc>
  </x-field>
  <x-field data-name="quality" data-type="string" data-required="false" data-default="standard">
    <x-field-desc markdown>生成圖片的品質。僅 `dall-e-3` 支援。可以是 `standard` 以獲得更快的生成速度，或是 `hd` 以獲得更精細的細節和更高的品質，但成本可能更高。</x-field-desc>
  </x-field>
  <x-field data-name="style" data-type="string" data-required="false" data-default="vivid">
    <x-field-desc markdown>生成圖片的藝術風格。僅 `dall-e-3` 支援。可以是 `vivid` 以獲得超現實和戲劇性的效果，或是 `natural` 以獲得更逼真、較少加工的外觀。</x-field-desc>
  </x-field>
</x-field-group>

### 回應主體

API 回傳一個包含創建時間戳和生成圖片資料陣列的物件。

<x-field-group>
  <x-field data-name="created" data-type="integer">
    <x-field-desc markdown>一個 UNIX 時間戳，表示圖片生成啟動的時間。</x-field-desc>
  </x-field>
  <x-field data-name="data" data-type="array">
    <x-field-desc markdown>一個物件陣列，其中每個物件包含一張生成的圖片。陣列內物件的結構取決於 `response_format` 參數。</x-field-desc>
    <x-field data-name="object" data-type="object">
      <x-field-desc markdown>包含一個 `url` 或 `b64_json` 欄位，內含圖片資料。</x-field-desc>
      <x-field data-name="url" data-type="string">
        <x-field-desc markdown>可存取生成圖片的 URL。此 URL 是暫時性的，將會過期。</x-field-desc>
      </x-field>
      <x-field data-name="b64_json" data-type="string">
        <x-field-desc markdown>生成圖片的 Base64 編碼 JSON 字串。</x-field-desc>
      </x-field>
    </x-field>
  </x-field>
</x-field-group>

### 範例

#### 基本圖片生成

此範例展示了一個標準請求，使用預設的 `dall-e-2` 模型生成單張圖片。

```bash 請求 icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/images/generations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "prompt": "A photorealistic image of a cat programming on a laptop",
    "n": 1,
    "size": "1024x1024"
}'
```

伺服器回傳生成圖片的 URL。

```json 回應
{
  "created": 1678886400,
  "data": [
    {
      "url": "https://example.com/generated-images/image-xyz.png"
    }
  ]
}
```

#### 使用 DALL·E 3 生成並以 Base64 回應

此範例使用 `dall-e-3` 模型創建一張高品質、生動的圖片，並以 Base64 編碼字串回傳結果。

```bash 請求 icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/images/generations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "model": "dall-e-3",
    "prompt": "An oil painting of a futuristic city skyline at sunset, with flying cars",
    "n": 1,
    "size": "1792x1024",
    "quality": "hd",
    "style": "vivid",
    "response_format": "b64_json"
}'
```

回應中包含 Base64 資料，可直接解碼並儲存為圖片檔案。

```json 回應
{
  "created": 1678886400,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAAB...rest_of_base64_string"
    }
  ]
}
```

## 總結

您現在已具備使用圖片生成端點所需的資訊，包括理解創建和編輯圖片的請求參數，以及處理不同的回應格式。

若要進一步了解相關的 API 功能，請參閱以下文件：
<x-cards data-columns="2">
  <x-card data-title="聊天完成 API" data-icon="lucide:message-square" data-href="/api-reference/chat-completions">
    了解如何使用我們的聊天模型打造對話式體驗。
  </x-card>
  <x-card data-title="嵌入 API" data-icon="lucide:ruler" data-href="/api-reference/embeddings">
    探索如何為機器學習任務創建文字的數值表示。
  </x-card>
</x-cards>