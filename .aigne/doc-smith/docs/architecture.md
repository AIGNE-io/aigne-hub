# Architecture

AIGNE Hub is designed as a robust, self-hosted AI gateway that provides a unified interface to multiple AI providers. This section offers a deep dive into its system architecture, detailing the core components, the technology stack it's built upon, and the data persistence layer. Understanding this architecture is key to deploying, managing, and scaling the system effectively.

For more detailed information on specific areas, please refer to the following sub-sections:
- [System Components](./architecture-system-components.md): An in-depth look at the functional blocks like the API gateway, authentication, and billing.
- [Technology Stack](./architecture-technology-stack.md): A complete list of the frameworks and technologies used.
- [Data Persistence](./architecture-data-persistence.md): Details on the database schema and data models.

## High-Level System Design

At its core, AIGNE Hub acts as a central intermediary between client applications and various external AI service providers. This design decouples applications from specific AI provider APIs, enabling centralized control over security, billing, and usage monitoring.

```d2
direction: right

Client-Apps: {
  label: "Client Apps"
  shape: rectangle
  grid-columns: 1

  "Web Apps"
  "Mobile Apps"
  "CLI Tools"
  "APIs"
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle
  grid-columns: 1

  "Load Balancer"
  "Auth System"
  "Usage Tracker"
  "Billing"
}

AI-Providers: {
  label: "AI Providers"
  shape: rectangle
  grid-columns: 1

  "OpenAI"
  "Anthropic"
  "Google"
  "Amazon"
}

Client-Apps -> AIGNE-Hub: "Unified API Requests"
AIGNE-Hub -> AI-Providers: "Proxied Requests"
```

The diagram above illustrates the primary data flow:
1.  **Client Applications** (web apps, CLIs, backend services, etc.) send requests to AIGNE Hub's unified API endpoints.
2.  **AIGNE Hub** authenticates the request, applies any load-balancing or billing logic, and forwards the request to the appropriate downstream AI Provider.
3.  The response is routed back through the Hub, where usage data is logged for analytics and billing before being sent back to the client.

## Technology Stack Overview

AIGNE Hub is built on a modern, reliable technology stack chosen for performance, security, and ease of maintenance. The core backend is powered by Node.js and TypeScript with the Express framework, while the frontend utilizes React. The entire application is designed for containerized deployment using the ArcBlock Blocklet platform, ensuring consistency across environments. For a complete list of technologies, see the [Technology Stack](./architecture-technology-stack.md) page.

## Data Persistence Overview

The system's state is managed through a local SQLite database, which is lightweight and ideal for a self-hosted, single-node deployment. The database is located at `DATA_DIR/aikit.db`. Data access is handled by the Sequelize ORM, which provides a structured way to interact with the database and manage schema migrations.

The core data models include:
- **AiProvider**: Stores configuration for each connected AI provider.
- **AiCredential**: Securely stores encrypted API keys for each provider.
- **ModelCall**: Records detailed logs for every API call made through the hub.
- **Usage**: Aggregates usage statistics for billing and analytics.

This architecture ensures that all sensitive data, including provider credentials and usage logs, remains within your own infrastructure, providing a high degree of security and data privacy. For a detailed breakdown, refer to the [Data Persistence](./architecture-data-persistence.md) section.

---

With this architectural overview, you have a foundational understanding of how AIGNE Hub operates. Explore the detailed sections to gain deeper insights into each component.