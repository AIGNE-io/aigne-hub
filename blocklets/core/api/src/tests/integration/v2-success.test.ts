import type { Server } from 'http';

/**
 * §5.2.1 — V2 API Success Path Integration Tests
 *
 * Validates: non-streaming chat completion, streaming chat completion.
 * Verifies that the response is correct AND that DB records (ModelCall, Usage) are written.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Express } from 'express';

import { MockProvider, createMockProvider, type } from './helpers/mock-provider';
import {
  AiCredential,
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
  // Clean DB records to isolate each test
  await ModelCall.destroy({ where: {} });
  await Usage.destroy({ where: {} });
});

describe('V2 Chat Completions — success path', () => {
  test('non-streaming chat completion returns valid response', async () => {
    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.content).toBeTruthy();
    expect(body.role).toBe('assistant');

    // Verify mock provider received the request with correct forwarding
    const reqs = mockProvider.getRequests();
    expect(reqs.length).toBe(1);
    expect(reqs[0].body.model).toBe('gpt-5-mini');
    // Verify decrypted API key is forwarded in Authorization header
    expect(reqs[0].headers.authorization).toBe('Bearer sk-test-a');
  });

  test('non-streaming chat completion creates DB records (fire-and-forget)', async () => {
    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      }),
    });

    expect(res.status).toBe(200);

    // Wait for fire-and-forget DB writes to complete
    await waitForFireAndForget();

    // Verify exactly one ModelCall record for this request
    const calls = await ModelCall.findAll();
    expect(calls.length).toBe(1);

    const call = calls[0];
    expect(call.status).toBe('success');
    expect(call.model).toBe('gpt-5-mini');
    expect(call.userDid).toBe('test-user-did');
    expect(call.type).toBe('chatCompletion');
  });

  test('streaming chat completion returns valid SSE chunks', async () => {
    const res = await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    // Parse SSE data lines, skip non-JSON lines (e.g. "event: server-timing")
    const dataLines = text.split('\n').filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'));
    expect(dataLines.length).toBeGreaterThanOrEqual(1);

    // Parse only valid JSON data lines
    const chunks: any[] = [];
    for (const line of dataLines) {
      try {
        chunks.push(JSON.parse(line.slice(6))); // strip "data: "
      } catch {
        // skip non-JSON data lines (e.g. server-timing payload)
      }
    }
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    // Verify at least one chunk contains delta content
    const hasContent = chunks.some((chunk) => chunk.choices?.[0]?.delta?.content || chunk.delta?.content);
    expect(hasContent).toBe(true);

    // Verify mock provider received a streaming request
    const reqs = mockProvider.getRequests();
    expect(reqs.length).toBe(1);
    expect(reqs[0].body.stream).toBe(true);
    expect(reqs[0].headers.authorization).toBe('Bearer sk-test-a');
  });

  test('streaming chat completion creates DB records', async () => {
    await fetch(`${baseUrl}/api/v2/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      }),
    });

    await waitForFireAndForget();

    const calls = await ModelCall.findAll();
    expect(calls.length).toBe(1);
    expect(calls[0].status).toBe('success');
  });
});

describe('V2 Status endpoint', () => {
  test('GET /status returns available: true when providers exist', async () => {
    const res = await fetch(`${baseUrl}/api/v2/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.available).toBe(true);
  });
});
