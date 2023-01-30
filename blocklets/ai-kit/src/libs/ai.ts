import axios from './api';

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
  if (options.stream) {
    return fetch(axios.getUri({ url: '/api/v1/completions' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }).then((res) => res.body!);
  }
  return axios.post('/api/v1/completions', options).then((res) => res.data);
}
