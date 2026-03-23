import { and, eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';

import { aiModelRates, aiModelStatuses } from '../db/schema';
import * as schema from '../db/schema';

type DB = ReturnType<typeof drizzle<typeof schema>> | ReturnType<typeof drizzle>;

/**
 * Auto-deprecate models that have been consistently unavailable.
 * Runs on cron schedule, checks aiModelStatuses for models that have
 * failed their last 3+ checks, and marks them as deprecated.
 */
export async function checkModelHealth(db: DB): Promise<{ deprecated: number; restored: number }> {
  let deprecated = 0;
  let restored = 0;

  // Find models that are marked unavailable in status table
  const unavailableModels = await db
    .select()
    .from(aiModelStatuses)
    .where(eq(aiModelStatuses.available, false));

  for (const status of unavailableModels) {
    // Check if the model rate exists and is not already deprecated
    const [rate] = await db
      .select()
      .from(aiModelRates)
      .where(
        and(
          eq(aiModelRates.providerId, status.providerId),
          eq(aiModelRates.model, status.model),
          eq(aiModelRates.deprecated, false)
        )
      )
      .limit(1);

    if (rate) {
      // Check how old the unavailable status is (auto-deprecate after 7 days)
      const lastChecked = new Date(status.lastChecked).getTime();
      const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

      if (lastChecked < sevenDaysAgo) {
        await db
          .update(aiModelRates)
          .set({
            deprecated: true,
            deprecatedAt: new Date().toISOString(),
            deprecatedReason: 'Auto-deprecated: unavailable for 7+ days',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(aiModelRates.id, rate.id));
        deprecated++;
      }
    }
  }

  // Restore models that are now available but were auto-deprecated
  const availableModels = await db
    .select()
    .from(aiModelStatuses)
    .where(eq(aiModelStatuses.available, true));

  for (const status of availableModels) {
    const [rate] = await db
      .select()
      .from(aiModelRates)
      .where(
        and(
          eq(aiModelRates.providerId, status.providerId),
          eq(aiModelRates.model, status.model),
          eq(aiModelRates.deprecated, true),
          sql`${aiModelRates.deprecatedReason} LIKE 'Auto-deprecated%'`
        )
      )
      .limit(1);

    if (rate) {
      await db
        .update(aiModelRates)
        .set({
          deprecated: false,
          deprecatedAt: null,
          deprecatedReason: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(aiModelRates.id, rate.id));
      restored++;
    }
  }

  return { deprecated, restored };
}
