# Getting Started

This guide provides the essential steps to deploy, configure, and start using AIGNE Hub. It is designed for operations and infrastructure teams who need to get the system running efficiently.

## Overview

AIGNE Hub acts as a unified AI gateway, centralizing the management of multiple Large Language Model (LLM) and AIGC providers. It simplifies API key management, usage tracking, and billing, providing a single point of access for all AI services within your ecosystem. Built on the AIGNE framework and deployed as a Blocklet, it offers robust solutions for both internal enterprise use and public-facing service provider models.

![AIGNE Hub Dashboard](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/c29f08420df8ea9a199fcb5ffe06febe.png)

## 1. Deployment

AIGNE Hub is designed to run on Blocklet Server, which provides the underlying orchestration, scaling, and management capabilities.

### Prerequisites

- A running Blocklet Server instance.
- Administrative access to the Blocklet Server to install and manage applications.

### Installation Steps

1.  **Navigate to the Blocklet Store**: Access your Blocklet Server dashboard and go to the "Store" section.
2.  **Find AIGNE Hub**: Use the search bar to find "AIGNE Hub".
3.  **Launch the Application**: Click the "Launch" button on the AIGNE Hub page. The installation wizard will guide you through the initial setup process.

Once the installation is complete, AIGNE Hub will be running as a service on your Blocklet Server.

## 2. Provider Configuration

After deployment, the first step is to connect AIGNE Hub to one or more AI providers. This involves adding the necessary API keys for the services you intend to use.

1.  **Access the Admin Panel**: Open your AIGNE Hub instance and navigate to the administrative dashboard.
2.  **Go to AI Providers**: In the admin panel, find the configuration section and select **Config → AI Providers**.
3.  **Add API Keys**: Select your desired AI provider from the list (e.g., OpenAI, Anthropic, Google Gemini) and enter your API key. The credentials are encrypted and stored securely.

![Provider Configuration](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-hub/d037b6b6b092765ccbfa58706c241622.png)

## 3. Basic Usage

With providers configured, AIGNE Hub is ready to process AI requests. Applications can interact with the hub's unified API endpoint. Access is typically secured via OAuth or a generated API access key.

The following TypeScript example demonstrates how to invoke a chat model using the `@aigne/aigne-hub` client library.

```typescript
// Using AIGNE Framework with AIGNE Hub
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

// Configure the client to point to your AIGNE Hub instance
const model = new AIGNEHubChatModel({
  // The full URL to your AIGNE Hub's chat API endpoint
  url: "https://your-aigne-hub-url/api/v2/chat",

  // Your OAuth access key for authentication
  accessKey: "your-oauth-access-key",

  // Specify the provider and model to use, e.g., "openai/gpt-3.5-turbo"
  model: "openai/gpt-3.5-turbo",
});

// Send a request to the model
const result = await model.invoke({
  messages: "Hello, AIGNE Hub!",
});

console.log(result);
```

### Key Parameters:

*   `url`: The endpoint of your self-hosted AIGNE Hub instance.
*   `accessKey`: The security token obtained from AIGNE Hub's authentication system, granting the application permission to make API calls.
*   `model`: A string identifier specifying both the provider and the model (e.g., `provider/model-name`). AIGNE Hub routes the request to the corresponding provider based on this value.

## Next Steps

With the basic setup complete, you can now explore more advanced configurations based on your deployment scenario:

*   **For Enterprise Use**: Integrate the Hub with your internal applications and manage team access using its built-in user management and security features.
*   **For Service Providers**: If you plan to offer AIGNE Hub as a public service, the next step is to install the **Payment Kit** Blocklet, configure billing rates, and set up customer payment flows.