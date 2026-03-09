import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Message, Model, ModelResponseChunk, ModelResponseStream } from '@aigne/model-base';
import { onModelResponseStreamEnd } from '@aigne/model-base';
import { z } from 'zod';

export interface HubModelHTTPServerHooks {
  onEnd?: (data: { output: any }) => Promise<void | { output?: any }>;
  onError?: (data: { error: Error }) => Promise<void>;
}

export const invokePayloadSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  options: z
    .object({
      streaming: z
        .boolean()
        .nullish()
        .transform((v) => v ?? undefined),
    })
    .nullish()
    .transform((v) => v ?? undefined),
});

class ServerError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// Inline SSE stream — equivalent to ModelResponseStreamSSE from @aigne/model-base/transport/event-stream
class ModelResponseStreamSSE<O extends Message> extends ReadableStream<string> {
  constructor(stream: ModelResponseStream<O>) {
    let reader: ReadableStreamDefaultReader<ModelResponseChunk<O>> | undefined;

    super({
      async pull(controller) {
        reader ??= stream.getReader();
        try {
          const { value, done } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(`data: ${JSON.stringify(value)}\n\n`);
        } catch (error: any) {
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
          controller.close();
        }
      },
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIncomingMessage(request: unknown): request is IncomingMessage {
  return isRecord(request) && 'method' in request && 'headers' in request && 'url' in request;
}

export class HubModelHTTPServer {
  private hooks?: HubModelHTTPServerHooks;

  constructor(
    public model: Model,
    hooks?: HubModelHTTPServerHooks
  ) {
    this.hooks = hooks;
  }

  async invoke(request: Record<string, unknown> | Request | IncomingMessage): Promise<Response>;
  async invoke(request: Record<string, unknown> | Request | IncomingMessage, response: ServerResponse): Promise<void>;
  async invoke(
    request: Record<string, unknown> | Request | IncomingMessage,
    response?: ServerResponse
  ): Promise<Response | void> {
    const result = await this._invoke(request);

    if (response) {
      await this._writeResponse(result, response);
      return;
    }

    return result;
  }

  private async _invoke(request: Record<string, unknown> | Request | IncomingMessage): Promise<Response> {
    try {
      const payload = await this._prepareInput(request);

      let parsed: z.infer<typeof invokePayloadSchema>;
      try {
        parsed = invokePayloadSchema.parse(payload);
      } catch (e: any) {
        throw new ServerError(400, e.message);
      }

      const { input, options: { streaming } = {} } = parsed;

      if (!streaming) {
        let output = await this.model.invoke(input);
        if (this.hooks?.onEnd) {
          const result = await this.hooks.onEnd({ output });
          if (result?.output) output = { ...output, ...result.output };
        }
        return new Response(JSON.stringify(output), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let stream = await this.model.invoke(input, { streaming: true });

      if (this.hooks) {
        const { onEnd, onError } = this.hooks;
        stream = onModelResponseStreamEnd(stream, {
          onResult: async (result) => {
            if (onEnd) {
              const r = await onEnd({ output: result });
              if (r?.output) return r.output;
            }
          },
          onError: async (error) => {
            if (onError) await onError({ error });
            return error;
          },
        });
      }

      return new Response(new ModelResponseStreamSSE(stream), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (error: any) {
      if (this.hooks?.onError) await this.hooks.onError({ error });
      return new Response(JSON.stringify({ error: { message: error.message } }), {
        status: error.status || 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async _prepareInput(
    request: Record<string, unknown> | Request | IncomingMessage
  ): Promise<Record<string, unknown>> {
    if (request instanceof Request) {
      return request.json();
    }

    if (isIncomingMessage(request)) {
      // Support for express with json() middleware
      if ('body' in request && isRecord((request as any).body)) {
        return (request as any).body as Record<string, unknown>;
      }

      throw new ServerError(415, 'Unsupported Media Type');
    }

    if (!isRecord(request)) throw new ServerError(415, 'Unsupported Media Type');

    return request;
  }

  private async _writeResponse(response: Response, res: ServerResponse): Promise<void> {
    try {
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.flushHeaders();

      if (!response.body) throw new Error('Response body is empty');

      for await (const chunk of response.body as any) {
        res.write(chunk);

        // Support for express with compression middleware
        if ('flush' in res && typeof res.flush === 'function') {
          (res as any).flush();
        }
      }
    } catch (error: any) {
      if (!res.headersSent) {
        res.writeHead(error instanceof ServerError ? error.status : 500, {
          'Content-Type': 'application/json',
        });
      }
      if (res.writable) {
        res.write(JSON.stringify({ error: { message: error.message } }));
      }
    } finally {
      res.end();
    }
  }
}
