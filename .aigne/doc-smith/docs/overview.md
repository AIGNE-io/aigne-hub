# Overview

AIGNE Hub is the central AI gateway of the AIGNE ecosystem, built on the robust AIGNE Framework and deployed as a Blocklet on the ArcBlock platform. It serves as a unified entry point for accessing over 10 leading AI providers, eliminating the complexity of managing multiple API keys, fragmented billing systems, and inconsistent usage tracking across different services.

By providing a single, secure, and self-hosted interface, AIGNE Hub is designed for enterprises seeking centralized AI governance, developers building multi-model applications, and service providers offering AI capabilities to their customers.

```d2
direction: down

Client-Apps: {
  label: "Client Apps\n• Web Apps\n• Mobile Apps\n• CLI Tools\n• APIs"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub\n• Load Balancer\n• Auth System\n• Usage Tracker\n• Billing"
  shape: rectangle
}

AI-Providers: {
  label: "AI Providers\n• OpenAI\n• Anthropic\n• Google\n• Amazon"
  shape: rectangle
}

Client-Apps -> AIGNE-Hub
AIGNE-Hub -> AI-Providers
```

## Core Purpose

The primary goal of AIGNE Hub is to streamline the integration and management of large language models (LLMs). It provides a unified API, a centralized security model, and an intuitive dashboard to give operators full visibility and control over AI usage, costs, and performance.

As a core component of the AIGNE ecosystem, the hub works seamlessly with:
- **AIGNE Framework**: Provides foundational AI abstractions and model adapters for application development.
- **AIGNE Observability**: Monitors performance, usage, and system health for operational excellence.
- **ArcBlock Blocklet Platform**: Enables secure, scalable deployment and management on your own infrastructure.

## Key Features

<x-cards data-columns="2">
  <x-card data-title="Self-Hosted & Secure" data-icon="lucide:shield-check">
    Deploy on your own infrastructure for complete data control. All API credentials are AES-encrypted at rest, with role-based access controls and comprehensive audit logging.
  </x-card>
  <x-card data-title="Multi-Provider Integration" data-icon="lucide:plug-zap">
    Connect to 10+ AI providers through a single endpoint. The system supports weight-based load balancing, automatic failover, and real-time model health checks.
  </x-card>
  <x-card data-title="Advanced Analytics & Billing" data-icon="lucide:bar-chart-3">
    Gain full visibility with detailed usage tracking and cost analysis. An optional credit-based billing system allows for monetization with custom pricing rules.
  </x-card>
  <x-card data-title="Developer-Friendly Experience" data-icon="lucide:code-2">
    Utilize a built-in AI Playground for testing, integrate with a comprehensive RESTful API, and leverage seamless AIGNE Framework integration for rapid development.
  </x-card>
</x-cards>

## Supported Providers

AIGNE Hub connects to a growing list of the industry's leading AI providers through a unified interface.

| Provider | Models Supported | Features |
|----------|------------------|----------|
| **OpenAI** | GPT-3.5, GPT-4, GPT-4o, DALL-E | Chat, Embeddings, Image Generation |
| **Anthropic** | Claude 3 (Haiku, Sonnet, Opus) | Advanced reasoning, Long context |
| **Google Gemini** | Gemini Pro, Gemini Vision | Multimodal capabilities |
| **Amazon Bedrock** | Claude, Titan, Jurassic | Enterprise AWS integration |
| **DeepSeek** | DeepSeek-V2, DeepSeek-Coder | Advanced reasoning models |
| **xAI** | Grok-1, Grok-2 | Real-time information access |
| **Doubao** | Doubao models | Image generation, Chat |
| **OpenRouter** | 100+ models | Access to multiple providers |
| **Ollama** | Llama, Mistral, CodeLlama | Local model deployment |
| **Poe** | Claude, GPT, Gemini | Unified model access |

> The list of supported providers is actively expanding. New providers are auto-discovered and available for connection as soon as they're supported.

This overview provides a high-level understanding of AIGNE Hub's purpose and capabilities. For a deeper technical dive into its internal workings, refer to the [Architecture](./architecture.md) section.