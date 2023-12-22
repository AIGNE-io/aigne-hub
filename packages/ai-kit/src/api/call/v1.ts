import type { IncomingMessage } from 'http';
import { ReadableStream, TextDecoderStream } from 'stream/web';

import { call } from '@blocklet/sdk/lib/component';
import { AxiosResponse, isAxiosError } from 'axios';

import {
  ChatCompletionChunk,
  ChatCompletionInput,
  EmbeddingInput,
  EmbeddingResponse,
  ImageGenerationInput,
  ImageGenerationResponse,
  isChatCompletionError,
} from '../types';
import { StatusResponse } from '../types/status';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import { EventSourceParserStream, readableToWeb, tryParseJsonFromResponseStream } from '../utils/event-stream';
import aiKitApi from './api';

export async function status(options?: {
  useAiKitService?: boolean;
  responseType?: undefined;
}): Promise<StatusResponse>;
export async function status(options: {
  useAiKitService?: boolean;
  responseType: 'stream';
}): Promise<AxiosResponse<IncomingMessage, any>>;
export async function status(options?: {
  useAiKitService?: boolean;
  responseType?: 'stream';
}): Promise<StatusResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    options?.useAiKitService
      ? aiKitApi
          .get('/api/v1/status', {
            responseType: options.responseType,
            headers: { ...getRemoteComponentCallHeaders({}) },
          })
          .then((res) => res.data)
      : call({ name: 'ai-kit', method: 'GET', path: '/api/v1/status', responseType: options?.responseType! }).then(
          (res) => res.data
        )
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function chatCompletions(
  input: ChatCompletionInput,
  options?: { useAiKitService?: boolean; responseType?: undefined }
): Promise<ReadableStream<ChatCompletionChunk>>;
export async function chatCompletions(
  input: ChatCompletionInput,
  options: { useAiKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function chatCompletions(
  input: ChatCompletionInput,
  options?: { useAiKitService?: boolean; responseType?: 'stream' }
): Promise<ReadableStream<ChatCompletionChunk> | AxiosResponse<IncomingMessage, any>> {
  const response = catchAndRethrowUpstreamError(
    options?.useAiKitService
      ? aiKitApi.post<IncomingMessage>('/api/v1/chat/completions', input, {
          responseType: 'stream',
          headers: { ...getRemoteComponentCallHeaders(input), Accept: 'text/event-stream' },
        })
      : call({
          name: 'ai-kit',
          path: 'api/v1/chat/completions',
          data: input,
          responseType: 'stream',
          headers: { Accept: 'text/event-stream' },
        })
  );

  if (options?.responseType === 'stream') return response;

  return new ReadableStream<ChatCompletionChunk>({
    async start(controller) {
      try {
        const stream = readableToWeb((await response).data)
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new EventSourceParserStream());

        for await (const chunk of stream) {
          if (isChatCompletionError(chunk)) {
            controller.error(new Error(chunk.error.message));
            break;
          }
          controller.enqueue(chunk);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });
}

export async function imageGenerations(
  input: ImageGenerationInput,
  options?: { useAiKitService?: boolean; responseType?: undefined }
): Promise<ImageGenerationResponse>;
export async function imageGenerations(
  input: ImageGenerationInput,
  options: { useAiKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function imageGenerations(
  input: ImageGenerationInput,
  options?: { useAiKitService?: boolean; responseType?: 'stream' }
): Promise<ImageGenerationResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    options?.useAiKitService
      ? aiKitApi.post('/api/v1/image/generations', input, {
          responseType: options.responseType,
          headers: { ...getRemoteComponentCallHeaders(input) },
        })
      : call({
          name: 'ai-kit',
          path: '/api/v1/image/generations',
          data: input,
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function embedding(
  input: EmbeddingInput,
  options?: { useAiKitService?: boolean; responseType?: undefined }
): Promise<EmbeddingResponse>;
export async function embedding(
  input: EmbeddingInput,
  options: { useAiKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function embedding(
  input: EmbeddingInput,
  options?: { useAiKitService?: boolean; responseType?: 'stream' }
): Promise<EmbeddingResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    options?.useAiKitService
      ? aiKitApi.post('/api/v1/embeddings', input, {
          responseType: options.responseType,
          headers: { ...getRemoteComponentCallHeaders(input) },
        })
      : call({
          name: 'ai-kit',
          path: '/api/v1/embeddings',
          data: input,
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

async function catchAndRethrowUpstreamError(response: Promise<AxiosResponse<any, any>>) {
  return response.catch(async (error) => {
    if (isAxiosError(error) && error.response?.data) {
      const data = await tryParseJsonFromResponseStream<{ error: { message: string } }>(error.response.data);
      const message = data?.error?.message;
      if (typeof message === 'string') throw new Error(message);
    }
    throw error;
  });
}
