# チャット補完

このドキュメントでは、チャット補完 API エンドポイントの詳細な仕様について説明します。このガイドに従うことで、会話型 AI 応答の生成、ストリーミングの管理、および堅牢なアプリケーションを構築するためのモデル固有のパラメータの利用方法を学ぶことができます。このエンドポイントは、インタラクティブなテキストベースの体験を作成するための中核となります。

チャット補完 API を使用すると、大規模言語モデルを活用してさまざまな会話タスクに対応するアプリケーションを構築できます。一連のメッセージを入力として提供すると、モデルはテキストベースの応答を返します。

以下の図は、標準およびストリーミング API 呼び出しの両方におけるリクエストとレスポンスのフローを示しています。

```d2
shape: sequence_diagram

Client: {
  label: "クライアントアプリケーション"
  shape: c4-person
}

AIGNE-Hub-API: {
  label: "AIGNE Hub API"
}

AI-Model: {
  label: "AI モデル"
}

Standard-Request: {
  label: "標準リクエスト (stream: false)"
  Client -> AIGNE-Hub-API: "1. POST /api/chat/completions"
  AIGNE-Hub-API -> AI-Model: "2. メッセージを処理"
  AI-Model -> AIGNE-Hub-API: "3. 完全な補完を返す"
  AIGNE-Hub-API -> Client: "4. 単一の JSON 応答を送信"
}

Streaming-Request: {
  label: "ストリーミングリクエスト (stream: true)"
  Client -> AIGNE-Hub-API: "1. POST /api/chat/completions\n(stream=true)"
  AIGNE-Hub-API -> AI-Model: "2. メッセージを処理"
  loop: "生成中" {
    AI-Model -> AIGNE-Hub-API: "3a. トークン差分をストリーム"
    AIGNE-Hub-API -> Client: "3b. チャンクをストリーム (SSE)"
  }
  AI-Model -> AIGNE-Hub-API: "4. 使用状況を含む最終チャンクを送信"
  AIGNE-Hub-API -> Client: "5. [DONE] メッセージをストリーム"
}

```

関連機能については、[画像生成](./api-reference-image-generation.md)および[埋め込み](./api-reference-embeddings.md) API ドキュメントを参照してください。

## チャット補完の作成

指定されたチャットの会話に対してモデルの応答を作成します。

`POST /api/chat/completions`

### リクエストボディ

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-default="gpt-3.5-turbo">
    <x-field-desc markdown>使用するモデルの ID。どのモデルがチャット API で動作するかについての詳細は、モデルエンドポイントの互換性テーブルを参照してください。</x-field-desc>
  </x-field>
  <x-field data-name="messages" data-type="array" data-required="true">
    <x-field-desc markdown>これまでの会話を構成するメッセージのリスト。メッセージオブジェクトの構造については、以下を参照してください。</x-field-desc>
    <x-field data-name="message" data-type="object">
      <x-field-desc markdown>各メッセージオブジェクトには `role` と `content` が必要です。</x-field-desc>
      <x-field data-name="role" data-type="string" data-required="true">
        <x-field-desc markdown>メッセージ作成者の役割。`system`、`user`、`assistant`、または `tool` が指定できます。</x-field-desc>
      </x-field>
      <x-field data-name="content" data-type="string or array" data-required="true">
        <x-field-desc markdown>メッセージの内容。これは文字列、またはマルチモーダルモデル用のコンテンツパーツの配列（例：テキストと画像の URL）にすることができます。</x-field-desc>
      </x-field>
      <x-field data-name="name" data-type="string" data-required="false">
        <x-field-desc markdown>参加者のオプションの名前。メッセージの作成者に関するコンテキストをモデルに提供します。</x-field-desc>
      </x-field>
      <x-field data-name="tool_calls" data-type="array" data-required="false">
        <x-field-desc markdown>関数呼び出しなど、モデルによって生成されたツールコール。</x-field-desc>
      </x-field>
      <x-field data-name="tool_call_id" data-type="string" data-required="false">
        <x-field-desc markdown>役割が `tool` の場合に必須。このメッセージが応答しているツールコールの ID。</x-field-desc>
      </x-field>
    </x-field>
  </x-field>
  <x-field data-name="temperature" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>ランダム性を制御します。値を低くすると、ランダム性の低い補完になります。温度がゼロに近づくにつれて、モデルは決定的で反復的になります。範囲：`0` から `2`。</x-field-desc>
  </x-field>
  <x-field data-name="top_p" data-type="number" data-required="false" data-default="1">
    <x-field-desc markdown>ニュークリアスサンプリングにより多様性を制御します。`0.5` は、尤度で重み付けされたすべての選択肢の半分が考慮されることを意味します。範囲：`0.1` から `1`。</x-field-desc>
  </x-field>
  <x-field data-name="stream" data-type="boolean" data-required="false" data-default="false">
    <x-field-desc markdown>`true` に設定すると、部分的なメッセージ差分がサーバーセントイベントとして送信されます。ストリームは `data: [DONE]` メッセージで終了します。</x-field-desc>
  </x-field>
  <x-field data-name="max_tokens" data-type="integer" data-required="false">
    <x-field-desc markdown>生成するトークンの最大数。入力トークンと生成されたトークンの合計長は、モデルのコンテキスト長によって制限されます。</x-field-desc>
  </x-field>
  <x-field data-name="presence_penalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>`-2.0` から `2.0` までの数値。正の値は、これまでのテキストに新しいトークンが出現したかどうかに基づいてペナルティを課し、モデルが新しいトピックについて話す可能性を高めます。</x-field-desc>
  </x-field>
  <x-field data-name="frequency_penalty" data-type="number" data-required="false" data-default="0">
    <x-field-desc markdown>`-2.0` から `2.0` までの数値。正の値は、これまでのテキストにおける既存の頻度に基づいて新しいトークンにペナルティを課し、モデルが同じ行を逐語的に繰り返す可能性を低減させます。</x-field-desc>
  </x-field>
  <x-field data-name="tools" data-type="array" data-required="false">
    <x-field-desc markdown>モデルが呼び出す可能性のあるツールのリスト。現在、ツールとしては関数のみがサポートされています。</x-field-desc>
  </x-field>
  <x-field data-name="tool_choice" data-type="string or object" data-required="false">
    <x-field-desc markdown>モデルによってどのツールが（もしあれば）呼び出されるかを制御します。`'none'`、`'auto'`、`'required'`、または呼び出す関数を指定するオブジェクトが指定できます。</x-field-desc>
  </x-field>
  <x-field data-name="response_format" data-type="object" data-required="false">
    <x-field-desc markdown>モデルが出力しなければならない形式を指定するオブジェクト。`{ "type": "json_object" }` に設定すると JSON モードが有効になります。</x-field-desc>
  </x-field>
</x-field-group>

### 例

#### 基本的なリクエスト

この例は、モデルとの簡単な会話を示しています。

```bash cURL リクエスト icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/chat/completions' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model": "gpt-3.5-turbo",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Hello! Can you explain what AIGNE Hub is in simple terms?"
        }
    ]
}'
```

#### ストリーミングリクエスト

応答をイベントのストリームとして受信するには、`stream` パラメータを `true` に設定します。

```bash cURL ストリームリクエスト icon=lucide:terminal
curl --location 'https://your-aigne-hub-instance.com/api/chat/completions' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--header 'Accept: text/event-stream' \
--data '{
    "model": "gpt-3.5-turbo",
    "messages": [
        {
            "role": "user",
            "content": "Write a short story about a robot who discovers music."
        }
    ],
    "stream": true
}'
```

### レスポンスボディ

#### 標準レスポンス

`stream` が `false` または設定されていない場合、標準の JSON オブジェクトが返されます。

<x-field-group>
  <x-field data-name="role" data-type="string" data-desc="このメッセージの作成者の役割。常に 'assistant' です。"></x-field>
  <x-field data-name="content" data-type="string" data-desc="モデルによって生成されたメッセージの内容。"></x-field>
  <x-field data-name="tool_calls" data-type="array" data-required="false" data-desc="モデルによって生成されたツールコール（もしあれば）。"></x-field>
</x-field-group>

**標準レスポンスの例**

```json レスポンスボディ
{
  "role": "assistant",
  "content": "AIGNE Hub は、さまざまなプロバイダーからの AI モデルとのやり取りを管理する中央集権的なゲートウェイです。API アクセスを簡素化し、請求とクレジットを処理し、使用状況とコストに関する分析を提供し、組織の AI サービスのための一元管理ポイントとして機能します。"
}
```

#### ストリーミングレスポンス

`stream` が `true` の場合、API は `text/event-stream` チャンクのストリームを返します。各チャンクは JSON オブジェクトです。

<x-field-group>
  <x-field data-name="delta" data-type="object" data-desc="メッセージ差分のチャンク。">
    <x-field data-name="role" data-type="string" data-required="false" data-desc="作成者の役割。通常は 'assistant' です。"></x-field>
    <x-field data-name="content" data-type="string" data-required="false" data-desc="メッセージの部分的な内容。"></x-field>
    <x-field data-name="tool_calls" data-type="array" data-required="false" data-desc="部分的なツールコール情報。"></x-field>
  </x-field>
  <x-field data-name="usage" data-type="object" data-desc="最終チャンクに存在し、トークン使用量の統計情報が含まれます。">
    <x-field data-name="prompt_tokens" data-type="integer" data-desc="プロンプト内のトークン数。"></x-field>
    <x-field data-name="completion_tokens" data-type="integer" data-desc="生成された補完内のトークン数。"></x-field>
    <x-field data-name="total_tokens" data-type="integer" data-desc="リクエストで使用された合計トークン数。"></x-field>
  </x-field>
</x-field-group>

**ストリームチャンクの例**

```text イベントストリーム
data: {"delta":{"role":"assistant","content":"Unit "}}

data: {"delta":{"content":"734,"}}

data: {"delta":{"content":" a sanitation "}}

data: {"delta":{"content":"and maintenance "}}

data: {"delta":{"content":"robot, hummed..."}}

data: {"usage":{"promptTokens":15,"completionTokens":100,"totalTokens":115}}

data: [DONE]
```

## まとめ

チャット補完エンドポイントは、会話型 AI をアプリケーションに統合するための強力なツールです。ストリーミングやツールの使用を含むさまざまなパラメータを通じて柔軟性を提供し、幅広いユースケースをサポートします。

他の利用可能な API エンドポイントに関する詳細については、以下のドキュメントを参照してください。

<x-cards data-columns="2">
  <x-card data-title="画像生成" data-icon="lucide:image" data-href="/api-reference/image-generation">
    AI モデルを使用して画像を生成および操作する方法を学びます。
  </x-card>
  <x-card data-title="埋め込み" data-icon="lucide:bot" data-href="/api-reference/embeddings">
    機械学習タスクのためにテキストのベクトル表現を作成する方法を理解します。
  </x-card>
</x-cards>