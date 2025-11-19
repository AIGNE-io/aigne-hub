# はじめに

このガイドでは、AIGNE Hub をデプロイして運用するための、タスク指向の直接的な手順を説明します。これらの手順に従うことで、30分以内に機能するインスタンスを設定でき、上流の AI プロバイダや下流のアプリケーションとの即時統合が可能になります。

以下の図は、開始するためのコアワークフローを示しています。

```d2
direction: down

Admin: {
  shape: c4-person
}

Blocklet-Server: {
  label: "Blocklet Server"
  shape: rectangle

  Blocklet-Store: {
    label: "Blocklet Store"
    icon: "https://store.blocklet.dev/assets/z8ia29UsENBg6tLZUKi2HABj38Cw1LmHZocbQ/logo.png"
  }

  AIGNE-Hub: {
    label: "AIGNE Hub"
    icon: "https://www.arcblock.io/image-bin/uploads/89a24f04c34eca94f26c9dd30aec44fc.png"
  }
}

AI-Providers: {
  label: "AIプロバイダ"
  shape: rectangle
  style: {
    stroke: "#888"
    stroke-width: 2
    stroke-dash: 4
  }
  OpenAI: {}
  Gemini: {}
  Anthropic: {}
}

Choose-Mode: {
  label: "運用モードを選択"
  shape: diamond
}

Enterprise-Use: {
  label: "社内利用"
  shape: rectangle
}

Service-Provider: {
  label: "サービスプロバイダ"
  shape: rectangle

  Payment-Kit: {
    label: "Payment Kit"
    shape: rectangle
  }
}

Basic-Usage: {
  label: "基本利用"
  shape: rectangle

  Playground: {}
  API-Integration: {
    label: "API統合"
  }
}

Admin -> Blocklet-Server.Blocklet-Store: "1. ストアで検索"
Blocklet-Server.Blocklet-Store -> Blocklet-Server.AIGNE-Hub: "2. Blockletをインストール"
Admin -> Blocklet-Server.AIGNE-Hub: "3. 設定"
Blocklet-Server.AIGNE-Hub -> AI-Providers: "接続"
Blocklet-Server.AIGNE-Hub -> Choose-Mode
Choose-Mode -> Enterprise-Use: "デフォルト"
Enterprise-Use -> Basic-Usage
Choose-Mode -> Service-Provider: "収益化"
Service-Provider -> Basic-Usage

```

## 前提条件

続行する前に、以下の要件が満たされていることを確認してください。

*   **Blocklet Server:** AIGNE Hub をホストするために、Blocklet Server の実行中のインスタンスが必要です。
*   **AIプロバイダのアカウント:** 接続しようとするAIサービス（例：OpenAI、Anthropic、Google Gemini）のアクティブなアカウントと対応するAPIキーが必要です。

## ステップ 1: AIGNE Hub をインストールする

AIGNE Hub は Blocklet として配布されており、標準化された簡単なインストールプロセスが保証されています。

1.  Blocklet Server インスタンス内の **Blocklet Store** に移動します。
2.  検索バーを使用して「AIGNE Hub」を検索します。
3.  AIGNE Hub の Blocklet ページで **"Launch"** ボタンをクリックします。
4.  画面上のインストールウィザードに従ってデプロイを完了します。システムが必要なセットアップと設定を自動的に処理します。

インストールが完了すると、AIGNE Hub が実行され、Blocklet Server のダッシュボードからアクセスできるようになります。

![AIGNE Hub ダッシュボード](../../../blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## ステップ 2: AI プロバイダを接続する

インストール後、次のステップは AIGNE Hub を選択した AI プロバイダに接続することです。すべての認証情報は、セキュリティを確保するために保存時に AES 暗号化されます。

1.  AIGNE Hub の管理ダッシュボードにアクセスします。
2.  サイドバーから設定セクションに移動します： **Config → AI Providers**。
3.  **"+ Add Provider"** ボタンをクリックして設定モーダルを開きます。
4.  リストから希望するプロバイダを選択します（例：OpenAI、Google Gemini）。
5.  API キーとその他必要な認証情報やパラメータを入力します。
6.  設定を保存します。認証情報が有効な場合、プロバイダはリストに「Connected」ステータスで表示されます。

AIGNE Hub を通じて管理したいすべての AI プロバイダについて、このプロセスを繰り返します。

![AI プロバイダを設定する](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

## ステップ 3: 運用モードを選択する

AIGNE Hub は、2つの主要なデプロイシナリオに合わせて設定できます。選択によって、使用方法と統合の次のステップが決まります。

### 社内利用向け

これはデフォルトで最もシンプルなモードで、内部アプリケーション用の中央集権的な AI ゲートウェイを必要とするチーム向けに設計されています。

*   **直接請求:** あなたの組織は AI プロバイダ（OpenAI、Anthropic など）から直接請求されます。AIGNE Hub は分析のために使用状況を追跡しますが、支払いは処理しません。
*   **セキュアなアクセス:** 既存の OAuth プロバイダと統合し、内部開発者やアプリケーション向けのセキュアなシングルサインオンアクセスを実現します。

プロバイダを設定すれば、AIGNE Hub インスタンスはすぐに使用できます。[基本利用](#基本利用)セクションに進んでください。

### サービスプロバイダとしての利用向け

このモードは、クレジットベースの請求システムを有効にすることで、AIGNE Hub をマルチテナントの収益化されたサービスに変えます。

*   **収益化:** エンドユーザーにクレジットベースで AI の使用料を請求します。モデルごとに価格を設定し、上流プロバイダからのコストに対するマージンを作成します。
*   **Payment Kit 統合:** このモードでは、クレジット購入、請求書発行、支払い処理を行う **Payment Kit** blocklet のインストールが必要です。
*   **ユーザーオンボーディング:** 新規ユーザーに初期クレジット残高を自動的に付与し、利用を促進します。

このモードを有効にするには、**Preferences** に移動し、クレジットベースの請求を有効にして、モデルの価格レートを設定します。

![モデルレートを設定する](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

## ステップ 4: 基本利用

設定後、AIGNE Hub の統一されたエンドポイントを通じて API リクエストを行うか、内蔵の Playground で直接モデルをテストすることができます。

### Playground を使用する

Playground は、接続されている任意の AI モデルと対話するためのノーコードインターフェースを提供します。これは、テスト、プロンプトエンジニアリング、およびデモンストレーションに最適なツールです。

1.  AIGNE Hub ダッシュボードの **Playground** セクションに移動します。
2.  ドロップダウンメニューから接続されているモデルを選択します。
3.  プロンプトを入力し、送信して応答を受け取ります。

![AIGNE Hub Playground](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

### プログラムによる利用

AIGNE Hub の OpenAI 互換エンドポイントに API コールを行うことで、アプリケーションに統合します。以下の例は、`@aigne/aigne-hub` クライアントライブラリの使用方法を示しています。

```typescript AIGNEHubChatModel.ts icon=logos:typescript
// AIGNE Framework と AIGNE Hub を使用する
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "your-oauth-access-key", // OAuth を介して生成されたアクセスキーを使用
  model: "aignehub/gpt-3.5-turbo", // モデル名の前に 'aignehub/' を付ける
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

このコードスニペットは、自己ホスト型の AIGNE Hub インスタンスを指すチャットモデルクライアントを初期化します。OAuth アクセスキーを使用して認証し、ゲートウェイを介して `gpt-3.5-turbo` モデルにリクエストを送信します。

## まとめ

これで、AIGNE Hub インスタンスのデプロイ、設定、テストが正常に完了しました。ゲートウェイは運用可能であり、チームやアプリケーションに AI 機能を提供する準備ができています。

より高度な設定やプラットフォームの機能に関する詳細については、以下のドキュメントを参照してください。

<x-cards data-columns="2">
  <x-card data-title="デプロイシナリオ" data-icon="lucide:server" data-href="/deployment-scenarios">
  エンタープライズ向けのセルフホスティングおよび公共サービスプロバイダモードの詳細なアーキテクチャを探ります。
  </x-card>
  <x-card data-title="APIリファレンス" data-icon="lucide:code" data-href="/api-reference">
  チャット補完、画像生成、および埋め込みエンドポイントの技術仕様を確認します。
  </x-card>
</x-cards>