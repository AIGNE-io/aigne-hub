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

export async function getPreferences(kv: KVNamespace): Promise<Record<string, unknown>> {
  const raw = await kv.get(KV_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setPreferences(kv: KVNamespace, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = await getPreferences(kv);
  const merged = { ...current, ...updates };
  await kv.put(KV_KEY, JSON.stringify(merged));
  return merged;
}
