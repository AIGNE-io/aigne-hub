# API 參考

本文件提供了 AIGNE Hub RESTful API 的技術規格。遵循本指南，您將了解如何進行身份驗證並與聊天完成、圖片生成和嵌入等核心端點進行互動，從而實現與您的應用程式的穩健後端整合。

AIGNE Hub API 為各種底層 AI 模型提供了一個統一的介面，抽象化了各個提供商 API 的複雜性。所有請求都使用 API 金鑰進行身份驗證。

下圖說明了應用程式、AIGNE Hub API 和底層 AI 模型之間的互動。

```d2
direction: down

Your-Application: {
  label: "您的應用程式"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub API"
  shape: rectangle
  grid-columns: 2

  Chat-Completions: {
    label: "聊天完成"
  }

  Image-Generation: {
    label: "圖片生成"
  }

  Embeddings: {
    label: "嵌入"
  }

  Audio: {
    label: "音訊服務"
  }
}

AI-Models: {
  label: "底層 AI 模型"
  shape: rectangle

  OpenAI: {
    label: "OpenAI"
  }

  Anthropic: {
    label: "Anthropic"
  }

  Mistral: {
    label: "Mistral"
  }

  Others: {
    label: "..."
  }
}

Your-Application -> AIGNE-Hub: "帶金鑰的 API 請求"
AIGNE-Hub.Chat-Completions -> AI-Models.OpenAI
AIGNE-Hub.Chat-Completions -> AI-Models.Anthropic
AIGNE-Hub.Image-Generation -> AI-Models.OpenAI
AIGNE-Hub.Embeddings -> AI-Models.Mistral
AIGNE-Hub.Audio -> AI-Models.Others
AI-Models -> AIGNE-Hub: "模型回應"
AIGNE-Hub -> Your-Application: "統一的 API 回應"
```

關於各端點的詳細規格，包括請求和回應的結構，請參閱具體的子章節：

<x-cards data-columns="3">
  <x-card data-title="聊天完成" data-icon="lucide:message-square-text" data-href="/api-reference/chat-completions">
    聊天完成端點的詳細規格，包括請求/回應結構和串流支援。
  </x-card>
  <x-card data-title="圖片生成" data-icon="lucide:image" data-href="/api-reference/image-generation">
    圖片生成端點的參考資料，涵蓋支援的模型以及尺寸和品質的參數。
  </x-card>
  <x-card data-title="嵌入" data-icon="lucide:codesandbox" data-href="/api-reference/embeddings">
    用於建立文本向量表示的文件，以應用於語意搜尋和其他機器學習任務。
  </x-card>
</x-cards>

<x-cards>
  <x-card data-title="API 身份驗證" data-icon="lucide:key-round" data-href="/api-reference/authentication">
    說明如何使用 OAuth 和 API 金鑰安全地驗證對 AIGNE Hub API 的請求。
  </x-card>
</x-cards>

## 端點

下表總結了可用的 API 端點。

| Method | Endpoint | Description |
| :----- | :-------------------------- | :------------------------------------------------- |
| `POST` | `/chat/completions` | 為給定的聊天對話生成回應。|
| `POST` | `/embeddings` | 為給定的輸入文本生成向量嵌入。|
| `POST` | `/image/generations` | 根據文本提示建立圖片。 |
| `POST` | `/audio/transcriptions` | 將音訊轉錄為輸入語言的文字。 |
| `POST` | `/audio/speech` | 從輸入文本生成音訊。 |
| `GET` | `/status` | 檢查服務和模型的可用性。 |

## 摘要

本節概述了 AIGNE Hub API，涵蓋了身份驗證和可用端點的摘要。如需實際整合，請繼續查閱各端點的詳細文件。

- **用於建構對話式 AI：** 請參閱 [聊天完成 API](./api-reference-chat-completions.md)。
- **用於生成圖片：** 請探索 [圖片生成 API](./api-reference-image-generation.md)。
- **用於文本分析和搜尋：** 請使用 [嵌入 API](./api-reference-embeddings.md)。