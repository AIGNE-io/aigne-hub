import { IncomingMessage, Server, ServerResponse, createServer } from 'http';

let server: Server | null = null;

function jsonResponse(): string {
  return JSON.stringify({
    id: 'mock-001',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  });
}

function streamResponse(): string[] {
  const chunk1 = `data: ${JSON.stringify({
    id: 'mock-001',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello!' }, finish_reason: null }],
  })}\n\n`;
  const chunk2 = `data: ${JSON.stringify({
    id: 'mock-001',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  })}\n\n`;
  const done = 'data: [DONE]\n\n';
  return [chunk1, chunk2, done];
}

function handler(req: IncomingMessage, res: ServerResponse): void {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        for (const chunk of streamResponse()) {
          res.write(chunk);
        }
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(jsonResponse());
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

export function startMockProvider(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer(handler);
    server.listen(port, () => {
      console.log(`  Mock provider listening on http://localhost:${port}/v1/chat/completions`);
      resolve();
    });
    server.on('error', reject);
  });
}

export function stopMockProvider(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}
