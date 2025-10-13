# System Components

AIGNE Hub is designed with a modular architecture, comprising several key functional blocks that work together to provide a centralized, secure, and governable AI gateway. Understanding these components is essential for operating and integrating with the system effectively.

![AIGNE Hub Architecture Overview](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-site/b0683a48-43d9-4ca7-99e0-f0e7552de445.png)

### Core Functional Blocks

The system is primarily composed of four major components:

1.  **API Gateway**: The unified entry point for all AI model requests.
2.  **Authentication System**: Secures access to the gateway and its resources.
3.  **Usage Tracker**: Monitors and records every API call for analytics and auditing.
4.  **Billing Module**: An optional credit-based system for managing costs and monetization.

```d2
direction: down

Client-App: {
  label: "Client Application"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle
  grid-columns: 2

  API-Gateway: {
    label: "API Gateway"
    shape: rectangle
  }

  Authentication: {
    label: "Authentication"
    shape: rectangle
  }

  Usage-Tracker: {
    label: "Usage Tracker"
    shape: rectangle
  }

  Billing-Module: {
    label: "Billing Module (Optional)"
    shape: rectangle
    style: {
      stroke-dash: 4
    }
  }
}

AI-Providers: {
  label: "AI Providers"
  shape: cylinder
}


Client-App -> AIGNE-Hub.API-Gateway: "1. API Request"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Authentication: "2. Verify Token"
AIGNE-Hub.Authentication -> AIGNE-Hub.Usage-Tracker: "3. Start Call Tracking"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Billing-Module: "4. Check Credits"
AIGNE-Hub.Billing-Module -> AIGNE-Hub.API-Gateway: "5. Authorize"
AIGNE-Hub.API-Gateway -> AI-Providers: "6. Proxy to Provider"
AI-Providers -> AIGNE-Hub.API-Gateway: "7. AI Response"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Usage-Tracker: "8. Log Usage"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Billing-Module: "9. Deduct Credits"
AIGNE-Hub.Billing-Module -> Client-App: "10. Return Response"
```

### API Gateway

The API Gateway, built on Express.js, serves as the central nervous system of AIGNE Hub. It exposes a set of RESTful endpoints that abstract the complexities of interacting with various underlying AI providers. All incoming requests from client applications are routed through this gateway.

Key responsibilities include:
- **Request Routing**: Directs incoming requests to the appropriate internal services based on the endpoint (e.g., `/v2/chat`, `/v2/images`).
- **Version Management**: Supports both legacy (`/v1`) and current (`/v2`) API versions to ensure backward compatibility for older integrations.
- **Middleware Orchestration**: Chains together middlewares for authentication, usage tracking, and billing checks before processing a request.
- **Load Balancing and Failover**: Manages requests across multiple credentials for the same provider to enhance reliability and performance.

### Authentication System

The authentication system ensures that only authorized clients and users can access the AI models. It employs a robust, DID-based mechanism using `@arcblock/did-connect`.

- **User Authentication (V2 API)**: The recommended V2 endpoints are protected by user-level authentication. Clients must present a valid Bearer token (JWT) obtained through an OAuth 2.0 flow. This allows for fine-grained, per-user tracking and billing.
- **Component Authentication (V1 API)**: The legacy V1 endpoints use component-to-component authentication, where a calling Blocklet must present a signed request. This method is suitable for server-to-server integrations within the Blocklet Server ecosystem.
- **Role-Based Access Control (RBAC)**: Administrative functions and configurations are protected by RBAC, ensuring that only users with `owner` or `admin` roles can make system-level changes.

### Usage Tracker

Comprehensive usage tracking is a core feature of AIGNE Hub, providing the data necessary for analytics, auditing, and billing. This is managed by the `ModelCall` tracking middleware.

For every API request, the tracker:
1.  **Creates a Record**: A `ModelCall` record is created in the database with a `processing` status the moment a request is received.
2.  **Tracks Lifecycle**: The system monitors the request as it's forwarded to the AI provider.
3.  **Updates on Completion**: Once the AI provider responds, the record is updated to `success` or `failed`.
4.  **Records Metrics**: Key data points are stored, including:
    -   Prompt and completion tokens.
    -   User DID and client application DID.
    -   Request duration.
    -   Model used and provider credentials.
    -   Error reasons, if any.

To maintain system health, a background job (`cleanupStaleProcessingCalls`) periodically runs to mark any long-running `processing` calls as failed, preventing orphaned records.

### Billing Module

AIGNE Hub includes an optional, but powerful, credit-based billing system that integrates with the ArcBlock Payment Kit blocklet. When enabled, this module allows operators to monetize AI usage.

- **Credit-Based System**: Users consume credits for making API calls. The cost of each call is determined by pre-configured rates for different models.
- **Balance Check**: Before processing a request on a billable endpoint, the system checks if the user has a sufficient credit balance via the `checkUserCreditBalance` function.
- **Metered Events**: After a successful API call, the `createMeterEvent` function is triggered to deduct the calculated cost from the user's balance. All consumption is recorded against a specific meter (`AIGNE Hub AI Meter`).
- **Payment Links**: The system provides payment links for users to purchase more credits, creating a self-service model for topping up their accounts.

This module is disabled by default but can be configured to provide detailed cost control and create new revenue streams.