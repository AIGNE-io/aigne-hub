# アーキテクチャ

AIGNE Hubは、モジュール性とスケーラビリティを考慮して設計された、堅牢な自己ホスト型AIゲートウェイです。AIGNEフレームワーク上に構築され、Blockletとしてデプロイされることで、複数のAIプロバイダーを管理するための一元化された安全なインターフェースを提供します。このアーキテクチャは、APIリクエストの処理、セキュリティの管理、使用状況の追跡、データの効率的な永続化を行うように構成されています。

以下の図は、システムの構造と主要コンポーネント間の相互作用の概要を示しています。

```d2
direction: down

AI-Model-Request: { 
  label: "AIモデルリクエスト"
}

Blocklet-Server: {
  label: "Blocklet Server"
  icon: "https://www.arcblock.io/image-bin/uploads/eb1cf5d60cd85c42362920c49e3768cb.svg"
}

AIGNE-Hub: {
  label: "AIGNE Hub (自己ホスト型AIゲートウェイ)"
  shape: rectangle
  grid-gap: 100

  System-Components: {
    label: "システムコンポーネント"
    shape: rectangle

    API-Gateway: {
      label: "APIゲートウェイ"
    }
    Authentication-System: {
      label: "認証システム"
    }
    Usage-Tracker: {
      label: "使用状況トラッカー"
    }
    Billing-Module: {
      label: "課金モジュール (オプション)"
    }
  }

  Technology-Stack: {
    label: "技術スタック"
    shape: rectangle

    Backend: {
      label: "バックエンド\nNode.js, Express.js, TypeScript"
    }
    Frontend: {
      label: "フロントエンド\nReact"
    }
  }

  Data-Persistence: {
    label: "データ永続化"
    shape: rectangle

    Sequelize-ORM: {
      label: "Sequelize ORM"
    }

    SQLite-Database: {
      label: "SQLiteデータベース"
      shape: cylinder
      
      AI-Providers: {
        label: "AIプロバイダー"
      }
      AI-Credentials: {
        label: "AI認証情報"
      }
      Model-Calls: {
        label: "モデル呼び出し"
      }
      Usage-Statistics: {
        label: "使用統計"
      }
    }
  }
}

AI-Model-Request -> AIGNE-Hub.System-Components.API-Gateway: "エントリーポイント"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Authentication-System: "1. 検証"
AIGNE-Hub.System-Components.Authentication-System -> AIGNE-Hub.Data-Persistence.SQLite-Database: "認証情報の読み取り"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Usage-Tracker: "2. 使用状況の記録"
AIGNE-Hub.System-Components.Usage-Tracker -> AIGNE-Hub.Data-Persistence.SQLite-Database: "統計の書き込み"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Billing-Module: "3. クレジットの差し引き"
AIGNE-Hub.System-Components.Billing-Module -> AIGNE-Hub.Data-Persistence.SQLite-Database: "クレジットの更新"
AIGNE-Hub.Data-Persistence.Sequelize-ORM -> AIGNE-Hub.Data-Persistence.SQLite-Database: "管理"
AIGNE-Hub -> Blocklet-Server: "デプロイ先"

```

このドキュメントでは、アーキテクチャの概要を説明します。各分野をより深く理解するには、以下の詳細セクションを参照してください。

<x-cards data-columns="3">
  <x-card data-title="システムコンポーネント" data-icon="lucide:blocks" data-href="/architecture/system-components">
    APIゲートウェイ、認証システム、使用状況トラッカーなど、主要な機能ブロックについて詳述します。
  </x-card>
  <x-card data-title="技術スタック" data-icon="lucide:layers" data-href="/architecture/technology-stack">
    Node.js、React、Sequelizeなど、システムの構築に使用される主要な技術とフレームワークをリストアップします。
  </x-card>
  <x-card data-title="データ永続化" data-icon="lucide:database" data-href="/architecture/data-persistence">
    SQLiteを使用したデータベース設定と、プロバイダー、認証情報、使用統計のデータモデルについて説明します。
  </x-card>
</x-cards>

## システムコンポーネント

このシステムは、統合されたAIゲートウェイ体験を提供するために連携して動作する、いくつかの主要な機能ブロックで構成されています。各コンポーネントは、受信リクエストの処理からデータやセキュリティの管理まで、特定の目的のために設計されています。

-   **APIゲートウェイ**: すべてのAIモデルリクエストの中心的なエントリーポイントです。Express.jsで構築されており、受信トラフィックを適切なバックエンドサービスやAIプロバイダーにルーティングします。
-   **認証システム**: アクセス制御を管理し、すべての受信APIリクエストの認証情報を検証することで、ゲートウェイを保護します。Blocklet Serverのユーザー管理と統合されています。
-   **使用状況トラッカー**: すべてのAPI呼び出しについて、トークン消費量、リクエスト数、その他のメトリクスを監視・記録し、分析や課金のためのデータを提供します。
-   **課金モジュール**: Payment Kitと統合してクレジットベースのシステムを管理するオプションのコンポーネントで、AIゲートウェイのサービスとしての収益化を可能にします。

各コンポーネントの詳細については、[システムコンポーネント](./architecture-system-components.md)のドキュメントを参照してください。

## 技術スタック

AIGNE Hubは、パフォーマンス、型安全性、保守性を考慮して選ばれた、モダンで信頼性の高い技術スタックを使用して構築されています。

-   **バックエンド**: コアロジックは **Node.js** と **Express.js** フレームワークで構築されています。バックエンド全体で **TypeScript** を使用し、型安全性とコード品質を確保しています。
-   **フロントエンド**: 管理用およびユーザー向けのダッシュボードは **React** を使用して開発されています。
-   **データベースORM**: **Sequelize** がObject-Relational Mapper (ORM)として利用され、データベースとの対話を簡素化し、データアクセスと管理を容易にしています。
-   **デプロイ**: アプリケーション全体が **Blocklet** としてパッケージ化されており、Blocklet Serverインスタンス上での簡単なデプロイと管理を可能にしています。

詳細については、[技術スタック](./architecture-technology-stack.md)のセクションで確認できます。

## データ永続化

システムは、すべてのデータ永続化のニーズに対してローカルの **SQLite** データベースに依存しており、これはSequelize ORMを介して管理されます。この自己完結型のセットアップにより、すべてのデータがホスティング環境内に留まり、外部データベースサーバーの必要性を回避することでデプロイが簡素化されます。データベースのジャーナルモードは、同時実行性とパフォーマンスを向上させるためにWAL (Write-Ahead Logging)に設定されています。

主なデータモデルは次のとおりです。

-   **AiProvider**: エンドポイントやサポートされているモデルなど、接続されている各AIサービスプロバイダーの構成を保存します。
-   **AiCredential**: AIプロバイダーのAPIにアクセスするために必要な、暗号化されたAPIキーやその他の機密性の高い認証情報を安全に保存します。
-   **ModelCall**: ゲートウェイを介して行われた個々のAPI呼び出しをすべて記録し、監査、デバッグ、詳細な使用状況の追跡に利用します。
-   **ModelCallStat & Usage**: パフォーマンス監視やコスト分析ダッシュボードのために、生の呼び出しデータを定期的な統計に集計します。

データベーススキーマとモデルに関する詳細については、[データ永続化](./architecture-data-persistence.md)のドキュメントを参照してください。

---

このアーキテクチャ概要は、AIGNE Hubがどのように構築されているかについての基本的な理解を提供します。以降のセクションでは、システムの各側面についてより詳細に説明します。