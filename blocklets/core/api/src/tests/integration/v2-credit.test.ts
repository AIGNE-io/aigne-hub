import type { Server } from 'http';

import { Config } from '@api/libs/env';
import { invalidateCreditCache } from '@api/libs/payment';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
/**
 * §5.2.6 — V2 API Credit Billing Integration Tests
 *
 * Validates: credit-based billing path including balance check, credit cache,
 * Usage record creation with credit calculation, and cache invalidation.
 *
 * This test enables creditBasedBillingEnabled and mocks the payment kit
 * to simulate a running payment system with user credit balances.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Express } from 'express';

import { MockProvider, createMockProvider, type } from './helpers/mock-provider';
import {
  ModelCall,
  Usage,
  clearAllCaches,
  createTestApp,
  createTestDB,
  seedTestData,
  waitForFireAndForget,
} from './helpers/setup';

const CURRENCY_ID = 'cur-test';

let mockProvider: MockProvider;
let testDB: Awaited<ReturnType<typeof createTestDB>>;
let app: Express;
let server: Server;
let baseUrl: string;

// Save originals to restore in afterAll
let originalCreditBasedBillingEnabled: boolean;
let originalMetersRetrieve: any;
let originalCustomersRetrieve: any;
let originalMeterEventsCreate: any;

// Call trackers
let creditGrantsSummaryCalls: any[];
let meterEventsPendingAmountCalls: any[];
let verifyAvailabilityCalls: any[];

// Configurable response values — changed per test
let mockBalance = '100';
let mockPendingCredit = '0';
let mockCanContinue = false;

beforeAll(async () => {
  mockProvider = createMockProvider();
  await mockProvider.start();
  testDB = await createTestDB();
  await seedTestData(mockProvider.url);
  app = createTestApp();
  server = app.listen(0);
  const addr = server.address() as any;
  baseUrl = `http://localhost:${addr.port}`;

  // Enable credit billing
  originalCreditBasedBillingEnabled = Config.creditBasedBillingEnabled;
  (Config as any)._creditBasedBillingEnabled = true;

  // Make isPaymentRunning() return true
  (config as any).components = [{ did: 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk', status: 'running' }];

  // Save originals from mock payment client
  originalMetersRetrieve = payment.meters.retrieve;
  originalCustomersRetrieve = payment.customers.retrieve;
  originalMeterEventsCreate = payment.meterEvents.create;

  // Add missing payment sub-objects needed by the credit billing path
  if (!(payment as any).settings) {
    (payment as any).settings = {};
  }
  (payment.settings as any).retrieve = async () => ({
    id: 'settings-test',
    settings: { include_events: ['customer.credit_grant.granted', 'checkout.session.completed'] },
  });
  (payment.settings as any).update = async () => ({});
  (payment.settings as any).create = async () => ({ id: 'settings-test' });

  // Override meters.retrieve to return a valid meter
  (payment.meters as any).retrieve = async () => ({
    id: 'meter-test',
    event_name: 'aigne_hub_credit',
    unit: 'AIGNE Hub Credits',
    currency_id: CURRENCY_ID,
    paymentCurrency: { id: CURRENCY_ID },
    metadata: { setting_id: 'settings-test' },
  });
  (payment.meters as any).update = async () => ({});

  // Override customers.retrieve to return a valid customer
  (payment.customers as any).retrieve = async () => ({
    id: 'cust-test',
    did: 'test-user-did',
  });

  // Override meterEvents.create
  (payment.meterEvents as any).create = async () => ({});

  // Add prices.retrieve for credit price lookups
  if (!(payment as any).prices) {
    (payment as any).prices = { list: async () => ({ data: [] }) };
  }
  (payment.prices as any).retrieve = async () => ({ id: 'price-test', unit_amount: 1 });

  // Add paymentCurrencies for currency updates
  if (!(payment as any).paymentCurrencies) {
    (payment as any).paymentCurrencies = {};
  }
  (payment.paymentCurrencies as any).retrieve = async () => ({
    id: CURRENCY_ID,
    prefix: 'credits',
  });
  (payment.paymentCurrencies as any).update = async () => ({});
  (payment.paymentCurrencies as any).list = async () => ({ data: [] });
  (payment.paymentCurrencies as any).getRechargeConfig = async () => null;
  (payment.paymentCurrencies as any).updateRechargeConfig = async () => ({});

  // Add products for credit product creation
  if (!(payment as any).products) {
    (payment as any).products = {};
  }
  (payment.products as any).create = async () => ({ id: 'product-test' });

  // Add paymentLinks for credit payment link
  if (!(payment as any).paymentLinks) {
    (payment as any).paymentLinks = {};
  }
  (payment.paymentLinks as any).retrieve = async () => null;
  (payment.paymentLinks as any).create = async () => ({ id: 'link-test', url: 'http://localhost/pay' });
  (payment.paymentLinks as any).update = async () => ({});

  // Add summary and pendingAmount methods (not in original mock)
  (payment.creditGrants as any).summary = async (...args: any[]) => {
    creditGrantsSummaryCalls.push(args);
    return {
      [CURRENCY_ID]: {
        remainingAmount: mockBalance,
        totalAmount: mockBalance,
        grantCount: 1,
      },
    };
  };

  (payment.meterEvents as any).pendingAmount = async (...args: any[]) => {
    meterEventsPendingAmountCalls.push(args);
    return { [CURRENCY_ID]: mockPendingCredit };
  };

  (payment.creditGrants as any).verifyAvailability = async (...args: any[]) => {
    verifyAvailabilityCalls.push(args);
    return { can_continue: mockCanContinue };
  };
});

afterAll(async () => {
  server?.close();
  await mockProvider?.stop();
  testDB?.restore();
  await testDB?.testSequelize.close();

  // Restore original state
  (Config as any)._creditBasedBillingEnabled = originalCreditBasedBillingEnabled;
  (config as any).components = [];
  (payment.meters as any).retrieve = originalMetersRetrieve;
  (payment.customers as any).retrieve = originalCustomersRetrieve;
  (payment.meterEvents as any).create = originalMeterEventsCreate;
});

beforeEach(async () => {
  mockProvider.reset();
  mockProvider.clearRequests();
  clearAllCaches();
  await ModelCall.destroy({ where: {} });
  await Usage.destroy({ where: {} });

  // Reset trackers and default values
  creditGrantsSummaryCalls = [];
  meterEventsPendingAmountCalls = [];
  verifyAvailabilityCalls = [];
  mockBalance = '100';
  mockPendingCredit = '0';
  mockCanContinue = false;
});

const chatPayload = {
  model: 'openai/gpt-5-mini',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

describe('V2 Credit billing path', () => {
  test('request succeeds when user has positive credit balance', async () => {
    mockBalance = '100';

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBeTruthy();

    // creditGrants.summary should have been called for balance check
    expect(creditGrantsSummaryCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('request creates Usage record with calculated credits', async () => {
    mockBalance = '100';

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    expect(res.status).toBe(200);
    await waitForFireAndForget(500);

    // Verify Usage record was created with credit calculation
    const usages = await Usage.findAll();
    expect(usages.length).toBe(1);
    expect(usages[0].userDid).toBe('test-user-did');
    expect(usages[0].model).toBeTruthy();
    // usedCredits should be > 0 since inputRate=0.001, outputRate=0.002
    // and mock returns prompt_tokens=10, completion_tokens=5
    expect(usages[0].usedCredits).toBeGreaterThan(0);

    // Verify ModelCall was also created
    const calls = await ModelCall.findAll();
    expect(calls.length).toBe(1);
    expect(calls[0].status).toBe('success');
  });

  test('credit cache hit on consecutive requests (no re-fetch)', async () => {
    mockBalance = '100';

    // First request — cache miss, should call creditGrants.summary
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });
    const summaryCallsAfterFirst = creditGrantsSummaryCalls.length;
    expect(summaryCallsAfterFirst).toBeGreaterThanOrEqual(1);

    // Second request — positive balance cached, should NOT call summary again
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });
    const summaryCallsAfterSecond = creditGrantsSummaryCalls.length;

    // Zero additional summary calls — cache hit
    expect(summaryCallsAfterSecond).toBe(summaryCallsAfterFirst);
  });

  test('invalidateCreditCache forces re-fetch on next request', async () => {
    mockBalance = '100';

    // First request — populates credit cache
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });
    const summaryCallsAfterFirst = creditGrantsSummaryCalls.length;

    // Invalidate the credit cache (simulates what happens after meter event)
    invalidateCreditCache('test-user-did');

    // Next request — cache cleared, should re-fetch
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });
    const summaryCallsAfterInvalidation = creditGrantsSummaryCalls.length;

    expect(summaryCallsAfterInvalidation).toBeGreaterThan(summaryCallsAfterFirst);
  });

  test('zero balance without auto-purchase returns 402', async () => {
    mockBalance = '0';
    mockCanContinue = false;

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    // Should be rejected with 402 (insufficient credits)
    expect(res.status).toBe(402);

    // Verify verifyAvailability was called to check auto-purchase
    expect(verifyAvailabilityCalls.length).toBeGreaterThanOrEqual(1);

    // No request should have been forwarded to the provider
    const reqs = mockProvider.getRequests();
    expect(reqs.length).toBe(0);
  });

  test('zero balance with auto-purchase allowed succeeds', async () => {
    mockBalance = '0';
    mockCanContinue = true;

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    // Should succeed because auto-purchase allows continuation
    expect(res.status).toBe(200);

    // Provider should have received the request
    const reqs = mockProvider.getRequests();
    expect(reqs.length).toBe(1);
  });

  test('zero balance is NOT cached (always re-fetches)', async () => {
    mockBalance = '0';
    mockCanContinue = true;

    // First request — zero balance, should call summary
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });
    const summaryCallsAfterFirst = creditGrantsSummaryCalls.length;

    // Second request — zero balance should NOT use cache, should re-fetch
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });
    const summaryCallsAfterSecond = creditGrantsSummaryCalls.length;

    // Zero balance should trigger a new summary call each time
    expect(summaryCallsAfterSecond).toBeGreaterThan(summaryCallsAfterFirst);
  });

  test('Usage.create failure does not block response when billing enabled', async () => {
    mockBalance = '100';

    const originalCreate = Usage.create.bind(Usage);
    (Usage as any).create = async () => {
      throw new Error('Usage DB error');
    };

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    // Response should still be 200 despite Usage.create failure
    expect(res.status).toBe(200);
    await waitForFireAndForget();

    // ModelCall should still be created
    const calls = await ModelCall.findAll();
    expect(calls.length).toBe(1);
    expect(calls[0].status).toBe('success');

    (Usage as any).create = originalCreate;
  });
});
