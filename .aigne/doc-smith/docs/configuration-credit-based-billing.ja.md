# クレジットベースの課金

AIGNE Hubには、AIモデルの使用状況とコストを詳細に制御するために設計された、堅牢なクレジットベースの課金システム（オプション）が含まれています。このシステムを有効にすると、オペレーターはさまざまなAIモデルに特定のクレジットレートを定義し、ユーザーごとの消費量を追跡し、クレジットを再チャージするための決済システムと統合できます。このアプローチは、プロバイダーのコストを直接転嫁する方式から、管理された内部エコノミーへと移行させ、一貫した価格設定、コストの抽象化、そして潜在的な収益性を可能にします。

このガイドでは、クレジットベースの課金システムを有効化し、設定するプロセスについて詳述します。これには、さまざまなAIモデルに特定の利用レートを設定する方法や、ユーザークレジットの管理方法が含まれます。

これらのモデルが属するAIプロバイダーの管理に関する情報については、[AIプロバイダーと認証情報](./configuration-ai-providers-and-credentials.md)のドキュメントをご覧ください。

## クレジットベースの課金の有効化

クレジットベースの課金システムは、デフォルトでは無効になっています。これを有効にするには、AIGNE Hubの設定で `CREDIT_BASED_BILLING_ENABLED` 環境変数を `true` に設定する必要があります。有効化されると、システムはすべてのAPI呼び出しに対してクレジットチェックを強制し、ユーザー残高に対する使用状況の追跡を開始します。

このモードが有効な場合、「モデルレート」設定で明示的にレートが定義されたモデルのみが、APIを通じて利用可能になります。

## モデルレートの設定

モデルレートは、クレジットベースの課金システムの基盤です。レートは、特定のAIモデルを使用するために消費されるクレジット数を定義します。レートは通常、入力（例：プロンプトトークン）と出力（例：完了トークンや生成された画像）に基づいて定義されます。

これらのレートは、管理ダッシュボードの **AI Config > Model Rates** で設定できます。

![このスクリーンショットは、AIGNE HubのAI Configセクション内にある「モデルレート」設定ページを示しており、ユーザーがAIモデルの価格をどのように管理するかの概要を提供します。ChatGPTやClaudeなどのさまざまなAIモデル、そのプロバイダー、コンテンツタイプ（画像、テキスト）、および関連する入力・出力の価格レートを一覧表示する詳細なテーブルが示されています。このインターフェースでは、新しいモデルレートの編集、削除、追加が可能で、AIサービスのコストに対する包括的な管理制御を提供します。](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### モデルレートの追加

新しいレートを追加するには、「モデルレートの追加」ボタンをクリックし、必要な詳細情報を入力します。複数のプロバイダーにまたがる特定のモデルに対して、レートを同時に作成できます。

![このスクリーンショットは、「AIGNE / Hub」プラットフォームのユーザーインターフェースを描写しており、特にAIモデルのレート設定に焦点を当てています。右側には目立つ「モデルレートの追加」モーダルウィンドウが開いており、モデル名、レートタイプ、プロバイダー、モデルコスト、AIGNE Hubのクレジットレート設定、説明、および詳細オプションの入力フィールドが表示されています。背景には、「設定」ページの「モデルレート」セクションの下に、ChatGPT、Claude、Geminiなどの既存のAIモデルのリストと、そのプロバイダーおよびタイプが表示されています。](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

モデルレートを定義するには、以下のパラメータが必要です。

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="プロバイダーによって認識されるモデルの正確な名前（例：gpt-4o、claude-3-opus-20240229）。"></x-field>
  <x-field data-name="modelDisplay" data-type="string" data-required="false" data-desc="ユーザーインターフェースに表示される、モデルの分かりやすい名前。空のままにすると、モデルIDから整形された名前が生成されます。"></x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>AIタスクのタイプ。これにより、どのレートが適用されるかが決まります。指定可能な値は `chatCompletion`、`imageGeneration`、または `embedding` です。</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true" data-desc="このレートが適用されるプロバイダーIDの配列。これにより、複数のプラットフォームで利用可能な単一のモデルがレートを共有できます。"></x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>入力単位ごとに請求されるクレジット数（例：プロンプトトークン1,000ごと）。`imageGeneration` の場合、これは通常 `0` です。</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>出力単位ごとに請求されるクレジット数（例：完了トークン1,000ごと、または生成された画像1枚ごと）。</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>AIプロバイダーからの実際のコストで、通常は100万トークンあたりのUSDで表されます。これは自動レート計算に使用され、ユーザーに直接請求されるものではありません。</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="プロバイダーの入力単位あたりのコスト。"></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="プロバイダーの出力単位あたりのコスト。"></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false" data-desc="モデルの能力に関する追加のメタデータ。">
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="モデルが単一のコンテキストで処理できる最大トークン数。"></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="モデルがサポートする特別な機能のリスト（例：`tools`、`thinking`、`vision`）。"></x-field>
    <x-field data-name="imageGeneration" data-type="object" data-required="false" data-desc="画像生成モデルに関する詳細。">
      <x-field data-name="max" data-type="number" data-required="false" data-desc="リクエストあたりの最大画像数。"></x-field>
      <x-field data-name="quality" data-type="array" data-required="false" data-desc="サポートされている画質オプション（例：['standard', 'hd']）。"></x-field>
      <x-field data-name="size" data-type="array" data-required="false" data-desc="サポートされている画像サイズ（例：['1024x1024', '1792x1024']）。"></x-field>
      <x-field data-name="style" data-type="array" data-required="false" data-desc="サポートされている画像スタイル（例：['vivid', 'natural']）。"></x-field>
    </x-field>
  </x-field>
</x-field-group>

## レートの一括更新

レート管理を簡素化するため、AIGNE Hubは、基礎となるコストと希望する利益率に基づいてすべてのモデルレートを一括更新するメカニズムを提供します。これは、プロバイダーが価格を変更した場合や、クレジットの価格体系を調整したい場合に特に便利です。

この機能は、各モデルに定義された `unitCosts` を使用し、簡単な式を適用して新しい `inputRate` と `outputRate` を計算します。

```
レート = (ユニットコスト * (1 + 利益率 / 100)) / クレジット価格
```

ここで：
*   `UnitCost`: プロバイダーからの生のコスト（例：100万トークンあたりのUSD）。
*   `ProfitMargin`: あなたが定義するパーセンテージ。
*   `CreditPrice`: ユーザーに1クレジットを販売する価格。

この計算は、`unitCosts` が定義されているすべてのモデルの入力レートと出力レートの両方に対して実行されます。

## ユーザークレジットの管理

課金が有効になると、すべてのユーザーはクレジット残高を持ちます。AIGNE Hubは、これらの残高を管理するために決済コンポーネントと統合されています。

### 新規ユーザーへのクレジット付与

AIGNE Hubを設定して、新規ユーザーに初期残高を自動的に付与することができます。これにより、試用と導入が促進されます。以下の環境変数がこの機能を制御します。

*   `NEW_USER_CREDIT_GRANT_ENABLED`: 付与を有効にするには `true` に設定します。
*   `NEW_USER_CREDIT_GRANT_AMOUNT`: 各新規ユーザーに付与するクレジット数。
*   `CREDIT_EXPIRATION_DAYS`: プロモーションクレジットが失効するまでの日数。有効期限をなくすには `0` に設定します。

### クレジットの購入

ユーザーはクレジットを購入して残高を追加できます。システムは、ユーザーをチェックアウトページに誘導する支払いリンクで設定できます。デフォルトでは、AIGNE Hubは統合されたPaymentKit blockletを通じて支払いリンクを作成・管理しようとしますが、`CREDIT_PAYMENT_LINK` 環境変数を介してカスタムURLを指定することもできます。

## 使用状況の追跡と計測

すべてのAPI呼び出しにおいて、AIGNE Hubは正確なクレジット消費とレポートを保証するための一連のステップを実行します。このプロセスは回復力があり効率的に設計されており、少額の課金をバッチ処理してオーバーヘッドを削減します。

ワークフローは以下の通りです。

1.  **ユーザー残高の確認**: ユーザーが十分なクレジット残高を持っているかを確認します。残高がゼロ以下の場合は、リクエストは `402 Payment Required` エラーで拒否されます。
2.  **コストの計算**: AIプロバイダーがリクエストを正常に処理した後、AIGNE Hubはプロンプトと完了トークン（または画像数）に設定された `inputRate` と `outputRate` を乗じてクレジットでのコストを計算します。
3.  **使用状況の記録**: 使用されたトークン、消費されたクレジット、関連するユーザーとモデルを詳述する使用記録がデータベースに作成されます。
4.  **決済システムへの報告**: 消費されたクレジットはメーターイベントとして決済システムに報告され、その後ユーザーの残高から金額が差し引かれます。この報告は、複数の小さなリクエストを一つの更新にまとめるために調整（スロットリング）され、パフォーマンスを最適化します。

## まとめ

クレジットベースの課金システムは、AIGNE Hubを包括的なAIリソース管理プラットフォームへと変えます。これにより、オペレーターは複雑なプロバイダーの価格設定を抽象化し、安定した内部エコノミーを構築し、明確な使用量ベースの指標に基づいてユーザーアクセスを管理するためのツールを手に入れることができます。モデルレートとユーザークレジットポリシーを慎重に設定することで、AIゲートウェイの持続可能で制御された運用を保証できます。