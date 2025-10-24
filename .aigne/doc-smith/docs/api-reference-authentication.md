# Authentication

All API requests to AIGNE Hub must be authenticated to ensure secure access to the gateway and its integrated AI services. This document outlines the token-based authentication mechanism required for all API interactions.

Access to the API is controlled via Bearer tokens. A valid token must be included in the `Authorization` header of every request. Unauthenticated requests or requests with invalid credentials will result in an error.

Further details on the available endpoints can be found in the [V2 Endpoints (Recommended)](./api-reference-v2-endpoints.md) section.

## Authentication Flow

The process begins with an administrator generating an access token through the AIGNE Hub's user interface. This token is then provided to the client application, which includes it in the header of each API request. The AIGNE Hub API validates this token before processing the request.

```d2
shape: sequence_diagram

Admin: {
  shape: c4-person
}

AIGNE-Hub-Admin-UI: {
  label: "AIGNE Hub\nAdmin UI"
}

Client-Application: {
  label: "Client Application"
}

AIGNE-Hub-API: {
  label: "AIGNE Hub API"
}

Admin -> AIGNE-Hub-Admin-UI: "1. Generate Access Token"
AIGNE-Hub-Admin-UI -> Admin: "2. Provides Token"
Admin -> Client-Application: "3. Configure with Token"

Client-Application -> AIGNE-Hub-API: "4. API Request\n(Authorization: Bearer <token>)"
AIGNE-Hub-API -> AIGNE-Hub-API: "5. Validate Token & Permissions"

"If Authorized" {
  AIGNE-Hub-API -> Client-Application: "6a. 200 OK Response"
}

"If Unauthorized" {
  AIGNE-Hub-API -> Client-Application: "6b. 401 Unauthorized Error"
}
```

## Making Authenticated Requests

To authenticate an API request, you must include an `Authorization` header containing your Bearer token.

**Header Format:**

```
Authorization: Bearer <YOUR_ACCESS_TOKEN>
```

Replace `<YOUR_ACCESS_TOKEN>` with the actual OAuth access key generated from the AIGNE Hub administrative interface.

### Example: cURL Request

This example demonstrates how to make a request to the chat completions endpoint using `curl`.

```bash API Request with cURL icon=cib:curl
curl -X POST 'https://your-aigne-hub-url/api/v2/chat/completions' \
-H 'Authorization: Bearer your-oauth-access-key' \
-H 'Content-Type: application/json' \
-d '{
  "model": "openai/gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, AIGNE Hub!"
    }
  ]
}'
```

### Example: Node.js Client

When using the official AIGNE Hub client library, the authentication headers are managed automatically.

```typescript AIGNE Hub Client icon=logos:nodejs
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  url: "https://your-aigne-hub-url/api/v2/chat",
  accessKey: "your-oauth-access-key",
  model: "openai/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

## Error Handling

If authentication fails, the API will respond with an HTTP `401 Unauthorized` status code. This indicates a problem with the credentials provided in the request.

Common causes for a `401` error include:

| Cause | Description |
| :--- | :--- |
| **Missing Token** | The `Authorization` header was not included in the request. |
| **Invalid Token** | The provided token is malformed, expired, or has been revoked. |
| **Insufficient Permissions** | The token is valid, but the associated user or application lacks the necessary permissions for the requested resource. |

### Example Error Response

A failed authentication attempt will return a JSON object containing error details.

```json Unauthorized Response icon=mdi:code-json
{
  "error": "Unauthorized",
  "message": "Authentication token is invalid or missing."
}
```

If you receive this response, verify that your access token is correct, has not expired, and possesses the required permissions before retrying the request.

## Summary

This section detailed the Bearer token authentication mechanism for the AIGNE Hub API. All requests must include a valid token in the `Authorization` header. For specific endpoint details, please proceed to the [V2 Endpoints (Recommended)](./api-reference-v2-endpoints.md) documentation.
