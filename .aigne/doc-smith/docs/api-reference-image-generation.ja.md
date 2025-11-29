# 画像生成

このドキュメントは、画像生成エンドポイントの技術仕様を提供します。このガイドに従うことで、リクエストの構造化、モデルとパラメータの指定、および結果の画像データの処理方法を学び、AIを活用した画像作成をアプリケーションに統合できるようになります。

AIGNE Hub API を使用すると、テキストプロンプトから新しい画像を生成したり、既存の画像を編集したりできます。その他の AI 機能の詳細については、[チャット補完](./api-reference-chat-completions.md) および [埋め込み](./api-reference-embeddings.md) のドキュメントを参照してください。

## 画像を作成

テキストによる説明（プロンプト）に基づいて画像を生成します。編集するために既存の画像を提供することもできます。

**エンドポイント**

```sh
POST /api/images/generations
```

このエンドポイントは、新しい画像を作成または既存の画像を編集し、指定された形式で画像データを返します。

### リクエストボディ

<x-field-group>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>希望する画像の詳細なテキスト説明。最大長はモデルによって異なりますが、短く正確なプロンプトの方が良い結果が得られることが多いです。</x-field-desc>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>画像生成に使用するモデルID。指定しない場合、システムはデフォルトで `dall-e-2` を使用します。プロバイダーの設定によっては、`dall-e-3` や Google の `gemini` モデルなども利用可能です。</x-field-desc>
  </x-field>
  <x-field data-name="image" data-type="string or array" data-required="false">
    <x-field-desc markdown>編集用のソース画像。URL または Base64 エンコードされた文字列を指定できます。現在、このパラメータは画像編集タスクのために `gpt-image-1` モデルで利用されています。</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>生成する画像の数。`1` から `10` までの整数である必要があります。</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-default="1024x1024">
    <x-field-desc markdown>生成される画像の希望する寸法。サポートされるサイズは選択されたモデルによって異なります。一般的な値には、DALL·E 2 の場合は `256x256`、`512x512`、`1024x1024` があり、DALL·E 3 の場合は `1024x1024`、`1792x1024`、または `1024x1792` があります。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false" data-default="url">
    <x-field-desc markdown>生成された画像が返される形式。`url` または `b64_json` のいずれかである必要があります。`url` は1時間アクセス可能ですが、`b64_json` は Base64 でエンコードされた画像データを提供します。</x-field-desc>
  </x-field>
  <x-field data-name="quality" data-type="string" data-required="false" data-default="standard">
    <x-field-desc markdown>生成される画像の品質。`dall-e-3` のみでサポートされています。より高速な生成のためには `standard`、より詳細で高品質な結果を得るためには `hd` を指定できますが、コストが増加する場合があります。</x-field-desc>
  </x-field>
  <x-field data-name="style" data-type="string" data-required="false" data-default="vivid">
    <x-field-desc markdown>生成される画像の芸術的スタイル。`dall-e-3` のみでサポートされています。超現実的でドラマチックな結果を得るには `vivid` を、より写実的で加工の少ない見た目にするには `natural` を指定できます。</x-field-desc>
  </x-field>
</x-field-group>

### レスポンスボディ

API は、作成タイムスタンプと生成された画像データの配列を含むオブジェクトを返します。

<x-field-group>
  <x-field data-name="created" data-type="integer">
    <x-field-desc markdown>画像生成が開始された時点を示す UNIX タイムスタンプ。</x-field-desc>
  </x-field>
  <x-field data-name="data" data-type="array">
    <x-field-desc markdown>各オブジェクトが1つの生成画像を含むオブジェクトの配列。配列内のオブジェクトの構造は `response_format` パラメータに依存します。</x-field-desc>
    <x-field data-name="object" data-type="object">
      <x-field-desc markdown>`url` または `b64_json` フィールドに画像データが含まれます。</x-field-desc>
      <x-field data-name="url" data-type="string">
        <x-field-desc markdown>生成された画像にアクセスできる URL。この URL は一時的なものであり、期限切れになります。</x-field-desc>
      </x-field>
      <x-field data-name="b64_json" data-type="string">
        <x-field-desc markdown>生成された画像の Base64 エンコードされた JSON 文字列。</x-field-desc>
      </x-field>
    </x-field>
  </x-field>
</x-field-group>

### 例

#### 基本的な画像生成

この例は、デフォルトの `dall-e-2` モデルを使用して単一の画像を生成する標準的なリクエストを示しています。

```bash リクエスト icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/images/generations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "prompt": "A photorealistic image of a cat programming on a laptop",
    "n": 1,
    "size": "1024x1024"
}'
```

サーバーは生成された画像の URL を返します。

```json レスポンス
{
  "created": 1678886400,
  "data": [
    {
      "url": "https://example.com/generated-images/image-xyz.png"
    }
  ]
}
```

#### DALL·E 3 と Base64 レスポンスでの生成

この例では、`dall-e-3` モデルを使用して高品質で鮮やかな画像を生成し、結果を Base64 エンコードされた文字列として返します。

```bash リクエスト icon=lucide:terminal
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

レスポンスには Base64 データが含まれており、これを直接デコードして画像ファイルとして保存できます。

```json レスポンス
{
  "created": 1678886400,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAAB...rest_of_base64_string"
    }
  ]
}
```

## 概要

これで、画像生成エンドポイントを使用するために必要な情報を入手しました。これには、画像の作成および編集のためのリクエストパラメータの理解、さまざまなレスポンス形式の処理方法が含まれます。

関連する API 機能についての詳細は、以下のドキュメントを参照してください。
<x-cards data-columns="2">
  <x-card data-title="チャット補完 API" data-icon="lucide:message-square" data-href="/api-reference/chat-completions">
    チャットモデルを使用して会話体験を構築する方法を学びます。
  </x-card>
  <x-card data-title="埋め込み API" data-icon="lucide:ruler" data-href="/api-reference/embeddings">
    機械学習タスクのためにテキストの数値表現を作成する方法を発見します。
  </x-card>
</x-cards>