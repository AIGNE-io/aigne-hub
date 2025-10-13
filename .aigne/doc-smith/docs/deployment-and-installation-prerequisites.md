# Technical Architecture

AIGNE Hub is engineered as a cloud-native application, optimized for reliability, scalability, and ease of maintenance. The architecture leverages a modern technology stack, with each component selected to meet the specific demands of a high-performance AI gateway. The system is designed to be deployed as a self-contained unit, minimizing external dependencies and simplifying operational management.

![logo.png](../../../blocklets/core/screenshots/logo.png)

### Core Components

The architecture is composed of several key layers:

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Application Framework** | AIGNE Framework | Provides the foundational structure for the backend service, including dependency injection, configuration management, and lifecycle hooks. It standardizes development and ensures seamless integration within the AIGNE ecosystem. |
| **Backend Runtime** | Node.js & TypeScript | Node.js is used for its non-blocking, event-driven I/O model, which is highly efficient for handling numerous concurrent API requests to external LLM providers. TypeScript adds static typing, improving code quality, maintainability, and reducing runtime errors—a critical feature for a core infrastructure service. |
| **Frontend Interface** | React 19 | The administrative dashboard and model playground are built with the latest version of React. This provides a modern, responsive, and high-performance user interface for configuration, monitoring, and testing. |
| **Data Storage** | SQLite with Sequelize ORM | SQLite is employed as the default embedded database, which simplifies deployment by eliminating the need for an external database server. This design choice makes AIGNE Hub lightweight and easy to install. The Sequelize ORM abstracts database interactions and provides the flexibility to switch to other SQL databases like PostgreSQL for larger-scale deployments if necessary. |
| **Deployment & Packaging**| Blocklet | The entire application is packaged as a Blocklet. This cloud-native containerization approach encapsulates the application, its runtime, and all dependencies into a single, deployable unit. For operations teams, this significantly simplifies installation, upgrades, and scaling on any Blocklet Server instance. |

### System Design and Data Flow

1.  **Request Ingestion**: Client applications (e.g., those built with AIGNE Framework, AIGNE Studio, or custom scripts) send API requests to AIGNE Hub's RESTful endpoints (e.g., `/api/v2/chat`). These requests are secured via OAuth access keys.
2.  **Authentication & Authorization**: The Hub's gateway layer intercepts the request, validates the access key, and checks associated permissions and user credit balances (if in service provider mode).
3.  **Provider Routing**: Based on the request parameters (e.g., `model: "openai/gpt-3.5-turbo"`), the Hub's routing logic selects the appropriate downstream AI provider.
4.  **Credential Injection**: The Hub securely retrieves the corresponding provider's API key from its encrypted storage and injects it into the request.
5.  **API Call & Response**: The Hub forwards the transformed request to the target AI provider's API. Upon receiving the response, it normalizes the output into a standardized format.
6.  **Logging & Analytics**: Before returning the response to the client, the Hub logs the transaction details, including token usage, cost, and latency. This data powers the usage analytics and billing systems.
7.  **Response to Client**: The final, standardized response is sent back to the client application.

This architecture ensures that AIGNE Hub acts as a robust and transparent intermediary, centralizing control, security, and observability for all AI operations within an organization. The use of Blocklet technology abstracts away underlying infrastructure complexities, allowing DevOps and SRE teams to manage the Hub as a predictable, versioned, and scalable service.