-- Add name and userDid fields to Apps table for API key user tracking
ALTER TABLE Apps ADD COLUMN name TEXT;
ALTER TABLE Apps ADD COLUMN userDid TEXT;
