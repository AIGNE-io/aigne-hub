import type { IncomingMessage } from 'http';
import { ReadableStream, TextDecoderStream } from 'stream/web';

import { call } from '@blocklet/sdk/lib/component';
import { AxiosResponse } from 'axios';
import stringify from 'json-stable-stringify';

import { SubscriptionError, SubscriptionErrorType } from '../error';
import {
  ChatCompletionError,
  ChatCompletionInput,
  ChatCompletionResponse,
  EmbeddingInput,
  EmbeddingResponse,
  ImageGenerationInput,
  ImageGenerationResponse,
  isChatCompletionError,
} from '../types';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import { EventSourceParserStream, readableToWeb } from '../utils/event-stream';
import { aiKitApi, catchAndRethrowUpstreamError } from './api';

export async function chatCompletionsV2(
  input: ChatCompletionInput,
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>>>;
export async function chatCompletionsV2(
  input: ChatCompletionInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function chatCompletionsV2(
  input: ChatCompletionInput,
  { useAIKitService, ...options }: { useAIKitService?: boolean; responseType?: 'stream'; userDid?: string } = {}
): Promise<ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>> | AxiosResponse<IncomingMessage, any>> {
  const response = catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi<IncomingMessage>('/api/v2/chat/completions', {
          responseType: 'stream',
          method: 'POST',
          data: stringify(input),
          headers: {
            ...getRemoteComponentCallHeaders(input, options.userDid),
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
        })
      : call({
          name: 'ai-kit',
          path: 'api/v2/chat/completions',
          data: input,
          responseType: 'stream',
          headers: { Accept: 'text/event-stream' },
        })
  );

  if (options?.responseType === 'stream') return response;

  return new ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>>({
    async start(controller) {
      try {
        const stream = readableToWeb((await response).data)
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new EventSourceParserStream<ChatCompletionResponse>());

        for await (const chunk of stream) {
          if (isChatCompletionError(chunk)) {
            if (chunk.error.type) {
              const error = new Error(chunk.error.message) as SubscriptionError;
              error.type = chunk.error.type as SubscriptionErrorType;
              error.timestamp = chunk.error.timestamp!;
              controller.error(error);
            } else {
              controller.error(new Error(chunk.error.message));
            }
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

export async function imageGenerationsV2(
  input: ImageGenerationInput,
  options?: { useAIKitService?: boolean; responseType?: undefined; timeout?: number }
): Promise<ImageGenerationResponse>;
export async function imageGenerationsV2(
  input: ImageGenerationInput,
  options: { useAIKitService?: boolean; responseType: 'stream'; timeout?: number }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function imageGenerationsV2(
  input: ImageGenerationInput,
  {
    useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream'; timeout?: number; userDid?: string } = {}
): Promise<ImageGenerationResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post('/api/v2/image/generations', input, {
          responseType: options.responseType,
          headers: { ...getRemoteComponentCallHeaders(input, options.userDid) },
        })
      : // @ts-ignore
        call({
          name: 'ai-kit',
          path: '/api/v2/image/generations',
          data: input,
          responseType: options?.responseType!,
          timeout: options?.timeout,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function embeddingsV2(
  input: EmbeddingInput,
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<EmbeddingResponse>;
export async function embeddingsV2(
  input: EmbeddingInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function embeddingsV2(
  input: EmbeddingInput,
  { useAIKitService, ...options }: { useAIKitService?: boolean; responseType?: 'stream'; userDid?: string } = {}
): Promise<EmbeddingResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post('/api/v2/embeddings', input, {
          responseType: options.responseType,
          headers: { ...getRemoteComponentCallHeaders(input, options.userDid) },
        })
      : call({
          name: 'ai-kit',
          path: '/api/v2/embeddings',
          data: input,
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}
