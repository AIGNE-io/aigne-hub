# Security & Access

A secure and well-managed system is critical for any enterprise-grade deployment. This section details the robust security architecture of AIGNE Hub, covering authentication, credential management, access control, and logging to ensure the integrity and confidentiality of your AI operations.

The following diagram provides a high-level overview of the security layers and components within AIGNE Hub:

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Security & Access](assets/diagram/security-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

## Authentication

AIGNE Hub integrates with Blocklet Server's standard authentication mechanisms, providing a secure and unified login experience. The primary method of authentication is through DID Connect, which leverages decentralized identity for passwordless and secure access.

### DID Connect Integration

All user authentication is handled by the underlying Blocklet Server environment. When a user logs into AIGNE Hub, they are authenticated via the DID Connect wallet authenticator, ensuring that access is tied to a verified decentralized identity. This approach eliminates the need for traditional username/password combinations, reducing the risk of credential theft.

The system uses an authentication storage database (`auth.db`) to manage session tokens securely.

For details on how to authenticate programmatic API requests to AIGNE Hub, please see the [API Authentication](./api-reference-authentication.md) documentation.

## Encrypted Credential Storage

Storing API keys and other sensitive credentials from upstream AI providers is a critical security concern. AIGNE Hub addresses this by implementing strong, field-level encryption for all sensitive credential data.

### Encryption Mechanism

When you add a provider's credentials (like an API key or a secret access key), the sensitive parts of the credential are encrypted before being stored in the database.

-   **Encryption Target**: Only sensitive fields are encrypted. For example, in an `access_key_pair`, the `secret_access_key` is encrypted, while the `access_key_id` remains in plaintext for identification purposes. Standalone `api_key` values are always encrypted.
-   **Technology**: Encryption and decryption operations are handled by the `@blocklet/sdk/lib/security` module, which provides robust cryptographic functions.

The following code snippet from the `AiCredential` model illustrates the process:

```typescript ai-credential.ts icon=lucide:file-code
// Encrypt credential value (only encrypts sensitive fields)
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };

  // Encrypt sensitive fields
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }

  // access_key_id remains plaintext
  return encrypted;
}

// Decrypt credential value
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };

  // Decrypt sensitive fields
  if (encryptedCredential.secret_access_key) {
    decrypted.secret_access_key = security.decrypt(encryptedCredential.secret_access_key);
  }
  if (encryptedCredential.api_key) {
    decrypted.api_key = security.decrypt(encryptedCredential.api_key);
  }

  return decrypted;
}
```

### Credential Masking

To prevent accidental exposure of sensitive keys in the user interface, AIGNE Hub automatically masks credential values. Only the first four and last four characters of a key are displayed, with the rest replaced by asterisks.

## Role-Based Access Control (RBAC)

AIGNE Hub employs a simple yet effective Role-Based Access Control (RBAC) model to restrict access to administrative functions. The roles are inherited from the Blocklet Server environment.

### Available Roles

| Role    | Permissions                                                                                                                              |
| :------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `owner` | Full administrative access to the AIGNE Hub instance. Can manage providers, configure billing, view analytics, and manage all settings.   |
| `admin` | Same permissions as the `owner`. This role is also considered a privileged user with full access to administrative functions.             |
| `guest` | Standard user role. Can use the AI services provided by the Hub (e.g., Playground, API access) but cannot access the admin configuration. |

Access to critical administrative API endpoints is protected by a middleware that verifies the user's role, ensuring that only users with `owner` or `admin` roles can perform management tasks.

```typescript security.ts icon=lucide:shield
import { auth } from '@blocklet/sdk/lib/middlewares';

// Middleware to ensure the user has 'owner' or 'admin' role
export const ensureAdmin = auth({ roles: ['owner', 'admin'] });
```

## Audit Logging

Comprehensive audit logging is essential for security analysis, troubleshooting, and compliance. AIGNE Hub maintains detailed logs of all significant activities within the system.

### Logged Activities

-   **API Requests**: All incoming requests to the AI endpoints are logged, including the user, model requested, and usage metrics.
-   **Administrative Actions**: Actions performed in the admin panel, such as adding or updating a provider, changing model rates, or modifying configurations, are recorded.
-   **Credential Management**: Events related to the creation, modification, or deletion of provider credentials.

These logs provide a complete history of usage and administrative changes, which is invaluable for security audits and operational monitoring.

## Summary

AIGNE Hub is designed with a multi-layered security model to protect your AI gateway. By combining DID-based authentication, strong encryption for credentials, role-based access control, and detailed audit logs, it provides a secure foundation for both internal enterprise use and public-facing services.

For more information on related features, please refer to the following sections:

<x-cards data-columns="2">
  <x-card data-title="Provider Management" data-href="/features/provider-management" data-icon="lucide:server">Learn how to connect and configure upstream AI providers.</x-card>
  <x-card data-title="Usage & Cost Analytics" data-href="/features/analytics" data-icon="lucide:pie-chart">Explore how to monitor system-wide and per-user consumption.</x-card>
</x-cards>