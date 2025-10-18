# Technical Architecture

This document provides a detailed overview of the AIGNE Hub's technical architecture, designed for DevOps, SRE, and infrastructure teams responsible for deployment, monitoring, and maintenance.

## Core Philosophy

The architecture of AIGNE Hub is built on principles of modularity, scalability, and ease of deployment. It operates as a self-contained, cloud-native application packaged as a Blocklet. This design choice simplifies installation, management, and integration into existing infrastructures. The system is centered around a unified API gateway that abstracts the complexity of interacting with multiple downstream AI providers.

## System Components

AIGNE Hub consists of several key components that work together to deliver its functionality.

![AIGNE Hub Logo](../../../blocklets/core/screenshots/logo.png)

### 1. API Server (Express.js)

The backbone of the application is a robust API server built with Node.js and [Express.js](https://expressjs.com/). It handles all incoming requests, authentication, and routing.

-   **Runtime**: Node.js (>=18), providing an efficient, event-driven environment suitable for I/O-heavy operations like proxying API calls.
-   **Framework**: Express.js is used for its minimalist and flexible approach to building web applications and APIs.
-   **Type Safety**: The entire backend is written in TypeScript, ensuring code quality, maintainability, and fewer runtime errors.
-   **API Structure**: The system exposes a versioned RESTful API (e.g., `/api/v1`, `/api/v2`) for interacting with AI models and managing the Hub. This ensures backward compatibility as the platform evolves.
-   **Middleware**: Core functionalities are implemented using standard middleware, including:
    -   `cors` for cross-origin resource sharing.
    -   `cookie-parser` for handling HTTP cookies.
    -   Custom logging middleware for capturing access logs.
    -   A robust error-handling mechanism that formats and logs exceptions, returning appropriate HTTP status codes.

### 2. Data Persistence (SQLite & Sequelize)

For data storage, AIGNE Hub utilizes a lightweight yet powerful combination of SQLite and the Sequelize ORM.

-   **Database**: SQLite is the chosen database engine. This decision was made to optimize for simplicity and portability. By embedding the database within the Blocklet's data directory (`/data/aikit.db`), AIGNE Hub eliminates the need for external database dependencies, making deployment and data backups straightforward.
-   **Performance**: To enhance performance under load, the system configures SQLite with specific PRAGMA directives:
    -   `journal_mode = WAL`: Write-Ahead Logging allows for higher concurrency by enabling readers to continue operating while writes are in progress.
    -   `synchronous = normal`: Provides a good balance between performance and data integrity.
-   **ORM**: [Sequelize](https://sequelize.org/) is used as the Object-Relational Mapper. It provides a clear, model-based structure for interacting with the database and managing relationships. Key data models include:
    -   `AiProvider`: Stores configurations for supported AI providers (e.g., OpenAI, Anthropic).
    -   `AiCredential`: Securely stores encrypted API keys and other credentials for each provider.
    -   `App`: Manages applications that are authorized to use the Hub.
    -   `ModelCall`: Logs every individual API call for auditing and analytics.
    -   `Usage`: Aggregates usage data for billing and tracking purposes.
-   **Migrations**: Database schema changes are managed by `umzug`. This ensures that database updates are applied reliably and version-controlled, which is critical for smooth upgrades during maintenance cycles.

### 3. AI Provider Gateway

The core functionality of AIGNE Hub lies in its intelligent gateway for routing requests to various AI providers.

-   **Dynamic Model Loading**: The system dynamically loads the appropriate SDK or model handler based on the `model` parameter in an API request (e.g., `openai/gpt-4o`). This is handled by the `@aigne/core` and `@aigne/aigne-hub` libraries, which provide a standardized interface for different AI services.
-   **Credential Management**: When a request is received, the `getProviderCredentials` function retrieves the necessary credentials from the `AiProvider` and `AiCredential` tables. It includes logic to cycle through available keys (`getNextAvailableCredential`), providing a basic mechanism for load balancing and failover if multiple keys are configured for a single provider.
-   **Extensibility**: The architecture is designed to be extensible. Adding a new AI provider involves implementing its specific logic within the framework and adding its configuration to the database, without requiring major changes to the core application.

### 4. Observability and Monitoring

For operational insight, AIGNE Hub integrates with the AIGNE ecosystem's observability tools.

-   **Distributed Tracing**: The `AIGNEObserver` module captures trace data (spans) for API calls. This data is then exported to a dedicated Observability Blocklet.
-   **Troubleshooting**: This integration allows operators to trace the lifecycle of a request from the initial API call through the Hub to the downstream AI provider and back. It is invaluable for diagnosing latency issues, identifying errors, and understanding system performance.

## Deployment and Operations

AIGNE Hub is designed for deployment as a [Blocklet](https://blocklet.io), a cloud-native application package that simplifies its lifecycle management.

-   **Containerization**: As a Blocklet, the application runs in a containerized environment, ensuring consistency across different deployment targets.
-   **Configuration**: Environment-specific configurations are managed through `.env` files, facilitated by the `dotenv-flow` library. This allows for distinct settings for development, testing, and production environments.
-   **Static Assets**: In a production environment, the compiled React frontend is served directly by the same Express.js server, creating a self-contained unit that is easy to manage and deploy behind a reverse proxy or load balancer.
-   **Billing System**: The Hub includes a credit-based billing system that integrates with the Payment Kit blocklet. The `paymentClient` and `ensureMeter` functions handle the communication, enabling the Hub to operate in a service provider mode where usage is metered and billed against user credits.