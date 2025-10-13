# はじめに

このガイドでは、AIGNE Hubをデプロイ、設定し、使用を開始するための基本的な手順を説明します。これは、システムを効率的に稼働させる必要がある運用およびインフラストラクチャチーム向けに設計されています。

## 概要

AIGNE Hubは、統合AIゲートウェイとして機能し、複数の大規模言語モデル（LLM）およびAIGCプロバイダーの管理を一元化します。APIキー管理、使用状況の追跡、請求を簡素化し、エコシステム内のすべてのAIサービスに対する単一のアクセスポイントを提供します。AIGNEフレームワーク上に構築され、Blockletとしてデプロイされるため、社内エンタープライズ利用と公開サービスプロバイダーモデルの両方に対して堅牢なソリューションを提供します。

![AIGNE Hub ダッシュボード](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/c29f08420df8ea9a199fcb5ffe06febe.png)

## 1. デプロイ

AIGNE HubはBlocklet Server上で実行されるように設計されており、Blocklet Serverが基盤となるオーケストレーション、スケーリング、および管理機能を提供します。

### 前提条件

- 実行中のBlocklet Serverインスタンス。
- アプリケーションをインストールおよび管理するためのBlocklet Serverへの管理者アクセス権。

### インストール手順

1.  **Blockletストアに移動**: Blocklet Serverのダッシュボードにアクセスし、「ストア」セクションに移動します。
2.  **AIGNE Hubを検索**: 検索バーを使用して「AIGNE Hub」を検索します。
3.  **アプリケーションを起動**: AIGNE Hubページの「起動」ボタンをクリックします。インストールウィザードが初期設定プロセスを案内します。

インストールが完了すると、AIGNE HubはBlocklet Server上でサービスとして実行されます。

## 2. プロバイダーの設定

デプロイ後の最初のステップは、AIGNE Hubを1つ以上のAIプロバイダーに接続することです。これには、使用するサービスに必要なAPIキーを追加する作業が含まれます。

1.  **管理パネルにアクセス**: AIGNE Hubインスタンスを開き、管理ダッシュボードに移動します。
2.  **AIプロバイダーに移動**: 管理パネルで設定セクションを見つけ、**設定 → AIプロバイダー** を選択します。
3.  **APIキーを追加**: リストから希望のAIプロバイダー（例：OpenAI, Anthropic, Google Gemini）を選択し、APIキーを入力します。認証情報は暗号化され、安全に保存されます。

![プロバイダー設定](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/d037b6b6b092765ccbfa58706c241622.png)

## 3. 基本的な使用方法

プロバイダーが設定されると、AIGNE HubはAIリクエストを処理する準備が整います。アプリケーションはハブの統合APIエンドポイントと対話できます。アクセスは通常、OAuthまたは生成されたAPIアクセスキーによって保護されます。

次のTypeScriptの例は、`@aigne/aigne-hub`クライアントライブラリを使用してチャットモデルを呼び出す方法を示しています。

```typescript
// AIGNE HubでAIGNEフレームワークを使用
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// クライアントがAIGNE Hubインスタンスを指すように設定
const model = new AIGNEHubChatModel({
  // AIGNE HubのチャットAPIエンドポイントの完全なURL
  url: "https://your-aigne-hub-url/api/v2/chat",

  // 認証用のOAuthアクセスキー
  accessKey: "your-oauth-access-key",

  // 使用するプロバイダーとモデルを指定します（例：「openai/gpt-3.5-turbo」）
  model: "openai/gpt-3.5-turbo",
});

// モデルにリクエストを送信
const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

### 主なパラメータ：

*   `url`: セルフホストされたAIGNE Hubインスタンスのエンドポイント。
*   `accessKey`: AIGNE Hubの認証システムから取得したセキュリティトークン。アプリケーションにAPIコールを行う権限を付与します。
*   `model`: プロバイダーとモデルの両方を指定する文字列識別子（例：`provider/model-name`）。AIGNE Hubは、この値に基づいてリクエストを対応するプロバイダーにルーティングします。

## 次のステップ

基本的な設定が完了したので、次にデプロイシナリオに基づいてより高度な設定を検討できます。

*   **エンタープライズ利用の場合**: ハブを社内アプリケーションと統合し、組み込みのユーザー管理およびセキュリティ機能を使用してチームのアクセスを管理します。
*   **サービスプロバイダーの場合**: AIGNE Hubを公開サービスとして提供する予定がある場合、次のステップは**Payment Kit** Blockletをインストールし、請求レートを設定し、顧客の支払いフローをセットアップすることです。