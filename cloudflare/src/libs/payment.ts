import { logger } from './logger';

type PaymentKitBinding = { fetch: (req: Request | string) => Promise<Response> };

export class PaymentClient {
  constructor(
    private service: PaymentKitBinding,
    private authHeaders: Headers
  ) {}

  private async request(path: string, init?: RequestInit): Promise<any> {
    const headers = new Headers(this.authHeaders);
    headers.set('Content-Type', 'application/json');
    const url = `https://internal${path}`;
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
    return this.get(`/api/meters/${encodeURIComponent(eventName)}?livemode=true`);
  }

  async createMeter(data: {
    name: string;
    event_name: string;
    unit: string;
    aggregation_method: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post('/api/meters', { ...data, livemode: true });
  }

  async updateMeter(id: string, data: Record<string, unknown>) {
    return this.put(`/api/meters/${encodeURIComponent(id)}`, { ...data, livemode: true });
  }

  // --- Customers ---

  async ensureCustomer(did: string) {
    return this.get(`/api/customers/${encodeURIComponent(did)}?create=true&livemode=true`);
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
    return this.post('/api/meter-events', { ...payload, livemode: true });
  }

  async getPendingAmount(customerId: string) {
    return this.get(`/api/meter-events/pending-amount?customer_id=${encodeURIComponent(customerId)}&livemode=true`);
  }

  // --- Credit Grants ---

  async getCreditSummary(customerId: string) {
    return this.get(`/api/credit-grants/summary?customer_id=${encodeURIComponent(customerId)}&livemode=true`);
  }

  async verifyAvailability(params: { customer_id: string; currency_id: string; pending_amount?: string }) {
    const qs = new URLSearchParams({ ...params, livemode: 'true' } as Record<string, string>).toString();
    return this.get(`/api/credit-grants/verify-availability?${qs}`);
  }

  async getCreditGrants(params: { customer_id: string; currency_id?: string; page?: number; pageSize?: number }) {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...params, livemode: true })
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return this.get(`/api/credit-grants?${qs}`);
  }

  // --- Credit Transactions ---

  async getCreditTransactions(params: { customer_id: string; meter_id?: string; page?: number; pageSize?: number }) {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...params, livemode: true })
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return this.get(`/api/credit-transactions?${qs}`);
  }

  // --- Payment Currencies ---

  async getPaymentCurrencies() {
    return this.get('/api/payment-currencies?livemode=true');
  }

  async updatePaymentCurrency(id: string, data: Record<string, unknown>) {
    return this.put(`/api/payment-currencies/${encodeURIComponent(id)}`, { ...data, livemode: true });
  }

  async getRechargeConfig(currencyId: string) {
    return this.get(`/api/payment-currencies/${encodeURIComponent(currencyId)}/recharge-config?livemode=true`);
  }

  async updateRechargeConfig(currencyId: string, data: Record<string, unknown>) {
    return this.put(`/api/payment-currencies/${encodeURIComponent(currencyId)}/recharge-config`, {
      ...data,
      livemode: true,
    });
  }

  // --- Products & Prices ---

  async createProduct(data: Record<string, unknown>) {
    return this.post('/api/products', { ...data, livemode: true });
  }

  async getPrice(lookupKey: string) {
    return this.get(`/api/prices/${encodeURIComponent(lookupKey)}?livemode=true`);
  }

  // --- Payment Links ---

  async createPaymentLink(data: Record<string, unknown>) {
    return this.post('/api/payment-links', { ...data, livemode: true });
  }

  async getPaymentLink(lookupKey: string) {
    return this.get(`/api/payment-links/${encodeURIComponent(lookupKey)}?livemode=true`);
  }

  // --- Settings ---

  async getSettings(mountLocation: string) {
    return this.get(`/api/settings/${encodeURIComponent(mountLocation)}?livemode=true`);
  }

  async createSettings(data: Record<string, unknown>) {
    return this.post('/api/settings', { ...data, livemode: true });
  }

  async updateSettings(id: string, data: Record<string, unknown>) {
    return this.put(`/api/settings/${encodeURIComponent(id)}`, { ...data, livemode: true });
  }
}

// --- Constants ---

const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';
const METER_NAME = 'agent-hub-ai-meter';
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
 */
export async function checkUserCreditBalance(
  payment: PaymentClient,
  userDid: string
): Promise<void> {
  const meter = await ensureMeter(payment);
  if (!meter) return; // No meter = no billing

  const customer = await payment.ensureCustomer(userDid);
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
 * Create a PaymentClient from request context.
 * Passes through the user's Cookie and Authorization headers.
 */
export function createPaymentClient(
  service: PaymentKitBinding,
  req: { header: (name: string) => string | undefined }
): PaymentClient {
  const headers = new Headers();
  const cookie = req.header('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  const auth = req.header('Authorization');
  if (auth) headers.set('Authorization', auth);
  return new PaymentClient(service, headers);
}
