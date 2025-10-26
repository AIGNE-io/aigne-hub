# Overview

AIGNE Hub is a unified AI gateway designed to manage and streamline connections to a diverse range of Large Language Model (LLM) and AI-Generated Content (AIGC) providers. It functions as a central component within the AIGNE ecosystem, abstracting the complexity of handling multiple API keys, tracking usage, and managing billing across various AI services.

The system is engineered to be self-hosted, providing organizations with complete control over their data and AI operations. By routing all AI-related requests through a single, secure endpoint, AIGNE Hub ensures consistent security, monitoring, and governance.

```d2
direction: down

User-Application: {
  label: "User / Application"
  shape: c4-person
}

Self-Hosted-Infrastructure: {
  label: "Self-Hosted Infrastructure"
  style: {
    stroke-dash: 4
  }

  AIGNE-Hub: {
    label: "AIGNE Hub\n(Unified AI Gateway)"
    shape: rectangle

    Unified-API-Endpoint: {
      label: "Unified API Endpoint\n(OpenAI Compatible)"
    }

    Central-Management: {
      label: "Central Management & Features"
      shape: rectangle
      grid-columns: 2

      Secure-Credential-Storage: { label: "Secure Credential\nStorage" }
      Usage-Analytics: { label: "Usage Analytics" }
      Flexible-Billing-System: { label: "Flexible Billing\nSystem" }
    }
    
    Unified-API-Endpoint -> Central-Management
  }
}

External-Services: {
  grid-columns: 2
  grid-gap: 200

  AI-Providers: {
    label: "AI Providers"
    shape: rectangle
    grid-columns: 2

    OpenAI: {}
    Anthropic: {}
    Google-Gemini: { label: "Google Gemini"}
    Amazon-Bedrock: { label: "Amazon Bedrock"}
    Ollama: {}
    "Others...": {}
  }

  Payment-Kit: {
    label: "Payment Kit\n(For Service Provider Mode)"
    shape: rectangle
  }
}

User-Application -> Self-Hosted-Infrastructure.AIGNE-Hub.Unified-API-Endpoint: "1. AI Request"
Self-Hosted-Infrastructure.AIGNE-Hub -> External-Services.AI-Providers: "2. Routes to specific provider"
Self-Hosted-Infrastructure.AIGNE-Hub.Central-Management.Flexible-Billing-System <-> External-Services.Payment-Kit: "Manages credits & billing"
```

## Key Features

AIGNE Hub offers a comprehensive set of features designed for both internal enterprise use and for service providers looking to offer AI capabilities to their customers.

<x-cards data-columns="3">
  <x-card data-title="Unified API Access" data-icon="lucide:plug-zap">
    Connect to over 8 leading AI providers, including OpenAI, Anthropic, and Google Gemini, through a single, consistent, OpenAI-compatible API endpoint.
  </x-card>
  <x-card data-title="Centralized Management" data-icon="lucide:database">
    A single dashboard provides full visibility into usage, costs, and performance across all connected models and users.
  </x-card>
  <x-card data-title="Secure Credential Storage" data-icon="lucide:shield-check">
    All provider API keys and credentials are AES-encrypted at rest, ensuring sensitive information is protected.
  </x-card>
  <x-card data-title="Usage Analytics" data-icon="lucide:pie-chart">
    Track token consumption, analyze costs, and monitor performance metrics to optimize AI spending and resource allocation.
  </x-card>
  <x-card data-title="Flexible Billing System" data-icon="lucide:credit-card">
    Operate in a "bring-your-own-key" model for internal use or enable the optional credit-based billing system to monetize AI services.
  </x-card>
  <x-card data-title="Self-Hosted Control" data-icon="lucide:server">
    Deploy AIGNE Hub within your own infrastructure for maximum data privacy, security, and operational control.
  </x-card>
</x-cards>

![AIGNE Hub Dashboard](../../../blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## Supported AI Providers

AIGNE Hub provides built-in support for a wide array of AI providers, with new integrations being added continuously. The platform automatically discovers and supports new providers as they become available.

| Provider | Supported Models/Services |
| :--- | :--- |
| **OpenAI** | GPT models, DALL-E, Embeddings |
| **Anthropic** | Claude models |
| **Amazon Bedrock** | AWS hosted models |
| **Google Gemini** | Gemini Pro, Vision |
| **DeepSeek** | Advanced reasoning models |
| **Ollama** | Local model deployment |
| **OpenRouter** | Access to multiple providers |
| **xAI** | Grok models |
| **Doubao** | Doubao AI models |
| **Poe** | Poe AI platform |

![AI Provider Configuration](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

## Deployment Scenarios

AIGNE Hub is designed to accommodate two primary operational models, catering to different organizational needs.

### Enterprise Self-Hosting

This model is ideal for internal teams and organizations that require strict data control and privacy.

- **Infrastructure**: Deployed entirely within the organization's private infrastructure.
- **Billing**: No external billing is required; the organization pays AI providers directly.
- **Data Security**: All data and API credentials remain within the corporate security perimeter.
- **Use Case**: Suitable for corporate AI initiatives, internal development teams, and research projects.

### Service Provider Mode

This model allows an organization to offer AI services to external customers by turning AIGNE Hub into a multi-tenant, monetized platform.

- **Billing**: Integrates with Payment Kit to enable a credit-based billing system.
- **Pricing**: Operators can set custom pricing rates for each model, allowing for profit margins.
- **User Onboarding**: Supports automatic user onboarding with configurable starter credits.
- **Use Case**: Ideal for SaaS platforms, AI service providers, and agencies building AI-powered solutions for clients.

## Summary

AIGNE Hub serves as the central gateway for all generative AI interactions within the AIGNE ecosystem. It simplifies the operational complexities of using multiple AI providers, enhances security through centralized credential management, and provides robust tools for monitoring and billing. By offering flexible deployment models, it supports a wide range of use cases from internal development to public-facing AI services.

For a detailed understanding of the system's structure, please proceed to the [Architecture](./architecture.md) section.