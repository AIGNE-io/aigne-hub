# 图像生成

本文档提供了图像生成端点的技术规范。遵循本指南，您将能够通过构建请求、指定模型和参数以及处理返回的图像数据，将 AI 驱动的图像创建功能集成到您的应用程序中。

AIGNE Hub API 允许您根据文本提示生成新图像或编辑现有图像。有关其他 AI 功能的详细信息，请参阅 [聊天补全](./api-reference-chat-completions.md) 和 [嵌入](./api-reference-embeddings.md) 文档。

## 创建图像

根据文本描述（提示）生成图像。您还可以提供现有图像进行编辑。

**端点**

```sh
POST /api/images/generations
```

该端点会创建新图像或编辑现有图像，并以指定格式返回图像数据。

### 请求体

<x-field-group>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>所需图像的详细文本描述。最大长度取决于模型，但更短、更精确的提示通常会产生更好的结果。</x-field-desc>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>用于图像生成的模型 ID。如果未指定，系统默认为 `dall-e-2`。根据提供商的配置，可能还支持其他模型，如 `dall-e-3` 或 Google 的 `gemini` 模型。</x-field-desc>
  </x-field>
  <x-field data-name="image" data-type="string or array" data-required="false">
    <x-field-desc markdown>用于编辑的源图像。可以是 URL 或 Base64 编码的字符串。目前，该参数由 `gpt-image-1` 模型用于图像编辑任务。</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>要生成的图像数量。必须是 `1` 到 `10` 之间的整数。</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-default="1024x1024">
    <x-field-desc markdown>生成图像所需的分辨率。支持的尺寸取决于所选模型。DALL·E 2 的常用值包括 `256x256`、`512x512` 和 `1024x1024`，而 DALL·E 3 则为 `1024x1024`、`1792x1024` 或 `1024x1792`。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false" data-default="url">
    <x-field-desc markdown>返回生成图像的格式。必须是 `url` 或 `b64_json` 之一。`url` 的有效期为一小时，而 `b64_json` 提供 Base64 编码的图像数据。</x-field-desc>
  </x-field>
  <x-field data-name="quality" data-type="string" data-required="false" data-default="standard">
    <x-field-desc markdown>生成图像的质量。仅 `dall-e-3` 支持。可以是 `standard` 以加快生成速度，或 `hd` 以增强细节和提高质量，但这可能会增加成本。</x-field-desc>
  </x-field>
  <x-field data-name="style" data-type="string" data-required="false" data-default="vivid">
    <x-field-desc markdown>生成图像的艺术风格。仅 `dall-e-3` 支持。可以是 `vivid` 以获得超现实和戏剧性的效果，或 `natural` 以获得更逼真、更少处理痕迹的外观。</x-field-desc>
  </x-field>
</x-field-group>

### 响应体

API 返回一个包含创建时间戳和生成图像数据数组的对象。

<x-field-group>
  <x-field data-name="created" data-type="integer">
    <x-field-desc markdown>一个 UNIX 时间戳，表示图像生成任务的发起时间。</x-field-desc>
  </x-field>
  <x-field data-name="data" data-type="array">
    <x-field-desc markdown>一个对象数组，其中每个对象包含一个生成的图像。数组内对象的结构取决于 `response_format` 参数。</x-field-desc>
    <x-field data-name="object" data-type="object">
      <x-field-desc markdown>包含 `url` 或 `b64_json` 字段以及相应的图像数据。</x-field-desc>
      <x-field data-name="url" data-type="string">
        <x-field-desc markdown>可用于访问生成图像的 URL。此 URL 是临时的，将会过期。</x-field-desc>
      </x-field>
      <x-field data-name="b64_json" data-type="string">
        <x-field-desc markdown>生成图像的 Base64 编码的 JSON 字符串。</x-field-desc>
      </x-field>
    </x-field>
  </x-field>
</x-field-group>

### 示例

#### 基本图像生成

此示例演示了使用默认的 `dall-e-2` 模型生成单个图像的标准请求。

```bash 请求 icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/images/generations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "prompt": "A photorealistic image of a cat programming on a laptop",
    "n": 1,
    "size": "1024x1024"
}'
```

服务器返回生成图像的 URL。

```json 响应
{
  "created": 1678886400,
  "data": [
    {
      "url": "https://example.com/generated-images/image-xyz.png"
    }
  ]
}
```

#### 使用 DALL·E 3 生成并以 Base64 格式响应

此示例使用 `dall-e-3` 模型创建一张高质量、风格鲜明的图像，并以 Base64 编码字符串的形式返回结果。

```bash 请求 icon=lucide:terminal
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

响应中包含 Base64 数据，可以直接解码并保存为图像文件。

```json 响应
{
  "created": 1678886400,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAAB...rest_of_base64_string"
    }
  ]
}
```

## 总结

您现在已掌握使用图像生成端点所需的信息，包括理解用于创建和编辑图像的请求参数，以及如何处理不同的响应格式。

如需进一步了解相关的 API 功能，请参阅以下文档：
<x-cards data-columns="2">
  <x-card data-title="聊天补全 API" data-icon="lucide:message-square" data-href="/api-reference/chat-completions">
    了解如何使用我们的聊天模型构建对话式体验。
  </x-card>
  <x-card data-title="嵌入 API" data-icon="lucide:ruler" data-href="/api-reference/embeddings">
    探索如何为机器学习任务创建文本的数值表示。
  </x-card>
</x-cards>