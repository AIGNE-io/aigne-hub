-- Composite indexes for common query patterns

-- ModelCalls: user+time for usage stats, app+time for project stats
CREATE INDEX IF NOT EXISTS idx_model_calls_user_time ON ModelCalls(userDid, callTime);
CREATE INDEX IF NOT EXISTS idx_model_calls_app_time ON ModelCalls(appDid, callTime);

-- AiModelStatuses: updatedAt for SSE polling
CREATE INDEX IF NOT EXISTS idx_model_statuses_updated ON AiModelStatuses(updatedAt);

-- CreditTransactions: user+type+time for paginated listing
CREATE INDEX IF NOT EXISTS idx_credit_tx_user_type_time ON CreditTransactions(userDid, type, createdAt);

-- ModelCallStats: unique constraint for upsert (ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_stats_upsert ON ModelCallStats(userDid, appDid, timestamp, timeType);
