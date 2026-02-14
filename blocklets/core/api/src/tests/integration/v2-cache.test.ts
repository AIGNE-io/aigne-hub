import type { Server } from 'http';

/**
 * §5.2.4 — V2 API Cache Behavior Integration Tests
 *
 * Validates: LRU caches (credential, provider, modelRate) avoid repeated DB queries.
 * Verifies: cache invalidation works correctly after credential/provider changes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Express } from 'express';

import { MockProvider, createMockProvider, type } from './helpers/mock-provider';
import {
  AiCredential,
  AiModelRate,
  AiProvider,
  ModelCall,
  Usage,
  clearAllCaches,
  createTestApp,
  createTestDB,
  seedTestData,
  waitForFireAndForget,
} from './helpers/setup';

let mockProvider: MockProvider;
let testDB: Awaited<ReturnType<typeof createTestDB>>;
let app: Express;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  mockProvider = createMockProvider();
  await mockProvider.start();
  testDB = await createTestDB();
  await seedTestData(mockProvider.url);
  app = createTestApp();
  server = app.listen(0);
  const addr = server.address() as any;
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  server?.close();
  await mockProvider?.stop();
  testDB?.restore();
  await testDB?.testSequelize.close();
});

beforeEach(async () => {
  mockProvider.reset();
  mockProvider.clearRequests();
  clearAllCaches();
  await ModelCall.destroy({ where: {} });
  await Usage.destroy({ where: {} });
});

const chatPayload = {
  model: 'openai/gpt-5-mini',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

async function makeRequest(url: string) {
  const res = await fetch(`${url}/api/v2/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatPayload),
  });
  expect(res.status).toBe(200);
  await waitForFireAndForget();
  return res;
}

describe('V2 Cache behavior', () => {
  test('consecutive requests reuse credential cache (zero additional DB queries)', async () => {
    const findAllSpy = spyOn(AiCredential, 'findAll');

    // First request — cache miss, should query DB
    await makeRequest(baseUrl);
    const callsAfterFirst = findAllSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

    // Second request — cache hit, should NOT query DB again for credentials
    await makeRequest(baseUrl);
    const callsAfterSecond = findAllSpy.mock.calls.length;

    // Cache hit: zero additional findAll calls
    expect(callsAfterSecond).toBe(callsAfterFirst);

    findAllSpy.mockRestore();
  });

  test('consecutive requests reuse provider cache (fewer DB queries on second request)', async () => {
    // First request — populates provider cache (cache miss triggers findOne)
    await makeRequest(baseUrl);

    // Attach spy AFTER first request so we only count second-request calls
    const findOneSpy = spyOn(AiProvider, 'findOne');

    // Second request — provider cache should be warm
    await makeRequest(baseUrl);

    // The main getProviderWithCache / getProviderCredentials path should use cache,
    // so findOne should not be called for provider resolution.
    // (Background fire-and-forget writes may still trigger uncached findOne calls,
    //  so we allow at most 1 — but the provider-resolution path must be cached.)
    expect(findOneSpy.mock.calls.length).toBeLessThanOrEqual(1);

    findOneSpy.mockRestore();
  });

  test('consecutive requests reuse model rate cache (zero additional DB queries)', async () => {
    const findAllSpy = spyOn(AiModelRate, 'findAll');

    // First request
    await makeRequest(baseUrl);
    const callsAfterFirst = findAllSpy.mock.calls.length;

    // Second request
    await makeRequest(baseUrl);
    const callsAfterSecond = findAllSpy.mock.calls.length;

    // Cache hit: zero additional findAll calls
    expect(callsAfterSecond).toBe(callsAfterFirst);

    findAllSpy.mockRestore();
  });

  test('clearAllCaches forces re-fetch from DB on next request', async () => {
    const findAllSpy = spyOn(AiCredential, 'findAll');

    // First request — populates cache
    await makeRequest(baseUrl);
    const callsAfterFirst = findAllSpy.mock.calls.length;

    // Clear caches
    clearAllCaches();

    // Next request — cache cleared, should query DB again
    await makeRequest(baseUrl);
    const callsAfterClear = findAllSpy.mock.calls.length;

    // After clearing, at least one more findAll should have been made
    expect(callsAfterClear).toBeGreaterThan(callsAfterFirst);

    findAllSpy.mockRestore();
  });

  test('disableCredential invalidates credential cache', async () => {
    const creds = await AiCredential.findAll();
    const cred = creds[0];

    // Create a second credential so the request can still succeed after disabling the first
    const provider = await AiProvider.findOne({ where: { name: 'openai' } });
    const backupCred = await AiCredential.create({
      providerId: provider!.id,
      name: 'test-key-backup',
      credentialValue: { api_key: 'enc:sk-test-backup' },
      credentialType: 'api_key',
      active: true,
      usageCount: 0,
      weight: 100,
    });
    clearAllCaches();

    // Make a request to populate caches
    await makeRequest(baseUrl);

    // Disable one credential — should clear credential cache
    await AiCredential.disableCredential(cred.id, cred.providerId, 'test disable');

    const findAllSpy = spyOn(AiCredential, 'findAll');

    // Next request should query DB (cache was invalidated by disableCredential)
    await makeRequest(baseUrl);

    // Should have called findAll at least once (cache was cleared)
    expect(findAllSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Cleanup: re-enable credential, deactivate backup
    await AiCredential.update({ active: true, error: null }, { where: { id: cred.id } });
    await AiCredential.update({ active: false }, { where: { id: backupCred.id } });
    clearAllCaches();

    findAllSpy.mockRestore();
  });
});
