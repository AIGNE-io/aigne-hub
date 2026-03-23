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
 * Returns true if deduction succeeded, false if insufficient balance.
 */
export async function deductCredits(
  db: DB,
  userDid: string,
  amount: number,
  meta: { modelCallId?: string; model?: string; description?: string }
): Promise<{ success: boolean; balance: number }> {
  const account = await getOrCreateAccount(db, userDid);
  const currentBalance = parseFloat(account.balance);

  if (currentBalance < amount) {
    return { success: false, balance: currentBalance };
  }

  const newBalance = currentBalance - amount;
  const newTotalUsed = parseFloat(account.totalUsed) + amount;

  await db
    .update(creditAccounts)
    .set({
      balance: newBalance.toFixed(10),
      totalUsed: newTotalUsed.toFixed(10),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(creditAccounts.userDid, userDid));

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
 */
export async function grantCredits(
  db: DB,
  userDid: string,
  amount: number,
  meta: { source: string; paymentId?: string; description?: string }
): Promise<{ balance: number }> {
  const account = await getOrCreateAccount(db, userDid);
  const newBalance = parseFloat(account.balance) + amount;
  const newTotalGranted = parseFloat(account.totalGranted) + amount;

  await db
    .update(creditAccounts)
    .set({
      balance: newBalance.toFixed(10),
      totalGranted: newTotalGranted.toFixed(10),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(creditAccounts.userDid, userDid));

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

  const conditions = [eq(creditTransactions.userDid, userDid)];
  if (options.type) {
    conditions.push(eq(creditTransactions.type, options.type as 'grant' | 'usage' | 'refund' | 'adjustment'));
  }

  const whereClause = conditions.length > 1 ? sql`${creditTransactions.userDid} = ${userDid} AND ${creditTransactions.type} = ${options.type}` : eq(creditTransactions.userDid, userDid);

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
