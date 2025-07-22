# AIGNE Hub

AIGNE Hub is a blocklet that brings AI capabilities to other blocklets. With AIGNE Hub, developers can easily incorporate AI into their projects and create powerful applications.

## Supported AI Providers

- **openai** - OpenAI GPT models, DALL-E, Embeddings
- **anthropic** - Anthropic Claude models 
- **bedrock** - Amazon Bedrock hosted models
- **deepseek** - DeepSeek models
- **google** - Google Gemini models
- **ollama** - Local model deployment
- **openrouter** - Multi-provider access
- **xai** - xAI Grok models

## Features

- **Multi-AI Provider Support**: OpenAI, Anthropic, Amazon Bedrock, DeepSeek, Google, Ollama, OpenRouter, xAI
- **OAuth Integration**: Secure OAuth-based access for calling AI capabilities
- **Credit Billing System**: Integrated with Payment Kit for credit-based billing and usage tracking
- **Provider Credential Management**: Support for API Key, Access Key Pair
- **Model Rate Configuration**: Flexible pricing for Chat, Image Generation, and Embedding models
- **Built-in Playground**: Real-time AI model testing and experimentation
- **AIGNE Framework Integration**: Support for AIGNE CLI to call models through AIGNE Hub locally
- **Usage Analytics**: Monitor AI service usage, costs, and performance metrics via Observability component
- **Auto Credit Grant**: Automatic credit allocation for new users on first login

## Core Capabilities

- **Chat Completions**: Conversational AI and text generation with streaming support
- **Image Generation**: AI-powered image creation and editing (DALL-E, Midjourney-style)
- **Embeddings**: Vector representations for semantic search and RAG applications
- **Built-in Playground**: Real-time model testing with conversation history
- **RESTful APIs**: OpenAI-compatible endpoints for easy migration

## Install and Run

- Click the Launch button
- You need to purchase a Blocklet Server first (if you don't already have one)
- Follow the installation wizard to install blocklet on your Blocklet Server
- Start the installed blocklet in the Blocklet Server console
- Configure AI providers in **Blocklets -> AIGNE Hub -> Config → AI Config → AI Providers**
- Access the public address of the blocklet, you can open playground from apps menu

## Credit Billing Configuration (Optional)

To enable credit-based billing and usage management:

1. **Install Payment Kit Component**

2. **Enable Credit Billing in AIGNE Hub**
   - Go to **Blocklets → AIGNE Hub → Preferences**
   - Enable "Credit Based Billing" option
   - Configure base credit price and target profit margin (optional)
   - Set new user credit grant amount (optional)

3. **Configure Model Rates**
   - Access AIGNE Hub → Config → AI Config → Model Rates
   - Set pricing for different model types and providers
   - Configure input/output token rates

4. **View Usage and Billing**
   - Credit consumption history is available in Payment Kit billing interface
   - Users receive purchase prompts when credits are insufficient

## Security & Management

- **Encrypted Storage**: API keys stored with AES-256 encryption
- **Access Control**: Role-based permissions for different user types
- **Usage Quotas**: Set limits per user or application
- **Audit Logging**: Complete request and response logging
- **IP Restrictions**: Whitelist/blacklist IP addresses for API access

## OAuth Integration

AIGNE Hub supports OAuth-based integration for secure AI capability access.

### Chat Completions (Recommended)

```ts
// Using AIGNE Framework with AIGNE Hub
import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  url: "https://your-aigne-hub-url/api/v2/chat",
  accessKey: "your-oauth-access-key", 
  model: "openai/gpt-3.5-turbo",
});

const result = await model.invoke({
  messages: [{ role: "user", content: "Hello, AIGNE Hub!" }],
});

console.log(result);
```

## API Endpoints

### Chat Completions
```
POST /api/v2/chat
Content-Type: application/json
Authorization: Bearer your-access-token
```

### Image Generation
```
POST /api/v2/images/generate
Content-Type: application/json
Authorization: Bearer your-access-token
```

### Embeddings
```
POST /api/v2/embeddings
Content-Type: application/json
Authorization: Bearer your-access-token
```

## Credit Billing

AIGNE Hub integrates with Payment Kit to provide flexible credit-based billing:

- **Automatic Credit Grant**: New users receive initial credits upon first login
- **Usage Tracking**: All AI API calls consume credits based on configured rates
- **Payment Integration**: Users can purchase additional credits when needed
- **Billing History**: View detailed credit transactions in Payment Kit interface
- **Model-specific Rates**: Different pricing for various AI models and capabilities

## Troubleshooting

### Common Issues

- **API Key Invalid**: Verify your provider credentials in Config → AI Providers
- **Insufficient Credits**: Check credit balance in billing section
- **Model Not Available**: Ensure the selected model is supported by your provider
- **Rate Limiting**: Check provider rate limits and upgrade if necessary

### Performance Optimization

- **Response Caching**: Enable caching for repeated requests
- **Load Balancing**: Configure multiple API keys for the same provider
- **Monitoring**: Use built-in analytics to track performance metrics

## Support

If you have any questions or need help getting started, please feel free to provide feedback in our [community](https://community.arcblock.io/discussions/boards/aigne). We are happy to help!
