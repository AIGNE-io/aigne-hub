# コア機能

このセクションでは、AIGNE Hub の主要な機能について技術的な詳細を解説します。最後まで読むことで、統一された AI モデルの対話やプロバイダー管理から、堅牢なセキュリティ、詳細な分析まで、プラットフォームの主要な機能を理解し、システムを活用するための強固な基盤を築くことができます。

AIGNE Hub は、中央ゲートウェイとして機能し、多様な大規模言語モデル（LLM）や AI サービスとのすべての対話を効率化するように設計されています。API アクセスを統一し、セキュリティを集中管理し、使用状況とコストの包括的な可視性を提供します。このプラットフォームの機能は、社内エンタープライズ展開とマルチテナントサービスプロバイダーモデルの両方をサポートするように設計されています。

以下の図は、AIGNE Hub のアーキテクチャとそのコアコンポーネントの概要を示しています。

```d2
direction: down

External-Entities: {
  label: "外部エンティティ"
  style.stroke-dash: 2

  Developer: {
    shape: c4-person
  }
  
  End-User-Applications: {
    label: "エンドユーザーアプリケーション"
  }
}

AIGNE-Hub: {
  label: "AIGNE Hub - 中央ゲートウェイ"
  shape: rectangle
  style.fill: "#f0f4ff"

  Core-Services: {
    label: "コアサービス"
    grid-columns: 2

    Unified-API-Gateway: {
      label: "統一 API ゲートウェイ"
      style.fill: "#e6f7ff"
    }

    Model-Playground: {
      label: "モデルプレイグラウンド"
      style.fill: "#e6f7ff"
    }
  }

  Functional-Modules: {
    label: "機能モジュール"
    grid-columns: 3

    AI-Service-Unification: {
      label: "AI サービスの統一"
      shape: rectangle
      "💬 チャット補完"
      "🖼️ 画像生成"
      "🧠 エンベディング"
    }

    Centralized-Management: {
      label: "集中管理"
      shape: rectangle
      Provider-Management: "プロバイダー管理"
      Billing-System: "課金システム"
      Analytics-Dashboard: "使用状況とコスト分析"
    }

    Security-Access-Control: {
      label: "セキュリティとアクセス制御"
      shape: rectangle
      API-Key-Management: "API キー管理"
      OAuth-Integration: "OAuth 連携"
      Encrypted-Storage: "暗号化された認証情報ストレージ"
      Audit-Logging: "監査ログ"
    }
  }
}

Upstream-AI-Providers: {
  label: "アップストリーム AI プロバイダー"
  style.stroke-dash: 2
  grid-columns: 2

  OpenAI: {}
  Anthropic: {}
  Google-Gemini: {
    label: "Google Gemini"
  }
  Amazon-Bedrock: {
    label: "Amazon Bedrock"
  }
}

External-Entities.Developer -> AIGNE-Hub.Core-Services.Model-Playground: "実験とテスト"
External-Entities.End-User-Applications -> AIGNE-Hub.Core-Services.Unified-API-Gateway: "API リクエスト"
AIGNE-Hub.Core-Services.Unified-API-Gateway -> AIGNE-Hub.Functional-Modules.AI-Service-Unification: "AI サービスへのルーティング"
AIGNE-Hub.Functional-Modules.AI-Service-Unification -> Upstream-AI-Providers: "リクエストの転送"
Upstream-AI-Providers -> AIGNE-Hub.Functional-Modules.AI-Service-Unification: "レスポンスの返却"
AIGNE-Hub.Core-Services.Unified-API-Gateway -> AIGNE-Hub.Functional-Modules.Security-Access-Control: "認証と認可"
AIGNE-Hub.Core-Services.Unified-API-Gateway -> AIGNE-Hub.Functional-Modules.Centralized-Management.Analytics-Dashboard: "使用状況とコストデータを記録"
External-Entities.Developer -> AIGNE-Hub.Functional-Modules.Centralized-Management: "設定と監視"

```

特定の機能に関する詳細情報については、以下のセクションを参照してください：

<x-cards data-columns="3">
  <x-card data-title="プロバイダー管理" data-href="/features/provider-management" data-icon="lucide:cloud">
  アップストリームの AI プロバイダーを接続、設定、管理する方法を学びます。
  </x-card>
  <x-card data-title="使用状況とコスト分析" data-href="/features/analytics" data-icon="lucide:bar-chart-2">
  システム全体およびユーザーごとの消費量とコストを監視する方法を理解します。
  </x-card>
  <x-card data-title="セキュリティとアクセス" data-href="/features/security" data-icon="lucide:shield-check">
  アクセス制御やデータ保護を含むセキュリティアーキテクチャを確認します。
  </x-card>
</x-cards>

## AI サービスの統一

AIGNE Hub は、単一で一貫性のある API エンドポイントセットを提供することで、複数の AI プロバイダーとの統合の複雑さを抽象化します。これにより、開発者は特定のベンダーにロックインされることなくアプリケーションを構築し、モデル間をシームレスに切り替えることができます。

### コア AI 機能

このプラットフォームは、最も一般的な生成 AI モダリティへの標準化されたアクセスを提供します：

-   **💬 チャット補完**: 会話型 AI や高度なテキスト生成モデルを活用し、幅広いアプリケーションに対応します。システムは OpenAI 互換 API を通じて、標準レスポンスとストリーミングレスポンスの両方をサポートします。
-   **🖼️ 画像生成**: DALL·E のような生成画像モデルにアクセスし、AI を活用した画像の作成や編集タスクを実行します。
-   **🧠 エンベディング**: セマンティック検索、クラスタリング、検索拡張生成（RAG）などのユースケースのために、テキストのベクトル表現を生成します。

### 内蔵モデルプレイグラウンド

AIGNE Hub には、接続されている任意の AI モデルをリアルタイムでテストおよび実験するためのインタラクティブなプレイグラウンドが含まれています。このツールは、プロンプトエンジニアリング、モデル比較、およびコードを一切書かずに迅速なプロトタイピングを行う上で非常に価値があります。

![AIGNE Hub の AI モデルをテストするためのインタラクティブなプレイグラウンド](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

## 集中管理と分析

効果的な管理と運用上の可視性は、AIGNE Hub の設計の中心です。このプラットフォームは、すべての AI 関連アクティビティを制御、監視、分析するための一元化されたダッシュボードを提供します。

### プロバイダーと課金の設定

単一の管理インターフェースから、サービスのあらゆる側面を管理できます。

-   **プロバイダー管理**: OpenAI、Anthropic、Google Gemini、Amazon Bedrock など、増え続ける AI プロバイダーのリストに接続します。認証情報は暗号化され、安全に保存されます。
-   **柔軟な課金システム**: 主に 2 つのモードで運用します。社内利用の場合、独自のプロバイダーキーを接続し、直接支払うことができます。一般向けサービスの場合、クレジットベースの課金システムを有効にし、カスタム価格レートを設定して、AI ゲートウェイを収益化できます。

![AIGNE Hub の AI プロバイダー設定画面](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

### 使用状況とコスト分析

分析ダッシュボードは、すべてのプロバイダー、モデル、ユーザーにわたる消費と支出に関する深い洞察を提供します。

-   **使用状況の追跡**: トークン消費量、API リクエスト数、レイテンシなどの主要なメトリクスをリアルタイムで監視します。
-   **コスト分析**: プロバイダーアカウントに対する支出を追跡したり、サービスプロバイダーモードでは収益とクレジット消費を監視したりします。このデータは、予算編成、予測、AI 関連支出の最適化に不可欠です。

## セキュリティとアクセス制御

AIGNE Hub は、機密データを保護し、強力な AI モデルへのアクセスを制御するために、エンタープライズグレードのセキュリティで構築されています。

-   **暗号化された認証情報ストレージ**: すべてのアップストリームプロバイダーの API キーと認証情報は、不正アクセスを防ぐために AES-256 を使用して暗号化されます。
-   **OAuth 連携**: 業界標準の OAuth 2.0 プロトコルを通じて、アプリケーションとユーザーのアクセスを保護します。
-   **API キー管理**: AIGNE Hub 内で API キーを生成および管理し、アプリケーションアクセスに対するきめ細かな制御を可能にします。
-   **監査ログ**: 包括的な監査証跡により、API リクエスト、設定変更、ユーザーアクティビティなど、すべての重要なイベントが記録され、説明責任とコンプライアンスを確保します。

## まとめ

AIGNE Hub は、組織の生成 AI へのアクセスを統一、管理、保護するために設計された包括的な機能スイートを提供します。プロバイダーの統合を一元化し、詳細な分析を提供し、堅牢なセキュリティ対策を施行することで、AI を活用して構築するあらゆるチームにとって重要なインフラストラクチャコンポーネントとして機能します。

続けるには、各コア機能領域の詳細なドキュメントをご覧ください：

-   **[プロバイダー管理](./features-provider-management.md)**: AI サービスの接続と設定の詳細を掘り下げます。
-   **[使用状況とコスト分析](./features-analytics.md)**: 運用上の洞察を得るために分析ダッシュボードを活用する方法を学びます。
-   **[セキュリティとアクセス](./features-security.md)**: プラットフォームのセキュリティメカニズムを詳細に理解します。