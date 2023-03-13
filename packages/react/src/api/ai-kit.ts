import { AxiosInstance } from 'axios';

export const createStatusApi =
  ({ axios, path }: { axios: AxiosInstance; path: string }): (() => Promise<{ available: boolean }>) =>
  () =>
    axios.get(path).then((res) => res.data);

export interface TextCompletions {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: { finish_reason: string; index: number; text: string }[];
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface TextCompletionFn<P extends {} = { prompt: string }> {
  (options: { stream: true } & P): Promise<ReadableStream>;
  (options: { stream?: boolean } & P): Promise<TextCompletions>;
  (options: { stream?: boolean } & P): Promise<TextCompletions | ReadableStream>;
}

export const createTextCompletionApi =
  <P extends {}>({
    axios,
    path,
    timeout,
  }: {
    axios: AxiosInstance;
    path: string;
    timeout?: number;
  }): TextCompletionFn<P> =>
  async (options) => {
    const promise = options.stream
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
          .then((res) => res.data)
          .catch(processResponseError);

    if (!timeout) {
      return promise;
    }

    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeout);
      }),
    ]);
  };

export interface ImageGenerations<T extends { url: string } | { b64_json: string }> {
  created: number;
  data: T[];
}

export type ImageGenerationSize = '256x256' | '512x512' | '1024x1024';

export interface ImageGenerationFn<P extends {} = { prompt: string; size: ImageGenerationSize; n: number }> {
  (options: P & { response_format?: 'url' }): Promise<ImageGenerations<{ url: string }>>;
  (options: P & { response_format?: 'b64_json' }): Promise<ImageGenerations<{ b64_json: string }>>;
  (options: P & { response_format?: 'url' | 'b64_json' }): Promise<
    ImageGenerations<{ url: string } | { b64_json: string }>
  >;
}

export const createImageGenerationApi =
  <P extends {}>({ axios, path }: { axios: AxiosInstance; path: string }): ImageGenerationFn<P> =>
  async (options) => {
    return axios
      .post(path, options)
      .then((res) => res.data)
      .catch(processResponseError);
  };

function processResponseError(error: any) {
  const msg = error.response?.data?.error?.message || error.response?.data?.message;
  if (msg) {
    throw new Error(msg);
  }
  throw error;
}
