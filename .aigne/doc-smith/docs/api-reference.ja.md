# API リファレンス

このドキュメントは、AIGNE Hub RESTful API の技術仕様を提供します。このガイドに従うことで、チャット補完、画像生成、埋め込みのコアエンドポイントを認証し、対話する方法を理解し、アプリケーションとの堅牢なバックエンド統合を可能にします。

AIGNE Hub API は、様々な基盤となる AI モデルへの統一されたインターフェースを提供し、個々のプロバイダー API の複雑さを抽象化します。すべてのリクエストは API キーを使用して認証されます。

以下の図は、アプリケーション、AIGNE Hub API、および基盤となる AI モデル間の相互作用を示しています。

```d2
direction: down

Your-Application: {
  label: "あなたのアプリケーション"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub API"
  shape: rectangle
  grid-columns: 2

  Chat-Completions: {
    label: "チャット補完"
  }

  Image-Generation: {
    label: "画像生成"
  }

  Embeddings: {
    label: "埋め込み"
  }

  Audio: {
    label: "音声サービス"
  }
}

AI-Models: {
  label: "基盤となる AI モデル"
  shape: rectangle

  OpenAI: {
    label: "OpenAI"
  }

  Anthropic: {
    label: "Anthropic"
  }

  Mistral: {
    label: "Mistral"
  }

  Others: {
    label: "..."
  }
}

Your-Application -> AIGNE-Hub: "キー付き API リクエスト"
AIGNE-Hub.Chat-Completions -> AI-Models.OpenAI
AIGNE-Hub.Chat-Completions -> AI-Models.Anthropic
AIGNE-Hub.Image-Generation -> AI-Models.OpenAI
AIGNE-Hub.Embeddings -> AI-Models.Mistral
AIGNE-Hub.Audio -> AI-Models.Others
AI-Models -> AIGNE-Hub: "モデルの応答"
AIGNE-Hub -> Your-Application: "統一された API 応答"
```

各エンドポイントの詳細な仕様（リクエストとレスポンスのスキーマを含む）については、特定のサブセクションを参照してください。

<x-cards data-columns="3">
  <x-card data-title="チャット補完" data-icon="lucide:message-square-text" data-href="/api-reference/chat-completions">
    チャット補完エンドポイントの詳細仕様。リクエスト/レスポンススキーマとストリーミングサポートを含みます。
  </x-card>
  <x-card data-title="画像生成" data-icon="lucide:image" data-href="/api-reference/image-generation">
    画像生成エンドポイントのリファレンス。サポートされるモデルやサイズと品質に関するパラメータを網羅しています。
  </x-card>
  <x-card data-title="埋め込み" data-icon="lucide:codesandbox" data-href="/api-reference/embeddings">
    セマンティック検索やその他の ML タスクで使用するためにテキストのベクトル表現を作成するためのドキュメント。
  </x-card>
</x-cards>

<x-cards>
  <x-card data-title="API 認証" data-icon="lucide:key-round" data-href="/api-reference/authentication">
    OAuth と API キーを使用して AIGNE Hub API へのリクエストを安全に認証する方法を説明します。
  </x-card>
</x-cards>

## エンドポイント

以下の表は、利用可能な API エンドポイントの概要を示しています。

| Method | Endpoint                    | Description                                        |
| :----- | :-------------------------- | :------------------------------------------------- |
| `POST` | `/chat/completions`         | 指定されたチャットの会話に対する応答を生成します。|
| `POST` | `/embeddings`               | 指定された入力テキストのベクトル埋め込みを生成します。|
| `POST` | `/image/generations`        | テキストプロンプトに基づいて画像を生成します。           |
| `POST` | `/audio/transcriptions`     | 音声を入力言語に文字起こしします。         |
| `POST` | `/audio/speech`             | 入力テキストから音声を生成します。               |
| `GET`  | `/status`                   | サービスとモデルの可用性を確認します。 |

## まとめ

このセクションでは、AIGNE Hub API の概要を説明し、認証と利用可能なエンドポイントの概要について触れました。実践的な統合については、各エンドポイントの詳細なドキュメントに進んでください。

- **対話型 AI の構築には:** [チャット補完 API](./api-reference-chat-completions.md) をご覧ください。
- **画像の生成には:** [画像生成 API](./api-reference-image-generation.md) をご覧ください。
- **テキスト分析と検索には:** [埋め込み API](./api-reference-embeddings.md) をご利用ください。