# Data Persistence

The system's data persistence layer is built upon [Sequelize](https://sequelize.org/), a promise-based Node.js ORM, and uses [SQLite](https://www.sqlite.org/index.html) as its database engine. This design choice prioritizes simplicity, ease of deployment, and minimal external dependencies, making the system self-contained and straightforward to manage.

## Database Configuration

The core database configuration is managed within `blocklets/core/api/src/store/sequelize.ts`. The system connects to a single SQLite database file, ensuring all persistent data is stored in a predictable location.

-   **Connection URL**: `sqlite:${Config.dataDir}/aikit.db`
-   **Database File**: `aikit.db` located in the configured data directory.

### Performance & Concurrency Tuning

To optimize for concurrent read/write operations and enhance performance, several SQLite PRAGMA directives are set upon initialization. These settings are critical for maintaining system responsiveness under load.

-   `pragma journal_mode = WAL;`: The Write-Ahead Logging (WAL) mode allows for higher concurrency by enabling readers to continue operating while another process is writing to the database. This significantly reduces reader-writer contention.
-   `pragma synchronous = normal;`: In WAL mode, this setting ensures that write transactions are committed to the WAL file before returning, but the OS is responsible for the timing of the actual disk sync. This offers a good balance between performance and durability.
-   `pragma journal_size_limit = 67108864;`: Sets a limit on the size of the WAL file (64 MB), preventing it from growing indefinitely and consuming excessive disk space.

## Schema Management & Migrations

Database schema migrations are handled by [Umzug](https://github.com/sequelize/umzug), ensuring that database changes are applied in a controlled, versioned, and repeatable manner. The migration logic resides in `blocklets/core/api/src/store/migrate.ts`.

-   **Migration Files**: Migrations are defined as `.ts` or `.js` files located within `**/migrations/` directories. Umzug automatically discovers and executes pending migrations on application startup.
-   **Safe Schema Updates**: The system includes helper functions like `safeApplyColumnChanges` and `createIndexIfNotExists` to prevent common deployment errors. These helpers ensure that schema modifications (like adding a column or index) are only applied if they don't already exist, making migration scripts idempotent and safe to re-run.

## Data Models

The database schema is organized into several interconnected models that represent the core entities of the system.

### Overview of Core Models

-   **AiProvider**: Represents an external AI service provider (e.g., OpenAI, AWS Bedrock). It stores configuration details like base URL, region, and display name.
-   **AiCredential**: Securely stores the authentication credentials for each `AiProvider`. It includes features for load balancing across multiple credentials for a single provider.
-   **AiModelRate**: Defines the cost structure and metadata for specific AI models offered by a provider. This is used for calculating the credit cost of each API call.
-   **ModelCall**: Acts as the primary audit and transaction log. Every AI request is recorded here, capturing details about the user, provider, model, usage metrics, and final status (success/failure).
-   **ModelCallStat**: A performance-optimization model that stores pre-aggregated hourly and daily usage statistics derived from the `ModelCall` table. This is used to accelerate dashboard and analytics queries.
-   **App**: Stores information about applications that are authorized to use the system, including their public keys for authentication.
-   **Usage**: An auxiliary model for tracking token usage and credit consumption, primarily used for reporting to external payment systems.

### `AiCredential`: Security and Load Balancing

The `AiCredential` model is critical for both security and system reliability.

#### Credential Encryption

To protect sensitive information, credential values like `api_key` and `secret_access_key` are not stored in plaintext. They are encrypted before being persisted to the database using the `@blocklet/sdk/lib/security` module. The model provides `encryptCredentialValue` and `decryptCredentialValue` methods to handle this process transparently. From an operational perspective, this means the raw database file does not expose sensitive keys, but the application's runtime environment must be secure.

#### Credential Load Balancing

The `getNextAvailableCredential` static method implements a smooth weighted round-robin algorithm. This allows administrators to configure multiple credentials for a single provider and distribute the API load across them based on assigned weights. This is useful for:

-   **Rate Limit Distribution**: Spreading requests across multiple keys to avoid hitting provider rate limits.
-   **High Availability**: If one credential becomes invalid, the system can continue operating with the remaining active credentials.
-   **Usage Quota Management**: Distributing usage across different accounts or billing tiers.

The algorithm maintains the current weight of each credential in memory to select the most appropriate one for the next request, ensuring an efficient and balanced distribution of traffic.

### `ModelCall` and `ModelCallStat`: Analytics & Performance

The system is designed to provide detailed analytics on AI model usage while maintaining a responsive user interface. This is achieved through a two-tiered data model design.

1.  **Raw Data Logging (`ModelCall`)**: Every API request is recorded as a single entry in the `ModelCalls` table. This provides a granular, unabridged history for auditing, detailed analysis, and troubleshooting specific requests. However, querying this large table for aggregate statistics (e.g., daily usage trends) can be slow and resource-intensive.

2.  **Pre-aggregated Caching (`ModelCallStat`)**: To solve the performance issue, the `ModelCallStat` model stores pre-computed hourly and daily summaries of the data in `ModelCall`. When analytics data is requested for a past period, the system reads from this summary table, which is significantly faster. For the current, ongoing period (e.g., today or the current hour), statistics are computed in real-time from the `ModelCall` table to ensure freshness. This caching strategy is a key architectural decision that balances data accuracy with query performance.

## Operational Considerations

### Backup and Restore

The entire state of the system is stored in the `aikit.db` SQLite file. Backing up this single file is sufficient to preserve all data.

However, due to the use of `WAL` mode, a direct file copy (`cp`) while the application is running is **not recommended**, as it can lead to a corrupt backup. The recommended procedure for creating a live backup is to use the SQLite CLI's `.backup` command:

```bash
sqlite3 /path/to/your/data/aikit.db ".backup '/path/to/your/backup/aikit.db.backup'"
```

This command safely copies the database contents to a new file, ensuring a consistent snapshot even while the database is in use. Restoring is as simple as replacing the `aikit.db` file with the backup file while the application is stopped.

### Data Growth Management

The `ModelCalls` table is designed to grow indefinitely as it logs every API transaction. For long-running deployments, this can lead to significant disk space usage and a potential decline in query performance for detailed historical searches.

System administrators should monitor the size of the `aikit.db` file. While the application does not have a built-in data pruning or archiving mechanism, a strategy may need to be implemented depending on usage volume. Potential strategies could involve periodically archiving `ModelCall` records older than a certain date to cold storage and then deleting them from the live database.