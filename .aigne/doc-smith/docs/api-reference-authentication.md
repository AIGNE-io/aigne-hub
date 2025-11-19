# API Authentication

Securely authenticating requests to the AIGNE Hub API is a critical step for programmatic access and integration. This guide provides a clear, step-by-step process for using API keys to authorize your applications, ensuring that all interactions are secure and properly identified.

## Authentication Methods

AIGNE Hub primarily uses bearer authentication with API keys for its RESTful API. All API requests must include an `Authorization` header containing a valid API key. This method is straightforward, secure, and aligns with industry best practices for service-to-service communication.

## Generating an API Key

Before you can authenticate, you must generate an API key from the AIGNE Hub admin interface.

1.  Navigate to the **Settings** section in your AIGNE Hub instance.
2.  Select the **API Keys** tab.
3.  Click the **"Generate New Key"** button.
4.  Provide a descriptive name for your key to help you identify its purpose later (e.g., `dev-server-integration`, `analytics-script-key`).
5.  The system will generate a new key. **Copy this key immediately and store it in a secure location.** For security reasons, the full key will not be shown again after you leave this page.

## Using the API Key

To authenticate an API request, include the API key in the `Authorization` header of your HTTP request. The value must be prefixed with the `Bearer ` scheme.

### HTTP Header Format

```
Authorization: Bearer <YOUR_API_KEY>
```

Replace `<YOUR_API_KEY>` with the actual key you generated.

### Example Request with cURL

Here is an example of how to make an authenticated request to the Chat Completions endpoint using `cURL`.

```bash Authenticated API Request icon=lucide:terminal
curl -X POST https://your-aigne-hub-url/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "aignehub/gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Example in a Node.js Application

When integrating with an application, you will set the `Authorization` header in your HTTP client library. The following example uses the AIGNE Hub SDK, which simplifies this process.

```javascript AIGNEHubChatModel.js icon=logos:javascript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  baseURL: "https://your-aigne-hub-url",
  apiKey: "YOUR_API_KEY", // The SDK handles adding the "Bearer " prefix
  model: "aignehub/gpt-3.5-turbo",
});

async function getGreeting() {
  try {
    const result = await model.invoke({
      messages: [{ role: "user", content: "Hello, AIGNE Hub!" }],
    });
    console.log(result);
  } catch (error) {
    console.error("API request failed:", error.message);
  }
}

getGreeting();
```

In this example, the `apiKey` provided to the `AIGNEHubChatModel` constructor is automatically placed into the correct `Authorization` header for all subsequent API calls made by the model instance.

## Security Best Practices

-   **Treat API keys like passwords.** Store them securely in a secret manager or as environment variables. Never expose them in client-side code or commit them to version control.
-   **Use different keys for different applications.** This practice, known as the principle of least privilege, limits the impact if a single key is compromised.
-   **Rotate keys regularly.** Periodically revoke old keys and generate new ones to reduce the risk of unauthorized access from a compromised key.
-   **Monitor API usage.** Keep an eye on the analytics dashboard to detect any unusual activity that might indicate a compromised key.

## Summary

Authentication to the AIGNE Hub API is handled via API keys included in the `Authorization` header as bearer tokens. By following the generation process and security best practices outlined above, you can ensure secure and reliable programmatic access to all API endpoints.

For more information on specific endpoints, please refer to the following sections:
- [Chat Completions](./api-reference-chat-completions.md)
- [Image Generation](./api-reference-image-generation.md)
- [Embeddings](./api-reference-embeddings.md)