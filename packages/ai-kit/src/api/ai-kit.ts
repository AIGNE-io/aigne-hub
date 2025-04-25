import { AxiosInstance } from 'axios';
import { ChatCompletionMessageParam } from 'openai/resources/index';

import { SubscriptionError } from './error';

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
    fetch,
    path,
    timeout,
  }: {
    fetch: typeof globalThis.fetch;
    path: string;
    timeout?: number;
  }): TextCompletionFn<P> =>
  async (options) => {
    const promise: Promise<TextCompletions | ReadableStream<Uint8Array>> = options.stream
      ? fetch(path, {
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
            if (json?.error?.type) {
              throw new SubscriptionError(json?.error?.type);
            }
            throw new Error(json?.error?.message || json?.message || text || res.status);
          }
          return res.body!;
        })
      : fetch(path, options)
          .then((res) => res.json())
          .then((data) => ({ text: data.text ?? data.choices?.[0]?.text ?? data.choices?.[0]?.message?.content }))
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

export type ImageGenerationSize =
  | '256x256'
  | '512x512'
  | '1024x1024'
  | '1024x1792'
  | '1792x1024'
  | '1536x1024'
  | '1024x1536'
  | 'auto';

export interface ImageGenerationFn<P extends {}> {
  (options: P & { response_format?: 'url' }): Promise<ImageGenerations<{ url: string }>>;
  (options: P & { response_format?: 'b64_json' }): Promise<ImageGenerations<{ b64_json: string }>>;
  (
    options: P & { response_format?: 'url' | 'b64_json' }
  ): Promise<ImageGenerations<{ url: string } | { b64_json: string }>>;
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
