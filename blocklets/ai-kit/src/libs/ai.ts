/* eslint-disable @typescript-eslint/naming-convention */
import axios, { API_TIMEOUT } from './api';

export async function getAIStatus(): Promise<{ enabled: boolean }> {
  return axios.get('/api/v1/status').then((res) => res.data);
}

export interface AIResponse {
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

export async function completions(options: { prompt: string; stream: true }): Promise<ReadableStream>;
export async function completions(options: { prompt: string; stream?: boolean }): Promise<AIResponse>;
export async function completions(options: { prompt: string; stream?: boolean }): Promise<AIResponse | ReadableStream> {
  const promise = options.stream
    ? fetch(axios.getUri({ url: '/api/v1/completions' }), {
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
    : axios.post('/api/v1/completions', options).then((res) => res.data);

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), API_TIMEOUT);
    }),
  ]);
}

export interface AIImageResponse<T extends { url: string } | { b64_json: string }> {
  created: number;
  data: T[];
}

export type ImageGenerationSize = '256x256' | '512x512' | '1024x1024';

export async function imageGenerations(options: {
  prompt: string;
  size: ImageGenerationSize;
  n: number;
  response_format?: 'url';
}): Promise<AIImageResponse<{ url: string }>>;
export async function imageGenerations(options: {
  prompt: string;
  size: ImageGenerationSize;
  n: number;
  response_format?: 'b64_json';
}): Promise<AIImageResponse<{ b64_json: string }>>;
export async function imageGenerations(options: {
  prompt: string;
  size: ImageGenerationSize;
  n: number;
  response_format?: 'url' | 'b64_json';
}): Promise<AIImageResponse<{ url: string } | { b64_json: string }>> {
  return axios.post('/api/v1/image/generations', options).then((res) => res.data);
}
