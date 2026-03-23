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
