# V1エンドポイント（レガシー）

このセクションでは、レガシー V1 API エンドポイントに関するドキュメントを提供します。これらのエンドポイントは、古いインテグレーションをサポートし、後方互換性を確保するために維持されています。すべての新規開発においては、ユーザーレベルの認証やクレジットベースの課金など、強化された機能を提供する [V2エンドポイント](./api-reference-v2-endpoints.md) の使用を強く推奨します。

すべての V1 エンドポイントには認証が必要です。リクエストには、Bearer トークンを含む `Authorization` ヘッダーを含める必要があります。

---

## チャット補完

このエンドポイントは、指定された会話に対する応答を生成します。ストリーミングモードと非ストリーミングモードの両方をサポートしています。

**エンドポイント**

```
POST /api/v1/chat/completions
```

### リクエストボディ

リクエストボディは、以下のパラメータを持つ JSON オブジェクトである必要があります。

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="gpt-3.5-turbo">
    <x-field-desc markdown>使用するモデルのID。どのモデルがチャットAPIで動作するかの詳細については、モデルエンドポイントの互換性テーブルを参照してください。</x-field-desc>
  </x-field>
  <x-field data-name="messages" data-type="array" data-required="true">
    <x-field-desc markdown>これまでの会話を構成するメッセージのリスト。</x-field-desc>
    <x-field data-name="role" data-type="string" data-required="true">
       <x-field-desc markdown>メッセージ作成者の役割。`system`、`user`、`assistant`、`tool` のいずれかである必要があります。</x-field-desc>
    </x-field>
    <x-field data-name="content" data-type="string" data-required="true">
       <x-field-desc markdown>メッセージの内容。</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-required="false" data-default="false">
    <x-field-desc markdown>設定した場合、ChatGPTのように部分的なメッセージ差分が送信されます。トークンは利用可能になり次第、データのみのサーバー送信イベントとして送信され、ストリームは `data: [DONE]` メッセージで終了します。</x-field-desc>
  </x-field>
  <x-field data-name="temperature" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>使用するサンプリング温度。0から2の間の値を指定します。0.8のような高い値は出力をよりランダムにし、0.2のような低い値はより焦点を絞った決定論的な出力にします。</x-field-desc>
  </x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false">
    <x-field-desc markdown>チャット補完で生成するトークンの最大数。</x-field-desc>
  </x-field>
  <x-field data-name="topP" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>温度（temperature）によるサンプリングの代替手法で、ニュークリアスサンプリングと呼ばれます。この方法では、モデルは top_p の確率質量を持つトークンの結果を考慮します。したがって、0.1 は、上位 10% の確率質量を構成するトークンのみが考慮されることを意味します。</x-field-desc>
  </x-field>
  <x-field data-name="presencePenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>-2.0から2.0の間の数値。正の値は、これまでのテキストに既出かどうかに基づいて新しいトークンにペナルティを課し、モデルが新しいトピックについて話す可能性を高めます。</x-field-desc>
  </x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>-2.0から2.0の間の数値。正の値は、これまでのテキストにおける既存の頻度に基づいて新しいトークンにペナルティを課し、モデルが同じ行を逐語的に繰り返す可能性を低くします。</x-field-desc>
  </x-field>
</x-field-group>

### リクエストの例

```bash リクエスト例
curl -X POST \
  https://your-hub-url.com/api/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": "Hello, who are you?"
            }
        ]
      }'
```

### レスポンスの例（非ストリーミング）

```json レスポンス
{
  "role": "assistant",
  "text": "I am a large language model, trained by Google.",
  "content": "I am a large language model, trained by Google.",
  "usage": {
    "inputTokens": 8,
    "outputTokens": 9,
    "aigneHubCredits": 0.00012
  }
}
```

---

## 埋め込み

このエンドポイントは、入力テキストを表す埋め込みベクトルを作成します。

**エンドポイント**

```
POST /api/v1/embeddings
```

### リクエストボディ

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>埋め込みを作成するために使用するモデルのID。</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>埋め込む入力テキスト。文字列またはトークンの配列としてエンコードされます。単一のリクエストで複数の入力を埋め込むには、文字列の配列を渡します。</x-field-desc>
  </x-field>
</x-field-group>

### リクエストの例

```bash リクエスト例
curl -X POST \
  https://your-hub-url.com/api/v1/embeddings \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "text-embedding-ada-002",
        "input": "The food was delicious and the waiter..."
      }'
```

### レスポンスの例

```json レスポンス
{
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.006929283495992422,
        -0.005336422473192215,
        ...
        -4.547132266452536e-05
      ],
      "index": 0
    }
  ]
}
```

---

## 画像生成

このエンドポイントは、テキストプロンプトに基づいて画像を生成します。

**エンドポイント**

```
POST /api/v1/image/generations
```

### リクエストボディ

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-default="dall-e-2">
    <x-field-desc markdown>画像生成に使用するモデル。</x-field-desc>
  </x-field>
  <x-field data-name="prompt" data-type="string" data-required="true">
    <x-field-desc markdown>希望する画像についてのテキスト説明。最大長はモデルに依存します。</x-field-desc>
  </x-field>
  <x-field data-name="n" data-type="integer" data-required="false" data-default="1">
    <x-field-desc markdown>生成する画像の数。1から10の間である必要があります。</x-field-desc>
  </x-field>
  <x-field data-name="size" data-type="string" data-required="false">
    <x-field-desc markdown>生成される画像のサイズ。DALL·E 2 の場合は `256x256`、`512x512`、`1024x1024` のいずれかである必要があります。DALL·E 3 モデルの場合は `1024x1024`、`1792x1024`、`1024x1792` のいずれかである必要があります。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="string" data-required="false">
    <x-field-desc markdown>生成された画像が返される形式。`url` または `b64_json` のいずれかである必要があります。</x-field-desc>
  </x-field>
</x-field-group>

### リクエストの例

```bash リクエスト例
curl -X POST \
  https://your-hub-url.com/api/v1/image/generations \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "dall-e-3",
        "prompt": "A cute corgi wearing a space suit",
        "n": 1,
        "size": "1024x1024"
      }'
```

### レスポンスの例

```json レスポンス
{
  "images": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/..."
    }
  ],
  "data": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/..."
    }
  ],
  "model": "dall-e-3",
  "usage": {
    "aigneHubCredits": 0.04
  }
}
```

---

## 音声文字起こし

このエンドポイントは、音声を元の言語に文字起こしします。アップストリームプロバイダーのサービスへのプロキシとして機能します。

**エンドポイント**

```
POST /api/v1/audio/transcriptions
```

### リクエストボディ

リクエストボディは、オーディオファイルとモデル名を含む `multipart/form-data` オブジェクトである必要があります。このエンドポイントは `api.openai.com/v1/audio/transcriptions` に直接プロキシされるため、詳細なパラメータ仕様については [OpenAI の公式ドキュメント](https://platform.openai.com/docs/api-reference/audio/createTranscription) を参照してください。

### リクエストの例

```bash リクエスト例
curl -X POST \
  https://your-hub-url.com/api/v1/audio/transcriptions \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F file="@/path/to/your/audio.mp3" \
  -F model="whisper-1"
```

### レスポンス

レスポンス形式は、OpenAI Audio API が文字起こしのために返すものと同一になります。

---

## 音声合成

このエンドポイントは、入力テキストから音声を生成します。アップストリームプロバイダーのサービスへのプロキシとして機能します。

**エンドポイント**

```
POST /api/v1/audio/speech
```

### リクエストボディ

リクエストボディは JSON オブジェクトである必要があります。このエンドポイントは `api.openai.com/v1/audio/speech` に直接プロキシされるため、詳細なパラメータ仕様については [OpenAI の公式ドキュメント](https://platform.openai.com/docs/api-reference/audio/createSpeech) を参照してください。

### リクエストの例

```bash リクエスト例
curl -X POST \
  https://your-hub-url.com/api/v1/audio/speech \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "tts-1",
        "input": "The quick brown fox jumped over the lazy dog.",
        "voice": "alloy"
      }' \
  --output speech.mp3
```

### レスポンス

レスポンスは、リクエストで指定された形式（例：MP3）で生成されたオーディオファイルになります。

---

## まとめ

このガイドでは、AIGNE Hub で利用可能なレガシー V1 API エンドポイントについて詳しく説明しました。これらのエンドポイントは機能しますが、新しい機能が追加されない可能性があります。最新の改善点を活用し、長期的な互換性を確保するために、[V2エンドポイント](./api-reference-v2-endpoints.md) への移行をお勧めします。API のセキュリティと認証に関する詳細については、[認証](./api-reference-authentication.md) のセクションを参照してください。