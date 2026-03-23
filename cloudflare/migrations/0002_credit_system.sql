-- Credit system tables

-- 12. CreditAccounts - User credit balance
CREATE TABLE IF NOT EXISTS `CreditAccounts` (
  `userDid` TEXT PRIMARY KEY NOT NULL,
  `balance` TEXT NOT NULL DEFAULT '0',
  `totalGranted` TEXT NOT NULL DEFAULT '0',
  `totalUsed` TEXT NOT NULL DEFAULT '0',
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now')),
  `updatedAt` TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. CreditTransactions - Credit usage/grant ledger
CREATE TABLE IF NOT EXISTS `CreditTransactions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `userDid` TEXT NOT NULL,
  `type` TEXT NOT NULL CHECK(`type` IN ('grant', 'usage', 'refund', 'adjustment')),
  `amount` TEXT NOT NULL,
  `balance` TEXT NOT NULL,
  `description` TEXT,
  `modelCallId` TEXT,
  `model` TEXT,
  `grantSource` TEXT,
  `paymentId` TEXT,
  `createdAt` TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `idx_credit_tx_user` ON `CreditTransactions` (`userDid`);
CREATE INDEX IF NOT EXISTS `idx_credit_tx_type` ON `CreditTransactions` (`type`);
CREATE INDEX IF NOT EXISTS `idx_credit_tx_created` ON `CreditTransactions` (`createdAt`);
