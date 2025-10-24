# V2エンドポイント（推奨）

V2 APIは、AIGNEハブを介してさまざまなAIモデルとやり取りするための包括的なエンドポイント群を提供します。これらのエンドポイントは現在の標準であり、すべての新規インテグレーションで推奨されます。堅牢で機能豊富に設計されており、ユーザーレベルの認証、オプションのクレジットベースの課金チェック、詳細な使用状況の追跡機能を提供します。

これらのエンドポイントは統一されたゲートウェイとして機能し、さまざまなAIプロバイダーとのやり取りの複雑さを抽象化します。AIGNEハブを介してリクエストをルーティングすることで、AIモデルの使用に対する一元的な制御、監視、セキュリティを実現できます。

APIでの認証の詳細については、[認証](./api-reference-authentication.md)ガイドを参照してください。レガシーエンドポイントに関する情報については、[V1エンドポイント（レガシー）](./api-reference-v1-endpoints.md)のドキュメントをご覧ください。

## APIエンドポイントリファレンス

以下のセクションでは、利用可能な各V2エンドポイントの詳細な仕様を説明します。すべてのリクエストには、認証のために`Authorization: Bearer <TOKEN>`ヘッダーが必要です。

### GET /status

このエンドポイントは、AIGNEハブサービスの可用性、およびオプションで特定のモデルの可用性をチェックします。必要なAIプロバイダーが設定され、有効化され、アクティブな認証情報を持っていることを検証します。クレジットベースの課金が有効な場合、ユーザーの残高とモデルの料金設定もチェックします。

**クエリパラメータ**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="false" data-desc="可用性をチェックする特定のモデル。provider/model-nameの形式で指定します（例：openai/gpt-4o-mini）。"></x-field>
</x-field-group>

**リクエストの例**

```bash 特定のモデルの可用性をチェック icon=lucide:terminal
curl --location --request GET 'https://your-aigne-hub-instance.com/api/v2/status?model=openai/gpt-4o-mini' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>'
```

**レスポンスの例（成功）**

```json icon=lucide:braces
{
  "available": true
}
```

**レスポンスの例（失敗）**

```json icon=lucide:braces
{
  "available": false,
  "error": "Model rate not available"
}
```

### POST /chat/completions

このエンドポイントは、一連のメッセージに基づいてチャットモデルから応答を生成します。OpenAI Chat Completions API形式と互換性があるように設計されており、OpenAIとの直接的な統合の簡単な代替となります。標準応答とストリーミング応答の両方をサポートしています。

**リクエストボディ**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="使用するモデルの識別子（例：openai/gpt-4o-mini、google/gemini-1.5-pro-latest）。"></x-field>
  <x-field data-name="messages" data-type="array" data-required="true" data-desc="会話履歴を表すメッセージオブジェクトの配列。">
    <x-field data-name="role" data-type="string" data-required="true" data-desc="メッセージ作成者の役割。「system」、「user」、「assistant」、または「tool」のいずれかです。"></x-field>
    <x-field data-name="content" data-type="string | array" data-required="true" data-desc="メッセージの内容。文字列、またはマルチパートメッセージ（例：テキストと画像）の場合は配列になります。"></x-field>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-default="false" data-required="false" data-desc="trueに設定すると、応答は生成されるたびにチャンクでストリーミングされます。"></x-field>
  <x-field data-name="maxTokens" data-type="integer" data-required="false" data-desc="補完で生成するトークンの最大数。"></x-field>
  <x-field data-name="temperature" data-type="number" data-default="1" data-required="false" data-desc="ランダム性を制御します。値が低いほど、モデルはより決定論的になります。範囲：0.0から2.0。"></x-field>
  <x-field data-name="topP" data-type="number" data-default="1" data-required="false" data-desc="Nucleusサンプリングパラメータ。モデルはtopPの確率質量を持つトークンを考慮します。範囲：0.0から1.0。"></x-field>
  <x-field data-name="presencePenalty" data-type="number" data-default="0" data-required="false" data-desc="これまでのテキストに出現したかどうかに基づいて新しいトークンにペナルティを課します。範囲：-2.0から2.0。"></x-field>
  <x-field data-name="frequencyPenalty" data-type="number" data-default="0" data-required="false" data-desc="これまでのテキストにおける既存の頻度に基づいて新しいトークンにペナルティを課します。範囲：-2.0から2.0。"></x-field>
  <x-field data-name="tools" data-type="array" data-required="false" data-desc="モデルが呼び出す可能性のあるツールのリスト。現在、関数のみがサポートされています。"></x-field>
  <x-field data-name="toolChoice" data-type="string | object" data-required="false" data-desc="モデルによってどのツールが呼び出されるかを制御します。「none」、「auto」、「required」、または特定の関数を指定できます。"></x-field>
</x-field-group>

**リクエストの例**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/chat/completions' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/gpt-4o-mini",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Hello! What is the capital of France?"
        }
    ],
    "stream": false
}'
```

**レスポンスの例（非ストリーミング）**

```json icon=lucide:braces
{
  "role": "assistant",
  "text": "The capital of France is Paris.",
  "content": "The capital of France is Paris."
}
```

**レスポンスの例（ストリーミング）**

`stream`が`true`の場合、サーバーは`text/event-stream`で応答します。

```text サーバー送信イベント icon=lucide:file-text
data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":"The"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" capital"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" of"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" France"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" is"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":" Paris"},"logprobs":null,"finish_reason":null}]}

data: {"id":"chatcmpl-xxxxx","object":"chat.completion.chunk","created":1719543621,"model":"gpt-4o-mini-2024-07-18","choices":[{"index":0,"delta":{"content":"."},"logprobs":null,"finish_reason":null}]}

data: {"object":"chat.completion.usage","usage":{"promptTokens":23,"completionTokens":7,"totalTokens":30,"aigneHubCredits":0.00000485,"modelCallId":"mca_..."},"model":"openai/gpt-4o-mini"}

data: [DONE]
```

### POST /embeddings

このエンドポイントは、与えられた入力テキストに対してベクトル埋め込みを作成します。これは、セマンティック検索、クラスタリング、分類などのタスクに使用できます。

**リクエストボディ**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="使用する埋め込みモデルの識別子（例：openai/text-embedding-3-small）。"></x-field>
  <x-field data-name="input" data-type="string | array" data-required="true" data-desc="埋め込む入力テキスト。単一の文字列または文字列の配列を指定できます。"></x-field>
</x-field-group>

**リクエストの例**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/embeddings' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
}'
```

**レスポンスの例**

```json icon=lucide:braces
{
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.008922631,
        0.011883527,
        // ... さらに浮動小数点数が続く
        -0.013459821
      ],
      "index": 0
    }
  ]
}
```

### POST /image/generations

このエンドポイントは、指定された画像モデルを使用して、テキストプロンプトから画像を生成します。

**リクエストボディ**

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="使用する画像生成モデルの識別子（例：openai/dall-e-3）。"></x-field>
  <x-field data-name="prompt" data-type="string" data-required="true" data-desc="希望する画像の詳細なテキスト記述。"></x-field>
  <x-field data-name="n" data-type="integer" data-default="1" data-required="false" data-desc="生成する画像の数。1から10の間でなければなりません。"></x-field>
  <x-field data-name="size" data-type="string" data-required="false" data-desc="生成される画像のサイズ。サポートされる値はモデルによって異なります（例：「1024x1024」、「1792x1024」）。"></x-field>
  <x-field data-name="quality" data-type="string" data-default="standard" data-required="false" data-desc="画像の品質。サポートされる値は「standard」と「hd」です。"></x-field>
  <x-field data-name="style" data-type="string" data-default="vivid" data-required="false" data-desc="生成される画像のスタイル。サポートされる値は「vivid」と「natural」です。"></x-field>
  <x-field data-name="responseFormat" data-type="string" data-default="url" data-required="false" data-desc="生成された画像が返される形式。「url」または「b64_json」のいずれかでなければなりません。"></x-field>
</x-field-group>

**リクエストの例**

```bash icon=lucide:terminal
curl --location --request POST 'https://your-aigne-hub-instance.com/api/v2/image/generations' \
--header 'Authorization: Bearer <YOUR_API_TOKEN>' \
--header 'Content-Type: application/json' \
--data '{
    "model": "openai/dall-e-3",
    "prompt": "A cute cat astronaut floating in space, digital art",
    "n": 1,
    "size": "1024x1024",
    "responseFormat": "url"
}'
```

**レスポンスの例**

```json icon=lucide:braces
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

### オーディオエンドポイント

AIGNEハブはオーディオ処理用のエンドポイントを提供します。これらは現在、OpenAI APIへのリクエストをプロキシします。これらのエンドポイントに対するクレジットベースの課金システムとの完全な統合は開発中です。

#### POST /audio/transcriptions

オーディオを入力言語に文字起こしします。

#### POST /audio/speech

入力テキストからオーディオを生成します。

両方のオーディオエンドポイントについて、リクエストとレスポンスの形式は、オーディオの文字起こしと音声合成に関するOpenAI V1 APIと同一です。必要なパラメータの詳細については、公式のOpenAIドキュメントを参照してください。AIGNEハブは、リクエストを転送する前に、プロバイダーに必要なAPIキーを安全に注入します。