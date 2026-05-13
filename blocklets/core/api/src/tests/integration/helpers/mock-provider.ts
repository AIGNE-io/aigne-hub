import { IncomingMessage, Server, ServerResponse, createServer } from 'http';

export interface ReceivedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  timestamp: number;
}

interface ResponseBehavior {
  status?: number;
  error?: string;
  delay?: number;
  body?: any;
  /** If set, overrides the streaming response body chunks */
  streamChunks?: string[];
}

export interface MockProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  setResponse(behavior: ResponseBehavior): void;
  /** Set a sequence of responses; each request pops the next behavior.
   *  After exhaustion, falls back to the default (setResponse) behavior. */
  setResponseSequence(behaviors: ResponseBehavior[]): void;
  reset(): void;
  getRequests(): ReceivedRequest[];
  clearRequests(): void;
  url: string;
}

function defaultJsonResponse(): object {
  return {
    id: 'mock-001',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from mock!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function defaultStreamChunks(): string[] {
  const chunk1 = `data: ${JSON.stringify({
    id: 'mock-001',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello from mock!' }, finish_reason: null }],
  })}\n\n`;
  const chunk2 = `data: ${JSON.stringify({
    id: 'mock-001',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  })}\n\n`;
  const done = 'data: [DONE]\n\n';
  return [chunk1, chunk2, done];
}

function errorJson(status: number, message: string): string {
  return JSON.stringify({
    error: {
      message,
      type: status === 401 ? 'authentication_error' : status === 429 ? 'rate_limit_error' : 'server_error',
      code: status === 401 ? 'invalid_api_key' : status === 429 ? 'rate_limit_exceeded' : 'internal_error',
    },
  });
}

export function createMockProvider(): MockProvider {
  let server: Server | null = null;
  let assignedUrl = '';
  let behavior: ResponseBehavior = {};
  let responseQueue: ResponseBehavior[] = [];
  const requests: ReceivedRequest[] = [];

  function getCurrentBehavior(): ResponseBehavior {
    if (responseQueue.length > 0) {
      return responseQueue.shift()!;
    }
    return behavior;
  }

  function handler(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk;
    });
    req.on('end', async () => {
      let parsed: any = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        // non-JSON body is fine for some endpoints
      }

      requests.push({
        method: req.method || 'GET',
        url: req.url || '/',
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: parsed,
        timestamp: Date.now(),
      });

      // Get the behavior for this specific request
      const currentBehavior = getCurrentBehavior();

      // Apply delay if configured
      if (currentBehavior.delay && currentBehavior.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, currentBehavior.delay));
      }

      // Error response
      if (currentBehavior.status && currentBehavior.status >= 400) {
        res.writeHead(currentBehavior.status, { 'Content-Type': 'application/json' });
        res.end(errorJson(currentBehavior.status, currentBehavior.error || `Mock error ${currentBehavior.status}`));
        return;
      }

      // Custom body override
      if (currentBehavior.body) {
        res.writeHead(currentBehavior.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentBehavior.body));
        return;
      }

      // Streaming vs non-streaming
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const chunks = currentBehavior.streamChunks || defaultStreamChunks();
        for (const chunk of chunks) {
          res.write(chunk);
        }
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(defaultJsonResponse()));
      }
    });
  }

  return {
    get url() {
      return assignedUrl;
    },

    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server = createServer(handler);
        server.listen(0, () => {
          const addr = server!.address() as any;
          assignedUrl = `http://localhost:${addr.port}`;
          resolve();
        });
        server.on('error', reject);
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (server) {
          server.close(() => resolve());
          server = null;
        } else {
          resolve();
        }
      });
    },

    setResponse(b: ResponseBehavior): void {
      behavior = b;
    },

    setResponseSequence(behaviors: ResponseBehavior[]): void {
      responseQueue = [...behaviors];
    },

    reset(): void {
      behavior = {};
      responseQueue = [];
    },

    getRequests(): ReceivedRequest[] {
      return [...requests];
    },

    clearRequests(): void {
      requests.length = 0;
    },
  };
}
