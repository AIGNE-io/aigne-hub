# API Architecture and Endpoints (v2)

This document provides a detailed overview of the v2 API architecture, designed for DevOps, SRE, and infrastructure teams responsible for deploying, monitoring, and maintaining the system. It focuses on the internal workings, design rationale, and operational aspects of the API.

## 1. System Architecture Overview

The v2 API is a robust, scalable interface for interacting with various AI models. Its design prioritizes dynamic provider management, resiliency, and comprehensive usage tracking, making it suitable for production environments.

### 1.1. Request Lifecycle

A typical API request follows a structured lifecycle, enforced by a series of Express.js middlewares:

1.  **Authentication**: The `sessionMiddleware` authenticates the user via an access key, attaching the user's context (`req.user`) to the request object.
2.  **Billing and Credit Check**: If credit-based billing is enabled (`Config.creditBasedBillingEnabled`), the `checkCreditBasedBillingMiddleware` verifies that the payment system is operational and the user has a sufficient credit balance (`checkUserCreditBalance`).
3.  **Model Call Tracking**: A dedicated middleware (`createModelCallMiddleware`) initiates a record in the system to track the entire lifecycle of the AI model interaction. This is crucial for logging, debugging, and analytics.
4.  **Input Validation**: Incoming request bodies are rigorously validated against predefined Joi schemas to ensure data integrity and prevent malformed requests from reaching the core logic.
5.  **Dynamic Model and Credential Selection**: The system dynamically selects an appropriate AI provider and credential. It queries the `AiProvider` and `AiCredential` tables to find an active, enabled credential for the requested model, implementing a round-robin or similar strategy (`AiCredential.getNextAvailableCredential`) to distribute load.
6.  **AI Model Invocation**: The request is processed by the core logic, which uses the `AIGNE` SDK to interact with the selected AI model. This abstracts the complexities of different provider APIs.
7.  **Usage and Billing Record Finalization**: Upon successful completion or failure, a hook (`onEnd` or `onError`) is triggered. The `createUsageAndCompleteModelCall` function is called to finalize the model call record, calculate the cost in credits, and log detailed usage metrics.
8.  **Response Generation**: The system sends the response back to the client. For chat completions, this can be a standard JSON object or a `text/event-stream` for real-time streaming.

### 1.2. Dynamic Provider and Credential Management

A key design decision was to decouple the API from specific AI providers. The system uses a database-driven approach to manage providers (`AiProvider`) and their associated API keys (`AiCredential`).

-   **How it Works**: When a request specifies a model (e.g., `openai/gpt-4o`), the system first identifies the provider (`openai`). It then queries the database for an active credential associated with that provider. This allows for credentials to be added, removed, or rotated without any service downtime.
-   **Rationale**: This architecture provides high availability and flexibility. If one credential or provider experiences issues, the system can be configured to failover to another. It also simplifies the management of API keys and centralizes control over AI model access. The `getProviderCredentials` function encapsulates this logic, ensuring that every model call uses a valid, active credential.

### 1.3. Resiliency and Error Handling

To ensure stability in a distributed environment, the API incorporates an automatic retry mechanism for transient failures.

-   **Retry Handler**: The `createRetryHandler` wraps the core endpoint logic. It is configured to retry requests that fail with specific HTTP status codes (e.g., `429 Too Many Requests`, `500 Internal Server Error`, `502 Bad Gateway`). The number of retries is configurable via `Config.maxRetries`.
-   **Failure Logging**: In case of non-retriable errors or after exhausting all retries, the `onError` hook ensures that the failure is logged and the associated model call record is marked as failed. This prevents orphaned records and provides clear data for troubleshooting.

## 2. API Endpoints

The following sections detail the primary v2 API endpoints, their purpose, and operational characteristics.

### GET /status

-   **Purpose**: A health check endpoint used to determine if the service is available and ready to accept requests for a specific model.
-   **Process Flow**:
    1.  Authenticates the user.
    2.  If `Config.creditBasedBillingEnabled` is true, it checks that the payment service is running and the user has a positive credit balance.
    3.  It queries the `AiProvider` database to ensure there is at least one enabled provider with active credentials that can serve the requested model.
    4.  If a specific model is queried, it also checks if a rate is defined for it in the `AiModelRate` table.
-   **Operational Notes**: This endpoint is critical for client-side service discovery. Clients should call `/status` before attempting to make a model call to avoid sending requests that are guaranteed to fail.

### POST /chat and /chat/completions

-   **Purpose**: Provides access to language models for chat-based interactions.
-   **Endpoint Variants**:
    -   `/chat/completions`: An OpenAI-compatible endpoint that accepts standard `messages` arrays and supports streaming via `text/event-stream`.
    -   `/chat`: The native AIGNE Hub endpoint which uses a slightly different input structure but provides the same core functionality.
-   **Process Flow**:
    1.  The request lifecycle (authentication, billing check, etc.) is executed.
    2.  The `processChatCompletion` function handles the core logic. It validates the input against `completionsRequestSchema`.
    3.  `getModel` is called to dynamically load the specified model instance and select credentials.
    4.  The `AIGNE` engine invokes the model. If `stream: true` is requested, it returns an async generator that yields response chunks.
    5.  For streaming responses, chunks are written to the response stream as they arrive.
    6.  The `onEnd` hook calculates token usage (`promptTokens`, `completionTokens`) and calls `createUsageAndCompleteModelCall` to record the transaction.

### POST /image and /image/generations

-   **Purpose**: Generates images from text prompts using models like DALL-E.
-   **Endpoint Variants**:
    -   `/image/generations`: OpenAI-compatible endpoint.
    -   `/image`: Native AIGNE Hub endpoint.
-   **Process Flow**:
    1.  The standard request lifecycle is followed.
    2.  The input is validated against `imageGenerationRequestSchema` or `imageModelInputSchema`.
    3.  `getImageModel` is called to load the appropriate image model provider (e.g., OpenAI, Gemini) and select credentials.
    4.  The `AIGNE` engine invokes the model with the prompt and parameters (size, quality, etc.).
    5.  The `onEnd` hook records the usage. For images, billing is typically based on the number of images generated, their size, and quality, which is captured in `createUsageAndCompleteModelCall`.
    6.  The response contains the generated images, either as URLs or Base64-encoded JSON data (`b64_json`).

### POST /embeddings

-   **Purpose**: Converts input text into numerical vector representations (embeddings).
-   **Process Flow**:
    1.  The standard request lifecycle is executed.
    2.  The request body is validated by `embeddingsRequestSchema`.
    3.  `processEmbeddings` calls the underlying provider's embeddings endpoint.
    4.  Usage is calculated based on the number of input tokens and recorded via `createUsageAndCompleteModelCall`.

### POST /audio/transcriptions and /audio/speech

-   **Purpose**: Provides speech-to-text and text-to-speech functionalities.
-   **Architecture**: These endpoints are currently implemented as secure proxies to the OpenAI API.
-   **Process Flow**:
    1.  The user is authenticated.
    2.  The request is forwarded directly to the OpenAI API.
    3.  The `proxyReqOptDecorator` function dynamically retrieves the appropriate OpenAI API key from the credential store and injects it into the `Authorization` header of the outgoing request.
-   **Operational Notes**: As these are proxies, their performance and availability are directly tied to the upstream OpenAI service. Note that credit-based billing is marked as a "TODO" for these endpoints in the source code, meaning usage may not be tracked through the AIGNE Hub billing system.

## 3. Troubleshooting and Monitoring

-   **Log Analysis**: The system uses a centralized logger. Key events to monitor are:
    -   `Create usage and complete model call error`: Indicates a problem with writing usage data to the database after a model call, which can affect billing.
    -   `ai route retry`: Signals that transient network or provider errors are occurring. A high frequency of retries may point to underlying infrastructure instability.
    -   `Failed to mark incomplete model call as failed`: A critical error that could lead to inconsistent state in the model call tracking system.
-   **Common Errors**:
    -   `400 Validation error`: The client sent a malformed request. Check the error message for details on which Joi validation failed.
    -   `401 User not authenticated`: The access key is missing or invalid.
    -   `404 Provider ... not found`: The requested model or provider is not configured or enabled in the database.
    -   `502 Payment kit is not Running`: The billing service is down or unreachable. This is a critical dependency when `creditBasedBillingEnabled` is true.