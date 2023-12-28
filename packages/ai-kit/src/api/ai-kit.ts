import { TSubscriptionExpanded } from '@did-pay/client';
import axios, { AxiosInstance } from 'axios';
import { ChatCompletionMessageParam } from 'openai/resources';
import { joinURL } from 'ufo';

import { AIKitServiceConfig } from '../components/ai-kit-service/config';
import type { AppRegisterResult } from './call';

export const createStatusApi =
  ({ axios, path }: { axios: AxiosInstance; path: string }): (() => Promise<{ available: boolean }>) =>
  () =>
    axios.get(path).then((res) => res.data);

export interface TextCompletions {
  text?: string;
}

export interface TextCompletionOptions {
  model?: string;
  temperature?: number;
}

export interface TextCompletionFn<P extends {}> {
  (options: { stream: true } & TextCompletionOptions & P): Promise<ReadableStream<Uint8Array>>;
  (options: { stream?: boolean } & TextCompletionOptions & P): Promise<TextCompletions>;
  (options: { stream?: boolean } & TextCompletionOptions & P): Promise<TextCompletions | ReadableStream<Uint8Array>>;
}

export const createTextCompletionApi =
  <P extends {} = { prompt: string } | { messages: ChatCompletionMessageParam[] }>({
    axios,
    path,
    timeout,
  }: {
    axios: AxiosInstance;
    path: string;
    timeout?: number;
  }): TextCompletionFn<P> =>
  async (options) => {
    const promise: Promise<TextCompletions | ReadableStream<Uint8Array>> = options.stream
      ? fetch(axios.getUri({ url: path }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        }).then(async (res) => {
          if (res.status !== 200) {
            const text = await res.text();
            let json: any;
            try {
              json = JSON.parse(text);
            } catch {
              // eslint-disable-next-line no-empty
            }
            throw new Error(json?.error?.message || json?.message || text || res.status);
          }
          return res.body!;
        })
      : axios
          .post(path, options)
          .then(({ data }) => ({ text: data.text ?? data.choices?.[0]?.text ?? data.choices?.[0]?.message?.content }))
          .catch(processResponseError);

    if (!timeout) {
      return promise as any;
    }

    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeout);
      }),
    ]);
  };

export interface ImageGenerations<T extends { url: string } | { b64_json: string }> {
  data: T[];
}

export type ImageGenerationSize = '256x256' | '512x512' | '1024x1024';

export interface ImageGenerationFn<P extends {}> {
  (options: P & { response_format?: 'url' }): Promise<ImageGenerations<{ url: string }>>;
  (options: P & { response_format?: 'b64_json' }): Promise<ImageGenerations<{ b64_json: string }>>;
  (options: P & { response_format?: 'url' | 'b64_json' }): Promise<
    ImageGenerations<{ url: string } | { b64_json: string }>
  >;
}

export const createImageGenerationApi =
  <P extends {} = { prompt: string; size: ImageGenerationSize; n: number }>({
    axios,
    path,
  }: {
    axios: AxiosInstance;
    path: string;
  }): ImageGenerationFn<P> =>
  async (options) => {
    return axios
      .post(path, options)
      .then((res) => res.data)
      .catch(processResponseError);
  };

function processResponseError(error: any): never {
  const msg = error.response?.data?.error?.message || error.response?.data?.message;
  if (msg) {
    throw new Error(msg);
  }
  throw error;
}

export interface AIKitServiceApiOptions {
  prefix?: string;
}

function aiKitServiceApi(options?: AIKitServiceApiOptions) {
  return axios.create({ baseURL: joinURL('/', window.blocklet?.prefix || '/', options?.prefix ?? '/api/ai-kit') });
}

export interface AppStatusResult {
  id: string;
  subscription?: TSubscriptionExpanded;
  aiKitServiceConfig: AIKitServiceConfig;
}

export interface AppUsedCreditsResult {
  model: string;
  date: string;
  usedCredits: string;
  promptTokens: number;
  completionTokens: number;
  numberOfImageGeneration: number;
}

export async function appStatus(options?: AIKitServiceApiOptions): Promise<AppStatusResult> {
  return aiKitServiceApi(options)
    .get('/status')
    .then((res) => res.data);
}

export async function setAppConfig(
  payload: AIKitServiceConfig,
  options?: AIKitServiceApiOptions
): Promise<AppStatusResult> {
  return aiKitServiceApi(options)
    .patch('/config', payload)
    .then((res) => res.data);
}

export async function appRegister(options?: Partial<AIKitServiceApiOptions>): Promise<AppRegisterResult> {
  return aiKitServiceApi(options)
    .post('/register')
    .then((res) => res.data);
}

export async function appUsedCredits(
  query: { startTime?: string; endTime: string },
  options?: Partial<AIKitServiceApiOptions>
): Promise<{ list: AppUsedCreditsResult[] }> {
  return aiKitServiceApi(options)
    .get('/usage', { params: query })
    .then((res) => res.data);
}
