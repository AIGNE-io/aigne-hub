import { logger } from './logger';
import { addNotification, buildCreditGrantedNotification } from './notifications';

type PaymentKitBinding = { fetch: (req: Request | string) => Promise<Response> };

export class PaymentClient {
  private livemode: boolean;

  constructor(
    private service: PaymentKitBinding,
    private authHeaders: Headers,
    livemode = true
  ) {
    this.livemode = livemode;
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    const headers = new Headers(this.authHeaders);
    headers.set('Content-Type', 'application/json');
    // Always append livemode to query string — Payment Kit reads from req.query.livemode
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://internal${path}${separator}livemode=${this.livemode}`;
    const resp = await this.service.fetch(new Request(url, { ...init, headers }));
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.error('Payment Kit request failed', { path, status: resp.status, body: text.substring(0, 200) });
      throw new Error(`Payment Kit ${path}: ${resp.status} ${text.substring(0, 200)}`);
    }
    return resp.json();
  }

  private async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET' });
  }

  private async post(path: string, data: unknown): Promise<any> {
    return this.request(path, { method: 'POST', body: JSON.stringify(data) });
  }

  private async put(path: string, data: unknown): Promise<any> {
    return this.request(path, { method: 'PUT', body: JSON.stringify(data) });
  }

  // --- Meters ---

  async getMeter(eventName: string) {
    return this.get(`/api/meters/${encodeURIComponent(eventName)}`);
  }

  async createMeter(data: {
    name: string;
    event_name: string;
    unit: string;
    aggregation_method: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post('/api/meters', data);
  }

  async updateMeter(id: string, data: Record<string, unknown>) {
    return this.put(`/api/meters/${encodeURIComponent(id)}`, data);
  }

  // --- Customers ---

  async ensureCustomer(did: string) {
    return this.get(`/api/customers/${encodeURIComponent(did)}?create=true`);
  }

  // --- Meter Events ---

  async createMeterEvent(payload: {
    event_name: string;
    timestamp: number;
    payload: { customer_id: string; value: string };
    identifier: string;
    metadata?: Record<string, unknown>;
    source_data?: Record<string, unknown>;
  }) {
    return this.post('/api/meter-events', payload);
  }

  async getPendingAmount(customerId: string) {
    return this.get(`/api/meter-events/pending-amount?customer_id=${encodeURIComponent(customerId)}`);
  }

  // --- Credit Grants ---

  async createCreditGrant(data: {
    customer_id: string;
    currency_id: string;
    amount: string;
    name: string;
    expires_at?: number;
    category?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post('/api/credit-grants', data);
  }

  async getCreditSummary(customerId: string) {
    return this.get(`/api/credit-grants/summary?customer_id=${encodeURIComponent(customerId)}`);
  }

  async verifyAvailability(params: { customer_id: string; currency_id: string; pending_amount?: string }) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return this.get(`/api/credit-grants/verify-availability?${qs}`);
  }

  async getCreditGrants(params: { customer_id: string; currency_id?: string; page?: number; pageSize?: number }) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    ).toString();
    return this.get(`/api/credit-grants?${qs}`);
  }

  // --- Credit Transactions ---

  async getCreditTransactions(params: { customer_id: string; meter_id?: string; page?: number; pageSize?: number }) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    ).toString();
    return this.get(`/api/credit-transactions?${qs}`);
  }

  // --- Payment Currencies ---

  async getPaymentCurrencies() {
    return this.get('/api/payment-currencies');
  }

  async updatePaymentCurrency(id: string, data: Record<string, unknown>) {
    return this.put(`/api/payment-currencies/${encodeURIComponent(id)}`, data);
  }

  async getRechargeConfig(currencyId: string) {
    return this.get(`/api/payment-currencies/${encodeURIComponent(currencyId)}/recharge-config`);
  }

  async updateRechargeConfig(currencyId: string, data: Record<string, unknown>) {
    return this.put(`/api/payment-currencies/${encodeURIComponent(currencyId)}/recharge-config`, data);
  }

  // --- Products & Prices ---

  async createProduct(data: Record<string, unknown>) {
    return this.post('/api/products', data);
  }

  async getPrice(lookupKey: string) {
    return this.get(`/api/prices/${encodeURIComponent(lookupKey)}`);
  }

  // --- Payment Links ---

  async createPaymentLink(data: Record<string, unknown>) {
    return this.post('/api/payment-links', data);
  }

  async getPaymentLink(lookupKey: string) {
    return this.get(`/api/payment-links/${encodeURIComponent(lookupKey)}`);
  }

  // --- Settings ---

  async getSettings(mountLocation: string) {
    return this.get(`/api/settings/${encodeURIComponent(mountLocation)}`);
  }

  async createSettings(data: Record<string, unknown>) {
    return this.post('/api/settings', data);
  }

  async updateSettings(id: string, data: Record<string, unknown>) {
    return this.put(`/api/settings/${encodeURIComponent(id)}`, data);
  }
}

// --- Constants ---

const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';
const METER_NAME = 'agent-hub-ai-meter-v2';
const METER_UNIT = 'AIGNE Hub Credits';
const CREDIT_PRICE_KEY = 'DEFAULT_CREDIT_UNIT_PRICE';
const CREDIT_PAYMENT_LINK_KEY = 'DEFAULT_CREDIT_PAYMENT_LINK';
const NOTIFICATION_EVENTS = ['customer.credit_grant.granted', 'checkout.session.completed'];

// --- Meter cache (module-level, 24h TTL like blocklet version) ---

const METER_CACHE_TTL = 24 * 60 * 60 * 1000;
let meterCache: { meter: any; timestamp: number } | null = null;

export function clearMeterCache() {
  meterCache = null;
}

export async function ensureMeter(payment: PaymentClient): Promise<any> {
  if (meterCache && Date.now() - meterCache.timestamp < METER_CACHE_TTL) {
    return meterCache.meter;
  }

  try {
    const meter = await payment.getMeter(METER_NAME);
    if (meter && meter.unit !== METER_UNIT) {
      await payment.updateMeter(meter.id, { unit: METER_UNIT });
    }
    meterCache = { meter, timestamp: Date.now() };
    return meter;
  } catch {
    const meter = await payment.createMeter({
      name: 'AIGNE Hub AI Meter',
      event_name: METER_NAME,
      unit: METER_UNIT,
      aggregation_method: 'sum',
    });
    meterCache = { meter, timestamp: Date.now() };
    return meter;
  }
}

// --- Notification settings ---

let notificationSettingsEnsured = false;

async function ensureNotificationSettings(payment: PaymentClient): Promise<any> {
  if (notificationSettingsEnsured) return;
  try {
    const settings = await payment.getSettings(AIGNE_HUB_DID);
    if (settings) {
      const existing = settings.settings?.include_events || [];
      const missing = NOTIFICATION_EVENTS.filter((e) => !existing.includes(e));
      if (missing.length > 0) {
        await payment.updateSettings(settings.id, {
          settings: { ...settings.settings, include_events: NOTIFICATION_EVENTS },
        });
      }
    } else {
      await payment.createSettings({
        type: 'notification',
        mountLocation: AIGNE_HUB_DID,
        description: 'AIGNE Hub Notification Settings',
        settings: { self_handle: true, include_events: NOTIFICATION_EVENTS },
      });
    }
    notificationSettingsEnsured = true;
  } catch (err) {
    logger.error('Failed to ensure notification settings', { error: err instanceof Error ? err.message : String(err) });
  }
}

// --- Credit price & payment link (for purchasing credits) ---

let creditPaymentLinkCache: string | null = null;

/**
 * Ensure default credit price exists in Payment Kit.
 * Creates product + price if not found.
 */
async function ensureDefaultCreditPrice(payment: PaymentClient): Promise<any> {
  try {
    return await payment.getPrice(CREDIT_PRICE_KEY);
  } catch {
    const currencies = await payment.getPaymentCurrencies();
    const currencyList = currencies?.list || currencies || [];
    if (currencyList.length === 0) {
      logger.error('No payment currencies found');
      return null;
    }
    const meter = await ensureMeter(payment);
    if (!meter) return null;

    await payment.createProduct({
      name: 'Basic AIGNE Hub Credit Packs',
      description: `Basic pack of ${METER_UNIT} credits.`,
      type: 'credit',
      prices: [
        {
          type: 'one_time',
          unit_amount: '1',
          currency_id: currencyList[0].id,
          currency_options: currencyList.map((c: any) => ({ currency_id: c.id, unit_amount: '1' })),
          lookup_key: CREDIT_PRICE_KEY,
          nickname: 'Per Unit Credit For AIGNE Hub',
          metadata: {
            credit_config: {
              priority: 50,
              valid_duration_value: 0,
              valid_duration_unit: 'days',
              currency_id: meter.currency_id,
              credit_amount: '1',
            },
            meter_id: meter.id,
          },
        },
      ],
    });
    return await payment.getPrice(CREDIT_PRICE_KEY);
  }
}

/**
 * Get or create a payment link for credit purchasing.
 * Returns a URL path like `/payment/checkout/pay/plink_xxx`.
 */
export async function getCreditPaymentLink(payment: PaymentClient): Promise<string | null> {
  if (creditPaymentLinkCache) return creditPaymentLinkCache;

  try {
    await ensureNotificationSettings(payment);
    const price = await ensureDefaultCreditPrice(payment);
    if (!price) return null;

    let paymentLink: any;
    try {
      paymentLink = await payment.getPaymentLink(CREDIT_PAYMENT_LINK_KEY);
    } catch {
      // Create new payment link
      paymentLink = await payment.createPaymentLink({
        name: price.product?.name || 'AIGNE Hub Credits',
        lookup_key: CREDIT_PAYMENT_LINK_KEY,
        line_items: [
          {
            price_id: price.id,
            quantity: 1,
            adjustable_quantity: { enabled: true, minimum: 1, maximum: 100000000 },
          },
        ],
        metadata: {
          notification_settings: { include_events: NOTIFICATION_EVENTS, self_handle: true },
        },
      });
    }

    if (paymentLink) {
      // Update recharge config so Payment Kit knows about the payment link
      try {
        const currencyId = price.metadata?.credit_config?.currency_id || meterCache?.meter?.currency_id;
        if (!currencyId) throw new Error('no currency_id');
        await payment.updateRechargeConfig(currencyId, {
          base_price_id: price.id,
          payment_link_id: paymentLink.id,
          checkout_url: `/payment/checkout/pay/${paymentLink.id}`,
        });
      } catch { /* non-critical */ }

      creditPaymentLinkCache = `/payment/checkout/pay/${paymentLink.id}`;
      return creditPaymentLinkCache;
    }
    return null;
  } catch (err) {
    logger.error('Failed to get credit payment link', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Check user credit balance and throw 402 with payment link if insufficient.
 * Parallelizes Service Binding calls to minimize latency.
 */
export async function checkUserCreditBalance(
  payment: PaymentClient,
  userDid: string
): Promise<void> {
  // Phase 1: ensureMeter (cached 24h) + ensureCustomer in parallel
  const [meter, customer] = await Promise.all([
    ensureMeter(payment),
    payment.ensureCustomer(userDid),
  ]);
  if (!meter) return; // No meter = no billing

  // Phase 2: summary + pending in parallel (both need customer.id)
  const [summary, pending] = await Promise.all([
    payment.getCreditSummary(customer.id),
    payment.getPendingAmount(customer.id),
  ]);

  const currencyId = meter.currency_id;
  const balance = parseFloat(summary?.[currencyId]?.remainingAmount ?? '0');
  const pendingAmount = parseFloat(pending?.[currencyId] ?? '0');
  const netBalance = Math.max(0, balance - pendingAmount);

  if (netBalance > 0) return;

  // Check auto-recharge
  try {
    const result = await payment.verifyAvailability({
      customer_id: customer.id,
      currency_id: currencyId,
      pending_amount: String(pendingAmount),
    });
    if (result.can_continue) return;
  } catch { /* treat as insufficient */ }

  // Get payment link for 402 response
  const paymentLink = await getCreditPaymentLink(payment);

  throw new CreditError(paymentLink);
}

/**
 * Error thrown when user has insufficient credits.
 * Contains payment link for the frontend to redirect to.
 */
export class CreditError extends Error {
  public status = 402;
  public paymentLink: string | null;

  constructor(paymentLink: string | null) {
    super('Insufficient credits');
    this.name = 'CreditError';
    this.paymentLink = paymentLink;
  }

  toJSON() {
    return {
      error: { message: this.message, type: 'CREDIT_NOT_ENOUGH', paymentLink: this.paymentLink },
    };
  }
}

/**
 * Grant welcome credits to a new user if enabled in preferences.
 * Uses KV key `credit-granted:{did}` to prevent duplicate grants.
 * Mirrors the Blocklet Server behavior from listeners/listen.ts.
 */
export async function grantNewUserCredits(
  payment: PaymentClient,
  userDid: string,
  kv: KVNamespace,
  preferences: Record<string, unknown>
): Promise<boolean> {
  if (!preferences.creditBasedBillingEnabled || !preferences.newUserCreditGrantEnabled) return false;

  const creditAmount = Number(preferences.newUserCreditGrantAmount) || 0;
  if (creditAmount <= 0) return false;

  const kvKey = `credit-granted:${userDid}`;
  const already = await kv.get(kvKey);
  if (already) return false;

  try {
    const customer = await payment.ensureCustomer(userDid);
    const meter = await ensureMeter(payment);
    if (!meter?.currency_id) return false;

    // Check if user already has grants (same safety check as original)
    const summary = await payment.getCreditSummary(customer.id);
    const currencyId = meter.currency_id;
    if (parseFloat(summary?.[currencyId]?.totalAmount ?? '0') > 0) {
      await kv.put(kvKey, '1');
      return false;
    }

    const expirationDays = Number(preferences.creditExpirationDays) || 0;
    const expiresAt = expirationDays > 0
      ? Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60
      : 0;

    await payment.createCreditGrant({
      customer_id: customer.id,
      currency_id: currencyId,
      amount: String(creditAmount),
      name: 'New user bonus credit',
      expires_at: expiresAt > 0 ? expiresAt : undefined,
      category: 'promotional',
      metadata: { welcomeCredit: true },
    });

    await kv.put(kvKey, '1');
    await addNotification(kv, userDid, buildCreditGrantedNotification({
      amount: creditAmount,
      isWelcome: true,
    }));
    logger.info('Granted welcome credits', { userDid, amount: creditAmount });
    return true;
  } catch (err) {
    logger.error('Failed to grant welcome credits', {
      userDid,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Create an internal PaymentClient for cron/background tasks (no user session).
 * Authenticates via x-user-did + x-user-role headers, which Payment Kit's
 * CF shim trusts (AUTH_SERVICE.resolveIdentity is bypassed for header-injected identity).
 */
export function createInternalPaymentClient(
  service: PaymentKitBinding,
  instanceDid: string,
  env?: { PAYMENT_LIVEMODE?: string }
): PaymentClient {
  const headers = new Headers();
  headers.set('x-user-did', instanceDid);
  headers.set('x-user-role', 'blocklet-owner');
  headers.set('x-user-provider', 'wallet');
  headers.set('x-user-fullname', 'system');
  const livemode = env?.PAYMENT_LIVEMODE !== undefined ? env.PAYMENT_LIVEMODE === 'true' : true;
  return new PaymentClient(service, headers, livemode);
}

/**
 * Create a PaymentClient from request context.
 * Passes through the user's Cookie and Authorization headers.
 */
export function createPaymentClient(
  service: PaymentKitBinding,
  req: { header: (name: string) => string | undefined },
  env?: { PAYMENT_LIVEMODE?: string }
): PaymentClient {
  const headers = new Headers();
  const cookie = req.header('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  const auth = req.header('Authorization');
  if (auth) headers.set('Authorization', auth);
  const livemode = env?.PAYMENT_LIVEMODE !== undefined ? env.PAYMENT_LIVEMODE === 'true' : true;
  return new PaymentClient(service, headers, livemode);
}
