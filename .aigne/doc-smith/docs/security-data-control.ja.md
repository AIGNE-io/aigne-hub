# AIGNE Hub入門

このガイドでは、AIGNE Hubインスタンスのデプロイ、設定、検証について包括的に解説します。システムの管理を担当する運用チームおよびインフラチームを対象としています。

## 前提条件

インストールを進める前に、お使いの環境が以下の要件を満たしていることを確認してください：

-   **Blocklet Server**: AIGNE Hubをホストするには、Blocklet Serverの実行中のインスタンスが必要です。インストールと管理の手順については、公式の[Blocklet Serverドキュメント](https://docs.blocklet.io/docs/en/getting-started)を参照してください。
-   **Node.js**: AIGNE HubにはNode.jsバージョン18以降が必要です。Blocklet ServerがNode.jsランタイムを管理するため、サーバー環境が最新であることを確認してください。
-   **AIプロバイダーアカウント**: 統合予定のAIプロバイダー（例：OpenAI、Anthropic、Google Gemini）のアクティブなアカウントとAPIキーが必要です。

システムは統合されたSQLiteデータベースを利用し、Sequelize ORMを介して管理されます。これはインストールプロセス中に自動的に設定されます。標準的なデプロイでは、外部データベースの設定は不要です。

## インストール

AIGNE Hubは、公式のBlockletストアからBlockletとしてデプロイされます。

1.  **Blockletストアに移動**: Blocklet Serverのダッシュボードにアクセスし、「ストア」セクションに移動します。
2.  **AIGNE Hubを検索**: 検索バーを使用して「AIGNE Hub」を検索します。
3.  **Blockletを起動**: AIGNE Hubのページで「起動」ボタンをクリックします。インストールウィザードがプロセスを案内し、通常はBlocklet名とURLの確認が含まれます。

インストールが完了すると、AIGNE Hubインスタンスが実行状態になり、設定したURLでアクセス可能になります。

![AIGNE Hubダッシュボード](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

## 初期設定

インストール後、最初のステップは、ハブを通じて利用可能にしたいAIプロバイダーを設定することです。

1.  **管理パネルにアクセス**: AIGNE Hubインスタンスを開き、管理ダッシュボードに移動します。
2.  **AIプロバイダーへ移動**: 管理パネルで設定セクションを見つけ、**AIプロバイダー**を選択します。
3.  **プロバイダーキーを追加**: リストからAIプロバイダーを選択し、APIキーとその他必要な認証情報を入力します。ハブはこれらのキーを暗号化して安全に保存します。複数のプロバイダーを追加できます。

![AIプロバイダーの設定](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## デプロイモデル

AIGNE Hubは、2つの主要な運用モデルをサポートしています。組織のニーズに合ったものを選択してください。

### 1. 内部利用（エンタープライズセルフホスティング）

これはデフォルトで最もシンプルなデプロイモデルであり、内部の開発チームに最適です。

-   **運用**: AIプロバイダーが設定されると、ハブはリクエストを処理する準備が整います。
-   **認証**: アクセスは、直接APIアクセスを介して管理するか、安全で一元化された認証のためにOAuthプロバイダーと統合することで管理できます。
-   **課金**: 組織は使用量に基づいてAIプロバイダーから直接請求されます。AIGNE Hubは、この消費を内部で追跡するためのツールを提供します。

### 2. サービスプロバイダーモード

このモデルは、外部の顧客にAIサービスを提供したい組織向けです。

-   **課金を有効化**: このモードを有効にするには、**Payment Kit** Blockletをインストールし、AIGNE Hubと統合します。
-   **カスタム価格設定**: 異なるモデルに対して独自の価格レートを設定し、利益率を設定できます。
-   **クレジットシステム**: ユーザーはPayment Kitを通じてクレジットを購入し、AIの利用料金を支払います。システムはクレジットの控除とユーザーのオンボーディングを自動的に管理します。

## インストールの検証

設定後、組み込みのAI Playgroundを使用して、ハブが正しく機能していることを確認します。

1.  **Playgroundを開く**: AIGNE Hub UI内の「Playground」セクションに移動します。
2.  **モデルを選択**: 設定したAIモデルのいずれかを選択します（例： `openai/gpt-4`）。
3.  **リクエストを送信**: 入力ボックスにプロンプトを入力し、リクエストを送信します。

モデルから正常な応答を受け取った場合、AIGNE Hubインスタンスは正しく設定され、完全に動作しています。

![AI Playground](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

## 基本的な使用例

アプリケーションは、RESTful APIを介してAIGNE Hubと対話できます。AIGNEフレームワークを使用する場合、`AIGNEHubChatModel`がシームレスな統合ポイントを提供します。

以下のTypeScriptの例は、ハブを通じてチャットモデルを呼び出す方法を示しています。

```typescript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// ハブの設定でモデルを初期化します
const model = new AIGNEHubChatModel({
  // AIGNE Hub APIエンドポイントのURL
  baseURL: "https://your-aigne-hub-url",

  // OAuth経由で取得した、またはアプリケーション用に生成されたセキュアなアクセスキー
  apiKey: "your-oauth-access-key",

  // 使用するプロバイダーとモデルを指定します
  model: "aignehub/gpt-3.5-turbo",
});

async function getCompletion() {
  try {
    const result = await model.invoke({
      messages: "Hello, AIGNE Hub!",
    });

    console.log("AI Response:", result);
  } catch (error) {
    console.error("Error invoking model:", error);
  }
}

getCompletion();
```

-   `url`: AIGNE Hubのチャット補完APIエンドポイントの完全なURL。
-   `accessKey`: 認証用のアクセスキー。本番システムでは、これはOAuthフローを通じて取得されたセキュアなトークンであるべきです。
-   `model`: プロバイダーとモデルを識別する文字列で、`provider/model-name`の形式です。