# API Reference

This document provides technical specifications for the AIGNE Hub RESTful API. By following this guide, you will understand how to authenticate and interact with the core endpoints for chat completions, image generation, and embeddings, enabling robust backend integrations with your applications.

The AIGNE Hub API provides a unified interface to various underlying AI models, abstracting the complexity of individual provider APIs. All requests are authenticated using API keys.

The following diagram illustrates the interaction between an application, the AIGNE Hub API, and the underlying AI models.

```d2
direction: down

Your-Application: {
  label: "Your Application"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub API"
  shape: rectangle
  grid-columns: 2

  Chat-Completions: {
    label: "Chat Completions"
  }

  Image-Generation: {
    label: "Image Generation"
  }

  Embeddings: {
    label: "Embeddings"
  }

  Audio: {
    label: "Audio Services"
  }
}

AI-Models: {
  label: "Underlying AI Models"
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

Your-Application -> AIGNE-Hub: "API Request with Key"
AIGNE-Hub.Chat-Completions -> AI-Models.OpenAI
AIGNE-Hub.Chat-Completions -> AI-Models.Anthropic
AIGNE-Hub.Image-Generation -> AI-Models.OpenAI
AIGNE-Hub.Embeddings -> AI-Models.Mistral
AIGNE-Hub.Audio -> AI-Models.Others
AI-Models -> AIGNE-Hub: "Model Response"
AIGNE-Hub -> Your-Application: "Unified API Response"
```

For detailed specifications on each endpoint, including request and response schemas, please refer to the specific sub-sections:

<x-cards data-columns="3">
  <x-card data-title="Chat Completions" data-icon="lucide:message-square-text" data-href="/api-reference/chat-completions">
    Detailed specification for the chat completions endpoint, including request/response schemas and streaming support.
  </x-card>
  <x-card data-title="Image Generation" data-icon="lucide:image" data-href="/api-reference/image-generation">
    Reference for the image generation endpoint, covering supported models and parameters for size and quality.
  </x-card>
  <x-card data-title="Embeddings" data-icon="lucide:codesandbox" data-href="/api-reference/embeddings">
    Documentation for creating vector representations of text for use in semantic search and other ML tasks.
  </x-card>
</x-cards>

<x-cards>
  <x-card data-title="API Authentication" data-icon="lucide:key-round" data-href="/api-reference/authentication">
    Explains how to securely authenticate requests to the AIGNE Hub API using OAuth and API keys.
  </x-card>
</x-cards>

## Endpoints

The following table provides a summary of the available API endpoints.

| Method | Endpoint                    | Description                                        |
| :----- | :-------------------------- | :------------------------------------------------- |
| `POST` | `/chat/completions`         | Generates a response for a given chat conversation.|
| `POST` | `/embeddings`               | Generates vector embeddings for a given input text.|
| `POST` | `/image/generations`        | Creates an image based on a text prompt.           |
| `POST` | `/audio/transcriptions`     | Transcribes audio into the input language.         |
| `POST` | `/audio/speech`             | Generates audio from the input text.               |
| `GET`  | `/status`                   | Checks the availability of the service and models. |

## Summary

This section provided an overview of the AIGNE Hub API, covering authentication and a summary of available endpoints. For practical integration, proceed to the detailed documentation for each endpoint.

- **For building conversational AI:** See the [Chat Completions API](./api-reference-chat-completions.md).
- **For generating images:** Explore the [Image Generation API](./api-reference-image-generation.md).
- **For text analysis and search:** Use the [Embeddings API](./api-reference-embeddings.md).
