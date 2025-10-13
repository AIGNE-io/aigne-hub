# Security

AIGNE Hub is designed with enterprise-grade security as a foundational principle. By providing a centralized gateway for all AI interactions, it also introduces critical layers of security to protect your data, credentials, and operations. The platform's security strategy is built on three core pillars: complete data control through self-hosting, robust encryption for sensitive credentials, and granular access control for all interactions.

This section provides an overview of the key security measures implemented within AIGNE Hub. For detailed information on each aspect, please refer to the specific sub-sections.

<x-cards data-columns="3">
  <x-card data-title="Self-Hosted Data Control" data-icon="lucide:server" data-href="/security/data-control">
    Learn how deploying AIGNE Hub on your own infrastructure gives you complete control and privacy over your data and API credentials, eliminating third-party risk.
  </x-card>
  <x-card data-title="Credential Management" data-icon="lucide:key-round" data-href="/security/credential-management">
    Discover how the system protects provider API keys and other secrets using strong encryption at rest, ensuring sensitive information is never exposed.
  </x-card>
  <x-card data-title="Access Control" data-icon="lucide:shield-check" data-href="/security/access-control">
    Explore the multi-layered access control mechanisms, including role-based access for admins and mandatory authentication for all API and component calls.
  </x-card>
</x-cards>

## Core Security Features

AIGNE Hub's security model is comprehensive, addressing potential vulnerabilities at different layers of the system.

### Self-Hosted for Maximum Control
By deploying AIGNE Hub on your own infrastructure, you retain full ownership and control over your data. All API keys, usage logs, and sensitive information reside within your environment, significantly reducing the risk of third-party data exposure.

### Encrypted Credential Storage
All sensitive provider credentials, such as API keys and secret access keys, are encrypted at rest using the robust security modules from the Blocklet SDK. This ensures that even if the underlying database is compromised, your keys remain protected.

### Role-Based Access Control (RBAC)
Administrative functions and sensitive configurations are protected by a role-based access control system. Only users with designated roles, such as `owner` or `admin`, can manage AI providers, credentials, and system settings. This prevents unauthorized users from making critical changes.

### Authenticated API and Component Calls
Every API endpoint requires a valid Bearer token for authentication, ensuring that only authorized applications and users can interact with the AI gateway. Furthermore, internal component-to-component calls are cryptographically signed and verified to prevent tampering and ensure secure communication within the system.

## Summary

By combining self-hosted data sovereignty, strong credential encryption, and comprehensive access controls, AIGNE Hub provides a secure and trustworthy environment for managing your organization's AI operations. These features are designed to meet the rigorous security demands of enterprise environments, giving you the confidence to innovate with AI while maintaining strict governance and control.