import { eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { creditAccounts, creditTransactions } from '../db/schema';
import * as schema from '../db/schema';

type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

/**
 * Get or create a credit account for a user.
 */
export async function getOrCreateAccount(db: DB, userDid: string) {
  const [existing] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);

  if (existing) return existing;

  // Auto-create with initial grant for dev
  const initialBalance = '1000'; // 1000 credits for new accounts
  const [account] = await db
    .insert(creditAccounts)
    .values({
      userDid,
      balance: initialBalance,
      totalGranted: initialBalance,
      totalUsed: '0',
    })
    .returning();

  // Record initial grant transaction
  await db.insert(creditTransactions).values({
    userDid,
    type: 'grant',
    amount: initialBalance,
    balance: initialBalance,
    description: 'Initial credit grant',
    grantSource: 'promotion',
  });

  return account;
}

/**
 * Get credit balance for a user.
 */
export async function getCreditBalance(db: DB, userDid: string) {
  const account = await getOrCreateAccount(db, userDid);
  return {
    balance: parseFloat(account.balance),
    total: parseFloat(account.totalGranted),
    used: parseFloat(account.totalUsed),
    grantCount: 0, // TODO: count grants
    pendingCredit: 0,
  };
}

/**
 * Deduct credits for a model call.
 * Uses atomic SQL UPDATE with WHERE balance >= amount to prevent race conditions.
 * Returns true if deduction succeeded, false if insufficient balance.
 */
export async function deductCredits(
  db: DB,
  userDid: string,
  amount: number,
  meta: { modelCallId?: string; model?: string; description?: string }
): Promise<{ success: boolean; balance: number }> {
  // Ensure account exists
  await getOrCreateAccount(db, userDid);

  // Atomic deduction: UPDATE only succeeds if balance >= amount
  const now = new Date().toISOString();
  const result = await db.run(sql`
    UPDATE ${creditAccounts}
    SET balance = CAST(CAST(balance AS REAL) - ${amount} AS TEXT),
        totalUsed = CAST(CAST(totalUsed AS REAL) + ${amount} AS TEXT),
        updatedAt = ${now}
    WHERE userDid = ${userDid}
      AND CAST(balance AS REAL) >= ${amount}
  `);

  const rowsAffected = (result as { rowsWritten?: number; meta?: { changes?: number } }).rowsWritten ?? (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
  if (rowsAffected === 0) {
    // Insufficient balance — read current balance for response
    const [account] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);
    return { success: false, balance: account ? parseFloat(account.balance) : 0 };
  }

  // Read new balance for transaction record
  const [updated] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);
  const newBalance = updated ? parseFloat(updated.balance) : 0;

  // Record transaction (non-critical, can be async)
  await db.insert(creditTransactions).values({
    userDid,
    type: 'usage',
    amount: (-amount).toFixed(10),
    balance: newBalance.toFixed(10),
    description: meta.description || `Model call: ${meta.model || 'unknown'}`,
    modelCallId: meta.modelCallId,
    model: meta.model,
  });

  return { success: true, balance: newBalance };
}

/**
 * Grant credits to a user (admin operation or payment callback).
 * Uses atomic SQL UPDATE to prevent race conditions.
 */
export async function grantCredits(
  db: DB,
  userDid: string,
  amount: number,
  meta: { source: string; paymentId?: string; description?: string }
): Promise<{ balance: number }> {
  // Ensure account exists
  await getOrCreateAccount(db, userDid);

  // Atomic grant
  const now = new Date().toISOString();
  await db.run(sql`
    UPDATE ${creditAccounts}
    SET balance = CAST(CAST(balance AS REAL) + ${amount} AS TEXT),
        totalGranted = CAST(CAST(totalGranted AS REAL) + ${amount} AS TEXT),
        updatedAt = ${now}
    WHERE userDid = ${userDid}
  `);

  // Read new balance
  const [updated] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);
  const newBalance = updated ? parseFloat(updated.balance) : 0;

  await db.insert(creditTransactions).values({
    userDid,
    type: 'grant',
    amount: amount.toFixed(10),
    balance: newBalance.toFixed(10),
    description: meta.description || `Credit grant from ${meta.source}`,
    grantSource: meta.source,
    paymentId: meta.paymentId,
  });

  return { balance: newBalance };
}

/**
 * Pre-deduct estimated credits before a model call starts.
 * Uses a conservative estimate based on max_tokens * outputRate.
 * Returns a hold ID that must be settled after the call completes.
 */
export async function preDeductCredits(
  db: DB,
  userDid: string,
  estimatedAmount: number,
  meta: { model?: string }
): Promise<{ success: boolean; holdAmount: number; balance: number }> {
  // Ensure account exists
  await getOrCreateAccount(db, userDid);

  // Atomic deduction
  const now = new Date().toISOString();
  const result = await db.run(sql`
    UPDATE ${creditAccounts}
    SET balance = CAST(CAST(balance AS REAL) - ${estimatedAmount} AS TEXT),
        totalUsed = CAST(CAST(totalUsed AS REAL) + ${estimatedAmount} AS TEXT),
        updatedAt = ${now}
    WHERE userDid = ${userDid}
      AND CAST(balance AS REAL) >= ${estimatedAmount}
  `);

  const rowsAffected =
    (result as { rowsWritten?: number; meta?: { changes?: number } }).rowsWritten ??
    (result as { meta?: { changes?: number } }).meta?.changes ??
    0;
  if (rowsAffected === 0) {
    const [account] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);
    return { success: false, holdAmount: 0, balance: account ? parseFloat(account.balance) : 0 };
  }

  const [updated] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);
  console.log(`[credit] pre-deduct ${estimatedAmount.toFixed(6)} for ${meta.model || 'unknown'} (user=${userDid})`);
  return { success: true, holdAmount: estimatedAmount, balance: updated ? parseFloat(updated.balance) : 0 };
}

/**
 * Settle a pre-deducted hold. Refunds the difference between estimated and actual usage.
 * If actual > estimated (shouldn't normally happen), deducts the extra.
 */
export async function settleCredits(
  db: DB,
  userDid: string,
  holdAmount: number,
  actualAmount: number,
  meta: { modelCallId?: string; model?: string }
): Promise<{ balance: number }> {
  const diff = holdAmount - actualAmount; // positive = refund, negative = extra charge

  if (Math.abs(diff) > 0.000001) {
    const now = new Date().toISOString();
    if (diff > 0) {
      // Refund excess
      await db.run(sql`
        UPDATE ${creditAccounts}
        SET balance = CAST(CAST(balance AS REAL) + ${diff} AS TEXT),
            totalUsed = CAST(CAST(totalUsed AS REAL) - ${diff} AS TEXT),
            updatedAt = ${now}
        WHERE userDid = ${userDid}
      `);
    } else {
      // Extra charge (rare: actual exceeded estimate)
      const extra = Math.abs(diff);
      await db.run(sql`
        UPDATE ${creditAccounts}
        SET balance = CAST(CAST(balance AS REAL) - ${extra} AS TEXT),
            totalUsed = CAST(CAST(totalUsed AS REAL) + ${extra} AS TEXT),
            updatedAt = ${now}
        WHERE userDid = ${userDid}
      `);
    }
  }

  // Read new balance for transaction record
  const [updated] = await db.select().from(creditAccounts).where(eq(creditAccounts.userDid, userDid)).limit(1);
  const newBalance = updated ? parseFloat(updated.balance) : 0;

  // Record the actual usage transaction
  await db.insert(creditTransactions).values({
    userDid,
    type: 'usage',
    amount: (-actualAmount).toFixed(10),
    balance: newBalance.toFixed(10),
    description: `Model call: ${meta.model || 'unknown'}`,
    modelCallId: meta.modelCallId,
    model: meta.model,
  });

  console.log(
    `[credit] settle hold=${holdAmount.toFixed(6)} actual=${actualAmount.toFixed(6)} diff=${diff.toFixed(6)} (user=${userDid})`
  );
  return { balance: newBalance };
}

/**
 * Refund a pre-deducted hold entirely (call failed before any usage).
 */
export async function refundHold(db: DB, userDid: string, holdAmount: number): Promise<void> {
  if (holdAmount <= 0) return;
  const now = new Date().toISOString();
  await db.run(sql`
    UPDATE ${creditAccounts}
    SET balance = CAST(CAST(balance AS REAL) + ${holdAmount} AS TEXT),
        totalUsed = CAST(CAST(totalUsed AS REAL) - ${holdAmount} AS TEXT),
        updatedAt = ${now}
    WHERE userDid = ${userDid}
  `);
  console.log(`[credit] refund hold=${holdAmount.toFixed(6)} (user=${userDid})`);
}

/**
 * Get credit transactions for a user (paginated).
 */
export async function getTransactions(
  db: DB,
  userDid: string,
  options: { page?: number; pageSize?: number; type?: string } = {}
) {
  const page = options.page || 1;
  const pageSize = Math.min(options.pageSize || 20, 100);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userDid, userDid))
      .orderBy(sql`${creditTransactions.createdAt} DESC`)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(creditTransactions)
      .where(eq(creditTransactions.userDid, userDid)),
  ]);

  return {
    data: rows,
    total: countResult[0]?.count || 0,
    page,
    pageSize,
  };
}
