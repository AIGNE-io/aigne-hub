import axios from './api';

export async function getAIStatus(): Promise<{ enabled: boolean }> {
  return axios.get('/api/ai/status').then((res) => res.data);
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

export async function ai({ prompt }: { prompt: string }): Promise<AIResponse> {
  return axios.post('/api/ai', { prompt }).then((res) => res.data);
}
