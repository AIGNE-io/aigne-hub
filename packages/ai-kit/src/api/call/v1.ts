import type { IncomingMessage } from 'http';
import { ReadableStream, TextDecoderStream } from 'stream/web';

import { call, getComponentWebEndpoint } from '@blocklet/sdk/lib/component';
import { getSignData } from '@blocklet/sdk/lib/util/verify-sign';
import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import stringify from 'json-stable-stringify';
import { joinURL } from 'ufo';

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
import { AudioSpeechInput, AudioTranscriptionsInput } from '../types/audio';
import { StatusResponse } from '../types/status';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import { EventSourceParserStream, readableToWeb } from '../utils/event-stream';
import { aiKitApi, catchAndRethrowUpstreamError } from './api';

export async function status(options?: {
  useAIKitService?: boolean;
  responseType?: undefined;
}): Promise<StatusResponse>;
export async function status(options: {
  useAIKitService?: boolean;
  responseType: 'stream';
}): Promise<AxiosResponse<IncomingMessage, any>>;
export async function status({
  useAIKitService,
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
): Promise<ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>>>;
export async function chatCompletions(
  input: ChatCompletionInput,
  options: { useAIKitService?: boolean; responseType: 'stream' }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function chatCompletions(
  input: ChatCompletionInput,
  { useAIKitService, ...options }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>> | AxiosResponse<IncomingMessage, any>> {
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
  { useAIKitService, ...options }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
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
  { useAIKitService, ...options }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
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
  { useAIKitService, ...options }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
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
      : (() => {
          const { iat, exp, sig, version } = getSignData({
            data: {},
            params: {},
            method: 'post',
            url: '/api/v1/audio/transcriptions',
          });

          return axios.post(joinURL(getComponentWebEndpoint('ai-kit'), '/api/v1/audio/transcriptions'), form, {
            headers: {
              'x-component-sig': sig,
              'x-component-sig-iat': iat,
              'x-component-sig-exp': exp,
              'x-component-sig-version': version,
            },
            responseType: options?.responseType!,
          });
        })()
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function audioSpeech(
  input: AudioSpeechInput,
  { useAIKitService }: { useAIKitService?: boolean } = {}
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
