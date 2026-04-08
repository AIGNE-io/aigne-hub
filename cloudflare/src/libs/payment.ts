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

// --- Meter cache (module-level, 24h TTL like blocklet version) ---

const METER_NAME = 'agent-hub-ai-meter';
const METER_UNIT = 'AIGNE Hub Credits';
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
