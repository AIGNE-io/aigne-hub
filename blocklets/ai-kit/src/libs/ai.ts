import axios from './api';

export async function getOpenAIStatus(): Promise<{ enabled: boolean }> {
  return axios.get('/api/ai/status').then((res) => res.data);
}

export async function openai({ prompt }: { prompt: string }): Promise<any> {
  return axios.post('/api/ai', { prompt }).then((res) => res.data);
}
