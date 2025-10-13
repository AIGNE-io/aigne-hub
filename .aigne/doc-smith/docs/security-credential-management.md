# Credential Management

In AIGNE Hub, securing your AI provider credentials is a top priority. As a self-hosted gateway, the system is designed to give you complete control over your sensitive data, including API keys and access tokens. This section details the robust security measures in place to protect these credentials.

## Encryption at Rest

To safeguard your provider API keys, AIGNE Hub employs strong encryption-at-rest. All sensitive credential values are encrypted using **AES (Advanced Encryption Standard)** before being persisted to the database. This ensures that even if the underlying database were to be compromised, the credentials would remain unreadable without the appropriate decryption key.

This core security function is handled by the `@blocklet/sdk` security module, which provides a standardized and reliable encryption process.

### What Gets Encrypted?

AIGNE Hub intelligently encrypts only the highly sensitive fields within a credential, balancing robust security with necessary functionality. This selective approach ensures that non-sensitive identifiers remain accessible while secret keys are fully protected.

- **Encrypted Fields**: `api_key`, `secret_access_key`
- **Plaintext Fields**: `access_key_id` (This is often a non-secret identifier and is safe to store in plaintext).

## Credential Security Lifecycle

The entire lifecycle of a credential, from storage to usage, is designed with security in mind. Decryption occurs only in memory and just-in-time when a request is made to an external AI provider.

The following diagram illustrates the flow:

```d2 Credential Security Lifecycle
direction: down

Admin-UI: { 
  label: "Admin UI"
  shape: rectangle 
}
AIGNE-Hub-Backend: { 
  label: "AIGNE Hub Backend"
  shape: rectangle 
}
Database: { 
  label: "Database (SQLite)"
  shape: cylinder 
}
External-AI-Provider: { 
  label: "External AI Provider"
  shape: rectangle 
}

subgraph_storage: {
  label: "Storage Flow"
  Admin-UI -> AIGNE-Hub-Backend: "1. Submit API Key"
  AIGNE-Hub-Backend -> AIGNE-Hub-Backend: "2. Encrypt sensitive fields\n(e.g., api_key) with AES"
  AIGNE-Hub-Backend -> Database: "3. Store encrypted credential"
}

subgraph_usage: {
  label: "Usage Flow"
  AIGNE-Hub-Backend -> Database: "4. Retrieve encrypted credential"
  AIGNE-Hub-Backend -> AIGNE-Hub-Backend: "5. Decrypt credential in-memory"
  AIGNE-Hub-Backend -> External-AI-Provider: "6. Make API call with plaintext key"
}

```

## Secure Display with Masking

To prevent the accidental exposure of full credentials in the administrative interface, AIGNE Hub automatically masks sensitive values when they are displayed. A long API key is typically shown with only its first and last few characters visible, hiding the middle portion.

For example, an API key like `sk-abc123def456ghi789jkl` will be displayed as `sk-a...89jkl`.

This simple yet effective measure protects keys from being copied from the screen, exposed in screenshots, or compromised through shoulder surfing.

## Summary

AIGNE Hub's credential management system provides multiple layers of security to protect your most critical assets. By combining AES encryption for data at rest, just-in-time in-memory decryption for data in use, and masking for data on display, the system ensures that your AI provider credentials are handled securely throughout their lifecycle.

For more information on related security topics, please see:
- [Self-Hosted Data Control](./security-data-control.md)
- [Access Control](./security-access-control.md)
