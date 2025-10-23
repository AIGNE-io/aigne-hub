# Architecture

AIGNE Hub is engineered as a robust, self-hosted AI gateway, designed for modularity and scalability. Built upon the AIGNE Framework and deployed as a Blocklet, it provides a centralized and secure interface for managing multiple AI providers. The architecture is structured to handle API requests, manage security, track usage, and persist data efficiently.

The following diagram provides a high-level overview of the system's structure and the interaction between its core components.

```d2
direction: down

AI-Model-Request: { 
  label: "AI Model Request"
}

Blocklet-Server: {
  label: "Blocklet Server"
  icon: "https://www.arcblock.io/image-bin/uploads/eb1cf5d60cd85c42362920c49e3768cb.svg"
}

AIGNE-Hub: {
  label: "AIGNE Hub (Self-hosted AI Gateway)"
  shape: rectangle
  grid-gap: 100

  System-Components: {
    label: "System Components"
    shape: rectangle

    API-Gateway: {
      label: "API Gateway"
    }
    Authentication-System: {
      label: "Authentication System"
    }
    Usage-Tracker: {
      label: "Usage Tracker"
    }
    Billing-Module: {
      label: "Billing Module (Optional)"
    }
  }

  Technology-Stack: {
    label: "Technology Stack"
    shape: rectangle

    Backend: {
      label: "Backend\nNode.js, Express.js, TypeScript"
    }
    Frontend: {
      label: "Frontend\nReact"
    }
  }

  Data-Persistence: {
    label: "Data Persistence"
    shape: rectangle

    Sequelize-ORM: {
      label: "Sequelize ORM"
    }

    SQLite-Database: {
      label: "SQLite Database"
      shape: cylinder
      
      AI-Providers: {
        label: "AI Providers"
      }
      AI-Credentials: {
        label: "AI Credentials"
      }
      Model-Calls: {
        label: "Model Calls"
      }
      Usage-Statistics: {
        label: "Usage Statistics"
      }
    }
  }
}

AI-Model-Request -> AIGNE-Hub.System-Components.API-Gateway: "Entry Point"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Authentication-System: "1. Validate"
AIGNE-Hub.System-Components.Authentication-System -> AIGNE-Hub.Data-Persistence.SQLite-Database: "Read Credentials"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Usage-Tracker: "2. Log Usage"
AIGNE-Hub.System-Components.Usage-Tracker -> AIGNE-Hub.Data-Persistence.SQLite-Database: "Write Stats"
AIGNE-Hub.System-Components.API-Gateway -> AIGNE-Hub.System-Components.Billing-Module: "3. Deduct Credits"
AIGNE-Hub.System-Components.Billing-Module -> AIGNE-Hub.Data-Persistence.SQLite-Database: "Update Credits"
AIGNE-Hub.Data-Persistence.Sequelize-ORM -> AIGNE-Hub.Data-Persistence.SQLite-Database: "Manages"
AIGNE-Hub -> Blocklet-Server: "Deployed On"

```

This document provides an overview of the architecture. For a deeper understanding of each area, please refer to the following detailed sections.

<x-cards data-columns="3">
  <x-card data-title="System Components" data-icon="lucide:blocks" data-href="/architecture/system-components">
    Details the primary functional blocks, including the API gateway, authentication system, and usage tracker.
  </x-card>
  <x-card data-title="Technology Stack" data-icon="lucide:layers" data-href="/architecture/technology-stack">
    Lists the key technologies and frameworks used to build the system, such as Node.js, React, and Sequelize.
  </x-card>
  <x-card data-title="Data Persistence" data-icon="lucide:database" data-href="/architecture/data-persistence">
    Explains the database setup using SQLite and the data models for providers, credentials, and usage statistics.
  </x-card>
</x-cards>

## System Components

The system is composed of several key functional blocks that work in concert to deliver a unified AI gateway experience. Each component is designed for a specific purpose, from handling incoming requests to managing data and security.

-   **API Gateway**: The central entry point for all AI model requests. It is built with Express.js and routes incoming traffic to the appropriate backend services and AI providers.
-   **Authentication System**: Secures the gateway by managing access control and validating credentials for all incoming API requests, integrating with Blocklet Server's user management.
-   **Usage Tracker**: Monitors and records token consumption, request counts, and other metrics for every API call, providing data for analytics and billing.
-   **Billing Module**: An optional component that integrates with Payment Kit to manage a credit-based system, enabling monetization of the AI gateway as a service.

For a detailed breakdown of each component, please refer to the [System Components](./architecture-system-components.md) document.

## Technology Stack

AIGNE Hub is constructed using a modern, reliable technology stack selected for performance, type safety, and maintainability.

-   **Backend**: The core logic is built with **Node.js** and the **Express.js** framework. **TypeScript** is used throughout the backend to ensure type safety and improve code quality.
-   **Frontend**: The administrative and user-facing dashboards are developed using **React**.
-   **Database ORM**: **Sequelize** is utilized as the Object-Relational Mapper (ORM) to interact with the database, simplifying data access and management.
-   **Deployment**: The entire application is packaged as a **Blocklet**, enabling straightforward deployment and management on a Blocklet Server instance.

Further details are available in the [Technology Stack](./architecture-technology-stack.md) section.

## Data Persistence

The system relies on a local **SQLite** database for all data persistence needs, which is managed through the Sequelize ORM. This self-contained setup ensures that all data remains within your hosting environment and simplifies deployment by avoiding the need for an external database server. The database journal mode is set to WAL (Write-Ahead Logging) to improve concurrency and performance.

Key data models include:

-   **AiProvider**: Stores the configuration for each connected AI service provider, such as endpoints and supported models.
-   **AiCredential**: Securely stores encrypted API keys and other sensitive credentials required to access AI provider APIs.
-   **ModelCall**: Logs every individual API call made through the gateway for auditing, debugging, and detailed usage tracking.
-   **ModelCallStat & Usage**: Aggregates raw call data into periodic statistics for performance monitoring and cost analysis dashboards.

For more information on the database schema and models, see the [Data Persistence](./architecture-data-persistence.md) documentation.

---

This architectural overview provides a foundational understanding of how AIGNE Hub is constructed. The subsequent sections offer a more granular look at each aspect of the system.