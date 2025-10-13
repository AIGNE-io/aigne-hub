# Authentication

All API requests to AIGNE Hub must be authenticated to ensure secure access to resources. The system uses a straightforward token-based authentication mechanism where each request must include a valid access key.

This section explains how to properly format your API requests for authentication. For information on specific endpoints, please see the [V2 Endpoints (Recommended)](./api-reference-v2-endpoints.md) and [V1 Endpoints (Legacy)](./api-reference-v1-endpoints.md) sections.

## Bearer Token Authentication

AIGNE Hub uses the Bearer Token scheme. You must provide your API access key in the `Authorization` header of every request. The access key is typically an OAuth 2.0 token obtained through the platform's authentication flow.

The header should be formatted as follows:

```text
Authorization: Bearer YOUR_ACCESS_KEY
```

Replace `YOUR_ACCESS_KEY` with the actual token provided to you. Requests made without a valid `Authorization` header will be rejected with an authentication error.

### Example Request

Here is an example of how to authenticate a `curl` request to the chat completion endpoint. This demonstrates the correct placement and format of the `Authorization` header.

```bash Chat Completion Request icon=mdi:api
curl -X POST "https://your-hub.com/api/v2/chat" \
  -H "Authorization: Bearer YOUR_ACCESS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Security Note

Your access key is sensitive and should be treated like a password. Keep it secure and do not expose it in client-side code or public repositories. If you suspect your key has been compromised, you should revoke it and generate a new one immediately.

## Summary

To interact with the AIGNE Hub API, you must include a valid Bearer token in the `Authorization` header of every request. With a clear understanding of the authentication process, you can now explore the available API endpoints to integrate AIGNE Hub into your applications.