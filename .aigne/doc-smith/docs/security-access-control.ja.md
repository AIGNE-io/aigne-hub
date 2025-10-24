# ユーザー API エンドポイント

ユーザー API は、クレジット残高、取引履歴、使用統計など、ユーザー関連データを管理するためのエンドポイントを提供します。これらのエンドポイントは、ユーザーアクティビティの監視と請求情報の管理に不可欠です。

## 認証

このセクションのすべてのエンドポイントは、`sessionMiddleware` を介したユーザー認証が必要です。特定のエンドポイントには管理者権限が必要な場合があり、これは `ensureAdmin` ミドルウェアによって強制されます。

---

### ユーザー情報の取得

認証済みユーザーの詳細情報（プロフィール、およびクレジットベースの課金が有効な場合はクレジット残高を含む）を取得します。

- **エンドポイント:** `GET /user/info`
- **権限:** 認証済みユーザー

**成功レスポンス (200 OK)**

クレジットベースの課金が有効で、支払いサービスが稼働している場合：

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": {
    "balance": 1000.50,
    "total": 5000.00,
    "grantCount": 5,
    "pendingCredit": 100.00
  },
  "paymentLink": "https://example.com/short/payment",
  "currency": {
    "name": "Credit",
    "symbol": "CR",
    "decimal": 2
  },
  "enableCredit": true,
  "profileLink": "https://example.com/short/profile"
}
```

クレジットベースの課金が無効な場合：

```json
{
  "user": {
    "did": "z1...",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "avatar": "https://example.com/avatar.png"
  },
  "creditBalance": null,
  "paymentLink": null,
  "enableCredit": false,
  "profileLink": "https://example.com/short/profile"
}
```

**エラーレスポンス**

- `401 Unauthorized`: ユーザーが認証されていません。
- `404 Not Found`: ユーザーまたはメーターの設定が見つかりません。
- `502 Bad Gateway`: 支払いサービスが実行されていません。

---

### モデル呼び出しのリスト表示

AI モデル呼び出しのページ分割されたリストを取得します。さまざまな基準でフィルタリングできます。これは、使用履歴を取得するための主要なエンドポイントです。

- **エンドポイント:** `GET /user/model-calls`
- **権限:** 認証済みユーザー。`allUsers=true` パラメータを使用するには管理者ロールが必要です。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `page` | number | ページネーションのページ番号。デフォルトは `1` です。 |
| `pageSize` | number | ページあたりのアイテム数。デフォルトは `50`、最大 `100` です。 |
| `startTime` | string | 時間範囲の開始（Unix タイムスタンプ）。 |
| `endTime` | string | 時間範囲の終了（Unix タイムスタンプ）。 |
| `search` | string | 結果をフィルタリングするための検索語。 |
| `status` | string | 呼び出しステータスでフィルタリングします。`success`、`failed`、または `all` を指定できます。 |
| `model` | string | 特定のモデル名でフィルタリングします。 |
| `providerId` | string | 特定のプロバイダー ID でフィルタリングします。 |
| `appDid` | string | 呼び出し元アプリケーションの DID でフィルタリングします。 |
| `allUsers` | boolean | **管理者のみ。** `true` の場合、すべてのユーザーの呼び出しを取得します。 |

**成功レスポンス (200 OK)**

```json
{
  "count": 1,
  "list": [
    {
      "id": "z82...",
      "userDid": "z1...",
      "model": "gpt-4",
      "status": "success",
      "credits": 150.75,
      "duration": 500,
      "createdAt": "2023-10-27T10:00:00.000Z",
      // ... other fields
      "appInfo": {
        "appName": "My App",
        "appDid": "z2...",
        "appLogo": "https://example.com/logo.png",
        "appUrl": "https://example.com"
      },
      "userInfo": {
        "did": "z1...",
        "fullName": "John Doe",
        "email": "john.doe@example.com",
        "avatar": "https://example.com/avatar.png"
      }
    }
  ],
  "paging": {
    "page": 1,
    "pageSize": 50
  }
}
```

---

### モデル呼び出しのエクスポート

モデル呼び出し履歴を CSV ファイルにエクスポートします。`GET /user/model-calls` エンドポイントと同じフィルタが適用されます。

- **Endpoint:** `GET /user/model-calls/export`
- **権限:** 認証済みユーザー。`allUsers=true` パラメータを使用するには管理者ロールが必要です。

**クエリパラメータ**

このエンドポイントは `GET /user/model-calls` と同じクエリパラメータを受け付けますが、`page` と `pageSize` は除きます。エクスポートの上限は 10,000 レコードにハードコードされています。

**成功レスポンス (200 OK)**

サーバーは `text/csv` ファイルで応答します。

```csv
Timestamp,Request ID,User DID,User Name,User Email,Model,Provider,Type,Status,Input Tokens,Output Tokens,Total Usage,Credits,Duration(ms),App DID
2023-10-27T10:00:00.000Z,z82...,z1...,John Doe,john.doe@example.com,gpt-4,OpenAI,chat,success,100,200,300,150.75,500,z2...
```

---

### 使用統計の取得

指定された時間範囲の集計された使用統計を取得します。

- **エンドポイント:** `GET /user/usage-stats`
- **権限:** 認証済みユーザー。

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `startTime` | string | はい | 時間範囲の開始（Unix タイムスタンプ）。 |
| `endTime` | string | はい | 時間範囲の終了（Unix タイムスタンプ）。 |

**成功レスポンス (200 OK)**

```json
{
  "summary": {
    "byType": {
      "chat": 100,
      "image": 20
    },
    "totalCalls": 120,
    "totalCredits": 12345.67,
    "modelCount": 5,
    "totalUsage": 500000
  },
  "dailyStats": [
    {
      "date": "2023-10-26",
      "credits": 5000.1,
      "calls": 50
    },
    {
      "date": "2023-10-27",
      "credits": 7345.57,
      "calls": 70
    }
  ],
  "modelStats": [
    {
      "model": "gpt-4",
      "totalCalls": 80,
      "totalCredits": 9000.0
    }
  ],
  "trendComparison": {
    "totalCredits": {
      "current": 12345.67,
      "previous": 11000.0,
      "change": "12.23"
    },
    "totalCalls": {
      "current": 120,
      "previous": 100,
      "change": "20.00"
    }
  }
}
```

---

### 管理者: 全ユーザー統計の取得

指定された時間範囲内の全ユーザーの集計された使用統計を取得します。

- **エンドポイント:** `GET /user/admin/user-stats`
- **権限:** 管理者

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `startTime` | string | はい | 時間範囲の開始（Unix タイムスタンプ）。 |
| `endTime` | string | はい | 時間範囲の終了（Unix タイムスタンプ）。 |

**レスポンス**

レスポンス構造は `GET /user/usage-stats` と同じですが、全ユーザーのデータが含まれます。

---

### 管理者: ユーザー統計の再計算

指定された時間範囲内のユーザーのキャッシュされた時間単位の統計を再生成するための管理者用エンドポイント。これはデータの不整合を修正するのに役立ちます。

- **エンドポイント:** `POST /user/recalculate-stats`
- **権限:** 管理者

**リクエストボディ**

```json
{
  "userDid": "z1...",
  "startTime": "1698364800",
  "endTime": "1698451200",
  "dryRun": true
}
```

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `userDid` | string | はい | 統計を再計算するユーザーの DID。 |
| `startTime` | string | はい | 時間範囲の開始（Unix タイムスタンプ）。 |
| `endTime` | string | はい | 時間範囲の終了（Unix タイムスタンプ）。 |
| `dryRun` | boolean | いいえ | `true` の場合、サーバーは変更を実行せずにプレビューします。 |

**成功レスポンス (200 OK)**

```json
{
  "message": "Rebuild completed",
  "deleted": 24,
  "success": 24,
  "failed": 0
}
```

---

## クレジット管理 API

ユーザーのクレジットを管理および表示するためのエンドポイント。

### クレジット付与のリスト表示

認証済みユーザーのクレジット付与のページ分割されたリストを取得します。

- **エンドポイント:** `GET /user/credit/grants`
- **権限:** 認証済みユーザー

---

### クレジット取引のリスト表示

認証済みユーザーのクレジット取引のページ分割されたリストを取得します。

- **エンドポイント:** `GET /user/credit/transactions`
- **権限:** 認証済みユーザー

---

### クレジット残高の取得

認証済みユーザーの現在のクレジット残高を取得します。

- **エンドポイント:** `GET /user/credit/balance`
- **権限:** 認証済みユーザー

---

### クレジット支払いリンクの取得

クレジット支払いページへのショート URL を取得します。

- **エンドポイント:** `GET /user/credit/payment-link`
- **権限:** 認証済みユーザー

# AI プロバイダー API エンドポイント

AI プロバイダー API は、さまざまな AI モデルプロバイダーへの接続を設定し、その認証情報を管理し、モデル使用料のレートを設定するために使用されます。これらの設定は、システムの運用に不可欠です。

## 認証

このセクションのほとんどのエンドポイントには管理者権限が必要であり、`ensureAdmin` ミドルウェアによって強制されます。公開またはユーザー向けのエンドポイントは明記されています。

---

### AI プロバイダーのリスト表示

設定されているすべての AI プロバイダーのリストを、モデルレートとマスクされた認証情報を含めて取得します。

- **エンドポイント:** `GET /ai-providers`
- **権限:** 認証済みユーザー

**成功レスポンス (200 OK)**

```json
[
  {
    "id": "prov_1...",
    "name": "openai",
    "displayName": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "enabled": true,
    "modelRates": [
      {
        "id": "rate_1...",
        "model": "gpt-4",
        "type": "chatCompletion",
        "inputRate": 10,
        "outputRate": 30
      }
    ],
    "credentials": [
      {
        "id": "cred_1...",
        "name": "Default Key",
        "credentialType": "api_key",
        "active": true,
        "displayText": "Default Key (sk-••••key)",
        "maskedValue": {
          "api_key": "sk-••••key"
        }
      }
    ]
  }
]
```

---

### AI プロバイダーの作成

システムに新しい AI プロバイダーを追加します。

- **エンドポイント:** `POST /ai-providers`
- **権限:** 管理者

**リクエストボディ**

```json
{
  "name": "anthropic",
  "displayName": "Anthropic",
  "baseUrl": "https://api.anthropic.com",
  "enabled": true
}
```

---

### プロバイダー操作

- **プロバイダーの更新:** `PUT /ai-providers/:id` (管理者)
- **プロバイダーの削除:** `DELETE /ai-providers/:id` (管理者)

---

### 認証情報の追加

指定されたプロバイダーに新しい認証情報を追加します。システムは保存前に認証情報を検証します。

- **エンドポイント:** `POST /ai-providers/:providerId/credentials`
- **権限:** 管理者

**リクエストボディ**

```json
{
  "name": "My API Key",
  "value": "sk-...",
  "credentialType": "api_key"
}
```

---

### 認証情報操作

- **認証情報の更新:** `PUT /ai-providers/:providerId/credentials/:credentialId` (管理者)
- **認証情報の削除:** `DELETE /ai-providers/:providerId/credentials/:credentialId` (管理者)
- **認証情報ステータスの確認:** `GET /ai-providers/:providerId/credentials/:credentialId/check` (管理者) - 認証情報の有効性をリアルタイムで確認します。

---

### モデルレートの追加

プロバイダーに新しいモデルレート設定を追加します。

- **エンドポイント:** `POST /ai-providers/:providerId/model-rates`
- **権限:** 管理者

**リクエストボディ**

```json
{
  "model": "claude-3-opus-20240229",
  "type": "chatCompletion",
  "inputRate": 15,
  "outputRate": 75,
  "unitCosts": {
    "input": 0.000015,
    "output": 0.000075
  }
}
```

---

### モデルレートの一括追加

単一のモデルレート設定を複数のプロバイダーに同時に追加します。

- **エンドポイント:** `POST /ai-providers/model-rates`
- **権限:** 管理者

**リクエストボディ**

```json
{
  "model": "llama3-70b-8192",
  "type": "chatCompletion",
  "inputRate": 1,
  "outputRate": 1,
  "providers": ["prov_1...", "prov_2..."]
}
```

---

### モデルレート操作

- **プロバイダーのレート一覧:** `GET /ai-providers/:providerId/model-rates` (ユーザー)
- **モデルレートの更新:** `PUT /ai-providers/:providerId/model-rates/:rateId` (管理者)
- **モデルレートの削除:** `DELETE /ai-providers/:providerId/model-rates/:rateId` (管理者)

---

### 全モデルレートのリスト表示

すべてのプロバイダーにわたる全モデルレートの、ページ分割およびフィルタリング可能なリストを取得します。

- **エンドポイント:** `GET /ai-providers/model-rates`
- **権限:** 認証済みユーザー

**クエリパラメータ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `page` | number | ページネーションのページ番号。 |
| `pageSize` | number | ページあたりのアイテム数。 |
| `providerId` | string | フィルタリングするプロバイダー ID のカンマ区切りリスト。 |
| `model` | string | モデル名の検索語。 |

---

### モデルレートの一括更新

指定された利益率と単一クレジットの価格に基づいて、既存のすべてのモデルレートを更新します。新しいレートは次のように計算されます：`newRate = (unitCost * (1 + profitMargin / 100)) / creditPrice`。

- **エンドポイント:** `POST /ai-providers/bulk-rate-update`
- **権限:** 管理者

**リクエストボディ**

```json
{
  "profitMargin": 20,
  "creditPrice": 0.00001
}
```

**成功レスポンス (200 OK)**

```json
{
  "message": "Successfully updated 50 model rates",
  "updated": 50,
  "skipped": 5,
  "parameters": {
    "profitMargin": 20,
    "creditPrice": 0.00001
  },
  "summary": [
    {
      "id": "rate_1...",
      "model": "gpt-4",
      "provider": "OpenAI",
      "oldInputRate": 10,
      "newInputRate": 12,
      "oldOutputRate": 30,
      "newOutputRate": 36
    }
  ]
}
```

---

## サービスディスカバリと監視

### 利用可能なモデルのリスト表示 (公開)

LiteLLM と互換性のある形式で、有効化および設定されたすべてのモデルのリストを提供する公開エンドポイントです。これは、クライアントアプリケーションによるサービスディスカバリに不可欠です。

- **エンドポイント:** `GET /ai-providers/models`
- **権限:** 公開

**成功レスポンス (200 OK)**

```json
[
  {
    "key": "openai/gpt-4",
    "model": "gpt-4",
    "type": "chat",
    "provider": "openai",
    "providerId": "prov_1...",
    "input_credits_per_token": 10,
    "output_credits_per_token": 30,
    "modelMetadata": {
      "maxTokens": 8192,
      "features": ["tools", "vision"]
    },
    "status": {
      "id": "status_1...",
      "lastChecked": "2023-10-27T10:00:00.000Z",
      "latency": 120,
      "status": "operational"
    },
    "providerDisplayName": "OpenAI"
  }
]
```

---

### モデルのヘルスチェックのトリガー

設定されているすべてのモデルのヘルスチェックをエンキューするための管理者用エンドポイント。モデルステータスの強制的な更新に役立ちます。

- **エンドポイント:** `GET /ai-providers/test-models`
- **権限:** 管理者

---

### プロバイダーのヘルスステータス

設定されているすべてのプロバイダー認証情報のヘルスステータスの概要を提供します。このエンドポイントは、監視およびアラートシステムとの統合のために設計されています。

- **エンドポイント:** `GET /ai-providers/health`
- **権限:** 公開

**成功レスポンス (200 OK)**

```json
{
  "providers": {
    "openai": {
      "Default Key": {
        "running": true
      }
    },
    "anthropic": {
      "Primary Key": {
        "running": false
      }
    }
  },
  "timestamp": "2023-10-27T12:00:00.000Z"
}
```