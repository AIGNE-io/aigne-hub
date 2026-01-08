# Provider Management

Effective management of upstream AI providers is crucial for maintaining a reliable and cost-efficient AI gateway. AIGNE Hub centralizes this process, offering a unified interface to connect, configure, and manage credentials for various AI services. This section details the procedures for handling provider settings, credentials, and model rates.

The following diagram illustrates how Providers, Credentials, and Model Rates are interconnected within AIGNE Hub:

<!-- DIAGRAM_IMAGE_START:architecture:16:9 -->
![Provider Management](assets/diagram/provider-management-diagram-0.jpg)
<!-- DIAGRAM_IMAGE_END -->

## Provider Configuration

Providers are the foundational elements that connect AIGNE Hub to upstream AI services like OpenAI, Google, and AWS Bedrock. Proper configuration ensures that the hub can route requests to the appropriate service.

![Provider Configuration UI showing a list of configured AI providers like OpenAI, Google, and AWS Bedrock.](../../../blocklets/core/screenshots/6fff77ec3c1fbefb780b2b79c61a36f7.png)

### Add a Provider

To integrate a new AI service, you must add it as a provider. Each provider requires a unique name, a display name for the UI, and service-specific details like a `baseUrl` or `region`.

#### Request Body

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>The official name of the provider. Must be one of the supported provider values (e.g., `openai`, `google`, `bedrock`).</x-field-desc>
  </x-field>
  <x-field data-name="displayName" data-type="string" data-required="true">
    <x-field-desc markdown>A user-friendly name for the provider that will be displayed in the UI.</x-field-desc>
  </x-field>
  <x-field data-name="baseUrl" data-type="string" data-required="false">
    <x-field-desc markdown>The base URL for the provider's API endpoint. This is required for most providers but is optional for AWS Bedrock.</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>The AWS region for the Bedrock service. This is required only for the `bedrock` provider.</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-default="true" data-required="false">
    <x-field-desc markdown>Enables or disables the provider. A disabled provider will not be used for routing requests.</x-field-desc>
  </x-field>
</x-field-group>

### Update a Provider

You can modify an existing provider's configuration, such as its `baseUrl`, `region`, or `enabled` status.

#### Request Body

<x-field-group>
  <x-field data-name="baseUrl" data-type="string" data-required="false">
    <x-field-desc markdown>The updated base URL for the provider's API endpoint.</x-field-desc>
  </x-field>
  <x-field data-name="region" data-type="string" data-required="false">
    <x-field-desc markdown>The updated AWS region for the Bedrock service.</x-field-desc>
  </x-field>
  <x-field data-name="enabled" data-type="boolean" data-required="false">
    <x-field-desc markdown>The new status for the provider.</x-field-desc>
  </x-field>
</x-field-group>

### List and Delete Providers

You can retrieve a list of all configured providers or delete a specific provider by its ID. Deleting a provider will also remove all associated credentials and model rates.

## Credential Management

Credentials are used to authenticate with the upstream AI providers. AIGNE Hub encrypts and securely stores these credentials, associating them with a specific provider. Each provider can have multiple credentials, which allows for key rotation and load balancing.

### Add a Credential

When adding a credential, you must specify its type and value. AIGNE Hub automatically validates the credential against the provider's service to ensure it is active.

#### Request Body

<x-field-group>
  <x-field data-name="name" data-type="string" data-required="true">
    <x-field-desc markdown>A descriptive name for the credential (e.g., "Team A API Key").</x-field-desc>
  </x-field>
  <x-field data-name="credentialType" data-type="string" data-default="api_key" data-required="false">
    <x-field-desc markdown>The type of credential. Supported values are `api_key` and `access_key_pair`.</x-field-desc>
  </x-field>
  <x-field data-name="value" data-type="string or object" data-required="true">
    <x-field-desc markdown>The credential value. For `api_key`, this is a string. For `access_key_pair`, this is an object containing `access_key_id` and `secret_access_key`.</x-field-desc>
  </x-field>
</x-field-group>

### Credential Validation

AIGNE Hub includes an endpoint to check the validity of a stored credential. This action triggers a test connection to the provider using the specified credential to confirm it is active and has the necessary permissions.

### Update and Delete Credentials

Existing credentials can be updated with new values or deleted. When a credential is deleted, it is permanently removed from the system and can no longer be used for requests.

## Model Rate Management

Model rates define the cost of using specific AI models in AIGNE Hub credits. These rates are essential for systems operating in [Service Provider Mode](./deployment-scenarios-service-provider.md) where usage is billed based on credits.

![Model Rate Configuration UI showing a list of AI models with their associated costs.](../../../blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### Add a Model Rate

You can define rates for any model supported by a configured provider. This includes setting separate credit costs for input and output tokens (for text models) or per image/video (for generation models).

#### Request Body

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>The identifier for the model (e.g., `gpt-4o-mini`).</x-field-desc>
  </x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>The type of service. Supported values are `chatCompletion`, `imageGeneration`, `embedding`, and `video`.</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true">
    <x-field-desc markdown>An array of provider IDs to which this model rate applies. This allows a single model to be offered by multiple providers.</x-field-desc>
  </x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true">
    <x-field-desc markdown>The cost in credits for input (e.g., per 1,000 tokens).</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true">
    <x-field-desc markdown>The cost in credits for output (e.g., per 1,000 tokens).</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>The actual cost from the provider in USD per million units (tokens/images). Used for automatic rate calculation based on profit margins.</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="The input cost per million units."></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="The output cost per million units."></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false">
    <x-field-desc markdown>Additional metadata about the model's capabilities.</x-field-desc>
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="The maximum context window size."></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="An array of supported features, such as `tools` or `vision`. "></x-field>
  </x-field>
</x-field-group>

### Bulk Update Model Rates

To simplify pricing adjustments, AIGNE Hub supports bulk updates of model rates based on a defined profit margin and credit price. The system automatically recalculates the `inputRate` and `outputRate` for all models that have `unitCosts` defined.

The calculation is as follows:
`New Rate = (Unit Cost * (1 + Profit Margin / 100)) / Credit Price`

#### Request Body

<x-field-group>
  <x-field data-name="profitMargin" data-type="number" data-required="true">
    <x-field-desc markdown>The desired profit margin as a percentage (e.g., `20` for 20%).</x-field-desc>
  </x-field>
  <x-field data-name="creditPrice" data-type="number" data-required="true">
    <x-field-desc markdown>The price of a single credit in USD.</x-field-desc>
  </x-field>
</x-field-group>

### Update and Delete Model Rates

Individual model rates can be modified or removed. If a model rate is deleted, the corresponding model will no longer be available for users if credit-based billing is enabled.

## Summary

This section covered the core functionalities for managing AI providers, credentials, and model rates within AIGNE Hub. Proper configuration of these resources is essential for the security, reliability, and financial management of your AI services.

For more information on related topics, refer to the following sections:
<x-cards data-columns="2">
  <x-card data-title="Service Provider Mode" data-href="/deployment-scenarios/service-provider" data-icon="lucide:briefcase">Learn how to configure credit-based billing and custom pricing models.</x-card>
  <x-card data-title="Security and Access Control" data-href="/features/security" data-icon="lucide:shield">Understand the security architecture, including encrypted storage and access controls.</x-card>
</x-cards>