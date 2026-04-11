const KV_KEY = 'app:preferences';

// Default preferences — same as Blocklet Server version
const DEFAULTS: Record<string, unknown> = {
  creditBasedBillingEnabled: true,
  guestPlaygroundEnabled: true,
  newUserCreditGrantEnabled: false,
  newUserCreditGrantAmount: 0,
  creditExpirationDays: 0,
  creditPrefix: '',
  basePricePerUnit: 1,
  onlyEnableModelsInPricing: false,
};

// Isolate-level memory cache — preferences change only via admin API, so a short
// TTL avoids hitting KV on every AI request while keeping admin edits visible
// across isolates within 60s (setPreferences clears the local cache immediately).
const CACHE_TTL_MS = 60 * 1000;
let cachedPrefs: { value: Record<string, unknown>; expiresAt: number } | null = null;

export async function getPreferences(kv: KVNamespace): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cachedPrefs && cachedPrefs.expiresAt > now) {
    return { ...cachedPrefs.value };
  }

  const raw = await kv.get(KV_KEY);
  let value: Record<string, unknown>;
  if (!raw) {
    value = { ...DEFAULTS };
  } else {
    try {
      value = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      value = { ...DEFAULTS };
    }
  }

  cachedPrefs = { value, expiresAt: now + CACHE_TTL_MS };
  return { ...value };
}

export async function setPreferences(kv: KVNamespace, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = await getPreferences(kv);
  const merged = { ...current, ...updates };
  await kv.put(KV_KEY, JSON.stringify(merged));
  // Invalidate local cache so the next read picks up the new value immediately.
  // Other isolates will pick it up within CACHE_TTL_MS via natural expiry.
  cachedPrefs = null;
  return merged;
}

/** Clear the preferences cache — exported for tests. */
export function clearPreferencesCache(): void {
  cachedPrefs = null;
}
