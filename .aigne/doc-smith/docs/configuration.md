# Billing and Payment

AIGNE Hub includes a flexible, credit-based billing system designed for both internal enterprise use and public-facing service provider deployments. This system is built on top of Blocklet's Payment Kit, providing a robust mechanism for metering AI usage, managing customer credits, and handling payments.

## System Architecture

AIGNE Hub's billing functionality operates in two primary modes, determined by the system configuration.

### Deployment Scenarios

1.  **Enterprise Self-Hosting (Billing Disabled)**: In this mode, AIGNE Hub acts purely as a gateway. All API calls are passed through to the underlying AI providers, and billing is handled directly between the organization and the providers (e.g., OpenAI, Anthropic). This is the default and simplest deployment model, ideal for internal teams who manage their own AI provider subscriptions.

2.  **Service Provider (Billing Enabled)**: When credit-based billing is enabled, AIGNE Hub transforms into a full-featured AI service platform. It abstracts away the individual provider costs and instead charges users based on a unified credit system. This mode is designed for operators who want to offer AI services to customers, with full control over pricing, billing, and user management.

### Core Components

The billing system relies on a tight integration with the **Payment Kit** blocklet (`did:z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk`), which is a critical dependency for this mode.

-   **Meter (`agent-hub-ai-meter`)**: A central component in Payment Kit that records usage. Every AI API call (chat, image generation, embedding) triggers a meter event, consuming a specific number of credits.
-   **Unit of Account (`AIGNE Hub Credits`)**: The standardized currency within the Hub. All model usage is priced and charged in these credits, providing a consistent billing experience regardless of the underlying AI provider.
-   **Customer Wallets**: Payment Kit manages a credit balance for each user. Before processing an AI request, the Hub verifies the user's balance.
-   **Payment Links**: Users can purchase credits through configurable payment links, which are processed by Payment Kit.

## Configuration

System operators can manage the billing system through a set of configuration variables.

### Enabling Credit-Based Billing

To activate the service provider mode, the following setting must be enabled:

-   `creditBasedBillingEnabled`: (boolean) Set to `true` to enable the credit system. When `false`, the Hub operates in the enterprise self-hosting mode.

### New User Onboarding

To encourage user adoption, operators can grant a complimentary credit balance to new users.

-   `newUserCreditGrantEnabled`: (boolean) If `true`, new users will automatically receive starter credits.
-   `newUserCreditGrantAmount`: (number) The quantity of credits to grant to each new user.
-   `creditExpirationDays`: (number) The number of days after which granted credits expire. A value of `0` means credits never expire.

### Credit Purchase Flow

Operators can specify a URL where users can purchase more credits.

-   `creditPaymentLink`: (string) The URL for the credit purchase page. If not specified, the system attempts to generate a default payment link using Payment Kit's pre-configured credit product.

## Pricing and Rate Management

A key task for operators in service provider mode is setting the price for AI model usage. Prices are defined as "rates"—the number of AIGNE Hub Credits charged for a given unit of work (e.g., per 1,000 tokens).

### Rate Calculation Model

The system supports a flexible pricing model that allows operators to set a desired profit margin on top of the actual cost from the AI provider. The formula for calculating the final credit rate is:

```
Rate = (UnitCost * (1 + ProfitMargin / 100)) / CreditPrice
```

-   **UnitCost**: The actual cost of the model from the provider (e.g., dollars per 1M tokens). This value is stored per-model in the `unitCosts` field.
-   **ProfitMargin**: The operator's desired profit margin as a percentage (e.g., `20` for 20%).
-   **CreditPrice**: The effective price of one AIGNE Hub Credit in the same currency as the `UnitCost`.

### Managing Model Rates

Rates can be managed through the AIGNE Hub's REST API.

#### Manual Rate Configuration

Operators can set rates for each model individually. This provides fine-grained control over the pricing of specific models.

**API Endpoint**: `POST /api/v2/ai-providers/{providerId}/model-rates`

**Example Payload**:

```json
{
  "model": "gpt-4-turbo",
  "type": "chatCompletion",
  "inputRate": 500,
  "outputRate": 1500,
  "unitCosts": {
    "input": 0.00001,
    "output": 0.00003
  }
}
```

-   `inputRate`/`outputRate`: The price in AIGNE Hub Credits.
-   `unitCosts`: The underlying cost from the provider, used for automated calculations.

#### Bulk Rate Updates

For system-wide price adjustments, a bulk update mechanism is available. This is highly effective for adjusting prices based on changes in provider costs or business strategy.

**API Endpoint**: `POST /api/v2/ai-providers/bulk-rate-update`

**Example Payload**:

```json
{
  "profitMargin": 25,
  "creditPrice": 0.000005
}
```

This request will recalculate and update the `inputRate` and `outputRate` for all models that have their `unitCosts` defined, applying a 25% profit margin based on a credit price of $0.000005 per credit.

## Operations and Troubleshooting

### Dependencies

-   **Payment Kit**: The most critical dependency. If the Payment Kit blocklet is not running, all credit-based operations—including balance checks, credit deductions, and purchases—will fail. Ensure Payment Kit is active and healthy.

### Common Issues

-   **Insufficient Credit Errors (`CreditError 402`)**: This error is returned to the end-user when their credit balance is zero or too low to process the request. The resolution is for the user to purchase more credits via the configured payment link.
-   **Failed Meter Events**: If AIGNE Hub cannot communicate with Payment Kit to record a meter event, the AI request will fail to prevent unbilled usage. Check the logs for both AIGNE Hub and Payment Kit to diagnose connectivity issues.
-   **Incorrect Pricing**: If rates seem incorrect, verify the values in the `AiModelRate` table and ensure any bulk updates were performed with the correct `profitMargin` and `creditPrice` parameters.