import { eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { creditAccounts, creditTransactions } from '../db/schema';
import * as schema from '../db/schema';
import { logger } from '../libs/logger';

type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

/**
 * Reconcile credit accounts against transaction ledger.
 * Logs discrepancies but does not auto-fix them.
 */
export async function reconcileCredits(db: DB): Promise<{ checked: number; discrepancies: number }> {
  let checked = 0;
  let discrepancies = 0;

  // Get all accounts
  const accounts = await db.select().from(creditAccounts);

  for (const account of accounts) {
    checked++;

    // Sum all transactions for this user
    const [result] = await db
      .select({
        totalGrants: sql<string>`COALESCE(SUM(CASE WHEN type = 'grant' THEN CAST(amount AS REAL) ELSE 0 END), 0)`,
        totalUsage: sql<string>`COALESCE(SUM(CASE WHEN type = 'usage' THEN ABS(CAST(amount AS REAL)) ELSE 0 END), 0)`,
        totalRefunds: sql<string>`COALESCE(SUM(CASE WHEN type = 'refund' THEN CAST(amount AS REAL) ELSE 0 END), 0)`,
      })
      .from(creditTransactions)
      .where(eq(creditTransactions.userDid, account.userDid));

    if (!result) continue;

    const txGrants = parseFloat(String(result.totalGrants));
    const txUsage = parseFloat(String(result.totalUsage));
    const txRefunds = parseFloat(String(result.totalRefunds));
    const expectedBalance = txGrants - txUsage + txRefunds;
    const actualBalance = parseFloat(account.balance);

    // Allow small floating point discrepancy
    if (Math.abs(expectedBalance - actualBalance) > 0.01) {
      discrepancies++;
      logger.warn('Credit reconciliation discrepancy', {
        userDid: account.userDid,
        actualBalance,
        expectedBalance,
        difference: actualBalance - expectedBalance,
        txGrants,
        txUsage,
        txRefunds,
        accountTotalGranted: parseFloat(account.totalGranted),
        accountTotalUsed: parseFloat(account.totalUsed),
      });
    }
  }

  if (discrepancies > 0) {
    logger.warn('Credit reconciliation completed with discrepancies', { checked, discrepancies });
  } else {
    logger.info('Credit reconciliation completed', { checked, discrepancies: 0 });
  }

  return { checked, discrepancies };
}
