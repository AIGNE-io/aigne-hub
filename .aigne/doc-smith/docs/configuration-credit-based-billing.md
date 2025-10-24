# Credit-Based Billing

AIGNE Hub includes an optional, robust credit-based billing system designed to provide granular control over AI model usage and costs. When enabled, this system allows operators to define specific credit rates for various AI models, track consumption per user, and integrate with a payment system for recharging credits. This approach shifts from a direct pass-through of provider costs to a managed, internal economy, enabling consistent pricing, cost abstraction, and potential profitability.

This guide details the process for enabling and configuring the credit-based billing system, including how to set specific usage rates for different AI models and manage user credits.

For information on managing the AI providers that these models belong to, please see the [AI Providers and Credentials](./configuration-ai-providers-and-credentials.md) documentation.

## Enabling Credit-Based Billing

The credit-based billing system is disabled by default. To activate it, you must set the `CREDIT_BASED_BILLING_ENABLED` environment variable to `true` in your AIGNE Hub configuration. Once enabled, the system will begin enforcing credit checks for all API calls and tracking usage against user balances.

When this mode is active, only models with explicitly defined rates in the "Model Rates" configuration will be available for use through the API.

## Configuring Model Rates

Model rates are the cornerstone of the credit-based billing system. A rate defines how many credits are consumed for using a specific AI model. Rates are typically defined based on input (e.g., prompt tokens) and output (e.g., completion tokens or generated images).

You can configure these rates through the administrative dashboard under **AI Config > Model Rates**.

![This screenshot depicts the "Model Rates" configuration page within the AIGNE Hub's AI Config section, providing an overview of how users manage AI model pricing. It showcases a detailed table listing various AI models like ChatGPT and Claude, their providers, content types (Image, Text), and associated input and output pricing rates. The interface allows for editing, deleting, and adding new model rates, offering comprehensive administrative control over AI service costs.](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/8014a0b1d561114d9948214c4929d5df.png)

### Adding a Model Rate

To add a new rate, click the "Add Model Rate" button and provide the necessary details. You can create a rate for a specific model across multiple providers simultaneously.

![This screenshot depicts the "AIGNE / Hub" platform's user interface, specifically focusing on AI model rate configuration. A prominent "Add Model Rate" modal window is open on the right, displaying input fields for model name, rate type, providers, model cost, AIGNE Hub credit rate configuration, description, and advanced options. In the background, a list of existing AI models like ChatGPT, Claude, and Gemini, along with their providers and types, is visible under the "Model Rates" section of the "Config" page.](https://raw.githubusercontent.com/blocklet/aigne/main/blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

The following parameters are required to define a model rate:

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The exact name of the model as recognized by the provider (e.g., gpt-4o, claude-3-opus-20240229)."></x-field>
  <x-field data-name="modelDisplay" data-type="string" data-required="false" data-desc="A user-friendly name for the model that will be displayed in user interfaces. If left empty, a formatted name is generated from the model ID."></x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>The type of AI task. This determines which rate is applied. Possible values are `chatCompletion`, `imageGeneration`, or `embedding`.</x-field-desc>
  </x-field>
  <x-field data-name="providers" data-type="array" data-required="true" data-desc="An array of provider IDs to which this rate will apply. This allows a single model available on multiple platforms to share a rate."></x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>The number of credits charged per input unit (e.g., per 1,000 prompt tokens). For `imageGeneration`, this is typically `0`.</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true" data-default="0">
    <x-field-desc markdown>The number of credits charged per output unit (e.g., per 1,000 completion tokens or per generated image).</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>The actual cost from the AI provider, typically in USD per million tokens. This is used for automated rate calculation and is not charged to the user directly.</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="The provider's cost for input units."></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="The provider's cost for output units."></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false" data-desc="Additional metadata about the model's capabilities.">
    <x-field data-name="maxTokens" data-type="number" data-required="false" data-desc="The maximum number of tokens the model can process in a single context."></x-field>
    <x-field data-name="features" data-type="array" data-required="false" data-desc="A list of special features the model supports, such as `tools`, `thinking`, or `vision`."></x-field>
    <x-field data-name="imageGeneration" data-type="object" data-required="false" data-desc="Specifics for image generation models.">
      <x-field data-name="max" data-type="number" data-required="false" data-desc="Maximum number of images per request."></x-field>
      <x-field data-name="quality" data-type="array" data-required="false" data-desc="Supported image quality options (e.g., ['standard', 'hd'])."></x-field>
      <x-field data-name="size" data-type="array" data-required="false" data-desc="Supported image sizes (e.g., ['1024x1024', '1792x1024'])."></x-field>
      <x-field data-name="style" data-type="array" data-required="false" data-desc="Supported image styles (e.g., ['vivid', 'natural'])."></x-field>
    </x-field>
  </x-field>
</x-field-group>

## Bulk Rate Updates

To simplify rate management, AIGNE Hub provides a mechanism for bulk-updating all model rates based on your underlying costs and desired profit margin. This is particularly useful when a provider changes its pricing or when you want to adjust your credit pricing structure.

This feature uses the `unitCosts` defined for each model and applies a simple formula to calculate the new `inputRate` and `outputRate`:

```
Rate = (UnitCost * (1 + ProfitMargin / 100)) / CreditPrice
```

Where:
*   `UnitCost`: The raw cost from the provider (e.g., USD per 1M tokens).
*   `ProfitMargin`: A percentage you define.
*   `CreditPrice`: The price at which you sell one credit to users.

This calculation is performed for both input and output rates for every model that has `unitCosts` defined.

## User Credit Management

When billing is enabled, every user has a credit balance. AIGNE Hub integrates with a payment component to manage these balances.

### New User Credit Grant

You can configure AIGNE Hub to automatically grant a starting balance to new users. This encourages trial and adoption. The following environment variables control this feature:

*   `NEW_USER_CREDIT_GRANT_ENABLED`: Set to `true` to enable the grant.
*   `NEW_USER_CREDIT_GRANT_AMOUNT`: The number of credits to grant to each new user.
*   `CREDIT_EXPIRATION_DAYS`: The number of days after which the promotional credits expire. Set to `0` for no expiration.

### Purchasing Credits

Users can add to their balance by purchasing credits. The system can be configured with a payment link that directs users to a checkout page. By default, AIGNE Hub attempts to create and manage a payment link through the integrated PaymentKit blocklet, but a custom URL can also be specified via the `CREDIT_PAYMENT_LINK` environment variable.

## Usage Tracking and Metering

With every API call, AIGNE Hub performs a series of steps to ensure accurate credit consumption and reporting. The process is designed to be resilient and efficient, batching small charges to reduce overhead.

The workflow is as follows:

1.  **Verifies User Balance**: It checks if the user has a sufficient credit balance. If the balance is zero or less, the request is rejected with a `402 Payment Required` error.
2.  **Calculates Cost**: After the AI provider successfully processes the request, AIGNE Hub calculates the cost in credits by multiplying the prompt and completion tokens (or image count) by the configured `inputRate` and `outputRate`.
3.  **Records Usage**: A usage record is created in the database, detailing the tokens used, credits consumed, and the associated user and model.
4.  **Reports to Payment System**: The consumed credits are reported as a meter event to the payment system, which then deducts the amount from the user's balance. This reporting is throttled to batch multiple small requests into a single update, optimizing performance.

## Summary

The credit-based billing system transforms AIGNE Hub into a comprehensive AI resource management platform. It provides operators with the tools to abstract away complex provider pricing, create a stable internal economy, and manage user access based on a clear, usage-based metric. By carefully configuring model rates and user credit policies, you can ensure the sustainable and controlled operation of your AI gateway.