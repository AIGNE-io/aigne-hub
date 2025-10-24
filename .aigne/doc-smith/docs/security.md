# Security

AIGNE Hub is designed with security as a core principle, providing robust mechanisms for authentication, authorization, and data protection. This document outlines the key security features and architecture, offering insights for deployment, operations, and maintenance.

## Authentication

AIGNE Hub employs a multi-layered authentication strategy to secure access for users, applications, and internal components.

### DID-Connect for User Authentication

The primary mechanism for user authentication is `@arcblock/did-connect`, a decentralized identity solution. This approach leverages a wallet-based system, allowing users to authenticate without traditional passwords.

- **Storage**: Authentication tokens are managed by `did-connect-storage-nedb`, which stores session data in a local NeDB database file located at `Config.dataDir/auth.db`.
- **Handlers**: The `WalletAuthenticator` and `WalletHandler` classes from the Blocklet SDK manage the authentication flow, including challenge generation, response verification, and token issuance.

### Component-to-Component Authentication

Internal services and components within the Blocklet architecture communicate securely using a signature verification mechanism.

- **Verification**: The `ensureComponentCall` middleware intercepts requests between components. It uses `getVerifyData` and `verify` from the Blocklet SDK to check the validity of a request's signature (`sig`).
- **Flow**: A component making a request signs the payload, and the receiving component verifies this signature before processing the request. This prevents unauthorized or tampered internal API calls.

```typescript
// blocklets/core/api/src/libs/security.ts

import { getVerifyData, verify } from '@blocklet/sdk/lib/util/verify-sign';

export function ensureComponentCall(fallback?: (req, res, next) => any) {
  return (req, res, next) => {
    try {
      const { data, sig } = getVerifyData(req);
      const verified = verify(data, sig);
      if (!verified) throw new CustomError(401, 'verify sig failed');
      next();
    } catch (error) {
      // Handle fallback or throw error
    }
  };
}
```

## Authorization

Access control is managed through a role-based system, ensuring that users and services only have permission to perform actions they are authorized for.

### Role-Based Access Control (RBAC)

AIGNE Hub defines specific roles, primarily `owner` and `admin`, which are used to protect sensitive endpoints and operations.

- **Middleware**: The `ensureAdmin` middleware is a practical implementation of this RBAC. It is applied to routes that require administrative privileges, automatically rejecting requests from users who do not hold the 'owner' or 'admin' role.

```typescript
// blocklets/core/api/src/libs/security.ts

import { auth } from '@blocklet/sdk/lib/middlewares';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });

// Example Usage (conceptual)
// import { ensureAdmin } from './libs/security';
// app.use('/api/admin', ensureAdmin, adminRoutes);
```

This ensures that critical administrative functions, such as managing AI providers or viewing system-wide analytics, are restricted to authorized personnel.

## Credential Management

A central feature of AIGNE Hub is its ability to securely manage credentials for various downstream AI providers.

### Secure Storage and Encryption

Sensitive credentials, such as API keys and access tokens, are always encrypted at rest to prevent unauthorized access.

- **Encryption Module**: The system utilizes the `@blocklet/sdk/lib/security` module for cryptographic operations.
- **Process**: When an AI provider credential is created or updated, sensitive fields like `api_key` and `secret_access_key` are passed through the `security.encrypt` function before being stored in the database. When the credential is needed to make an API call, it is retrieved and decrypted in memory using `security.decrypt`.
- **Data Model**: The `AiCredential` model explicitly defines which fields are sensitive. Non-sensitive identifiers like `access_key_id` are kept in plaintext to facilitate management and display.

```typescript
// blocklets/core/api/src/store/models/ai-credential.ts

// Encrypts sensitive fields before saving
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }
  return encrypted;
}

// Decrypts sensitive fields for use
static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
  const decrypted: CredentialValue = { ...encryptedCredential };
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

To prevent accidental exposure in user interfaces, logs, or API responses, sensitive portions of credentials are masked. The `maskCredentialValue` function displays only the first 4 and last 4 characters of a key, obscuring the rest with asterisks.

### Load Balancing and High Availability

AIGNE Hub supports adding multiple credentials for a single AI provider. This enables both load balancing and high availability.

- **Algorithm**: A smooth weighted round-robin algorithm is used to select the next available credential for a request. Each credential has a `weight` (defaulting to 100), and the system dynamically adjusts a `current` weight to determine which key to use next.
- **Resilience**: This mechanism distributes the load across multiple keys, helping to avoid rate limits and providing resilience. If one key is compromised or disabled, the system can automatically fall back to other active keys for the same provider.
- **Implementation**: The `getNextAvailableCredential` static method on the `AiCredential` model contains the logic for this selection process. It queries for all active credentials for a given `providerId` and applies the weighted selection logic.