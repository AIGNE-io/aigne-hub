# System Architecture

AIGNE Hub is engineered as a robust, scalable, and secure gateway to the world of generative AI. Built upon the AIGNE Blocklet framework, it provides a unified interface for a multitude of AI providers, while managing critical operational aspects such as billing, usage tracking, and security. This document details the architectural components and design principles of the AIGNE Hub system, with a focus on operational concerns for DevOps and SRE teams.

---

### Core Architectural Principles

- **Modularity:** The system is designed as a [Blocklet](https://blocklet.io), ensuring it can be deployed, managed, and scaled independently within a Blocklet Server environment. It integrates with other specialized blocklets, such as Payment Kit and Observability, to handle concerns outside its core domain.
- **Scalability:** The architecture supports both single-instance, self-hosted deployments for enterprises and multi-tenant service provider models, capable of handling numerous users and applications.
- **Unified Interface:** It abstracts the complexity of diverse AI provider APIs, presenting a single, consistent set of endpoints for developers and applications.

---

## Architectural Components

The AIGNE Hub architecture can be broken down into several key components that work in concert:

![AIGNE Hub System Architecture Diagram](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### 1. API Gateway & Routing

The heart of AIGNE Hub is its API Gateway, built using Node.js and Express. It is responsible for request ingestion, authentication, versioning, and routing to the appropriate internal services.

#### API Versioning

The gateway exposes two distinct API versions, reflecting the evolution of the platform and catering to different use cases:

-   **V1 API (`/api/v1`)**: This is the legacy API, primarily designed for server-to-server or component-to-component communication within the AIGNE ecosystem.
    -   **Authentication**: Relies on cryptographic signature verification (`ensureComponentCall`) to authorize requests from trusted blocklet components.
    -   **Billing Model**: Integrated with a **subscription-based** model via the Payment Kit. It checks for an active subscription for the calling application (`checkSubscription`). This model is ideal for internal enterprise deployments where usage is not metered per-call.

-   **V2 API (`/api/v2`)**: The current, user-centric API designed for both end-user applications and modern services.
    -   **Authentication**: Utilizes DID Connect for decentralized, wallet-based user authentication (`sessionMiddleware`). This provides a secure and user-managed identity layer.
    -   **Billing Model**: Employs a flexible **credit-based** system. Before processing a request, it verifies the user's credit balance (`checkUserCreditBalance`). This is the foundation of the Service Provider mode.
    -   **Endpoint Support**: Provides both OpenAI-compatible endpoints (e.g., `/v2/chat/completions`) for drop-in compatibility and AIGNE-native endpoints (e.g., `/v2/chat`) for enhanced features.

### 2. AI Provider Integration Layer

This layer is the orchestration engine that connects to various third-party AI models. It normalizes requests from the API gateway and translates them into the specific format required by the downstream AI provider (e.g., OpenAI, Anthropic, Google Gemini). It also normalizes the responses, providing a consistent output structure to the client regardless of the underlying model provider.

API keys and provider credentials are encrypted and stored securely, managed through the AIGNE Hub's administrative interface.

### 3. Billing & Usage Tracking

For SREs and operators, the billing and usage tracking system is a critical component for monitoring and financial management.

-   **Model Call Tracking**: Every incoming AI request initiates a record in the `ModelCall` database table with a `processing` status. This tracker, implemented as an Express middleware (`createModelCallMiddleware`), is the source of truth for all usage. It captures the user DID, application DID, requested model, and request timestamps.

-   **Usage Data Collection**: Upon successful completion of an AI call, the tracker is updated with detailed usage metrics, including:
    -   Prompt and completion token counts
    -   Number of generated images
    -   Model parameters (e.g., image size, quality)
    -   Calculated credit cost
    -   Call duration
    -   Trace ID for observability

-   **Resilience**: The system includes a cleanup mechanism (`cleanupStaleProcessingCalls`) to handle orphaned calls. If a request record remains in the `processing` state for an extended period (e.g., due to a server crash), it is automatically marked as `failed`, ensuring system stability and accurate accounting.

-   **Payment Kit Integration**: For credit-based billing, AIGNE Hub integrates deeply with the Payment Kit blocklet.
    -   When a model call completes, the calculated credit cost is reported to the Payment Kit as a "meter event" (`createMeterEvent`).
    -   The Payment Kit is responsible for debiting the user's credit balance, managing credit purchases, and handling all financial transactions. This separation of concerns ensures that AIGNE Hub focuses on AI orchestration while the Payment Kit handles the complexities of payments.

### 4. Security & Authentication

Security is managed at multiple levels, accommodating different types of clients.

-   **User Authentication (DID Connect)**: As detailed in `blocklets/core/api/src/libs/auth.ts`, end-user authentication for v2 APIs is handled by DID Connect. Users authenticate using their DID Wallet, providing a passwordless and highly secure session. Session tokens are managed by the `walletHandler`.

-   **Component Authentication**: For automated, inter-service communication (primarily v1), the system uses a challenge-response mechanism with public-key cryptography. The calling component signs the request, and AIGNE Hub verifies the signature (`verify(data, sig)`), ensuring the request originates from a trusted, registered component.

-   **Role-Based Access Control (RBAC)**: Administrative endpoints are protected by `ensureAdmin` middleware, which restricts access to users with `owner` or `admin` roles, preventing unauthorized configuration changes.

### 5. Data Storage

-   **Primary Database**: The `README.md` specifies SQLite with the Sequelize ORM for core application data, including provider configurations, usage rates, and model call logs. For enterprise deployments with high throughput, operators should consider migrating to a more robust database like PostgreSQL, which Sequelize supports.
-   **Authentication Storage**: DID Connect session data is stored in a separate NeDB database (`auth.db`), as configured in `auth.ts`.

### 6. Observability

The system is designed for operational visibility. As seen in the main router (`blocklets/core/api/src/routes/index.ts`), AIGNE Hub integrates with the `AIGNEObserver` library. This allows it to capture and export detailed trace data (spans) for each request to a dedicated Observability Blocklet. This provides operators with deep insights into request latency, error sources, and performance bottlenecks across the entire request lifecycle, from the gateway to the AI provider and back.