# 認証

AIGNE Hub へのすべての API リクエストは、ゲートウェイとその統合 AI サービスへの安全なアクセスを確保するために認証される必要があります。このドキュメントでは、すべての API インタラクションに必要なトークンベースの認証メカニズムについて概説します。

API へのアクセスは、Bearer トークンを介して制御されます。有効なトークンは、すべてのリクエストの `Authorization` ヘッダーに含める必要があります。認証されていないリクエストや、無効な認証情報を持つリクエストはエラーになります。

利用可能なエンドポイントの詳細については、[V2 エンドポイント (推奨)](./api-reference-v2-endpoints.md) セクションをご覧ください。

## 認証フロー

このプロセスは、管理者が AIGNE Hub のユーザーインターフェースを通じてアクセストークンを生成することから始まります。このトークンはクライアントアプリケーションに提供され、クライアントアプリケーションは各 API リクエストのヘッダーにそれを含めます。AIGNE Hub API は、リクエストを処理する前にこのトークンを検証します。

```d2
shape: sequence_diagram

Admin: {
  shape: c4-person
}

AIGNE-Hub-Admin-UI: {
  label: "AIGNE Hub\n管理 UI"
}

Client-Application: {
  label: "クライアントアプリケーション"
}

AIGNE-Hub-API: {
  label: "AIGNE Hub API"
}

Admin -> AIGNE-Hub-Admin-UI: "1. アクセストークンを生成"
AIGNE-Hub-Admin-UI -> Admin: "2. トークンを提供"
Admin -> Client-Application: "3. トークンで設定"

Client-Application -> AIGNE-Hub-API: "4. API リクエスト\n(Authorization: Bearer <token>)"
AIGNE-Hub-API -> AIGNE-Hub-API: "5. トークンと権限を検証"

"認証された場合" {
  AIGNE-Hub-API -> Client-Application: "6a. 200 OK レスポンス"
}

"認証されなかった場合" {
  AIGNE-Hub-API -> Client-Application: "6b. 401 Unauthorized エラー"
}
```

## 認証済みリクエストの実行

API リクエストを認証するには、Bearer トークンを含む `Authorization` ヘッダーを含める必要があります。

**ヘッダーの形式:**

```
Authorization: Bearer <YOUR_ACCESS_TOKEN>
```

`<YOUR_ACCESS_TOKEN>` を、AIGNE Hub 管理インターフェースから生成された実際の OAuth アクセスキーに置き換えてください。

### 例: cURL リクエスト

この例では、`curl` を使用してチャット補完エンドポイントにリクエストを行う方法を示します。

```bash cURL を使用した API リクエスト icon=cib:curl
curl -X POST 'https://your-aigne-hub-url/api/v2/chat/completions' \
-H 'Authorization: Bearer your-oauth-access-key' \
-H 'Content-Type: application/json' \
-d '{
  "model": "openai/gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, AIGNE Hub!"
    }
  ]
}'
```

### 例: Node.js クライアント

公式の AIGNE Hub クライアントライブラリを使用する場合、認証ヘッダーは自動的に管理されます。

```typescript AIGNE Hub クライアント icon=logos:nodejs
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "your-oauth-access-key",
  model: "aignehub/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

## エラーハンドリング

認証に失敗した場合、API は HTTP `401 Unauthorized` ステータスコードで応答します。これは、リクエストで提供された認証情報に問題があることを示します。

`401` エラーの一般的な原因は次のとおりです。

| 原因 | 説明 |
| :--- | :--- |
| **トークンの欠落** | リクエストに `Authorization` ヘッダーが含まれていませんでした。 |
| **無効なトークン** | 提供されたトークンが不正、期限切れ、または失効しています。 |
| **権限不足** | トークンは有効ですが、関連付けられたユーザーまたはアプリケーションには、要求されたリソースに対する必要な権限がありません。 |

### エラーレスポンスの例

認証試行が失敗すると、エラー詳細を含む JSON オブジェクトが返されます。

```json Unauthorized レスポンス icon=mdi:code-json
{
  "error": "Unauthorized",
  "message": "Authentication token is invalid or missing."
}
```

このレスポンスを受け取った場合は、リクエストを再試行する前に、アクセストークンが正しく、有効期限が切れておらず、必要な権限を持っていることを確認してください。

## まとめ

このセクションでは、AIGNE Hub API の Bearer トークン認証メカニズムについて詳しく説明しました。すべてのリクエストには、`Authorization` ヘッダーに有効なトークンを含める必要があります。特定のエンドポイントの詳細については、[V2 エンドポイント (推奨)](./api-reference-v2-endpoints.md) のドキュメントに進んでください。