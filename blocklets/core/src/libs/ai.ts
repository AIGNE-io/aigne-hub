import { createImageGenerationApi, createStatusApi, createTextCompletionApi } from '@blocklet/aigne-hub/api';
import { createFetch } from '@blocklet/js-sdk';

import axios, { API_TIMEOUT } from './api';

export type { ImageGenerationSize } from '@blocklet/aigne-hub/api/ai-kit';

export const getAIStatus = createStatusApi({ axios, path: '/api/v1/status' });

export const textCompletions = createTextCompletionApi({
  fetch: createFetch() as typeof fetch,
  path: '/api/v1/completions',
  timeout: API_TIMEOUT,
  headers: {
    'x-aigne-hub-client-did': window.blocklet?.appPid,
  },
});

export const textCompletionsV2 = createTextCompletionApi({
  fetch: createFetch() as typeof fetch,
  path: '/api/v2/completions',
  timeout: API_TIMEOUT,
  headers: {
    'x-aigne-hub-client-did': window.blocklet?.appPid,
  },
});

export const imageGenerations = createImageGenerationApi({ axios, path: '/api/v1/image/generations' });

// Function for /image endpoint with correct payload structure
export const imageGenerationsV2Image = async (input: {
  prompt: string;
  size?: string;
  n?: number;
  response_format?: string;
  model: string;
}) => {
  const response = await axios.post(
    '/api/v2/image',
    {
      agent: input.model, // Use model as agent name
      input: {
        prompt: input.prompt,
        size: input.size,
        n: input.n || 1,
        responseFormat: input.response_format || 'b64_json',
        outputFileType: 'url',
        modelOptions: { model: input.model },
      },
      fixedProvider: true,
    },
    {
      headers: { 'x-aigne-hub-client-did': window.blocklet?.appPid },
      timeout: 5 * 60 * 1000, // 5 minutes timeout for image generation
    }
  );

  return response.data;
};

export const videoGenerationsV2 = async (input: { prompt: string; model: string }) => {
  const response = await axios.post(
    '/api/v2/video',
    {
      agent: input.model, // Use model as agent name
      input: {
        prompt: input.prompt,
        model: input.model,
        outputFileType: 'url',
        modelOptions: { model: input.model },
      },
    },
    {
      headers: { 'x-aigne-hub-client-did': window.blocklet?.appPid },
      timeout: 5 * 60 * 1000,
    }
  );

  return response.data;
};

// Embeddings API using /api/v2/embeddings endpoint
export const embeddingsV2Direct = async (
  input: string | Array<string>,
  model: string
): Promise<{ data: { embedding: number[] }[] }> => {
  const response = await axios.post(
    '/api/v2/embeddings',
    {
      model,
      input,
      fixedProvider: true,
    },
    {
      headers: { 'x-aigne-hub-client-did': window.blocklet?.appPid },
      timeout: 30 * 1000, // 30 second timeout
    }
  );

  return response.data;
};
