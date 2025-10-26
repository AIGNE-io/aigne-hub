# デプロイとインストール

このセクションでは、AIGNE Hub をデプロイするための包括的な手順を説明します。Blocklet Store を介した推奨のワンクリック方法と、開発者およびカスタム環境向けのソースコードからの手動インストールプロセスについて説明します。

先に進む前に、お使いの環境が正しく設定されていることを確認するために、システムの前提条件を確認することが不可欠です。迅速な開始を目指している場合でも、カスタマイズされたインストールを目指している場合でも、成功したデプロイのためには適切なセットアップが重要です。

```d2
direction: down

Start: {
  label: "デプロイ開始"
  shape: oval
}

Prerequisites: {
  label: "システムの\n前提条件を確認"
  shape: rectangle
}

Decision: {
  label: "デプロイ方法を\n選択"
  shape: diamond
}

One-Click-Install: {
  label: "Blocklet Store:\nワンクリックインストール"
  shape: rectangle
}

Clone-Repo: {
  label: "手動: ソースコードを\nクローン"
  shape: rectangle
}

Install-Deps: {
  label: "手動: 依存関係を\nインストール"
  shape: rectangle
}

Run-App: {
  label: "手動: アプリケーションを\n実行"
  shape: rectangle
}

End: {
  label: "AIGNE Hub デプロイ完了"
  shape: oval
}

Start -> Prerequisites
Prerequisites -> Decision
Decision -> One-Click-Install: "推奨"
Decision -> Clone-Repo: "開発者向け"

One-Click-Install -> End

Clone-Repo -> Install-Deps
Install-Deps -> Run-App
Run-App -> End

```

## デプロイ方法

AIGNE Hub をデプロイするには、主に2つの方法があります。技術的な要件と運用環境に最も適した方法を選択してください。

<x-cards data-columns="2">
  <x-card data-title="Blocklet Store でのデプロイ（推奨）" data-icon="lucide:store">
    最も迅速かつ簡単な方法です。ワンクリックでインストールでき、Blocklet Server 環境内ですべての依存関係と初期設定が自動的に処理されます。この方法は、ほとんどのユーザーにとって理想的です。
  </x-card>
  <x-card data-title="ソースからの手動インストール" data-icon="lucide:file-code-2">
    インストールをカスタマイズしたり、プロジェクトに貢献したり、Blocklet Server 以外の環境に AIGNE Hub をデプロイしたりする必要がある開発者向けです。ソースコードをクローンし、依存関係を手動で管理する必要があります。
  </x-card>
</x-cards>

## 詳細ガイド

詳細なステップバイステップの手順については、関連するサブセクションに進んでください。インストールプロセスを開始する前に、すべての前提条件を満たしていることを確認してください。

<x-cards data-columns="1">
  <x-card data-title="前提条件" data-icon="lucide:clipboard-list" data-href="/deployment-and-installation/prerequisites" data-horizontal="true">
    インストールを開始する前に、Node.js や Blocklet Server など、必要なソフトウェアと環境設定を確認してください。
  </x-card>
  <x-card data-title="Blocklet Store でのデプロイ" data-icon="lucide:rocket" data-href="/deployment-and-installation/blocklet-store" data-horizontal="true">
    最も簡単なデプロイ体験のために、ワンクリックインストールガイドに従ってください。
  </x-card>
  <x-card data-title="手動インストール" data-icon="lucide:terminal" data-href="/deployment-and-installation/manual-installation" data-horizontal="true">
    ソースコードリポジトリからインストールするためのステップバイステップの手順にアクセスします。
  </x-card>
</x-cards>

## まとめ

このセクションでは、AIGNE Hub をデプロイするための利用可能な方法の概要を説明します。ほとんどの運用シナリオでは、そのシンプルさと信頼性から [Blocklet Store でのデプロイ](./deployment-and-installation-blocklet-store.md) が推奨されます。開発環境や特殊な環境向けには、[手動インストール](./deployment-and-installation-manual-installation.md) ガイドに必要な詳細な手順が記載されています。デプロイが成功した後の次のステップは、[設定](./configuration.md) セクションで詳述されているように、システムを設定することです。