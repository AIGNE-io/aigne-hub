# セキュリティとアクセス

安全で適切に管理されたシステムは、あらゆるエンタープライズグレードのデプロイメントにとって不可欠です。このセクションでは、AIGNE Hubの堅牢なセキュリティアーキテクチャについて詳述し、認証、クレデンシャル管理、アクセス制御、ロギングをカバーして、AI運用の完全性と機密性を確保します。

以下の図は、AIGNE Hub内のセキュリティレイヤーとコンポーネントのハイレベルな概要を示しています。

```d2
direction: down

User: {
  shape: c4-person
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  Authentication: {
    label: "認証レイヤー"
    shape: rectangle
    style: {
      stroke-dash: 2
      fill: "#f0f9ff"
    }

    DID-Connect: {
      label: "DID Connect"
      icon: "https://www.arcblock.io/image-bin/uploads/71eea946246150766324008427d2f63d.svg"
    }

    Blocklet-Server-Auth: {
      label: "Blocklet Server Auth"
    }

    auth-db: {
      label: "auth.db"
      shape: cylinder
    }
  }

  Admin-Panel: {
    label: "管理パネル"
    shape: rectangle
    style: {
      fill: "#fffbe6"
    }

    RBAC-Middleware: {
      label: "RBACミドルウェア\n(ensureAdmin)"
    }

    Admin-APIs: {
      label: "管理API\n(プロバイダー管理など)"
    }
  }

  Credential-Management: {
    label: "クレデンシャル管理"
    shape: rectangle
    style: {
      fill: "#f6ffed"
    }

    Encryption-Module: {
      label: "@blocklet/sdk/lib/security"
    }

    Encrypted-DB: {
      label: "暗号化されたクレデンシャル\n(データベース)"
      shape: cylinder
    }
  }

  Audit-Logging: {
    label: "監査ログ"
    shape: cylinder
  }
}

Upstream-AI-Providers: {
  label: "上流AIプロバイダー"
  shape: rectangle
}

User -> AIGNE-Hub.Authentication.DID-Connect: "1. ログイン"
AIGNE-Hub.Authentication.DID-Connect -> AIGNE-Hub.Authentication.Blocklet-Server-Auth: "2. 認証"
AIGNE-Hub.Authentication.Blocklet-Server-Auth -> AIGNE-Hub.Authentication.auth-db: "3. セッション管理"

User -> AIGNE-Hub.Admin-Panel.RBAC-Middleware: "4. 管理パネルへのアクセス"
AIGNE-Hub.Admin-Panel.RBAC-Middleware -> AIGNE-Hub.Admin-Panel.Admin-APIs: "5. アクセスを許可/拒否"

AIGNE-Hub.Admin-Panel.Admin-APIs -> AIGNE-Hub.Credential-Management.Encryption-Module: "6. プロバイダーキーを追加/更新"
AIGNE-Hub.Credential-Management.Encryption-Module -> AIGNE-Hub.Credential-Management.Encrypted-DB: "7. 暗号化されたキーを保存"

AIGNE-Hub.Admin-Panel.Admin-APIs -> AIGNE-Hub.Audit-Logging: "管理アクションを記録"
AIGNE-Hub.Credential-Management.Encryption-Module -> AIGNE-Hub.Audit-Logging: "クレデンシャルイベントを記録"

AIGNE-Hub.Credential-Management.Encrypted-DB <-> Upstream-AI-Providers: "APIキーを安全に保存"
```

## 認証

AIGNE HubはBlocklet Serverの標準的な認証メカニズムと統合されており、安全で統一されたログイン体験を提供します。主要な認証方法はDID Connectを介したものであり、分散型IDを活用してパスワードレスで安全なアクセスを実現します。

### DID Connectの統合

すべてのユーザー認証は、基盤となるBlocklet Server環境によって処理されます。ユーザーがAIGNE Hubにログインすると、DID Connectウォレットオーセンティケーターを介して認証され、アクセスが検証済みの分散型IDに紐づけられることが保証されます。このアプローチにより、従来のユーザー名とパスワードの組み合わせが不要になり、クレデンシャル盗難のリスクが低減されます。

システムは認証ストレージデータベース（`auth.db`）を使用して、セッショントークンを安全に管理します。

AIGNE HubへのプログラムによるAPIリクエストを認証する方法の詳細については、[API認証](./api-reference-authentication.md)ドキュメントを参照してください。

## 暗号化されたクレデンシャルストレージ

上流のAIプロバイダーからのAPIキーやその他の機密クレデンシャルを保存することは、重要なセキュリティ上の懸念事項です。AIGNE Hubは、すべての機密クレデンシャルデータに対して強力なフィールドレベルの暗号化を実装することで、この問題に対処しています。

### 暗号化メカニズム

プロバイダーのクレデンシャル（APIキーやシークレットアクセスキーなど）を追加すると、クレデンシャルの機密部分はデータベースに保存される前に暗号化されます。

-   **暗号化対象**: 機密フィールドのみが暗号化されます。たとえば、`access_key_pair`では、`secret_access_key`は暗号化されますが、`access_key_id`は識別のために平文のままです。スタンドアロンの`api_key`値は常に暗号化されます。
-   **テクノロジー**: 暗号化および復号化の操作は、堅牢な暗号化機能を提供する`@blocklet/sdk/lib/security`モジュールによって処理されます。

`AiCredential`モデルからの以下のコードスニペットは、そのプロセスを示しています。

```typescript ai-credential.ts icon=lucide:file-code
// クレデンシャル値を暗号化（機密フィールドのみを暗号化）
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };

  // 機密フィールドを暗号化
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }

  // access_key_id は平文のまま
  return encrypted;
}

// クレデンシャル値を復号
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };

  // 機密フィールドを復号
  if (encryptedCredential.secret_access_key) {
    decrypted.secret_access_key = security.decrypt(encryptedCredential.secret_access_key);
  }
  if (encryptedCredential.api_key) {
    decrypted.api_key = security.decrypt(encryptedCredential.api_key);
  }

  return decrypted;
}
```

### クレデンシャルのマスキング

ユーザーインターフェースで機密キーが誤って公開されるのを防ぐため、AIGNE Hubはクレデンシャル値を自動的にマスキングします。キーの最初の4文字と最後の4文字のみが表示され、残りはアスタリスクに置き換えられます。

## ロールベースアクセス制御（RBAC）

AIGNE Hubは、管理機能へのアクセスを制限するために、シンプルかつ効果的なロールベースアクセス制御（RBAC）モデルを採用しています。ロールはBlocklet Server環境から継承されます。

### 利用可能なロール

| ロール | 権限 |
| :------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `owner` | AIGNE Hubインスタンスへの完全な管理アクセス。プロバイダーの管理、課金の設定、分析の表示、およびすべての設定の管理ができます。 |
| `admin` | `owner`と同じ権限。このロールも管理機能への完全なアクセス権を持つ特権ユーザーと見なされます。 |
| `guest` | 標準ユーザーロール。ハブが提供するAIサービス（例：プレイグラウンド、APIアクセス）を使用できますが、管理設定にはアクセスできません。 |

重要な管理APIエンドポイントへのアクセスは、ユーザーのロールを検証するミドルウェアによって保護されており、`owner`または`admin`ロールを持つユーザーのみが管理タスクを実行できるように保証されています。

```typescript security.ts icon=lucide:shield
import { auth } from '@blocklet/sdk/lib/middlewares';

// ユーザーが 'owner' または 'admin' ロールを持つことを保証するミドルウェア
export const ensureAdmin = auth({ roles: ['owner', 'admin'] });
```

## 監査ログ

包括的な監査ログは、セキュリティ分析、トラブルシューティング、およびコンプライアンスにとって不可欠です。AIGNE Hubは、システム内のすべての重要なアクティビティの詳細なログを保持します。

### ログに記録されるアクティビティ

-   **APIリクエスト**: AIエンドポイントへのすべての受信リクエストは、ユーザー、リクエストされたモデル、および使用状況メトリクスを含めてログに記録されます。
-   **管理アクション**: 管理パネルで実行されたアクション（プロバイダーの追加や更新、モデル料金の変更、設定の変更など）が記録されます。
-   **クレデンシャル管理**: プロバイダークレデンシャルの作成、変更、または削除に関連するイベント。

これらのログは、使用状況と管理上の変更の完全な履歴を提供し、セキュリティ監査や運用監視にとって非常に貴重です。

## まとめ

AIGNE Hubは、AIゲートウェイを保護するために多層的なセキュリティモデルで設計されています。DIDベースの認証、クレデンシャルの強力な暗号化、ロールベースのアクセス制御、および詳細な監査ログを組み合わせることで、社内エンタープライズ利用と一般向けサービスの両方に対して安全な基盤を提供します。

関連機能の詳細については、以下のセクションを参照してください。

<x-cards data-columns="2">
  <x-card data-title="プロバイダー管理" data-href="/features/provider-management" data-icon="lucide:server">上流AIプロバイダーの接続と設定方法を学びます。</x-card>
  <x-card data-title="使用量とコスト分析" data-href="/features/analytics" data-icon="lucide:pie-chart">システム全体およびユーザーごとの消費量を監視する方法を探ります。</x-card>
</x-cards>