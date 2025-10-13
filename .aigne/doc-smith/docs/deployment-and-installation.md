![AIGNE Hub Logo](../../../blocklets/core/screenshots/logo.png)

# Overview

AIGNE Hub is a unified AI gateway designed to manage and streamline connections to a wide array of Large Language Model (LLM) and AIGC providers. It functions as a central proxy, abstracting the complexity of handling disparate API keys, tracking usage, and managing billing across multiple AI services. Engineered as a [Blocklet](https://blocklet.io) within the AIGNE framework, it serves as the operational backbone for the entire AIGNE ecosystem, including the AIGNE framework, AIGNE Studio, and the AIGNE CLI.

The primary design rationale behind AIGNE Hub is to provide a single, consistent interface for AI operations, thereby reducing operational overhead and enhancing security. By centralizing API key management and routing requests through a single point, it enables robust security, detailed analytics, and flexible billing models suitable for both internal enterprise use and public-facing service offerings.

### Key Architectural Concepts

- **🏠 Self-Hosting First**: The system is designed for self-hosting, empowering organizations to deploy their own instances for absolute control over data, security, and infrastructure. This is critical for enterprises with strict data privacy and compliance requirements.
- **🔌 Pluggable Provider Model**: AIGNE Hub connects to over eight AI providers through a unified interface. This modular architecture allows for the easy addition of new providers without altering the core application, preventing vendor lock-in and offering maximum flexibility.
- **🔐 Unified Security**: All provider API keys are encrypted and stored centrally. Access is governed by fine-grained controls, ensuring that keys are not exposed in client-side applications or scattered across various services.
- **📊 Centralized Analytics and Billing**: By routing all AI requests through the Hub, the system can capture detailed usage data. This enables comprehensive cost analysis, resource tracking, and a flexible credit-based billing system for multi-tenant deployments.

## Deployment Scenarios

AIGNE Hub is architected to support two primary deployment models, catering to different operational needs.

### 🏢 Enterprise Self-Hosting

This model is optimized for internal teams and organizations that require maximum control and data privacy.

- **Infrastructure**: Deployed entirely within an organization's own infrastructure (on-premises or private cloud).
- **Billing**: No intermediary billing. The organization pays AI providers directly, and the Hub is used for internal cost tracking and allocation.
- **Data Security**: All data, including prompts, responses, and API keys, remains within the organization's security perimeter.
- **Use Case**: Ideal for corporate AI initiatives, internal development platforms, and teams that need to provide centralized, secure access to AI models without exposing credentials.

### 🚀 Service Provider Mode

This model transforms AIGNE Hub into a multi-tenant, customer-facing AI gateway service.

- **Billing**: Integrates with Payment Kit to enable a credit-based billing system. Service providers can set custom pricing, apply profit margins, and automate user onboarding with starter credits.
- **Multi-tenancy**: Manages multiple users or organizations with isolated usage tracking and billing.
- **Automation**: Features automatic user onboarding and comprehensive management tools for billing and usage.
- **Use Case**: Perfect for AI service providers, SaaS platforms integrating AI features, and businesses looking to resell access to a variety of AI models through a single platform.

## Supported AI Providers

AIGNE Hub provides a unified API for a diverse range of leading AI models and providers:

- **OpenAI**: GPT series models, DALL-E for image generation, and Embeddings.
- **Anthropic**: Claude series models.
- **Amazon Bedrock**: Access to various models hosted on AWS.
- **Google Gemini**: Gemini Pro and Vision models.
- **DeepSeek**: Models focused on advanced reasoning.
- **Ollama**: Support for local model deployment and management.
- **OpenRouter**: A meta-provider offering access to a wide array of models.
- **xAI**: Grok models.
- **Doubao**: Doubao AI models.
- **Poe**: Poe AI platform.