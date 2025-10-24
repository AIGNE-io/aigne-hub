# Technology Stack

AIGNE Hub is constructed using a modern, robust technology stack chosen for performance, reliability, and maintainability. This section details the primary frameworks, languages, and libraries that power the application, providing a clear architectural overview for developers and operators.

The stack is designed to be both powerful and straightforward, leveraging well-established open-source technologies to deliver a scalable and secure AI gateway.

## Core Components

The technology stack can be broken down into several key areas, from the backend runtime to the frontend user interface and data storage.

### Backend

The server-side of AIGNE Hub is built on a foundation of Node.js and TypeScript, ensuring a high-performance, type-safe environment.

| Technology | Role | Rationale |
| :--- | :--- | :--- |
| **Node.js** | JavaScript Runtime | Provides an efficient, event-driven, and non-blocking I/O model, making it ideal for handling concurrent API requests. |
| **Express.js** | Web Framework | A minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications. |
| **TypeScript** | Language | A superset of JavaScript that adds static typing, improving code quality, maintainability, and developer productivity. |

### Frontend

The administrative user interface and user-facing components are built with the latest version of React, creating a modern and responsive user experience.

| Technology | Role | Rationale |
| :--- | :--- | :--- |
| **React** | UI Library | A declarative, efficient, and flexible JavaScript library for building user interfaces and single-page applications. |

### Data Persistence

For data storage, AIGNE Hub uses a combination of a lightweight database and a powerful Object-Relational Mapper (ORM) for simplified data management.

| Technology | Role | Rationale |
| :--- | :--- | :--- |
| **Sequelize** | ORM | A promise-based Node.js ORM for Postgres, MySQL, MariaDB, SQLite, and Microsoft SQL Server. It simplifies database interactions. |
| **SQLite** | Database | A self-contained, serverless, zero-configuration, transactional SQL database engine, used as the default storage for its simplicity and ease of deployment. |

### Deployment and Ecosystem

AIGNE Hub is designed as a [Blocklet](https://blocklet.io), which simplifies deployment, management, and integration within the broader AIGNE ecosystem.

| Technology | Role | Rationale |
| :--- | :--- | :--- |
| **Blocklet** | Application Packaging | A cloud-native application packaging format that bundles the application and all its dependencies, enabling one-click deployment and management. |
| **AIGNE Framework** | Integration | Provides seamless integration with other AIGNE tools and services, such as AIGNE Studio and AIGNE CLI. |

## Summary

The selection of these technologies ensures that AIGNE Hub is a reliable, scalable, and secure platform. The use of TypeScript across the stack enforces code quality, while the choice of Node.js and React provides a high-performance foundation. The combination of Sequelize and SQLite offers a flexible and easy-to-manage data persistence layer suitable for a wide range of deployment scenarios.

For more details on the system's components and data models, please refer to the [System Components](./architecture-system-components.md) and [Data Persistence](./architecture-data-persistence.md) sections.