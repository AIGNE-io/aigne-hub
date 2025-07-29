import type { IncomingMessage } from 'http';
import { ReadableStream, TextDecoderStream } from 'stream/web';

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
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
import { UserInfoResult } from '../types/user';
import { EventSourceParserStream, readableToWeb } from '../utils/event-stream';
import { getRemoteBaseUrl } from '../utils/util';
import { catchAndRethrowUpstreamError } from './api';

interface RemoteApiOptions {
  responseType?: 'stream';
  timeout?: number;
}

interface RemoteApiConfig {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  additionalHeaders?: Record<string, string>;
  isStreamEndpoint?: boolean;
}

// 缓存配置
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

let cachedUrl: CacheItem<string> | null = null;

const CACHE_TTL = 30 * 60 * 1000; // 30分钟

function isCacheExpired(cacheItem: CacheItem<any> | null): boolean {
  if (!cacheItem) return true;
  return Date.now() - cacheItem.timestamp > CACHE_TTL;
}

function getConfig() {
  const baseUrl = process.env.BLOCKLET_AIGNE_API_URL;
  const credentials = JSON.parse(process.env.BLOCKLET_AIGNE_API_CREDENTIAL || '{}');
  const accessKey = credentials?.apiKey;

  if (!baseUrl || !accessKey) {
    throw new Error('Please connect to AIGNE Hub First, baseUrl or accessKey not found');
  }

  return { baseUrl, accessKey };
}

async function getCachedUrl(url: string) {
  if (url !== cachedUrl?.data) {
    cachedUrl = null;
  }

  if (isCacheExpired(cachedUrl)) {
    const { baseUrl } = getConfig();
    const url = await getRemoteBaseUrl(baseUrl);
    cachedUrl = {
      data: url,
      timestamp: Date.now(),
    };
  }
  return cachedUrl!.data;
}

export async function callRemoteApi<T = any>(
  input: any,
  config: RemoteApiConfig,
  options: RemoteApiOptions = {}
): Promise<AxiosResponse<T, any>> {
  const { accessKey, baseUrl } = getConfig();
  const url = await getCachedUrl(baseUrl);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessKey}`,
    ...config.additionalHeaders,
  };

  if (config.isStreamEndpoint) {
    headers.Accept = 'text/event-stream';
    headers['Content-Type'] = 'application/json';
  }

  const method = config.method || 'POST';
  const requestConfig: AxiosRequestConfig = {
    method,
    url: joinURL(url, config.endpoint),
    headers,
    timeout: options?.timeout,
    responseType: options?.responseType,
  };

  if (method === 'GET') {
    requestConfig.params = input;
  } else {
    requestConfig.data = input;
  }

  return catchAndRethrowUpstreamError(axios.request(requestConfig));
}

export async function chatCompletionsV2(
  input: ChatCompletionInput,
  options?: { responseType?: undefined; timeout?: number }
): Promise<ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>>>;
export async function chatCompletionsV2(
  input: ChatCompletionInput,
  options: { responseType: 'stream'; timeout?: number }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function chatCompletionsV2(
  input: ChatCompletionInput,
  options: { responseType?: 'stream'; timeout?: number } = {}
): Promise<ReadableStream<Exclude<ChatCompletionResponse, ChatCompletionError>> | AxiosResponse<IncomingMessage, any>> {
  const params = {
    endpoint: 'api/v2/chat/completions',
    isStreamEndpoint: true,
  };
  const response = await callRemoteApi<IncomingMessage>(input, params, { ...options, responseType: 'stream' });

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
  options?: { responseType?: undefined; timeout?: number }
): Promise<ImageGenerationResponse>;
export async function imageGenerationsV2(
  input: ImageGenerationInput,
  options: { responseType: 'stream'; timeout?: number }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function imageGenerationsV2(
  input: ImageGenerationInput,
  options: { responseType?: 'stream'; timeout?: number } = {}
): Promise<ImageGenerationResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await callRemoteApi(input, { endpoint: 'api/v2/image/generations' }, options);

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function embeddingsV2(
  input: EmbeddingInput,
  options?: { responseType?: undefined; timeout?: number }
): Promise<EmbeddingResponse>;
export async function embeddingsV2(
  input: EmbeddingInput,
  options: { responseType: 'stream'; timeout?: number }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function embeddingsV2(
  input: EmbeddingInput,
  options: { responseType?: 'stream'; timeout?: number } = {}
): Promise<EmbeddingResponse | AxiosResponse<IncomingMessage, any>> {
  const response = await callRemoteApi(input, { endpoint: 'api/v2/embeddings' }, options);

  if (options?.responseType === 'stream') {
    return response as AxiosResponse<IncomingMessage, any>;
  }

  return response.data;
}

export async function getUserCreditInfo(): Promise<UserInfoResult>;
export async function getUserCreditInfo(): Promise<UserInfoResult> {
  const response = await callRemoteApi({}, { endpoint: 'api/user/info', method: 'GET' });
  return response.data;
}
