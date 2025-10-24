# System Components

AIGNE Hub is designed with a modular architecture, ensuring that each part of the system has a distinct and well-defined responsibility. This separation of concerns enhances maintainability, scalability, and security. The primary functional blocks include the API Gateway, Authentication System, Usage Tracker, and an optional Billing Module. These components work in concert to process AI requests efficiently and securely.

The following diagram illustrates the high-level interaction between these core components, from receiving a client request to returning a response from an AI provider.

```d2
direction: down

Client-Applications: {
  label: "Client Applications"
  shape: rectangle
}

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  API-Gateway: {
    label: "API Gateway"
    shape: rectangle
  }

  Authentication-System: {
    label: "Authentication System"
    shape: rectangle
  }

  AI-Provider-Handler: {
    label: "AI Provider Handler"
    shape: rectangle
  }

  Usage-Tracker: {
    label: "Usage Tracker"
    shape: rectangle
  }

  Billing-Module: {
    label: "Billing Module"
    shape: rectangle
  }

  Database: {
    label: "Database"
    shape: cylinder
  }
}

External-AI-Provider: {
  label: "External AI Provider\n(e.g., OpenAI)"
  shape: rectangle
}

Client-Applications -> AIGNE-Hub.API-Gateway: "1. API Request"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Authentication-System: "2. Verify Identity"
AIGNE-Hub.Authentication-System -> AIGNE-Hub.API-Gateway: "3. Authenticated"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.AI-Provider-Handler: "4. Route Request"
AIGNE-Hub.API-Gateway -> AIGNE-Hub.Usage-Tracker: "5. Log Request Details"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Billing-Module: "6. Send Usage Data"
AIGNE-Hub.Billing-Module -> AIGNE-Hub.Database: "7. Update Credits"
AIGNE-Hub.Usage-Tracker -> AIGNE-Hub.Database: "Store Logs"
AIGNE-Hub.AI-Provider-Handler -> External-AI-Provider: "8. Forward Request"
External-AI-Provider -> AIGNE-Hub.API-Gateway: "9. AI Response"
AIGNE-Hub.API-Gateway -> Client-Applications: "10. Final Response"
```

## API Gateway

The API Gateway serves as the single, unified entry point for all incoming requests to AIGNE Hub. It is responsible for routing traffic to the appropriate internal services based on the request path. This centralized approach simplifies client integrations, as developers only need to interact with a single, consistent API endpoint regardless of the underlying AI provider.

The gateway exposes a set of RESTful endpoints, primarily under the `/api/v2/` path, for functionalities like chat completions, image generation, and embeddings. It directs requests to the relevant handlers for processing after they have passed through authentication and other middleware.

## Authentication System

Security is managed by a robust authentication system that protects all endpoints. It leverages middleware to verify the identity of the user or application making the request.

-   **User Authentication**: For user-facing interactions, such as using the admin dashboard or the built-in playground, the system uses a session-based authentication mechanism managed by the Blocklet SDK.
-   **API Authentication**: All API requests require a Bearer token for authorization. This token is associated with a specific user or application, ensuring that only authenticated clients can access the AI models.

The system is designed to reject any unauthenticated requests with a `401 Unauthorized` error, preventing unauthorized access to the underlying AI services and data.

## Usage Tracker

The Usage Tracker is a critical component for monitoring and auditing. It meticulously records every API call that passes through the gateway. A middleware, `createModelCallMiddleware`, intercepts incoming requests to create a `ModelCall` record in the database with a `processing` status.

This record captures key details of the transaction, including:
-   User DID and Application DID
-   The requested AI model and call type (e.g., `chatCompletion`, `imageGeneration`)
-   Request and response timestamps
-   Input and output token counts
-   Status of the call (e.g., `success`, `failed`)

Upon completion or failure of the API call, the middleware updates the `ModelCall` record with the final status, duration, and any error details. This provides a complete audit trail for debugging, analytics, and billing.

## Billing Module

When operating in "Service Provider Mode," AIGNE Hub activates its optional Billing Module. This component integrates seamlessly with the Usage Tracker and the **Payment Kit** blocklet to manage a credit-based billing system.

The workflow is as follows:
1.  **Check Balance**: Before processing a request, the system checks if the user has a sufficient credit balance. If the balance is zero or negative, the request is rejected with a `402 Payment Required` error.
2.  **Calculate Cost**: After a successful API call, the Usage Tracker provides the final token counts or image generation metrics. The Billing Module uses this data, along with the pre-configured rates for the specific model (`AiModelRate`), to calculate the total cost in credits.
3.  **Deduct Credits**: The calculated amount is then deducted from the user's balance by creating a meter event via the Payment Kit API.

This automated process enables operators to offer AIGNE Hub as a paid service, with all usage and billing managed transparently.