# Credit-Based Billing

AIGNE Hub includes an optional, powerful credit-based billing system that allows operators to meter and charge for AI model usage. When enabled, all API calls are measured in a standardized unit called "credits." This system provides a flexible way to manage costs, set pricing, and offer tiered access to different AI models.

This feature relies on the **Blocklet Payment Kit**, which must be installed and running. It handles user credit balances, transactions, and payment processing.

## Enabling Credit-Based Billing

The credit-based billing system is disabled by default. To enable it, you must set the corresponding environment variable in your AIGNE Hub configuration and ensure the Payment Kit is active.

1.  **Enable the Feature Flag:** Set the following environment variable:
    ```sh title=".env"
    AIGNE_HUB_CREDIT_BASED_BILLING_ENABLED=true
    ```
2.  **Ensure Payment Kit is Running:** Verify that the Blocklet Payment Kit component is installed and running, as it manages all credit-related operations.

Once enabled, the system will check a user's credit balance before processing any API request and deduct the appropriate amount after the request is completed.

## Core Concepts

Understanding the following concepts is key to configuring the billing system correctly.

<x-cards data-columns="2">
  <x-card data-title="Credits" data-icon="lucide:coins">
    The universal unit for measuring usage. Instead of tracking costs in various currencies and units (e.g., tokens, images, seconds), all usage is converted into credits.
  </x-card>
  <x-card data-title="Model Rates" data-icon="lucide:receipt-text">
    Configuration records that define the cost of using a specific AI model. Each rate specifies how many credits are consumed per input token, output token, or generated image.
  </x-card>
</x-cards>

### Billing Workflow

The billing process is fully automated. When a request is made through the API gateway:

1.  AIGNE Hub checks if the user has a sufficient credit balance.
2.  The request is forwarded to the AI provider.
3.  After the provider responds, AIGNE Hub calculates the usage (e.g., prompt and completion tokens).
4.  The system looks up the corresponding `AiModelRate` for the model used.
5.  The total credit cost is calculated based on the usage and the model rate.
6.  A meter event is sent to the Payment Kit, which deducts the calculated credits from the user's balance.

```d2 Billing Workflow
direction: down

User -> AIGNE-Hub: "1. API Request"

AIGNE-Hub: {
  label: "AIGNE Hub"
  shape: rectangle

  Rate-Lookup: {
    label: "Rate Lookup"
    shape: rectangle
  }

  Usage-Calculation: {
    label: "Usage Calculation"
    shape: rectangle
  }
}

Payment-Kit: {
  label: "Payment Kit Blocklet"
  shape: rectangle

  Credit-Deduction: {
    label: "Credit Balance"
    shape: cylinder
  }
}

AIGNE-Hub.Rate-Lookup -> AIGNE-Hub.Usage-Calculation: "2. Find Model Rate"
AIGNE-Hub.Usage-Calculation -> Payment-Kit.Credit-Deduction: "3. Report Usage (Meter Event)"
Payment-Kit.Credit-Deduction -> User: "4. Balance Updated"
AIGNE-Hub -> User: "5. API Response"
```

### How Usage is Calculated

The credit cost for an API call is determined by the following formulas:

-   **For Text-based Models (`chatCompletion`, `embedding`):**
    `Total Credits = (prompt_tokens × inputRate) + (completion_tokens × outputRate)`

-   **For Image Generation Models (`imageGeneration`):**
    `Total Credits = (number_of_images × outputRate)`

## Configuring Model Rates

To begin metering usage, you must define rates for each AI model you want to make available. This is done by creating `AiModelRate` entries from the admin dashboard.

### Add a Model Rate

When adding a new model rate, you need to provide the following details:

<x-field-group>
  <x-field data-name="model" data-type="string" data-required="true">
    <x-field-desc markdown>The exact identifier for the model as recognized by the provider (e.g., `gpt-4o`, `claude-3-opus-20240229`).</x-field-desc>
  </x-field>
  <x-field data-name="modelDisplay" data-type="string" data-required="false">
    <x-field-desc markdown>A user-friendly name for the model that will be shown in UIs. If left blank, a formatted name is generated from the model identifier.</x-field-desc>
  </x-field>
  <x-field data-name="type" data-type="string" data-required="true">
    <x-field-desc markdown>The type of task. Must be one of `chatCompletion`, `imageGeneration`, or `embedding`.</x-field-desc>
  </x-field>
  <x-field data-name="inputRate" data-type="number" data-required="true">
    <x-field-desc markdown>The number of credits charged per input token (for text models). Set to 0 for image models.</x-field-desc>
  </x-field>
  <x-field data-name="outputRate" data-type="number" data-required="true">
    <x-field-desc markdown>The number of credits charged per output token (for text models) or per generated image (for image models).</x-field-desc>
  </x-field>
  <x-field data-name="unitCosts" data-type="object" data-required="false">
    <x-field-desc markdown>The actual cost of the model from the provider in a real-world currency (e.g., USD). This is used for the bulk rate update feature. The values typically represent the cost per unit (e.g., per token).</x-field-desc>
    <x-field data-name="input" data-type="number" data-required="true" data-desc="The cost per input unit."></x-field>
    <x-field data-name="output" data-type="number" data-required="true" data-desc="The cost per output unit."></x-field>
  </x-field>
  <x-field data-name="modelMetadata" data-type="object" data-required="false">
    <x-field-desc markdown>Advanced metadata about the model's capabilities, such as max tokens, supported features (`tools`, `vision`), or image generation parameters.</x-field-desc>
  </x-field>
</x-field-group>

### Batch Creation

To streamline configuration, you can create a single model rate and apply it to multiple AI providers simultaneously. This is useful when a model (e.g., a specific Llama version) is available across different provider endpoints with similar pricing.

### Bulk Rate Updates

For operators managing many models, AIGNE Hub offers a bulk update feature to adjust all credit rates automatically based on your underlying costs and business model. This feature uses the `unitCosts` field stored in each model rate.

You provide two parameters:

1.  **Profit Margin (%)**: The desired profit margin you want to apply on top of the provider's cost.
2.  **Credit Price**: The price at which you sell one credit to your users (in the same currency as `unitCosts`).

The system then recalculates the `inputRate` and `outputRate` for all applicable models using the formula:

`New Rate = unitCost × (1 + profitMargin / 100) / creditPrice`

This allows you to adjust your entire pricing structure in a single operation, ensuring your rates remain aligned with your costs and business strategy.

## User Credit Management

AIGNE Hub also provides features for managing user credit balances automatically.

### New User Credit Grant

You can configure AIGNE Hub to automatically grant a promotional credit balance to new users upon their first sign-in. This is an effective way to encourage adoption and allow users to try the service.

This feature is controlled by the following environment variables:

| Variable                       | Description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `NEW_USER_CREDIT_GRANT_ENABLED`  | Set to `true` to enable the feature.                                        |
| `NEW_USER_CREDIT_GRANT_AMOUNT`   | The number of credits to grant to each new user.                            |
| `CREDIT_EXPIRATION_DAYS`         | The number of days after which the promotional credits will expire. Set to 0 for no expiration. |

### Purchasing Credits

When users run low on credits, they can purchase more. The system can be configured with a custom payment link or will automatically use a default one generated by the Payment Kit.

-   **Custom Link:** Set the `CREDIT_PAYMENT_LINK` environment variable to a URL of your choice.
-   **Default Link:** If the variable is not set, the system generates a default checkout page via the Payment Kit, allowing users to buy credit packs.

If a user attempts an API call with an insufficient balance, the API will return a `402 Payment Required` error, which can include the payment link to guide the user to recharge their account.

---

With credit-based billing configured, you can now effectively manage and monitor AI service consumption. For details on tracking usage, see the [Monitoring Usage and Costs](./operational-guides-monitoring.md) guide.