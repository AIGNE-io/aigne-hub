# 概要

増え続けるAPIキー、請求システム、さまざまなAIプロバイダーとの統合の管理にお困りではありませんか？このドキュメントでは、この複雑さを簡素化する統合AIゲートウェイであるAIGNE Hubについて包括的に紹介します。そのコア機能、主な利点、システムアーキテクチャについて学び、インフラ管理における価値を明確に理解することができます。

AIGNE Hubは、一元化されたゲートウェイとして機能し、単一の一貫したAPIを通じてアプリケーションを主要な大規模言語モデル（LLM）やAIGCサービスに接続できるようにします。社内ツールとして展開する場合でも、収益化されたマルチテナントサービスとして展開する場合でも、APIキーの管理、使用状況の追跡、セキュリティを合理化します。

## なぜAIGNE Hubなのか？

複数のAIサービスを組織のインフラに統合することは、運用上の大きなオーバーヘッドをもたらします。チームは、プロバイダー固有のAPI、ばらばらの請求サイクル、一貫性のないセキュリティモデルといった断片化された状況に直面することがよくあります。この複雑さは開発を遅らせ、コスト管理を複雑にし、セキュリティの攻撃対象領域を増大させます。

以下の図は、AIGNE HubがアプリケーションとさまざまなAIプロバイダーの間に位置し、これらの課題をどのように解決するかを示しています。

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Overview](assets/diagram/overview-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

AIGNE Hubは、以下の機能を提供することで、これらの特定の課題を解決するように設計されています。

-   **単一の統合ポイント：** 接続されているすべてのプロバイダーに対して、OpenAI互換の統一されたAPIエンドポイントを提供します。これにより、開発者が複数のSDKや統合パターンを学習・維持する必要がなくなります。
-   **一元化された認証情報管理：** すべての上流APIキーはAES暗号化で一箇所に安全に保存され、さまざまなアプリケーションや環境でのキー漏洩のリスクを低減します。
-   **統一された使用状況とコスト分析：** すべてのモデル、ユーザー、プロバイダーにわたる消費量と支出を単一のダッシュボードで完全に可視化します。これにより、予算追跡とリソース割り当てが簡素化されます。
-   **柔軟なデプロイモデル：** AIGNE Hubは、純粋に内部使用（Bring Your Own Keys）のためにデプロイすることも、組み込みのクレジットベースの請求システムを備えた公開サービスとしてデプロイすることもできます。

## コア機能

AIGNE Hubは、AIサービスの消費と管理のライフサイクル全体を合理化するために設計された堅牢な機能セットを提供します。

<x-cards data-columns="3">
  <x-card data-title="マルチプロバイダー管理" data-icon="lucide:cloud">
    OpenAI、Anthropic、Google Geminiなど8社以上の主要AIプロバイダーに単一のインターフェースで接続できます。
  </x-card>
  <x-card data-title="統一APIエンドポイント" data-icon="lucide:plug-zap">
    OpenAI互換のRESTful APIを使用して、チャット補完、画像生成、埋め込みのためにすべてのモデルと対話できます。
  </x-card>
  <x-card data-title="使用状況とコスト分析" data-icon="lucide:line-chart">
    包括的な分析ダッシュボードで、すべてのユーザーとプロバイダーにわたるトークン使用量、コスト、遅延メトリクスを監視できます。
  </x-card>
  <x-card data-title="一元化されたセキュリティ" data-icon="lucide:shield-check">
    暗号化されたAPIキーの保存、OAuth統合、ロールベースのアクセス制御（RBAC）、詳細な監査ログの恩恵を受けられます。
  </x-card>
  <x-card data-title="柔軟な請求システム" data-icon="lucide:credit-card">
    オプションで、Payment Kitを搭載したクレジットベースの請求システムを有効にして、外部ユーザー向けにサービスを収益化できます。
  </x-card>
  <x-card data-title="組み込みプレイグラウンド" data-icon="lucide:flask-conical">
    AIGNE Hubのユーザーインターフェースから直接、接続されたAIモデルをリアルタイムでテストおよび実験できます。
  </x-card>
</x-cards>

## サポートされているAIプロバイダー

AIGNE Hubは、主要なAIプロバイダーのリストを拡大し続けています。システムは拡張可能に設計されており、新しいプロバイダーが継続的に追加されています。

| プロバイダー | サポートされているサービス |
| :--- | :--- |
| **OpenAI** | GPTモデル、DALL-E、Embeddings |
| **Anthropic** | Claudeモデル |
| **Google Gemini** | Gemini Pro、Visionモデル |
| **Amazon Bedrock** | AWSホストの基盤モデル |
| **DeepSeek** | 高度な推論モデル |
| **xAI** | Grokモデル |
| **OpenRouter** | 複数プロバイダーのアグリゲーター |
| **Ollama** | ローカルモデルのデプロイ |
| **Doubao** | Doubao AIモデル |
| **Poe** | Poe AIプラットフォーム |

## システムアーキテクチャ

AIGNE Hubは、信頼性とパフォーマンスを重視して設計されており、AIGNEフレームワーク上で[Blocklet](https://blocklet.io)として構築されています。このアーキテクチャは、AIGNEエコシステム内でのシームレスな統合を保証し、クラウドネイティブなデプロイとスケーリングのための堅牢な基盤を提供します。

スタックの主要コンポーネントは以下の通りです。

-   **バックエンド：** Node.jsとTypeScriptで構築され、強力な型付けと効率的なサーバーサイド環境を提供します。
-   **フロントエンド：** React 19で構築されたモダンなユーザーインターフェース。
-   **データベース：** ローカルデータストレージにSequelize ORMを備えたSQLiteを利用し、簡単なセットアップと信頼性の高いデータ管理を保証します。
-   **フレームワーク：** コア機能と統合能力のために最新バージョンのAIGNE Frameworkを活用します。

![AIGNE Hub Dashboard](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## まとめ

この概要では、マルチプロバイダーAIサービスのインフラ管理を簡素化するために設計された統合AIゲートウェイとしてAIGNE Hubを紹介しました。それが解決する問題、そのコア機能、および技術アーキテクチャについて概説しました。

次のステップとして、より詳細な情報については以下のセクションに進むことができます。

<x-cards data-columns="2">
  <x-card data-title="はじめに" data-href="/getting-started" data-icon="lucide:rocket">
    ステップバイステップのガイドに従って、30分以内にAIGNE Hubインスタンスをデプロイおよび設定します。
  </x-card>
  <x-card data-title="デプロイシナリオ" data-href="/deployment-scenarios" data-icon="lucide:milestone">
    社内企業利用または収益化サービスとしてAIGNE Hubをデプロイするためのアーキテクチャガイダンスを探ります。
  </x-card>
</x-cards>