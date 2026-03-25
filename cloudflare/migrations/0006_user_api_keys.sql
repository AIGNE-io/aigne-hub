ALTER TABLE Apps ADD COLUMN userDid TEXT;
ALTER TABLE Apps ADD COLUMN name TEXT;
CREATE INDEX idx_apps_user_did ON Apps(userDid);
