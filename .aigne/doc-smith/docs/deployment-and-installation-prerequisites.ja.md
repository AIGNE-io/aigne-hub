# 前提条件

AIGNE Hub をデプロイする前に、ターゲット環境が指定されたソフトウェアおよびシステム要件を満たしていることを確認することが不可欠です。このセクションでは、正常なインストールとスムーズな運用に必要な依存関係について概説します。これらの前提条件に従うことで、互換性の問題を回避し、デプロイプロセスを容易にします。

## ソフトウェア要件

以下のソフトウェアコンポーネントがホストシステムにインストールされ、正しく設定されている必要があります。

### Node.js

AIGNE Hub は Node.js アプリケーションであり、正常に機能するためには特定のバージョンのランタイムが必要です。

*   **要件**: Node.js は、AIGNE Hub のバックエンドサービスを実行する JavaScript ランタイム環境です。
*   **必須バージョン**: `18.0.0` 以上。
*   **確認**: インストールされているバージョンを確認するには、ターミナルで次のコマンドを実行します:
    ```bash Node.js バージョン確認 icon=logos:nodejs-icon
    node -v
    ```
*   **インストール**: Node.js をインストールしていない、またはアップグレードする必要がある場合は、[nvm](https://github.com/nvm-sh/nvm) (Linux/macOS用) や [nvm-windows](https://github.com/coreybutler/nvm-windows) のようなバージョンマネージャーを使用して複数の Node.js バージョンを管理することをお勧めします。公式インストーラーは [Node.js のウェブサイト](https://nodejs.org/) からも入手できます。

### pnpm

ソースからの手動インストールや開発目的の場合、`pnpm` が指定されたパッケージマネージャーです。効率的な依存関係の管理に必要です。

*   **要件**: `pnpm` は高速でディスクスペース効率の良いパッケージマネージャーです。プロジェクトの依存関係のインストールと管理に使用されます。
*   **必須バージョン**: `9.0.0` 以上。
*   **確認**: インストールされているバージョンを確認するには、次のコマンドを実行します:
    ```bash pnpm バージョン確認 icon=logos:pnpm
    pnpm -v
    ```
*   **インストール**: `pnpm` は npm (Node.js に付属) または他の方法でインストールできます。推奨される方法は、スタンドアロンスクリプトを使用することです。詳細な手順については、[pnpm の公式インストールガイド](https://pnpm.io/installation) を参照してください。

    ```bash pnpm のインストール icon=logos:pnpm
    npm install -g pnpm
    ```

## デプロイ環境

AIGNE Hub は [Blocklet](https://www.blocklet.io/) として設計およびパッケージ化されており、Blocklet Server 上で実行されます。

### Blocklet Server

Blocklet Server は、AIGNE Hub のような Blocklet のライフサイクル、設定、および運用を管理するクラウドネイティブなアプリケーションサーバーです。

*   **要件**: Blocklet Server は、リバースプロキシ、自動 HTTPS、ユーザー認証など、AIGNE Hub の運用に不可欠なランタイム環境を提供します。
*   **インストール**: Blocklet Server はさまざまなプラットフォームにインストールできます。推奨される最も簡単な方法は、`blocklet-cli` を使用することです。
    ```bash Blocklet CLI のインストール icon=lucide:terminal
    npm install -g @blocklet/cli
    ```
    CLI をインストールしたら、サーバーを初期化して起動できます。
    ```bash Blocklet Server の初期化 icon=lucide:server
    blocklet server init
    blocklet server start
    ```
*   **詳細情報**: 包括的なインストールおよび管理手順については、[Blocklet Server のドキュメント](https://docs.blocklet.io/docs/en/getting-started) を参照してください。

## まとめ

要約すると、AIGNE Hub に準拠したデプロイ環境には以下が必要です：

| コンポーネント | 最小バージョン | 目的 |
| ---------------- | --------------- | ------------------------------------------- |
| Node.js | `>= 18.0.0` | JavaScript ランタイム環境 |
| pnpm | `>= 9.0.0` | パッケージ管理 (手動ビルド用) |
| Blocklet Server | 最新 | アプリケーションサーバーおよびランタイム環境 |

これらの前提条件が満たされていることを確認することは、安定かつ安全な AIGNE Hub デプロイのための最初で最も重要なステップです。環境が正しく設定されたら、インストールガイドに進むことができます。

- 推奨されるワンクリックデプロイについては、[Blocklet Store からのデプロイ](./deployment-and-installation-blocklet-store.md) を参照してください。
- 開発者および上級ユーザーは、[手動インストール](./deployment-and-installation-manual-installation.md) ガイドに従ってください。