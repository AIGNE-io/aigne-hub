
# Overview

Struggling to manage a growing collection of API keys, billing systems, and integrations for different AI providers? This document provides a comprehensive introduction to AIGNE Hub, a unified AI gateway that simplifies this complexity. You will learn about its core capabilities, key benefits, and system architecture, establishing a clear understanding of its value for infrastructure management.

AIGNE Hub serves as a centralized gateway, enabling you to connect your applications to leading Large Language Models (LLMs) and AIGC services through a single, consistent API. It streamlines the management of API keys, usage tracking, and security, whether you're deploying it as an internal tool or as a monetized, multi-tenant service.

## Why AIGNE Hub?

Integrating multiple AI services into an organization's infrastructure introduces significant operational overhead. Teams often face a fragmented landscape of provider-specific APIs, disparate billing cycles, and inconsistent security models. This complexity slows down development, complicates cost management, and increases the security surface area.

The diagram below illustrates how AIGNE Hub sits between your applications and various AI providers to solve these challenges:

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Overview](assets/diagram/overview-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

AIGNE Hub is designed to solve these specific challenges by providing:

-   **A Single Point of Integration:** It offers a unified, OpenAI-compatible API endpoint for all connected providers. This eliminates the need for developers to learn and maintain multiple SDKs and integration patterns.
-   **Centralized Credential Management:** All upstream API keys are stored securely in one place with AES encryption, reducing the risk of key exposure across various applications and environments.
-   **Unified Usage and Cost Analytics:** Gain full visibility into consumption and spending across all models, users, and providers from a single dashboard. This simplifies budget tracking and resource allocation.
-   **Flexible Deployment Models:** AIGNE Hub can be deployed for purely internal use, where you bring your own keys, or as a public-facing service with a built-in, credit-based billing system.

## Core Capabilities

AIGNE Hub provides a robust set of features designed to streamline the entire lifecycle of AI service consumption and management.

<x-cards data-columns="3">
  <x-card data-title="Multi-Provider Management" data-icon="lucide:cloud">
    Connect to over 8 leading AI providers like OpenAI, Anthropic, and Google Gemini through a single interface.
  </x-card>
  <x-card data-title="Unified API Endpoints" data-icon="lucide:plug-zap">
    Interact with all models using OpenAI-compatible RESTful APIs for chat completions, image generation, and embeddings.
  </x-card>
  <x-card data-title="Usage & Cost Analytics" data-icon="lucide:line-chart">
    Monitor token usage, cost, and latency metrics across all users and providers with a comprehensive analytics dashboard.
  </x-card>
  <x-card data-title="Centralized Security" data-icon="lucide:shield-check">
    Benefit from encrypted API key storage, OAuth integration, role-based access control (RBAC), and detailed audit logs.
  </x-card>
  <x-card data-title="Flexible Billing System" data-icon="lucide:credit-card">
    Optionally enable a credit-based billing system powered by Payment Kit to monetize your service for external users.
  </x-card>
  <x-card data-title="Built-in Playground" data-icon="lucide:flask-conical">
    Test and experiment with any connected AI model in real-time directly from the AIGNE Hub user interface.
  </x-card>
</x-cards>

## Supported AI Providers

AIGNE Hub supports a growing list of major AI providers. The system is designed to be extensible, with new providers being added continuously.

| Provider | Supported Services |
| :--- | :--- |
| **OpenAI** | GPT models, DALL-E, Embeddings |
| **Anthropic** | Claude models |
| **Google Gemini** | Gemini Pro, Vision models |
| **Amazon Bedrock** | AWS-hosted foundation models |
| **DeepSeek** | Advanced reasoning models |
| **xAI** | Grok models |
| **OpenRouter** | Aggregator for multiple providers |
| **Ollama** | Local model deployment |
| **Doubao** | Doubao AI models |
| **Poe** | Poe AI platform |

## System Architecture

AIGNE Hub is engineered for reliability and performance, built as a [Blocklet](https://blocklet.io) on the AIGNE framework. This architecture ensures seamless integration within the AIGNE ecosystem and provides a robust foundation for cloud-native deployment and scaling.

The primary components of the stack include:

-   **Backend:** Built with Node.js and TypeScript, providing a strongly-typed and efficient server-side environment.
-   **Frontend:** A modern user interface constructed with React 19.
-   **Database:** Utilizes SQLite with the Sequelize ORM for local data storage, ensuring simple setup and reliable data management.
-   **Framework:** Leverages the latest version of the AIGNE Framework for core functionality and integration capabilities.

![AIGNE Hub Dashboard](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## Summary

This overview has introduced AIGNE Hub as a unified AI gateway designed to simplify infrastructure management for multi-provider AI services. We have outlined the problems it solves, its core features, and its technical architecture.

For the next steps, you can proceed to the following sections for more detailed information:

<x-cards data-columns="2">
  <x-card data-title="Getting Started" data-href="/getting-started" data-icon="lucide:rocket">
    Follow a step-by-step guide to deploy and configure your AIGNE Hub instance in under 30 minutes.
  </x-card>
  <x-card data-title="Deployment Scenarios" data-href="/deployment-scenarios" data-icon="lucide:milestone">
    Explore the architectural guidance for deploying AIGNE Hub for internal enterprise use or as a monetized service.
  </x-card>
</x-cards>
