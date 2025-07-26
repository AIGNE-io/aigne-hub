# AIGNE Hub

[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Blocklet](https://img.shields.io/badge/blocklet-ready-orange.svg)](https://store.blocklet.dev)
[![AIGNE Framework](https://img.shields.io/badge/AIGNE-framework-purple.svg)](https://www.aigne.io/framework)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**The Unified AI Gateway for the AIGNE Ecosystem**

_Formerly AI Kit - Now evolved into the comprehensive AIGNE Hub_

## Overview

AIGNE Hub is a unified AI gateway that manages connections to multiple LLM and AIGC providers, eliminating the complexity of handling API keys, usage tracking, and billing across different AI services. Built as a [Blocklet](https://blocklet.io) using the AIGNE framework, it evolved from our AI Kit project to become the backbone of the entire AIGNE ecosystem.

Whether you're building applications with the AIGNE framework, using AIGNE Studio, or developing with the AIGNE CLI, AIGNE Hub seamlessly provides unified AI capabilities behind the scenes.

### Key Benefits

- **🏠 Self-Hosting Ready**: Deploy your own instance for complete control and privacy
- **🔌 Multi-Provider Management**: Connect to 8+ AI providers through one interface
- **🔐 Unified Security**: Encrypted API key storage with fine-grained access controls
- **📊 Usage Analytics**: Comprehensive tracking and cost analysis
- **💰 Flexible Billing**: Run internally or offer as a service with built-in credit system
- **⚡ Seamless Integration**: Works out-of-the-box with AIGNE framework applications

## Supported AI Providers

- **OpenAI** - GPT models, DALL-E, Embeddings
- **Anthropic** - Claude models
- **Amazon Bedrock** - AWS hosted models
- **Google Gemini** - Gemini Pro, Vision
- **DeepSeek** - Advanced reasoning models
- **Ollama** - Local model deployment
- **OpenRouter** - Access to multiple providers
- **xAI** - Grok models
- _And more providers being added..._

## Deployment Scenarios

### 🏢 Enterprise Self-Hosting

Perfect for internal teams and organizations requiring data control:

- Deploy within your infrastructure
- No external billing - pay providers directly
- Keep all data within your security perimeter
- Ideal for corporate AI initiatives and development teams

### 🚀 Service Provider Mode

Turn AIGNE Hub into a customer-facing AI service:

- Enable credit billing with Payment Kit integration
- Set custom pricing and profit margins
- Automatic user onboarding with starter credits
- Comprehensive billing and usage management
- Perfect for AI service providers and SaaS platforms

## Quick Start

### Installation

1. **Deploy on Blocklet Server**:

   - Visit [Blocklet Store](https://store.blocklet.dev) and search for "AIGNE Hub"
   - Click "Launch" and follow the installation wizard

2. **Configure AI Providers**:
   - Access admin panel → **Config → AI Providers**
   - Add your API keys for desired providers

### For Internal Use

3. **Start Using**: Your AIGNE Hub is ready for team usage with OAuth or direct API access

### For Service Provider

3. **Enable Billing**: Install Payment Kit, configure rates, and set up customer flows

### Basic Usage

```typescript
// Using AIGNE Framework with AIGNE Hub
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

## Features

### Core Capabilities

- **Chat Completions**: Conversational AI and text generation
- **Image Generation**: AI-powered image creation and editing
- **Embeddings**: Vector representations for semantic search
- **Built-in Playground**: Test models in real-time
- **RESTful APIs**: Standard HTTP endpoints for integration

### Billing & Analytics

- **Credit-Based Billing**: Flexible usage-based payments
- **Custom Pricing**: Set your own rates and profit margins
- **Usage Tracking**: Detailed consumption analytics
- **Cost Analysis**: Track spending across providers and models
- **Payment Integration**: Seamless credit purchases through Payment Kit

### Security & Management

- **OAuth Integration**: Secure application access
- **API Key Management**: Encrypted storage with access controls
- **User Management**: Role-based permissions and access
- **Audit Logging**: Complete usage and access history

## Technical Architecture

Built with modern technologies for reliability and performance:

- **AIGNE Framework**: Latest version with enhanced integration
- **Node.js & TypeScript**: Robust backend with full type safety
- **React 19**: Modern frontend with latest React features
- **SQLite**: Local data storage with Sequelize ORM
- **Blocklet**: Cloud-native deployment and scaling

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:

- Development setup and workflow
- Code style and testing requirements
- Adding new AI providers
- Submitting pull requests

## Support & Community

- **Documentation**: [AIGNE Hub Docs](https://www.arcblock.io/docs)
- **Community**: [ArcBlock Community](https://community.arcblock.io)
- **Issues**: [GitHub Issues](https://github.com/blocklet/aigne-hub/issues)

## License

AIGNE Hub is part of the ArcBlock ecosystem. Please refer to our license terms for usage and distribution guidelines.

---

**Transform your AI development workflow with AIGNE Hub - the central nervous system for all your generative AI needs.**
