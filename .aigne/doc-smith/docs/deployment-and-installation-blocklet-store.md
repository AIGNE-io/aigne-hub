# Overview

AIGNE Hub serves as a unified AI gateway engineered to streamline the management of connections to a diverse array of Large Language Model (LLM) and AI Generated Content (AIGC) providers. It abstracts the complexities associated with handling disparate API keys, tracking usage metrics, and managing billing across multiple AI services. As a core component of the AIGNE ecosystem, it provides essential AI capabilities for applications built with the AIGNE framework, AIGNE Studio, and the AIGNE CLI.

The system is designed for robust, production-grade environments, focusing on centralized control, security, and operational transparency for infrastructure teams.

![logo.png](../../../blocklets/core/screenshots/logo.png)

### Core Architectural Benefits

AIGNE Hub is architected to provide significant operational advantages, particularly for teams managing AI infrastructure.

-   **Self-Hosting Capability**: Deploy AIGNE Hub within your own infrastructure for complete control over data, security, and compliance. This model eliminates reliance on third-party services for gateway functionality, ensuring all data remains within your security perimeter.
-   **Centralized Provider Management**: It offers a single interface to connect with and manage over eight AI providers, standardizing access and reducing the overhead of integrating with multiple APIs.
-   **Unified Security Model**: API keys are stored in an encrypted format, with fine-grained access controls to regulate usage. This centralizes security management and reduces the risk of key exposure.
-   **Comprehensive Usage Analytics**: The system provides detailed tracking of AI service consumption and in-depth cost analysis, enabling precise budget management and resource allocation.
-   **Flexible Billing Systems**: AIGNE Hub can be operated purely for internal use, billing directly to your corporate accounts with providers. Alternatively, it can be configured as a service provider, utilizing a built-in credit system to bill end-users or other business units.
-   **Seamless Ecosystem Integration**: Designed to work out-of-the-box with applications developed using the AIGNE framework, ensuring a low-friction adoption process.

### Supported AI Providers

AIGNE Hub provides a standardized interface for a wide range of AI models and services. This allows for flexibility in choosing the best model for a specific task without requiring separate integrations for each provider.

-   **OpenAI**: GPT models, DALL-E, Embeddings
-   **Anthropic**: Claude model family
-   **Amazon Bedrock**: Access to various models hosted on AWS
-   **Google Gemini**: Gemini Pro and Vision models
-   **DeepSeek**: Models focused on advanced reasoning
-   **Ollama**: Support for local model deployment and management
-   **OpenRouter**: A meta-provider offering access to a wide range of models
-   **xAI**: Grok models
-   **Doubao**: Doubao AI models
-   **Poe**: Poe AI platform

## Deployment Scenarios

AIGNE Hub supports two primary deployment models, catering to different operational needs. The choice of scenario determines how billing, user management, and data governance are handled.

### Enterprise Self-Hosting

This model is optimized for internal use within an organization, prioritizing data control, security, and simplified cost management.

-   **Infrastructure**: Deployed entirely within an organization's private infrastructure (e.g., VPC, on-premises data center). This ensures that no data leaves the security perimeter.
-   **Billing**: All AI provider costs are billed directly to the organization's accounts. AIGNE Hub tracks usage per user or team, facilitating internal cost allocation and showback/chargeback processes without handling actual financial transactions.
-   **Security**: This scenario provides maximum control over data privacy and compliance. It is the ideal choice for organizations with stringent regulatory requirements or those handling sensitive proprietary data.
-   **Use Case**: Suited for corporate R&D, internal development teams, and any scenario where employees need access to AI models without exposing the organization to the complexities of public-facing service management.

### Service Provider Mode

This model transforms AIGNE Hub into a multi-tenant, customer-facing service, enabling you to offer managed AI gateway access to external users.

-   **Infrastructure**: While it can still be self-hosted, the architecture is designed to handle multiple tenants (customers) with segregated billing and usage data.
-   **Billing**: This mode activates a credit-based billing system, which integrates with the Payment Kit. Administrators can set custom pricing for each AI model, establishing profit margins over the base provider costs. End-users purchase credits to consume AI services.
-   **Onboarding**: Features automated user onboarding, often including an initial grant of starter credits to encourage adoption.
-   **Use Case**: Ideal for SaaS companies, AI service providers, or businesses looking to monetize access to a curated set of AI models under their own brand.

## Technical Architecture

AIGNE Hub is constructed using a modern, robust technology stack designed for scalability, reliability, and maintainability.

-   **Backend**: Built with **Node.js** and **TypeScript**, providing a strongly-typed, high-performance foundation. It leverages the **AIGNE Framework** for seamless integration with the broader AIGNE ecosystem.
-   **Frontend**: The administrative and user-facing interfaces are developed with **React 19**, utilizing its latest features for a modern and responsive user experience.
-   **Database**: **SQLite** is used for local data storage, managed through the **Sequelize ORM**. This provides a lightweight yet powerful solution for storing configuration, user data, and usage analytics. For larger-scale deployments, the ORM allows for straightforward migration to other SQL databases like PostgreSQL.
-   **Deployment**: As a **Blocklet**, AIGNE Hub is designed for cloud-native deployment. It can be easily installed and scaled on a Blocklet Server, simplifying infrastructure management and maintenance operations.