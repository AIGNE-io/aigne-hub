-- AIGNE Hub D1 Initial Schema
-- Generated from Sequelize models, 11 tables

-- 1. Apps
CREATE TABLE IF NOT EXISTS `Apps` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `publicKey` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. AiProviders
CREATE TABLE IF NOT EXISTS `AiProviders` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT(50) NOT NULL UNIQUE,
  `displayName` TEXT(100) NOT NULL,
  `baseUrl` TEXT(500),
  `region` TEXT(50),
  `enabled` INTEGER NOT NULL DEFAULT 1,
  `config` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `createdBy` TEXT
);

-- 3. AiCredentials
CREATE TABLE IF NOT EXISTS `AiCredentials` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `providerId` TEXT NOT NULL REFERENCES `AiProviders`(`id`) ON DELETE CASCADE,
  `name` TEXT(100) NOT NULL,
  `credentialValue` TEXT NOT NULL,
  `credentialType` TEXT NOT NULL DEFAULT 'api_key' CHECK(`credentialType` IN ('api_key', 'access_key_pair', 'custom')),
  `active` INTEGER NOT NULL DEFAULT 1,
  `lastUsedAt` TEXT,
  `usageCount` INTEGER NOT NULL DEFAULT 0,
  `error` TEXT,
  `weight` INTEGER NOT NULL DEFAULT 100,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_credentials_provider` ON `AiCredentials` (`providerId`);

-- 4. AiModelRates
CREATE TABLE IF NOT EXISTS `AiModelRates` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `providerId` TEXT NOT NULL REFERENCES `AiProviders`(`id`) ON DELETE CASCADE,
  `model` TEXT(100) NOT NULL,
  `modelDisplay` TEXT(100) NOT NULL,
  `description` TEXT(100),
  `type` TEXT NOT NULL CHECK(`type` IN ('chatCompletion', 'embedding', 'imageGeneration', 'video')),
  `inputRate` TEXT NOT NULL DEFAULT '0',
  `outputRate` TEXT NOT NULL DEFAULT '0',
  `unitCosts` TEXT,
  `caching` TEXT,
  `modelMetadata` TEXT,
  `deprecated` INTEGER NOT NULL DEFAULT 0,
  `deprecatedAt` TEXT,
  `deprecatedReason` TEXT(100),
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_model_rates_provider` ON `AiModelRates` (`providerId`);
CREATE INDEX IF NOT EXISTS `idx_model_rates_model` ON `AiModelRates` (`model`);

-- 5. AiModelRateHistories
CREATE TABLE IF NOT EXISTS `AiModelRateHistories` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `providerId` TEXT NOT NULL,
  `model` TEXT(100) NOT NULL,
  `type` TEXT(50) NOT NULL,
  `changeType` TEXT(20) NOT NULL,
  `source` TEXT(50) NOT NULL,
  `previousUnitCosts` TEXT,
  `currentUnitCosts` TEXT,
  `previousRates` TEXT,
  `currentRates` TEXT,
  `driftPercent` TEXT,
  `detectedAt` INTEGER NOT NULL,
  `metadata` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_rate_history_provider_model` ON `AiModelRateHistories` (`providerId`, `model`);

-- 6. AiModelStatuses
CREATE TABLE IF NOT EXISTS `AiModelStatuses` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `providerId` TEXT NOT NULL REFERENCES `AiProviders`(`id`) ON DELETE CASCADE,
  `model` TEXT(100) NOT NULL,
  `type` TEXT CHECK(`type` IN ('chatCompletion', 'embedding', 'imageGeneration', 'video')),
  `available` INTEGER NOT NULL DEFAULT 1,
  `error` TEXT,
  `responseTime` INTEGER,
  `lastChecked` TEXT NOT NULL DEFAULT (datetime('now')),
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_model_status_provider` ON `AiModelStatuses` (`providerId`);
CREATE INDEX IF NOT EXISTS `idx_model_status_model` ON `AiModelStatuses` (`model`);

-- 7. ModelCalls
CREATE TABLE IF NOT EXISTS `ModelCalls` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `providerId` TEXT NOT NULL,
  `model` TEXT NOT NULL,
  `credentialId` TEXT NOT NULL,
  `type` TEXT NOT NULL DEFAULT 'chatCompletion' CHECK(`type` IN ('chatCompletion', 'embedding', 'imageGeneration', 'audioGeneration', 'video', 'custom')),
  `totalUsage` INTEGER NOT NULL DEFAULT 0,
  `usageMetrics` TEXT,
  `credits` TEXT NOT NULL DEFAULT '0',
  `status` TEXT NOT NULL DEFAULT 'processing' CHECK(`status` IN ('processing', 'success', 'failed')),
  `duration` TEXT,
  `errorReason` TEXT,
  `appDid` TEXT,
  `userDid` TEXT,
  `requestId` TEXT,
  `metadata` TEXT,
  `callTime` INTEGER NOT NULL,
  `traceId` TEXT,
  `ttfb` TEXT,
  `providerTtfb` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_model_calls_provider` ON `ModelCalls` (`providerId`);
CREATE INDEX IF NOT EXISTS `idx_model_calls_user` ON `ModelCalls` (`userDid`);
CREATE INDEX IF NOT EXISTS `idx_model_calls_app` ON `ModelCalls` (`appDid`);
CREATE INDEX IF NOT EXISTS `idx_model_calls_time` ON `ModelCalls` (`callTime`);
CREATE INDEX IF NOT EXISTS `idx_model_calls_status` ON `ModelCalls` (`status`);

-- 8. ModelCallStats
CREATE TABLE IF NOT EXISTS `ModelCallStats` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `userDid` TEXT,
  `appDid` TEXT,
  `timestamp` INTEGER NOT NULL,
  `timeType` TEXT NOT NULL DEFAULT 'hour' CHECK(`timeType` IN ('day', 'hour', 'month')),
  `stats` TEXT NOT NULL,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_call_stats_user` ON `ModelCallStats` (`userDid`);
CREATE INDEX IF NOT EXISTS `idx_call_stats_app` ON `ModelCallStats` (`appDid`);
CREATE INDEX IF NOT EXISTS `idx_call_stats_timestamp` ON `ModelCallStats` (`timestamp`);
CREATE INDEX IF NOT EXISTS `idx_call_stats_time_type` ON `ModelCallStats` (`timeType`);
CREATE INDEX IF NOT EXISTS `idx_call_stats_composite` ON `ModelCallStats` (`userDid`, `appDid`, `timestamp`, `timeType`);

-- 9. Usages
CREATE TABLE IF NOT EXISTS `Usages` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `promptTokens` INTEGER NOT NULL,
  `completionTokens` INTEGER NOT NULL,
  `cacheCreationInputTokens` INTEGER DEFAULT 0,
  `cacheReadInputTokens` INTEGER DEFAULT 0,
  `numberOfImageGeneration` INTEGER,
  `mediaDuration` INTEGER,
  `apiKey` TEXT,
  `type` TEXT,
  `model` TEXT,
  `modelParams` TEXT,
  `appId` TEXT,
  `userDid` TEXT,
  `usageReportStatus` TEXT,
  `usedCredits` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS `idx_usages_user` ON `Usages` (`userDid`);
CREATE INDEX IF NOT EXISTS `idx_usages_app` ON `Usages` (`appId`);

-- 10. Projects
CREATE TABLE IF NOT EXISTS `Projects` (
  `appDid` TEXT PRIMARY KEY NOT NULL,
  `appName` TEXT NOT NULL,
  `appLogo` TEXT,
  `appUrl` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. ArchiveExecutionLogs
CREATE TABLE IF NOT EXISTS `ArchiveExecutionLogs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `tableName` TEXT NOT NULL,
  `status` TEXT NOT NULL CHECK(`status` IN ('success', 'failed')),
  `archivedCount` INTEGER NOT NULL DEFAULT 0,
  `dataRangeStart` INTEGER,
  `dataRangeEnd` INTEGER,
  `targetArchiveDb` TEXT,
  `duration` TEXT NOT NULL,
  `errorMessage` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Note: D1 manages WAL mode internally, no PRAGMA needed
