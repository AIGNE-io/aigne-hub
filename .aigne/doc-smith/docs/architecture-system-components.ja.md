# システムコンポーネント

AIGNE Hub はモジュラーアーキテクチャで設計されており、システムの各部分が明確に定義された個別の責任を持つことが保証されています。この関心の分離により、保守性、スケーラビリティ、およびセキュリティが向上します。主要な機能ブロックには、API ゲートウェイ、認証システム、使用状況トラッカー、およびオプションの課金モジュールが含まれます。これらのコンポーネントは連携して、AI リクエストを効率的かつ安全に処理します。

以下の図は、クライアントリクエストの受信から AI プロバイダーからのレスポンスの返却まで、これらのコアコンポーネント間の高レベルなインタラクションを示しています。

```d2
direction: down

Client-Applications: {
  label: "クライアントアプリケーション"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  API-Gateway: {
    label: "API ゲートウェイ"
    shape: rectangle
  }

  Authentication-System: {
    label: "認証システム"
    shape: rectangle
  }

  AI-Provider-Handler: {
    label: "AI プロバイダーハンドラー"
    shape: rectangle
  }

  Usage-Tracker: {
    label: "使用状況トラッカー"
    shape: rectangle
  }

  Billing-Module: {
    label: "課金モジュール"
    shape: rectangle
  }

  Database: {
    label: "データベース"
    shape: cylinder
  }
}

External-AI-Provider: {
  label: "外部 AI プロバイダー\n(例: OpenAI)"
  shape: rectangle
}

Client-Applications -> AIGNE-Hub.API-Gateway: "1. API リクエスト"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Authentication-System: "2. ID の検証"
AIGNE-Hub.Authentication-System -> AIGNE-Hub.API-Gateway: "3. 認証済み"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.AI-Provider-Handler: "4. リクエストのルーティング"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Usage-Tracker: "5. リクエスト詳細のログ記録"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Billing-Module: "6. 使用状況データの送信"
AIGNE-Hub.Billing-Module -> AIGNE-Hub.Database: "7. クレジットの更新"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Database: "ログの保存"
AIGNE-Hub.AI-Provider-Handler -> External-AI-Provider: "8. リクエストの転送"
External-AI-Provider -> AIGNE-Hub.API-Gateway: "9. AI レスポンス"
AIGNE-Hub.API-Gateway -> Client-Applications: "10. 最終レスポンス"
```

## API ゲートウェイ

API ゲートウェイは、AIGNE Hub へのすべての受信リクエストに対する単一の統一されたエントリーポイントとして機能します。リクエストパスに基づいて、トラフィックを適切な内部サービスにルーティングする責任を負います。この一元化されたアプローチにより、開発者は基盤となる AI プロバイダーに関係なく、単一の一貫した API エンドポイントと対話するだけで済むため、クライアントの統合が簡素化されます。

ゲートウェイは、チャット補完、画像生成、埋め込みなどの機能のために、主に `/api/v2/` パス以下の一連の RESTful エンドポイントを公開します。認証やその他ミドルウェアを通過した後、リクエストを処理のために関連するハンドラーに転送します。

## 認証システム

セキュリティは、すべてのエンドポイントを保護する堅牢な認証システムによって管理されます。ミドルウェアを活用して、リクエストを行うユーザーまたはアプリケーションの ID を検証します。

-   **ユーザー認証**: 管理ダッシュボードや組み込みのプレイグラウンドの使用など、ユーザー向けのインタラクションでは、システムは Blocklet SDK によって管理されるセッションベースの認証メカニズムを使用します。
-   **API 認証**: すべての API リクエストには、認証のために Bearer トークンが必要です。このトークンは特定のユーザーまたはアプリケーションに関連付けられており、認証されたクライアントのみが AI モデルにアクセスできるようにします。

このシステムは、認証されていないリクエストを `401 Unauthorized` エラーで拒否するように設計されており、基盤となる AI サービスやデータへの不正アクセスを防ぎます。

## 使用状況トラッカー

使用状況トラッカーは、監視と監査のための重要なコンポーネントです。ゲートウェイを通過するすべての API コールを綿密に記録します。ミドルウェア `createModelCallMiddleware` は、受信リクエストをインターセプトして、`processing` ステータスでデータベースに `ModelCall` レコードを作成します。

このレコードは、以下を含むトランザクションの主要な詳細をキャプチャします：
-   ユーザー DID とアプリケーション DID
-   リクエストされた AI モデルとコールタイプ (例: `chatCompletion`、`imageGeneration`)
-   リクエストとレスポンスのタイムスタンプ
-   入力と出力のトークン数
-   コールのステータス (例: `success`、`failed`)

API コールの完了または失敗時に、ミドルウェアは `ModelCall` レコードを最終的なステータス、期間、およびエラー詳細で更新します。これにより、デバッグ、分析、および課金のための完全な監査証跡が提供されます。

## 課金モジュール

「サービスプロバイダーモード」で動作する場合、AIGNE Hub はオプションの課金モジュールを有効化します。このコンポーネントは、使用状況トラッカーおよび **Payment Kit** blocklet とシームレスに統合し、クレジットベースの課金システムを管理します。

ワークフローは次のとおりです：
1.  **残高確認**: リクエストを処理する前に、システムはユーザーに十分なクレジット残高があるかを確認します。残高がゼロまたはマイナスの場合、リクエストは `402 Payment Required` エラーで拒否されます。
2.  **コスト計算**: API コールが成功した後、使用状況トラッカーは最終的なトークン数または画像生成メトリクスを提供します。課金モジュールは、このデータと特定モデルの事前設定されたレート (`AiModelRate`) を使用して、クレジット単位の総コストを計算します。
3.  **クレジットの差し引き**: 計算された金額は、Payment Kit API を介してメーターイベントを作成することにより、ユーザーの残高から差し引かれます。

この自動化されたプロセスにより、運用者は AIGNE Hub を有料サービスとして提供でき、すべての使用状況と課金が透過的に管理されます。