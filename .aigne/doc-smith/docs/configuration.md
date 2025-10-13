# Configuration

After successfully deploying AIGNE Hub, the next critical step is to configure it. This process involves connecting the Hub to your chosen AI providers and, optionally, setting up the credit-based billing system for usage tracking and monetization. Proper configuration is essential for the Hub to function as a secure and efficient gateway for all AI model interactions.

This section provides an overview of the primary configuration areas. For detailed instructions, please refer to the specific sub-documents linked below.

![AIGNE Hub Provider Configuration](https://arcblock.oss-cn-shanghai.aliyuncs.com/images/doc-platform/c29f08420df8ea9a199fcb5ffe06febe.png)

## Core Configuration Areas

AIGNE Hub's configuration is managed through its administrative interface and is divided into two main categories:

<x-cards>
  <x-card data-title="AI Providers and Credentials" data-icon="lucide:plug-zap" data-href="./configuration/ai-providers-and-credentials">
    This is the foundational step where you connect AIGNE Hub to external AI services like OpenAI, Anthropic, or Google Gemini. It involves adding provider details and securely managing the associated API keys, which are encrypted at rest to protect sensitive information.
  </x-card>
  <x-card data-title="Credit-Based Billing" data-icon="lucide:coins" data-href="./configuration/credit-based-billing">
    Enable this optional feature to track and charge for AI model usage. You can define custom rates for each model in a unified currency—AIGNE Hub Credits. This is ideal for monetizing services, internal cost allocation, or enforcing usage quotas.
  </x-card>
</x-cards>

## Summary

Configuring AI providers and their credentials is a mandatory step to make AIGNE Hub operational. Once providers are set up, the Hub can immediately begin proxying API requests. Enabling the credit-based billing system adds a powerful layer of financial control and usage management, transforming the Hub into a full-fledged, monetizable AI gateway.

After completing the configuration, you can proceed to learn about day-to-day management in the [Operational Guides](./operational-guides.md) or start integrating your applications using the [API Reference](./api-reference.md).