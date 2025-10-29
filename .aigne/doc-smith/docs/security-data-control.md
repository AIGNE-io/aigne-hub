# Getting Started with AIGNE Hub

This guide provides a comprehensive walkthrough for deploying, configuring, and verifying your AIGNE Hub instance. It is designed for operations and infrastructure teams responsible for managing the system.

## Prerequisites

Before proceeding with the installation, ensure your environment meets the following requirements:

- **Blocklet Server**: A running instance of Blocklet Server is required to host AIGNE Hub. For installation and management instructions, refer to the official [Blocklet Server documentation](https://docs.blocklet.io/docs/en/getting-started).
- **Node.js**: AIGNE Hub requires Node.js version 18 or higher. Blocklet Server manages the Node.js runtime, so ensure your server environment is up-to-date.
- **AI Provider Accounts**: You will need active accounts and API keys for the AI providers you intend to integrate (e.g., OpenAI, Anthropic, Google Gemini).

The system utilizes an integrated SQLite database, managed via the Sequelize ORM, which is automatically configured during the installation process. No external database setup is required for a standard deployment.

## Installation

AIGNE Hub is deployed as a Blocklet from the official Blocklet Store.

1.  **Navigate to Blocklet Store**: Access your Blocklet Server dashboard and go to the "Store" section.
2.  **Find AIGNE Hub**: Use the search bar to find "AIGNE Hub".
3.  **Launch the Blocklet**: Click the "Launch" button on the AIGNE Hub page. The installation wizard will guide you through the process, which typically involves confirming the blocklet name and URL.

Once the installation is complete, the AIGNE Hub instance will be running and accessible at the URL you configured.

![AIGNE Hub Dashboard](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

## Initial Configuration

After installation, the first step is to configure the AI providers you wish to make available through the hub.

1.  **Access the Admin Panel**: Open your AIGNE Hub instance and navigate to the admin dashboard.
2.  **Go to AI Providers**: In the admin panel, find the configuration section and select **AI Providers**.
3.  **Add Provider Keys**: Select an AI provider from the list and enter your API key and any other required credentials. The hub encrypts and stores these keys securely. You can add multiple providers.

![Configure AI Providers](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/fc46e9461382f0be7541af17ef13f632.png)

## Deployment Models

AIGNE Hub supports two primary operational models. Choose the one that aligns with your organization's needs.

### 1. Internal Use (Enterprise Self-Hosting)

This is the default and simplest deployment model, ideal for internal development teams.

-   **Operation**: Once AI providers are configured, the hub is ready to serve requests.
-   **Authentication**: Access can be managed via direct API access or by integrating with an OAuth provider for secure, centralized authentication.
-   **Billing**: Your organization is billed directly by the AI providers based on usage. AIGNE Hub provides the tools to track this consumption internally.

### 2. Service Provider Mode

This model is for organizations that want to offer AI services to external customers.

-   **Enable Billing**: To enable this mode, install the **Payment Kit** Blocklet and integrate it with AIGNE Hub.
-   **Set Custom Pricing**: Configure your own pricing rates for different models, allowing you to set profit margins.
-   **Credit System**: Users purchase credits through the Payment Kit to pay for their AI usage. The system automatically manages credit deduction and user onboarding.

## Verifying the Installation

After configuration, verify that the hub is functioning correctly by using the built-in AI Playground.

1.  **Open the Playground**: Navigate to the "Playground" section within the AIGNE Hub UI.
2.  **Select a Model**: Choose one of the AI models you configured (e.g., `openai/gpt-4`).
3.  **Send a Request**: Type a prompt in the input box and send a request.

If you receive a successful response from the model, your AIGNE Hub instance is correctly configured and fully operational.

![AI Playground](https://raw.githubusercontent.com/AIGNE-io/aigne-hub/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

## Basic Usage Example

Applications can interact with AIGNE Hub via its RESTful API. When using the AIGNE Framework, the `AIGNEHubChatModel` provides a seamless integration point.

The following TypeScript example demonstrates how to invoke a chat model through the hub.

```typescript
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// Initialize the model with your Hub's configuration
const model = new AIGNEHubChatModel({
  // URL of your AIGNE Hub API endpoint
  baseURL: "https://your-aigne-hub-url",

  // Secure access key obtained via OAuth or generated for an application
  apiKey: "your-oauth-access-key",

  // Specify the provider and model to use
  model: "aignehub/gpt-3.5-turbo",
});

async function getCompletion() {
  try {
    const result = await model.invoke({
      messages: "Hello, AIGNE Hub!",
    });

    console.log("AI Response:", result);
  } catch (error) {
    console.error("Error invoking model:", error);
  }
}

getCompletion();
```

-   `url`: The full URL to your AIGNE Hub's chat completions API endpoint.
-   `accessKey`: An access key for authentication. For production systems, this should be a secure token obtained through the OAuth flow.
-   `model`: A string identifying the provider and model, formatted as `provider/model-name`.