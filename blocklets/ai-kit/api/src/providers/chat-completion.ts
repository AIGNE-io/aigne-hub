/* eslint-disable consistent-return */
import { IncomingMessage, ServerResponse } from 'node:http';

import type { InvokeOptions, UserContext } from '@aigne/core';
import { AgentResponseStreamSSE } from '@aigne/core/utils/event-stream';
import { checkArguments, isRecord, tryOrThrow } from '@aigne/core/utils/type-utils';
import contentType from 'content-type';
import getRawBody from 'raw-body';
import { z } from 'zod';

import { getModel } from './models';

// Constants
const DEFAULT_MAXIMUM_BODY_SIZE = '4mb';
const CONTENT_TYPE_JSON = 'application/json';
const CONTENT_TYPE_EVENT_STREAM = 'text/event-stream';

// HTTP Status Codes
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Error Messages
const ERROR_MESSAGES = {
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported Media Type: Content-Type must be application/json',
  RESPONSE_BODY_EMPTY: 'Response body is empty',
  MODEL_NOT_FOUND: (model: string) => `Model ${model} not found`,
  JSON_PARSE_ERROR: (message: string) => `Parse request body to json error: ${message}`,
} as const;

// Enhanced ServerError class with better error categorization
class ServerError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ServerError';
  }

  static badRequest(message: string): ServerError {
    return new ServerError(HTTP_STATUS.BAD_REQUEST, message);
  }

  static notFound(message: string): ServerError {
    return new ServerError(HTTP_STATUS.NOT_FOUND, message);
  }

  static unsupportedMediaType(message: string = ERROR_MESSAGES.UNSUPPORTED_MEDIA_TYPE): ServerError {
    return new ServerError(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, message);
  }

  static internalError(message: string): ServerError {
    return new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, message);
  }
}

interface ChatServerOptions {
  maximumBodySize?: string;
}

// Improved schema with better validation
const invokePayloadSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  options: z
    .object({
      streaming: z
        .boolean()
        .nullish()
        .transform((v) => v ?? undefined),
      returnProgressChunks: z
        .boolean()
        .nullish()
        .transform((v) => v ?? undefined),
      userContext: z
        .record(z.string(), z.unknown())
        .nullish()
        .transform((v) => v ?? undefined),
      memories: z
        .array(z.object({ content: z.custom<object>() }))
        .nullish()
        .transform((v) => v ?? undefined),
    })
    .nullish()
    .transform((v) => v ?? undefined),
});

interface ChatServerInvokeOptions<U extends UserContext = UserContext>
  extends Pick<InvokeOptions<U>, 'returnProgressChunks' | 'userContext' | 'memories'> {}

// Type alias for better readability
type RequestInput = Record<string, unknown> | Request | IncomingMessage;

export class ChatCompletion {
  constructor(public options?: ChatServerOptions) {}

  async invoke(request: RequestInput, options?: ServerResponse | ChatServerInvokeOptions): Promise<Response>;
  async invoke(request: RequestInput, response: ServerResponse, options?: ChatServerInvokeOptions): Promise<void>;
  async invoke(
    request: RequestInput,
    response?: ServerResponse | ChatServerInvokeOptions,
    options?: ChatServerInvokeOptions
  ): Promise<Response | void> {
    const opts = !(response instanceof ServerResponse) ? options || response : options;

    const result = await this._invoke(request, {
      userContext: opts?.userContext,
      memories: opts?.memories,
    });

    if (response instanceof ServerResponse) {
      await this._writeResponse(result, response);
      return;
    }

    return result;
  }

  async _invoke(request: RequestInput, options: ChatServerInvokeOptions = {}): Promise<Response> {
    try {
      const payload = await this._prepareInput(request);
      const { input, options: { streaming = false, ...opts } = {} } = tryOrThrow(
        () => checkArguments(`Invoke model ${payload.model}`, invokePayloadSchema as any, payload),
        (error) => ServerError.badRequest(error.message)
      );

      const model = getModel(input);
      if (!model) throw ServerError.notFound(ERROR_MESSAGES.MODEL_NOT_FOUND(input.model));

      const mergedOptions: InvokeOptions = {
        returnProgressChunks: opts.returnProgressChunks,
        userContext: { ...opts.userContext, ...options.userContext },
        memories: [...(opts.memories ?? []), ...(options.memories ?? [])],
      };

      if (!streaming) {
        const result = await model.invoke(input, mergedOptions);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': CONTENT_TYPE_JSON } });
      }

      const stream = await model.invoke(input, {
        ...mergedOptions,
        streaming: true,
      });

      return new Response(new AgentResponseStreamSSE(stream), {
        headers: {
          'Content-Type': CONTENT_TYPE_EVENT_STREAM,
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: { message: error.message } }), {
        status: error instanceof ServerError ? error.status : HTTP_STATUS.INTERNAL_SERVER_ERROR,
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
      });
    }
  }

  async _prepareInput(request: RequestInput): Promise<Record<string, unknown>> {
    const contentTypeError = ServerError.unsupportedMediaType();

    if (request instanceof IncomingMessage) {
      // Support for express with json() middleware
      if ('body' in request && typeof request.body === 'object') {
        if (!isRecord(request.body)) throw contentTypeError;

        return request.body;
      }

      // Support vanilla nodejs http server
      const maximumBodySize = this.options?.maximumBodySize || DEFAULT_MAXIMUM_BODY_SIZE;

      const ct = request.headers['content-type'];
      if (!ct || !ct.includes(CONTENT_TYPE_JSON)) throw contentTypeError;

      const parsedCt = contentType.parse(ct);

      const raw = await getRawBody(request, {
        limit: maximumBodySize,
        encoding: parsedCt.parameters.charset ?? 'utf-8',
      });

      return tryOrThrow(
        () => JSON.parse(raw.toString()),
        (error) => ServerError.badRequest(ERROR_MESSAGES.JSON_PARSE_ERROR(error.message))
      );
    }

    if (request instanceof Request) {
      if (!request.headers.get('content-type')?.includes(CONTENT_TYPE_JSON)) {
        throw contentTypeError;
      }

      return request.json();
    }

    if (!isRecord(request)) throw contentTypeError;

    return request;
  }

  async _writeResponse(response: Response, res: ServerResponse): Promise<void> {
    try {
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.flushHeaders();

      if (!response.body) throw new Error(ERROR_MESSAGES.RESPONSE_BODY_EMPTY);

      for await (const chunk of response.body) {
        res.write(chunk);

        // Support for express with compression middleware
        if ('flush' in res && typeof res.flush === 'function') {
          res.flush();
        }
      }
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(error instanceof ServerError ? error.status : HTTP_STATUS.INTERNAL_SERVER_ERROR, {
          'Content-Type': CONTENT_TYPE_JSON,
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
