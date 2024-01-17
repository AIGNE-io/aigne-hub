import type { IncomingMessage } from 'http';
import { ReadableStream, TextDecoderStream } from 'stream/web';

import { call, getComponentWebEndpoint } from '@blocklet/sdk/lib/component';
import { sign } from '@blocklet/sdk/lib/util/verify-sign';
import axios, { AxiosResponse, isAxiosError } from 'axios';
import FormData from 'form-data';
import stringify from 'json-stable-stringify';
import { joinURL } from 'ufo';

import AIKitConfig from '../config';
import { SubscriptionError, SubscriptionErrorType } from '../error';
import {
  ChatCompletionChunk,
  ChatCompletionInput,
  ChatCompletionResponse,
  EmbeddingInput,
  EmbeddingResponse,
  ImageGenerationInput,
  ImageGenerationResponse,
  isChatCompletionError,
} from '../types';
import { AudioSpeechInput, AudioTranscriptionsInput } from '../types/audio';
import { StatusResponse } from '../types/status';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import { EventSourceParserStream, readableToWeb, tryParseJsonFromResponseStream } from '../utils/event-stream';
import aiKitApi from './api';

export async function status(options?: {
  useAIKitService?: boolean;
  responseType?: undefined;
}): Promise<StatusResponse>;
export async function status(options: {
  useAIKitService?: boolean;
  responseType: 'stream';
}): Promise<AxiosResponse<IncomingMessage, any>>;
export async function status({
  useAIKitService = AIKitConfig.useAIKitService,
  ...options
}: {
  useAIKitService?: boolean;
  responseType?: 'stream';
} = {}): Promise<StatusResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
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
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<ReadableStream<ChatCompletionChunk>>;
export async function chatCompletions(
  input: ChatCompletionInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function chatCompletions(
  input: ChatCompletionInput,
  {
    useAIKitService = AIKitConfig.useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<ReadableStream<ChatCompletionChunk> | AxiosResponse<IncomingMessage, any>> {
  const response = catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi<IncomingMessage>('/api/v1/chat/completions', {
          responseType: 'stream',
          method: 'POST',
          data: stringify(input),
          headers: {
            ...getRemoteComponentCallHeaders(input),
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
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

export async function imageGenerations(
  input: ImageGenerationInput,
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<ImageGenerationResponse>;
export async function imageGenerations(
  input: ImageGenerationInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function imageGenerations(
  input: ImageGenerationInput,
  {
    useAIKitService = AIKitConfig.useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<ImageGenerationResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
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

export async function embeddings(
  input: EmbeddingInput,
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<EmbeddingResponse>;
export async function embeddings(
  input: EmbeddingInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function embeddings(
  input: EmbeddingInput,
  {
    useAIKitService = AIKitConfig.useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<EmbeddingResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
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

export async function audioTranscriptions(
  input: AudioTranscriptionsInput,
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<EmbeddingResponse>;
export async function audioTranscriptions(
  input: AudioTranscriptionsInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function audioTranscriptions(
  input: AudioTranscriptionsInput,
  {
    useAIKitService = AIKitConfig.useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<EmbeddingResponse | AxiosResponse<IncomingMessage, any>> {
  const form = new FormData();
  for (const [key, val] of Object.entries(input)) {
    form.append(key, val);
  }

  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post('/api/v1/audio/transcriptions', form, {
          responseType: options.responseType,
          headers: { ...getRemoteComponentCallHeaders({}) },
        })
      : axios.post(joinURL(getComponentWebEndpoint('ai-kit'), '/api/v1/audio/transcriptions'), form, {
          headers: { 'x-component-sig': sign({}) },
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function audioSpeech(
  input: AudioSpeechInput,
  { useAIKitService = AIKitConfig.useAIKitService }: { useAIKitService?: boolean } = {}
): Promise<AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post('/api/v1/audio/speech', input, {
          responseType: 'stream',
          headers: { ...getRemoteComponentCallHeaders(input) },
        })
      : call({
          name: 'ai-kit',
          path: '/api/v1/audio/speech',
          data: input,
          responseType: 'stream',
        })
  );

  return response;
}

async function catchAndRethrowUpstreamError(response: Promise<any>) {
  return response.catch(async (error) => {
    if (isAxiosError(error) && error.response?.data) {
      const { data } = error.response;
      const json =
        typeof data[Symbol.iterator] === 'function'
          ? await tryParseJsonFromResponseStream<{ error: { message: string } }>(data)
          : data;
      const message = json?.error?.message;
      if (typeof message === 'string') throw new Error(message);
    }
    throw error;
  });
}
