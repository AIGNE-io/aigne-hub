# Embeddings

このドキュメントでは、AIGNE Hub Embeddings API エンドポイントの詳細な仕様を説明します。このガイドに従うことで、テキストを数値ベクトル表現に変換する方法を学びます。これは、セマンティック検索、テキストクラスタリング、類似性分析などのタスクの基礎となるステップです。

## エンベディングの作成

指定されたテキスト入力のベクトル表現を生成します。これは、テキストの数値表現を必要とする機械学習アプリケーションに役立ちます。

**POST** `/api/embeddings`

### リクエストボディ

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>エンベディングの生成に使用するモデルの ID。モデルはエンベディングタスクと互換性がある必要があります。</x-field-desc>
  </x-field>
  <x-field data-name="input" data-type="string or array" data-required="true">
    <x-field-desc markdown>エンベディングする入力テキストまたはトークン。単一の文字列、文字列の配列、整数の配列（トークン）、または整数配列の配列（バッチ処理されたトークン）を指定できます。</x-field-desc>
  </x-field>
</x-field-group>

### リクエスト例

以下は、cURL を使用して embeddings エンドポイントを呼び出す例です。

```bash エンベディングリクエストの作成 icon=lucide:terminal
curl https://your-aigne-hub-instance.com/api/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "AIGNE Hub is a unified AI gateway."
  }'
```

### レスポンスボディ

API は、エンベディングデータのリストを含むオブジェクトを返します。

<x-field-group>
  <x-field data-name="data" data-type="array" data-required="true">
    <x-field-desc markdown>エンベディングオブジェクトの配列。各オブジェクトは入力アイテムに対応します。</x-field-desc>
    <x-field data-name="embedding" data-type="array" data-required="true">
      <x-field-desc markdown>入力テキストのベクトル表現。浮動小数点数の配列として返されます。</x-field-desc>
    </x-field>
    <x-field data-name="index" data-type="number" data-required="true">
      <x-field-desc markdown>リスト内のエンベディングのインデックス。入力アイテムの順序に対応します。</x-field-desc>
    </x-field>
    <x-field data-name="object" data-type="string" data-required="true">
      <x-field-desc markdown>オブジェクトのタイプ。常に `embedding` です。</x-field-desc>
    </x-field>
  </x-field>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>エンベディングの生成に使用されたモデル。</x-field-desc>
  </x-field>
  <x-field data-name="object" data-type="string" data-required="true">
    <x-field-desc markdown>トップレベルオブジェクトのタイプ。常に `list` です。</x-field-desc>
  </x-field>
  <x-field data-name="usage" data-type="object" data-required="true">
    <x-field-desc markdown>リクエストのトークン使用量の詳細を示すオブジェクト。</x-field-desc>
    <x-field data-name="prompt_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>入力プロンプトのトークン数。</x-field-desc>
    </x-field>
    <x-field data-name="total_tokens" data-type="number" data-required="true">
      <x-field-desc markdown>リクエストによって消費された合計トークン数。</x-field-desc>
    </x-field>
  </x-field>
</x-field-group>

### レスポンス例

```json レスポンス例
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        -0.006929283495992422,
        -0.005336422007530928,
        ...
        -4.547132266452536e-05
      ],
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## まとめ

Embeddings API は、テキストを高次元ベクトルに変換する簡単な方法を提供し、幅広い自然言語処理アプリケーションを可能にします。より複雑な対話型 AI や生成 AI を構築する場合は、[Chat Completions API](./api-reference-chat-completions.md) の調査も検討してください。