# Deployment Scenarios

Choosing the right deployment model is crucial for aligning AIGNE Hub with your specific operational and business objectives. This document outlines the two primary deployment scenarios available, providing a clear comparison to guide your architectural decisions. Each mode is designed to address distinct use cases, from internal corporate use to public-facing commercial services.

AIGNE Hub offers the flexibility to be deployed in one of two primary modes: as a self-hosted gateway for internal enterprise use or as a multi-tenant service provider platform with a built-in credit and billing system. The selected mode dictates the configuration for billing, user management, and security.

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Deployment Scenarios](assets/diagram/deployment-scenarios-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

The following sections provide an overview of each deployment scenario. For detailed configuration instructions, please refer to the specific sub-documents.

## Deployment Models

AIGNE Hub supports two distinct operational modes, each tailored to different organizational needs. Below is a summary of each model and its intended use case.

<x-cards data-columns="2">
  <x-card data-title="Enterprise Self-Hosting" data-icon="lucide:building-2" data-href="/deployment-scenarios/enterprise-self-hosting">
    Deploy AIGNE Hub within your own infrastructure as a centralized gateway for internal teams. This model provides maximum control over data and security, with billing handled directly between your organization and the upstream AI providers.
  </x-card>
  <x-card data-title="Service Provider Mode" data-icon="lucide:store" data-href="/deployment-scenarios/service-provider">
    Configure AIGNE Hub to function as a public-facing, monetized AI service. This mode enables a credit-based billing system, allowing you to set custom pricing, manage user subscriptions, and generate revenue from AI services.
  </x-card>
</x-cards>

## Summary

This document has introduced the two primary deployment scenarios for AIGNE Hub. The Enterprise Self-Hosting model is ideal for internal use, prioritizing security and direct billing. In contrast, the Service Provider mode is designed for public-facing services that require multi-tenancy and monetization.

For detailed implementation guides, please proceed to the relevant sections:
- **[Enterprise Self-Hosting](./deployment-scenarios-enterprise-self-hosting.md)**
- **[Service Provider Mode](./deployment-scenarios-service-provider.md)**