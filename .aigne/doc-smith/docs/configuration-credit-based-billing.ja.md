# 5. モデルレート管理

このセクションでは、プラットフォームのクレジットベースの課金システムの基本であるAIモデルレートの設定と管理について詳しく説明します。運用者は、価格設定の定義、モデルの管理、および課金の不正確さに関するトラブルシューティングに必要な情報を見つけることができます。

## 5.1. コアコンセプト

**モデルレート**は、特定のプロバイダーから特定のAIモデルを使用するコストを定義するレコードです。各レートは、入力トークンごとおよび出力トークンごとに請求されるクレジット数を指定します。この詳細な価格設定構造が、すべての使用量計算と課金の基礎となります。

主要なコンポーネントは以下の通りです：

*   **プロバイダー**: AIサービスプロバイダー（例：OpenAI、Google、Bedrock）。
*   **モデル**: 特定のモデル識別子（例：`gpt-4`、`gemini-1.5-pro-latest`）。
*   **タイプ**: モデルのモダリティ。`chatCompletion`、`imageGeneration`、`embedding`など。
*   **レート**:
    *   `inputRate`: 1,000入力トークンあたりのクレジットコスト。
    *   `outputRate`: 1,000出力トークンあたり、または生成された画像あたりのクレジットコスト。
*   **ユニットコスト**: 法定通貨（例：USD）での100万トークンあたりのモデルの実際のコスト。これは、自動化された一括価格調整に使用されます。

正確で完全なモデルレート設定は非常に重要です。ユーザーが呼び出そうとするモデルのレートが存在しない場合、システムは使用コストを計算できないため、APIリクエストは失敗します。

![モデルレート管理UI](d037b6b6b092765ccbfa58706c241622.png)

## 5.2. APIによるモデルレートの管理

モデルレートは、一連のRESTful APIエンドポイントを通じて管理されます。すべての作成、更新、削除操作には管理者権限が必要です。

### 5.2.1. モデルレートの作成

このエンドポイントは、単一のプロバイダー上の特定のモデルに対する新しいレートを登録します。

*   **エンドポイント**: `POST /api/ai-providers/:providerId/model-rates`
*   **権限**: 管理者
*   **ボディ**:
    *   `model` (string, required): モデル識別子。
    *   `type` (string, required): モデルタイプ。`chatCompletion`、`imageGeneration`、`embedding`のいずれかである必要があります。
    *   `inputRate` (number, required): 入力のクレジットコスト。
    *   `outputRate` (number, required): 出力のクレジットコスト。
    *   `modelDisplay` (string, optional): ユーザーフレンドリーな表示名。
    *   `description` (string, optional): モデルの簡単な説明。
    *   `unitCosts` (object, optional): プロバイダーからの基礎となるコスト。
        *   `input` (number, required): 100万入力トークンあたりのコスト。
        *   `output` (number, required): 100万出力トークンあたりのコスト。
    *   `modelMetadata` (object, optional): 追加のモデル機能。

**リクエスト例**:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "gpt-4o",
    "type": "chatCompletion",
    "inputRate": 10,
    "outputRate": 30,
    "modelDisplay": "GPT-4 Omni",
    "unitCosts": {
      "input": 5.0,
      "output": 15.0
    },
    "modelMetadata": {
      "maxTokens": 128000,
      "features": ["tools", "vision"]
    }
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates
```

### 5.2.2. モデルレートの一括作成

このエンドポイントは、複数のプロバイダーにわたって同じモデルレートを同時に作成することができます。これは、いくつかのベンダーから利用可能なモデルに便利です。

*   **エンドポイント**: `POST /api/ai-providers/model-rates`
*   **権限**: 管理者
*   **ボディ**: 単一作成エンドポイントと同じですが、追加の`providers`配列があります。
    *   `providers` (array of strings, required): このレートを作成すべきプロバイダーIDのリスト。

**リクエスト例**:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "model": "claude-3-sonnet",
    "type": "chatCompletion",
    "inputRate": 6,
    "outputRate": 30,
    "providers": ["prv_bedrock_xxxx", "prv_anthropic_yyyy"],
    "unitCosts": {
      "input": 3.0,
      "output": 15.0
    }
  }' \
  https://<your-domain>/api/ai-providers/model-rates
```

システムは、指定されたすべてのプロバイダーが存在すること、および重複を防ぐために、指定されたモデルとタイプのレートが対象プロバイダーのいずれにもまだ存在しないことを検証します。

### 5.2.3. モデルレートの更新

このエンドポイントは、既存のモデルレートを変更します。

*   **エンドポイント**: `PUT /api/ai-providers/:providerId/model-rates/:rateId`
*   **権限**: 管理者
*   **ボディ**: 作成フィールドのサブセットを提供できます。
    *   `modelDisplay`, `inputRate`, `outputRate`, `description`, `unitCosts`, `modelMetadata`.

**リクエスト例**:

```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "inputRate": 12,
    "outputRate": 35
  }' \
  https://<your-domain>/api/ai-providers/prv_xxxxxxxx/model-rates/rate_zzzzzzzz
```

### 5.2.4. モデルレートの削除

このエンドポイントは、モデルレートを恒久的に削除します。一度削除されると、対応するモデルは課金対象外となり、使用できなくなります。

*   **エンドポイント**: `DELETE /api/ai-providers/:providerId/model-rates/:rateId`
*   **権限**: 管理者

## 5.3. 一括価格更新

簡素化され一貫性のある価格調整のために、システムは定義された利益率に基づく一括更新メカニズムを提供します。この機能は、基礎となるプロバイダーのコストやクレジット評価の変更に応じて、グローバルに価格を調整する場合に特に便利です。

*   **エンドポイント**: `POST /api/ai-providers/bulk-rate-update`
*   **権限**: 管理者
*   **ボディ**:
    *   `profitMargin` (number, required): 希望する利益率をパーセンテージで指定（例：20%の場合は`20`）。
    *   `creditPrice` (number, required): `unitCosts`と同じ通貨での単一クレジットユニットの実効価格（例：1クレジット = $0.000005の場合、`0.000005`）。

**ワークフロー**:

1.  システムは、`unitCosts`フィールドが設定されているすべての`AiModelRate`レコードを取得します。**このフィールドがないレートはスキップされます。**
2.  各有効なレートについて、次の式を使用して新しい`inputRate`と`outputRate`を計算します：
    `newRate = (unitCost / 1,000,000) * (1 + profitMargin / 100) / creditPrice`
3.  計算されたレートがレコードに適用されます。

これにより、運用者は各レートを手動で再計算するのではなく、ビジネスロジックに基づいて価格設定を維持できます。

## 5.4. モデルの同期とヘルスチェック

システムには、設定されたモデルの可用性とステータスをテストする機能が含まれています。

*   **エンドポイント**: `GET /api/ai-providers/test-models`
*   **権限**: 管理者
*   **機能**: このエンドポイントは、設定された各モデルレートに対して非同期ジョブをトリガーします。ジョブは、保存された認証情報を使用してプロバイダーでモデルを検証しようとします。結果（成功または失敗）は`AiModelStatus`テーブルに保存され、モデルがエンドユーザーに利用可能であるべきかどうかを判断するために使用できます。

**レート制限**: 乱用や下流のプロバイダーAPIへの過剰な負荷を防ぐため、このエンドポイントはレート制限されています。デフォルトでは、管理者は10分以内に最大5回までこのプロセスをトリガーできます。

## 5.5. データモデル (`AiModelRate`)

高度なトラブルシューティングのために、運用者はデータベースの`ai_model_rates`テーブルを直接検査する必要がある場合があります。

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | レートレコードの一意の識別子（例：`rate_xxxxxxxx`）。 |
| `providerId` | String | `AiProvider`レコードにリンクする外部キー。 |
| `model` | String(100) | モデルの一意の識別子（例：`gpt-4o`）。 |
| `modelDisplay` | String(100) | 人間が読めるモデル名（例：`GPT-4 Omni`）。 |
| `type` | Enum | モデルのタイプ (`chatCompletion`, `embedding`, `imageGeneration`)。 |
| `inputRate` | Decimal(10, 4) | 入力トークンのクレジットコスト。 |
| `outputRate` | Decimal(10, 4) | 出力トークンまたは画像あたりのクレジットコスト。 |
| `unitCosts` | JSON | プロバイダーからの基礎となるコストを保存します（例：`{ "input": 5.0, "output": 15.0 }`）。 |
| `modelMetadata` | JSON | モデルの機能に関するメタデータを保存します（例：`maxTokens`, `features`）。 |

## 5.6. 運用上の考慮事項

*   **`unitCosts`の欠落**: 一括レート更新機能は、完全に`unitCosts`フィールドに依存しています。特定のモデルレートでこのフィールドが設定されていない場合、そのレートは一括更新中にスキップされます。利益率ベースの価格設定ツールを使用する予定がある場合、運用者はこのデータが正確に入力されていることを確認する必要があります。

*   **価格設定のトラブルシューティング**: ユーザーがAPI呼び出しで予期しない金額を請求された場合、最初のステップは`ai_model_rates`テーブルで、使用された正確なモデルとプロバイダーをクエリすることです。`inputRate`と`outputRate`が期待値と一致することを確認してください。手動更新や一括更新が意図しない結果を生んだ場合に不一致が発生することがあります。

*   **モデルの利用不可**: あるモデルがユーザーに対して一貫して失敗する場合、運用者は`GET /test-models`エンドポイントを使用してヘルスチェックをトリガーできます。`ai_model_status`テーブルで確認できる結果は、問題がモデル自体、プロバイダー、または保存された認証情報にあるのかを診断するのに役立ちます。