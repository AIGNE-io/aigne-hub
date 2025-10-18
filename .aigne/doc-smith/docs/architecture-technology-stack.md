# Introduction

![logo.png](../../../blocklets/core/screenshots/logo.png)

AIGNE Hub is a unified AI gateway designed to streamline the management of connections to multiple Large Language Model (LLM) and AIGC providers. It serves as a centralized control plane, abstracting the complexity of handling disparate API keys, tracking usage, and managing billing across various AI services. Built as a [Blocklet](https://blocklet.io) on the AIGNE framework, it provides a robust, self-hostable solution for both internal enterprise use and public-facing service offerings.

From an operational perspective, AIGNE Hub provides a single, consistent endpoint for all AI-driven applications, simplifying network configuration, security policies, and monitoring.

## System Architecture

The system is engineered for reliability and scalability, leveraging a modern, type-safe technology stack.

-   **Backend**: Built with **Node.js** and **TypeScript**, using the **Express** framework. This provides a high-performance, non-blocking I/O backend capable of handling numerous concurrent connections. The entry point `blocklets/core/api/src/index.ts` reveals a standard setup including CORS, cookie parsing, and robust error handling for service stability.
-   **Database**: Utilizes **SQLite** via the **Sequelize ORM** for local data persistence, including user data, API keys, and usage logs. This choice offers a lightweight, file-based database solution that simplifies deployment and maintenance.
-   **Frontend**: A modern user interface built with **React 19** for administrative tasks, monitoring, and model testing.
-   **Deployment**: Packaged as a **Blocklet**, AIGNE Hub is designed for cloud-native environments. This containerized approach ensures consistent behavior across different systems and simplifies deployment, scaling, and management on a Blocklet Server instance.

## Core Concepts

Understanding these core concepts is essential for deploying and managing AIGNE Hub effectively.

### Unified Gateway

The fundamental design principle of AIGNE Hub is to act as a single proxy for multiple downstream AI providers. An application sends a request to the Hub specifying the desired model (e.g., `openai/gpt-4o`). The Hub authenticates the request, validates permissions and credits, and then forwards it to the appropriate external provider using the securely stored API key. This centralizes all AI traffic, making it easier to monitor, log, and control.

### Deployment Scenarios

AIGNE Hub supports two primary operational modes, catering to different infrastructure and business requirements.

#### Enterprise Self-Hosting

This is the ideal scenario for organizations that require maximum control over data and infrastructure.

-   **Data Privacy**: All requests and data are processed within your own security perimeter before being routed to external AI providers.
-   **Direct Billing**: You maintain direct billing relationships with AI providers (e.g., OpenAI, Anthropic). AIGNE Hub tracks usage for internal cost allocation but does not handle external payments.
-   **Simplified Management**: Development teams can connect to a single internal endpoint without needing to manage a diverse set of API keys and credentials.

#### Service Provider Mode

This mode transforms AIGNE Hub into a multi-tenant, customer-facing AI service platform.

-   **Credit-Based Billing**: Integrates with Payment Kit to enable a pre-paid credit system. Users purchase credits, which are then consumed based on their AI model usage.
-   **Custom Pricing**: Administrators can set custom pricing rates and profit margins for each model, creating a viable business model.
-   **Automated Onboarding**: The system supports automatic user registration and can be configured to grant starter credits to new users.

## Key Features for Operations

AIGNE Hub is equipped with a suite of features designed for robust operational management and monitoring.

| Feature | Description |
| :--- | :--- |
| **Multi-Provider Management** | Central interface to configure and manage API keys for 8+ AI providers, including OpenAI, Anthropic, Google Gemini, and local models via Ollama. |
| **Unified Security** | Encrypted storage for all provider API keys. Access is controlled through OAuth integration and fine-grained user permissions. |
| **Usage Analytics** | Comprehensive dashboards for tracking token usage, request volumes, and costs across all users, models, and providers. |
| **Flexible Billing** | In Service Provider mode, offers a complete credit-based billing system with detailed usage tracking and cost analysis tools. |
| **RESTful APIs** | Provides a standardized set of HTTP endpoints for seamless integration with any application or service on your network. |
| **Built-in Playground** | An integrated UI for testing and interacting with configured models in real-time, aiding in troubleshooting and validation. |