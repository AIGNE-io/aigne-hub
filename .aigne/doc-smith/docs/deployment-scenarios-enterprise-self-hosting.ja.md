# 企業向けセルフホスティング

独自のインフラストラクチャ内に AIGNE Hub をデプロイすることで、組織は AI モデルへのアクセス、データプライバシー、および運用コストを完全に制御できます。このガイドでは、安全な社内エンタープライズ利用のために、セルフホスト型の AIGNE Hub インスタンスを設定・管理するための体系的なアプローチを提供します。

## 概要

エンタープライズセルフホスティングモデルは、データセキュリティと AI リソースの直接管理を優先する組織向けに設計されています。独自のネットワーク境界内に AIGNE Hub をデプロイすることで、すべての社内チームやアプリケーションがさまざまな AI モデルにアクセスするための一元化された安全なゲートウェイを構築します。

このアプローチには、いくつかの明確な利点があります。

*   **セキュリティ強化**: プロンプト、レスポンス、API 認証情報を含むすべてのデータが企業ネットワーク内に留まるため、厳格なデータプライバシーポリシーへの準拠が保証されます。
*   **直接請求**: 各 AI プロバイダー（例: OpenAI, Anthropic, Google）と直接の請求関係を維持します。AIGNE Hub は使用状況を追跡しますが、すべての費用はベンダーに直接支払われるため、予算配分が簡素化され、サードパーティによる請求の複雑さがなくなります。
*   **完全な制御**: どのモデルが利用可能か、誰がアクセスできるか、どのように設定されているかなど、チームがインスタンスを完全に管理できます。
*   **社内統合**: 既存の社内認証システム（企業の OAuth プロバイダーなど）と AIGNE Hub をシームレスに接続し、統一された安全なアクセス管理を実現します。

このデプロイシナリオは、開発チーム、企業の AI イニシアチブ、および生成 AI 機能への堅牢でプライベートなアクセスを必要とするあらゆるアプリケーションに最適です。

## アーキテクチャに関する考慮事項

社内エンタープライズ利用のために AIGNE Hub をデプロイする場合、それはセキュリティ境界内の中央集権的なゲートウェイとして機能します。すべての社内アプリケーションとサービスは、AI リクエストをハブ経由でルーティングし、ハブは外部の AI プロバイダーと安全に通信します。

以下の図は、このアーキテクチャを示しています。

```d2
direction: down

Corporate-Network: {
  label: "貴社の企業ネットワーク / セキュリティ境界"
  style: {
    stroke: "#888"
    stroke-width: 2
    stroke-dash: 4
  }

  Internal-Applications: {
    label: "社内アプリケーション & サービス"
    shape: rectangle
  }

  AIGNE-Hub-Instance: {
    label: "AIGNE Hub インスタンス"
    shape: rectangle
    icon: "https://www.arcblock.io/image-bin/uploads/89a24f04c34eca94f26c9dd30aec44fc.png"
  }

  Authentication-System: {
    label: "企業認証システム (OAuth)"
    shape: rectangle
  }
}

External-AI-Providers: {
  label: "外部 AI プロバイダー"
  shape: rectangle
  grid-columns: 3

  OpenAI: {
    label: "OpenAI"
  }

  Anthropic: {
    label: "Anthropic"
  }

  Google: {
    label: "Google AI"
  }
}

Corporate-Network.Internal-Applications -> Corporate-Network.Authentication-System: "1. ユーザー/サービスを認証"
Corporate-Network.Authentication-System -> Corporate-Network.Internal-Applications: "2. トークンを提供"
Corporate-Network.Internal-Applications -> Corporate-Network.AIGNE-Hub-Instance: "3. 統合 AI API リクエスト"
Corporate-Network.AIGNE-Hub-Instance -> External-AI-Providers: "4. プロバイダーにリクエストを安全にルーティング"
External-AI-Providers -> Corporate-Network.AIGNE-Hub-Instance: "5. AI レスポンス"
Corporate-Network.AIGNE-Hub-Instance -> Corporate-Network.Internal-Applications: "6. レスポンスを返す"
```

![AIGNE Hub ダッシュボード](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

### 主要コンポーネント

*   **AIGNE Hub インスタンス**: 社内インフラストラクチャ（プライベートクラウド、オンプレミスサーバー、VPC など）で実行される専用の Blocklet。
*   **社内アプリケーション**: AI サービスを利用する必要があるサービス、開発環境、および社内ツール。
*   **認証システム**: ユーザーアクセスを管理する企業の ID プロバイダー（社内 OAuth 2.0 サーバーなど）。
*   **外部 AI プロバイダー**: AIGNE Hub が接続する上流の LLM および AIGC サービス。

この構成では、ハブが唯一の仲介役として機能します。社内アプリケーションはプロバイダーの API キーに直接アクセスする必要がなく、これによりセキュリティ体制が大幅に強化されます。

## 設定手順

エンタープライズ利用のために AIGNE Hub を設定するプロセスは、プロバイダーの接続とアクセスの保護に焦点を当てた簡単なものです。

### 1. 初期デプロイ

まず、AIGNE Hub の実行中のインスタンスがあることを確認してください。まだインストールしていない場合は、[Getting Started](./getting-started.md) ガイドのデプロイ手順に従ってください。主な方法は、Blocklet Store から Blocklet Server に起動することです。

### 2. プロバイダーの設定

セルフホスト設定の中核は、各 AI プロバイダーに対して組織独自の API キーを使用するように AIGNE Hub を設定することです。これにより、すべての使用量が企業の口座に直接請求されることが保証されます。

1.  AIGNE Hub インスタンスの管理ダッシュボードに移動します。
2.  左側のサイドバーで、**Config > AI Providers** に進みます。
3.  サポートされている AI プロバイダーのリストが表示されます。**+ Add Provider** をクリックするか、既存のプロバイダーを選択して設定します。
4.  選択したプロバイダーに対して、組織の API 認証情報を入力します。システムはこれらの認証情報を暗号化して安全に保存します。
5.  社内ユーザーが利用できるようにしたいプロバイダーを有効にします。

![プロバイダー設定](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

### 3. ユーザーアクセスとセキュリティ

社内利用の場合、既存の ID インフラストラクチャを通じてアクセスを管理できます。

#### 社内 OAuth 統合

AIGNE Hub は、安全なシングルサインオン（SSO）アクセスのために標準の OAuth 2.0 をサポートしています。社内の ID プロバイダーと統合することで、従業員は企業の認証情報を使用してハブにアクセスし、アプリケーション用の API トークンを生成できます。これにより、ユーザー管理とアクセス制御が一元化されます。

これを設定するには、AIGNE Hub のセキュリティ設定で、OAuth プロバイダーのクライアント ID、クライアントシークレット、および関連するエンドポイントを提供する必要があります。

#### 直接 API アクセス

サービスや自動化されたワークフローの場合、管理者は AIGNE Hub 内で直接、長期間有効な API キーを生成できます。これらのキーには特定の権限を割り当てることができ、いつでも取り消すことができるため、非対話型アクセスのための安全な方法が提供されます。

## 利用と管理

セルフホストインスタンスが設定されると、社内チームはすべての AI ニーズに対して統一された API エンドポイントの使用を開始できます。

### 統一 API エンドポイント

設定されたすべての AI モデルへのリクエストは、AIGNE Hub インスタンスの API エンドポイントに送信されます。ハブは、安全に保存された認証情報を使用して、リクエストを適切な上流プロバイダーに自動的にルーティングします。

例えば、アプリケーションは、異なる API キーやエンドポイントを管理することなく、API 呼び出しのモデル名を変更するだけで、OpenAI の `gpt-4` から Anthropic の `claude-3-opus` の使用に切り替えることができます。

### 利用状況分析

請求はプロバイダーと直接行われますが、AIGNE Hub は使用状況とコストに関する詳細な分析を提供します。

*   管理ダッシュボードの **Usage Analytics** セクションに移動します。
*   ユーザー、チーム、またはアプリケーションごとのトークン消費量、画像生成数、および推定コストを監視します。
*   このデータを社内のチャージバック、予算追跡、および高消費サービスの特定に使用します。

これにより、個々のプロバイダーの請求書を解析する複雑さなしに、組織全体の AI 支出の可視性を維持できます。

## まとめ

エンタープライズセルフホスティングモデルは、社内利用のために AIGNE Hub を安全、管理可能、かつ効率的にデプロイする方法を提供します。AI アクセスを一元化し、データをセキュリティ境界内に保持し、直接の請求関係を維持することで、厳格な企業要件を満たす堅牢な AI インフラストラクチャを構築できます。

外部顧客向けの収益化サービスの設定など、より高度な設定については、[サービスプロバイダーモード](./deployment-scenarios-service-provider.md) のドキュメントを参照してください。インスタンスの保護に関する詳細情報は、[セキュリティとアクセス](./features-security.md) ガイドでも確認できます。