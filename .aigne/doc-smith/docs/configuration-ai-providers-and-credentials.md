# AI Providers and Credentials

Properly configuring AI providers and their credentials is the foundational step to making AIGNE Hub operational. This section guides you through adding and managing connections to various AI services via the administrative interface. Each provider entry, combined with valid credentials, enables the Hub to route API requests to the corresponding AI models.

## Managing AI Providers

A provider represents a specific AI service you want to integrate with, such as OpenAI, Google Gemini, or AWS Bedrock. You must configure at least one provider for the Hub to function.

### Adding a New Provider

To connect a new AI service, you need to add it as a provider in the admin dashboard. This involves specifying its type and connection details.

1.  Navigate to the **Providers** section in the admin interface.
2.  Click on the **Add Provider** button.
3.  Fill in the provider's configuration details in the dialog box.

![Adding a new AI Provider](https://d037b6b6b092765ccbfa58706c241622.png)

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>The type of the AI provider. This must be one of the supported values from the dropdown list (e.g., `openai`, `gemini`, `bedrock`).</x-field-desc>
  </x-field>
  <x-field data-name="displayName" data-type="string" data-required="true">
    <x-field-desc markdown>A user-friendly name for this provider instance (e.g., `OpenAI-ProjectX`, `AWS-US-East-Bedrock`).</x-field-desc>
  </x-field>
  <x-field data-name="baseUrl" data-type="string" data-required="true">
    <x-field-desc markdown>The base URL for the provider's API endpoint. For `bedrock`, this field is optional.</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>The specific cloud region for the provider, primarily required for services like AWS Bedrock.</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-default="true" data-required="false">
    <x-field-desc markdown>Toggles the provider's status. If disabled, the Hub will not use this provider to serve requests.</x-field-desc>
  </x-field>
</x-field-group>

### Updating and Deleting Providers

Once a provider is added, you can manage it from the provider list. The list displays all configured providers and their status.

![List of configured AI Providers](https://c29f08420df8ea9a199fcb5ffe06febe.png)

-   **To Update**: Click the edit icon next to a provider to modify its `displayName`, `baseUrl`, `region`, or `enabled` status.
-   **To Delete**: Click the delete icon. Note that deleting a provider will also remove all associated credentials and model rate configurations.

## Managing Credentials

Credentials are the authentication keys required to access a provider's API. Each provider must have at least one active and valid credential.

### Adding Credentials

After creating a provider, you must add one or more credentials to it.

1.  In the provider list, find the desired provider and click on its management options.
2.  Select the option to add a new credential.
3.  Enter the credential details.

![Adding a new credential](https://fc46e9461382f0be7541af17ef13f632.png)

Upon submission, the system performs a validation check to ensure the credential is valid and can connect to the provider's service. Invalid credentials will be rejected.

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true" data-desc="A descriptive name for the credential (e.g., `Team-A-Key`)."></x-field>
  <x-field data-name="credentialType" data-type="string" data-default="api_key" data-required="true">
    <x-field-desc markdown>The type of credential. Supported types are:
- `api_key`: A single secret key (most common).
- `access_key_pair`: An ID/secret pair, used by services like AWS.</x-field-desc>
  </x-field>
  <x-field data-name="value" data-type="string or object" data-required="true">
    <x-field-desc markdown>The credential value(s). This will be a single string for an `api_key` or an object with `access_key_id` and `secret_access_key` for an `access_key_pair`.</x-field-desc>
  </x-field>
</x-field-group>

### Credential Security

AIGNE Hub ensures that all sensitive credential information is stored securely. 

-   **Encryption at Rest**: All secret keys (`api_key`, `secret_access_key`) are encrypted using AES before being stored in the database.
-   **Value Masking**: When credentials are displayed in the admin interface, their values are masked to prevent accidental exposure. For example, an API key `sk-abc...xyz` will be shown as `sk-a...xyz`.

### Load Balancing

If you add multiple credentials to a single provider, AIGNE Hub automatically performs load balancing across them. It uses a weighted round-robin algorithm to distribute requests, selecting the least recently used, active credential. This strategy enhances both reliability and throughput.

### Checking Credential Status

You can manually trigger a health check on any credential from the admin interface. This action re-validates the key against the provider's API and updates its `active` status. If a credential check fails, it will be marked as inactive and temporarily removed from the load-balancing pool until it is updated and passes a check.

## Summary

Configuring providers and their credentials is the essential first step in setting up AIGNE Hub. A correct setup ensures that the gateway can securely and reliably connect to your chosen AI services. Once your providers are configured, you can proceed to set up model-specific pricing.

For the next step, see how to configure the [Credit-Based Billing](./configuration-credit-based-billing.md) system.