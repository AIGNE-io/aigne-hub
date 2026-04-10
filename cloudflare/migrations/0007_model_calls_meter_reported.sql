-- Add meterReported flag to ModelCalls for D1-based meter event batching.
-- Existing records are marked as reported (1) to skip historical replay.
ALTER TABLE ModelCalls ADD COLUMN meterReported INTEGER NOT NULL DEFAULT 0;
UPDATE ModelCalls SET meterReported = 1;

-- Partial index: only unreported successful calls with credits > 0.
-- Keeps index small since most rows become reported quickly.
CREATE INDEX IF NOT EXISTS idx_model_calls_meter_pending
  ON ModelCalls (userDid, meterReported)
  WHERE meterReported = 0 AND status = 'success';
