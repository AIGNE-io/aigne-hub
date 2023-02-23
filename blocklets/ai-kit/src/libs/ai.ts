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
          throw new Error(text);
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

export interface AIImageResponse {
  created: number;
  data: { url: string }[];
}

export type ImageGenerationSize = '256x256' | '512x512' | '1024x1024';

export async function imageGenerations(options: {
  prompt: string;
  size: ImageGenerationSize;
  n: number;
  response_format?: string;
}): Promise<AIImageResponse> {
  // client side default is b64_json, so that we can download image
  const { response_format = 'b64_json' } = options;
  return axios
    .post('/api/v1/image/generations', {
      ...options,
      response_format,
    })
    .then((res) => {
      if (response_format === 'b64_json') {
        try {
          res.data.data = res.data.data.map((item: any) => {
            return {
              url: `data:image/png;base64,${item.b64_json}`,
            };
          });
        } catch (error) {
          console.error('format b64_json error: ', error);
        }
      }
      return res.data;
    });
}
