# セキュリティ

AIGNE Hub は、セキュリティを中核的な原則として設計されており、認証、認可、データ保護のための堅牢なメカニズムを提供します。このドキュメントでは、主要なセキュリティ機能とアーキテクチャの概要を説明し、導入、運用、保守に関する知見を提供します。

## 認証

AIGNE Hub は、ユーザー、アプリケーション、および内部コンポーネントへのアクセスを保護するために、多層的な認証戦略を採用しています。

### ユーザー認証のための DID-Connect

ユーザー認証の主要なメカニズムは、分散型アイデンティティソリューションである `@arcblock/did-connect` です。このアプローチはウォレットベースのシステムを活用し、ユーザーが従来のパスワードなしで認証できるようにします。

- **ストレージ**: 認証トークンは `did-connect-storage-nedb` によって管理されます。これはセッションデータを `Config.dataDir/auth.db` にあるローカルの NeDB データベースファイルに保存します。
- **ハンドラー**: Blocklet SDK の `WalletAuthenticator` および `WalletHandler` クラスは、チャレンジの生成、レスポンスの検証、トークンの発行を含む認証フローを管理します。

### コンポーネント間認証

Blocklet アーキテクチャ内の内部サービスとコンポーネントは、署名検証メカニズムを使用して安全に通信します。

- **検証**: `ensureComponentCall` ミドルウェアは、コンポーネント間のリクエストをインターセプトします。Blocklet SDK の `getVerifyData` と `verify` を使用して、リクエストの署名（`sig`）の有効性を確認します。
- **フロー**: リクエストを行うコンポーネントはペイロードに署名し、受信側のコンポーネントはこの署名を検証してからリクエストを処理します。これにより、不正または改ざんされた内部 API コールが防止されます。

```typescript
// blocklets/core/api/src/libs/security.ts

import { getVerifyData, verify } from '@blocklet/sdk/lib/util/verify-sign';

export function ensureComponentCall(fallback?: (req, res, next) => any) {
  return (req, res, next) => {
    try {
      const { data, sig } = getVerifyData(req);
      const verified = verify(data, sig);
      if (!verified) throw new CustomError(401, 'verify sig failed');
      next();
    } catch (error) {
      // フォールバックを処理するか、エラーをスローする
    }
  };
}
```

## 認可

アクセス制御はロールベースのシステムを通じて管理され、ユーザーとサービスが認可されたアクションのみを実行できる権限を持つことを保証します。

### ロールベースのアクセス制御（RBAC）

AIGNE Hub は特定のロール、主に `owner` と `admin` を定義しており、これらは機密性の高いエンドポイントと操作を保護するために使用されます。

- **ミドルウェア**: `ensureAdmin` ミドルウェアは、この RBAC の実用的な実装です。管理者権限を必要とするルートに適用され、「owner」または「admin」ロールを持たないユーザーからのリクエストを自動的に拒否します。

```typescript
// blocklets/core/api/src/libs/security.ts

import { auth } from '@blocklet/sdk/lib/middlewares';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

// 使用例（概念）
// import { ensureAdmin } from './libs/security';
// app.use('/api/admin', ensureAdmin, adminRoutes);
```

これにより、AI プロバイダーの管理やシステム全体のアナリティクスの表示など、重要な管理機能が認可された担当者に限定されることが保証されます。

## 認証情報管理

AIGNE Hub の中心的な機能は、さまざまな下流の AI プロバイダーの認証情報を安全に管理する能力です。

### 安全なストレージと暗号化

API キーやアクセス トークンなどの機密性の高い認証情報は、不正アクセスを防ぐために常に保管時に暗号化されます。

- **暗号化モジュール**: このシステムは、暗号化操作のために `@blocklet/sdk/lib/security` モジュールを利用します。
- **プロセス**: AI プロバイダーの認証情報が作成または更新される際、`api_key` や `secret_access_key` などの機密フィールドは、データベースに保存される前に `security.encrypt` 関数を通過します。API コールを行うために認証情報が必要な場合、それは取得され、`security.decrypt` を使用してメモリ内で復号されます。
- **データモデル**: `AiCredential` モデルは、どのフィールドが機密であるかを明示的に定義します。`access_key_id` のような機密性のない識別子は、管理と表示を容易にするためにプレーンテキストで保持されます。

```typescript
// blocklets/core/api/src/store/models/ai-credential.ts

// 保存前に機密フィールドを暗号化する
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }
  return encrypted;
}

// 使用するために機密フィールドを復号する
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };
  if (encryptedCredential.secret_access_key) {
    decrypted.secret_access_key = security.decrypt(encryptedCredential.secret_access_key);
  }
  if (encryptedCredential.api_key) {
    decrypted.api_key = security.decrypt(encryptedCredential.api_key);
  }
  return decrypted;
}
```

### 認証情報のマスキング

ユーザーインターフェース、ログ、または API レスポンスでの偶発的な漏洩を防ぐため、認証情報の機密部分はマスクされます。`maskCredentialValue` 関数は、キーの最初の 4 文字と最後の 4 文字のみを表示し、残りをアスタリスクで隠します。

### 負荷分散と高可用性

AIGNE Hub は、単一の AI プロバイダーに対して複数の認証情報を追加することをサポートしています。これにより、負荷分散と高可用性の両方が可能になります。

- **アルゴリズム**: スムーズ加重ラウンドロビンアルゴリズムが、リクエストに次に利用可能な認証情報を選択するために使用されます。各認証情報には `weight`（デフォルトは 100）があり、システムは `current` の重みを動的に調整して、次に使用するキーを決定します。
- **耐障害性**: このメカニズムは、複数のキーに負荷を分散させ、レート制限の回避と耐障害性の提供に役立ちます。あるキーが侵害されたり無効になったりした場合、システムは同じプロバイダーの他のアクティブなキーに自動的にフォールバックできます。
- **実装**: `AiCredential` モデルの `getNextAvailableCredential` 静的メソッドには、この選択プロセスのロジックが含まれています。指定された `providerId` のすべてのアクティブな認証情報をクエリし、加重選択ロジックを適用します。