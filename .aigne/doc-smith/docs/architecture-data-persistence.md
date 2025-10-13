# Data Persistence

AIGNE Hub's data persistence layer is designed for simplicity, reliability, and ease of deployment. It leverages a combination of SQLite as its database engine and Sequelize as the Object-Relational Mapper (ORM). This stack provides a self-contained, serverless, and zero-configuration database solution that is ideal for a blocklet-based architecture.

All data is stored in a single database file, `aikit.db`, located within the blocklet's data directory, ensuring data portability and straightforward backup procedures.

## Database Configuration and Optimization

The Sequelize ORM connects to the SQLite database and applies several performance-enhancing PRAGMA settings to optimize for concurrency and write performance:

- `pragma journal_mode = WAL`: Enables Write-Ahead Logging, which allows for higher concurrency by permitting readers to continue operating while another process is writing to the database.
- `pragma synchronous = normal`: In WAL mode, this setting ensures that writes are still durable and synced to disk at critical checkpoints, offering a good balance between performance and data safety.
- `pragma journal_size_limit = 67108864`: Sets a limit on the size of the WAL file to prevent it from growing indefinitely.

## Core Data Models

The database schema is organized into several core models that manage providers, credentials, API calls, and usage statistics. Below is a detailed breakdown of each major model.

### Entity-Relationship Diagram

The following diagram illustrates the primary relationships between the core data models:

```d2
direction: down

AiProvider: {
  shape: rectangle
  label: "AiProvider\n(e.g., OpenAI, Anthropic)"
}

AiCredential: {
  shape: rectangle
  label: "AiCredential\n(API Keys, encrypted)"
}

AiModelRate: {
  shape: rectangle
  label: "AiModelRate\n(Model Pricing & Metadata)"
}

ModelCall: {
  shape: rectangle
  label: "ModelCall\n(API Call Transaction Log)"
}

AiProvider -> AiCredential: "1..*"
AiProvider -> AiModelRate: "1..*"
ModelCall -> AiProvider: "belongs to"
ModelCall -> AiCredential: "uses"
```

### AiProvider

This model represents an AI service provider, such as OpenAI, Google, or Anthropic. It stores configuration details for connecting to the provider's API.

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="Unique identifier for the provider."></x-field>
  <x-field data-name="name" data-type="AIProviderType" data-required="true" data-desc="A unique string identifying the provider type (e.g., 'openai')."></x-field>
  <x-field data-name="displayName" data-type="string" data-required="true" data-desc="The user-friendly name of the provider."></x-field>
  <x-field data-name="baseUrl" data-type="string" data-desc="The base URL for the provider's API, allowing for custom or proxy endpoints."></x-field>
  <x-field data-name="enabled" data-type="boolean" data-default="true" data-desc="A flag to enable or disable the provider."></x-field>
  <x-field data-name="config" data-type="object" data-desc="A JSON object for storing provider-specific configurations."></x-field>
</x-field-group>

### AiCredential

This model securely stores the credentials required to authenticate with AI providers. It supports multiple credentials per provider to enable load balancing and key rotation.

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="Unique identifier for the credential."></x-field>
  <x-field data-name="providerId" data-type="string" data-required="true" data-desc="Foreign key linking to the AiProvider model."></x-field>
  <x-field data-name="name" data-type="string" data-required="true" data-desc="A user-defined name for the credential."></x-field>
  <x-field data-name="credentialValue" data-type="object" data-required="true">
    <x-field-desc markdown>A JSON object containing the credential values (e.g., `api_key`). Sensitive fields within this object are automatically encrypted at rest using AES encryption.</x-field-desc>
  </x-field>
  <x-field data-name="active" data-type="boolean" data-default="true" data-desc="Indicates if the credential is active and can be used for API calls."></x-field>
  <x-field data-name="weight" data-type="number" data-default="100" data-desc="A weight used for smooth weighted round-robin load balancing across multiple active credentials for the same provider."></x-field>
  <x-field data-name="usageCount" data-type="number" data-default="0" data-desc="A counter for the number of times this credential has been used."></x-field>
  <x-field data-name="lastUsedAt" data-type="Date" data-desc="Timestamp of the last time the credential was used."></x-field>
</x-field-group>

### AiModelRate

This model defines the pricing rates and metadata for each specific AI model offered by a provider. This information is crucial for the credit-based billing system.

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="Unique identifier for the model rate entry."></x-field>
  <x-field data-name="providerId" data-type="string" data-required="true" data-desc="Foreign key linking to the AiProvider model."></x-field>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The unique identifier for the model (e.g., 'gpt-4-turbo')."></x-field>
  <x-field data-name="modelDisplay" data-type="string" data-required="true" data-desc="A user-friendly display name for the model."></x-field>
  <x-field data-name="type" data-type="RateType" data-required="true" data-desc="The type of service, such as 'chatCompletion', 'embedding', or 'imageGeneration'."></x-field>
  <x-field data-name="inputRate" data-type="number" data-default="0" data-desc="The cost in credits per 1,000 input tokens (or other unit)."></x-field>
  <x-field data-name="outputRate" data-type="number" data-default="0" data-desc="The cost in credits per 1,000 output tokens (or other unit)."></x-field>
  <x-field data-name="modelMetadata" data-type="ModelMetadata" data-desc="A JSON object containing additional model capabilities, such as max tokens or supported features."></x-field>
</x-field-group>

### ModelCall

As the central transaction log, this model records every API call made through AIGNE Hub. It captures detailed information about usage, cost, status, and context for auditing and analytics.

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="Unique identifier for the API call record."></x-field>
  <x-field data-name="providerId" data-type="string" data-required="true" data-desc="The provider that handled the call."></x-field>
  <x-field data-name="credentialId" data-type="string" data-required="true" data-desc="The specific credential used for the call."></x-field>
  <x-field data-name="model" data-type="string" data-required="true" data-desc="The AI model invoked."></x-field>
  <x-field data-name="totalUsage" data-type="number" data-default="0" data-desc="The total usage units for the call (e.g., total tokens)."></x-field>
  <x-field data-name="credits" data-type="number" data-default="0" data-desc="The number of credits consumed by the call."></x-field>
  <x-field data-name="status" data-type="CallStatus" data-required="true" data-desc="The final status of the call ('processing', 'success', or 'failed')."></x-field>
  <x-field data-name="duration" data-type="number" data-desc="The duration of the API call in milliseconds."></x-field>
  <x-field data-name="userDid" data-type="string" data-required="true" data-desc="The DID of the user who initiated the call."></x-field>
  <x-field data-name="appDid" data-type="string" data-desc="The DID of the application that initiated the call."></x-field>
  <x-field data-name="callTime" data-type="number" data-required="true" data-desc="The Unix timestamp when the call was made."></x-field>
</x-field-group>

### ModelCallStat

To optimize the performance of dashboards and analytics, this model stores pre-aggregated usage statistics. Data is aggregated on both an hourly and daily basis, reducing the need for expensive real-time computations on the raw `ModelCall` log.

<x-field-group>
  <x-field data-name="id" data-type="string" data-required="true" data-desc="Unique identifier for the statistics record."></x-field>
  <x-field data-name="userDid" data-type="string" data-required="true" data-desc="The user DID for whom the stats are aggregated."></x-field>
  <x-field data-name="timestamp" data-type="number" data-required="true" data-desc="The Unix timestamp for the beginning of the aggregation period (hour or day)."></x-field>
  <x-field data-name="timeType" data-type="'day' | 'hour'" data-required="true" data-desc="The granularity of the aggregation."></x-field>
  <x-field data-name="stats" data-type="DailyStats" data-required="true" data-desc="A JSON object containing aggregated metrics like total calls, total usage, and total credits."></x-field>
</x-field-group>

## Schema Migrations

Database schema evolution is managed programmatically using **Umzug**, a robust migration framework for Node.js. This ensures that database changes are applied consistently and automatically whenever the application is updated. Migration scripts are located in the `migrations` directory and are executed during the blocklet's startup process.

## Summary

The data persistence layer of AIGNE Hub, built on SQLite and Sequelize, provides a simple yet powerful foundation for the system. The well-structured schema effectively tracks providers, credentials, and every API call, while encrypted storage protects sensitive data. Aggregation tables ensure that monitoring and reporting remain fast and efficient, even with a large volume of transactions.