# ユーザーサービス

## 概要

ユーザーサービスは、すべてのユーザー中心のデータと操作を管理する責任を負うコアコンポーネントです。ユーザー情報、クレジットベースの課金、および詳細な利用分析を処理するための一連のAPIエンドポイントを提供します。このサービスは、個々のユーザーアカウント管理とシステム全体の管理監督の両方にとって不可欠です。

運用面では、このサービスは高性能とデータ整合性を目指して設計されています。主要なアーキテクチャ上の特徴は、利用統計のキャッシュメカニズムです。これにより、集計データが事前に計算・保存され、分析クエリに対する高速な応答を実現し、プライマリデータベースへの重い計算負荷を防ぎます。

## 主要な概念

### クレジットベースの課金

このシステムは、外部のPayment Kitと統合し、クレジットベースの課金モデルをサポートします。有効化されている場合（`creditBasedBillingEnabled`がtrue）、ユーザーサービスは以下を処理します：
- ユーザーのクレジット残高の取得。
- トランザクション履歴と付与履歴の取得。
- ユーザーが追加のクレジットを購入するための支払いリンクの提供。

Payment Kitが実行されていない、または無効になっている場合、サービスは適切に機能縮小し、クレジット関連のエンドポイントはエラーを返すか、機能が無効であることを示します。

### 利用統計のキャッシュ

利用データの応答性が高く効率的な取得を保証するため、ユーザーサービスはモデルコール統計に対して高度なキャッシュ戦略を採用しています。リソースを大量に消費する`ModelCalls`テーブルからリクエストごとに集計を計算する代わりに、システムはこれらの統計を`ModelCallStat`テーブルに事前に計算して保存します。

**キャッシュロジック：**

1.  **粒度**: 統計は1時間単位で集計されます。これにより、データの鮮度と計算オーバーヘッドのバランスが取れます。
2.  **オンデマンド計算**: 過去の期間の時間単位の統計がリクエストされた場合、システムはまず`ModelCallStat`キャッシュを確認します。
3.  **キャッシュミス**: データがキャッシュにない場合（「キャッシュミス」）、サービスは`ModelCalls`テーブルに対して最適化されたSQLクエリを実行し、その特定の時間の統計を計算します。
4.  **キャッシュ保存**: 新たに計算された統計は`ModelCallStat`テーブルに保存され、同じ時間に対する後続のリクエストがキャッシュから直接提供されるようになります。
5.  **リアルタイムデータ**: 現在進行中の時間については、常にリアルタイムで統計が計算され、最新の情報が提供されます。

この設計により、すべての利用統計エンドポイントのデータベース負荷とAPIレイテンシが大幅に削減されます。これは、システムのスケーラビリティとパフォーマンスにとって重要なコンポーネントです。メンテナンスやトラブルシューティングのために、必要に応じてこれらのキャッシュされた統計を手動で再計算するための管理者専用エンドポイントが提供されています。

## APIエンドポイント

以下のセクションでは、利用可能なAPIエンドポイント、そのパラメータ、および機能について詳しく説明します。

---

### ユーザー情報

#### ユーザー情報の取得

現在認証されているユーザーの包括的な情報（プロフィール詳細やクレジット残高など、該当する場合）を取得します。

-   **エンドポイント**: `GET /info`
-   **権限**: 認証済みユーザー

**戻り値**

<x-field-group>
  <x-field data-name="user" data-type="object" data-desc="ユーザーのプロフィール情報。">
    <x-field data-name="did" data-type="string" data-desc="ユーザーの分散型識別子。"></x-field>
    <x-field data-name="fullName" data-type="string" data-desc="ユーザーのフルネーム。"></x-field>
    <x-field data-name="email" data-type="string" data-desc="ユーザーのメールアドレス。"></x-field>
    <x-field data-name="avatar" data-type="string" data-desc="ユーザーのアバターへのURL。"></x-field>
  </x-field>
  <x-field data-name="creditBalance" data-type="object" data-desc="ユーザーのクレジット残高詳細。クレジットベースの課金が無効な場合は Null。">
    <x-field data-name="balance" data-type="number" data-desc="利用可能なクレジット残高。"></x-field>
    <x-field data-name="total" data-type="number" data-desc="付与されたクレジットの合計。"></x-field>
    <x-field data-name="grantCount" data-type="number" data-desc="受け取ったクレジット付与の回数。"></x-field>
    <x-field data-name="pendingCredit" data-type="number" data-desc="保留中のトランザクションからのクレジット。"></x-field>
  </x-field>
  <x-field data-name="paymentLink" data-type="string" data-desc="ユーザーがクレジットを購入するための短縮URL。"></x-field>
  <x-field data-name="currency" data-type="object" data-desc="支払いに使用される通貨。"></x-field>
  <x-field data-name="enableCredit" data-type="boolean" data-desc="システムでクレジットベースの課金が有効かどうかを示します。"></x-field>
  <x-field data-name="profileLink" data-type="string" data-desc="ユーザーのクレジット利用状況プロフィールページへの短縮URL。"></x-field>
</x-field-group>

---

### クレジット管理

これらのエンドポイントは、クレジットベースの課金が有効な場合にのみ機能します。

#### クレジット付与の取得

認証済みユーザーのクレジット付与のリストをページ分割で取得します。

-   **エンドポイント**: `GET /credit/grants`
-   **権限**: 認証済みユーザー

**クエリパラメータ**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="ページネーションのページ番号（1から始まります）。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="1ページあたりのアイテム数（最大100）。"></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="期間の終了を示すUnixタイムスタンプ。"></x-field>
</x-field-group>

#### クレジットトランザクションの取得

認証済みユーザーのクレジットトランザクションのリストをページ分割で取得します。

-   **エンドポイント**: `GET /credit/transactions`
-   **権限**: 認証済みユーザー

**クエリパラメータ**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-desc="ページネーションのページ番号（1から始まります）。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-desc="1ページあたりのアイテム数（最大100）。"></x-field>
    <x-field data-name="start" data-type="number" data-required="false" data-desc="期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="end" data-type="number" data-required="false" data-desc="期間の終了を示すUnixタイムスタンプ。"></x-field>
</x-field-group>

#### クレジット残高の取得

認証済みユーザーの現在のクレジット残高を取得します。

-   **エンドポイント**: `GET /credit/balance`
-   **権限**: 認証済みユーザー

#### クレジット支払いリンクの取得

クレジットを購入するための短縮URLを提供します。

-   **エンドポイント**: `GET /credit/payment-link`
-   **権限**: 認証済みユーザー

---

### モデルコール履歴

#### モデルコールの取得

モデルコール記録のリストをページ分割で取得します。広範なフィルタリングをサポートしています。

-   **エンドポイント**: `GET /model-calls`
-   **権限**: 認証済みユーザー。`allUsers=true` の場合は、管理者/所有者ロールが必要です。

**クエリパラメータ**

<x-field-group>
    <x-field data-name="page" data-type="number" data-required="false" data-default="1" data-desc="ページネーションのページ番号。"></x-field>
    <x-field data-name="pageSize" data-type="number" data-required="false" data-default="50" data-desc="1ページあたりのアイテム数（最大100）。"></x-field>
    <x-field data-name="startTime" data-type="string" data-required="false" data-desc="期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="false" data-desc="期間の終了を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="search" data-type="string" data-required="false" data-desc="コール記録に対するキーワード検索。"></x-field>
    <x-field data-name="status" data-type="string" data-required="false" data-desc="ステータスでフィルタリングします。'success'、'failed'、または 'all' を指定できます。"></x-field>
    <x-field data-name="model" data-type="string" data-required="false" data-desc="特定のモデル名でフィルタリングします。"></x-field>
    <x-field data-name="providerId" data-type="string" data-required="false" data-desc="特定のプロバイダーIDでフィルタリングします。"></x-field>
    <x-field data-name="appDid" data-type="string" data-required="false" data-desc="呼び出し元アプリケーションのDIDでフィルタリングします。"></x-field>
    <x-field data-name="allUsers" data-type="boolean" data-required="false" data-desc="trueの場合、すべてのユーザーの記録を返します。管理者/所有者ロールが必要です。"></x-field>
</x-field-group>

#### モデルコールのエクスポート

モデルコール記録をCSVファイルにエクスポートします。`/model-calls`エンドポイントと同じフィルタリングをサポートしています。

-   **エンドポイント**: `GET /model-calls/export`
-   **権限**: 認証済みユーザー。`allUsers=true` の場合は、管理者/所有者ロールが必要です。

**クエリパラメータ**

`GET /model-calls` と同じクエリパラメータがサポートされていますが、`page` と `pageSize` は除きます。エクスポートの上限は10,000件にハードコードされています。

---

### 利用統計

#### 利用統計の取得

指定された期間の集計された利用統計を取得します。このデータはキャッシュシステムから提供されます。

-   **エンドポイント**: `GET /usage-stats`
-   **権限**: 認証済みユーザー

**クエリパラメータ**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="期間の終了を示すUnixタイムスタンプ。"></x-field>
</x-field-group>

#### 週次/月次比較の取得

前週または前月との利用メトリクスの比較を取得します。

-   **エンドポイント**: `GET /weekly-comparison`
-   **エンドポイント**: `GET /monthly-comparison`
-   **権限**: 認証済みユーザー

---

### 管理操作

これらのエンドポイントは、システムのメンテナンスとトラブルシューティングを目的としています。

#### 全ユーザー統計の取得（管理者）

全ユーザーを合計した集計利用統計を取得します。

-   **エンドポイント**: `GET /admin/user-stats`
-   **権限**: 管理者

**クエリパラメータ**

<x-field-group>
    <x-field data-name="startTime" data-type="string" data-required="true" data-desc="期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="endTime" data-type="string" data-required="true" data-desc="期間の終了を示すUnixタイムスタンプ。"></x-field>
</x-field-group>

#### 統計キャッシュの再計算

特定のユーザーと期間について、時間単位の利用統計の再計算を手動でトリガーします。これは、データの不一致を修正したり、システム変更後にデータをバックフィルしたりするのに役立ちます。

-   **エンドポイント**: `POST /recalculate-stats`
-   **権限**: 管理者

**リクエストボディ**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="統計の再計算が必要なユーザーのDID。"></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="再計算期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="再計算期間の終了を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="dryRun" data-type="boolean" data-required="false" data-desc="trueの場合、エンドポイントは実際には実行せず、どのようなアクションを実行するかを報告します。"></x-field>
</x-field-group>

#### 日次統計キャッシュのクリーンアップ

特定のユーザーと期間について、レガシーな日次統計エントリをキャッシュから削除します。

-   **エンドポイント**: `POST /cleanup-daily-stats`
-   **権限**: 管理者

**リクエストボディ**

<x-field-group>
    <x-field data-name="userDid" data-type="string" data-required="true" data-desc="統計をクリーンアップする対象のユーザーのDID。"></x-field>
    <x-field data-name="startTime" data-type="number" data-required="true" data-desc="クリーンアップ期間の開始を示すUnixタイムスタンプ。"></x-field>
    <x-field data-name="endTime" data-type="number" data-required="true" data-desc="クリーンアップ期間の終了を示すUnixタイムスタンプ。"></x-field>
</x-field-group>