import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ============================================================
// 1. Apps - Multi-tenant application registration
// ============================================================
export const apps = sqliteTable('Apps', {
  id: text('id').primaryKey(), // App/Blocklet DID
  publicKey: text('publicKey'),
  name: text('name'),
  userDid: text('userDid'),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// 2. AiProviders - AI provider configurations
// ============================================================
export const aiProviders = sqliteTable('AiProviders', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name', { length: 50 }).notNull().unique(),
  displayName: text('displayName', { length: 100 }).notNull(),
  baseUrl: text('baseUrl', { length: 500 }),
  region: text('region', { length: 50 }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  providerType: text('providerType', { enum: ['builtin', 'custom'] }).notNull().default('builtin'),
  gatewaySlug: text('gatewaySlug'),
  config: text('config', { mode: 'json' }),
  apiFormat: text('apiFormat', { enum: ['openai', 'anthropic', 'gemini', 'bedrock'] }).notNull().default('openai'),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  createdBy: text('createdBy'),
});

// ============================================================
// 3. AiCredentials - Provider API keys (encrypted)
// ============================================================
export const aiCredentials = sqliteTable(
  'AiCredentials',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text('providerId')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    name: text('name', { length: 100 }).notNull(),
    credentialValue: text('credentialValue', { mode: 'json' }).notNull(), // encrypted JSON
    credentialType: text('credentialType', { enum: ['api_key', 'access_key_pair', 'custom'] })
      .notNull()
      .default('api_key'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastUsedAt: text('lastUsedAt'),
    usageCount: integer('usageCount').notNull().default(0),
    error: text('error'),
    weight: integer('weight').notNull().default(100),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_credentials_provider').on(table.providerId)]
);

// ============================================================
// 4. AiModelRates - Model pricing definitions
// ============================================================
export const aiModelRates = sqliteTable(
  'AiModelRates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text('providerId')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    model: text('model', { length: 100 }).notNull(),
    modelDisplay: text('modelDisplay', { length: 100 }).notNull(),
    description: text('description', { length: 100 }),
    type: text('type', { enum: ['chatCompletion', 'embedding', 'imageGeneration', 'video'] }).notNull(),
    inputRate: text('inputRate').notNull().default('0'), // stored as text for precision
    outputRate: text('outputRate').notNull().default('0'),
    unitCosts: text('unitCosts', { mode: 'json' }), // {input: number, output: number}
    caching: text('caching', { mode: 'json' }), // {readRate?: number, writeRate?: number}
    modelMetadata: text('modelMetadata', { mode: 'json' }), // {maxTokens?, features?, imageGeneration?}
    deprecated: integer('deprecated', { mode: 'boolean' }).notNull().default(false),
    deprecatedAt: text('deprecatedAt'),
    deprecatedReason: text('deprecatedReason', { length: 100 }),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_model_rates_provider').on(table.providerId), index('idx_model_rates_model').on(table.model)]
);

// ============================================================
// 5. AiModelRateHistories - Pricing change audit trail
// ============================================================
export const aiModelRateHistories = sqliteTable(
  'AiModelRateHistories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text('providerId').notNull(),
    model: text('model', { length: 100 }).notNull(),
    type: text('type', { length: 50 }).notNull(),
    changeType: text('changeType', { length: 20 }).notNull(), // 'source_drift', 'manual_update', 'bulk_update', 'bulk_create', 'auto_update'
    source: text('source', { length: 50 }).notNull(),
    previousUnitCosts: text('previousUnitCosts', { mode: 'json' }),
    currentUnitCosts: text('currentUnitCosts', { mode: 'json' }),
    previousRates: text('previousRates', { mode: 'json' }),
    currentRates: text('currentRates', { mode: 'json' }),
    driftPercent: text('driftPercent'), // stored as text for precision
    detectedAt: integer('detectedAt').notNull(),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_rate_history_provider_model').on(table.providerId, table.model)]
);

// ============================================================
// 6. AiModelStatuses - Model availability status
// ============================================================
export const aiModelStatuses = sqliteTable(
  'AiModelStatuses',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text('providerId')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    model: text('model', { length: 100 }).notNull(),
    type: text('type', { enum: ['chatCompletion', 'embedding', 'imageGeneration', 'video'] }),
    available: integer('available', { mode: 'boolean' }).notNull().default(true),
    error: text('error', { mode: 'json' }), // {code: ModelErrorType, message: string}
    responseTime: integer('responseTime'),
    lastChecked: text('lastChecked')
      .notNull()
      .default(sql`(datetime('now'))`),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_model_status_provider').on(table.providerId), index('idx_model_status_model').on(table.model)]
);

// ============================================================
// 7. ModelCalls - Individual API call records
// ============================================================
export const modelCalls = sqliteTable(
  'ModelCalls',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text('providerId').notNull(),
    model: text('model').notNull(),
    credentialId: text('credentialId').notNull(),
    type: text('type', {
      enum: ['chatCompletion', 'embedding', 'imageGeneration', 'audioGeneration', 'video', 'custom'],
    })
      .notNull()
      .default('chatCompletion'),
    totalUsage: integer('totalUsage').notNull().default(0),
    usageMetrics: text('usageMetrics', { mode: 'json' }),
    credits: text('credits').notNull().default('0'), // text for DECIMAL precision
    status: text('status', { enum: ['processing', 'success', 'failed'] })
      .notNull()
      .default('processing'),
    duration: text('duration'), // seconds, text for DECIMAL
    errorReason: text('errorReason'),
    appDid: text('appDid'),
    userDid: text('userDid'),
    requestId: text('requestId'),
    metadata: text('metadata', { mode: 'json' }),
    callTime: integer('callTime').notNull(), // unix timestamp
    traceId: text('traceId'),
    ttfb: text('ttfb'), // ms, text for DECIMAL
    providerTtfb: text('providerTtfb'), // ms
    meterReported: integer('meterReported', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_model_calls_provider').on(table.providerId),
    index('idx_model_calls_user').on(table.userDid),
    index('idx_model_calls_app').on(table.appDid),
    index('idx_model_calls_time').on(table.callTime),
    index('idx_model_calls_status').on(table.status),
  ]
);

// ============================================================
// 8. ModelCallStats - Aggregated usage statistics
// ============================================================
export const modelCallStats = sqliteTable(
  'ModelCallStats',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userDid: text('userDid'),
    appDid: text('appDid'),
    timestamp: integer('timestamp').notNull(), // bucket timestamp (unix)
    timeType: text('timeType', { enum: ['day', 'hour', 'month'] })
      .notNull()
      .default('hour'),
    stats: text('stats', { mode: 'json' }).notNull(), // DailyStats JSON
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_call_stats_user').on(table.userDid),
    index('idx_call_stats_app').on(table.appDid),
    index('idx_call_stats_timestamp').on(table.timestamp),
    index('idx_call_stats_time_type').on(table.timeType),
    index('idx_call_stats_composite').on(table.userDid, table.appDid, table.timestamp, table.timeType),
  ]
);

// ============================================================
// 9. Usages - User credit/token usage tracking
// ============================================================
export const usages = sqliteTable(
  'Usages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    promptTokens: integer('promptTokens').notNull(),
    completionTokens: integer('completionTokens').notNull(),
    cacheCreationInputTokens: integer('cacheCreationInputTokens').default(0),
    cacheReadInputTokens: integer('cacheReadInputTokens').default(0),
    numberOfImageGeneration: integer('numberOfImageGeneration'),
    mediaDuration: integer('mediaDuration'),
    apiKey: text('apiKey'),
    type: text('type'),
    model: text('model'),
    modelParams: text('modelParams', { mode: 'json' }),
    appId: text('appId'),
    userDid: text('userDid'),
    usageReportStatus: text('usageReportStatus'),
    usedCredits: text('usedCredits'), // text for DECIMAL
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_usages_user').on(table.userDid), index('idx_usages_app').on(table.appId)]
);

// ============================================================
// 10. Projects - Project organization
// ============================================================
export const projects = sqliteTable('Projects', {
  appDid: text('appDid').primaryKey(),
  appName: text('appName').notNull(),
  appLogo: text('appLogo'),
  appUrl: text('appUrl'),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// 11. ArchiveExecutionLogs - Archive execution tracking
// ============================================================
export const archiveExecutionLogs = sqliteTable('ArchiveExecutionLogs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tableName: text('tableName').notNull(), // 'ModelCalls', 'ModelCallStats', 'Usage'
  status: text('status', { enum: ['success', 'failed'] }).notNull(),
  archivedCount: integer('archivedCount').notNull().default(0),
  dataRangeStart: integer('dataRangeStart'),
  dataRangeEnd: integer('dataRangeEnd'),
  targetArchiveDb: text('targetArchiveDb'),
  duration: text('duration').notNull(), // seconds, text for DECIMAL
  errorMessage: text('errorMessage'),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// 12. CreditAccounts - User credit balance
// ============================================================
export const creditAccounts = sqliteTable('CreditAccounts', {
  userDid: text('userDid').primaryKey(),
  balance: text('balance').notNull().default('0'), // text for DECIMAL precision
  totalGranted: text('totalGranted').notNull().default('0'),
  totalUsed: text('totalUsed').notNull().default('0'),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// 13. CreditTransactions - Credit usage/grant ledger
// ============================================================
export const creditTransactions = sqliteTable(
  'CreditTransactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userDid: text('userDid').notNull(),
    type: text('type', { enum: ['grant', 'usage', 'refund', 'adjustment'] }).notNull(),
    amount: text('amount').notNull(), // positive for grant, negative for usage
    balance: text('balance').notNull(), // balance after this transaction
    description: text('description'),
    modelCallId: text('modelCallId'),
    model: text('model'),
    grantSource: text('grantSource'), // 'admin', 'payment', 'promotion'
    paymentId: text('paymentId'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_credit_tx_user').on(table.userDid),
    index('idx_credit_tx_type').on(table.type),
    index('idx_credit_tx_created').on(table.createdAt),
  ]
);
