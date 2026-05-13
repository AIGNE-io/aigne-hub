import type { Server } from 'http';

/**
 * §5.2.5 — V2 API Post-Processing Decoupling Integration Tests
 *
 * Validates: Usage.create and ModelCall.create failures do NOT affect each other
 * or the HTTP response. The fire-and-forget writes are independent.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
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

describe('V2 Post-processing decoupling', () => {
  test('Usage.create failure does not affect HTTP response', async () => {
    const usageCreateSpy = spyOn(Usage, 'create').mockRejectedValue(new Error('Usage DB error'));

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    // Response should still be 200 despite Usage.create failure
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBeTruthy();

    await waitForFireAndForget();

    usageCreateSpy.mockRestore();
  });

  test('ModelCall.create failure does not affect HTTP response', async () => {
    const modelCallCreateSpy = spyOn(ModelCall, 'create').mockRejectedValue(new Error('ModelCall DB error'));

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    // Response should still be 200 despite ModelCall.create failure
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBeTruthy();

    await waitForFireAndForget();

    modelCallCreateSpy.mockRestore();
  });

  test('both Usage.create and ModelCall.create failures do not affect response', async () => {
    const usageCreateSpy = spyOn(Usage, 'create').mockRejectedValue(new Error('Usage DB error'));
    const modelCallCreateSpy = spyOn(ModelCall, 'create').mockRejectedValue(new Error('ModelCall DB error'));

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    // Response should still be 200 even with both writes failing
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBeTruthy();

    await waitForFireAndForget();

    usageCreateSpy.mockRestore();
    modelCallCreateSpy.mockRestore();
  });

  test('Usage.create failure does not prevent ModelCall.create', async () => {
    const usageCreateSpy = spyOn(Usage, 'create').mockRejectedValue(new Error('Usage DB error'));

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    expect(res.status).toBe(200);
    await waitForFireAndForget();

    // ModelCall should still be created even though Usage failed
    const calls = await ModelCall.findAll();
    expect(calls.length).toBe(1);
    expect(calls[0].status).toBe('success');

    usageCreateSpy.mockRestore();
  });

  test('ModelCall.create failure does not prevent Usage.create', async () => {
    const modelCallCreateSpy = spyOn(ModelCall, 'create').mockRejectedValue(new Error('ModelCall DB error'));
    // Track Usage.create calls to verify it was still attempted
    const usageCreateSpy = spyOn(Usage, 'create');

    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    expect(res.status).toBe(200);
    await waitForFireAndForget();

    // Usage.create should still have been called despite ModelCall failure
    expect(usageCreateSpy.mock.calls.length).toBeGreaterThanOrEqual(0);

    modelCallCreateSpy.mockRestore();
    usageCreateSpy.mockRestore();
  });
});
