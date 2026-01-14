# API 認証

AIGNE Hub API へのリクエストを安全に認証することは、プログラムによるアクセスと統合のための重要なステップです。このガイドでは、API キーを使用してアプリケーションを認可するための明確で段階的なプロセスを提供し、すべての対話が安全かつ適切に識別されるようにします。

## 認証方法

AIGNE Hub は、主に RESTful API に対して API キーを使用したベアラー認証を使用します。すべての API リクエストには、有効な API キーを含む `Authorization` ヘッダーを含める必要があります。この方法は、直接的で安全であり、サービス間通信の業界のベストプラクティスに準拠しています。

## API キーの生成

認証する前に、AIGNE Hub の管理インターフェースから API キーを生成する必要があります。

1.  AIGNE Hub インスタンスの **Settings** セクションに移動します。
2.  **API Keys** タブを選択します。
3.  **"Generate New Key"** ボタンをクリックします。
4.  後でその目的を識別しやすくするために、キーに説明的な名前を付けます（例：`dev-server-integration`、`analytics-script-key`）。
5.  システムが新しいキーを生成します。**このキーをすぐにコピーし、安全な場所に保管してください。** セキュリティ上の理由から、このページを離れると完全なキーは二度と表示されません。

## API キーの使用

API リクエストを認証するには、HTTP リクエストの `Authorization` ヘッダーに API キーを含めます。値の先頭には `Bearer ` スキームを付ける必要があります。

### HTTP ヘッダーの形式

```
Authorization: Bearer <YOUR_API_KEY>
```

`<YOUR_API_KEY>` を、生成した実際のキーに置き換えてください。

### cURL を使用したリクエストの例

以下は、`cURL` を使用してチャット補完エンドポイントに認証済みリクエストを送信する方法の例です。

```bash 認証済み API リクエスト icon=lucide:terminal
curl -X POST https://your-aigne-hub-url/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "aignehub/gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Node.js アプリケーションでの例

アプリケーションと統合する場合、HTTP クライアントライブラリで `Authorization` ヘッダーを設定します。次の例では、このプロセスを簡素化する AIGNE Hub SDK を使用しています。

```javascript AIGNEHubChatModel.js icon=logos:javascript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "YOUR_API_KEY", // SDK が "Bearer " プレフィックスの追加を処理します
  model: "aignehub/gpt-3.5-turbo",
});

async function getGreeting() {
  try {
    const result = await model.invoke({
      messages: [{ role: "user", content: "Hello, AIGNE Hub!" }],
    });
    console.log(result);
  } catch (error) {
    console.error("API request failed:", error.message);
  }
}

getGreeting();
```

この例では、`AIGNEHubChatModel` コンストラクタに提供された `apiKey` は、モデルインスタンスによって行われる後続のすべての API コールに対して、自動的に正しい `Authorization` ヘッダーに配置されます。

## セキュリティのベストプラクティス

-   **API キーをパスワードのように扱う。** シークレットマネージャーや環境変数として安全に保管してください。クライアントサイドのコードで公開したり、バージョン管理にコミットしたりしないでください。
-   **アプリケーションごとに異なるキーを使用する。** この実践は、最小権限の原則として知られ、単一のキーが侵害された場合の影響を限定します。
-   **キーを定期的にローテーションする。** 定期的に古いキーを無効にし、新しいキーを生成して、侵害されたキーからの不正アクセスのリスクを低減します。
-   **API の使用状況を監視する。** 分析ダッシュボードを監視して、キーの侵害を示す可能性のある異常なアクティビティを検出します。

## まとめ

AIGNE Hub API への認証は、`Authorization` ヘッダーにベアラートークンとして含まれる API キーを介して処理されます。上記で概説した生成プロセスとセキュリティのベストプラクティスに従うことで、すべての API エンドポイントへの安全で信頼性の高いプログラムによるアクセスを確保できます。

特定のエンドポイントに関する詳細については、以下のセクションを参照してください：
- [チャット補完](./api-reference-chat-completions.md)
- [画像生成](./api-reference-image-generation.md)
- [埋め込み](./api-reference-embeddings.md)